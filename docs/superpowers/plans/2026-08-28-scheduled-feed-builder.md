# Scheduled Feed Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily GitHub Actions job fetches the Kingfisher weekly KZN fishing report, commits it to the repo as `data/feeds/kingfisher.json`, and the app renders it as a card at the top of the Spots tab.

**Architecture:** A pure module (`tools/feeds/kingfisher.mjs`) holds all the parsing and merging logic with no network and no `fs`, so it is fully unit-testable against a saved fixture of the real page. A thin I/O shell (`tools/build-feeds.mjs`) does the fetching and writing. On the browser side the same split repeats: `js/feed.js` holds the selection logic, `js/ui-feed.js` holds only DOM.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. `node --test` for unit tests. Node 20 `fetch` in Actions. WordPress REST API plus one HTML scrape.

**Spec:** `docs/superpowers/specs/2026-08-28-scheduled-feed-builder-design.md`

## Global Constraints

- **No build step, no bundler, no new dependencies.** Not in the app, and not
  in the workflow either — `tools/` uses Node built-ins and global `fetch` only.
- **No API keys.** Every URL is public and unauthenticated.
- **Excerpts are capped at 50 words.** The reports are Kingfisher's copyright.
  The full `entry-content` text is never written to the JSON, and the card
  always renders the link out.
- **The stored `date` is UTC with a `Z`.** Take it from the REST field
  `date_gmt`, which has no suffix, and append `Z`. Never use the `date` field —
  it is site-local and unmarked.
- **The build never fails the workflow.** Every fetch path exits 0. A red cron
  every day trains you to ignore it.
- **A missing or broken feed renders nothing.** No error banner, no console
  error, forecasts unaffected.
- **`js/config.js` holds every browser-side threshold.** Build-side constants
  live in `tools/feeds/kingfisher.mjs` as named exports so the tests can
  reference them rather than restate them.

---

### Task 1: `tools/feeds/kingfisher.mjs` — parsing and merging

The whole of the logic, with no I/O, tested against a real saved page.

**Files:**
- Create: `tools/feeds/kingfisher.mjs`
- Create: `test/kingfisher.test.mjs`
- Create: `test/fixtures/kingfisher-post.html` (downloaded, not hand-written)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `EXCERPT_WORDS = 50`, `MAX_ENTRIES = 8` — named exports.
  - `parseEntry(post, html) -> entry | null` where `post` is the REST object
    `{ id, date_gmt, link, title: { rendered } }` and `entry` is
    `{ id: number, date: string, title: string, link: string, excerpt: string }`.
  - `mergeEntries(existing, incoming) -> entry[]` — newest first, deduplicated
    by `id`, capped at `MAX_ENTRIES`.
  - `newPosts(posts, existing) -> post[]` — the posts whose `id` is not already
    in `existing`.

- [ ] **Step 1: Save the fixture**

The tests need a real page, not an invented one. Download it:

```bash
mkdir -p test/fixtures
curl -sL -A "Mozilla/5.0" \
  "https://www.kingfisher.co.za/kzn-fishing-report-27-august-2026/" \
  -o test/fixtures/kingfisher-post.html
```

Confirm it is the real thing before going on — the file should be roughly
300 KB and both strings below must be present:

```bash
wc -c test/fixtures/kingfisher-post.html
grep -c "entry-content" test/fixtures/kingfisher-post.html
grep -c "Shad Championship" test/fixtures/kingfisher-post.html
```

Expected: ~300000 bytes, and `1` and `5` respectively.

If the page has been taken down, pick the newest post from
`https://kingfisher.co.za/wp-json/wp/v2/posts?categories=644&per_page=1` and
use its `link` instead, then adjust the asserted strings in Step 2 to match
that page's opening words.

- [ ] **Step 2: Write the failing tests**

