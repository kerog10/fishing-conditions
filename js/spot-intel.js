// Joins saved spots to hotspots by distance. Pure: a function of two lists.
//
// By distance rather than by name, because saved spots are created by tapping
// the map or searching, so their names are whatever the geocoder returned --
// "Amanzimtoti Beach", "-30.052, 30.889" -- and would rarely match a curated
// mark name.
import { CONFIG } from './config.js';

const EARTH_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

const hasCoords = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = (Math.sin(dLat / 2) ** 2)
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLon / 2) ** 2));
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export function attachIntel(spots, hotspots) {
  const out = new Map();
  if (!Array.isArray(spots) || !Array.isArray(hotspots)) return out;

  // A hotspot with no coordinate cannot be placed, so it cannot be joined.
  // It still ranks in the list -- it just has nothing to attach to.
  const placed = hotspots.filter(hasCoords);
  if (!placed.length) return out;

  for (const spot of spots) {
    if (!hasCoords(spot)) continue;

    let best = null;
    for (const hotspot of placed) {
      const km = distanceKm(spot, hotspot);
      if (km > CONFIG.hotspots.maxDistanceKm) continue;
      if (!best || km < best.distanceKm) {
        best = {
          name: hotspot.name,
          count: hotspot.count,
          species: hotspot.species,
          distanceKm: km,
        };
      }
    }
    if (best) out.set(spot.id, best);
  }

  return out;
}
