# Hotspot Matching - Design

**Date:** 2026-08-31
**Status:** Approved
**Sub-project:** 3b of 3 (roadmap: forecast table -> feed builder -> social hotspots)

## Goal

Turn the stored feeds into an answer to "where have people been catching
fish lately". Match place names in the YouTube videos and the Kingfisher
reports against a hand-curated gazetteer of KZN marks, and render a ranked
Hotspots list on the Spots tab.

Sub-project 3 was decomposed into three cycles:

- **3a (done):** the source contract, `tools/feeds/youtube.mjs`, and the
  recent-videos list. Built on `feature/youtube-video-feed`, 258 tests green.
- **3b (this spec):** the gazetteer, the build-time matchers, and the
  Hotspots list.
- **3c (later):** map pins and spot-attached intel.

No map work is in scope here. The recent-videos list from 3a stays exactly
as it is; Hotspots is a second, separate section.

## Source signal - established by probe, not assumption

Probed 2026-08-31 against the 40 stored videos and 5 live Kingfisher
reports. Every number below was measured.

### The videos carry mark-level detail

- **33 of 40 entries carry a full description**, averaging ~1,650
  characters. Descriptions come from the Atom feed; scraped entries have
  `description: null`, so titles are the only guaranteed field.
- **17 of 40 name a place; 10 name it in the title.**
- Marks measured: Amanzimtoti (8), Warner Beach (3), Umkomaas (3),
  Winklespruit, Port Edward, Port St Johns, South Pier.
- Species measured: Shad (13), Garrick (5), Bronze Bream (3), Grunter (3),
  Stumpnose (2), Kob (2), Blacktail (2), Kingfish (2), Sardine (2), Elf.

**"Durban" scored 10 and is mostly noise.** It appears overwhelmingly inside
hashtag blocks (`#Durban #KZNFishing #Angler`) and in generic phrasing such
as "a beach fishing session in Durban, South Africa". Two of nineteen
occurrences were plausibly locational. This is the single most important
finding for the matcher: **hashtags must be stripped before matching, and a
region-level word must never pin a mark.**

### The Kingfisher reports carry region-level detail

- **Species signal is excellent.** Shad, Garrick, Kob, Sardine, Snoek and
  Tuna each appear in **5 of 5** reports.
- **Coastal mark density is low but non-zero.** Across 5 reports: Aliwal
  Shoal (6), Glen Ashley (3), Durban (3), uShaka. The reports are written
  at coast-region level - "the Central Coast has been producing
  consistently, particularly from Glen Ashley through to uShaka".
- **The section structure is reliable.** `North Coast`, `Central Coast` and
  `South Coast` headings appear in essentially every report, and the body
  splits cleanly on them (measured: 80 / 73 / 1272 words in one report).
- **The prose is full of decoys.** The most frequent capitalised phrases
  across 5 reports include Foton, News, Nino, Club, Facebook, Spotify,
  Podcast, Apple Pods, a podcast host's name, and "Foot and Mouth Disease",
  alongside inland bass and trout venues (Albert Falls Dam, Midmar, Inanda,
  Mearns Dam, Kamberg Road). 117 distinct candidates, the large majority
  worthless.

**Consequence:** place names are only ever matched against a curated list.
Nothing is discovered from prose, and nothing is geocoded from it. The two
sources contribute at different resolutions and the design must not pretend
otherwise - videos give marks, Kingfisher gives regions.

## Architecture

### Matching happens at build time

This is forced, not chosen. `data/feeds/kingfisher.json` stores a **50-word
excerpt only**, because the reports are Kingfisher's copyright. The report
body exists only during the build, before the excerpt is cut. Matching in
the browser is therefore impossible for that source.

Build-time matching also fits the copyright rule rather than straining it:
what gets stored is **extracted facts** - a list of mark names, a list of
species - never more of their prose. The stored excerpt stays capped at 50
words and the card still links out.

The browser never loads the gazetteer. Marks arrive already stamped on each
entry, so the client gains no new fetch and no new parsing.

| Piece | Purpose |
|---|---|
| `data/gazetteer.json` | Hand-curated KZN marks with aliases and regions. Data, not code. |
| `tools/feeds/places.mjs` | Pure. Normalises text, strips hashtags and URLs, matches marks and species. |
| `tools/feeds/youtube.mjs` | Stamps `marks` and `species` on each entry. |
| `tools/feeds/kingfisher.mjs` | Stamps per-region `species` on each entry. |
| `tools/build-feeds.mjs` | Reads the gazetteer and passes it to the sources. |
| `js/hotspots.js` | Pure. Aggregates stored entries into a ranked list. |
| `js/ui-hotspots.js` | DOM only. |

