import { CONFIG } from './config.js';
import { band, tideBand, scoreBandIndex } from './severity.js';
import { dayLabel } from './format.js';

// Turns daily.js day summaries into the shape the forecast table draws: days of
// columns, each column a map of row key to { value, band, agree }.
//
// Pure on purpose. No DOM, no toFixed, no colour -- values stay numbers so the
// same model could be printed as text, and every colour decision lives in CSS
// keyed off the band index.

// A day with no score at all is a bug, not an inland spot, so these three rows
// survive the emptiness filter that drops tide and swell away from the coast.
const ALWAYS_KEEP = new Set(['score', 'bite', 'comfort']);

// Uncertainty in an input is uncertainty in the output: one disputed
// contributor hatches the score cell. The precedence matches daily.js's
// mergeAgreement -- false beats true beats null -- so "we only have one model"
// never renders as agreement.
function scoreAgreement(agreement) {
  if (!agreement) return null;
  const states = CONFIG.models.scoreInputs
    .map((key) => agreement[key]?.agree)
    .filter((state) => state !== undefined);
  if (states.includes(false)) return false;
  if (states.includes(true)) return true;
  return null;
}

// Matched by containment, not by rounding to the nearest column: a turn at
// 14:20 belongs to the 12:00 block, and rounding would put it in the 15:00 one.
// A block holding both a high and a low cannot be labelled with one glyph, so
// the first wins -- the slot detail lists both anyway.
function extremeFor(tides, slot) {
  const start = slot.start.getTime();
  const end = start + slot.hours.length * 3600000;
  const hit = tides.find((t) => t.time.getTime() >= start && t.time.getTime() < end);
  if (!hit) return null;
  return hit.type === 'high' ? 'H' : 'L';
}

// Tide has no bounds array in CONFIG.severity, deliberately: it is normalised
// within the day's own range. Tidal range varies by spot and by spring/neap, so
// an absolute ramp would render some spots permanently one colour.
function cellBand(row, value, tideRange) {
  if (row.kind === 'score') return scoreBandIndex(value);
  if (row.kind !== 'tinted') return null;
  if (row.ramp === 'tide') return tideBand(value, tideRange.min, tideRange.max);
  return band(row.ramp, value);
}

function rangeOf(values) {
  const real = values.filter(Number.isFinite);
  return real.length
    ? { min: Math.min(...real), max: Math.max(...real) }
    : { min: null, max: null };
}

export function buildTable(days, now = new Date()) {
  const built = days.map((day) => {
    const tideRange = rangeOf(day.slots.map((s) => s.tide));

    const columns = day.slots.map((slot, slotIndex) => {
      const cells = {};
      for (const row of CONFIG.tableRows) {
        const value = Number.isFinite(slot[row.slot]) ? slot[row.slot] : null;
        cells[row.key] = {
          value,
          band: cellBand(row, value, tideRange),
          agree: row.key === 'score'
            ? scoreAgreement(slot.agreement)
            : slot.agreement?.[row.key]?.agree ?? null,
        };
      }

      return {
        time: slot.start,
        slotIndex,
        slot, // the detail panel needs the hourly readings and reasons
        tideExtreme: extremeFor(day.tides, slot),
        cells,
      };
    });

    return { key: day.key, date: day.date, label: dayLabel(day.date, now), columns };
  });

  // Cells are built for every configured row and only the row *list* is
  // filtered, so the render layer can index cells[row.key] without a guard.
  const rows = CONFIG.tableRows.filter((row) => ALWAYS_KEEP.has(row.key)
    || built.some((day) => day.columns.some((c) => c.cells[row.key].value !== null)));

  return { days: built, rows };
}
