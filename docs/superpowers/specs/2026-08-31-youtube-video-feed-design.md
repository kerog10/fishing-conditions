# YouTube Video Feed - Design

**Date:** 2026-08-31
**Status:** Approved
**Sub-project:** 3a of 3 (roadmap: forecast table -> feed builder -> social hotspots)

## Goal

Add a second feed source - recent videos from seven KZN fishing YouTube
channels - and, in doing so, extract the pluggable source interface that the
scheduled feed builder spec deliberately deferred.

Sub-project 3 was decomposed into three cycles. This spec covers **3a** only:

- **3a (this spec):** the source contract, `tools/feeds/youtube.mjs`, the
  workflow change, and a recent-videos list in the UI.
- **3b (later):** `data/gazetteer.json` of KZN marks with aliases, a
  build-time matcher, and unmatched-phrase logging, retro-applied to the
  stored Kingfisher reports.
- **3c (later):** map pins and spot-attached intel.

No gazetteer, no place-matching and no pins are in scope here.

## Source access - established by probe, not assumption

Probed 2026-08-31. Every finding below was measured, not assumed.

**The documented per-channel Atom feed works for two of the seven
channels.** `GET https://www.youtube.com/feeds/videos.xml?channel_id=UC...`
is keyless, returns the 15 most recent videos with no paging, and carries
the full untruncated description in `<media:description>`.

**It fails for the other five, permanently.** Four channels return a hard
`404` on the feed while their `/channel/UC.../videos` page returns `200`
with the correct title - so the channel IDs are right and the feed simply
does not exist for them. The failures survived four retries each and
reproduce on isolated single requests, so they are not rate limiting.

**The `playlist_id=UU...` workaround is dead.** It returns `404` for all
seven channels, including both channels whose `channel_id` feed works.

**A valid feed can legitimately return zero entries.** One channel returned
`200` with a well-formed feed, a correct title and no `<entry>` elements at
all. This is a real state the parser must handle, distinct from an error.

**The channel page is the reliable path.** `GET /channel/<id>/videos`
returns `200` for all seven and embeds the video list in `ytInitialData` as
`lockupMetadataViewModel` records carrying the title, the video id and a
relative date string ("12 days ago"). It carries **no description**.

**The watch page carries an exact timestamp.** `GET /watch?v=<id>` exposes
`"uploadDate":"2026-08-23T21:43:42-07:00"`, which removes any need to
approximate dates from the relative strings. It does **not** expose a usable
description: `shortDescription` is empty and the meta description is
YouTube's generic boilerplate.

**Consequence:** the scrape is the primary path, not a fallback. Five of the
seven channels depend on it, including the four most active.

### Channels

Hand-curated. Handles are not stored - the channel ID is the stable
identifier, and resolving a handle costs a fetch that would be repeated
daily for no benefit.

| Channel | ID | Path |
|---|---|---|
| Kayz Adventures | `UC-Gmr9Xe_6rifFb-7u6J2ZQ` | scrape |
| Pa's Xtreme Fishing | `UCh8UMAxna8IRRu2sRV3kDIQ` | scrape |
| Buddyz Fishing Adventures | `UC68dR_gNnGmNYcMENCxNeWw` | scrape |
| Fishing Unfiltered | `UCOZsf26qw8MuprQuq5Ee3DQ` | scrape |
| Kents Fishing | `UC1QUL3Z5Ho7_Y0M562eqb8Q` | RSS |
| Come Fish With Saags | `UCCuWKw-vw3E8le-5aQNrLdA` | scrape |
| TightLines South Africa | `UCj-869N0wXMADhy_qmlYWBg` | RSS |

The "path" column records what was measured on 2026-08-31; it is not
configuration. The builder always tries RSS first and falls back per
channel, so a channel gaining or losing its feed needs no code change.

Note: the handle `@fishingunfiltered` resolves to a dormant 2023 channel
with no content whatsoever. The active channel is `@FISHINGUNFILTERED1`,
recorded above. Do not "correct" this ID back.

## Architecture

### The source contract

Both sources are rounds of fetches where each round's results determine the
next: Kingfisher is *fetch a list, then fetch each item*; YouTube is *fetch
seven feeds, then fetch a page for each that failed, then fetch a watch page
per new video*. The contract generalises over that shape rather than over a
descriptor blob.

