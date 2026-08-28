import { CONFIG } from './config.js';
import { solunarPeriods, sunTimes, moonIllumination } from './astro.js';
import { moonPhaseName } from './format.js';

const num = (v) => (Number.isFinite(v) ? v : null);

const mean = (values) => {
  const real = values.filter(Number.isFinite);
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
};

const maxOf = (values) => {
  const real = values.filter(Number.isFinite);
  return real.length ? Math.max(...real) : null;
};

const sum = (values) => values.filter(Number.isFinite).reduce((a, b) => a + b, 0);

// Compass bearings are circular: the mean of 350 and 10 is 0, not 180.
// Averaging the unit vectors is the only way to get that right.
function meanDirection(degrees) {
  const real = degrees.filter(Number.isFinite);
  if (!real.length) return null;
  let x = 0;
  let y = 0;
  for (const d of real) {
    const r = (d * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  if (x === 0 && y === 0) return null; // exactly opposing winds: no meaningful mean
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Finds the highs and lows in an hourly sea-level series.
//
// The series is sampled hourly but a real tide does not turn on the hour, so
// taking the largest sample would round every high and low to the nearest hour
// and understate its height. Fitting a parabola through the turning sample and
// its two neighbours recovers both, which for a smooth semidiurnal curve is
// accurate to a few minutes. It is still a modelled series, not a gauge
// reading, and must be labelled that way wherever it is shown.
export function tideExtremes(hours) {
  const out = [];

  for (let i = 1; i < hours.length - 1; i++) {
    const y0 = num(hours[i - 1].seaLevel);
    const y1 = num(hours[i].seaLevel);
    const y2 = num(hours[i + 1].seaLevel);
    if (y0 === null || y1 === null || y2 === null) continue;

    const rising = y1 - y0;
    const falling = y2 - y1;
    if (rising === 0 || falling === 0) continue;
    if (Math.sign(rising) === Math.sign(falling)) continue;

    const curvature = y0 - 2 * y1 + y2;
    // A straight line has no vertex to refine towards; keep the sample as-is.
    const offset = curvature === 0
      ? 0
      : Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / curvature));

    out.push({
      type: rising > 0 ? 'high' : 'low',
      time: new Date(hours[i].time.getTime() + offset * 3600000),
      height: y1 - 0.25 * (y0 - y2) * offset,
    });
  }

  return out;
}

// Collapses a day's hours into fixed-width columns for the detail grid.
//
// The aggregate differs per row on purpose: a three-hour block is summarised by
// its best score, because averaging hides the one good hour you would actually
// fish; by its worst gust, because that is what decides whether you can stand
// on the rocks; and by total rain, because millimetres accumulate.
// A three-hour block counts as disputed if any hour in it is disputed: a blow
// arriving at 16:00 is a disputed afternoon. The readings kept are the ones
// from the hour the score came from, so the numbers in the slot detail are the
// numbers the score was built on.
function mergeAgreement(group, best) {
  const keys = new Set(group.flatMap((h) => Object.keys(h.agreement ?? {})));
  if (!keys.size) return null;

  const out = {};
  for (const key of keys) {
    const entries = group.map((h) => h.agreement?.[key]).filter(Boolean);
    let agree = null;
    if (entries.some((e) => e.agree === false)) agree = false;
    else if (entries.some((e) => e.agree === true)) agree = true;
    out[key] = { agree, readings: (best?.agreement?.[key] ?? entries[0]).readings };
  }
  return out;
}

export function toSlots(hours) {
  const size = CONFIG.daily.slotHours;
  const buckets = new Map();

  for (const hour of hours) {
    const key = Math.floor(hour.time.getUTCHours() / size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(hour);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => {
      // The block's score is its best hour, so bite and comfort come from that
      // same hour. Mixing aggregates would print three numbers that do not
      // multiply together.
      const best = group.reduce((a, b) => ((b.final ?? -Infinity) > (a.final ?? -Infinity) ? b : a));

      return {
        start: group[0].time,
        hours: group,
        score: maxOf(group.map((h) => h.final)) ?? 0,
        bite: mean([best.bite]),
        comfort: mean([best.comfort]),
        wind: mean(group.map((h) => h.windSpeed)),
        gust: maxOf(group.map((h) => h.windGusts)),
        windDirection: meanDirection(group.map((h) => h.windDirection)),
        tide: mean(group.map((h) => h.seaLevel)),
        swellHeight: mean(group.map((h) => h.swellHeight)),
        swellPeriod: mean(group.map((h) => h.swellPeriod)),
        swellDirection: meanDirection(group.map((h) => h.swellDirection)),
        secondarySwellHeight: mean(group.map((h) => h.secondarySwellHeight)),
        waveHeight: mean(group.map((h) => h.waveHeight)),
        wavePeriod: mean(group.map((h) => h.wavePeriod)),
        waveDirection: meanDirection(group.map((h) => h.waveDirection)),
        windWaveHeight: mean(group.map((h) => h.windWaveHeight)),
        windWavePeriod: mean(group.map((h) => h.windWavePeriod)),
        windWaveDirection: meanDirection(group.map((h) => h.windWaveDirection)),
        currentVelocity: mean(group.map((h) => h.currentVelocity)),
        currentDirection: meanDirection(group.map((h) => h.currentDirection)),
        seaTemperature: mean(group.map((h) => h.seaSurfaceTemperature)),
        temperature: mean(group.map((h) => h.temperature)),
        apparentTemperature: mean(group.map((h) => h.apparentTemperature)),
        dewPoint: mean(group.map((h) => h.dewPoint)),
        humidity: mean(group.map((h) => h.humidity)),
        visibility: mean(group.map((h) => h.visibility)),
        // The peak, not the average: a UV index of 9 for one hour is what
        // burns you, and the CAPE peak is what builds the thunderstorm.
        uvIndex: maxOf(group.map((h) => h.uvIndex)),
        cape: maxOf(group.map((h) => h.cape)),
        freezingLevel: mean(group.map((h) => h.freezingLevel)),
        rain: sum(group.map((h) => h.precipitation)),
        cloud: mean(group.map((h) => h.cloudCover)),
        cloudLow: mean(group.map((h) => h.cloudLow)),
        cloudMid: mean(group.map((h) => h.cloudMid)),
        cloudHigh: mean(group.map((h) => h.cloudHigh)),
        pressure: mean(group.map((h) => h.pressure)),
        agreement: mergeAgreement(group, best),
      };
    });
}

const minOf = (values) => {
  const real = values.filter(Number.isFinite);
  return real.length ? Math.min(...real) : null;
};

function dayKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Groups scored hours into calendar days and attaches everything the detail
// view shows: the 3-hour grid, the day's tide turning points, sun times and
// the moon. Astronomy is computed once per day, not once per hour.
export function summariseDays(scoredHours, lat, lon, offsetSeconds = 0) {
  const byDay = new Map();
  for (const hour of scoredHours) {
    const key = dayKey(hour.time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(hour);
  }

  // Extrema need a neighbour on each side, so they are found across the whole
  // series once and filtered per day. Finding them day by day would miss any
  // turn falling in a day's first or last hour.
  const allTides = tideExtremes(scoredHours);

  return [...byDay.entries()].map(([key, hours]) => {
    const noon = new Date(Date.UTC(
      hours[0].time.getUTCFullYear(),
      hours[0].time.getUTCMonth(),
      hours[0].time.getUTCDate(),
      12,
    ));
    const best = hours.reduce((a, b) => (b.final > a.final ? b : a));
    const { phase, fraction } = moonIllumination(noon);
    const swellHeights = hours.map((h) => h.swellHeight).filter(Number.isFinite);

    return {
      key,
      date: hours[0].time,
      hours,
      best: { score: best.final, time: best.time },
      slots: toSlots(hours),
      // The bands draw hourly. slots above are 3-hour means, which would put a
      // tide peak up to 90 minutes away from the high-water time printed
      // beside it.
      series: {
        tide: hours.map((h) => h.seaLevel),
        wind: hours.map((h) => h.windSpeed),
        score: hours.map((h) => h.final),
      },
      tides: allTides.filter((t) => dayKey(t.time) === key),
      sun: sunTimes(noon, lat, lon, offsetSeconds),
      moon: {
        phase,
        illumination: fraction,
        name: moonPhaseName(phase),
        ...solunarPeriods(noon, lat, lon, offsetSeconds), // majors and minors
      },
      wind: {
        min: minOf(hours.map((h) => h.windSpeed)),
        max: maxOf(hours.map((h) => h.windSpeed)),
        maxGust: maxOf(hours.map((h) => h.windGusts)),
        direction: meanDirection(hours.map((h) => h.windDirection)),
      },
      swell: swellHeights.length ? {
        min: Math.min(...swellHeights),
        max: Math.max(...swellHeights),
        maxPeriod: maxOf(hours.map((h) => h.swellPeriod)),
      } : null,
      temperature: {
        min: minOf(hours.map((h) => h.temperature)),
        max: maxOf(hours.map((h) => h.temperature)),
      },
      rain: sum(hours.map((h) => h.precipitation)),
      pressure: {
        min: minOf(hours.map((h) => h.pressure)),
        max: maxOf(hours.map((h) => h.pressure)),
      },
    };
  });
}
