import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCERPT_WORDS, MIN_EXCERPT_WORDS, MAX_ENTRIES, parseEntry, mergeEntries, newPosts,
} from '../tools/feeds/kingfisher.mjs';

const html = readFileSync(new URL('./fixtures/kingfisher-post.html', import.meta.url), 'utf8');

const POST = {
  id: 30568,
  date_gmt: '2026-08-27T14:21:53',
  link: 'https://www.kingfisher.co.za/kzn-fishing-report-27-august-2026/',
  title: { rendered: 'KZN Fishing Report (27 August 2026)' },
};

const words = (s) => s.replace(/…$/, '').trim().split(/\s+/).length;

test('a real report page parses to a complete entry', () => {
  const entry = parseEntry(POST, html);

  assert.equal(entry.id, 30568);
  assert.equal(entry.title, 'KZN Fishing Report (27 August 2026)');
  assert.equal(entry.link, POST.link);
  // date_gmt has no suffix; storing it unmarked would be read as local time.
  assert.equal(entry.date, '2026-08-27T14:21:53Z');
  assert.match(entry.excerpt, /Shad Championship/);
});

test('the excerpt is capped even though the report runs to thousands of words', () => {
  const entry = parseEntry(POST, html);

  assert.ok(words(entry.excerpt) <= EXCERPT_WORDS,
    `excerpt ran to ${words(entry.excerpt)} words`);
  assert.match(entry.excerpt, /…$/, 'a truncated excerpt should say so');
});

test('the excerpt carries no markup and no raw entities', () => {
  const entry = parseEntry(POST, html);

  assert.doesNotMatch(entry.excerpt, /[<>]/);
  assert.doesNotMatch(entry.excerpt, /&[a-z]+;|&#\d+;/i);
});

test('a page built without entry-content falls back to the meta description', () => {
  // Kubio could change its markup at any time; the meta tags are stable.
  const stripped = html.replace(/entry-content/g, 'entry-gone');
  const entry = parseEntry(POST, stripped);

  assert.match(entry.excerpt, /Shad Championship/);
});

test('a page with neither body nor meta description is skipped, not half-stored', () => {
  const entry = parseEntry(POST, '<html><body><p>nothing useful</p></body></html>');

  assert.equal(entry, null, 'a partial entry would render an empty card');
});

test('a CSS combinator selector mentioning entry-content is not mistaken for the body', () => {
  // Themes commonly emit ".entry-content > p { ... }" inside an earlier
  // <style> block. A bare substring search for "entry-content" would match
  // that text and hand back CSS as the excerpt instead of the real article.
  const styleBlock = '<style>.entry-content > p { color: red }</style>';
  const withStyle = html.replace('<head>', `<head>${styleBlock}`);
  const entry = parseEntry(POST, withStyle);

  assert.doesNotMatch(entry.excerpt, /color:\s*red/);
  assert.match(entry.excerpt, /Shad Championship/);
});

test('a cookie-wall / interstitial 200 response is rejected, not stored as a report', () => {
  // Built inline rather than touching the fixture: a real cookie-wall page,
  // shaped like the live one that prompted this fix (200 status, no
  // entry-content, a short meta description). No entry-content element
  // exists at all, so the parser must fall through to the meta description
  // -- and then reject it too, because it is far below a real report's
  // length.
  const interstitial = `<html><head>
    <meta name="description" content="Attention Required! Please enable cookies to continue to kingfisher.co.za" />
  </head><body><p>Attention Required! Please enable cookies to continue.</p></body></html>`;

  const entry = parseEntry(POST, interstitial);

  assert.equal(entry, null, 'a short interstitial body should not become a stored entry');
});

test('a genuine short entry-content body still falls back to meta if too short, and meta is checked too', () => {
  const shortBoth = `<html><head>
    <meta name="description" content="Too short to trust as a real report body text here now." />
  </head><body><div class="entry-content">Also short.</div></body></html>`;

  assert.equal(parseEntry(POST, shortBoth), null);
});

test('MIN_EXCERPT_WORDS comfortably clears a one-sentence wall but not a real report', () => {
  assert.ok(MIN_EXCERPT_WORDS < EXCERPT_WORDS);
  assert.ok(MIN_EXCERPT_WORDS >= 15, 'floor should clearly exceed a one-sentence interstitial');
});

test('a post with no usable date_gmt is skipped rather than sorting first as "undefinedZ"', () => {
  const noDate = { ...POST, date_gmt: undefined };
  assert.equal(parseEntry(noDate, html), null);
});

test('a post with an unparseable date_gmt is skipped', () => {
  const badDate = { ...POST, date_gmt: 'not-a-date' };
  assert.equal(parseEntry(badDate, html), null);
});

test('a post already stored is not offered for fetching again', () => {
  const existing = [{ id: 30568 }];
  const posts = [{ id: 30568 }, { id: 30566 }];

  assert.deepEqual(newPosts(posts, existing).map((p) => p.id), [30566]);
});

test('every post is new when nothing has been stored yet', () => {
  assert.deepEqual(newPosts([{ id: 1 }, { id: 2 }], []).map((p) => p.id), [1, 2]);
});

test('merged entries are newest first', () => {
  const older = { id: 1, date: '2026-08-13T14:00:00Z' };
  const newer = { id: 2, date: '2026-08-20T14:00:00Z' };

  assert.deepEqual(mergeEntries([older], [newer]).map((e) => e.id), [2, 1]);
});

test('a re-fetched post replaces the stored copy rather than duplicating it', () => {
  const stored = { id: 1, date: '2026-08-13T14:00:00Z', excerpt: 'old' };
  const fresh = { id: 1, date: '2026-08-13T14:00:00Z', excerpt: 'corrected' };

  const merged = mergeEntries([stored], [fresh]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].excerpt, 'corrected');
});

test('the window is capped so the committed file cannot grow without bound', () => {
  const many = Array.from({ length: MAX_ENTRIES + 4 }, (_, i) => ({
    id: i,
    date: `2026-0${1 + (i % 9)}-01T00:00:00Z`,
  }));

  assert.equal(mergeEntries([], many).length, MAX_ENTRIES);
});
