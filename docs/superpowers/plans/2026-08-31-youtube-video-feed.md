# YouTube Video Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recent videos from seven KZN fishing YouTube channels as a second feed source, extracting the pluggable source contract that the scheduled feed builder deferred.

**Architecture:** A source module is a pure state machine over fetch results — `firstRound()` returns requests, `consume(results, existing)` returns entries plus the next round's requests, `merge()` caps the stored window. `tools/build-feeds.mjs` is the only component that fetches or writes, and it loops each source for at most 3 rounds. YouTube uses all three: Atom feeds, then a channel-page scrape for channels whose feed fails, then a watch-page fetch to resolve exact upload dates.

**Tech Stack:** Vanilla ES modules, no build step, **zero dependencies**. `node --test` for tests. Node 20 in GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-youtube-video-feed-design.md`

## Global Constraints

- **Zero runtime and dev dependencies.** `package.json` gains no `dependencies` or `devDependencies` entries. No XML parser, no jsdom, no HTML library — parse with regex and string slicing, as `tools/feeds/kingfisher.mjs` already does.
- **Source modules are pure.** Files under `tools/feeds/` must never `import` from `node:fs`, `node:fs/promises`, or call `fetch`. All I/O lives in `tools/build-feeds.mjs`.
- **The build never exits non-zero on a fetch failure.** `tools/build-feeds.mjs` catches everything and returns. A red daily cron is a cron people stop reading.
- **Never write worse data than is already stored.** If a source produces zero entries this run, leave its JSON file untouched — do not write an empty `entries` array.
- **Neither feed JSON file joins the service worker precache.** `sw.js` uses an atomic `caches.addAll(SHELL)`; a listed-but-missing file breaks install for the whole app. Do not add `data/feeds/*.json` to `SHELL`.
- **`data/feeds/kingfisher.json` keeps its exact current shape.** Fields stay `id`, `date`, `title`, `link`, `excerpt`. The Kingfisher card must be unaffected.
- **Browser-side failures are silent.** A missing or malformed feed file renders nothing — no error banner, no `console.log`, no `console.error`.
- **UTC only.** Use `getUTC*` getters and ISO strings ending in `Z`. Never local-time getters.
- **Stored video dates are always real instants.** Never store a date derived from a relative string like "12 days ago".
- **Every external link renders with `target="_blank"` and `rel="noopener noreferrer"`.**
- **`npm test` must pass at the end of every task.** Run: `npm test`

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/feeds/kingfisher.mjs` | **Modify.** Keep all existing parsing logic verbatim; add `meta`, `firstRound`, `consume`, `merge` wrappers implementing the source contract. |
| `tools/feeds/youtube.mjs` | **Create.** Pure. Channel list, Atom parsing, channel-page scraping, watch-page date extraction, merge. |
| `tools/build-feeds.mjs` | **Modify.** Becomes a generic rounds-loop over a registry of sources. All fetching and file writing. |
| `js/config.js` | **Modify.** Add a `videos` block beside the existing `feed` block. |
| `js/videos.js` | **Create.** Pure browser shaping: load, sort, apply per-channel and total caps. |
| `js/ui-videos.js` | **Create.** DOM only. Renders the list, hides the section when empty. |
| `js/main.js` | **Modify.** Wire the list in beside the existing feed card. |
| `index.html` | **Modify.** Add `<section id="videos">` after `<section id="feed">`. |
| `app.css` | **Modify.** Styles for the video rows. |
| `test/kingfisher.test.mjs` | **Modify.** Add contract tests; existing tests must pass unchanged. |
| `test/youtube.test.mjs` | **Create.** Atom, scrape, watch-date, merge. |
| `test/videos.test.mjs` | **Create.** Browser shaping and caps. |
| `test/ui-videos.test.mjs` | **Create.** DOM rendering against the same stub style as `test/ui-feed.test.mjs`. |
| `test/fixtures/youtube-*.{xml,html}` | **Create.** Real captures. |

`.github/workflows/feeds.yml` needs **no change**: it already runs `node tools/build-feeds.mjs` and commits anything under `data/feeds`. Once the registry includes YouTube, both files are produced by the same step.

---

### Task 1: Extract the source contract

**Files:**
- Modify: `tools/feeds/kingfisher.mjs` (append; change nothing above)
- Modify: `tools/build-feeds.mjs` (rewrite)
- Test: `test/kingfisher.test.mjs` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the source contract every later source implements —
  - `meta: { name: string, url: string, out: string, maxEntries: number }`
  - `firstRound(existing: Entry[]) -> Request[]`
  - `consume(results: Result[], existing: Entry[]) -> { entries: Entry[], next: Request[] }`
  - `merge(existing: Entry[], incoming: Entry[]) -> Entry[]`
  - A `Request` is `{ key: string, url: string, type: 'json' | 'text' }` plus any extra fields the source wants carried through.
  - A `Result` is the request object spread, plus `{ ok: boolean, status: number, body: object | string | null }`. **The shell spreads the request into the result**, so extra fields set on a request (e.g. `post`, `channel`, `video`) are available on the corresponding result.

- [ ] **Step 1: Write the failing contract tests**

Append to `test/kingfisher.test.mjs`. Add `meta`, `firstRound`, `consume` and `merge` to the existing import line at the top of the file:

```javascript
import {
  parseEntry, newPosts, mergeEntries, EXCERPT_WORDS, MAX_ENTRIES,
  meta, firstRound, consume, merge,
} from '../tools/feeds/kingfisher.mjs';
```

Then append these tests to the end of the file:

```javascript
test('meta names the source and its output file', () => {
  assert.equal(meta.name, 'kingfisher');
  assert.equal(meta.out, 'data/feeds/kingfisher.json');
  assert.equal(meta.maxEntries, MAX_ENTRIES);
});

test('the first round is a single JSON request for the category list', () => {
  const requests = firstRound([]);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].type, 'json');
  assert.match(requests[0].url, /categories=644/);
});

test('a failed list round yields no entries and no further requests', () => {
  const results = [{ key: 'list', ok: false, status: 503, body: null }];

  assert.deepEqual(consume(results, []), { entries: [], next: [] });
});

test('the list round requests only posts that are not already stored', () => {
  const posts = [
    { id: 2, link: 'https://example.com/b/', date_gmt: '2026-08-27T14:00:00', title: { rendered: 'B' } },
    { id: 1, link: 'https://example.com/a/', date_gmt: '2026-08-20T14:00:00', title: { rendered: 'A' } },
  ];
  const results = [{ key: 'list', ok: true, status: 200, body: posts }];

  const { entries, next } = consume(results, [{ id: 1 }]);

  assert.deepEqual(entries, []);
  assert.equal(next.length, 1);
  assert.equal(next[0].url, 'https://example.com/b/');
  assert.equal(next[0].type, 'text');
  // The post travels on the request so the second round can parse it.
  assert.equal(next[0].post.id, 2);
});

test('the post round parses bodies into entries and ends the loop', () => {
  const post = {
    id: 2, link: 'https://example.com/b/', date_gmt: '2026-08-27T14:00:00',
    title: { rendered: 'B' },
  };
  const html = `<div class="entry-content"><p>${'word '.repeat(60)}</p></div>`;
  const results = [{ key: 'post:2', ok: true, status: 200, body: html, post }];

  const { entries, next } = consume(results, []);

  assert.deepEqual(next, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 2);
  assert.equal(entries[0].date, '2026-08-27T14:00:00Z');
});

test('a post that failed to fetch is skipped without losing its siblings', () => {
  const good = {
    id: 2, link: 'https://example.com/b/', date_gmt: '2026-08-27T14:00:00',
    title: { rendered: 'B' },
  };
  const html = `<div class="entry-content"><p>${'word '.repeat(60)}</p></div>`;
  const results = [
    { key: 'post:1', ok: false, status: 404, body: null, post: { id: 1 } },
    { key: 'post:2', ok: true, status: 200, body: html, post: good },
  ];

  const { entries } = consume(results, []);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 2);
});

test('merge delegates to mergeEntries and keeps the cap', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: i, date: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));

  assert.equal(merge([], many).length, MAX_ENTRIES);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The new tests error because `meta`, `firstRound`, `consume` and `merge` are not exported from `tools/feeds/kingfisher.mjs` (`SyntaxError: The requested module ... does not provide an export named 'meta'`).

- [ ] **Step 3: Append the contract to the Kingfisher source module**

Append to the **end** of `tools/feeds/kingfisher.mjs`. Change nothing above this point — `parseEntry`, `newPosts`, `mergeEntries` and every constant keep their current bodies:

```javascript
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

export function consume(results, existing) {
  const list = results.find((r) => r.key === 'list');

  // Round one: the REST category list decides which post pages to fetch.
  if (list) {
    if (!list.ok || !Array.isArray(list.body)) return { entries: [], next: [] };
    const next = newPosts(list.body, existing).map((post) => ({
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
    const entry = parseEntry(result.post, result.body);
    if (entry) entries.push(entry);
  }
  return { entries, next: [] };
}

export function merge(existing, incoming) {
  return mergeEntries(existing, incoming);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including every pre-existing Kingfisher test unchanged.

- [ ] **Step 5: Rewrite the build shell as a generic rounds loop**

Replace the **entire contents** of `tools/build-feeds.mjs` with:

```javascript
// Builds data/feeds/*.json. Run by .github/workflows/feeds.yml on a daily
// cron, and by `npm run feeds` locally.
//
// This is the only place in the feed pipeline that touches the network or the
// filesystem. Source modules under tools/feeds/ are pure: they describe the
// requests they want and interpret the results they are handed.
//
// This never exits non-zero on a fetch failure. A cron that goes red every
// time a website hiccups is a cron you stop reading.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as kingfisher from './feeds/kingfisher.mjs';

const SOURCES = [kingfisher];

// Some sites serve differently, or not at all, without one.
const UA = 'Mozilla/5.0 (compatible; fishing-conditions feed builder)';

// A source that keeps asking for more rounds is broken, not thorough.
const MAX_ROUNDS = 3;

async function fetchAll(requests) {
  const results = [];
  // Sequential on purpose: these are other people's servers, and a daily job
  // has no reason to burst.
  for (const request of requests) {
    try {
      const res = await fetch(request.url, { headers: { 'user-agent': UA } });
      const body = res.ok
        ? await (request.type === 'json' ? res.json() : res.text())
        : null;
      results.push({ ...request, ok: res.ok, status: res.status, body });
    } catch (err) {
      // A DNS failure, a reset, or a malformed JSON body all reach the source
      // as an unsuccessful result rather than as a thrown error.
      results.push({ ...request, ok: false, status: 0, body: null });
    }
  }
  return results;
}

async function readExisting(out) {
  try {
    const parsed = JSON.parse(await readFile(out, 'utf8'));
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    // Absent on the first run, and a corrupt file should not stop a rebuild.
    return [];
  }
}

async function runSource(source) {
  const { name, url, out } = source.meta;
  const existing = await readExisting(out);

  const collected = [];
  let requests = source.firstRound(existing);
  for (let round = 0; round < MAX_ROUNDS && requests.length; round += 1) {
    const results = await fetchAll(requests);
    const { entries, next } = source.consume(results, existing);
    collected.push(...entries);
    requests = next ?? [];
  }

  // Nothing new, or nothing that parsed: leave the file exactly as it was, so
  // the workflow's commit guard sees no change.
  if (!collected.length) {
    console.log(`${name}: nothing new, leaving ${out} as it is`);
    return;
  }

  const entries = source.merge(existing, collected);
  if (!entries.length) {
    console.error(`${name}: nothing to write`);
    return;
  }

  await mkdir('data/feeds', { recursive: true });
  // builtAt is when the job ran; each entry's date is when the item was
  // published. Debugging wants the first, the UI wants the second.
  const payload = {
    source: name,
    url,
    builtAt: new Date().toISOString(),
    entries,
  };
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${name}: wrote ${entries.length} entries to ${out}`);
}

async function main() {
  for (const source of SOURCES) {
    try {
      await runSource(source);
    } catch (err) {
      // One broken source must not stop the others.
      console.error(`${source.meta.name}: failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  // Even an unexpected throw stays green. Files are left as they were.
  console.error(`build-feeds: unexpected failure: ${err.message}`);
});
```

- [ ] **Step 6: Verify the refactored builder still produces the same Kingfisher file**

Run: `git stash list && cp data/feeds/kingfisher.json /tmp/kf-before.json && npm run feeds && diff <(node -e "const j=require('./data/feeds/kingfisher.json');console.log(JSON.stringify(j.entries,null,2))") <(node -e "const j=require('/tmp/kf-before.json');console.log(JSON.stringify(j.entries,null,2))") && echo "ENTRIES IDENTICAL"`

Expected: `ENTRIES IDENTICAL`. Only `builtAt` may differ. If the network is unavailable, the run logs `nothing new` and leaves the file untouched — that is also a pass.

Then restore the file so only intended changes are committed:

Run: `git checkout -- data/feeds/kingfisher.json`

- [ ] **Step 7: Commit**

```bash
git add tools/feeds/kingfisher.mjs tools/build-feeds.mjs test/kingfisher.test.mjs
git commit -m "refactor: extract the pluggable feed source contract"
```

---

### Task 2: Capture fixtures and parse YouTube Atom feeds

**Files:**
- Create: `tools/feeds/youtube.mjs`
- Create: `test/youtube.test.mjs`
- Create: `test/fixtures/youtube-feed.xml`, `test/fixtures/youtube-empty.xml`

**Interfaces:**
- Consumes: the source contract from Task 1 (`meta`, `firstRound`, `consume`, `merge`; `Request`/`Result` shapes).
- Produces:
  - `CHANNELS: { name: string, id: string }[]`
  - `MAX_ENTRIES = 40`
  - `parseFeed(xml: string, channel: {name,id}) -> Entry[]`
  - `hasEntries(xml: string) -> boolean`
  - `channelUrl(id) -> string`, `watchUrl(videoId) -> string`
  - An `Entry` is `{ id, channel, channelUrl, title, link, date, description, via }` where `id` is the 11-character video id, `date` is an ISO string ending `Z`, `description` is a string or `null`, and `via` is `'rss'` or `'scrape'`.

- [ ] **Step 1: Capture the Atom feed fixture**

Kents Fishing is the channel measured to have a working feed on 2026-08-31.

Run:
```bash
mkdir -p test/fixtures
curl -sS -o test/fixtures/youtube-feed.xml \
  "https://www.youtube.com/feeds/videos.xml?channel_id=UC1QUL3Z5Ho7_Y0M562eqb8Q"
grep -c "<yt:videoId>" test/fixtures/youtube-feed.xml
```

Expected: `15`. If it prints `0`, retry the curl up to four times — a transient 404 on this endpoint was observed and cleared on retry. If it still fails, use `UCj-869N0wXMADhy_qmlYWBg` (TightLines South Africa), the other channel with a working feed.

Do not hand-edit the captured file.

- [ ] **Step 2: Write the empty-feed fixture**

This is a verbatim capture of a real measured response: a valid, well-formed feed for a real channel with zero entries. Write it exactly as shown to `test/fixtures/youtube-empty.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UChm_aUTJIjsy73g02bByoeA"/>
 <id>yt:channel:hm_aUTJIjsy73g02bByoeA</id>
 <yt:channelId>hm_aUTJIjsy73g02bByoeA</yt:channelId>
 <title>Fishing Unfiltered</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UChm_aUTJIjsy73g02bByoeA"/>
 <author>
  <name>Fishing Unfiltered</name>
  <uri>https://www.youtube.com/channel/UChm_aUTJIjsy73g02bByoeA</uri>
 </author>
 <published>2023-04-30T12:23:30+00:00</published>
</feed>
```

- [ ] **Step 3: Write the failing tests**

Create `test/youtube.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNELS, MAX_ENTRIES, meta, firstRound, parseFeed, hasEntries,
  channelUrl, watchUrl,
} from '../tools/feeds/youtube.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const KENTS = { name: 'Kents Fishing', id: 'UC1QUL3Z5Ho7_Y0M562eqb8Q' };

test('every configured channel has a name and a UC id', () => {
  assert.equal(CHANNELS.length, 7);
  for (const c of CHANNELS) {
    assert.ok(c.name.length, 'channel needs a name');
    assert.match(c.id, /^UC[A-Za-z0-9_-]{22}$/);
  }
});

test('channel ids are unique', () => {
  assert.equal(new Set(CHANNELS.map((c) => c.id)).size, CHANNELS.length);
});

test('meta names the source and its output file', () => {
  assert.equal(meta.name, 'youtube');
  assert.equal(meta.out, 'data/feeds/youtube.json');
  assert.equal(meta.maxEntries, MAX_ENTRIES);
});

test('the first round asks for one feed per channel', () => {
  const requests = firstRound([]);

  assert.equal(requests.length, CHANNELS.length);
  for (const r of requests) {
    assert.equal(r.type, 'text');
    assert.match(r.url, /feeds\/videos\.xml\?channel_id=UC/);
    assert.ok(r.channel, 'the channel travels on the request');
  }
});

test('a real feed parses into entries', () => {
  const entries = parseFeed(fixture('youtube-feed.xml'), KENTS);

  assert.equal(entries.length, 15);
  for (const e of entries) {
    assert.match(e.id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(e.title.length, 'every entry has a title');
    assert.equal(e.link, `https://www.youtube.com/watch?v=${e.id}`);
    assert.equal(e.channel, KENTS.name);
    assert.equal(e.channelUrl, `https://www.youtube.com/channel/${KENTS.id}`);
    assert.ok(Number.isFinite(Date.parse(e.date)), `unparseable date: ${e.date}`);
    assert.match(e.date, /Z$/, 'dates are stored as UTC');
    assert.equal(e.via, 'rss');
  }
});

test('the feed carries full descriptions', () => {
  const entries = parseFeed(fixture('youtube-feed.xml'), KENTS);
  const described = entries.filter((e) => typeof e.description === 'string' && e.description.length);

  // Not every video has a description, but a real channel's feed has several.
  assert.ok(described.length >= 5, `only ${described.length} entries had a description`);
});

test('feed entries are ordered newest first', () => {
  const dates = parseFeed(fixture('youtube-feed.xml'), KENTS).map((e) => Date.parse(e.date));
  const sorted = [...dates].sort((a, b) => b - a);

  assert.deepEqual(dates, sorted);
});

test('XML entities in titles are decoded', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>Women&amp;#39;s Day &amp;amp; the Shad are biting!</title>
    <published>2026-08-09T20:51:44+00:00</published>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS);

  assert.equal(entry.title, "Women's Day & the Shad are biting!");
});

test('a valid feed with no entries yields nothing, and is detectable', () => {
  const xml = fixture('youtube-empty.xml');

  assert.equal(hasEntries(xml), false);
  assert.deepEqual(parseFeed(xml, KENTS), []);
});

test('a real feed is detected as having entries', () => {
  assert.equal(hasEntries(fixture('youtube-feed.xml')), true);
});

test('an entry missing a video id or date is dropped, not stored half-formed', () => {
  const xml = `<feed>
    <entry><title>No id</title><published>2026-08-09T20:51:44+00:00</published></entry>
    <entry><yt:videoId>abcdefghijk</yt:videoId><title>No date</title></entry>
    <entry><yt:videoId>bbcdefghijk</yt:videoId><title>Fine</title><published>2026-08-09T20:51:44+00:00</published></entry>
  </feed>`;

  const entries = parseFeed(xml, KENTS);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Fine');
});

test('url helpers build the documented shapes', () => {
  assert.equal(channelUrl('UC1QUL3Z5Ho7_Y0M562eqb8Q'), 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q');
  assert.equal(watchUrl('abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... tools/feeds/youtube.mjs`.

- [ ] **Step 5: Write the YouTube source module**

Create `tools/feeds/youtube.mjs`:

```javascript
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
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/feeds/youtube.mjs test/youtube.test.mjs test/fixtures/youtube-feed.xml test/fixtures/youtube-empty.xml
git commit -m "feat: parse YouTube Atom feeds into video entries"
```

---

### Task 3: Scrape the channel page for channels with no feed

**Files:**
- Modify: `tools/feeds/youtube.mjs` (append)
- Modify: `test/youtube.test.mjs` (append)
- Create: `test/fixtures/youtube-channel.html`

**Interfaces:**
- Consumes: `CHANNELS`, `channelUrl`, `watchUrl`, `parseFeed`, `hasEntries` from Task 2.
- Produces:
  - `SCRAPE_PER_CHANNEL = 8`
  - `parseChannelPage(html: string, channel: {name,id}) -> Pending[]` where a `Pending` is `{ id, channel, channelUrl, title, link }` — a video with no date yet.
  - `videosUrl(id) -> string`

- [ ] **Step 1: Capture the channel-page fixture**

Pa's Xtreme Fishing was measured on 2026-08-31 to have no feed and a 200 channel page with 31 video records.

Run:
```bash
curl -sSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" \
  -o test/fixtures/youtube-channel.html \
  "https://www.youtube.com/channel/UCh8UMAxna8IRRu2sRV3kDIQ/videos"
grep -o "lockupMetadataViewModel" test/fixtures/youtube-channel.html | wc -l
```

Expected: a number of 20 or more. The browser User-Agent is required — without it the page comes back without the video records. Do not hand-edit the captured file.

- [ ] **Step 2: Write the failing tests**

Append to `test/youtube.test.mjs`. First replace the import at the top of the file with this — it is the complete list for this task:

```javascript
import {
  CHANNELS, MAX_ENTRIES, SCRAPE_PER_CHANNEL, meta, firstRound, consume,
  parseFeed, hasEntries, channelUrl, watchUrl, videosUrl, parseChannelPage,
} from '../tools/feeds/youtube.mjs';
```

Then append:

```javascript
const PAS = { name: "Pa's Xtreme Fishing", id: 'UCh8UMAxna8IRRu2sRV3kDIQ' };

test('the channel page yields pending videos with no date yet', () => {
  const pending = parseChannelPage(fixture('youtube-channel.html'), PAS);

  assert.ok(pending.length >= 20, `only ${pending.length} videos found`);
  for (const p of pending) {
    assert.match(p.id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(p.title.length, 'every pending video has a title');
    assert.equal(p.link, `https://www.youtube.com/watch?v=${p.id}`);
    assert.equal(p.channel, PAS.name);
    assert.equal(p.channelUrl, `https://www.youtube.com/channel/${PAS.id}`);
    // The date is not knowable from this page; round three resolves it.
    assert.equal(p.date, undefined);
  }
});

test('scraped videos are unique', () => {
  const pending = parseChannelPage(fixture('youtube-channel.html'), PAS);

  assert.equal(new Set(pending.map((p) => p.id)).size, pending.length);
});

test('a page with no video records yields nothing rather than throwing', () => {
  assert.deepEqual(parseChannelPage('<html><body>nothing here</body></html>', PAS), []);
});

test('escaped sequences in scraped titles are decoded', () => {
  const html = '"lockupMetadataViewModel":{"title":{"content":"Boat Fishing with Pa \\u0026 Rasto"},'
    + '"image":{"thumbnailViewModel":{}}},"videoId":"abcdefghijk"';

  const [video] = parseChannelPage(html, PAS);

  assert.equal(video.title, 'Boat Fishing with Pa & Rasto');
});

test('videosUrl points at the videos tab', () => {
  assert.equal(videosUrl('UCh8UMAxna8IRRu2sRV3kDIQ'), 'https://www.youtube.com/channel/UCh8UMAxna8IRRu2sRV3kDIQ/videos');
});

test('a working feed produces entries and no scrape request', () => {
  const results = [{
    key: `rss:${KENTS.id}`, ok: true, status: 200,
    body: fixture('youtube-feed.xml'), channel: KENTS,
  }];

  const { entries, next } = consume(results, []);

  assert.equal(entries.length, 15);
  assert.deepEqual(next, []);
});

test('a 404 feed sends that channel to the channel page', () => {
  const results = [{
    key: `rss:${PAS.id}`, ok: false, status: 404, body: null, channel: PAS,
  }];

  const { entries, next } = consume(results, []);

  assert.deepEqual(entries, []);
  assert.equal(next.length, 1);
  assert.equal(next[0].url, videosUrl(PAS.id));
  assert.equal(next[0].channel.id, PAS.id);
});

test('an empty but valid feed also sends that channel to the channel page', () => {
  const results = [{
    key: `rss:${PAS.id}`, ok: true, status: 200,
    body: fixture('youtube-empty.xml'), channel: PAS,
  }];

  const { next } = consume(results, []);

  assert.equal(next.length, 1);
  assert.equal(next[0].url, videosUrl(PAS.id));
});

test('one dead channel does not cost the others their entries', () => {
  const results = [
    { key: `rss:${PAS.id}`, ok: false, status: 404, body: null, channel: PAS },
    { key: `rss:${KENTS.id}`, ok: true, status: 200, body: fixture('youtube-feed.xml'), channel: KENTS },
  ];

  const { entries, next } = consume(results, []);

  assert.equal(entries.length, 15);
  assert.equal(next.length, 1);
});

test('videos already stored are not looked up again', () => {
  const pending = parseChannelPage(fixture('youtube-channel.html'), PAS);
  const existing = pending.slice(0, 3).map((p) => ({ ...p, date: '2026-08-01T00:00:00Z' }));
  const results = [{
    key: `page:${PAS.id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: PAS,
  }];

  const { next } = consume(results, existing);

  const askedFor = new Set(next.map((r) => r.video.id));
  for (const stored of existing) {
    assert.equal(askedFor.has(stored.id), false, `${stored.id} was re-fetched`);
  }
});

test('the channel page round is capped so a first run cannot stampede', () => {
  const results = [{
    key: `page:${PAS.id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: PAS,
  }];

  const { next } = consume(results, []);

  assert.equal(next.length, SCRAPE_PER_CHANNEL);
  for (const r of next) {
    assert.match(r.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.ok(r.video, 'the pending video travels on the request');
  }
});

test('a channel page that failed to fetch is skipped silently', () => {
  const results = [{
    key: `page:${PAS.id}`, ok: false, status: 500, body: null, channel: PAS,
  }];

  assert.deepEqual(consume(results, []), { entries: [], next: [] });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'parseChannelPage'`.

- [ ] **Step 4: Implement the scrape and the first two rounds of consume**

Append to `tools/feeds/youtube.mjs`:

```javascript
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

    // The record's video id follows its title within the same lockup object.
    const after = html.slice(match.index, match.index + 4000);
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

export function consume(results, existing) {
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
        entries.push(...parseFeed(result.body, result.channel));
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

  return { entries: [], next: [] };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/feeds/youtube.mjs test/youtube.test.mjs test/fixtures/youtube-channel.html
git commit -m "feat: scrape the channel page for channels with no Atom feed"
```

---

### Task 4: Resolve exact upload dates and merge the window

**Files:**
- Modify: `tools/feeds/youtube.mjs` (append and edit `consume`)
- Modify: `test/youtube.test.mjs` (append)
- Create: `test/fixtures/youtube-watch.html`

**Interfaces:**
- Consumes: `parseChannelPage`, `consume`, `SCRAPE_PER_CHANNEL`, `MAX_ENTRIES` from Tasks 2-3.
- Produces:
  - `parseUploadDate(html: string) -> string | null` — an ISO string ending `Z`, or `null`.
  - `merge(existing, incoming) -> Entry[]` — deduped by `id`, newest first, capped at `MAX_ENTRIES`.
  - `consume` now handles a third round keyed `watch:<videoId>`.

- [ ] **Step 1: Capture the watch-page fixture**

Run:
```bash
VID=$(grep -o '"videoId":"[A-Za-z0-9_-]\{11\}"' test/fixtures/youtube-channel.html | head -1 | grep -o '[A-Za-z0-9_-]\{11\}"$' | tr -d '"')
echo "capturing $VID"
curl -sSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" \
  -o test/fixtures/youtube-watch.html "https://www.youtube.com/watch?v=$VID"
grep -o '"uploadDate":"[^"]*"' test/fixtures/youtube-watch.html | head -1
```

Expected: a line like `"uploadDate":"2026-08-23T21:43:42-07:00"`. Do not hand-edit the captured file.

- [ ] **Step 2: Write the failing tests**

Append to `test/youtube.test.mjs`. First replace the import at the top of the file
with this — it is the complete list, and nothing further is added to it:

```javascript
import {
  CHANNELS, MAX_ENTRIES, SCRAPE_PER_CHANNEL, meta, firstRound, consume, merge,
  parseFeed, hasEntries, parseUploadDate, channelUrl, watchUrl, videosUrl,
  parseChannelPage,
} from '../tools/feeds/youtube.mjs';
```

Then append:

```javascript
test('the watch page yields an exact UTC timestamp', () => {
  const date = parseUploadDate(fixture('youtube-watch.html'));

  assert.ok(date, 'expected an upload date');
  assert.match(date, /Z$/);
  assert.ok(Number.isFinite(Date.parse(date)));
});

test('an offset upload date is normalised to UTC', () => {
  const html = '{"uploadDate":"2026-08-23T21:43:42-07:00"}';

  assert.equal(parseUploadDate(html), '2026-08-24T04:43:42.000Z');
});

test('a watch page with no upload date yields null rather than a guess', () => {
  assert.equal(parseUploadDate('<html><body>no date here</body></html>'), null);
});

test('an unparseable upload date yields null', () => {
  assert.equal(parseUploadDate('{"uploadDate":"not a date"}'), null);
});

test('the watch round produces dated scrape entries', () => {
  const video = {
    id: 'abcdefghijk',
    channel: "Pa's Xtreme Fishing",
    channelUrl: channelUrl(PAS.id),
    title: 'Monster Garrick at Winklespruit',
    link: watchUrl('abcdefghijk'),
  };
  const results = [{
    key: 'watch:abcdefghijk', ok: true, status: 200,
    body: '{"uploadDate":"2026-08-23T21:43:42-07:00"}', video,
  }];

  const { entries, next } = consume(results, []);

  assert.deepEqual(next, []);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    id: 'abcdefghijk',
    channel: "Pa's Xtreme Fishing",
    channelUrl: channelUrl(PAS.id),
    title: 'Monster Garrick at Winklespruit',
    link: watchUrl('abcdefghijk'),
    date: '2026-08-24T04:43:42.000Z',
    description: null,
    via: 'scrape',
  });
});

test('a video whose date cannot be resolved is dropped, not guessed', () => {
  const video = {
    id: 'abcdefghijk', channel: 'X', channelUrl: channelUrl(PAS.id),
    title: 'T', link: watchUrl('abcdefghijk'),
  };
  const failed = [{ key: 'watch:abcdefghijk', ok: false, status: 404, body: null, video }];
  const dateless = [{ key: 'watch:abcdefghijk', ok: true, status: 200, body: '<html></html>', video }];

  assert.deepEqual(consume(failed, []).entries, []);
  assert.deepEqual(consume(dateless, []).entries, []);
});

test('merge caps the window newest first', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `v${i}`,
    date: new Date(Date.UTC(2026, 0, 1) + (i * 86400000)).toISOString(),
  }));

  const merged = merge([], many);

  assert.equal(merged.length, MAX_ENTRIES);
  assert.equal(merged[0].id, 'v59');
  for (let i = 1; i < merged.length; i += 1) {
    assert.ok(Date.parse(merged[i - 1].date) >= Date.parse(merged[i].date));
  }
});

test('merge never duplicates a video id', () => {
  const existing = [{ id: 'a', date: '2026-08-01T00:00:00Z', title: 'old' }];
  const incoming = [{ id: 'a', date: '2026-08-01T00:00:00Z', title: 'new' }];

  const merged = merge(existing, incoming);

  assert.equal(merged.length, 1);
  // Incoming wins: it is the fresher parse of the same video.
  assert.equal(merged[0].title, 'new');
});

test('merge keeps stored entries that this run did not see', () => {
  const existing = [{ id: 'a', date: '2026-08-01T00:00:00Z' }];
  const incoming = [{ id: 'b', date: '2026-08-02T00:00:00Z' }];

  assert.deepEqual(merge(existing, incoming).map((e) => e.id), ['b', 'a']);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'parseUploadDate'`.

- [ ] **Step 4: Implement the date lookup and the merge**

Append to `tools/feeds/youtube.mjs`:

```javascript
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

export function merge(existing, incoming) {
  // Incoming wins on a clash: it is the fresher parse of the same video.
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const entry of incoming) byId.set(entry.id, entry);

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, MAX_ENTRIES);
}
```

Then add the third round to `consume`. Insert this block **immediately before** the final `return { entries: [], next: [] };` of `consume`:

```javascript
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
      });
    }
    return { entries, next: [] };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/feeds/youtube.mjs test/youtube.test.mjs test/fixtures/youtube-watch.html
git commit -m "feat: resolve exact upload dates and merge the video window"
```

---

### Task 5: Register the source and build the real feed

**Files:**
- Modify: `tools/build-feeds.mjs:8-10` (the import and `SOURCES` lines)
- Create: `data/feeds/youtube.json` (generated, then committed)

**Interfaces:**
- Consumes: the complete YouTube source module from Tasks 2-4, and the rounds loop from Task 1.
- Produces: `data/feeds/youtube.json`, the file `js/videos.js` reads in Task 6.

- [ ] **Step 1: Add YouTube to the registry**

In `tools/build-feeds.mjs`, change the import block and the `SOURCES` constant:

```javascript
import * as kingfisher from './feeds/kingfisher.mjs';
import * as youtube from './feeds/youtube.mjs';

const SOURCES = [kingfisher, youtube];
```

- [ ] **Step 2: Run the builder for real**

Run: `npm run feeds`

Expected: log lines for both sources, ending with something like `youtube: wrote 40 entries to data/feeds/youtube.json`. This first run performs up to 40 watch-page fetches and may take two to four minutes.

- [ ] **Step 3: Verify the generated file against the spec's acceptance criteria**

Run:
```bash
node -e "
const j = require('./data/feeds/youtube.json');
const e = j.entries;
const channels = new Set(e.map(x => x.channel));
const vias = new Set(e.map(x => x.via));
const badDates = e.filter(x => !Number.isFinite(Date.parse(x.date)) || !/Z\$/.test(x.date));
const badIds = e.filter(x => !/^[A-Za-z0-9_-]{11}\$/.test(x.id));
const dupes = e.length - new Set(e.map(x => x.id)).size;
console.log('source      ', j.source);
console.log('entries     ', e.length);
console.log('channels    ', channels.size, [...channels].join(' | '));
console.log('via         ', [...vias].join(' + '));
console.log('bad dates   ', badDates.length);
console.log('bad ids     ', badIds.length);
console.log('duplicates  ', dupes);
console.log('newest      ', e[0].date, '-', e[0].title.slice(0, 60));
"
```

Expected, per the spec's "Done when":
- `source` is `youtube`
- `entries` is greater than 0 and at most 40
- `channels` is at least 5
- `via` contains both `rss` and `scrape`
- `bad dates`, `bad ids` and `duplicates` are all `0`

If `channels` is below 5, re-run `npm run feeds` once — a channel can fail transiently, and the second run picks up whatever the first missed without re-fetching what it already stored.

- [ ] **Step 4: Verify the Kingfisher file was not disturbed**

Run: `git diff --stat data/feeds/kingfisher.json`

Expected: either no output at all, or a change confined to the `builtAt` line. If any `entries` content changed, stop and investigate before committing.

Run: `git checkout -- data/feeds/kingfisher.json`

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/build-feeds.mjs data/feeds/youtube.json
git commit -m "feat: build the YouTube video feed"
```

---

### Task 6: Shape the video list for the browser

**Files:**
- Modify: `js/config.js:8-13` (add a `videos` block after the existing `feed` block)
- Create: `js/videos.js`
- Test: `test/videos.test.mjs`

**Interfaces:**
- Consumes: the stored shape from Task 5 — entries with `id`, `channel`, `channelUrl`, `title`, `link`, `date`, `description`, `via`.
- Produces:
  - `loadVideos(fetchImpl = fetch) -> Promise<object | null>`
  - `pickVideos(feed) -> Entry[]` — newest first, at most `CONFIG.videos.perChannel` per channel, then at most `CONFIG.videos.max` overall.

- [ ] **Step 1: Add the config block**

In `js/config.js`, immediately after the closing `},` of the existing `feed` block, add:

```javascript
  videos: {
    path: 'data/feeds/youtube.json',
    max: 8,
    // Four of the seven channels posted within four days of each other on the
    // day this was designed. Without a per-channel cap one prolific poster
    // takes the whole list.
    perChannel: 2,
  },
```

- [ ] **Step 2: Write the failing tests**

Create `test/videos.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadVideos, pickVideos } from '../js/videos.js';
import { CONFIG } from '../js/config.js';

const video = (id, channel, date) => ({
  id,
  channel,
  channelUrl: 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q',
  title: `Video ${id}`,
  link: `https://www.youtube.com/watch?v=${id}`,
  date,
  description: null,
  via: 'scrape',
});

test('videos are returned newest first', () => {
  const feed = {
    entries: [
      video('aaaaaaaaaaa', 'A', '2026-08-01T00:00:00Z'),
      video('bbbbbbbbbbb', 'B', '2026-08-20T00:00:00Z'),
    ],
  };

  assert.deepEqual(pickVideos(feed).map((v) => v.id), ['bbbbbbbbbbb', 'aaaaaaaaaaa']);
});

test('no more than perChannel videos come from one channel', () => {
  const entries = Array.from({ length: 6 }, (_, i) =>
    video(`aaaaaaaaaa${i}`, 'Loud Channel', `2026-08-2${i}T00:00:00Z`));

  const picked = pickVideos({ entries });

  assert.equal(picked.length, CONFIG.videos.perChannel);
});

test('the per-channel cap keeps a quieter channel on the list', () => {
  const entries = [
    video('aaaaaaaaaa1', 'Loud', '2026-08-28T00:00:00Z'),
    video('aaaaaaaaaa2', 'Loud', '2026-08-27T00:00:00Z'),
    video('aaaaaaaaaa3', 'Loud', '2026-08-26T00:00:00Z'),
    video('bbbbbbbbbb1', 'Quiet', '2026-08-01T00:00:00Z'),
  ];

  const picked = pickVideos({ entries });

  // The Loud channel's third video is displaced even though it is newer.
  assert.deepEqual(picked.map((v) => v.id), ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'bbbbbbbbbb1']);
});

test('the per-channel cap keeps the newest from that channel', () => {
  const entries = [
    video('aaaaaaaaaa1', 'Loud', '2026-08-01T00:00:00Z'),
    video('aaaaaaaaaa2', 'Loud', '2026-08-28T00:00:00Z'),
    video('aaaaaaaaaa3', 'Loud', '2026-08-27T00:00:00Z'),
  ];

  assert.deepEqual(pickVideos({ entries }).map((v) => v.id), ['aaaaaaaaaa2', 'aaaaaaaaaa3']);
});

test('the total cap applies after the per-channel cap', () => {
  const entries = [];
  for (let c = 0; c < 7; c += 1) {
    for (let v = 0; v < 3; v += 1) {
      entries.push(video(`c${c}v${v}aaaaaaa`, `Channel ${c}`, `2026-08-1${v}T00:00:00Z`));
    }
  }

  assert.equal(pickVideos({ entries }).length, CONFIG.videos.max);
});

test('there is no staleness cutoff -- old footage is still useful', () => {
  const entries = [video('aaaaaaaaaaa', 'A', '2024-01-01T00:00:00Z')];

  assert.equal(pickVideos({ entries }).length, 1);
});

test('entries missing a link, title or parseable date are dropped', () => {
  const entries = [
    { ...video('aaaaaaaaaaa', 'A', '2026-08-01T00:00:00Z'), link: undefined },
    { ...video('bbbbbbbbbbb', 'B', '2026-08-01T00:00:00Z'), title: '' },
    { ...video('ccccccccccc', 'C', 'not a date') },
    video('ddddddddddd', 'D', '2026-08-01T00:00:00Z'),
  ];

  assert.deepEqual(pickVideos({ entries }).map((v) => v.id), ['ddddddddddd']);
});

test('a malformed or empty feed yields no rows rather than throwing', () => {
  assert.deepEqual(pickVideos(null), []);
  assert.deepEqual(pickVideos({}), []);
  assert.deepEqual(pickVideos({ entries: 'nonsense' }), []);
  assert.deepEqual(pickVideos({ entries: [] }), []);
});

test('a missing file loads as null instead of throwing', async () => {
  const missing = async () => ({ ok: false, status: 404 });

  assert.equal(await loadVideos(missing), null);
});

test('a malformed file loads as null instead of throwing', async () => {
  const malformed = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } });

  assert.equal(await loadVideos(malformed), null);
});

test('a network failure loads as null instead of throwing', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };

  assert.equal(await loadVideos(offline), null);
});

test('loadVideos reads the configured path', async () => {
  let asked = null;
  const spy = async (url) => {
    asked = url;
    return { ok: true, json: async () => ({ entries: [] }) };
  };

  await loadVideos(spy);

  assert.equal(asked, CONFIG.videos.path);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... js/videos.js`.

- [ ] **Step 4: Write the module**

Create `js/videos.js`:

```javascript
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/videos.js test/videos.test.mjs
git commit -m "feat: shape the recent-videos list for the browser"
```

---

### Task 7: Render the list

**Files:**
- Create: `js/ui-videos.js`
- Create: `test/ui-videos.test.mjs`
- Modify: `index.html:38` (add a section after `<section id="feed">`)
- Modify: `js/main.js` (import, `els` entry, `paintFeed`, the `loadFeed` bootstrap)
- Modify: `app.css` (append video row styles after the `.feed-link` rule)

**Interfaces:**
- Consumes: `pickVideos(feed)` and `loadVideos(fetchImpl)` from Task 6; `dayLabel(date, today)` from `js/format.js`.
- Produces: `renderVideoList(target, videos, now = new Date())`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui-videos.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// js/ui-videos.js is DOM-only and this project takes no dependencies, so
// there is no jsdom to reach for. A minimal stub of the handful of DOM
// primitives the module actually calls is enough under plain node --test.
// This mirrors test/ui-feed.test.mjs.
function makeElement(tag) {
  return {
    tagName: tag,
    className: '',
    textContent: undefined,
    href: undefined,
    target: undefined,
    rel: undefined,
    hidden: false,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren() {
      this.children = [];
    },
  };
}

globalThis.document = { createElement: makeElement };

const { renderVideoList } = await import('../js/ui-videos.js');

const NOW = new Date('2026-08-31T08:00:00Z');

const video = (id, overrides = {}) => ({
  id,
  channel: 'Kents Fishing',
  channelUrl: 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q',
  title: `Video ${id}`,
  link: `https://www.youtube.com/watch?v=${id}`,
  date: '2026-08-30T00:00:00Z',
  description: null,
  via: 'scrape',
  ...overrides,
});

const flatten = (node) => [node, ...node.children.flatMap(flatten)];

test('an empty list hides the section entirely', () => {
  const target = makeElement('section');

  renderVideoList(target, [], NOW);

  assert.equal(target.hidden, true);
  assert.equal(target.children.length, 0);
});

test('a populated list is shown', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa')], NOW);

  assert.equal(target.hidden, false);
  assert.ok(target.children.length > 0);
});

test('every row links out safely', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa')], NOW);

  const links = flatten(target).filter((n) => n.tagName === 'a');
  assert.ok(links.length > 0, 'expected at least one link');
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('the row shows the channel, the title and a date', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa', { title: 'Shad at Umkomaas' })], NOW);

  const texts = flatten(target).map((n) => n.textContent).filter(Boolean);
  assert.ok(texts.includes('Kents Fishing'), `channel missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.includes('Shad at Umkomaas'), `title missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /Aug|Today|Yesterday/.test(t)), `no date in ${JSON.stringify(texts)}`);
});

test('a row whose link is not http is dropped', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa', { link: 'javascript:alert(1)' })], NOW);

  assert.equal(target.hidden, true);
});

test('one unsafe row does not suppress the safe ones', () => {
  const target = makeElement('section');

  renderVideoList(target, [
    video('aaaaaaaaaaa', { link: 'javascript:alert(1)' }),
    video('bbbbbbbbbbb', { title: 'Safe one' }),
  ], NOW);

  assert.equal(target.hidden, false);
  const texts = flatten(target).map((n) => n.textContent).filter(Boolean);
  assert.ok(texts.includes('Safe one'));
});

test('rendering twice does not duplicate rows', () => {
  const target = makeElement('section');
  const list = [video('aaaaaaaaaaa')];

  renderVideoList(target, list, NOW);
  const first = flatten(target).length;
  renderVideoList(target, list, NOW);

  assert.equal(flatten(target).length, first);
});

test('a null list is treated as empty', () => {
  const target = makeElement('section');

  renderVideoList(target, null, NOW);

  assert.equal(target.hidden, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... js/ui-videos.js`.

- [ ] **Step 3: Write the render module**

Create `js/ui-videos.js`:

```javascript
// The recent-videos list. DOM only -- js/videos.js decides what is shown.
import { dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// A row exists to be clicked through to YouTube, so a link that cannot
// safely become an href (a javascript: value, a bare string, anything but
// http/https) drops that row rather than rendering a dead one.
function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function renderVideoList(target, videos, now = new Date()) {
  target.replaceChildren();

  const rows = Array.isArray(videos) ? videos.filter((v) => v && isHttpUrl(v.link)) : [];
  // No videos, a broken file, or nothing but unsafe links: the section simply
  // is not there.
  target.hidden = rows.length === 0;
  if (!rows.length) return;

  target.appendChild(el('h2', 'videos-heading', 'Recent from local anglers'));

  const list = el('ul', 'video-list');
  for (const video of rows) {
    const item = el('li', 'video-row');

    const head = el('div', 'video-head');
    head.appendChild(el('span', 'video-channel', video.channel));
    head.appendChild(el('span', 'video-date', dayLabel(new Date(video.date), now)));
    item.appendChild(head);

    const link = el('a', 'video-title', video.title);
    link.href = video.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.appendChild(link);

    list.appendChild(item);
  }
  target.appendChild(list);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add the container to the page**

In `index.html`, immediately after the line `<section id="feed" class="feed" aria-label="Latest fishing report"></section>`, add:

```html
    <section id="videos" class="videos" aria-label="Recent videos" hidden></section>
```

- [ ] **Step 6: Wire it into the app**

In `js/main.js`, make four edits.

Add to the imports, beside the existing feed imports on lines 18-19:

```javascript
import { loadVideos, pickVideos } from './videos.js';
import { renderVideoList } from './ui-videos.js';
```

Add to the `els` object, after the `feed: $('feed'),` line:

```javascript
  videos: $('videos'),
```

Add to the `state` object, after the `feed: null,` line:

```javascript
  videos: null,
```

Extend `paintFeed` so both pieces of additive context repaint together:

```javascript
function paintFeed() {
  const now = new Date();
  renderFeedCard(els.feed, currentEntry(state.feed), now);
  renderVideoList(els.videos, pickVideos(state.videos), now);
}
```

And beside the existing `loadFeed()` bootstrap near the end of the file, add:

```javascript
// Additive context, so it is deliberately not awaited, exactly like the feed.
loadVideos().then((videos) => {
  state.videos = videos;
  paintFeed();
});
```

- [ ] **Step 7: Style the rows**

Append to `app.css`, after the existing `.feed-link` rule:

```css
.videos { display: block; margin-bottom: 12px; }
.videos[hidden] { display: none; }

.videos-heading {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.video-list { list-style: none; margin: 0; padding: 0; }

.video-row {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.video-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.video-title {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  line-height: 1.4;
}
```

- [ ] **Step 8: Check it in a browser**

Run: `npm run serve`

Open `http://localhost:8090`. On the **Spots** tab, confirm:
1. The Kingfisher card renders as before, unchanged.
2. The video list renders below it, with at most 8 rows and at most 2 per channel.
3. Every title links to YouTube and opens in a new tab.
4. Rename `data/feeds/youtube.json` to `youtube.json.bak`, hard-reload, and confirm the list disappears with no console error and the rest of the app still works. Rename it back.

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add js/ui-videos.js js/main.js index.html app.css test/ui-videos.test.mjs
git commit -m "feat: render the recent-videos list on the Spots tab"
```

---

## Notes for the executor

**Task 5 depends on live network access** and on YouTube's current HTML. If the channel-page shape has changed since 2026-08-31, `parseChannelPage` returns `[]` and the run produces only RSS entries. That is a supported outcome, not a crash — but if `via` contains only `rss`, stop and report it rather than committing a half-populated file: the scrape is the primary path for five of the seven channels, and its silent failure is the main risk this design carries.

**Fixtures are captured, never authored.** The one exception is `test/fixtures/youtube-empty.xml`, which is a verbatim transcription of a measured response and is given in full in Task 2.

**Do not add `data/feeds/youtube.json` to the `SHELL` array in `sw.js`.** The precache is atomic; a listed-but-missing file breaks install for the entire app.

**The spec's first "Done when" bullet asks for a `workflow_dispatch` run**; this
plan builds the file locally with `npm run feeds` instead. That is deliberate:
the remote workflow has never run and GitHub Pages is not yet configured, both
of which are outstanding items from sub-project 2 and out of scope here. The
local run exercises exactly the same code path. Proving the cron on the remote
stays on the sub-project 2 punch list.
