import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solunarPeriods, moonPhaseFraction, daysFromNewOrFull, sunTimes } from '../js/astro.js';

const DURBAN = { lat: -29.85, lon: 31.05 };
const DAY = new Date('2026-08-19T00:00:00Z');

test('finds exactly two major periods, roughly 12 hours apart', () => {
  const { majors } = solunarPeriods(DAY, DURBAN.lat, DURBAN.lon);
  assert.equal(majors.length, 2);
  const gapHours = Math.abs(majors[1] - majors[0]) / 3600000;
  assert.ok(gapHours > 10 && gapHours < 14, `gap was ${gapHours}h`);
});

test('major periods fall on the same calendar day as the query', () => {
  const { majors } = solunarPeriods(DAY, DURBAN.lat, DURBAN.lon);
  for (const m of majors) assert.equal(m.getUTCDate(), DAY.getUTCDate());
});

test('moon phase fraction stays within range', () => {
  const p = moonPhaseFraction(DAY);
  assert.ok(p >= 0 && p <= 1);
});

test('a new or full moon occurs within any 30-day span', () => {
  let best = Infinity;
  for (let i = 0; i < 30; i++) {
    best = Math.min(best, daysFromNewOrFull(new Date(Date.UTC(2026, 7, 1 + i))));
  }
  assert.ok(best < 0.6, `closest approach was ${best} days`);
});

test('days from new or full never exceeds a quarter cycle', () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(daysFromNewOrFull(new Date(Date.UTC(2026, 7, 1 + i))) <= 7.5);
  }
});

test('sunrise precedes sunset in Durban', () => {
  const { sunrise, sunset } = sunTimes(DAY, DURBAN.lat, DURBAN.lon);
  assert.ok(sunrise instanceof Date);
  assert.ok(sunset instanceof Date);
  assert.ok(sunrise < sunset);
});
