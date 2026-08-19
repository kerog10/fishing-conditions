// Solunar timing derived locally. No solunar API is free and keyless, so major
// periods are found by scanning moon altitude for its daily maximum (moon
// overhead) and minimum (moon underfoot).

import SunCalc from '../vendor/suncalc.mjs';

const SAMPLE_MINUTES = 10;
const SYNODIC_DAYS = 29.530588853;

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Scans one day of moon altitude and returns the instants of peak and trough.
export function solunarPeriods(date, lat, lon) {
  const start = startOfUTCDay(date);
  const stepMs = SAMPLE_MINUTES * 60 * 1000;
  const steps = (24 * 60) / SAMPLE_MINUTES;

  let peak = { alt: -Infinity, at: null };
  let trough = { alt: Infinity, at: null };

  for (let i = 0; i < steps; i++) {
    const at = new Date(start.getTime() + i * stepMs);
    const { altitude } = SunCalc.getMoonPosition(at, lat, lon);
    if (altitude > peak.alt) peak = { alt: altitude, at };
    if (altitude < trough.alt) trough = { alt: altitude, at };
  }

  const majors = [peak.at, trough.at].filter(Boolean).sort((a, b) => a - b);

  const times = SunCalc.getMoonTimes(start, lat, lon);
  const minors = [times.rise, times.set]
    .filter((t) => t instanceof Date && !Number.isNaN(t.getTime()))
    .sort((a, b) => a - b);

  return { majors, minors };
}

export function moonPhaseFraction(date) {
  return SunCalc.getMoonIllumination(date).phase;
}

// Distance in days to the nearest new (phase 0 or 1) or full (phase 0.5) moon.
export function daysFromNewOrFull(date) {
  const phase = moonPhaseFraction(date);
  const toNew = Math.min(phase, 1 - phase);
  const toFull = Math.abs(phase - 0.5);
  return Math.min(toNew, toFull) * SYNODIC_DAYS;
}

export function sunTimes(date, lat, lon) {
  const t = SunCalc.getTimes(startOfUTCDay(date), lat, lon);
  const ok = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null);
  return { sunrise: ok(t.sunrise), sunset: ok(t.sunset) };
}
