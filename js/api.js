import { CONFIG } from './config.js';
import { agreementByTime } from './models.js';

const FORECAST_HOURLY = [
  'temperature_2m', 'precipitation', 'cloud_cover', 'pressure_msl',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  // Added for the forecast table's slot detail. All verified against live
  // responses; none of them need a key or a different endpoint.
  'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature',
  'visibility', 'cape', 'freezing_level_height',
  'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'uv_index',
].join(',');

const MARINE_HOURLY = [
  'sea_level_height_msl', 'wave_height', 'wave_period',
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
  'sea_surface_temperature',
  // Wind wave and swell wave are different seas arriving at the same beach,
  // and the table's swell row only shows one of them.
  'wind_wave_height', 'wind_wave_period', 'wind_wave_direction',
  'secondary_swell_wave_height', 'wave_direction',
  'ocean_current_velocity', 'ocean_current_direction',
].join(',');

const base = (lat, lon) => `?latitude=${lat}&longitude=${lon}`
  + `&timezone=auto&forecast_days=${CONFIG.forecastDays}`;

export function forecastUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + base(lat, lon)
    + `&hourly=${FORECAST_HOURLY}`
    + '&daily=sunrise,sunset';
}

export function marineUrl(lat, lon) {
  return 'https://marine-api.open-meteo.com/v1/marine'
    + base(lat, lon)
    + `&hourly=${MARINE_HOURLY}`;
}

// The agreement requests. Deliberately narrow: only the parameters that decide
// whether you go fishing, because tripling all twenty across three models
// would be payload for nothing.
export function modelForecastUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + base(lat, lon)
    + `&hourly=${Object.values(CONFIG.models.forecastParams).join(',')}`
    + `&models=${CONFIG.models.forecast.join(',')}`;
}

export function modelMarineUrl(lat, lon) {
  return 'https://marine-api.open-meteo.com/v1/marine'
    + base(lat, lon)
    + `&hourly=${Object.values(CONFIG.models.marineParams).join(',')}`
    + `&models=${CONFIG.models.marine.join(',')}`;
}

// Photon searches OpenStreetMap, which knows suburbs and beaches that
// Open-Meteo's GeoNames-based geocoder does not: Beachwood, Glenashley and
// uShaka Beach all came back empty there. The tag list keeps the kinds of
// place you would fish from and drops the streets, buildings and shops that
// otherwise crowd them out. Photon ORs repeated osm_tag parameters.
const PLACE_TAGS = [
  'place', 'natural', 'waterway:river', 'man_made:pier', 'man_made:breakwater',
  'leisure:nature_reserve', 'leisure:park', 'leisure:beach_resort',
  'leisure:marina', 'leisure:slipway',
];
const SEARCH_LIMIT = 5;

export function geocodeUrl(name, near = null) {
  const bias = near && Number.isFinite(near.lat) && Number.isFinite(near.lon)
    ? `&lat=${near.lat.toFixed(4)}&lon=${near.lon.toFixed(4)}`
    : '';
  // Asks for extra because duplicates are dropped after the fact: OSM often
  // maps one reserve or river as several ways under the same name.
  return 'https://photon.komoot.io/api/'
    + `?q=${encodeURIComponent(name)}&limit=${SEARCH_LIMIT * 2}&lang=en`
    + bias
    + PLACE_TAGS.map((t) => `&osm_tag=${t}`).join('');
}

// Open-Meteo returns local wall-clock strings like "2026-08-19T14:00" when
// timezone=auto. Treating them as UTC keeps the displayed clock time intact
// instead of shifting it by the browser's offset. Every formatter therefore
// reads with UTC getters.
function toDate(localString) {
  return new Date(`${localString}:00Z`);
}

const at = (arr, i) => {
  const v = arr?.[i];
  return v === undefined || v === null ? null : v;
};

