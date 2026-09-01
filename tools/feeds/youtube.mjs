// Recent videos from the KZN fishing channels. Pure: no network, no fs.
// tools/build-feeds.mjs supplies the bytes.
//
// Measured 2026-08-31: only two of these seven channels serve a working Atom
// feed. Four return a hard 404 that survives retries and isolated requests --
// their channel pages return 200 with the correct title, so the ids are right
// and the feed simply does not exist for them. One returns a valid 200 feed
// with no entries at all. The playlist_id=UU... workaround is 404 for all
// seven. So the feed is tried first and the channel page is the fallback,
// per channel, every run -- a channel that gains or loses a feed needs no
// code change.

import { findMarks, findSpecies } from './places.mjs';

// The channel id is the stable identifier. Handles are not stored: resolving
// one costs a fetch that would be repeated daily for no benefit.
//
// Note: the handle @fishingunfiltered resolves to a dormant 2023 channel with
// no content whatsoever. The active channel is @FISHINGUNFILTERED1, recorded
// below. Do not "correct" this id back.
export const CHANNELS = [
  { name: 'Kayz Adventures', id: 'UC-Gmr9Xe_6rifFb-7u6J2ZQ' },
  { name: "Pa's Xtreme Fishing", id: 'UCh8UMAxna8IRRu2sRV3kDIQ' },
  { name: 'Buddyz Fishing Adventures', id: 'UC68dR_gNnGmNYcMENCxNeWw' },
  { name: 'Fishing Unfiltered', id: 'UCOZsf26qw8MuprQuq5Ee3DQ' },
  { name: 'Kents Fishing', id: 'UC1QUL3Z5Ho7_Y0M562eqb8Q' },
  { name: 'Come Fish With Saags', id: 'UCCuWKw-vw3E8le-5aQNrLdA' },
  { name: 'TightLines South Africa', id: 'UCj-869N0wXMADhy_qmlYWBg' },
];

// The UI renders eight. The window is larger so that sub-project 3b has
// history to match against, and so the first build backfills a real archive
// from the ~30 videos a channel page exposes rather than starting empty.
// Neither the Atom feed nor the page can page back, so history only ever
// accumulates going forward.
export const MAX_ENTRIES = 40;

export const meta = {
  name: 'youtube',
  url: 'https://www.youtube.com/',
  out: 'data/feeds/youtube.json',
  maxEntries: MAX_ENTRIES,
};

export const channelUrl = (id) => `https://www.youtube.com/channel/${id}`;
export const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;
const feedUrl = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
};

