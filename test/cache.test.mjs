import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, save, load } from '../js/cache.js';
import { CONFIG } from '../js/config.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
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