### One small contract change

The 3a source contract gains a third argument carrying build-time context:

```js
export function firstRound(existing, ctx);
export function consume(results, existing, ctx);
```

`ctx` is `{ gazetteer }`. The shell reads `data/gazetteer.json` once and
passes it in; sources stay pure and still never touch `fs`. Kingfisher's
`firstRound` ignores it. This is preferable to having source modules import
the gazetteer directly, because the gazetteer is data the user edits and
belongs under `data/`, not `tools/`.

If the gazetteer is missing or malformed, the build logs it and passes
`null`. Matching then yields no marks, entries store `marks: []`, and the
Hotspots section hides. Feeds still build - a broken gazetteer must not
cost you the video list.

## The gazetteer

```json
{
  "regions": {
    "north": "North Coast",
    "central": "Central Coast",
    "south": "South Coast"
  },
  "marks": [
    { "name": "Amanzimtoti", "region": "south", "aliases": ["Toti"] },
    { "name": "Umkomaas", "region": "south", "aliases": [] },
    { "name": "Aliwal Shoal", "region": "south", "aliases": ["Aliwal"] },
    { "name": "Glen Ashley", "region": "central", "aliases": [] },
    { "name": "Durban South Pier", "region": "central", "aliases": ["South Pier"] }
  ],
  "regionTerms": ["Durban", "KZN", "KwaZulu-Natal", "East Coast",
                  "North Coast", "Central Coast", "South Coast",
                  "South Africa", "Natal"]
}
```

Seeded with roughly 45 marks from Zinkwazi down to Port Edward, plus Aliwal
Shoal. Region boundaries follow Kingfisher's own usage: **central** is the
Durban metro stretch (Glen Ashley through uShaka, the piers, the Bluff),
**north** is Umhlanga upward, **south** is Amanzimtoti downward.

**`regionTerms` are never marks.** They exist so the matcher can recognise a
word as region-level and refuse to pin a hotspot on it. "Durban" is listed
here, not in `marks`, precisely because the probe showed it is a region word
and a hashtag, not a fishing spot.

The user edits this file directly. Unmatched capitalised phrases are logged
at build time, so it grows from evidence.

## Matching rules

`tools/feeds/places.mjs` exports pure functions over text.

**Before matching, the text is cleaned:**

1. Strip URLs.
2. **Strip hashtag blocks** (`#Durban`, `#KZNFishing`). This is what makes
   the Durban problem go away.
3. Decode entities, collapse whitespace, normalise case and diacritics for
   comparison while preserving the gazetteer's spelling for display.

**Then:**

- A mark matches on its `name` or any alias, on **word boundaries only**, so
  "Toti" does not fire inside "Amanzimtoti" and back-to-back.
- A match records **where** it was found: `"title"` or `"body"`. Titles are
  far more reliable - a title says what the video is about, a description
  says what the channel is about.
- A `regionTerm` never produces a mark. It may set the entry's region when
  no specific mark was found, which is enough for Kingfisher but never
  enough to rank a hotspot.
- Species match against a fixed list on word boundaries, with the obvious
  synonyms folded (Elf -> Shad, Leervis -> Garrick).

**Stored shape, videos:**

```json
{
  "id": "yrzkasfrH3o",
  "title": "Massive Natal Stumpnose | We Put Bins At Umkomaas Beach",
  "marks": [{ "name": "Umkomaas", "region": "south", "where": "title" }],
  "species": ["Stumpnose"]
}
```

**Stored shape, Kingfisher** - facts only, no additional prose:

```json
{
  "id": 30568,
  "excerpt": "…50 words, unchanged…",
  "regions": {
    "north": { "species": ["Shad", "Garrick"] },
    "central": { "species": ["Shad"] },
    "south": { "species": ["Garrick", "Kob", "Sardine"] }
  }
}
```

The report body is split on the coast headings and species are extracted per
section. No region text is stored - the 50-word excerpt remains the only
prose from Kingfisher in the file, and the card still links out.

## The Hotspots list

`js/hotspots.js` is pure and aggregates what is already stored.

