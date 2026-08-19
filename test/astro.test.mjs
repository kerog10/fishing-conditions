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

// Open-Meteo hands back local wall-clock strings which api.js stamps as UTC, so
// every hour in the app lives in a "local time wearing a Z" frame. SunCalc works
// in true UTC. Without the offset the two frames are compared directly and every
// sun, moon and solunar time lands the spot's UTC offset away from the forecast
// hour it is meant to line up with -- 2 hours for Durban, 12 for New Zealand.
test('sunTimes shifts into the spot local frame when given its UTC offset', () => {
  // Open-Meteo's own daily.sunrise for Durban on this date is 06:25 local.
  const { sunrise, sunset } = sunTimes(DAY, DURBAN.lat, DURBAN.lon, 7200);
  assert.equal(sunrise.getUTCHours(), 6, `sunrise read ${sunrise.toISOString()}`);
  assert.ok(Math.abs(sunrise.getUTCMinutes() - 25) <= 5);
  assert.equal(sunset.getUTCHours(), 17, `sunset read ${sunset.toISOString()}`);
});

test('sunTimes with no offset is unchanged, so a zero-offset spot still works', () => {
  const plain = sunTimes(DAY, DURBAN.lat, DURBAN.lon);
  const zero = sunTimes(DAY, DURBAN.lat, DURBAN.lon, 0);
  assert.equal(plain.sunrise.getTime(), zero.sunrise.getTime());
});

test('solunar periods land on the local day, not the UTC one', () => {
  const { majors } = solunarPeriods(DAY, DURBAN.lat, DURBAN.lon, 7200);
  assert.equal(majors.length, 2);
  for (const m of majors) {
    assert.equal(m.getUTCDate(), DAY.getUTCDate(), `major escaped the local day: ${m.toISOString()}`);
  }
});
