# Hotspot Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match place names in the stored videos and Kingfisher reports against a hand-curated KZN gazetteer at build time, and render a ranked Hotspots list on the Spots tab.

**Architecture:** Matching runs in `tools/`, never in the browser — forced by the copyright rule, since `kingfisher.json` stores only a 50-word excerpt and the report body exists only during the build. A new pure module `tools/feeds/places.mjs` cleans text (stripping hashtags and URLs) and matches it against `data/gazetteer.json`, which the build shell reads once and passes to each source as a third `ctx` argument. Entries arrive in the browser with `marks` and `species` already stamped, so `js/hotspots.js` is pure aggregation over data the app already loads.

**Tech Stack:** Vanilla ES modules, no build step, **zero dependencies**. `node --test` for tests. Node 20 in GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-hotspot-matching-design.md`

## Global Constraints

- **Zero runtime and dev dependencies.** No NLP library, no fuzzy matcher, no geocoder. Word-boundary regex against a curated list, as the rest of `tools/feeds/` already does.
- **Nothing is matched outside the gazetteer.** Place names are never discovered from prose and never geocoded from it. The measured decoys — Foton, Spotify, Apple Pods, Albert Falls Dam, "Foot and Mouth Disease" — must never become marks.
- **`regionTerms` never pin a mark.** "Durban", "KZN", "East Coast" and the coast names may set a region; they can never produce a hotspot row.
- **Hashtags are stripped before matching.** This is the fix for the measured Durban false positive (19 hits, 2 genuinely locational).
- **Source modules stay pure.** Files under `tools/feeds/` never import `node:fs` and never call `fetch`. The gazetteer reaches them as an argument.
- **The Kingfisher excerpt stays capped at 50 words** and no additional report prose is ever stored. Only extracted facts — species lists — are added.
- **A broken gazetteer must not cost the user their feeds.** Missing or malformed means match nothing, log it, and build the feeds anyway.
- **Backward compatible.** Entries stored before this change have no `marks` field; a missing `marks` is treated as `[]`, never as an error. No migration, no forced rebuild.
- **Browser-side failures are silent.** No banner, no `console.log`, no `console.error`.
- **UTC only.** `getUTC*` getters, ISO strings ending in `Z`.
- **Every external link renders with `target="_blank"` and `rel="noopener noreferrer"`.**
- **`npm test` must pass at the end of every task.** Run: `npm test`

---

## File Structure

| File | Responsibility |
|---|---|
| `data/gazetteer.json` | **Create.** Hand-curated KZN marks with regions and aliases, region terms, species synonyms. Data the user edits. |
| `tools/feeds/places.mjs` | **Create.** Pure. Text cleaning, mark matching, species matching, region splitting, unmatched-phrase reporting. |
| `tools/feeds/youtube.mjs` | **Modify.** Stamp `marks` and `species` on entries in both the RSS and scrape paths. |
| `tools/feeds/kingfisher.mjs` | **Modify.** Stamp per-region `species`. Excerpt logic untouched. |
| `tools/build-feeds.mjs` | **Modify.** Read the gazetteer once, pass it as `ctx`, log unmatched phrases. |
| `js/config.js` | **Modify.** Add a `hotspots` block. |
| `js/hotspots.js` | **Create.** Pure. Ranks marks from the two loaded feeds. |
| `js/ui-hotspots.js` | **Create.** DOM only. |
| `js/main.js` | **Modify.** Wire the section in beside the video list. |
| `index.html` | **Modify.** Add `<section id="hotspots">` above `<section id="videos">`. |
| `app.css` | **Modify.** Styles for the hotspot rows. |
| `test/places.test.mjs` | **Create.** Matching, cleaning, decoys. |
| `test/hotspots.test.mjs` | **Create.** Ranking, window, caps. |
| `test/ui-hotspots.test.mjs` | **Create.** DOM stub rendering. |
| `test/kingfisher.test.mjs` | **Modify.** Region splitting; existing tests unchanged. |
| `test/youtube.test.mjs` | **Modify.** Marks stamped on entries; existing tests unchanged. |

`.github/workflows/feeds.yml` needs **no change** — it runs `node tools/build-feeds.mjs` and commits `data/feeds`.

**Note on writing these files:** this repo's Git Bash collapses `\\` inside quoted heredocs, which silently corrupted a regex during 3a (`[\\s\\S]` became `[\s\S]`, which a template literal then reduced to `[sS]`). Write files containing regex escapes with the Write/Edit tools, not `cat <<'EOF'`. Where a regex is built from a template literal, use `String.raw`.

---

### Task 1: The gazetteer and the matcher

**Files:**
- Create: `data/gazetteer.json`
- Create: `tools/feeds/places.mjs`
- Test: `test/places.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `loadGazetteer(raw: object|null) -> Gazetteer|null` — validates; returns `null` on anything malformed.
  - `cleanText(s: string) -> string` — URLs and hashtags stripped, entities decoded, whitespace collapsed.
  - `findMarks(gz, { title, body }) -> Mark[]` where `Mark` is `{ name, region, where }` and `where` is `'title'|'body'`.
  - `findSpecies(gz, text) -> string[]` — canonical names, deduped, sorted.
  - `findRegion(gz, text) -> 'north'|'central'|'south'|null`.
  - `splitRegions(gz, body) -> { [region]: { species: string[] } }`.
  - `unmatchedPhrases(gz, text) -> { phrase, count }[]` — capitalised candidates that matched nothing.

- [ ] **Step 1: Write the gazetteer**

Create `data/gazetteer.json`. Region boundaries follow Kingfisher's own usage: **central** is the Durban metro stretch (Glen Ashley through uShaka and the Bluff), **north** is Umhlanga upward, **south** is Amanzimtoti downward.

