import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWindows } from '../js/windows.js';
import { CONFIG } from '../js/config.js';

function hoursFrom(finals) {
  return finals.map((final, i) => ({
    time: new Date(Date.UTC(2026, 7, 19, i)),
    final,
    bite: final,
    comfort: 1,
    reasons: [],
  }));
}

test('no hours above threshold yields no windows', () => {
  assert.deepEqual(findWindows(hoursFrom([10, 20, 30, 40])), []);
});

test('a contiguous run above threshold becomes one window', () => {
  const w = findWindows(hoursFrom([10, 70, 75, 80, 10]));
  assert.equal(w.length, 1);
  assert.equal(w[0].hours.length, 3);
});

test('windows are capped at maxHours', () => {
  for (const win of findWindows(hoursFrom(Array(12).fill(80)))) {
    assert.ok(win.hours.length <= CONFIG.windows.maxHours, `${win.hours.length} hours`);
  }
});

test('a sharp drop splits a window', () => {
  const w = findWindows(hoursFrom([90, 92, 60, 90, 91]));
  assert.ok(w.length >= 2, `expected a split, got ${w.length} window(s)`);
});

test('windows are ranked by mean final score', () => {
  const w = findWindows(hoursFrom([90, 90, 10, 60, 60]));
  assert.ok(w[0].meanFinal > w[1].meanFinal);
});

test('only the top N windows are returned', () => {
  const pattern = [];
  for (let i = 0; i < 20; i++) pattern.push(80, 10);
  assert.ok(findWindows(hoursFrom(pattern)).length <= CONFIG.windows.topN);
});

test('a window carries start, end and deduplicated reasons', () => {
  const hours = hoursFrom([10, 80, 85, 10]);
  hours[1].reasons = ['Rising pressure', 'Major solunar period'];
  hours[2].reasons = ['Rising pressure'];
  const [win] = findWindows(hours);
  assert.ok(win.start instanceof Date);
  assert.ok(win.end instanceof Date);
  assert.deepEqual(win.reasons.sort(), ['Major solunar period', 'Rising pressure']);
});
