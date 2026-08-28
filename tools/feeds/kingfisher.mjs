// Parsing and merging for the Kingfisher weekly KZN fishing report. Pure: no
// network, no fs. tools/build-feeds.mjs supplies the bytes.
//
// The WordPress REST API is discovery only. On this site content.rendered and
// excerpt.rendered are both empty strings -- the Kubio page builder keeps the
// body outside the fields REST renders -- so the text has to come from the
// post page HTML.

// The reports are Kingfisher's copyright. The stored excerpt is a pointer to
// their page, never a substitute for it.
export const EXCERPT_WORDS = 50;

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
// Slice from the end of that opening tag; the class attribute runs on past the
// name, so the next '>' is the tag's own close.
function bodyText(html) {
  const at = html.indexOf('entry-content');
  if (at === -1) return '';
  const open = html.indexOf('>', at);
  if (open === -1) return '';
  return text(html.slice(open + 1, open + 20000));
}

// Mirrored in three places by the SEO plugin. Any of them is a fine fallback.
function metaText(html) {
  const m = html.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]*)"/i);
  return m ? text(m[1]) : '';
}

function excerptOf(source) {
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const head = parts.slice(0, EXCERPT_WORDS).join(' ');
  return parts.length > EXCERPT_WORDS ? `${head}…` : head;
}

export function parseEntry(post, html) {
  const source = bodyText(html) || metaText(html);
  const excerpt = excerptOf(source);
  // Half an entry renders an empty card, which is worse than no card. The post
  // stays absent from the stored entries, so tomorrow's run retries it.
  if (!excerpt) return null;

  return {
    id: post.id,
    date: `${post.date_gmt}Z`,
    title: decode(post.title.rendered),
    link: post.link,
    excerpt,
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