```json
{
  "regions": {
    "north": "North Coast",
    "central": "Central Coast",
    "south": "South Coast"
  },
  "regionTerms": [
    "Durban", "KZN", "KwaZulu-Natal", "KwaZulu Natal", "Natal",
    "East Coast", "North Coast", "Central Coast", "South Coast",
    "South Africa", "Upper South Coast", "Lower South Coast"
  ],
  "marks": [
    { "name": "Zinkwazi", "region": "north", "aliases": [] },
    { "name": "Blythedale", "region": "north", "aliases": [] },
    { "name": "Salt Rock", "region": "north", "aliases": [] },
    { "name": "Sheffield Beach", "region": "north", "aliases": [] },
    { "name": "Ballito", "region": "north", "aliases": [] },
    { "name": "Tinley Manor", "region": "north", "aliases": [] },
    { "name": "Westbrook", "region": "north", "aliases": [] },
    { "name": "Tongaat", "region": "north", "aliases": ["Tongaat Beach"] },
    { "name": "La Mercy", "region": "north", "aliases": [] },
    { "name": "Umdloti", "region": "north", "aliases": [] },
    { "name": "Umhlanga", "region": "north", "aliases": ["Umhlanga Rocks"] },

    { "name": "Glen Ashley", "region": "central", "aliases": [] },
    { "name": "Virginia Beach", "region": "central", "aliases": [] },
    { "name": "Beachwood", "region": "central", "aliases": [] },
    { "name": "Blue Lagoon", "region": "central", "aliases": [] },
    { "name": "Umgeni Mouth", "region": "central", "aliases": ["Umgeni"] },
    { "name": "North Pier", "region": "central", "aliases": [] },
    { "name": "South Pier", "region": "central", "aliases": ["Durban South Pier"] },
    { "name": "uShaka", "region": "central", "aliases": [] },
    { "name": "Vetch's Pier", "region": "central", "aliases": ["Vetches", "Vetchies"] },
    { "name": "Addington", "region": "central", "aliases": [] },
    { "name": "The Bluff", "region": "central", "aliases": ["Bluff"] },
    { "name": "Cave Rock", "region": "central", "aliases": [] },
    { "name": "Brighton Beach", "region": "central", "aliases": [] },
    { "name": "Anstey's Beach", "region": "central", "aliases": ["Ansteys", "Anstey"] },
    { "name": "Treasure Beach", "region": "central", "aliases": [] },
    { "name": "Isipingo", "region": "central", "aliases": [] },
    { "name": "Reunion Beach", "region": "central", "aliases": [] },

    { "name": "Amanzimtoti", "region": "south", "aliases": ["Toti"] },
    { "name": "Warner Beach", "region": "south", "aliases": [] },
    { "name": "Winklespruit", "region": "south", "aliases": [] },
    { "name": "Illovo Beach", "region": "south", "aliases": ["Illovo"] },
    { "name": "Karridene", "region": "south", "aliases": [] },
    { "name": "Umgababa", "region": "south", "aliases": [] },
    { "name": "Clansthal", "region": "south", "aliases": [] },
    { "name": "Umkomaas", "region": "south", "aliases": [] },
    { "name": "Aliwal Shoal", "region": "south", "aliases": ["Aliwal"] },
    { "name": "Scottburgh", "region": "south", "aliases": [] },
    { "name": "Park Rynie", "region": "south", "aliases": [] },
    { "name": "Pennington", "region": "south", "aliases": [] },
    { "name": "Sezela", "region": "south", "aliases": [] },
    { "name": "Ifafa", "region": "south", "aliases": ["Ifafa Beach"] },
    { "name": "Mtwalume", "region": "south", "aliases": [] },
    { "name": "Hibberdene", "region": "south", "aliases": [] },
    { "name": "Umzumbe", "region": "south", "aliases": [] },
    { "name": "Banana Beach", "region": "south", "aliases": [] },
    { "name": "Port Shepstone", "region": "south", "aliases": [] },
    { "name": "Shelly Beach", "region": "south", "aliases": [] },
    { "name": "Uvongo", "region": "south", "aliases": [] },
    { "name": "Margate", "region": "south", "aliases": [] },
    { "name": "Ramsgate", "region": "south", "aliases": [] },
    { "name": "Southbroom", "region": "south", "aliases": [] },
    { "name": "Trafalgar", "region": "south", "aliases": [] },
    { "name": "Palm Beach", "region": "south", "aliases": [] },
    { "name": "Port Edward", "region": "south", "aliases": [] }
  ],
  "species": [
    { "name": "Shad", "aliases": ["Elf"] },
    { "name": "Garrick", "aliases": ["Leervis"] },
    { "name": "Kob", "aliases": ["Kabeljou"] },
    { "name": "Grunter", "aliases": [] },
    { "name": "Stumpnose", "aliases": [] },
    { "name": "Bronze Bream", "aliases": [] },
    { "name": "Blacktail", "aliases": [] },
    { "name": "Musselcracker", "aliases": ["Brusher"] },
    { "name": "Stone Bream", "aliases": [] },
    { "name": "Rockcod", "aliases": [] },
    { "name": "Sardine", "aliases": ["Sardines"] },
    { "name": "Snoek", "aliases": [] },
    { "name": "Couta", "aliases": ["Cuta", "King Mackerel"] },
    { "name": "Tuna", "aliases": [] },
    { "name": "Bonito", "aliases": [] },
    { "name": "Kingfish", "aliases": [] },
    { "name": "Queenfish", "aliases": [] },
    { "name": "Pompano", "aliases": ["Wave Garrick"] },
    { "name": "Sandshark", "aliases": [] },
    { "name": "Barbel", "aliases": [] },
    { "name": "Cave Bass", "aliases": [] }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/places.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadGazetteer, cleanText, findMarks, findSpecies, findRegion,
  splitRegions, unmatchedPhrases,
} from '../tools/feeds/places.mjs';

const raw = JSON.parse(readFileSync(new URL('../data/gazetteer.json', import.meta.url), 'utf8'));
const GZ = loadGazetteer(raw);

test('the shipped gazetteer loads', () => {
  assert.ok(GZ, 'gazetteer failed to load');
  assert.ok(GZ.marks.length >= 40, `only ${GZ.marks.length} marks`);
});

test('every mark has a known region', () => {
  for (const m of GZ.marks) {
    assert.ok(['north', 'central', 'south'].includes(m.region), `${m.name}: ${m.region}`);
  }
});

test('mark names and aliases are unique across the gazetteer', () => {
  const seen = new Set();
  for (const m of GZ.marks) {
    for (const term of [m.name, ...m.aliases]) {
      const key = term.toLowerCase();
      assert.equal(seen.has(key), false, `duplicate term: ${term}`);
      seen.add(key);
    }
  }
});

test('no mark is also a region term', () => {
  const regionTerms = new Set(GZ.regionTerms.map((t) => t.toLowerCase()));
  for (const m of GZ.marks) {
    assert.equal(regionTerms.has(m.name.toLowerCase()), false, `${m.name} is both`);
  }
});

test('a malformed gazetteer loads as null rather than throwing', () => {
  assert.equal(loadGazetteer(null), null);
  assert.equal(loadGazetteer({}), null);
  assert.equal(loadGazetteer({ marks: 'nonsense' }), null);
  assert.equal(loadGazetteer({ marks: [] }), null);
});

test('hashtags are stripped before matching', () => {
  const cleaned = cleanText('Great session #Durban #KZNFishing #Umkomaas');

  assert.equal(/#/.test(cleaned), false);
  assert.equal(/Durban/i.test(cleaned), false);
  assert.equal(/Umkomaas/i.test(cleaned), false);
});

test('urls are stripped before matching', () => {
  const cleaned = cleanText('Watch https://youtu.be/Umkomaas-abc and subscribe');

  assert.equal(/youtu\.be/.test(cleaned), false);
});

test('a place named only in a hashtag yields no mark', () => {
  const marks = findMarks(GZ, { title: 'Big session', body: '#Umkomaas #Durban' });

  assert.deepEqual(marks, []);
});

test('a mark matches on its name', () => {
  const marks = findMarks(GZ, { title: 'Shad at Umkomaas today', body: '' });

  assert.equal(marks.length, 1);
  assert.equal(marks[0].name, 'Umkomaas');
  assert.equal(marks[0].region, 'south');
  assert.equal(marks[0].where, 'title');
});

test('a mark matches on an alias and reports its canonical name', () => {
  const marks = findMarks(GZ, { title: 'Fishing at Toti', body: '' });

  assert.equal(marks[0].name, 'Amanzimtoti');
});

test('matching is case insensitive', () => {
  assert.equal(findMarks(GZ, { title: 'UMKOMAAS BEACH', body: '' })[0].name, 'Umkomaas');
});

test('word boundaries hold: Toti does not fire inside Amanzimtoti', () => {
  const marks = findMarks(GZ, { title: 'A day at Amanzimtoti', body: '' });

  assert.equal(marks.length, 1);
  assert.equal(marks[0].name, 'Amanzimtoti');
});

test('a title match is preferred over the same mark in the body', () => {
  const marks = findMarks(GZ, { title: 'Umkomaas session', body: 'we fished Umkomaas all day' });

  assert.equal(marks.length, 1);
  assert.equal(marks[0].where, 'title');
});

test('a body-only match is recorded as body', () => {
  const marks = findMarks(GZ, { title: 'Great day out', body: 'We fished Scottburgh' });

  assert.equal(marks[0].where, 'body');
});

test('several marks in one entry are all returned', () => {
  const marks = findMarks(GZ, { title: 'From Toti down to Scottburgh', body: '' });

  assert.deepEqual(marks.map((m) => m.name).sort(), ['Amanzimtoti', 'Scottburgh']);
});

test('a region term never becomes a mark', () => {
  for (const term of GZ.regionTerms) {
    const marks = findMarks(GZ, { title: `Fishing in ${term} today`, body: '' });
    assert.deepEqual(marks, [], `${term} produced a mark`);
  }
});

test('the measured decoys never become marks', () => {
  const decoys = [
    'Foton', 'Spotify', 'Apple Pods', 'Google Pods', 'Deezer', 'Facebook',
    'Albert Falls Dam', 'Midmar', 'Inanda', 'Mearns Dam', 'Kamberg Road',
    'Connington Road', 'Foot and Mouth Disease', 'Previous Next', 'Nino',
  ];

  for (const decoy of decoys) {
    const marks = findMarks(GZ, { title: `Report mentions ${decoy} this week`, body: '' });
    assert.deepEqual(marks, [], `${decoy} produced a mark`);
  }
});

test('a null gazetteer yields no marks rather than throwing', () => {
  assert.deepEqual(findMarks(null, { title: 'Umkomaas', body: '' }), []);
  assert.deepEqual(findSpecies(null, 'Shad'), []);
  assert.equal(findRegion(null, 'Durban'), null);
});

test('species match, with synonyms folded to the canonical name', () => {
  assert.deepEqual(findSpecies(GZ, 'Caught elf and leervis'), ['Garrick', 'Shad']);
});

test('species matching respects word boundaries', () => {
  assert.deepEqual(findSpecies(GZ, 'Kobus went fishing'), []);
});

test('species are deduplicated', () => {
  assert.deepEqual(findSpecies(GZ, 'Shad, more shad, and elf'), ['Shad']);
});

test('a region term sets a region without pinning a mark', () => {
  assert.equal(findRegion(GZ, 'Fishing the South Coast'), 'south');
  assert.equal(findRegion(GZ, 'A day in Durban'), 'central');
  assert.equal(findRegion(GZ, 'Nothing relevant here'), null);
});

test('a mark implies its own region', () => {
  assert.equal(findRegion(GZ, 'Fishing at Ballito'), 'north');
});

test('a Kingfisher body splits into regions with species per region', () => {
  const body = 'Rock and Surf: general notes. '
    + 'North Coast The north has produced garrick this week. '
    + 'Central Coast Shad continue to dominate from Glen Ashley through to uShaka. '
    + 'South Coast Kob and grunter have shown up well.';

  const regions = splitRegions(GZ, body);

  assert.deepEqual(regions.north.species, ['Garrick']);
  assert.deepEqual(regions.central.species, ['Shad']);
  assert.deepEqual(regions.south.species, ['Grunter', 'Kob']);
});

test('a body with no coast headings yields no regions', () => {
  assert.deepEqual(splitRegions(GZ, 'Just some text about fishing and shad.'), {});
});

test('region splitting does not bleed species across sections', () => {
  const body = 'North Coast Only snoek here. South Coast Only tuna here.';

  const regions = splitRegions(GZ, body);

  assert.deepEqual(regions.north.species, ['Snoek']);
  assert.deepEqual(regions.south.species, ['Tuna']);
});

test('unmatched capitalised phrases are reported for gazetteer growth', () => {
  const found = unmatchedPhrases(GZ, 'We fished Umkomaas with Foton and visited Nowhereville');
  const phrases = found.map((f) => f.phrase);

  assert.equal(phrases.includes('Umkomaas'), false, 'a known mark is not unmatched');
  assert.ok(phrases.includes('Nowhereville'), `expected Nowhereville in ${JSON.stringify(phrases)}`);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... tools/feeds/places.mjs`.

