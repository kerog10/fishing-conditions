import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHours, pressureScore, tideScore } from '../js/score.js';

// 24 hours of flat, calm, featureless conditions starting at midnight.
function flatDay(overrides = {}) {
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 7, 19, i)),
    pressure: 1015,
    windSpeed: 8,
    windGusts: 12,
    windDirection: 90,
    precipitation: 0,
    swellHeight: 0.6,
    swellPeriod: 9,
    seaLevel: 0,
    ...overrides,
  }));
}

test('rising pressure outscores falling pressure', () => {
  const rising = flatDay().map((h, i) => ({ ...h, pressure: 1010 + i * 0.5 }));
  const falling = flatDay().map((h, i) => ({ ...h, pressure: 1020 - i * 0.5 }));
  assert.ok(pressureScore(rising, 12) > pressureScore(falling, 12));
});

test('flat pressure scores mid-range', () => {
  const s = pressureScore(flatDay(), 12);
  assert.ok(s > 0.4 && s < 0.7, `got ${s}`);
});

test('moving tide outscores slack water', () => {
  const hours = flatDay().map((h, i) => ({ ...h, seaLevel: Math.sin((i / 24) * 2 * Math.PI) }));
  const maxDelta = 0.3;
  const slackIndex = 6;  // sine peak: rate of change near zero
  const flowIndex = 12;  // sine zero crossing: fastest change
  assert.ok(tideScore(hours, flowIndex, maxDelta) > tideScore(hours, slackIndex, maxDelta));
});

test('scoreHours returns bounded scores and reasons for every hour', () => {
  const scored = scoreHours(flatDay(), -29.85, 31.05);
  assert.equal(scored.length, 24);
  for (const h of scored) {
    assert.ok(h.bite >= 0 && h.bite <= 100, `bite ${h.bite}`);
    assert.ok(h.comfort >= 0 && h.comfort <= 1, `comfort ${h.comfort}`);
    assert.ok(h.final >= 0 && h.final <= 100, `final ${h.final}`);
    assert.ok(Array.isArray(h.reasons));
  }
});

test('final never exceeds bite', () => {
  for (const h of scoreHours(flatDay(), -29.85, 31.05)) {
    assert.ok(h.final <= h.bite + 1);
  }
});

test('a gale caps the final score even when the bite is strong', () => {
  const gale = scoreHours(flatDay({ windSpeed: 70, windGusts: 95 }), -29.85, 31.05);
  const best = Math.max(...gale.map((h) => h.final));
  assert.ok(best < 30, `best final in a gale was ${best}`);
});

test('an inland spot with no tide data still scores', () => {
  const inland = flatDay({ seaLevel: null, swellHeight: null, swellPeriod: null });
  const scored = scoreHours(inland, -29.0, 26.0);
  assert.ok(scored.every((h) => Number.isFinite(h.final)));
});