Create `test/kingfisher.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCERPT_WORDS, MAX_ENTRIES, parseEntry, mergeEntries, newPosts,
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
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `node --test test/kingfisher.test.mjs`
Expected: FAIL — cannot find module `../tools/feeds/kingfisher.mjs`.

- [ ] **Step 4: Write the implementation**

Create `tools/feeds/kingfisher.mjs`:

```js
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
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `node --test test/kingfisher.test.mjs`
Expected: PASS, 10 tests.

Then run the whole suite to be sure nothing else moved:

Run: `npm test`
Expected: PASS, 175 tests.

- [ ] **Step 6: Commit**

```bash
git add tools/feeds/kingfisher.mjs test/kingfisher.test.mjs test/fixtures/kingfisher-post.html
git commit -m "feat: parse and merge Kingfisher report entries"
```

---

### Task 2: `tools/build-feeds.mjs` — the I/O shell

**Files:**
- Create: `tools/build-feeds.mjs`
- Create: `data/feeds/` (created by the script; nothing to commit by hand)
- Modify: `package.json` — add the `feeds` script

**Interfaces:**
- Consumes: `parseEntry`, `mergeEntries`, `newPosts` from Task 1.
- Produces: `data/feeds/kingfisher.json` in the shape Task 4 reads:
  `{ source, url, builtAt, entries: [...] }`.

- [ ] **Step 1: Write the script**

Create `tools/build-feeds.mjs`:

```js
// Builds data/feeds/*.json. Run by .github/workflows/feeds.yml on a daily
// cron, and by `npm run feeds` locally.
//
// This never exits non-zero on a fetch failure. A cron that goes red every
// time a website hiccups is a cron you stop reading.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEntry, mergeEntries, newPosts } from './feeds/kingfisher.mjs';

const OUT = 'data/feeds/kingfisher.json';
const SITE = 'https://www.kingfisher.co.za/';

// Category 644 is KZN Fishing Reports. per_page=5 is enough to recover if the
// job has been down for a month of weekly reports, and is still one request.
const LIST = 'https://www.kingfisher.co.za/wp-json/wp/v2/posts'
  + '?categories=644&per_page=5&_fields=id,date_gmt,link,title';

// The post pages are served differently without one.
const UA = 'Mozilla/5.0 (compatible; fishing-conditions feed builder)';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(OUT, 'utf8'));
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    // Absent on the first run, and a corrupt file should not stop a rebuild.
    return [];
  }
}

async function main() {
  const existing = await readExisting();

  let posts;
  try {
    posts = await get(LIST).then((r) => r.json());
  } catch (err) {
    console.error(`kingfisher: list fetch failed, leaving ${OUT} untouched: ${err.message}`);
    return;
  }

  const wanted = newPosts(posts, existing);
  console.log(`kingfisher: ${posts.length} listed, ${wanted.length} not yet stored`);

  const fresh = [];
  for (const post of wanted) {
    try {
      const html = await get(post.link).then((r) => r.text());
      const entry = parseEntry(post, html);
      if (entry) fresh.push(entry);
      else console.error(`kingfisher: no usable text in ${post.link}, skipping`);
    } catch (err) {
      console.error(`kingfisher: ${post.link} failed: ${err.message}`);
    }
  }

  if (!fresh.length && existing.length) {
    console.log('kingfisher: nothing new, leaving the file as it is');
    return;
  }

  const entries = mergeEntries(existing, fresh);
  if (!entries.length) {
    console.error('kingfisher: nothing to write');
    return;
  }

  await mkdir('data/feeds', { recursive: true });
  // builtAt is when the job ran; each entry's date is when the report was
  // published. Debugging wants the first, the card wants the second.
  const payload = {
    source: 'kingfisher',
    url: SITE,
    builtAt: new Date().toISOString(),
    entries,
  };
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`kingfisher: wrote ${entries.length} entries to ${OUT}`);
}

main().catch((err) => {
  // Even an unexpected throw stays green. The file is left as it was.
  console.error(`kingfisher: unexpected failure: ${err.message}`);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add `feeds` to `scripts`, after `vendor`:

```json
    "vendor": "node tools/vendor.mjs",
    "feeds": "node tools/build-feeds.mjs",
