import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSuggester } from '../js/suggest.js';

// A hand-cranked clock. Debounce tested against real timers is a slow,
// flaky test; here the pending callback is run exactly when the test says so.
function fakeTimers() {
  let pending = null;
  let id = 0;
  return {
    setTimer: (fn) => { pending = fn; return ++id; },
    clearTimer: () => { pending = null; },
    tick: () => { const fn = pending; pending = null; fn?.(); },
    get armed() { return pending !== null; },
  };
}

const harness = (search, opts = {}) => {
  const timers = fakeTimers();
  const seen = [];
  const errors = [];
  const suggester = createSuggester({
    search,
    minChars: 3,
    onResults: (results, term) => seen.push({ results, term }),
    onError: (err) => errors.push(err),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...opts,
  });
  return { suggester, timers, seen, errors };
};

const PLACE = (name) => ({ name, admin: '', country: 'ZA', lat: -29.85, lon: 31.05 });

test('typing waits for the pause before searching', async () => {
  let calls = 0;
  const { suggester, timers } = harness(async () => { calls += 1; return [PLACE('Durban')]; });

  suggester.query('Dur');
  assert.equal(calls, 0, 'must not search on the keystroke itself');
  timers.tick();
  await Promise.resolve();
  assert.equal(calls, 1);
});

test('a fast typist causes exactly one search', async () => {
  const terms = [];
  const { suggester, timers } = harness(async (t) => { terms.push(t); return []; });

  suggester.query('Dur');
  suggester.query('Durb');
  suggester.query('Durban');
  timers.tick();
  await Promise.resolve();

  assert.deepEqual(terms, ['Durban'], 'only the final term should reach the network');
});

test('short terms clear the list without searching', async () => {
  let calls = 0;
  const { suggester, timers, seen } = harness(async () => { calls += 1; return []; });

  suggester.query('Du');

  assert.equal(calls, 0);
  assert.equal(timers.armed, false, 'no search should be left pending');
  assert.deepEqual(seen.at(-1).results, []);
});

test('a slow earlier response cannot overwrite a newer one', async () => {
  // The real failure this guards: type "Cape", the network stalls, type
  // "Durban", Durban answers first, then Cape lands and replaces it.
  const gates = new Map();
  const { suggester, timers, seen } = harness(
    (term) => new Promise((resolve) => gates.set(term, resolve)),
  );

  suggester.query('Cape');
  timers.tick();
  suggester.query('Durban');
  timers.tick();

  gates.get('Durban')([PLACE('Durban')]);
  await Promise.resolve();
  gates.get('Cape')([PLACE('Cape Town')]);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(seen.at(-1).results[0].name, 'Durban');
});

test('a repeated term is answered from memory, not the network', async () => {
  let calls = 0;
  const { suggester, timers, seen } = harness(async () => { calls += 1; return [PLACE('Durban')]; });

  suggester.query('Durban');
  timers.tick();
  await Promise.resolve();

  suggester.query('Durban');

  assert.equal(calls, 1, 'the second look-up should not hit the network');
  assert.equal(timers.armed, false, 'and should not even be debounced');
  assert.equal(seen.at(-1).results[0].name, 'Durban');
});

test('a failed look-up is reported and does not wipe the list', async () => {
  const { suggester, timers, seen, errors } = harness(async () => {
    throw new Error('offline');
  });

  suggester.query('Durban');
  timers.tick();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errors.length, 1);
  assert.equal(seen.length, 0, 'a failure should leave whatever was on screen alone');
});

test('cancel drops a search that is already pending', async () => {
  let calls = 0;
  const { suggester, timers } = harness(async () => { calls += 1; return []; });

  suggester.query('Durban');
  suggester.cancel();
  timers.tick();
  await Promise.resolve();

  assert.equal(calls, 0);
});