- [ ] **Step 4: Write the matcher**

Create `tools/feeds/places.mjs` with the Write tool, not a heredoc — it is dense with regex escapes.

```javascript
// Place and species matching for the feed builder. Pure: no network, no fs.
// tools/build-feeds.mjs reads data/gazetteer.json and passes it in.
//
// Everything here matches against a curated list and never discovers names
// from prose. Measured 2026-08-31, the most frequent capitalised phrases in
// five Kingfisher reports included Foton, Spotify, Apple Pods, a podcast
// host's name and "Foot and Mouth Disease" -- 117 candidates, the large
// majority worthless. Discovery would produce confident wrong pins.

const REGIONS = ['north', 'central', 'south'];

export function loadGazetteer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.marks) || !raw.marks.length) return null;

  const marks = raw.marks.filter(
    (m) => m && typeof m.name === 'string' && REGIONS.includes(m.region),
  ).map((m) => ({
    name: m.name,
    region: m.region,
    aliases: Array.isArray(m.aliases) ? m.aliases.filter((a) => typeof a === 'string') : [],
  }));
  if (!marks.length) return null;

  const species = Array.isArray(raw.species)
    ? raw.species.filter((s) => s && typeof s.name === 'string').map((s) => ({
      name: s.name,
      aliases: Array.isArray(s.aliases) ? s.aliases.filter((a) => typeof a === 'string') : [],
    }))
    : [];

  return {
    regions: raw.regions ?? {},
    regionTerms: Array.isArray(raw.regionTerms) ? raw.regionTerms : [],
    marks,
    species,
  };
}

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

// Hashtags are the single biggest source of false positives. Measured: of 19
// "Durban" occurrences across the stored videos, 17 were inside hashtag
// blocks like "#Durban #KZNFishing #Angler". Strip them and the noise goes.
export function cleanText(s) {
  if (typeof s !== 'string') return '';
  return decode(s)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Regex-special characters in a gazetteer entry would otherwise change the
// pattern's meaning -- "Anstey's Beach" and "Vetch's Pier" both carry one.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Word boundaries only, so "Toti" cannot fire inside "Amanzimtoti".
function mentions(text, term) {
  return new RegExp(String.raw`\b${escapeRe(term)}\b`, 'i').test(text);
}

function matchesAny(text, entry) {
  return [entry.name, ...entry.aliases].some((term) => mentions(text, term));
}

export function findMarks(gz, { title = '', body = '' } = {}) {
  if (!gz) return [];
  const cleanTitle = cleanText(title);
  const cleanBody = cleanText(body);

  const found = [];
  for (const mark of gz.marks) {
    // Title first: a title says what the video is about, a description says
    // what the channel is about. The stronger position wins and the mark is
    // recorded once.
    if (matchesAny(cleanTitle, mark)) {
      found.push({ name: mark.name, region: mark.region, where: 'title' });
    } else if (matchesAny(cleanBody, mark)) {
      found.push({ name: mark.name, region: mark.region, where: 'body' });
    }
  }
  return found;
}

export function findSpecies(gz, text) {
  if (!gz) return [];
  const clean = cleanText(text);
  const names = gz.species
    .filter((s) => matchesAny(clean, s))
    .map((s) => s.name);
  return [...new Set(names)].sort();
}

// A region is coarser than a mark and is allowed to come from a region term.
// It is never enough to rank a hotspot -- only marks do that.
export function findRegion(gz, text) {
  if (!gz) return null;
  const clean = cleanText(text);

  for (const mark of gz.marks) {
    if (matchesAny(clean, mark)) return mark.region;
  }
  for (const [key, label] of Object.entries(gz.regions)) {
    if (mentions(clean, label)) return key;
  }
  // "Durban" is a region term, not a mark, so it lands here and can colour a
  // region without ever producing a hotspot row.
  if (mentions(clean, 'Durban')) return 'central';
  return null;
}

// The Kingfisher reports are written per coast section. Measured across five
// live reports, the headings are present in essentially every one and the
// body splits cleanly on them.
export function splitRegions(gz, body) {
  if (!gz) return {};
  const clean = cleanText(body);

  const marks = Object.entries(gz.regions)
    .map(([key, label]) => ({ key, label, at: clean.search(new RegExp(String.raw`\b${escapeRe(label)}\b`, 'i')) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (!marks.length) return {};

  const out = {};
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].at;
    const end = i + 1 < marks.length ? marks[i + 1].at : clean.length;
    out[marks[i].key] = { species: findSpecies(gz, clean.slice(start, end)) };
  }
  return out;
}

// Everything capitalised that the gazetteer did not recognise. Logged by the
// build so the gazetteer grows from evidence rather than guesswork.
const CANDIDATE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g;

export function unmatchedPhrases(gz, text) {
  if (!gz) return [];
  const clean = cleanText(text);

  const known = new Set();
  for (const m of gz.marks) for (const t of [m.name, ...m.aliases]) known.add(t.toLowerCase());
  for (const s of gz.species) for (const t of [s.name, ...s.aliases]) known.add(t.toLowerCase());
  for (const t of gz.regionTerms) known.add(t.toLowerCase());

  const counts = new Map();
  for (const match of clean.matchAll(CANDIDATE)) {
    const phrase = match[1];
    const key = phrase.toLowerCase();
    if (known.has(key)) continue;
    // A phrase whose first word is already known is usually a known term with
    // a suffix ("Umkomaas Beach"), not a new place.
    if (known.has(key.split(' ')[0])) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

If `the shipped gazetteer loads` fails on mark count, the JSON in Step 1 was
truncated on the way in — it holds **55 marks**: 11 north, 17 central, 27 south.

- [ ] **Step 6: Commit**

```bash
git add data/gazetteer.json tools/feeds/places.mjs test/places.test.mjs
git commit -m "feat: KZN gazetteer and the place matcher"
```

---

### Task 2: Stamp marks onto the stored feeds

**Files:**
- Modify: `tools/feeds/youtube.mjs`
- Modify: `tools/feeds/kingfisher.mjs`
- Modify: `tools/build-feeds.mjs`
- Test: `test/youtube.test.mjs`, `test/kingfisher.test.mjs`

**Interfaces:**
- Consumes: every export of `tools/feeds/places.mjs` from Task 1.
- Produces:
  - The source contract's third argument: `firstRound(existing, ctx)` and `consume(results, existing, ctx)`, where `ctx` is `{ gazetteer }` and `gazetteer` may be `null`.
  - YouTube entries gain `marks: Mark[]` and `species: string[]`.
  - Kingfisher entries gain `regions: { [region]: { species: string[] } }`.
  - `parseEntry(post, html, gz)` — third argument optional; omitted means no regions.

- [ ] **Step 1: Fix the one existing test that asserts an exact entry shape**

`test/youtube.test.mjs` has a test — `the watch round produces dated scrape
entries` — that deep-equals the whole entry object. Adding `marks` and
`species` to scraped entries breaks it. This is expected, not a regression:
update its expectation to the new shape. It calls `consume(results, [])`
with no `ctx`, so the gazetteer is `null` and both fields are empty.

Change the assertion's object literal to end:

```javascript
    date: '2026-08-24T04:43:42.000Z',
    description: null,
    via: 'scrape',
    marks: [],
    species: [],
  });
