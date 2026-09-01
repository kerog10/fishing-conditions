// Parsing and merging for the Kingfisher weekly KZN fishing report. Pure: no
// network, no fs. tools/build-feeds.mjs supplies the bytes.
//
// The WordPress REST API is discovery only. On this site content.rendered and
// excerpt.rendered are both empty strings -- the Kubio page builder keeps the
// body outside the fields REST renders -- so the text has to come from the
// post page HTML.

import { splitRegions } from './places.mjs';

// The reports are Kingfisher's copyright. The stored excerpt is a pointer to
// their page, never a substitute for it.
export const EXCERPT_WORDS = 50;

// A 200 response is not proof the page is a fishing report: a cookie wall,
// consent interstitial, or soft-404 also returns 200 with real, non-empty
// text in both entry-content and the meta description, and would otherwise
// parse into a complete, storable entry (verified against a live cookie
// wall, whose meta description is a single ~9-word sentence). Real weekly
// reports run to hundreds of words and always hit the EXCERPT_WORDS cap; a
// genuine report this short is not plausible. The floor sits comfortably
// above an interstitial's one sentence and far below any real report.
export const MIN_EXCERPT_WORDS = 20;

// Roughly two months of weekly reports: enough for the card plus a little
// history, small enough that the committed file stays trivial.
export const MAX_ENTRIES = 8;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
};

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function text(html) {
  return decode(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

// The body sits inside the element whose class list contains entry-content.
// Anchor on the class attribute itself, not a bare substring match -- a
// <style> block earlier in the page can contain a ".entry-content > p { }"
// combinator selector, and a bare indexOf('entry-content') would match that
// text and hand back CSS as if it were the article. Slice from the end of
// the matched tag's opening '>'.
const ENTRY_CONTENT_CLASS = /class=(?:"[^"]*entry-content[^"]*"|'[^']*entry-content[^']*')/;

function bodyText(html) {
  const match = html.match(ENTRY_CONTENT_CLASS);
  if (!match) return '';
  const open = html.indexOf('>', match.index);
  if (open === -1) return '';
  return text(html.slice(open + 1, open + 20000));
}

// Mirrored in three places by the SEO plugin. Any of them is a fine fallback.
function metaText(html) {
  const m = html.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]*)"/i);
  return m ? text(m[1]) : '';
}

function wordsOf(source) {
  return source.split(/\s+/).filter(Boolean);
}

function excerptOf(source) {
  const parts = wordsOf(source);
  if (!parts.length) return '';
  const head = parts.slice(0, EXCERPT_WORDS).join(' ');
  return parts.length > EXCERPT_WORDS ? `${head}…` : head;
}

// Below the floor, a source is not trusted as a real report: entry-content
// falls through to the meta description, and the meta description (if also
// too short) is rejected outright rather than stored.
function longEnough(source) {
  return wordsOf(source).length >= MIN_EXCERPT_WORDS;
}

export function parseEntry(post, html, gz = null) {
  const body = bodyText(html);
  const source = longEnough(body) ? body : metaText(html);
  const excerpt = longEnough(source) ? excerptOf(source) : '';
  // Half an entry renders an empty card, which is worse than no card. The post
  // stays absent from the stored entries, so tomorrow's run retries it. The
  // same applies to a source that parsed but never cleared MIN_EXCERPT_WORDS.
  if (!excerpt) return null;

  // date_gmt missing or unparseable would otherwise store the literal string
  // "undefinedZ", which sorts ahead of every real ISO date and can evict a
  // genuine entry from the merge window.
  const date = `${post.date_gmt}Z`;
  if (!Number.isFinite(Date.parse(date))) return null;

  return {
    id: post.id,
    date,
    title: decode(post.title.rendered),
    link: post.link,
    excerpt,
    // Facts extracted from the body, not more of it. The 50-word excerpt
    // above remains the only Kingfisher prose this file ever stores.
    regions: splitRegions(gz, body),
  };
}

export function newPosts(posts, existing) {
  const known = new Set(existing.map((e) => e.id));
  return posts.filter((p) => !known.has(p.id));
}

export function mergeEntries(existing, incoming) {
  // Incoming wins on a clash: it is the fresher parse of the same post.
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const entry of incoming) byId.set(entry.id, entry);

  return [...byId.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ENTRIES);
}

// --- source contract -------------------------------------------------------
// tools/build-feeds.mjs drives every source through the same three functions.
// This module stays pure: it describes requests and interprets their results,
// but never performs them.

const SITE = 'https://www.kingfisher.co.za/';

// Category 644 is KZN Fishing Reports. per_page=5 is enough to recover if the
// job has been down for a month of weekly reports, and is still one request.
const LIST = 'https://www.kingfisher.co.za/wp-json/wp/v2/posts'
  + '?categories=644&per_page=5&_fields=id,date_gmt,link,title';

export const meta = {
  name: 'kingfisher',
  url: SITE,
  out: 'data/feeds/kingfisher.json',
  maxEntries: MAX_ENTRIES,
};

export function firstRound() {
  return [{ key: 'list', url: LIST, type: 'json' }];
}

export function consume(results, existing, ctx = {}) {
  const gz = ctx.gazetteer ?? null;
  const list = results.find((r) => r.key === 'list');

  // Round one: the REST category list decides which post pages to fetch.
  if (list) {
    if (!list.ok || !Array.isArray(list.body)) return { entries: [], next: [] };
    // A post already stored but without regions predates place matching, or
    // was stored while the gazetteer was unreadable. The body it needs lives
    // only on the page -- the stored excerpt is 50 words by copyright rule --
    // so it has to be fetched again. One-off per post, then stable.
    const unstamped = new Set(
      existing.filter((e) => !e.regions).map((e) => e.id),
    );
    const wanted = gz
      ? list.body.filter((p) => !existing.some((e) => e.id === p.id) || unstamped.has(p.id))
      : newPosts(list.body, existing);
    const next = wanted.map((post) => ({
      key: `post:${post.id}`,
      url: post.link,
      type: 'text',
      post,
    }));
    return { entries: [], next };
  }

  // Round two: one HTML body per post. A failed fetch or an unparseable page
  // is skipped, not fatal -- the post stays unstored and is retried tomorrow.
  const entries = [];
  for (const result of results) {
    if (!result.ok) continue;
    const entry = parseEntry(result.post, result.body, gz);
    if (entry) entries.push(entry);
  }
  return { entries, next: [] };
}

export function merge(existing, incoming) {
  return mergeEntries(existing, incoming);
}