A source module is a **pure state machine over fetch results**. It performs
no network and no filesystem access. `tools/build-feeds.mjs` is the only
component that touches either.

```js
// tools/feeds/<source>.mjs - pure. No fetch, no fs.
export const meta = { name, url, out, maxEntries };

// The first batch of requests: [{ key, url, type: 'json' | 'text' }]
export function firstRound(existing);

// Given [{ key, ok, status, body }] and what is already stored, return the
// entries this round produced and the requests still needed.
export function consume(results, existing);  // -> { entries, next }

export function merge(existing, incoming);   // -> capped, newest first
```

The shell loops `firstRound -> consume -> consume ...`, capped at **3
rounds** so a buggy source cannot spin. Every fetch failure reaches
`consume` as `{ ok: false, status }` rather than as a thrown error, so the
source decides what a failure means. That is what keeps YouTube's fallback
logic inside the YouTube module instead of leaking into the shell.

`build-feeds.mjs` iterates a registry of source modules. A source that
throws is caught, logged and skipped; the others still run.

### Kingfisher's refactor

`parseEntry`, `newPosts` and `mergeEntries` keep their logic verbatim,
wrapped by `firstRound`, `consume` and `merge`. The 50-word excerpt cap,
`MIN_EXCERPT_WORDS`, `MAX_ENTRIES` and the date validation are untouched,
and `test/kingfisher.test.mjs` continues to exercise the same functions.
Kingfisher uses two rounds: the REST category list, then one HTML fetch per
post not already stored.

### YouTube's three rounds

1. **All seven Atom feeds.** A channel is handed to round 2 if the feed
   returns a non-200 **or** returns 200 with zero entries - both measured
   states, both meaning "no data here". Entries parsed from RSS carry the
   real `published` timestamp and the full description.
2. **`/channel/<id>/videos` for each channel that failed round 1.** Parse
   `ytInitialData` for title, video id and relative date. No description.
3. **`/watch?v=<id>` for each scraped video not already stored**, to read
   `uploadDate`. Only genuinely new videos need this - typically zero to
   three per daily run, since the previous run stored the rest.

### One file per source

`data/feeds/kingfisher.json` is unchanged. YouTube writes
`data/feeds/youtube.json`. A failing source writes nothing and cannot
corrupt its neighbour. Neither file joins the service worker precache:
`sw.js` uses an atomic `caches.addAll(SHELL)`, so a listed-but-missing file
breaks install for the whole app.

## Stored shape

```json
{
  "source": "youtube",
  "builtAt": "2026-08-31T02:17:00Z",
  "entries": [
    {
      "id": "yrzkasfrH3o",
      "channel": "Fishing Unfiltered",
      "channelUrl": "https://www.youtube.com/channel/UCOZsf26qw8MuprQuq5Ee3DQ",
      "title": "Massive Natal Stumpnose | We Put Bins At Umkomaas Beach",
      "link": "https://www.youtube.com/watch?v=yrzkasfrH3o",
      "date": "2026-08-24T04:43:42Z",
      "description": null,
      "via": "scrape"
    }
  ]
}
```

- `date` is always a real UTC instant - RSS `published`, or the watch page's
  `uploadDate` normalised. There is no approximate-date flag, because there
  are no approximate dates.
- `description` is the full RSS description where available and `null`
  otherwise. Consumers must treat `null` as normal, not as an error.
- `via` is `"rss"` or `"scrape"`. It costs one field and it is the first
  thing worth checking when a channel quietly stops updating.

**Rolling window of 40 entries.** The UI renders eight; 3b will want history
to match against; the videos are fetched anyway; 40 entries is roughly 15 KB.
A channel page exposes about 30 videos, so the first build backfills a real
archive rather than starting empty. History accumulates going forward - the
Atom feed cannot page back, and neither can the scrape.

## Error handling

The build never exits non-zero on a fetch failure, and never writes worse
data than it already holds.

- **A channel fails both RSS and scrape:** log it, skip that channel, keep
  every other channel's entries. One dead channel must not empty the list.
- **A watch-page date fetch fails:** drop that video rather than store it
  with a guessed date. It is retried tomorrow, since it is still absent from
  storage.
- **Every channel fails:** the existing file is left byte-identical, so the
  commit guard produces no commit.