```

`test/kingfisher.test.mjs` needs no equivalent fix — it asserts individual
fields, never a whole entry, so gaining `regions` does not disturb it.

- [ ] **Step 2: Write the failing tests**

Append to `test/youtube.test.mjs`. Add `loadGazetteer` and the gazetteer fixture near the top, after the existing `fixture` helper:

```javascript
import { loadGazetteer } from '../tools/feeds/places.mjs';

const GZ = loadGazetteer(JSON.parse(
  readFileSync(new URL('../data/gazetteer.json', import.meta.url), 'utf8'),
));
const CTX = { gazetteer: GZ };
```

Then append these tests:

```javascript
test('rss entries are stamped with marks and species', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>Massive Shad at Umkomaas Beach</title>
    <published>2026-08-09T20:51:44+00:00</published>
    <media:description>A great day out. #Durban #KZNFishing</media:description>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS, GZ);

  assert.deepEqual(entry.marks, [{ name: 'Umkomaas', region: 'south', where: 'title' }]);
  assert.deepEqual(entry.species, ['Shad']);
});

test('a hashtag-only place does not become a mark on a stored entry', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>A good session</title>
    <published>2026-08-09T20:51:44+00:00</published>
    <media:description>Great day. #Durban #Umkomaas #Fishing</media:description>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS, GZ);

  assert.deepEqual(entry.marks, []);
});

