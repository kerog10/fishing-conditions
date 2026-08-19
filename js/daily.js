import { CONFIG } from './config.js';

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
    .map(([, group]) => ({
      start: group[0].time,
      hours: group,
      score: maxOf(group.map((h) => h.final)) ?? 0,
      wind: mean(group.map((h) => h.windSpeed)),
      gust: maxOf(group.map((h) => h.windGusts)),
      windDirection: meanDirection(group.map((h) => h.windDirection)),
      tide: mean(group.map((h) => h.seaLevel)),
      swellHeight: mean(group.map((h) => h.swellHeight)),
      swellPeriod: mean(group.map((h) => h.swellPeriod)),
      temperature: mean(group.map((h) => h.temperature)),
      rain: sum(group.map((h) => h.precipitation)),
      cloud: mean(group.map((h) => h.cloudCover)),
      pressure: mean(group.map((h) => h.pressure)),
    }));
}