```

- [ ] **Step 3: Run it for real**

Run: `npm run feeds`
Expected output, roughly:

```
kingfisher: 5 listed, 5 not yet stored
kingfisher: wrote 5 entries to data/feeds/kingfisher.json
```

Then check what it wrote:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const f = JSON.parse(readFileSync('data/feeds/kingfisher.json', 'utf8'));
console.log(f.entries.length);
console.log(f.entries[0]);
"
```

(`--input-type=module` because `package.json` sets `\"type\": \"module\"`.)

Confirm by eye: the newest entry's `date` ends in `Z`, its `link` is a real
kingfisher.co.za URL, and its `excerpt` is prose that ends in `…` — not markup,
not a CSS class name.

- [ ] **Step 4: Check it is idempotent**

Run it a second time: `npm run feeds`
Expected: `kingfisher: 5 listed, 0 not yet stored` then
`kingfisher: nothing new, leaving the file as it is`.

Then confirm git sees no change:

Run: `git status --short data/feeds/`
Expected: no output. This is what keeps the daily cron from committing noise.

- [ ] **Step 5: Check the failure path**

Point the list URL at a host that does not resolve, to prove a dead source is
survivable. Temporarily edit `LIST` in `tools/build-feeds.mjs` to
`https://kingfisher.invalid/wp-json/wp/v2/posts`, then:

Run: `npm run feeds; echo "exit=$?"`
Expected: a `list fetch failed` line, `exit=0`, and `git status --short
data/feeds/` still silent — the existing file untouched.

**Restore the real `LIST` URL before committing.**

- [ ] **Step 6: Commit**

```bash
git add tools/build-feeds.mjs package.json data/feeds/kingfisher.json
git commit -m "feat: build the Kingfisher feed from the report pages"
```

---

### Task 3: `.github/workflows/feeds.yml` — the daily cron

The repository has no `.github/` directory yet; this creates it.

**Files:**
- Create: `.github/workflows/feeds.yml`

**Interfaces:**
- Consumes: `npm run feeds` from Task 2.
- Produces: a committed `data/feeds/kingfisher.json` on the default branch.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/feeds.yml`:

```yaml
name: feeds

on:
  schedule:
    # 02:17 UTC daily. The report lands Thursday afternoon SAST, but polling
    # daily means a late or rescheduled post is still picked up the next day.
    # An odd minute avoids the top-of-hour crush, when GitHub's scheduler
    # queues and runs are delayed.
    - cron: '17 2 * * *'
  workflow_dispatch:

# Needed to push the rebuilt feed back to the default branch.
permissions:
  contents: write

concurrency:
  group: feeds
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # No dependencies to install: the builder uses Node built-ins and the
      # global fetch only.
      - name: Build feeds
        run: npm run feeds

      - name: Commit if the feed changed
        run: |
          # --porcelain rather than `git diff --quiet`, so a first run that
          # creates the file (untracked, invisible to diff) still commits it.
          if [ -z "$(git status --porcelain -- data/feeds)" ]; then
            echo "no feed change"
            exit 0
          fi
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/feeds
          git commit -m "chore: update feeds"
          git push
```

- [ ] **Step 2: Push and run it by hand**

The cron cannot be trusted until a manual run has passed.

```bash
git add .github/workflows/feeds.yml
git commit -m "ci: daily feed build"
git push
gh workflow run feeds
```

Then watch it:

```bash
gh run watch
```

Expected: the job is green. Because Task 2 already committed an up-to-date
file, this first run should log `no feed change` — proof the no-op path works
before a real change is ever attempted.

If `gh` is not installed, use the **Actions** tab on
`https://github.com/kerog10/fishing-conditions` and press **Run workflow**.

- [ ] **Step 3: Prove the commit path**