- **Zero entries would be written:** no write at all.

In the browser:

- **The file is missing or malformed:** render no list. No error banner, no
  console noise. Forecasts are unaffected - this is additive context, and
  its absence must never look like a broken app.
- **No staleness cutoff.** Fishing footage does not expire the way a weather
  report does; a good session from June is still useful. Each row shows a
  relative date, so nothing is presented as more current than it is. The
  list hides only when zero entries survive.

This is deliberately different from the Kingfisher card's 21-day rule, which
stays as it is. A weekly report has a shelf life; a video does not.

## UI

The list renders in the **Spots** tab, directly below the existing
Kingfisher card - both are KZN-wide human intel, so they read as one
section. A new `<section id="videos">` follows `<section id="feed">` in
`index.html`.

Two modules, matching the split the project already uses:

| Piece | Purpose |
|---|---|
| `js/videos.js` | Pure. Loads the JSON, filters, sorts, applies the caps. Returns rows or an empty array; never throws. |
| `js/ui-videos.js` | DOM only. Draws the rows, hides the section when there are none. |

`js/videos.js` sorts newest first, then takes **at most 2 per channel**,
then **at most 8 overall** - the per-channel cap applied before the total,
so several channels posting in the same week cannot be crowded out by one
prolific poster. This matters: on the day of the probe, four of the seven
channels had posted within four days of each other.

Each row shows the channel name, the video title, and a relative date via
the existing `dayLabel`. No thumbnails - they are third-party image requests
on every load for little gain. Every row links out to YouTube with
`target="_blank"` and `rel="noopener noreferrer"`. A row whose link is not
an `http`/`https` URL is dropped, the same defence `ui-feed.js` applies.

`js/config.js` gains a sibling to the existing `feed` block, which is
unchanged:

```js
videos: {
  path: 'data/feeds/youtube.json',
  max: 8,
  perChannel: 2,
},
```

## Testing

Pure modules against real captured fixtures, checked into `test/fixtures/`
and never edited by hand - the discipline the Kingfisher parser already
follows.

| Fixture | Captured from |
|---|---|
| `youtube-feed.xml` | a live Atom feed: 15 entries with full descriptions |
| `youtube-channel.html` | a live `/videos` page: about 30 lockup records |
| `youtube-watch.html` | a live watch page, for `uploadDate` extraction |
| `youtube-empty.xml` | the valid-but-zero-entry feed, a measured real state |

`test/youtube.test.mjs`:

1. RSS parses to entries with `via: "rss"`, real dates and descriptions.
2. A 404 feed routes that channel into round 2.
3. An empty-but-valid feed also routes that channel into round 2.
4. The channel page yields title, video id and channel, with
   `description: null` and `via: "scrape"`.
5. `uploadDate` resolves to the correct UTC instant.
6. A channel failing both paths is skipped without affecting the others.
7. `merge` caps at 40, newest first, and never duplicates an id.

`test/videos.test.mjs`: a missing file and a malformed file each yield no
rows; the per-channel cap displaces a third video from a prolific channel;
a row with a non-http link is dropped.

`test/kingfisher.test.mjs` must still pass unchanged against the refactored
module - that is the regression gate on the contract extraction.

`tools/build-feeds.mjs`, `ui-videos.js` and the workflow are verified by one
manual `workflow_dispatch` run, the same line the project already draws
between unit-tested pure logic and I/O checked in a browser.

## Workflow

`.github/workflows/feeds.yml` is unchanged except that the build step now
produces both files. Same daily cron, same `workflow_dispatch`, same
`concurrency` group, same `timeout-minutes: 10`, same commit guard on
`data/feeds`. A day with no new videos and no new report produces no commit.

## Done when

- A `workflow_dispatch` run writes `data/feeds/youtube.json` with entries
  from at least five of the seven channels and commits it.
- Entries appear from both paths: at least one `via: "rss"` and at least one
  `via: "scrape"`.
- Every stored entry has a parseable UTC `date`.
- The Spots tab shows the video list below the Kingfisher card, capped at
  eight rows and at most two per channel.
- Deleting `data/feeds/youtube.json` leaves the app fully working, with no
  list and no console error.
- `data/feeds/kingfisher.json` is byte-identical in shape to before, and the
  Kingfisher card is unaffected.
- `npm test` passes with the new tests present.
