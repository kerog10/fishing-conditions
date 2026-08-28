import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';

test('bite weights sum to 100', () => {
  const sum = Object.values(CONFIG.biteWeights).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('comfort floor keeps unfishable windows visible but capped', () => {
  assert.ok(CONFIG.comfort.floor > 0, 'floor must not be zero, or windows vanish');
  assert.ok(CONFIG.comfort.floor < 0.5);
});

test('every comfort band has ideal strictly below worst', () => {
  for (const key of ['wind', 'gusts', 'swell', 'rain']) {
    const band = CONFIG.comfort[key];
    assert.ok(band.ideal < band.worst, `${key}: ideal must be below worst`);
  }
});

test('window bounds are coherent', () => {
  assert.ok(CONFIG.windows.minHours <= CONFIG.windows.maxHours);
  assert.ok(CONFIG.windows.threshold > 0 && CONFIG.windows.threshold < 100);
});

test('severity ramps bracket the comfort thresholds they colour', () => {
  const { severity, comfort } = CONFIG;
  // A cell must turn red at the same wind speed the comfort multiplier
  // collapses at, or the colour and the score disagree in front of the user.
  assert.ok(severity.wind.includes(comfort.wind.ideal), 'wind ramp needs a stop at comfort ideal');
  assert.ok(severity.wind.at(-1) < comfort.wind.worst, 'wind ramp must top out below comfort worst');
  assert.ok(severity.gusts.includes(comfort.gusts.ideal), 'gust ramp needs a stop at comfort ideal');
  assert.equal(severity.gusts.at(-1), comfort.gusts.worst);
  assert.equal(severity.swell.at(-1), comfort.swell.worst);
  assert.equal(severity.rain.at(-1), comfort.rain.worst);
});

test('every severity ramp ascends', () => {
  for (const key of ['wind', 'gusts', 'swell', 'rain']) {
    const ramp = CONFIG.severity[key];
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(ramp[i] > ramp[i - 1], `${key} ramp must ascend at index ${i}`);
    }
  }
});

test('the poor score boundary sits below the good one, which is the window threshold', () => {
  assert.ok(CONFIG.severity.scorePoor < CONFIG.windows.threshold);
});

test('a table row names a severity ramp only when it is tinted', () => {
  for (const row of CONFIG.tableRows) {
    assert.ok(row.key && row.label && row.slot, `row ${row.key} is incomplete`);
    assert.ok(['score', 'plain', 'tinted', 'arrow'].includes(row.kind), `row ${row.key} has kind ${row.kind}`);
    if (row.kind === 'tinted') {
      assert.ok(row.ramp === 'tide' || Array.isArray(CONFIG.severity[row.ramp]),
        `row ${row.key} names ramp ${row.ramp}, which does not exist`);
    } else {
      assert.equal(row.ramp, undefined, `row ${row.key} is not tinted but names a ramp`);
    }
  }
});

test('table row keys are unique', () => {
  const keys = CONFIG.tableRows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every agreement tolerance and score input names a requested parameter', () => {
  const params = { ...CONFIG.models.forecastParams, ...CONFIG.models.marineParams };
  for (const key of Object.keys(CONFIG.models.tolerance)) {
    assert.ok(params[key], `tolerance for ${key} has no requested parameter`);
  }
  for (const key of CONFIG.models.scoreInputs) {
    assert.ok(CONFIG.models.tolerance[key], `score input ${key} has no tolerance`);
  }
});
