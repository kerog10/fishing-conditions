import { CONFIG } from './config.js';

// Lose signal on the rocks and you get the last forecast with its age shown,
// rather than a blank screen.

export function cacheKey(lat, lon) {
  const p = CONFIG.cache.coordPrecision;
  return `${CONFIG.cache.keyPrefix}${lat.toFixed(p)},${lon.toFixed(p)}`;
}

export function save(lat, lon, payload, storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(cacheKey(lat, lon), JSON.stringify({ savedAt: now, payload }));
  } catch {
    // Quota exceeded or storage disabled. Caching is a convenience, not a
    // requirement, so a failure here must not break the app.
  }
}

export function load(lat, lon, storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return null;
  const key = cacheKey(lat, lon);
  const raw = storage.getItem(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return null;
  }
  if (!parsed?.payload?.hours) return null;

  const payload = {
    ...parsed.payload,
    hours: parsed.payload.hours.map((h) => ({ ...h, time: new Date(h.time) })),
  };
  const ageMs = Math.max(0, now - parsed.savedAt);

  return { payload, ageMs, fresh: ageMs <= CONFIG.cache.freshMs };
}
