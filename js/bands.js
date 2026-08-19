// Turns an hourly series into bar heights for the day cards. Kept free of the
// DOM so the awkward parts -- flat days, missing readings, where a tide turn
// lands -- can be tested directly.

// Every real reading gets at least this much height. A bar of zero pixels
// reads as missing data, and "calm" is not the same as "no reading".
const MIN_BAR_PCT = 6;

export function buildBand(values, { minBarPct = MIN_BAR_PCT } = {}) {
  const real = values.filter(Number.isFinite);

  if (!real.length) {
    return {
      bars: values.map(() => ({ value: null, pct: 0 })),
      min: null,
      max: null,
      hasData: false,
    };
  }

  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min;

  const bars = values.map((value) => {
    if (!Number.isFinite(value)) return { value: null, pct: 0 };
    // A windless day has no span to scale against. Drawing it half height
    // says "steady" where scaling would either divide by zero or flatten it
    // to nothing.
    if (span === 0) return { value, pct: 50 };
    const fraction = (value - min) / span;
    return { value, pct: minBarPct + fraction * (100 - minBarPct) };
  });

  return { bars, min, max, hasData: true };
}

// Defensive filter: callers already pass only the tides for this day
// (daily.js filters day.tides before ui-days.js hands it here), so this
// never removes anything today, but it keeps the function safe if that
// upstream guarantee ever changes.
export function extremaMarkers(tides, key) {
  return tides
    .filter((t) => dayKeyOf(t.time) === key)
    .map((t) => ({
      // Assumes each day's hours start at 00:00 UTC and run contiguously, so
      // the UTC hour lines up 1:1 with the bar's index in `bars`.
      index: t.time.getUTCHours(),
      type: t.type,
      time: t.time,
      height: t.height,
    }));
}

function dayKeyOf(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
