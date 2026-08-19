import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBand, extremaMarkers } from '../js/bands.js';

test('bars span the full height between the low and high of the day', () => {
  const band = buildBand([0, 5, 10]);

  assert.equal(band.min, 0);
  assert.equal(band.max, 10);
  assert.equal(band.bars[0].pct, 6, 'the lowest value still gets a visible bar');
  assert.equal(band.bars[2].pct, 100, 'the highest value fills the band');
  assert.ok(band.bars[1].pct > 50 && band.bars[1].pct < 54, 'the middle sits mid-band');
});

test('a flat series draws a level band, not an empty one', () => {
  // A windless day is real data and should look like a calm line, not a
  // rendering failure.
  const band = buildBand([12, 12, 12]);

  assert.ok(band.hasData);
  assert.deepEqual(band.bars.map((b) => b.pct), [50, 50, 50]);
});

test('a series with no readings reports no data instead of dividing by zero', () => {
  const band = buildBand([null, null, null]);

  assert.equal(band.hasData, false);
  assert.deepEqual(band.bars.map((b) => b.pct), [0, 0, 0]);
  assert.equal(band.min, null);
  assert.equal(band.max, null);
});

test('gaps inside a series stay gaps', () => {
  const band = buildBand([0, null, 10]);

  assert.equal(band.bars[1].pct, 0);
  assert.equal(band.bars[1].value, null);
  assert.equal(band.bars[2].pct, 100);
});

test('tide turns are placed on the bar for their own hour', () => {
  const tides = [
    { time: new Date('2026-08-19T04:00:00Z'), type: 'high', height: 1.8 },
    { time: new Date('2026-08-19T10:00:00Z'), type: 'low', height: 0.3 },
    { time: new Date('2026-08-20T05:00:00Z'), type: 'high', height: 1.7 },
  ];

  const marks = extremaMarkers(tides, '2026-08-19');

  assert.deepEqual(marks.map((m) => m.index), [4, 10], 'the next day is not our problem');
  assert.equal(marks[0].type, 'high');
});
