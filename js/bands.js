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

// Tide turns are found across the whole 7-day series, so they arrive here
// carrying days we are not drawing.
export function extremaMarkers(tides, key) {
  return tides
    .filter((t) => dayKeyOf(t.time) === key)
    .map((t) => ({
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
