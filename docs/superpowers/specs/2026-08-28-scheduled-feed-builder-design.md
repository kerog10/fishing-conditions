# Scheduled Feed Builder — Design

**Date:** 2026-08-28
**Status:** Approved
**Sub-project:** 2 of 3 (roadmap: forecast table → feed builder → social hotspots)

## Goal

Give the app a source of human fishing intelligence to sit alongside the
modelled forecast: the Kingfisher weekly KZN fishing report, fetched by a
scheduled job, committed to the repo as JSON, and served same-origin.

The app stays a static site with no backend and no API keys. All work that
needs scheduling, a User-Agent, or HTML parsing happens in GitHub Actions at
build time, never in the browser.

## Scope

**In scope:** the Kingfisher report as the single feed source, the scheduled
job that builds it, and the card that renders it.

**Out of scope, deliberately:**

- A generic pluggable "source" interface. The second source (YouTube,
  sub-project 3) is the right time to extract one, with two real
  implementations to generalise against. Guessing the interface now would be
  rewritten.
- The `data/gazetteer.json` place-matching and map pins. That is a large piece
  of hand-curation and would gate this feature on data entry.
- GitHub Pages configuration. The repository has no `.github/` directory at
  all yet; this workflow is written to land cleanly alongside a Pages setup,
  but configuring Pages is its own task.
- The stale README paragraph describing the `7 days` tab as day cards, left
  over from sub-project 1.

## Source access — established by probe, not assumption

Probed 2026-08-28. The canonical host is `www.kingfisher.co.za`.

**Discovery works over the WordPress REST API.**
`GET /wp-json/wp/v2/posts?categories=644` returns 200 with `id`, `date`,
`modified`, `link` and `title`. Category **644** is KZN Fishing Reports.
Cadence is **weekly on Thursdays** (27 August and 20 August 2026 posts, both
Thursday, ~16:20 SAST) — so the job polls daily rather than assuming a day.

**The body is not in the REST response.** For post 30568, both
`content.rendered` and `excerpt.rendered` are empty strings and `acf` is an
empty array. The site runs the **Kubio** page builder, which stores the body
outside the fields the REST API renders. Nothing in this design may depend on
`excerpt`; it is always blank.

**The body is in the post page HTML**, roughly 8 KB of text inside the
`entry-content` block, section-structured on headings the parser can key on:
`Rock and Surf`, `North Coast`, `Central Coast`, `South Coast`, and further
sections. The opening paragraph is mirrored in `<meta name="description">`,
`og:description` and `twitter:description`.

The page fetch needs a browser `User-Agent`, follows a redirect to the `www.`
host, and returns ~300 KB.

**Consequence:** the builder is a two-step fetch — REST for discovery, then one
HTML fetch per post not already stored.

## Copyright

The reports are Kingfisher's copyright. The stored JSON holds a **short excerpt
only** — a hard cap of 50 words — plus the title, the publication date and the
link. The card is a pointer to their site, not a replacement for it, and always
renders the link. The full `entry-content` text is never written to the JSON.

## Architecture

A Node script under `tools/` runs in Actions and writes a committed JSON file
that the app fetches same-origin. No new runtime dependency; the browser gains
exactly one more `fetch`.

| Piece | Purpose |
|---|---|
| `tools/feeds/kingfisher.mjs` | Pure. Given the category-list JSON and a post's HTML, returns a feed entry. No network, no `fs`. |
| `tools/build-feeds.mjs` | The I/O shell. Fetches, calls the pure module, merges, writes `data/feeds/kingfisher.json`. |
| `.github/workflows/feeds.yml` | Daily cron. Commits only when the file changed. |
| `js/feed.js` | Fetches the JSON and shapes it for render. Pure shaping, testable. |
| `js/ui-feed.js` | Draws the card. DOM only, no logic. |

This mirrors the split the forecast table already uses: pure modules hold the
logic, thin render modules hold the DOM.

## Data flow

1. Cron fires. Fetch the newest posts in category 644 over REST, with
   `per_page=5` — enough to recover if the job has been down for a month of
   weekly reports, small enough to stay one request.
2. Read the existing `data/feeds/kingfisher.json`, if present.
3. For each post `id` not already stored: fetch its `link`, extract
   `entry-content`, strip tags, take the first 50 words as the excerpt.
4. Merge new entries into a rolling window of the **last 8** — roughly two
   months of weekly reports, enough for the card plus a short history, and
   small enough that the committed file stays trivial.
5. Write the file. Commit only if the content actually changed, so a day with
   no new report produces no commit.

### Stored shape

```json
{
  "source": "kingfisher",
  "url": "https://www.kingfisher.co.za/",
  "builtAt": "2026-08-28T02:14:00Z",
  "entries": [
    {
      "id": 30568,
      "date": "2026-08-27T16:21:53Z",
      "title": "KZN Fishing Report (27 August 2026)",
      "link": "https://www.kingfisher.co.za/kzn-fishing-report-27-august-2026/",
      "excerpt": "The Final Countdown: Shad Championship Race Heats Up…"
    }
  ]
}
```

`builtAt` records when the job ran, distinct from when the newest report was
published — the card needs the latter, and debugging needs the former.

## Error handling

The build never fails the workflow on a bad fetch, because a red cron every day
trains you to ignore it.

- **REST unreachable or non-200:** log and exit 0, leaving the existing JSON
  untouched. A missing report is not an emergency.
- **A post's HTML will not parse:** fall back to `og:description`. If that is
  also absent, skip that post and log it — it is retried tomorrow, since it is
  still absent from the stored entries.
- **Every post fails:** the file is left exactly as it was. No empty-entry
  writes.

In the browser:

- **The feed file is missing or malformed:** render no card at all. No error
  banner. Forecasts are unaffected — this is additive context, and its absence
  must never look like a broken app.
- **The newest entry is older than 21 days:** render no card. A stale report
  presented as current is worse than none.

## UI

The card renders at the top of the **Spots** tab, above `#spot-cards`. The
report covers the whole KZN coast, so it is context for every spot rather than
a property of the selected one.

It shows the title, a relative date ("report from 27 Aug"), the excerpt, and a
link out to the full report on kingfisher.co.za. Nothing is interactive beyond
that link.

## Testing

`test/kingfisher.test.mjs` runs the pure module against a **saved fixture of
the real page**, checked into `test/fixtures/`. Cases:

1. A normal page parses to title, date, link and a ≤50-word excerpt.
2. `entry-content` empty or absent → falls back to `og:description`.
3. Both absent → the post is skipped, no partial entry.
4. A post id already in the stored entries is not re-fetched or duplicated.
5. The merge keeps the newest 8 entries, ordered newest first.
6. The excerpt is capped at 50 words even for a long report.

`test/feed.test.mjs` covers the browser side: a missing file, a malformed file,
and an entry past the 21-day staleness cut all yield no card.

`tools/build-feeds.mjs`, `ui-feed.js` and the workflow itself are verified by
one manual `workflow_dispatch` run before the cron is trusted — the same "pure
logic is unit-tested, I/O and DOM are checked in a browser" line the rest of
the project draws.

## Done when

- A `workflow_dispatch` run writes `data/feeds/kingfisher.json` with at least
  one real entry and commits it.
- The daily cron is enabled and produces no commit on a day with no new report.
- The Spots tab shows the report card, linking out to kingfisher.co.za.
- Deleting `data/feeds/kingfisher.json` leaves the app fully working with no
  card and no console error.
- `npm test` passes with the new tests present.
