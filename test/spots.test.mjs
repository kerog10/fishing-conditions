import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotId, makeSpot, addSpot, removeSpot, loadSpots, saveSpots } from '../js/spots.js';
import { CONFIG } from '../js/config.js';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('spotId rounds to the cache precision so near-identical taps are one spot', () => {
  assert.equal(spotId(-29.8531, 31.0512), spotId(-29.8534, 31.0509));
  assert.notEqual(spotId(-29.85, 31.05), spotId(-29.95, 31.05));
});

test('makeSpot falls back to coordinates when there is no name', () => {
  assert.equal(makeSpot(-29.85, 31.05, '').name, '-29.850, 31.050');
  assert.equal(makeSpot(-29.85, 31.05, 'Umhlanga').name, 'Umhlanga');
});

test('addSpot rejects a duplicate rather than growing the list', () => {
  const first = addSpot([], makeSpot(-29.85, 31.05, 'A'));
  const second = addSpot(first.spots, makeSpot(-29.8503, 31.0501, 'A again'));
  assert.equal(second.error, 'duplicate');
  assert.equal(second.spots.length, 1);
});

test('addSpot refuses to exceed the configured maximum', () => {
  let spots = [];
  for (let i = 0; i < CONFIG.spots.max; i++) {
    spots = addSpot(spots, makeSpot(-29 - i, 31, `S${i}`)).spots;
  }
  const overflow = addSpot(spots, makeSpot(-50, 31, 'one too many'));
  assert.equal(overflow.error, 'full');
  assert.equal(overflow.spots.length, CONFIG.spots.max);
});

test('removeSpot drops only the named spot', () => {
  const a = makeSpot(-29.85, 31.05, 'A');
  const b = makeSpot(-30.85, 31.05, 'B');
  assert.deepEqual(removeSpot([a, b], a.id).map((s) => s.name), ['B']);
});

test('saveSpots and loadSpots round-trip through storage', () => {
  const storage = memoryStorage();
  const spots = [makeSpot(-29.85, 31.05, 'A')];
  saveSpots(spots, storage);
  assert.deepEqual(loadSpots(storage), spots);
});

test('loadSpots survives corrupt storage instead of throwing', () => {
  const storage = memoryStorage();
  storage.setItem(CONFIG.spots.storageKey, '{not json');
  assert.deepEqual(loadSpots(storage), []);
});
