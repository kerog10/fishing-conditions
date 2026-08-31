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

export function parseFeed(xml, channel) {
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
