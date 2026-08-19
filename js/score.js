import { CONFIG } from './config.js';
import { solunarPeriods, daysFromNewOrFull, sunTimes } from './astro.js';

// 1 at or below `ideal`, 0 at or above `worst`, linear in between.
export function linearScore(value, ideal, worst) {
  if (value === null || value === undefined || Number.isNaN(value)) return 1;
  if (value <= ideal) return 1;
  if (value >= worst) return 0;
  return (worst - value) / (worst - ideal);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Can I actually fish this hour? Returns the worst of the individual bands,
// floored so that a strong bite window in bad weather stays visible in the
// list rather than disappearing without explanation.
export function comfortScore(hour) {
  const c = CONFIG.comfort;
  const bands = [
    { value: hour.windSpeed, band: c.wind, label: 'wind', unit: 'km/h' },
    { value: hour.windGusts, band: c.gusts, label: 'gusts', unit: 'km/h' },
    { value: hour.swellHeight, band: c.swell, label: 'swell', unit: 'm' },
    { value: hour.precipitation, band: c.rain, label: 'rain', unit: 'mm/h' },
  ];

  const reasons = [];
  let worst = 1;

  for (const b of bands) {
    if (b.value === null || b.value === undefined || Number.isNaN(b.value)) continue;
    const s = linearScore(b.value, b.band.ideal, b.band.worst);
    if (s < worst) worst = s;
    if (s < 0.5) reasons.push(`Uncomfortable ${b.label} (${round1(b.value)} ${b.unit})`);
  }

  // worst === 1 maps to 1; worst === 0 maps exactly to the floor.
  return { value: c.floor + (1 - c.floor) * worst, reasons };
}

const HOUR_MS = 3600000;

// Trend over the preceding window. Rising pressure is the strongest single
// predictor of active feeding; a sharp fall suppresses it.
export function pressureScore(hours, i) {
  const j = Math.max(0, i - CONFIG.pressure.windowHours);
  const now = hours[i].pressure;
  const then = hours[j].pressure;
  if (!Number.isFinite(now) || !Number.isFinite(then)) return 0.5;

  const delta = now - then;
  const { bestHpa, worstHpa } = CONFIG.pressure;
  if (delta >= bestHpa) return 1;
  if (delta <= worstHpa) return 0;
  return (delta - worstHpa) / (bestHpa - worstHpa);
}

// Rate of change of sea level, not stage. Slack water scores zero; peak flow
// scores one. Normalised against the spot's own maximum, so it works for both
// a 2 m range harbour and a 0.4 m range lagoon.
export function tideScore(hours, i, maxDelta) {
  if (!maxDelta || !Number.isFinite(maxDelta)) return 0;
  const lo = Math.max(0, i - 1);
  const hi = Math.min(hours.length - 1, i + 1);
  const span = hi - lo;
  if (span === 0) return 0;
  const prev = hours[lo].seaLevel;
  const next = hours[hi].seaLevel;
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return 0;
  return Math.min(1, Math.abs(next - prev) / span / maxDelta);
}

export function solunarScoreAt(time, periods) {
  const s = CONFIG.solunar;
  let best = 0;

  for (const centre of periods.majors) {
    const away = Math.abs(time - centre) / HOUR_MS;
    if (away <= s.majorHalfWidthHours) {
      best = Math.max(best, 1 - (away / s.majorHalfWidthHours) / 2);
    }
  }
  for (const centre of periods.minors) {
    const away = Math.abs(time - centre) / HOUR_MS;
    if (away <= s.minorHalfWidthHours) {
      best = Math.max(best, s.minorCredit * (1 - (away / s.minorHalfWidthHours) / 2));
    }
  }
  return best;
}

export function dawnDuskScore(time, sun) {
  const w = CONFIG.dawnDusk.halfWidthHours;
  let best = 0;
  for (const event of [sun.sunrise, sun.sunset]) {
    if (!event) continue;
    const away = Math.abs(time - event) / HOUR_MS;
    if (away <= w) best = Math.max(best, 1 - away / w);
  }
  return best;
}

function moonPhaseScore(time) {
  const days = daysFromNewOrFull(time);
  const { fullCreditDays, zeroCreditDays } = CONFIG.moonPhase;
  if (days <= fullCreditDays) return 1;
  if (days >= zeroCreditDays) return 0;
  return (zeroCreditDays - days) / (zeroCreditDays - fullCreditDays);
}

function dayKey(d) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function explain(parts, hasTide, hours, i) {
  const out = [];
  const j = Math.max(0, i - CONFIG.pressure.windowHours);
  const delta = hours[i].pressure - hours[j].pressure;

  if (parts.pressure >= 0.75) out.push(`Rising pressure (+${round1(delta)} hPa/3h)`);
  else if (parts.pressure <= 0.25) out.push(`Falling pressure (${round1(delta)} hPa/3h)`);

  if (hasTide) {
    if (parts.tide >= 0.7) out.push('Strong tidal flow');
    else if (parts.tide <= 0.2) out.push('Slack water');
  } else {
    out.push('No tide data for this spot');
  }

  if (parts.solunar >= 0.75) out.push('Major solunar period');
  else if (parts.solunar > 0) out.push('Minor solunar period');

  if (parts.dawnDusk >= 0.5) out.push('Near dawn or dusk');
  if (parts.moonPhase >= 1) out.push('Near new or full moon');

  return out;
}

// Extends each hour with bite (0-100), comfort (0-1), final (0-100) and the
// plain-English reasons behind them.
export function scoreHours(hours, lat, lon) {
  const w = CONFIG.biteWeights;

  // Normalise tide movement against this spot's own strongest hourly change.
  let maxDelta = 0;
  for (let i = 1; i < hours.length; i++) {
    const a = hours[i - 1].seaLevel;
    const b = hours[i].seaLevel;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      maxDelta = Math.max(maxDelta, Math.abs(b - a));
    }
  }
  const hasTide = maxDelta > 0;

  const astroCache = new Map();
  const astroFor = (time) => {
    const key = dayKey(time);
    if (!astroCache.has(key)) {
      astroCache.set(key, {
        periods: solunarPeriods(time, lat, lon),
        sun: sunTimes(time, lat, lon),
      });
    }
    return astroCache.get(key);
  };

  return hours.map((hour, i) => {
    const { periods, sun } = astroFor(hour.time);

    const parts = {
      pressure: pressureScore(hours, i),
      tide: tideScore(hours, i, maxDelta),
      solunar: solunarScoreAt(hour.time, periods),
      dawnDusk: dawnDuskScore(hour.time, sun),
      moonPhase: moonPhaseScore(hour.time),
    };

    // With no tide data the tide weight is redistributed rather than scored as
    // zero, so an inland spot is not permanently capped at 70.
    const activeWeight = hasTide ? 100 : 100 - w.tide;
    let bite = 0;
    for (const [key, weight] of Object.entries(w)) {
      if (key === 'tide' && !hasTide) continue;
      bite += parts[key] * weight;
    }
    bite = (bite / activeWeight) * 100;

    const comfort = comfortScore(hour);
    const reasons = explain(parts, hasTide, hours, i).concat(comfort.reasons);

    return {
      ...hour,
      bite: Math.round(bite),
      comfort: comfort.value,
      final: Math.round(bite * comfort.value),
      reasons,
    };
  });
}
