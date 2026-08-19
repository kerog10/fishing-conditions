import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';

test('bite weights sum to 100', () => {
  const sum = Object.values(CONFIG.biteWeights).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('comfort floor keeps unfishable windows visible but capped', () => {
  assert.ok(CONFIG.comfort.floor > 0, 'floor must not be zero, or windows vanish');
  assert.ok(CONFIG.comfort.floor < 0.5);
});

test('every comfort band has ideal strictly below worst', () => {
  for (const key of ['wind', 'gusts', 'swell', 'rain']) {
    const band = CONFIG.comfort[key];
    assert.ok(band.ideal < band.worst, `${key}: ideal must be below worst`);
  }
});

test('window bounds are coherent', () => {
  assert.ok(CONFIG.windows.minHours <= CONFIG.windows.maxHours);
  assert.ok(CONFIG.windows.threshold > 0 && CONFIG.windows.threshold < 100);
});