A run that only ever no-ops has not tested the half that matters. Drop the
oldest entry so the next run has something to write:

```bash
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'data/feeds/kingfisher.json';
const f = JSON.parse(readFileSync(p, 'utf8'));
f.entries = f.entries.slice(0, 2);
writeFileSync(p, JSON.stringify(f, null, 2) + '\n');
"
git add data/feeds/kingfisher.json
git commit -m "chore: trim the feed to test the workflow commit path"
git push
gh workflow run feeds
gh run watch
```

Expected: green, and a new `chore: update feeds` commit authored by
`github-actions[bot]` restoring the missing entries. Confirm with:

```bash
git pull
git log --oneline -2
```

If the push step fails with a permissions error, the repository's
**Settings → Actions → General → Workflow permissions** needs
**Read and write permissions** selected.

- [ ] **Step 4: Commit**

Nothing further to commit — Step 2 committed the workflow. Confirm the tree is
clean:

Run: `git status --short`
Expected: no output.

---

### Task 4: `js/feed.js` — loading and selecting on the browser side

**Files:**
- Create: `js/feed.js`
- Create: `test/feed.test.mjs`
- Modify: `js/config.js` — add the `feed` block

**Interfaces:**
- Consumes: the JSON shape written in Task 2.
- Produces:
  - `CONFIG.feed = { path, maxAgeDays }`.
  - `currentEntry(feed, now = new Date()) -> entry | null` — the newest entry
    if it is inside the staleness window, otherwise `null`.
  - `loadFeed(fetchImpl = fetch) -> Promise<feed | null>` — never rejects.

- [ ] **Step 1: Add the config**

In `js/config.js`, add a `feed` block inside `CONFIG`, after `forecastDays`:

```js
  feed: {
    path: 'data/feeds/kingfisher.json',
    // Past this the card disappears rather than presenting an old report as
    // current. Weekly reports, so three weeks means two have been missed.
    maxAgeDays: 21,
  },
```

- [ ] **Step 2: Write the failing tests**

Create `test/feed.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentEntry, loadFeed } from '../js/feed.js';
import { CONFIG } from '../js/config.js';

const entry = (date, id = 1) => ({
  id,
  date,
  title: `KZN Fishing Report (${date.slice(0, 10)})`,
  link: 'https://www.kingfisher.co.za/report/',
  excerpt: 'Shad continue to dominate catches…',
});

const NOW = new Date('2026-08-28T08:00:00Z');

test('the newest entry is the one shown', () => {
  const feed = { entries: [entry('2026-08-27T14:00:00Z', 2), entry('2026-08-20T14:00:00Z', 1)] };

  assert.equal(currentEntry(feed, NOW).id, 2);
});

test('entries out of order are still resolved newest first', () => {
  // The builder sorts, but the file is committed by a bot and hand-editable.
  const feed = { entries: [entry('2026-08-20T14:00:00Z', 1), entry('2026-08-27T14:00:00Z', 2)] };

  assert.equal(currentEntry(feed, NOW).id, 2);
});

test('a report past the staleness window is not shown as current', () => {
  const feed = { entries: [entry('2026-07-01T14:00:00Z')] };

  assert.equal(currentEntry(feed, NOW), null);
});

test('an entry right on the window is still shown', () => {
  const days = CONFIG.feed.maxAgeDays;
  const at = new Date(NOW.getTime() - (days * 86400000) + 60000).toISOString();

  assert.ok(currentEntry({ entries: [entry(at)] }, NOW));
});

test('a missing feed yields nothing rather than throwing', () => {
  assert.equal(currentEntry(null, NOW), null);
});

test('a feed with no entries yields nothing', () => {
  assert.equal(currentEntry({ entries: [] }, NOW), null);
});

test('an entry with an unparseable date is ignored, not rendered as NaN', () => {
  const feed = { entries: [{ ...entry('2026-08-27T14:00:00Z'), date: 'last Thursday' }] };

  assert.equal(currentEntry(feed, NOW), null);
});

test('an entry missing its link is ignored — the link is the whole point', () => {
  const feed = { entries: [{ ...entry('2026-08-27T14:00:00Z'), link: '' }] };

  assert.equal(currentEntry(feed, NOW), null);
});

test('a 404 on the feed file resolves to null', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });

  assert.equal(await loadFeed(fetchImpl), null);
});

test('a network failure resolves to null rather than rejecting', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };

  assert.equal(await loadFeed(fetchImpl), null);
});

test('malformed JSON resolves to null', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } });

  assert.equal(await loadFeed(fetchImpl), null);
});

test('a good response is returned as-is', async () => {
  const feed = { source: 'kingfisher', entries: [entry('2026-08-27T14:00:00Z')] };
  const fetchImpl = async (url) => {
    assert.equal(url, CONFIG.feed.path);
    return { ok: true, json: async () => feed };
  };

  assert.deepEqual(await loadFeed(fetchImpl), feed);
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `node --test test/feed.test.mjs`
Expected: FAIL — cannot find module `../js/feed.js`.

- [ ] **Step 4: Write the implementation**

Create `js/feed.js`:

```js
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
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `node --test test/feed.test.mjs`
Expected: PASS, 12 tests.