test('entries parse with no gazetteer and store empty marks', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>Shad at Umkomaas</title>
    <published>2026-08-09T20:51:44+00:00</published>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS, null);

  assert.deepEqual(entry.marks, []);
  assert.deepEqual(entry.species, []);
});

test('scraped entries are stamped from the title alone', () => {
  const video = {
    id: 'abcdefghijk', channel: "Pa's Xtreme Fishing", channelUrl: channelUrl(PAS.id),
    title: 'Monster Garrick at Winklespruit', link: watchUrl('abcdefghijk'),
  };
  const results = [{
    key: 'watch:abcdefghijk', ok: true, status: 200,
    body: '{"uploadDate":"2026-08-23T21:43:42-07:00"}', video,
  }];

  const { entries } = consume(results, [], CTX);

  assert.deepEqual(entries[0].marks, [{ name: 'Winklespruit', region: 'south', where: 'title' }]);
  assert.deepEqual(entries[0].species, ['Garrick']);
});

test('the real feed fixture yields at least one mark', () => {
  const entries = parseFeed(fixture('youtube-feed.xml'), KENTS, GZ);
  const withMarks = entries.filter((e) => e.marks.length);

  assert.ok(withMarks.length >= 1, 'expected at least one mark in the real feed');
});
```

Append to `test/kingfisher.test.mjs`, adding the gazetteer alongside the existing imports:

```javascript
import { loadGazetteer } from '../tools/feeds/places.mjs';

const GZ = loadGazetteer(JSON.parse(
  readFileSync(new URL('../data/gazetteer.json', import.meta.url), 'utf8'),
));
```

Then append:

```javascript
test('the real report fixture splits into regions with species', () => {
  const entry = parseEntry(POST, html, GZ);

  assert.ok(entry.regions, 'expected regions on the entry');
  const keys = Object.keys(entry.regions);
  assert.ok(keys.length >= 2, `only ${keys.length} regions found: ${keys}`);
  for (const key of keys) {
    assert.ok(Array.isArray(entry.regions[key].species), `${key} has no species array`);
  }
});

test('the excerpt is untouched by region extraction', () => {
  const withGz = parseEntry(POST, html, GZ);
  const without = parseEntry(POST, html);

  assert.equal(withGz.excerpt, without.excerpt);
  assert.ok(withGz.excerpt.split(/\s+/).length <= EXCERPT_WORDS + 1);
});

