import { CONFIG } from './config.js';

// A spot's identity is its rounded position, matching the forecast cache key
// precision. Two taps a few metres apart are the same rock, and treating them
// as two spots would burn a comparison slot and a forecast fetch on a duplicate.
export function spotId(lat, lon) {
  const p = CONFIG.cache.coordPrecision;
  return `${lat.toFixed(p)},${lon.toFixed(p)}`;
}

export function makeSpot(lat, lon, name = '') {
  return {
    id: spotId(lat, lon),
    lat,
    lon,
    name: name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
  };
}

export function addSpot(list, spot) {
  if (list.some((s) => s.id === spot.id)) return { spots: list, error: 'duplicate' };
  if (list.length >= CONFIG.spots.max) return { spots: list, error: 'full' };
  return { spots: [...list, spot], error: null };
}

export function removeSpot(list, id) {
  return list.filter((s) => s.id !== id);
}

export function loadSpots(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(CONFIG.spots.storageKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon))
      .slice(0, CONFIG.spots.max)
      .map((s) => makeSpot(s.lat, s.lon, s.name));
  } catch {
    // A corrupt list must not brick the app on launch.
    return [];
  }
}

export function saveSpots(list, storage = globalThis.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(CONFIG.spots.storageKey, JSON.stringify(list));
  } catch {
    // Storage full or disabled. The list simply does not persist.
  }
}
