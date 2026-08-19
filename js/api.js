import { CONFIG } from './config.js';

const FORECAST_HOURLY = [
  'temperature_2m', 'precipitation', 'cloud_cover', 'pressure_msl',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
].join(',');

const MARINE_HOURLY = [
  'sea_level_height_msl', 'wave_height', 'wave_period',
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
  'sea_surface_temperature',
].join(',');

export function forecastUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + `&hourly=${FORECAST_HOURLY}`
    + '&daily=sunrise,sunset'
    + `&timezone=auto&forecast_days=${CONFIG.forecastDays}`;
}

export function marineUrl(lat, lon) {
  return 'https://marine-api.open-meteo.com/v1/marine'
    + `?latitude=${lat}&longitude=${lon}`
    + `&hourly=${MARINE_HOURLY}`
    + `&timezone=auto&forecast_days=${CONFIG.forecastDays}`;
}

export function geocodeUrl(name) {
  return 'https://geocoding-api.open-meteo.com/v1/search'
    + `?name=${encodeURIComponent(name)}&count=5&format=json`;
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

export function normalise(forecastJson, marineJson) {
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
      seaLevel: hasRow ? at(m.sea_level_height_msl, mi) : null,
      waveHeight: hasRow ? at(m.wave_height, mi) : null,
      swellHeight: hasRow ? at(m.swell_wave_height, mi) : null,
      swellPeriod: hasRow ? at(m.swell_wave_period, mi) : null,
      swellDirection: hasRow ? at(m.swell_wave_direction, mi) : null,
      seaSurfaceTemperature: hasRow ? at(m.sea_surface_temperature, mi) : null,
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
  const forecast = await getJson(forecastUrl(lat, lon), fetchImpl);

  // A marine outage, or an inland point outside the ocean grid, must not take
  // the whole app down. Degrade to a no-tide, no-swell forecast.
  let marine = null;
  try {
    marine = await getJson(marineUrl(lat, lon), fetchImpl);
  } catch {
    marine = null;
  }

  return normalise(forecast, marine);
}

export async function geocode(name, fetchImpl = globalThis.fetch) {
  const data = await getJson(geocodeUrl(name), fetchImpl);
  return (data.results ?? []).map((r) => ({
    name: r.name,
    admin: r.admin1 ?? '',
    country: r.country ?? '',
    lat: r.latitude,
    lon: r.longitude,
  }));
}
