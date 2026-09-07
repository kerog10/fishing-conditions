import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMapOpen, readMapOpen, rememberMapOpen } from '../js/map-disclosure.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

const hostileStorage = () => ({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
});

test('with no saved spots the map opens whatever was remembered', () => {
  // A remembered "closed" plus no spots is a dead end: an empty hero and no
  // visible way to pick a spot. The heuristic wins here on purpose.
  assert.equal(initialMapOpen('closed', 0), true);
  assert.equal(initialMapOpen('open', 0), true);
  assert.equal(initialMapOpen(null, 0), true);
});

test('with saved spots the remembered choice wins', () => {
  assert.equal(initialMapOpen('open', 3), true);
  assert.equal(initialMapOpen('closed', 3), false);
});

test('with saved spots and nothing remembered the map starts closed', () => {
  assert.equal(initialMapOpen(null, 3), false);
});

test('an unrecognised stored value falls back rather than throwing', () => {
  assert.equal(initialMapOpen('maybe', 3), false);
  assert.equal(initialMapOpen('maybe', 0), true);
});

test('the preference round-trips through storage', () => {
  const storage = fakeStorage();
  rememberMapOpen(true, storage);
  assert.equal(readMapOpen(storage), 'open');
  rememberMapOpen(false, storage);
  assert.equal(readMapOpen(storage), 'closed');
});

test('blocked storage costs the preference, never the map', () => {
  assert.doesNotThrow(() => rememberMapOpen(true, hostileStorage()));
  assert.equal(readMapOpen(hostileStorage()), null);
  assert.equal(readMapOpen(null), null);
});
