import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compass, scoreBand, timeRange, relativeAge, dayLabel, moonPhaseName } from '../js/format.js';

test('compass covers the cardinals', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(180), 'S');
  assert.equal(compass(270), 'W');
  assert.equal(compass(360), 'N');
});

test('compass rounds to 16 points', () => {
  assert.equal(compass(23), 'NNE');
  assert.equal(compass(247), 'WSW');
});

test('score bands partition 0 to 100', () => {
  assert.equal(scoreBand(95), 'excellent');
  assert.equal(scoreBand(70), 'good');
  assert.equal(scoreBand(50), 'fair');
  assert.equal(scoreBand(5), 'poor');
});

test('time range reads as a window', () => {
  const start = new Date(Date.UTC(2026, 7, 19, 5));
  const end = new Date(Date.UTC(2026, 7, 19, 8));
  assert.equal(timeRange(start, end), '05:00–08:00');
});

test('relative age is human readable', () => {
  assert.equal(relativeAge(30 * 1000), 'just now');
  assert.equal(relativeAge(3 * 3600 * 1000), '3h ago');
  assert.equal(relativeAge(25 * 3600 * 1000), '1d ago');
});

test('day labels name today and tomorrow', () => {
  const today = new Date(Date.UTC(2026, 7, 19, 9));
  assert.equal(dayLabel(new Date(Date.UTC(2026, 7, 19, 18)), today), 'Today');
  assert.equal(dayLabel(new Date(Date.UTC(2026, 7, 20, 6)), today), 'Tomorrow');
  assert.match(dayLabel(new Date(Date.UTC(2026, 7, 21, 6)), today), /21 Aug/);
});

test('moonPhaseName names the eight phases from the SunCalc phase fraction', () => {
  assert.equal(moonPhaseName(0), 'New moon');
  assert.equal(moonPhaseName(0.25), 'First quarter');
  assert.equal(moonPhaseName(0.5), 'Full moon');
  assert.equal(moonPhaseName(0.75), 'Last quarter');
  assert.equal(moonPhaseName(0.99), 'New moon');
  assert.equal(moonPhaseName(0.13), 'Waxing crescent');
  assert.equal(moonPhaseName(0.63), 'Waning gibbous');
});
