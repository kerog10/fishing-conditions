// Ranks KZN marks by how much recent video evidence mentions them. Pure: it
// fetches nothing, and is a function of the two feeds the app already loads.
//
// Marks arrive already matched -- tools/feeds/places.mjs does that at build
// time against the curated gazetteer, so nothing here guesses at a place.
import { CONFIG } from './config.js';

const DAY_MS = 86400000;

function entriesOf(feed) {
  const entries = feed?.entries;
  return Array.isArray(entries) ? entries : [];
}

// Linear decay across the window, floored rather than zeroed: an eight-week
// old mention is weak evidence, but it still beats none.
function recencyWeight(date, now) {
  const age = (now.getTime() - Date.parse(date)) / DAY_MS;
  const { windowDays, minRecencyWeight } = CONFIG.hotspots;
  const fresh = 1 - (age / windowDays);
  return Math.max(minRecencyWeight, Math.min(1, fresh));
}

// The newest stored report is the one whose regional lines are current.
function newestReport(reportFeed) {
  const usable = entriesOf(reportFeed)
    .filter((e) => e && e.regions && Number.isFinite(Date.parse(e.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return usable[0] ?? null;
}

export function buildHotspots(videoFeed, reportFeed, now = new Date()) {
  const cutoff = now.getTime() - (CONFIG.hotspots.windowDays * DAY_MS);

  const usable = entriesOf(videoFeed).filter((e) => (
    e && Array.isArray(e.marks) && e.marks.length
    && Number.isFinite(Date.parse(e.date)) && Date.parse(e.date) >= cutoff
  ));

  const byMark = new Map();
  for (const entry of usable) {
    const weight = recencyWeight(entry.date, now);
    for (const mark of entry.marks) {
      if (!mark || !mark.name) continue;
      let row = byMark.get(mark.name);
      if (!row) {
        row = {
          name: mark.name,
          region: mark.region ?? null,
          lat: null,
          lon: null,
          score: 0,
          species: new Set(),
          videos: [],
        };
        byMark.set(mark.name, row);
      }
      // Any one mention carrying a coordinate is enough to place the row: an
      // older entry stamped before the gazetteer had one would otherwise win
      // by arriving first.
      if (row.lat === null && Number.isFinite(mark.lat) && Number.isFinite(mark.lon)) {
        row.lat = mark.lat;
        row.lon = mark.lon;
      }
      const position = mark.where === 'title'
        ? CONFIG.hotspots.titleWeight
        : CONFIG.hotspots.bodyWeight;
      row.score += position * weight;
      row.videos.push(entry);
      for (const s of entry.species ?? []) row.species.add(s);
    }
  }

  const report = newestReport(reportFeed);

  return [...byMark.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, CONFIG.hotspots.max)
    .map((row) => {
      const line = report?.regions?.[row.region];
      return {
        name: row.name,
        region: row.region,
        lat: row.lat,
        lon: row.lon,
        count: row.videos.length,
        species: [...row.species].sort(),
        videos: row.videos.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
        // Region-level context, clearly attributed and always linked, never
        // presented as if it were about this specific mark.
        report: line
          ? { species: line.species ?? [], link: report.link, date: report.date }
          : null,
      };
    });
}