test('parsing without a gazetteer stores no regions', () => {
  assert.deepEqual(parseEntry(POST, html).regions, {});
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parseFeed` ignores its third argument, so `entry.marks` is `undefined`.

- [ ] **Step 4: Stamp the YouTube entries**

In `tools/feeds/youtube.mjs`, add the import at the top, below the existing header comment:

```javascript
import { findMarks, findSpecies } from './places.mjs';
```

Change `parseFeed` to take the gazetteer and stamp each entry. Replace its signature and the `entries.push({...})` block:

```javascript
export function parseFeed(xml, channel, gz = null) {
```

```javascript
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
```

Change `consume` to accept and use `ctx`. Replace its signature:

```javascript
export function consume(results, existing, ctx = {}) {
  const gz = ctx.gazetteer ?? null;
  const stored = new Set(existing.map((e) => e.id));
```

In round one, pass the gazetteer through:

```javascript
        entries.push(...parseFeed(result.body, result.channel, gz));
```

In round three, stamp the scraped entry. The channel page carries no
description, so the title is the only text available:

```javascript
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
```

- [ ] **Step 5: Stamp the Kingfisher entries**

In `tools/feeds/kingfisher.mjs`, add the import below the header comment:

```javascript
import { splitRegions } from './places.mjs';
```

Change `parseEntry` to take the gazetteer and attach regions. The body is
already extracted for the excerpt; regions come from the same text, so this
costs no extra parsing and stores no extra prose:

```javascript
export function parseEntry(post, html, gz = null) {
  const body = bodyText(html);
  const source = longEnough(body) ? body : metaText(html);
  const excerpt = longEnough(source) ? excerptOf(source) : '';
  if (!excerpt) return null;

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
```

Pass the gazetteer through `consume`:

```javascript
export function consume(results, existing, ctx = {}) {
  const gz = ctx.gazetteer ?? null;
  const list = results.find((r) => r.key === 'list');
```

```javascript
    const entry = parseEntry(result.post, result.body, gz);
```

- [ ] **Step 6: Read the gazetteer in the build shell**

In `tools/build-feeds.mjs`, add the import:

```javascript
import { loadGazetteer, unmatchedPhrases } from './feeds/places.mjs';
```

Add a reader beside `readExisting`:

```javascript
// The gazetteer is data the user edits, so it lives under data/ and is read
// here rather than imported by the pure source modules. A broken gazetteer
// costs you place matching, never your feeds.
async function readGazetteer() {
  try {
    const gz = loadGazetteer(JSON.parse(await readFile('data/gazetteer.json', 'utf8')));
    if (!gz) {
      console.error('gazetteer: unusable, continuing without place matching');
      return null;
    }
    console.log(`gazetteer: ${gz.marks.length} marks, ${gz.species.length} species`);
    return gz;
  } catch (err) {
    console.error(`gazetteer: not read (${err.message}), continuing without place matching`);
    return null;
  }
}
```

Thread it through `runSource`, which gains a second parameter:

```javascript
async function runSource(source, ctx) {
  const { name, url, out } = source.meta;
  const existing = await readExisting(out);

  const collected = [];
  let requests = source.firstRound(existing, ctx);
  for (let round = 0; round < MAX_ROUNDS && requests.length; round += 1) {
    console.log(`${name}: round ${round + 1}, ${requests.length} request(s)`);
    const results = await fetchAll(requests);
    const { entries, next } = source.consume(results, existing, ctx);
    collected.push(...entries);
    requests = next ?? [];
  }
```

And build the context in `main`, reporting what matched and what did not:

```javascript
async function main() {
  const gazetteer = await readGazetteer();
  const ctx = { gazetteer };

  for (const source of SOURCES) {
    try {
      await runSource(source, ctx);
    } catch (err) {
      // One broken source must not stop the others.
      console.error(`${source.meta.name}: failed: ${err.message}`);
    }
  }

  if (gazetteer) reportUnmatched(gazetteer);
}
```

Add the reporter above `main`. It reads the files that were just written, so
it sees exactly what shipped:

```javascript
// Capitalised phrases the gazetteer did not recognise, so data/gazetteer.json
// can grow from evidence. Logged rather than committed: a file that changes
// every day would produce a commit every day for no benefit.
const UNMATCHED_REPORTED = 25;

async function reportUnmatched(gazetteer) {
  const text = [];
  for (const source of SOURCES) {
    const entries = await readExisting(source.meta.out);
    for (const entry of entries) {
      text.push(entry.title ?? '', entry.excerpt ?? '', entry.description ?? '');
    }
  }

  const found = unmatchedPhrases(gazetteer, text.join(' '));
  if (!found.length) return;
  console.log(`unmatched phrases (top ${UNMATCHED_REPORTED}, add real marks to data/gazetteer.json):`);
  for (const { phrase, count } of found.slice(0, UNMATCHED_REPORTED)) {
    console.log(`  ${String(count).padStart(3)}  ${phrase}`);
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, with every pre-existing 3a test still green.

- [ ] **Step 8: Rebuild the feeds and check what actually matched**

Run: `npm run feeds`

Then inspect the result:

```bash
node -e "
const fs = require('node:fs');
const y = JSON.parse(fs.readFileSync('data/feeds/youtube.json','utf8')).entries;
const k = JSON.parse(fs.readFileSync('data/feeds/kingfisher.json','utf8')).entries;
const counts = {};
for (const e of y) for (const m of (e.marks || [])) counts[m.name] = (counts[m.name]||0)+1;
console.log('videos with a mark:', y.filter(e => (e.marks||[]).length).length, 'of', y.length);
console.log('distinct marks    :', Object.keys(counts).length);
for (const [k2,v] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log('   ', String(v).padStart(2), k2);
console.log('videos with species:', y.filter(e => (e.species||[]).length).length);
console.log('kingfisher regions :', k.map(e => Object.keys(e.regions||{}).join('/')).join('  |  '));
console.log('excerpt words      :', k[0].excerpt.split(/\s+/).length);
"
```

Expected, per the spec's "Done when": **at least four distinct marks**,
including **Amanzimtoti** and **Umkomaas**; no region term and no decoy in
the list; the Kingfisher excerpt still 50 words.

If a decoy appears as a mark, stop and fix the gazetteer or the matcher
before committing — a wrong pin is the one failure this design exists to
prevent.

- [ ] **Step 9: Commit**

```bash
git add tools/feeds/youtube.mjs tools/feeds/kingfisher.mjs tools/build-feeds.mjs \
        test/youtube.test.mjs test/kingfisher.test.mjs data/feeds/
git commit -m "feat: stamp marks and species onto the stored feeds"
```

---

### Task 3: Rank the hotspots

**Files:**
- Modify: `js/config.js`
- Create: `js/hotspots.js`
- Test: `test/hotspots.test.mjs`

**Interfaces:**
- Consumes: the stored shapes from Task 2 — video entries with `marks` and `species`, Kingfisher entries with `regions`.
- Produces: `buildHotspots(videoFeed, reportFeed, now = new Date()) -> Hotspot[]`, where a `Hotspot` is `{ name, region, count, species, videos, report }`. `videos` is the matching entries newest first; `report` is `{ species, link, date }` or `null`.

- [ ] **Step 1: Add the config block**

In `js/config.js`, immediately after the closing `},` of the `videos` block:

```javascript
  hotspots: {
    // A hotspot is a claim about now. Older videos stay in the list below but
    // stop contributing here.
    windowDays: 56,
    max: 6,
    // A title says what the video is about; a description says what the
    // channel is about.
    titleWeight: 3,
    bodyWeight: 1,
    // Recency decays across the window but never to zero -- an eight-week-old
    // mark still beats one with no evidence at all.
    minRecencyWeight: 0.2,
  },
```

- [ ] **Step 2: Write the failing tests**

Create `test/hotspots.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHotspots } from '../js/hotspots.js';
import { CONFIG } from '../js/config.js';

const NOW = new Date('2026-09-01T08:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - (n * 86400000)).toISOString();

const vid = (id, mark, { where = 'title', region = 'south', age = 1, species = ['Shad'] } = {}) => ({
  id,
  channel: 'Test Channel',
  channelUrl: 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q',
  title: `Video ${id}`,
  link: `https://www.youtube.com/watch?v=${id}`,
  date: daysAgo(age),
  description: null,
  via: 'rss',
  marks: mark ? [{ name: mark, region, where }] : [],
  species,
});

const feed = (entries) => ({ entries });

test('a mark with evidence becomes a hotspot', () => {
  const rows = buildHotspots(feed([vid('a', 'Umkomaas')]), null, NOW);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Umkomaas');
  assert.equal(rows[0].count, 1);
  assert.deepEqual(rows[0].species, ['Shad']);
});

test('recency beats raw volume', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { age: 2 }),
    vid('b', 'Scottburgh', { age: 50 }),
    vid('c', 'Scottburgh', { age: 52 }),
    vid('d', 'Scottburgh', { age: 54 }),
  ]), null, NOW);

  assert.equal(rows[0].name, 'Umkomaas', 'the recent single mention should lead');
});

test('a title match outranks a body match of the same age', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { where: 'body', age: 3 }),
    vid('b', 'Scottburgh', { where: 'title', age: 3 }),
  ]), null, NOW);

  assert.equal(rows[0].name, 'Scottburgh');
});

test('videos older than the window do not contribute', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { age: CONFIG.hotspots.windowDays + 5 }),
  ]), null, NOW);

  assert.deepEqual(rows, []);
});

test('the list caps at max', () => {
  const marks = ['Umkomaas', 'Scottburgh', 'Ballito', 'Margate', 'Uvongo',
    'Sezela', 'Pennington', 'Trafalgar'];
  const rows = buildHotspots(feed(marks.map((m, i) => vid(`v${i}`, m, { age: i + 1 }))), null, NOW);

  assert.equal(rows.length, CONFIG.hotspots.max);
});

