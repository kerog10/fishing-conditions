import { test } from 'node:test';
import assert from 'node:assert/strict';
import { band, bandCount, tideBand, scoreBandIndex } from '../js/severity.js';
import { CONFIG } from '../js/config.js';

test('a value on a band boundary stays in the lower band', () => {
  // 15 km/h is comfort.wind.ideal. It must read as still-fine, not as the
  // start of the next band up.
  assert.equal(band('wind', 15), 1);
  assert.equal(band('wind', 15.1), 2);
});

test('the calmest reading is band zero', () => {
  assert.equal(band('wind', 0), 0);
  assert.equal(band('wind', 10), 0);
});

test('anything above the ramp falls into one final band', () => {
  const last = CONFIG.severity.wind.length;
  assert.equal(band('wind', 40), last - 1);
  assert.equal(band('wind', 41), last);
  assert.equal(band('wind', 400), last, 'a hurricane is not a new colour');
});

test('a missing reading has no band, so a gap is never coloured as calm', () => {
  assert.equal(band('wind', null), null);
  assert.equal(band('wind', undefined), null);
  assert.equal(band('wind', NaN), null);
});

test('an unknown ramp reports no band rather than throwing', () => {
  assert.equal(band('nonsense', 12), null);
});

test('bandCount is one more than the number of bounds', () => {
  assert.equal(bandCount('wind'), CONFIG.severity.wind.length + 1);
  assert.equal(bandCount('nonsense'), 0);
});

test('tide is normalised within the range it is given', () => {
  assert.equal(tideBand(0.0, 0, 2, 4), 0);
  assert.equal(tideBand(0.6, 0, 2, 4), 1);
  assert.equal(tideBand(1.2, 0, 2, 4), 2);
  assert.equal(tideBand(2.0, 0, 2, 4), 3, 'the top of the range is the top step, not off the end');
});

test('a flat tide draws a mid step rather than dividing by zero', () => {
  assert.equal(tideBand(1.4, 1.4, 1.4, 4), 1);
});

test('tide with no range reports no band', () => {
  assert.equal(tideBand(1.2, Infinity, -Infinity, 4), null, 'an empty day has no min or max');
  assert.equal(tideBand(null, 0, 2, 4), null);
});

test('the good score boundary is the window threshold, not a second number', () => {
  assert.equal(scoreBandIndex(CONFIG.windows.threshold), 0);
  assert.equal(scoreBandIndex(CONFIG.windows.threshold - 1), 1);
  assert.equal(scoreBandIndex(CONFIG.severity.scorePoor), 1);
  assert.equal(scoreBandIndex(CONFIG.severity.scorePoor - 1), 2);
  assert.equal(scoreBandIndex(null), null);
});
