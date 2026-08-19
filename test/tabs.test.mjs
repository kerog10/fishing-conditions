import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTab, createTabs } from '../js/tabs.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

const NAMES = ['spots', 'days'];

test('with nothing remembered the first tab wins', () => {
  assert.equal(initialTab(NAMES, null), 'spots');
});

test('a remembered tab is restored', () => {
  assert.equal(initialTab(NAMES, 'days'), 'days');
});

test('a stored value we no longer recognise falls back rather than blanking the page', () => {
  // A renamed or removed tab must not leave the app showing no panel at all.
  assert.equal(initialTab(NAMES, 'charts'), 'spots');
});

test('selecting a tab reports it and remembers it', () => {
  const storage = fakeStorage();
  const seen = [];
  const tabs = createTabs({ names: NAMES, storage, onChange: (n) => seen.push(n) });

  tabs.select('days');

  assert.equal(tabs.current(), 'days');
  assert.deepEqual(seen, ['days']);
  assert.equal(storage.getItem('fc:tab'), 'days');
});

test('re-selecting the current tab does not churn', () => {
  const seen = [];
  const tabs = createTabs({ names: NAMES, storage: fakeStorage(), onChange: (n) => seen.push(n) });

  tabs.select('spots');

  assert.deepEqual(seen, [], 'already on spots, nothing to repaint');
});

test('an unknown tab name is ignored', () => {
  const tabs = createTabs({ names: NAMES, storage: fakeStorage() });

  tabs.select('charts');

  assert.equal(tabs.current(), 'spots');
});

test('a spot with storage unavailable still switches tabs', () => {
  const tabs = createTabs({ names: NAMES, storage: null });

  tabs.select('days');

  assert.equal(tabs.current(), 'days');
});