test('species from several videos at one mark are merged', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { species: ['Shad'] }),
    vid('b', 'Umkomaas', { species: ['Garrick', 'Shad'] }),
  ]), null, NOW);

  assert.equal(rows[0].count, 2);
  assert.deepEqual(rows[0].species, ['Garrick', 'Shad']);
});

test('a hotspot carries its videos newest first', () => {
  const rows = buildHotspots(feed([
    vid('old', 'Umkomaas', { age: 20 }),
    vid('new', 'Umkomaas', { age: 2 }),
  ]), null, NOW);

  assert.deepEqual(rows[0].videos.map((v) => v.id), ['new', 'old']);
});

test('entries with no marks are ignored, not crashed on', () => {
  const rows = buildHotspots(feed([
    vid('a', null),
    { id: 'b', title: 'No marks field at all', link: 'https://x.test/', date: daysAgo(1) },
    vid('c', 'Umkomaas'),
  ]), null, NOW);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Umkomaas');
});

test('the region report is attached when one is available', () => {
  const report = {
    entries: [{
      id: 1, date: daysAgo(2), title: 'KZN Fishing Report', excerpt: '…',
      link: 'https://www.kingfisher.co.za/report/',
      regions: { south: { species: ['Garrick', 'Kob'] } },
    }],
  };

  const rows = buildHotspots(feed([vid('a', 'Umkomaas', { region: 'south' })]), report, NOW);

  assert.deepEqual(rows[0].report.species, ['Garrick', 'Kob']);
  assert.equal(rows[0].report.link, 'https://www.kingfisher.co.za/report/');
});

test('a mark whose region has no report line carries a null report', () => {
  const report = {
    entries: [{
      id: 1, date: daysAgo(2), title: 'R', excerpt: '…', link: 'https://x.test/',
      regions: { north: { species: ['Shad'] } },
    }],
  };

  const rows = buildHotspots(feed([vid('a', 'Umkomaas', { region: 'south' })]), report, NOW);

  assert.equal(rows[0].report, null);
});

test('the newest report wins when several are stored', () => {
  const report = {
    entries: [
      { id: 1, date: daysAgo(20), title: 'old', excerpt: '…', link: 'https://old.test/', regions: { south: { species: ['Snoek'] } } },
      { id: 2, date: daysAgo(2), title: 'new', excerpt: '…', link: 'https://new.test/', regions: { south: { species: ['Kob'] } } },
    ],
  };

  const rows = buildHotspots(feed([vid('a', 'Umkomaas', { region: 'south' })]), report, NOW);

  assert.deepEqual(rows[0].report.species, ['Kob']);
});

test('a malformed or empty feed yields no rows rather than throwing', () => {
  assert.deepEqual(buildHotspots(null, null, NOW), []);
  assert.deepEqual(buildHotspots({}, null, NOW), []);
  assert.deepEqual(buildHotspots({ entries: 'nonsense' }, null, NOW), []);
  assert.deepEqual(buildHotspots(feed([]), null, NOW), []);
});

test('a malformed report feed does not stop the hotspots', () => {
  const rows = buildHotspots(feed([vid('a', 'Umkomaas')]), { entries: 'nonsense' }, NOW);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].report, null);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... js/hotspots.js`.

- [ ] **Step 4: Write the aggregator**

Create `js/hotspots.js`:

```javascript
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
        row = { name: mark.name, region: mark.region ?? null, score: 0, species: new Set(), videos: [] };
        byMark.set(mark.name, row);
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/hotspots.js test/hotspots.test.mjs
git commit -m "feat: rank hotspots from the stored feeds"
```

---

### Task 4: Render the Hotspots section

**Files:**
- Create: `js/ui-hotspots.js`
- Test: `test/ui-hotspots.test.mjs`
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `app.css`

**Interfaces:**
- Consumes: `buildHotspots` from Task 3; `dayLabel` from `js/format.js`.
- Produces: `renderHotspots(target, hotspots, now = new Date())`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui-hotspots.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Same zero-dependency DOM stub as test/ui-videos.test.mjs -- this project
// takes no dependencies, so there is no jsdom to reach for.
function makeElement(tag) {
  return {
    tagName: tag, className: '', textContent: undefined, href: undefined,
    target: undefined, rel: undefined, hidden: false, children: [],
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
  };
}

globalThis.document = { createElement: makeElement };

const { renderHotspots } = await import('../js/ui-hotspots.js');

const NOW = new Date('2026-09-01T08:00:00Z');
const flatten = (node) => [node, ...node.children.flatMap(flatten)];
const textsOf = (node) => flatten(node).map((n) => n.textContent).filter(Boolean);

const hotspot = (over = {}) => ({
  name: 'Umkomaas',
  region: 'south',
  count: 2,
  species: ['Garrick', 'Shad'],
  videos: [
    { id: 'a', title: 'Shad at Umkomaas', link: 'https://www.youtube.com/watch?v=a', date: '2026-08-30T00:00:00Z', channel: 'Kents Fishing' },
  ],
  report: null,
  ...over,
});

test('an empty list hides the section entirely', () => {
  const target = makeElement('section');

  renderHotspots(target, [], NOW);

  assert.equal(target.hidden, true);
  assert.equal(target.children.length, 0);
});

test('a null list is treated as empty', () => {
  const target = makeElement('section');

  renderHotspots(target, null, NOW);

  assert.equal(target.hidden, true);
});

test('a hotspot row shows the mark, the count and the species', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot()], NOW);

  assert.equal(target.hidden, false);
  const texts = textsOf(target);
  assert.ok(texts.includes('Umkomaas'), `mark missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /2 videos/.test(t)), `count missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /Garrick/.test(t) && /Shad/.test(t)), 'species missing');
});

test('a single video reads "1 video", not "1 videos"', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({ count: 1 })], NOW);

  assert.ok(textsOf(target).some((t) => /\b1 video\b/.test(t)), 'expected singular');
});

test('every link opens safely in a new tab', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({
    report: { species: ['Kob'], link: 'https://www.kingfisher.co.za/r/', date: '2026-08-27T00:00:00Z' },
  })], NOW);

  const links = flatten(target).filter((n) => n.tagName === 'a');
  assert.ok(links.length >= 2, 'expected a video link and a report link');
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('the regional line is attributed to Kingfisher, not to the mark', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({
    report: { species: ['Kob'], link: 'https://www.kingfisher.co.za/r/', date: '2026-08-27T00:00:00Z' },
  })], NOW);

  const texts = textsOf(target);
  assert.ok(
    texts.some((t) => /Kingfisher/i.test(t) && /South Coast/i.test(t)),
    `expected an attributed regional line in ${JSON.stringify(texts)}`,
  );
});

test('a hotspot with no report line renders without one', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({ report: null })], NOW);

  assert.equal(textsOf(target).some((t) => /Kingfisher/i.test(t)), false);
});

test('a video row with an unsafe link is dropped', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({
    videos: [{ id: 'a', title: 'Bad', link: 'javascript:alert(1)', date: '2026-08-30T00:00:00Z', channel: 'X' }],
  })], NOW);

  assert.equal(textsOf(target).includes('Bad'), false);
});

test('rendering twice does not duplicate rows', () => {
  const target = makeElement('section');
  const rows = [hotspot()];

  renderHotspots(target, rows, NOW);
  const first = flatten(target).length;
  renderHotspots(target, rows, NOW);

  assert.equal(flatten(target).length, first);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... js/ui-hotspots.js`.