**Ranking** is recency-weighted, not a raw count: a mark named three times
last week beats one named four times in June. Each video match contributes
`positionWeight × recencyWeight`, where `positionWeight` is 3 for a title
match and 1 for a body match, and `recencyWeight` decays linearly across the
window to a floor of 0.2.

**Window:** 56 days. Older videos stay in the recent-videos list but stop
contributing to hotspots - a hotspot is a claim about now.

**Cap:** 6 marks. Each shows the mark name, the number of videos, the union
of species seen there, and links to those videos. Where the mark's region
has a Kingfisher line, it also shows that region's species, attributed and
linked - "South Coast, per Kingfisher: Garrick, Kob, Sardine".

A mark with no evidence in the window does not appear. If no mark has
evidence, the whole section hides.

**Config:**

```js
hotspots: {
  windowDays: 56,
  max: 6,
  titleWeight: 3,
  bodyWeight: 1,
  minRecencyWeight: 0.2,
},
```

No `path`: Hotspots fetches nothing of its own. It is a pure function of the
two feeds the app already loads, so `main.js` calls it with what is already
in `state.videos` and `state.feed`:

```js
buildHotspots(state.videos, state.feed, now)  // -> ranked rows
```

The videos supply the marks and their species; the Kingfisher feed supplies
the per-region species line. Either may be `null` - a run with videos but no
report still produces hotspots, without the regional line.

## Error handling

The build never fails on matching, and never writes worse data than it holds.

- **Gazetteer missing or malformed:** log, match nothing, build the feeds
  anyway. `marks: []` everywhere and the section hides.
- **A mark matches nothing all week:** it simply does not appear. Absence is
  not an error state and is never rendered as one.
- **Kingfisher section headings absent:** store `regions: {}` for that
  entry. The mark-level list is unaffected.
- **Entries stored before 3b** have no `marks` field. The aggregator treats
  a missing `marks` as `[]`, so the file does not need rebuilding and no
  migration is required.

In the browser, as with every other feed-derived feature: a missing or
malformed file renders nothing, with no banner and no console noise.

## Testing

Pure modules against the real captured fixtures already in `test/fixtures/`,
plus the measured decoys as explicit cases.

`test/places.test.mjs`:

1. A mark matches on its name and on each alias, case-insensitively.
2. Word boundaries hold: "Toti" does not match inside "Amanzimtoti".
3. **Hashtag blocks are stripped** - a description whose only "Durban" is
   `#Durban` yields no mark and no region.
4. A `regionTerm` never yields a mark, only a region.
5. URLs are stripped before matching.
6. Species synonyms fold: Elf counts as Shad, Leervis as Garrick.
7. `where` is `"title"` for a title hit and `"body"` for a description hit.
8. **The measured decoys yield nothing** - Foton, Spotify, Apple Pods,
   Albert Falls Dam and "Foot and Mouth Disease" must not become marks.
9. A null or malformed gazetteer yields no marks rather than throwing.

`test/kingfisher.test.mjs` gains: the real fixture splits into three
regions with species per region; a body with no headings yields `{}`; the
excerpt stays capped at 50 words and unchanged in shape.

`test/hotspots.test.mjs`:

1. Recency beats volume across the window boundary.
2. A title match outranks a body match at equal age.
3. Entries older than `windowDays` are excluded.
4. The list caps at `max`.
5. Entries with no `marks` field are ignored, not crashed on.
6. An empty result yields an empty array, and the section hides.

`test/ui-hotspots.test.mjs` uses the same zero-dependency DOM stub as
`test/ui-videos.test.mjs`: renders rows, hides when empty, every link
carries `target="_blank"` and `rel="noopener noreferrer"`, and a non-http
link drops its row.

`npm test` must stay green throughout; the 3a suite passes unchanged.

## Done when

- `data/gazetteer.json` holds ~45 curated KZN marks with regions and
  aliases, and is readable and editable by hand.
- A build stamps `marks` and `species` onto the YouTube entries, and
  per-region `species` onto the Kingfisher entries.
- At least four distinct marks appear in the rebuilt `youtube.json`,
  including Amanzimtoti and Umkomaas.
- No `regionTerm` and none of the measured decoys ever appears as a mark.
- The Spots tab shows a Hotspots list above the recent-videos list, ranked,
  capped at six, each row linking to its videos.
- Deleting `data/feeds/youtube.json` leaves the app fully working with no
  Hotspots section and no console error.
- `data/feeds/kingfisher.json` still stores a 50-word excerpt and no more
  report prose than before.
- `npm test` passes with the new tests present.
