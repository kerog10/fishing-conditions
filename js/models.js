import { CONFIG } from './config.js';

// Reads a multi-model Open-Meteo response and turns it into a per-hour view of
// how much the models disagree. No DOM, no colours: this answers "do they
// agree", the table decides what that looks like.

// Open-Meteo returns one field per model, suffixed with the model id:
// wind_speed_10m_gfs_seamless. Three things make reconstructing those names
// from the requested list wrong, so the keys are read back instead:
//   - model coverage is regional, and an unavailable model is dropped with no
//     error at all;
//   - the marine API suffixes best_match as _marine_best_match;
//   - a key can come back with unit "undefined" and no data, so presence of a
//     key is not evidence of data. One real reading is the bar, mirroring the
//     hasMarine check in api.js.
export function modelSeries(hourly, param) {
  const out = [];
  for (const key of Object.keys(hourly ?? {})) {
    if (!key.startsWith(`${param}_`)) continue;
    const values = hourly[key];
    if (!Array.isArray(values) || !values.some(Number.isFinite)) continue;
    out.push({ model: key.slice(param.length + 1).replace(/^marine_/, ''), values });
  }
  return out;
}

// Three states, deliberately distinct. null means one model answered, which is
// not agreement: silence must never be rendered as confidence.
export function agrees(values, tolerance) {
  if (values.length < 2) return null;
  return (Math.max(...values) - Math.min(...values)) <= tolerance;
}

// Keyed by the raw Open-Meteo time string so api.js can attach each hour's
// entry to the hour it belongs to by name rather than by position -- the
// multi-model request can resolve to a different grid cell, and nothing
// guarantees it returns the same row count.
//
// A plain object, not a Map, because the whole payload goes through
// JSON.stringify into localStorage and a Map serialises to {}.
export function agreementByTime(sources) {
  const index = {};

  for (const { json, params } of sources) {
    const hourly = json?.hourly;
    const times = hourly?.time;
    if (!Array.isArray(times)) continue;

    for (const [rowKey, param] of Object.entries(params)) {
      const series = modelSeries(hourly, param);
      if (!series.length) continue;
      const tolerance = CONFIG.models.tolerance[rowKey];

      times.forEach((time, i) => {
        const readings = series
          .map(({ model, values }) => ({ model, value: values[i] }))
          .filter((r) => Number.isFinite(r.value));
        if (!readings.length) return;
        index[time] ??= {};
        index[time][rowKey] = {
          readings,
          agree: agrees(readings.map((r) => r.value), tolerance),
        };
      });
    }
  }

  return index;
}