// YouTube double-escapes inside XML text nodes in places, so decode twice.
function decodeOnce(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function decode(s) {
  return decodeOnce(decodeOnce(s));
}

function tagText(xml, tag) {
  // String.raw, not a plain template literal: in a template literal `\s`
  // collapses to `s` before RegExp ever sees it, silently turning the
  // any-character class into a literal [sS].
  const m = xml.match(new RegExp(String.raw`<${tag}[^>]*>([\s\S]*?)</${tag}>`));
  return m ? decode(m[1]).trim() : '';
}

export function hasEntries(xml) {
  return /<yt:videoId>/.test(xml);
}

export function parseFeed(xml, channel, gz = null) {
  const blocks = xml.split('<entry>').slice(1);
  const entries = [];

  for (const block of blocks) {
    const id = tagText(block, 'yt:videoId');
    // An 11-character id is the only shape YouTube issues; anything else means
    // the block is not a video and storing it would produce a dead link.
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue;

    const published = tagText(block, 'published');
    const time = Date.parse(published);
    // Half an entry renders a row that goes nowhere useful. Skip it; the next
    // run sees the video again and retries.
    if (!Number.isFinite(time)) continue;

    const title = tagText(block, 'title');
    if (!title) continue;

    const description = tagText(block, 'media:description');

    entries.push({
      id,
      channel: channel.name,
      channelUrl: channelUrl(channel.id),
      title,
      link: watchUrl(id),
      date: new Date(time).toISOString(),
      description: description || null,
      via: 'rss',
      marks: findMarks(gz, { title, body: description }),
      species: findSpecies(gz, `${title} ${description}`),
    });
  }

  return entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function firstRound() {
  return CHANNELS.map((channel) => ({
    key: `rss:${channel.id}`,
    url: feedUrl(channel.id),
    type: 'text',
    channel,
  }));
}

export const videosUrl = (id) => `${channelUrl(id)}/videos`;

// A first run would otherwise ask for a date on every one of the ~30 videos a
// channel page lists, for every channel without a feed. Eight per channel
// fills the 40-entry window across five channels in one run and keeps the job
// well inside its ten-minute budget; later runs ask for almost nothing,
// because everything else is already stored.
export const SCRAPE_PER_CHANNEL = 8;

// The channel page carries its video list inside ytInitialData as
// lockupMetadataViewModel records. This is an undocumented shape and YouTube
// can change it: parseChannelPage returning [] is a supported outcome, not an
// error, and the build simply keeps whatever it already stored.
const LOCKUP = /"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/g;
const VIDEO_ID_AFTER = /"videoId":"([A-Za-z0-9_-]{11})"/;

// The id sits inside the same lockup object as its title. Measured against a
// real capture, the furthest an id ever sat from its title was ~1300
// characters; 4000 is comfortable headroom without reaching the next record.
const LOCKUP_SPAN = 4000;

// JSON string escapes, not HTML entities: the titles live inside a JSON blob.
function unescapeJson(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

export function parseChannelPage(html, channel) {
  const pending = [];
  const seen = new Set();

  for (const match of html.matchAll(LOCKUP)) {
    const title = unescapeJson(match[1]).trim();
    if (!title) continue;

    const after = html.slice(match.index, match.index + LOCKUP_SPAN);
    const idMatch = after.match(VIDEO_ID_AFTER);
    if (!idMatch) continue;

    const id = idMatch[1];
    if (seen.has(id)) continue;
    seen.add(id);

    pending.push({
      id,
      channel: channel.name,
      channelUrl: channelUrl(channel.id),
      title,
      link: watchUrl(id),
    });
  }

  return pending;
}

export function consume(results, existing, ctx = {}) {
  const gz = ctx.gazetteer ?? null;
  const stored = new Set(existing.map((e) => e.id));

  // Round one: the Atom feeds. A non-200, or a 200 with no entries at all
  // (both measured, real states), means "no data here" and sends that channel
  // to its page.
  const feeds = results.filter((r) => r.key.startsWith('rss:'));
  if (feeds.length) {
    const entries = [];
    const next = [];
    for (const result of feeds) {
      if (result.ok && hasEntries(result.body)) {
        entries.push(...parseFeed(result.body, result.channel, gz));
      } else {
        next.push({
          key: `page:${result.channel.id}`,
          url: videosUrl(result.channel.id),
          type: 'text',
          channel: result.channel,
        });
      }
    }
    return { entries, next };
  }

  // Round two: the channel pages. These yield videos with no date, so each
  // unstored one needs a watch-page lookup in round three.
  const pages = results.filter((r) => r.key.startsWith('page:'));
  if (pages.length) {
    const next = [];
    for (const result of pages) {
      if (!result.ok) continue;
      const pending = parseChannelPage(result.body, result.channel)
        .filter((video) => !stored.has(video.id))
        .slice(0, SCRAPE_PER_CHANNEL);
      for (const video of pending) {
        next.push({ key: `watch:${video.id}`, url: video.link, type: 'text', video });
      }
    }
    return { entries: [], next };
  }

  // Round three: one watch page per scraped video, for its exact timestamp.
  const watches = results.filter((r) => r.key.startsWith('watch:'));
  if (watches.length) {
    const entries = [];
    for (const result of watches) {
      if (!result.ok) continue;
      const date = parseUploadDate(result.body);
      // No real date means no entry. The video stays unstored, so the next
      // run sees it on the channel page again and retries.
      if (!date) continue;
      entries.push({
        ...result.video,
        date,
        // The channel page carries no description, and the watch page's is
        // empty without JavaScript. Consumers must treat null as normal.
        description: null,
        via: 'scrape',
        marks: findMarks(gz, { title: result.video.title, body: '' }),
        species: findSpecies(gz, result.video.title),
      });
    }
    return { entries, next: [] };
  }

  return { entries: [], next: [] };
}

// The watch page exposes a real timestamp. This is why no stored entry ever
// carries a date derived from the channel page's "12 days ago" strings: an
// approximate date that sorts against real ones is worse than no video.
const UPLOAD_DATE = /"uploadDate":"([^"]+)"/;

export function parseUploadDate(html) {
  const match = html.match(UPLOAD_DATE);
  if (!match) return null;
  const time = Date.parse(match[1]);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

// Re-derived on every merge, not just at parse time. An entry that survives
// in the window is never re-parsed from its feed, so without this a mark
// added to the gazetteer would only ever apply to videos published after the
// edit -- and entries stored before matching existed would stay blank
// forever. Matching is pure string work over text already in hand, so doing
// it for the whole window every run costs nothing and keeps the file
// consistent with the gazetteer as it stands today.
function stamp(entry, gz) {
  if (!gz) return entry;
  return {
    ...entry,
    marks: findMarks(gz, { title: entry.title, body: entry.description ?? '' }),
    species: findSpecies(gz, `${entry.title} ${entry.description ?? ''}`),
  };
}

export function merge(existing, incoming, ctx = {}) {
  const gz = ctx.gazetteer ?? null;

  // Incoming wins on a clash: it is the fresher parse of the same video.
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const entry of incoming) byId.set(entry.id, entry);

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, MAX_ENTRIES)
    .map((entry) => stamp(entry, gz));
}