Run: `npm test`
Expected: PASS, 187 tests.

- [ ] **Step 6: Commit**

```bash
git add js/feed.js js/config.js test/feed.test.mjs
git commit -m "feat: load and select the current feed entry"
```

---

### Task 5: `js/ui-feed.js` — render the card and wire it up

**Files:**
- Create: `js/ui-feed.js`
- Modify: `index.html` — a container inside `#panel-spots`
- Modify: `app.css` — the card styles
- Modify: `js/main.js` — import, element, paint, load
- Modify: `sw.js:34` — add the new modules to `SHELL`

**Interfaces:**
- Consumes: `loadFeed`, `currentEntry` from Task 4; `dayLabel` from
  `js/format.js`.
- Produces: `renderFeedCard(target, entry)` — clears `target` and renders
  nothing when `entry` is `null`.

- [ ] **Step 1: Markup**

In `index.html`, inside `<section id="panel-spots" …>`, add the container as
the **first** child, above `<div id="spot-cards" …>`:

```html
  <section id="panel-spots" role="tabpanel" aria-labelledby="tab-spots">
    <section id="feed" class="feed" aria-label="Latest fishing report"></section>
    <div id="spot-cards" class="spot-cards"></div>
```

- [ ] **Step 2: The render module**

Create `js/ui-feed.js`:

```js
// The Kingfisher report card. DOM only -- js/feed.js decides whether there is
// anything to show.
import { dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderFeedCard(target, entry, now = new Date()) {
  target.replaceChildren();
  // No feed, a stale one, or a broken one: the section simply is not there.
  target.hidden = !entry;
  if (!entry) return;

  const card = el('article', 'feed-card');

  const head = el('div', 'feed-head');
  head.appendChild(el('span', 'feed-source', 'Kingfisher report'));
  head.appendChild(el('span', 'feed-date', dayLabel(new Date(entry.date), now)));
  card.appendChild(head);

  card.appendChild(el('h3', 'feed-title', entry.title));
  card.appendChild(el('p', 'feed-excerpt', entry.excerpt));

  // The excerpt is capped at 50 words; the link is how the report is actually
  // read, and it is Kingfisher's to serve.
  const link = el('a', 'feed-link', 'Read the full report on kingfisher.co.za');
  link.href = entry.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  card.appendChild(link);

  target.appendChild(card);
}
```

`dayLabel` reads UTC getters and returns `Today`, `Tomorrow`, or
`Thu 27 Aug` — which is exactly the "report from 27 Aug" phrasing the spec
asks for, using the formatter that already exists.

- [ ] **Step 3: CSS**

Append to `app.css`:

