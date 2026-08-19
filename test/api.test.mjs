import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { forecastUrl, marineUrl, geocodeUrl, normalise, fetchConditions } from '../js/api.js';

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
