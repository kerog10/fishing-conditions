import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tideExtremes, toSlots, summariseDays } from '../js/daily.js';

const HOUR = 3600000;
const base = Date.UTC(2026, 7, 19, 0, 0, 0);

// A clean semidiurnal tide: 12.4 h period, 1.5 m amplitude around a 1.5 m mean.
const tideHours = (n = 26) => Array.from({ length: n }, (_, i) => ({
  time: new Date(base + i * HOUR),
  seaLevel: 1.5 + 1.5 * Math.sin((2 * Math.PI * i) / 12.4),
}));

test('tideExtremes finds alternating highs and lows', () => {
  const found = tideExtremes(tideHours());
  assert.ok(found.length >= 4, `expected at least 4 turning points, got ${found.length}`);
  for (let i = 1; i < found.length; i++) {
    assert.notEqual(found[i].type, found[i - 1].type, 'highs and lows must alternate');
  }
});

test('tideExtremes refines the peak off the sampled hour', () => {
  // The sine peaks at i = 3.1 h, which no hourly sample lands on. A naive
  // pick-the-largest-sample would report 03:00 exactly and understate the height.
  const high = tideExtremes(tideHours()).find((e) => e.type === 'high');
  const hoursFromBase = (high.time.getTime() - base) / HOUR;
  assert.ok(Math.abs(hoursFromBase - 3.1) < 0.2, `peak at ${hoursFromBase} h, expected ~3.1 h`);
  assert.ok(high.height > 2.99, `refined height ${high.height} should approach the 3.0 m crest`);
});

test('tideExtremes returns nothing when the spot has no tide data', () => {
  const hours = Array.from({ length: 12 }, (_, i) => ({
    time: new Date(base + i * HOUR),
    seaLevel: null,
  }));
  assert.deepEqual(tideExtremes(hours), []);
});

const weatherHour = (i, over = {}) => ({
  time: new Date(base + i * HOUR),
  final: 40 + i,
  windSpeed: 10,
  windGusts: 15,
  windDirection: 0,
  seaLevel: 1,
  swellHeight: 1.2,
  swellPeriod: 11,
  temperature: 20,
  precipitation: 0.5,
  cloudCover: 50,
  pressure: 1013,
  ...over,
});

test('toSlots groups hours into 3-hour columns', () => {
  const slots = toSlots(Array.from({ length: 24 }, (_, i) => weatherHour(i)));
  assert.equal(slots.length, 8);
  assert.equal(slots[0].start.getUTCHours(), 0);
  assert.equal(slots[1].start.getUTCHours(), 3);
});

test('toSlots reports the best hour for score and the worst for gusts', () => {
  const hours = [weatherHour(0), weatherHour(1), weatherHour(2)];
  hours[1].final = 90;
  hours[2].windGusts = 44;
  const [slot] = toSlots(hours);
  assert.equal(slot.score, 90, 'a good hour must not be averaged away');
  assert.equal(slot.gust, 44, 'the peak gust is the one that decides safety');
});

test('toSlots sums rain rather than averaging it', () => {
  const [slot] = toSlots([0, 1, 2].map((i) => weatherHour(i, { precipitation: 1 })));
  assert.equal(slot.rain, 3);
});

test('toSlots averages wind direction as a vector, not as a number', () => {
  // Naive averaging of 350 and 10 gives 180 -- a southerly reported for a
  // northerly, which would send you to the wrong side of the point.
  const hours = [
    weatherHour(0, { windDirection: 350 }),
    weatherHour(1, { windDirection: 10 }),
    weatherHour(2, { windDirection: 0 }),
  ];
  const [slot] = toSlots(hours);
  const offset = Math.min(slot.windDirection, 360 - slot.windDirection);
  assert.ok(offset < 5, `expected ~0 degrees, got ${slot.windDirection}`);
});

test('toSlots leaves marine fields null for an inland spot', () => {
  const hours = [0, 1, 2].map((i) => weatherHour(i, {
    seaLevel: null, swellHeight: null, swellPeriod: null,
  }));
  const [slot] = toSlots(hours);
  assert.equal(slot.tide, null);
  assert.equal(slot.swellHeight, null);
});

const twoDays = () => Array.from({ length: 48 }, (_, i) => ({
  time: new Date(base + i * HOUR),
  final: 30 + (i % 24),
  bite: 50,
  comfort: 0.8,
  reasons: [],
  windSpeed: 5 + (i % 12),
  windGusts: 10 + (i % 12),
  windDirection: 180,
  seaLevel: 1.5 + 1.5 * Math.sin((2 * Math.PI * i) / 12.4),
  swellHeight: 1 + (i % 3) * 0.2,
  swellPeriod: 10,
  temperature: 15 + (i % 10),
  precipitation: 0.1,
  cloudCover: 40,
  pressure: 1010 + (i % 5),
}));

test('summariseDays returns one entry per calendar day', () => {
  const days = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(days.length, 2);
  assert.equal(days[0].key, '2026-08-19');
  assert.equal(days[1].key, '2026-08-20');
});

test('summariseDays reports the best hour of each day', () => {
  const [day] = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(day.best.score, 53);
  assert.equal(day.best.time.getUTCHours(), 23);
});

test('summariseDays carries slots, tides, sun and moon for the day', () => {
  const [day] = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(day.slots.length, 8);
  assert.ok(day.tides.length >= 1);
  assert.ok(day.sun.sunrise instanceof Date);
  assert.ok(day.moon.illumination >= 0 && day.moon.illumination <= 1);
  assert.equal(typeof day.moon.name, 'string');
  assert.ok(Array.isArray(day.moon.majors));
});

test('summariseDays ranges cover the day, and rain is a daily total', () => {
  const [day] = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(day.wind.min, 5);
  assert.equal(day.wind.max, 16);
  assert.equal(day.temperature.min, 15);
  assert.ok(Math.abs(day.rain - 2.4) < 1e-9, `expected 24 x 0.1 mm, got ${day.rain}`);
});

test('summariseDays reports no swell for an inland spot', () => {
  const inland = twoDays().map((h) => ({
    ...h, seaLevel: null, swellHeight: null, swellPeriod: null,
  }));
  const [day] = summariseDays(inland, -29.1, 26.2);
  assert.equal(day.swell, null);
  assert.deepEqual(day.tides, []);
});
