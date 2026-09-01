// Recent videos from the KZN fishing channels, built daily by
// tools/build-feeds.mjs and served same-origin. Purely additive context:
// every failure path here ends in "no list", never in an error the user has
// to read.
import { CONFIG } from './config.js';

export async function loadVideos(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(CONFIG.videos.path);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Absent before the first workflow run, and unreachable offline on a
    // first visit. Neither is worth telling anyone about.
    return null;
  }
}

export function pickVideos(feed) {
  const entries = feed?.entries;
  if (!Array.isArray(entries)) return [];

  const usable = entries
    .filter((e) => e && e.link && e.title && Number.isFinite(Date.parse(e.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  // Deliberately no staleness cutoff, unlike the Kingfisher card: a weekly
  // report has a shelf life, a good session from June does not. Each row
  // shows its date, so nothing is passed off as more current than it is.
  const perChannel = new Map();
  const picked = [];

  for (const entry of usable) {
    const seen = perChannel.get(entry.channel) ?? 0;
    if (seen >= CONFIG.videos.perChannel) continue;
    perChannel.set(entry.channel, seen + 1);
    picked.push(entry);
    if (picked.length === CONFIG.videos.max) break;
  }

  return picked;
}