- [ ] **Step 3: Write the render module**

Create `js/ui-hotspots.js`:

```javascript
// The Hotspots list. DOM only -- js/hotspots.js decides what is shown.
import { dayLabel } from './format.js';

const REGION_LABELS = {
  north: 'North Coast',
  central: 'Central Coast',
  south: 'South Coast',
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function link(className, text, href) {
  const node = el('a', className, text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

export function renderHotspots(target, hotspots, now = new Date()) {
  target.replaceChildren();

  const rows = Array.isArray(hotspots) ? hotspots.filter((h) => h && h.name) : [];
  target.hidden = rows.length === 0;
  if (!rows.length) return;

  target.appendChild(el('h2', 'hotspots-heading', 'Hotspots'));

  const list = el('ul', 'hotspot-list');
  for (const spot of rows) {
    const item = el('li', 'hotspot-row');

    const head = el('div', 'hotspot-head');
    head.appendChild(el('span', 'hotspot-name', spot.name));
    // "1 video", not "1 videos".
    head.appendChild(el('span', 'hotspot-count', `${spot.count} video${spot.count === 1 ? '' : 's'}`));
    item.appendChild(head);

    if (spot.species.length) {
      item.appendChild(el('p', 'hotspot-species', spot.species.join(', ')));
    }

    const videos = spot.videos.filter((v) => v && isHttpUrl(v.link));
    if (videos.length) {
      const sub = el('ul', 'hotspot-videos');
      for (const video of videos) {
        const row = el('li', 'hotspot-video');
        row.appendChild(link('hotspot-video-link', video.title, video.link));
        row.appendChild(el('span', 'hotspot-video-date', dayLabel(new Date(video.date), now)));
        sub.appendChild(row);
      }
      item.appendChild(sub);
    }

    // Region-level context, always attributed and always linked. Kingfisher
    // writes about stretches of coast, never about this specific mark, and
    // the wording must not blur that.
    if (spot.report && spot.report.species.length && isHttpUrl(spot.report.link)) {
      const label = REGION_LABELS[spot.region] ?? 'this coast';
      const note = el('p', 'hotspot-report');
      note.appendChild(el('span', null, `${label}, per Kingfisher: ${spot.report.species.join(', ')} `));
      note.appendChild(link('hotspot-report-link', 'report', spot.report.link));
      item.appendChild(note);
    }

    list.appendChild(item);
  }
  target.appendChild(list);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add the container to the page**

In `index.html`, immediately **before** the line
`<section id="videos" class="videos" aria-label="Recent videos" hidden></section>`,
add:

```html
    <section id="hotspots" class="hotspots" aria-label="Recent hotspots" hidden></section>
```

- [ ] **Step 6: Wire it into the app**

In `js/main.js`, three edits.

Add to the imports, after the `ui-videos.js` import:

```javascript
import { buildHotspots } from './hotspots.js';
import { renderHotspots } from './ui-hotspots.js';
```

Add to the `els` object, after `videos: $('videos'),`:

```javascript
  hotspots: $('hotspots'),
```

Extend `paintFeed` so all three feed-derived sections repaint together. Both
feeds load independently, so this runs correctly whichever arrives first:

```javascript
function paintFeed() {
  const now = new Date();
  renderFeedCard(els.feed, currentEntry(state.feed), now);
  renderHotspots(els.hotspots, buildHotspots(state.videos, state.feed, now), now);
  renderVideoList(els.videos, pickVideos(state.videos), now);
}
```

No change is needed to the two `.then` bootstraps — both already call
`paintFeed()`.

- [ ] **Step 7: Style the rows**

Append to `app.css`, after the `.video-title` rule:

```css
.hotspots { display: block; margin-bottom: 12px; }
.hotspots[hidden] { display: none; }

.hotspots-heading {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.hotspot-list { list-style: none; margin: 0; padding: 0; }

.hotspot-row {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.hotspot-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.hotspot-name { font-size: 15px; font-weight: 600; }
.hotspot-count { font-size: 12px; color: var(--muted); }

.hotspot-species {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.hotspot-videos {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.hotspot-video {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 3px;
}

.hotspot-video-date {
  flex: none;
  font-size: 12px;
  color: var(--muted);
}

.hotspot-report {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted);
}
```

- [ ] **Step 8: Check it in a browser**

Run: `npm run serve`

Open `http://localhost:8090`. On the **Spots** tab, confirm:

1. Hotspots renders above the recent-videos list, both below the Kingfisher card.
2. Marks are real KZN places — no sponsor names, no dams, no "Durban".
3. Each mark's videos link out to YouTube in a new tab.
4. Where a regional line shows, it says "per Kingfisher" and links to the report.
5. Rename `data/feeds/youtube.json` aside, hard-reload: Hotspots and the video list both disappear, the Kingfisher card and forecasts still work, and the console is clean. Rename it back.

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add js/ui-hotspots.js js/main.js index.html app.css test/ui-hotspots.test.mjs
git commit -m "feat: render the Hotspots list on the Spots tab"
```

---

## Notes for the executor

**The gazetteer is a first draft, not a finished artifact.** It is seeded from
the KZN coast plus the marks the probe actually measured. The build logs
unmatched capitalised phrases on every run; that log is the mechanism for
growing it. Expect the user to edit `data/gazetteer.json` directly.

**Coverage starts thin.** The 40 stored videos yield roughly five real marks.
This is expected and improves as the daily archive accumulates. A Hotspots
list with three rows is a correct result, not a bug.

**Port St Johns is deliberately absent.** It appeared in a video title but is
Wild Coast, not KZN, and the gazetteer spans Zinkwazi to Port Edward. Add it
only if the user asks.

**The one failure worth stopping for** is a wrong pin: a decoy, a sponsor
name, an inland dam or a region term appearing as a hotspot. That is the
failure this whole design exists to prevent. If one appears in Task 2 Step 7,
fix it before committing rather than noting it and moving on.