export function normalise(forecastJson, marineJson, agreement = {}) {
  const f = forecastJson.hourly;
  const m = marineJson?.hourly ?? null;
  // The marine API answers 200 for inland points with every value null, so
  // presence of the arrays is not enough: require at least one real reading.
  const hasMarine = Boolean(
    m && Array.isArray(m.time) && m.time.length > 0
    && (m.sea_level_height_msl ?? []).some((v) => Number.isFinite(v)),
  );

  // Index marine rows by time rather than position, so a length mismatch
  // cannot silently misalign tide data against the wrong hour.
  const marineIndex = new Map();
  if (hasMarine) m.time.forEach((t, i) => marineIndex.set(t, i));

  const hours = f.time.map((t, i) => {
    const mi = hasMarine ? marineIndex.get(t) : undefined;
    const hasRow = mi !== undefined;
    return {
      time: toDate(t),
      temperature: at(f.temperature_2m, i),
      precipitation: at(f.precipitation, i),
      cloudCover: at(f.cloud_cover, i),
      pressure: at(f.pressure_msl, i),
      windSpeed: at(f.wind_speed_10m, i),
      windDirection: at(f.wind_direction_10m, i),
      windGusts: at(f.wind_gusts_10m, i),
      humidity: at(f.relative_humidity_2m, i),
      dewPoint: at(f.dew_point_2m, i),
      apparentTemperature: at(f.apparent_temperature, i),
      visibility: at(f.visibility, i),
      cape: at(f.cape, i),
      freezingLevel: at(f.freezing_level_height, i),
      cloudLow: at(f.cloud_cover_low, i),
      cloudMid: at(f.cloud_cover_mid, i),
      cloudHigh: at(f.cloud_cover_high, i),
      uvIndex: at(f.uv_index, i),
      seaLevel: hasRow ? at(m.sea_level_height_msl, mi) : null,
      waveHeight: hasRow ? at(m.wave_height, mi) : null,
      wavePeriod: hasRow ? at(m.wave_period, mi) : null,
      waveDirection: hasRow ? at(m.wave_direction, mi) : null,
      swellHeight: hasRow ? at(m.swell_wave_height, mi) : null,
      swellPeriod: hasRow ? at(m.swell_wave_period, mi) : null,
      swellDirection: hasRow ? at(m.swell_wave_direction, mi) : null,
      secondarySwellHeight: hasRow ? at(m.secondary_swell_wave_height, mi) : null,
      windWaveHeight: hasRow ? at(m.wind_wave_height, mi) : null,
      windWavePeriod: hasRow ? at(m.wind_wave_period, mi) : null,
      windWaveDirection: hasRow ? at(m.wind_wave_direction, mi) : null,
      currentVelocity: hasRow ? at(m.ocean_current_velocity, mi) : null,
      currentDirection: hasRow ? at(m.ocean_current_direction, mi) : null,
      seaSurfaceTemperature: hasRow ? at(m.sea_surface_temperature, mi) : null,
      // Attached by time string, not by position: the multi-model request can
      // resolve to a different grid cell, and nothing guarantees it returns
      // the same row count. null rather than {}, so "no model data" is one
      // check for every consumer.
      agreement: agreement[t] ?? null,
    };
  });

  return {
    hours,
    timezone: forecastJson.timezone ?? 'auto',
    // Hours above are local wall-clock strings stamped as UTC. Astronomy is
    // computed in true UTC, so it needs this to be shifted into the same frame.
    utcOffsetSeconds: Number.isFinite(forecastJson.utc_offset_seconds)
      ? forecastJson.utc_offset_seconds
      : 0,
    hasMarine,
  };
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchConditions(lat, lon, fetchImpl = globalThis.fetch) {
  // All four in parallel. Only the first is required: a marine outage or an
  // inland point degrades to no tide and no swell, and a failed model request
  // degrades to no agreement marks, which is the honest rendering of "we do
  // not know" rather than a claim that the models agree.
  const [forecast, marine, modelForecast, modelMarine] = await Promise.allSettled([
    getJson(forecastUrl(lat, lon), fetchImpl),
    getJson(marineUrl(lat, lon), fetchImpl),
    getJson(modelForecastUrl(lat, lon), fetchImpl),
    getJson(modelMarineUrl(lat, lon), fetchImpl),
  ]);

  if (forecast.status !== 'fulfilled') throw forecast.reason;
  const value = (r) => (r.status === 'fulfilled' ? r.value : null);

  const agreement = agreementByTime([
    { json: value(modelForecast), params: CONFIG.models.forecastParams },
    { json: value(modelMarine), params: CONFIG.models.marineParams },
  ]);

  return normalise(forecast.value, value(marine), agreement);
}

// The same list as the URL filter, checked again here so a result Photon lets
// through anyway never reaches the list.
function wanted(p) {
  return PLACE_TAGS.some((t) => {
    const [key, value] = t.split(':');
    return p.osm_key === key && (value === undefined || p.osm_value === value);
  });
}

// The part of the label between the name and the country: suburb, town and
// province, so two Beachwoods can be told apart. Ward numbers and
// municipality names are administrative noise nobody searches by.
function adminLabel(p) {
  const noise = /\bward\b|municipality/i;
  const parts = [];
  for (const part of [p.district, p.city, p.state]) {
    if (!part || noise.test(part) || part === p.name || parts.includes(part)) continue;
    parts.push(part);
  }
  return parts.join(', ');
}

export function parsePlaces(data) {
  const seen = new Set();
  const out = [];
  for (const f of data?.features ?? []) {
    const p = f.properties ?? {};
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lon) || !wanted(p)) continue;
    const place = { name: p.name, admin: adminLabel(p), country: p.country ?? '', lat, lon };
    const key = [place.name, place.admin, place.country].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
    if (out.length === SEARCH_LIMIT) break;
  }
  return out;
}

// near is the map's current centre. Photon ranks results close to it first,
// which is what turns "Beachwood" into the Durban North suburb rather than
// one of the American towns.
export async function geocode(name, near = null, fetchImpl = globalThis.fetch) {
  return parsePlaces(await getJson(geocodeUrl(name, near), fetchImpl));
}
