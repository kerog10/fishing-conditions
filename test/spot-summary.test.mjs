import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseSpot } from '../js/spot-summary.js';

const H = (hour, { seaLevel = 1, final = 50, windSpeed = 12, windDirection = 45 } = {}) => ({
  time: new Date(Date.UTC(2026, 7, 19, hour)),
  seaLevel,
  final,
  windSpeed,
  windDirection,
});

const NOW = new Date(Date.UTC(2026, 7, 19, 10));

test('a rising tide is reported as rising', () => {
  const hours = [H(9, { seaLevel: 1.0 }), H(10, { seaLevel: 1.4 }), H(11, { seaLevel: 1.7 })];

  const card = summariseSpot(hours, [], [], NOW);

  assert.equal(card.tide.state, 'rising');
  assert.equal(card.tide.height, 1.4);
});

test('a falling tide is reported as falling', () => {
  const hours = [H(9, { seaLevel: 1.7 }), H(10, { seaLevel: 1.3 }), H(11, { seaLevel: 0.9 })];

  assert.equal(summariseSpot(hours, [], [], NOW).tide.state, 'falling');
});

test('a tide barely moving is slack, not a coin flip between rising and falling', () => {
  const hours = [H(9, { seaLevel: 1.40 }), H(10, { seaLevel: 1.41 }), H(11, { seaLevel: 1.41 })];

  assert.equal(summariseSpot(hours, [], [], NOW).tide.state, 'slack');
});

test('an inland spot has no tide state at all', () => {
  const hours = [H(9, { seaLevel: null }), H(10, { seaLevel: null })];

  const card = summariseSpot(hours, [], [], NOW);

  assert.equal(card.tide.state, null);
  assert.equal(card.tide.height, null);
});

test('the next turn is the first one still ahead of us', () => {
  const tides = [
    { time: new Date(Date.UTC(2026, 7, 19, 4)), type: 'high', height: 1.8 },
    { time: new Date(Date.UTC(2026, 7, 19, 16)), type: 'high', height: 1.9 },
  ];

  const card = summariseSpot([H(10)], [], tides, NOW);

  assert.equal(card.tide.nextTurn.time.getUTCHours(), 16, 'the 04:00 high is behind us');
});

test('the next window skips windows that have already closed', () => {
  const windows = [
    { start: new Date(Date.UTC(2026, 7, 19, 5)), end: new Date(Date.UTC(2026, 7, 19, 8)), peakFinal: 88 },
    { start: new Date(Date.UTC(2026, 7, 19, 15)), end: new Date(Date.UTC(2026, 7, 19, 18)), peakFinal: 81 },
  ];

  const card = summariseSpot([H(10)], windows, [], NOW);

  assert.equal(card.nextWindow.score, 81);
  assert.equal(card.nextWindow.start.getUTCHours(), 15);
});

test('a spot with nothing worth fishing says so rather than showing a blank', () => {
  assert.equal(summariseSpot([H(10)], [], [], NOW).nextWindow, null);
});

test('the score and wind come from the hour we are actually in', () => {
  const hours = [
    H(9, { final: 30, windSpeed: 8, windDirection: 90 }),
    H(10, { final: 72, windSpeed: 19, windDirection: 45 }),
    H(11, { final: 40, windSpeed: 25, windDirection: 20 }),
  ];

  const card = summariseSpot(hours, [], [], NOW);

  assert.equal(card.score, 72);
  assert.equal(card.wind.speed, 19);
  assert.equal(card.wind.direction, 45);
});

test('an empty forecast produces an empty card rather than throwing', () => {
  const card = summariseSpot([], [], [], NOW);

  assert.equal(card.score, null);
  assert.equal(card.tide.state, null);
  assert.equal(card.nextWindow, null);
});
