import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTable } from '../js/table.js';
import { summariseDays } from '../js/daily.js';
import { bandCount } from '../js/severity.js';
import { CONFIG } from '../js/config.js';

const HOUR = 3600000;
const base = Date.UTC(2026, 7, 19, 0, 0, 0);

// Built through summariseDays rather than hand-rolled, so these tests break if
// daily.js changes shape instead of quietly testing a stale fixture.
const hour = (i, over = {}) => ({
  time: new Date(base + i * HOUR),
  final: 40 + (i % 8),
  bite: 60,
  comfort: 0.9,
  windSpeed: 12,
  windGusts: 18,
  windDirection: 90,
  seaLevel: 1,
  swellHeight: 1.2,
  swellPeriod: 11,
  temperature: 20,
  precipitation: 0.5,
  cloudCover: 50,
  pressure: 1013,
  seaSurfaceTemperature: 22,
  ...over,
});

const days = (n, over = () => ({})) =>
  summariseDays(Array.from({ length: 24 * n }, (_, i) => hour(i, over(i))), -29.85, 31.05);

const rowKeys = (model) => model.rows.map((r) => r.key);

test('buildTable returns days and a row list drawn from config', () => {
  const model = buildTable(days(1));
  assert.ok(Array.isArray(model.days));
  assert.ok(Array.isArray(model.rows));
  const configured = new Set(CONFIG.tableRows.map((r) => r.key));
  for (const row of model.rows) {
    assert.ok(configured.has(row.key), `${row.key} is not a configured row`);
    assert.equal(typeof row.label, 'string');
    assert.ok(['score', 'plain', 'tinted', 'arrow'].includes(row.kind));
  }
});

test('buildTable gives one column per slot and one day per day', () => {
  const model = buildTable(days(2));
  assert.equal(model.days.length, 2);
  assert.equal(model.days[0].columns.length, 24 / CONFIG.daily.slotHours);
  assert.equal(model.days[0].columns.length, 8);
});

test('cells carry the slot value and the slot index', () => {
  const source = days(1);
  const model = buildTable(source);
  const column = model.days[0].columns[0];
  assert.equal(column.slotIndex, 0);
  assert.equal(column.cells.wind.value, source[0].slots[0].wind);
  assert.equal(column.cells.air.value, source[0].slots[0].temperature);
  // The raw slot rides along so the detail panel can read the hourly readings.
  assert.equal(column.slot, source[0].slots[0]);
});

test('tinted rows carry a band index and plain rows do not', () => {
  const model = buildTable(days(1));
  const column = model.days[0].columns[0];
  assert.ok(Number.isInteger(column.cells.wind.band));
  assert.ok(column.cells.wind.band >= 0 && column.cells.wind.band < bandCount('wind'));
  assert.equal(column.cells.air.band, null, 'plain rows must not be tinted');
  assert.equal(column.cells.dir.band, null, 'the arrow row is not tinted');
});

test('tide is banded within each day, not against an absolute scale', () => {
  // Day 0 swings 0.2-1.8 m; day 1 sits in a narrow 0.9-1.1 m band around the
  // same absolute height. Tidal range varies by spot and by spring/neap, so an
  // absolute ramp would render the second day permanently one colour.
  const wide = (i) => 0.2 + 1.6 * (i / 23);
  const narrow = (i) => 0.9 + 0.2 * ((i - 24) / 23);
  const model = buildTable(days(2, (i) => ({ seaLevel: i < 24 ? wide(i) : narrow(i) })));

  const bands = (d) => model.days[d].columns.map((c) => c.cells.tide.band);
  assert.equal(bands(0)[0], 0, 'the day-low column sits in the lowest band');
  assert.equal(bands(0).at(-1), CONFIG.severity.tideSteps - 1, 'the day-high column sits in the highest');
  assert.equal(bands(1)[0], 0, 'the narrow day still spans its own full ramp');
  assert.equal(bands(1).at(-1), CONFIG.severity.tideSteps - 1);
});

test('a tide extreme is marked on the column that contains it', () => {
  // A single high at 14:00, which falls in the 12:00-15:00 column (index 4).
  const model = buildTable(days(1, (i) => ({ seaLevel: 1.5 - 0.1 * Math.abs(i - 14) })));
  const marks = model.days[0].columns.map((c) => c.tideExtreme);
  assert.equal(marks[4], 'H');
  assert.deepEqual(marks.filter(Boolean), ['H'], 'no other column may be marked');
});

test('score hatching propagates from any disputed input', () => {
  const agreeing = { readings: { a: 1, b: 1 }, agree: true };
  const disputed = { readings: { a: 1, b: 9 }, agree: false };

  const withAgreement = (agreement) => buildTable(days(1, () => ({ agreement })))
    .days[0].columns[0].cells;

  assert.equal(withAgreement({ wind: disputed, gusts: agreeing }).score.agree, false,
    'uncertainty in an input is uncertainty in the output');
  assert.equal(withAgreement({ wind: agreeing, gusts: agreeing }).score.agree, true);
  assert.equal(withAgreement(null).score.agree, null,
    'no model data is not agreement');
});

test('a cell carries its own row agreement', () => {
  const agreement = { wind: { readings: { a: 1, b: 9 }, agree: false } };
  const cells = buildTable(days(1, () => ({ agreement }))).days[0].columns[0].cells;
  assert.equal(cells.wind.agree, false);
  assert.equal(cells.air.agree, null, 'a row with no model data is not disputed');
});

test('rows with no reading anywhere are dropped', () => {
  const inland = days(1, () => ({
    seaLevel: null, swellHeight: null, swellPeriod: null, seaSurfaceTemperature: null,
  }));
  const keys = rowKeys(buildTable(inland));
  for (const gone of ['tide', 'swell', 'period', 'sea']) {
    assert.ok(!keys.includes(gone), `${gone} has no data inland and must be dropped`);
  }
  assert.ok(keys.includes('wind'), 'land rows stay');
  assert.ok(keys.includes('air'));
});

test('score, bite and comfort are never dropped', () => {
  // A table with no score row is a bug, not an inland spot.
  const blank = days(1, () => ({ final: null, bite: null, comfort: null }));
  const keys = rowKeys(buildTable(blank));
  for (const kept of ['score', 'bite', 'comfort']) {
    assert.ok(keys.includes(kept), `${kept} must survive an empty day`);
  }
});
