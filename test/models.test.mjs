import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelSeries, agrees, agreementByTime } from '../js/models.js';
import { CONFIG } from '../js/config.js';

const TIMES = ['2026-08-27T00:00', '2026-08-27T01:00', '2026-08-27T02:00'];

// A real multi-model response shape: three models asked for, one dropped
// silently because it does not cover this region, and one present as a key
// with no data at all.
const forecastHourly = {
  time: TIMES,
  wind_speed_10m_gfs_seamless: [10, 18, 30],
  wind_speed_10m_icon_seamless: [11, 20, 12],
  wind_speed_10m_ecmwf_ifs025: [null, null, null],
  wind_gusts_10m_gfs_seamless: [20, 30, 44],
  wind_gusts_10m_icon_seamless: [21, 31, 45],
};

test('models are read off the response keys, not a requested list', () => {
  const series = modelSeries(forecastHourly, 'wind_speed_10m');
  assert.deepEqual(series.map((s) => s.model).sort(), ['gfs_seamless', 'icon_seamless']);
});

test('a model key with no data is not an available model', () => {
  // Open-Meteo returns keys with unit "undefined" and all-null values.
  // Presence of a key is not evidence of data.
  const series = modelSeries(forecastHourly, 'wind_speed_10m');
  assert.ok(!series.some((s) => s.model === 'ecmwf_ifs025'));
});

test('the marine best_match prefix is normalised', () => {
  const series = modelSeries({
    time: TIMES,
    swell_wave_height_marine_best_match: [1.1, 1.2, 1.3],
    swell_wave_height_gwam: [1.2, 1.3, 1.4],
  }, 'swell_wave_height');
  assert.deepEqual(series.map((s) => s.model).sort(), ['best_match', 'gwam']);
});

test('a parameter that is a prefix of another does not steal its models', () => {
  const series = modelSeries({
    time: TIMES,
    swell_wave_height_gwam: [1, 1, 1],
    secondary_swell_wave_height_gwam: [0.4, 0.4, 0.4],
  }, 'swell_wave_height');
  assert.equal(series.length, 1);
});

test('one model is not a consensus', () => {
  assert.equal(agrees([12], 8), null);
  assert.equal(agrees([], 8), null);
});

test('agreement is the spread against the tolerance, boundary inclusive', () => {
  assert.equal(agrees([10, 18], 8), true);
  assert.equal(agrees([10, 18.1], 8), false);
  assert.equal(agrees([10, 14, 30], 8), false, 'the outlier decides it');
});

test('agreementByTime indexes every hour by its own time string', () => {
  const index = agreementByTime([
    { json: { hourly: forecastHourly }, params: CONFIG.models.forecastParams },
  ]);

  assert.equal(index[TIMES[0]].wind.agree, true, 'spread of 1 km/h');
  assert.equal(index[TIMES[2]].wind.agree, false, 'spread of 18 km/h');
  assert.deepEqual(
    index[TIMES[2]].wind.readings.map((r) => r.value).sort((a, b) => a - b),
    [12, 30],
  );
  assert.equal(index[TIMES[2]].gusts.agree, true, 'gusts have their own tolerance');
});

test('a parameter that was never asked for is simply absent', () => {
  const index = agreementByTime([
    { json: { hourly: forecastHourly }, params: CONFIG.models.forecastParams },
  ]);
  assert.equal(index[TIMES[0]].pressure, undefined);
  assert.equal(index[TIMES[0]].swell, undefined);
});

test('forecast and marine sources merge into one index', () => {
  const index = agreementByTime([
    { json: { hourly: forecastHourly }, params: CONFIG.models.forecastParams },
    {
      json: {
        hourly: {
          time: TIMES,
          swell_wave_height_gwam: [1.0, 1.0, 1.0],
          swell_wave_height_ecmwf_wam025: [1.2, 2.0, 1.1],
        },
      },
      params: CONFIG.models.marineParams,
    },
  ]);

  assert.equal(index[TIMES[0]].swell.agree, true);
  assert.equal(index[TIMES[1]].swell.agree, false);
  assert.equal(index[TIMES[1]].wind.agree, true, 'the forecast source survives the merge');
});

test('a missing or malformed source is skipped, not fatal', () => {
  const index = agreementByTime([
    { json: null, params: CONFIG.models.forecastParams },
    { json: { hourly: { time: null } }, params: CONFIG.models.marineParams },
  ]);
  assert.deepEqual(index, {});
});

test('only one model available reports null, never agreement', () => {
  const index = agreementByTime([
    {
      json: { hourly: { time: TIMES, wind_speed_10m_gfs_seamless: [10, 11, 12] } },
      params: CONFIG.models.forecastParams,
    },
  ]);
  assert.equal(index[TIMES[0]].wind.agree, null, 'silence must not read as agreement');
  assert.equal(index[TIMES[0]].wind.readings.length, 1);
});
