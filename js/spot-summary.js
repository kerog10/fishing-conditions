// One spot, boiled down to the four things worth reading off a list: how it
// scores now, which way the tide is going, what the wind is doing, and when
// the next decent window opens.

// Below this much movement in an hour the tide is not meaningfully going
// anywhere, and calling it "rising" on a 1 cm change is noise dressed as
// information.
const SLACK_M = 0.03;

const nearestIndex = (hours, now) => {
  let best = -1;
  let gap = Infinity;
  hours.forEach((h, i) => {
    const d = Math.abs(h.time - now);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
};

function tideState(hours, i) {
  const here = hours[i]?.seaLevel;
  if (!Number.isFinite(here)) return null;

  // Compare against the previous hour where there is one, the next where
  // there is not, so the first hour of the series still gets a direction.
  const other = Number.isFinite(hours[i - 1]?.seaLevel) ? hours[i - 1].seaLevel
    : (Number.isFinite(hours[i + 1]?.seaLevel) ? hours[i + 1].seaLevel : null);
  if (other === null) return 'slack';

  const delta = i > 0 ? here - other : other - here;
  if (Math.abs(delta) < SLACK_M) return 'slack';
  return delta > 0 ? 'rising' : 'falling';
}

export function summariseSpot(hours, windows, tides, now = new Date()) {
  const i = nearestIndex(hours, now);
  const hour = i >= 0 ? hours[i] : null;

  const upcoming = windows.find((w) => w.end > now) ?? null;
  const nextTurn = tides.find((t) => t.time > now) ?? null;

  return {
    score: hour ? hour.final : null,
    wind: {
      speed: hour ? hour.windSpeed : null,
      direction: hour ? hour.windDirection : null,
    },
    tide: {
      state: hour ? tideState(hours, i) : null,
      height: Number.isFinite(hour?.seaLevel) ? hour.seaLevel : null,
      nextTurn: nextTurn ? { type: nextTurn.type, time: nextTurn.time } : null,
    },
    nextWindow: upcoming
      ? { start: upcoming.start, end: upcoming.end, score: upcoming.peakFinal }
      : null,
  };
}
