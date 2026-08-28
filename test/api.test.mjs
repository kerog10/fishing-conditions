import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { forecastUrl, marineUrl, modelForecastUrl, modelMarineUrl, geocodeUrl, normalise, fetchConditions } from '../js/api.js';
import { CONFIG } from '../js/config.js';

const forecast = JSON.parse(await readFile(new URL('./fixtures/forecast-durban.json', import.meta.url)));
const marine = JSON.parse(await readFile(new URL('./fixtures/marine-durban.json', import.meta.url)));

test('urls carry no api key and request 7 days', () => {
  for (const url of [forecastUrl(-29.85, 31.05), marineUrl(-29.85, 31.05)]) {
    assert.ok(!/apikey|api_key|token/i.test(url), url);
    assert.match(url, /forecast_days=7/);
    assert.match(url, /timezone=auto/);
  }
});

test('geocode url encodes the search term', () => {
  assert.match(geocodeUrl('Port Edward'), /name=Port(%20|\+)Edward/);
});

test('normalise merges forecast and marine into hourly records', () => {
  const { hours, hasMarine } = normalise(forecast, marine);
  assert.equal(hasMarine, true);
  assert.ok(hours.length >= 160);
  const h = hours[0];
  assert.ok(h.time instanceof Date);
  assert.equal(typeof h.pressure, 'number');
  assert.equal(typeof h.windSpeed, 'number');
  assert.equal(typeof h.seaLevel, 'number');
});

test('normalise degrades cleanly when marine data is missing', () => {
  const { hours, hasMarine } = normalise(forecast, null);
  assert.equal(hasMarine, false);
  assert.equal(hours[0].seaLevel, null);
  assert.equal(hours[0].swellHeight, null);
  assert.equal(typeof hours[0].pressure, 'number');
});

test('local wall-clock times are preserved, not shifted to UTC', () => {
  const { hours } = normalise(forecast, marine);
  const firstRaw = forecast.hourly.time[0]; // e.g. "2026-08-19T00:00"
  assert.equal(hours[0].time.toISOString().slice(0, 16), firstRaw.slice(0, 16));
});

test('fetchConditions survives a marine outage', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('marine')) return { ok: false, status: 500, statusText: 'boom' };
    return { ok: true, json: async () => forecast };
  };
  const result = await fetchConditions(-29.85, 31.05, fakeFetch);
  assert.equal(result.hasMarine, false);
  assert.ok(result.hours.length > 0);
});

test('fetchConditions throws when the forecast itself fails', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, statusText: 'down' });
  await assert.rejects(() => fetchConditions(-29.85, 31.05, fakeFetch), /503/);
});

test('an all-null marine response counts as no marine data', () => {
  // The marine API answers 200 for inland points, with every value null.
  const inlandMarine = {
    hourly: {
      time: marine.hourly.time,
      sea_level_height_msl: marine.hourly.time.map(() => null),
      wave_height: marine.hourly.time.map(() => null),
      swell_wave_height: marine.hourly.time.map(() => null),
      swell_wave_period: marine.hourly.time.map(() => null),
      swell_wave_direction: marine.hourly.time.map(() => null),
      sea_surface_temperature: marine.hourly.time.map(() => null),
    },
  };
  const { hours, hasMarine } = normalise(forecast, inlandMarine);
  assert.equal(hasMarine, false);
  assert.equal(hours[0].seaLevel, null);
});

test('normalise carries the spot UTC offset through', () => {
  // Everything downstream needs this to line astronomy up with the forecast
  // hours; without it dawn, dusk and the solunar peaks are scored at the wrong
  // time of day. Durban is UTC+2.
  const { utcOffsetSeconds } = normalise(forecast, marine);
  assert.equal(utcOffsetSeconds, 7200);
});

test('normalise defaults the offset to zero when the response omits it', () => {
  const { utc_offset_seconds: _drop, ...noOffset } = forecast;
  assert.equal(normalise(noOffset, marine).utcOffsetSeconds, 0);
});

test('the model urls request every configured model and no api key', () => {
  const f = modelForecastUrl(-29.85, 31.05);
  assert.ok(!/apikey|api_key|token/i.test(f));
  for (const m of CONFIG.models.forecast) assert.ok(f.includes(m), `${m} missing from ${f}`);
  for (const p of Object.values(CONFIG.models.forecastParams)) assert.ok(f.includes(p));
  // Only the parameters the score turns on, not all twenty.
  assert.ok(!f.includes('visibility'), 'the model request must stay small');

  const m = modelMarineUrl(-29.85, 31.05);
  for (const model of CONFIG.models.marine) assert.ok(m.includes(model));
  assert.ok(m.includes('swell_wave_height'));
  assert.ok(!m.includes('sea_level_height_msl'), 'tide models do not disagree with themselves');
});

test('normalise carries the new atmospheric and marine readings through', () => {
  const { hours } = normalise(forecast, marine);
  const h = hours[0];
  for (const key of ['humidity', 'dewPoint', 'apparentTemperature', 'uvIndex', 'cloudLow',
    'windWaveHeight', 'secondarySwellHeight', 'currentVelocity', 'waveDirection']) {
    assert.ok(key in h, `${key} missing from the hour record`);
  }
});

test('normalise attaches agreement to the hour with the matching time', () => {
  const t = forecast.hourly.time[1];
  const agreement = { [t]: { wind: { readings: [{ model: 'gfs', value: 10 }], agree: false } } };
  const { hours } = normalise(forecast, marine, agreement);
  assert.equal(hours[0].agreement, null, 'hours with no model data carry null, not {}');
  assert.equal(hours[1].agreement.wind.agree, false);
});

test('fetchConditions renders without any of the three optional requests', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('models=')) return { ok: false, status: 500, statusText: 'no models' };
    if (url.includes('marine')) return { ok: false, status: 500, statusText: 'no marine' };
    return { ok: true, json: async () => forecast };
  };
  const result = await fetchConditions(-29.85, 31.05, fakeFetch);
  assert.equal(result.hasMarine, false);
  assert.ok(result.hours.length > 0);
  assert.equal(result.hours[0].agreement, null, 'no model data means nothing is marked, not everything');
});

test('fetchConditions computes agreement when the model request succeeds', async () => {
  const times = forecast.hourly.time;
  const modelJson = {
    hourly: {
      time: times,
      wind_speed_10m_gfs_seamless: times.map(() => 10),
      wind_speed_10m_icon_seamless: times.map(() => 30),
    },
  };
  const fakeFetch = async (url) => {
    if (url.includes('models=') && url.includes('marine')) {
      return { ok: false, status: 500, statusText: 'no marine models' };
    }
    if (url.includes('models=')) return { ok: true, json: async () => modelJson };
    if (url.includes('marine')) return { ok: true, json: async () => marine };
    return { ok: true, json: async () => forecast };
  };
  const result = await fetchConditions(-29.85, 31.05, fakeFetch);
  assert.equal(result.hours[0].agreement.wind.agree, false, '20 km/h apart is a dispute');
  assert.equal(result.hours[0].agreement.swell, undefined);
});

test('the plain forecast request is still the only fatal one', async () => {
  const fakeFetch = async (url) => (url.includes('open-meteo.com/v1/forecast') && !url.includes('models=')
    ? { ok: false, status: 503, statusText: 'down' }
    : { ok: true, json: async () => ({ hourly: { time: [] } }) });
  await assert.rejects(() => fetchConditions(-29.85, 31.05, fakeFetch), /503/);
});
