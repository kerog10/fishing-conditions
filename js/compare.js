// Turns per-spot day summaries into the spots x days grid.
//
// The day axis is the union of every spot's days, not the first spot's, so a
// spot added mid-week or one whose refresh failed leaves a gap in its own row
// instead of shifting every column out of alignment.
export function buildComparison(entries) {
  const dayKeys = [...new Set(entries.flatMap((e) => e.days.map((d) => d.key)))].sort();

  const dates = dayKeys.map((key) => {
    for (const e of entries) {
      const hit = e.days.find((d) => d.key === key);
      if (hit) return hit.date;
    }
    return null;
  });

  const rows = entries.map((e) => {
    const byKey = new Map(e.days.map((d) => [d.key, d]));
    return {
      spot: e.spot,
      cells: dayKeys.map((key) => ({
        dayKey: key,
        score: byKey.has(key) ? byKey.get(key).best.score : null,
      })),
    };
  });

  let best = null;
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      if (cell.score === null) return;
      if (best && cell.score <= best.score) return;
      best = {
        spotId: row.spot.id,
        spotName: row.spot.name,
        dayKey: cell.dayKey,
        date: dates[i],
        score: cell.score,
      };
    });
  }

  return { dayKeys, dates, rows, best };
}
