import { CONFIG } from './config.js';

// Turns a reading into a colour band index. Free of the DOM and of any colour:
// this answers what band a 24 km/h wind is in, the table decides what band 4
// looks like.

// 0 is the calmest band. A value above the last bound lands in one final band
// beyond the array, so a ramp of six bounds paints seven bands. A boundary
// value stays in the band below it: 15 km/h is still the second band, because
// 15 is the top of "fine", not the bottom of "getting up".
export function band(ramp, value) {
  const bounds = CONFIG.severity[ramp];
  if (!Array.isArray(bounds) || !Number.isFinite(value)) return null;
  for (let i = 0; i < bounds.length; i++) {
    if (value <= bounds[i]) return i;
  }
  return bounds.length;
}

export function bandCount(ramp) {
  const bounds = CONFIG.severity[ramp];
  return Array.isArray(bounds) ? bounds.length + 1 : 0;
}

// Tide is normalised within the day's own range. Tidal range varies by spot
// and by spring or neap, so an absolute ramp would leave some spots one colour
// all week and tell you nothing about when the water moves.
export function tideBand(value, min, max, steps = CONFIG.severity.tideSteps) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  // A dead-flat day has no range to normalise against. A mid step reads as
  // "no movement", which is what happened.
  if (max === min) return Math.floor((steps - 1) / 2);
  const fraction = (value - min) / (max - min);
  return Math.max(0, Math.min(steps - 1, Math.floor(fraction * steps)));
}

// One threshold, one meaning: good starts where the best-windows finder starts
// counting a window. Only the poor boundary is the table's own.
export function scoreBandIndex(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= CONFIG.windows.threshold) return 0;
  if (score >= CONFIG.severity.scorePoor) return 1;
  return 2;
}