```css
/* Kingfisher report card, top of the Spots tab. */
.feed-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.feed-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.feed-title { margin: 6px 0 4px; font-size: 15px; }
.feed-excerpt { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
.feed-link { font-size: 13px; }
```

If `--panel`, `--line` or `--muted` are not defined in `app.css`, use whatever
the existing `.spot-card` rule uses for its background and border instead —
match the surrounding code rather than introducing new custom properties.

- [ ] **Step 4: Wire it into `main.js`**

Add the imports, alongside the others at the top of `js/main.js`:

```js
import { loadFeed, currentEntry } from './feed.js';
import { renderFeedCard } from './ui-feed.js';
```

Add the element to `els`, next to `spotCards`:

```js
  spotCards: $('spot-cards'),
  feed: $('feed'),
```

Add to `state`, next to `openSlot`:

```js
  feed: null,
```

Add a paint function, immediately above `paintSpotCards`:

```js
function paintFeed() {
  renderFeedCard(els.feed, currentEntry(state.feed), new Date());
}
```

Call it from `paintSpotCards`, as the first line of the function body:

```js
function paintSpotCards() {
  paintFeed();
  const now = new Date();
```

And kick off the load at the bottom of the file, immediately before the
`serviceWorker` registration block:

```js
// Additive context, so it is deliberately not awaited: the forecast paints
// without it and the card appears whenever it arrives.
loadFeed().then((feed) => {
  state.feed = feed;
  paintFeed();
});
```

- [ ] **Step 5: Service worker shell**

In `sw.js`, add the two new modules to `SHELL`, after `'./js/ui-spots-tab.js',`
on line 34:

```js
  './js/ui-spots-tab.js',
  './js/feed.js',
  './js/ui-feed.js',
```

Do **not** add `./data/feeds/kingfisher.json` to `SHELL`. `addAll` rejects
atomically, so listing a file that does not exist yet would break the install
for the whole app. The feed is same-origin, so `networkFirst` already caches it
after the first successful fetch, which is exactly the behaviour wanted.

There is no cache version constant to bump — see the README: the worker is
network-first by design.

- [ ] **Step 6: Browser check**

Run: `npm run serve` and open <http://127.0.0.1:8090>.

Confirm, on the **Spots** tab:

1. The report card is at the top, above the spot cards, with the title, a date
   like `Thu 27 Aug`, the excerpt, and a working link that opens
   kingfisher.co.za in a new tab.
2. The excerpt reads as prose — no `&#8217;`, no stray markup, no CSS class
   names.
3. The console is clean.

Then check the missing-feed path, which matters more than the happy one:

```bash
mv data/feeds/kingfisher.json data/feeds/kingfisher.json.bak
```

Reload. Confirm: **no card, no gap where it was, no console error**, and the
spot cards and forecast table all still work. Then restore it:

```bash
mv data/feeds/kingfisher.json.bak data/feeds/kingfisher.json
```

Finally check the stale path by editing the newest entry's `date` in
`data/feeds/kingfisher.json` to a date more than 21 days before today, reload,
and confirm the card is gone. Restore the real date afterwards with
`git checkout data/feeds/kingfisher.json`.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS, 187 tests. No new tests here — this task is DOM and wiring,
which the project verifies in a browser.

- [ ] **Step 8: Commit**

```bash
git add js/ui-feed.js js/main.js index.html app.css sw.js
git commit -m "feat: show the Kingfisher report card on the Spots tab"
```

---

## Done when

- `npm test` passes with `test/kingfisher.test.mjs` and `test/feed.test.mjs`
  present.
- A `workflow_dispatch` run has gone green, and a second one has demonstrably
  committed a change authored by `github-actions[bot]`.
- The daily cron is enabled and produces no commit on a day with no new report.
- The Spots tab shows the report card, linking out to kingfisher.co.za.
- Deleting `data/feeds/kingfisher.json` leaves the app fully working with no
  card and no console error.
- No stored excerpt runs past 50 words.
