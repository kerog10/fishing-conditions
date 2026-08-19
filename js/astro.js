// Solunar timing derived locally. No solunar API is free and keyless, so major
// periods are found by scanning moon altitude for its daily maximum (moon
// overhead) and minimum (moon underfoot).

import SunCalc from '../vendor/suncalc.mjs';

const SAMPLE_MINUTES = 10;
const SYNODIC_DAYS = 29.530588853;

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Two clocks meet here. api.js stamps Open-Meteo's local wall-clock strings with
// a Z, so every forecast hour in the app is local time wearing a UTC label.
// SunCalc, correctly, works in true UTC. Comparing the two directly puts sunrise,
// moonrise and the solunar peaks the spot's whole UTC offset away from the hours
// they are supposed to line up with -- two hours out in Durban, twelve in
// Auckland. So: subtract the offset going in to get a real instant, add it back
// coming out to return to the app frame. Callers that omit the offset get the
// old true-UTC behaviour, which is correct for a spot on the meridian.
const toInstant = (date, offsetSeconds) => new Date(date.getTime() - offsetSeconds * 1000);

function toAppFrame(date, offsetSeconds) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + offsetSeconds * 1000);
}

// Scans one day of moon altitude and returns the instants of peak and trough.
export function solunarPeriods(date, lat, lon, offsetSeconds = 0) {
  // The day being scanned is the spot's local day, which in the app frame is
  // exactly the UTC day of `date`.
  const start = toInstant(startOfUTCDay(date), offsetSeconds);
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

  const majors = [peak.at, trough.at]
    .filter(Boolean)
    .map((t) => toAppFrame(t, offsetSeconds))
    .sort((a, b) => a - b);

  const times = SunCalc.getMoonTimes(start, lat, lon);
  const minors = [times.rise, times.set]
    .map((t) => (t instanceof Date ? toAppFrame(t, offsetSeconds) : null))
    .filter(Boolean)
    .sort((a, b) => a - b);

  return { majors, minors };
}

export function moonPhaseFraction(date) {
  return SunCalc.getMoonIllumination(date).phase;
}

// phase runs 0 (new) through 0.5 (full) to 1 (new again); fraction is the lit
// portion of the disc, which is what people mean by "62% moon".
export function moonIllumination(date) {
  const { phase, fraction } = SunCalc.getMoonIllumination(date);
  return { phase, fraction };
}

// Distance in days to the nearest new (phase 0 or 1) or full (phase 0.5) moon.
export function daysFromNewOrFull(date) {
  const phase = moonPhaseFraction(date);
  const toNew = Math.min(phase, 1 - phase);
  const toFull = Math.abs(phase - 0.5);
  return Math.min(toNew, toFull) * SYNODIC_DAYS;
}

export function sunTimes(date, lat, lon, offsetSeconds = 0) {
  const t = SunCalc.getTimes(toInstant(startOfUTCDay(date), offsetSeconds), lat, lon);
  return {
    sunrise: toAppFrame(t.sunrise, offsetSeconds),
    sunset: toAppFrame(t.sunset, offsetSeconds),
  };
}
