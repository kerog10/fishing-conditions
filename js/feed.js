// The Kingfisher report feed, built daily by tools/build-feeds.mjs and served
// same-origin. Purely additive context: every failure path here ends in "no
// card", never in an error the user has to read.
import { CONFIG } from './config.js';

export async function loadFeed(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(CONFIG.feed.path);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Absent before the first workflow run, and unreachable offline on a first
    // visit. Neither is worth telling anyone about.
    return null;
  }
}

export function currentEntry(feed, now = new Date()) {
  const entries = feed?.entries;
  if (!Array.isArray(entries) || !entries.length) return null;

  const cutoff = now.getTime() - (CONFIG.feed.maxAgeDays * 86400000);

  const usable = entries
    .filter((e) => e && e.link && e.excerpt && Number.isFinite(Date.parse(e.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const newest = usable[0];
  // A report from a month ago presented as this week's is worse than silence.
  return newest && Date.parse(newest.date) >= cutoff ? newest : null;
}
