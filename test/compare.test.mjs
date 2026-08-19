import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison } from '../js/compare.js';

const day = (key, score) => ({
  key,
  date: new Date(`${key}T00:00:00Z`),
  best: { score, time: new Date(`${key}T06:00:00Z`) },
});

const entry = (name, scores) => ({
  spot: { id: name, name, lat: -29, lon: 31 },
  days: Object.entries(scores).map(([k, v]) => day(k, v)),
});

test('buildComparison lays spots down and days across', () => {
  const c = buildComparison([
    entry('Umhlanga', { '2026-08-19': 41, '2026-08-20': 58 }),
    entry('Ballito', { '2026-08-19': 44, '2026-08-20': 49 }),
  ]);
  assert.deepEqual(c.dayKeys, ['2026-08-19', '2026-08-20']);
  assert.deepEqual(c.rows.map((r) => r.spot.name), ['Umhlanga', 'Ballito']);
  assert.deepEqual(c.rows[0].cells.map((x) => x.score), [41, 58]);
});

test('buildComparison names the best spot and day overall', () => {
  const c = buildComparison([
    entry('Umhlanga', { '2026-08-19': 41, '2026-08-20': 81 }),
    entry('Ballito', { '2026-08-19': 44, '2026-08-20': 79 }),
  ]);
  assert.equal(c.best.spotName, 'Umhlanga');
  assert.equal(c.best.dayKey, '2026-08-20');
  assert.equal(c.best.score, 81);
});

test('buildComparison pads a spot that is missing a day', () => {
  // A spot added late, or one whose refresh failed, must not shift the grid.
  const c = buildComparison([
    entry('Umhlanga', { '2026-08-19': 41, '2026-08-20': 58 }),
    entry('Ballito', { '2026-08-20': 49 }),
  ]);
  assert.deepEqual(c.dayKeys, ['2026-08-19', '2026-08-20']);
  assert.deepEqual(c.rows[1].cells.map((x) => x.score), [null, 49]);
});

test('buildComparison handles an empty spot list', () => {
  const c = buildComparison([]);
  assert.deepEqual(c.dayKeys, []);
  assert.deepEqual(c.rows, []);
  assert.equal(c.best, null);
});
