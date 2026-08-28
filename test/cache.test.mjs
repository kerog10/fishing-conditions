import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, save, load, clearAll, clearCaches } from '../js/cache.js';
import { CONFIG } from '../js/config.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

const PAYLOAD = {
  hasMarine: true,
  hours: [{ time: new Date(Date.UTC(2026, 7, 19, 6)), pressure: 1015 }],
};

test('nearby coordinates share a cache key', () => {
  assert.equal(cacheKey(-29.8512, 31.0498), cacheKey(-29.8534, 31.0501));
});

test('distant coordinates do not share a cache key', () => {
  assert.notEqual(cacheKey(-29.85, 31.05), cacheKey(-30.85, 31.05));
});

test('a miss returns null', () => {
  assert.equal(load(-29.85, 31.05, fakeStorage(), 0), null);
});

test('a fresh entry round-trips with dates intact', () => {
  const s = fakeStorage();
  save(-29.85, 31.05, PAYLOAD, s, 1000);
  const hit = load(-29.85, 31.05, s, 1000);
  assert.equal(hit.fresh, true);
  assert.equal(hit.ageMs, 0);
  assert.ok(hit.payload.hours[0].time instanceof Date);
  assert.equal(hit.payload.hours[0].time.getTime(), PAYLOAD.hours[0].time.getTime());
});

test('a stale entry is still served, flagged as stale', () => {
  const s = fakeStorage();
  save(-29.85, 31.05, PAYLOAD, s, 0);
  const hit = load(-29.85, 31.05, s, CONFIG.cache.freshMs + 1);
  assert.equal(hit.fresh, false);
  assert.ok(hit.ageMs > CONFIG.cache.freshMs);
  assert.equal(hit.payload.hours.length, 1);
});

test('corrupt cache entries are discarded, not thrown', () => {
  const s = fakeStorage();
  s.setItem(cacheKey(-29.85, 31.05), '{not json');
  assert.equal(load(-29.85, 31.05, s, 0), null);
});

test('clearAll removes every key the app owns', () => {
  const storage = fakeStorage();
  save(-29.85, 31.05, PAYLOAD, storage, 0);
  save(-31.05, 30.22, PAYLOAD, storage, 0);
  storage.setItem(CONFIG.spots.storageKey, '[{"lat":-29.85,"lon":31.05}]');
  storage.setItem('fc:last-spot', '{"lat":-29.85,"lon":31.05}');

  clearAll(storage);

  assert.equal(storage.length, 0);
});

test('clearAll leaves other sites and apps alone', () => {
  // localStorage is shared per origin. Wiping keys we do not own would be
  // destroying someone else's data.
  const storage = fakeStorage();
  save(-29.85, 31.05, PAYLOAD, storage, 0);
  storage.setItem('theme', 'dark');
  storage.setItem('other-app:session', 'abc');

  clearAll(storage);

  assert.equal(storage.getItem('theme'), 'dark');
  assert.equal(storage.getItem('other-app:session'), 'abc');
  assert.equal(load(-29.85, 31.05, storage, 0), null);
});

test('clearAll copes with storage being unavailable', () => {
  assert.doesNotThrow(() => clearAll(null));
});

const fakeCaches = (names) => {
  const live = new Set(names);
  return {
    live,
    keys: async () => [...live],
    delete: async (name) => live.delete(name),
  };
};

test('clearCaches deletes the offline app shell', async () => {
  const c = fakeCaches(['fishing-conditions-v2', 'fishing-conditions-v1']);
  assert.equal(await clearCaches(c), 2);
  assert.equal(c.live.size, 0);
});

test('clearCaches leaves caches belonging to other apps alone', async () => {
  const c = fakeCaches(['fishing-conditions-v2', 'some-other-pwa']);
  await clearCaches(c);
  assert.deepEqual([...c.live], ['some-other-pwa']);
});

test('clearCaches copes with the Cache API being unavailable', async () => {
  assert.equal(await clearCaches(undefined), 0);
});

test('the cache key includes the model list', () => {
  // Without this, editing CONFIG.models keeps serving a payload built from the
  // old list -- single-model data with no agreement marks -- and nothing in
  // the UI could tell you it was stale.
  const key = cacheKey(-29.85, 31.05);
  for (const m of [...CONFIG.models.forecast, ...CONFIG.models.marine]) {
    assert.ok(key.includes(m), `${m} missing from ${key}`);
  }
  assert.ok(key.startsWith(CONFIG.cache.keyPrefix), 'clearAll matches on the prefix');
});
