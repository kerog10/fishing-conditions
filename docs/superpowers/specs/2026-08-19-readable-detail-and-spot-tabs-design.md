# Readable Detail & Spot Tabs — Design

**Date:** 2026-08-19
**Status:** Approved for planning

## Problem

Two complaints, one root cause: the app shows a lot of data and gives it almost
no room.

Every day is a `<details>` accordion holding an 11-row by 8-column table. On a
390 px phone that table scrolls sideways inside the card, so reading Thursday
afternoon's swell means scrolling horizontally inside a vertically scrolling
page, one day at a time. Tides — the thing a shore angler actually plans around
— are crushed into a single line of text with up to four entries.

Saved spots fare worse. They exist as name chips and as scores in a compare
grid; there is no view where a spot's current state is legible. Only the active
spot's detail is ever rendered.

## Goals

- Read a day's tides, wind and score without scrolling sideways
- See every saved spot's current state on one screen
- Lose no data: all eleven metrics stay reachable
- No new dependencies, no backend, no API keys — unchanged from v1

## Non-goals

- Charting libraries, animation, swipe gestures
- Species tuning or per-spot scoring weights
- Changing the scoring model, the API layer, or the cache

## Shape

Two tabs under the shared header. The user's stated usage is "both equally" —
deciding *when* and deciding *which spot* — so neither job sits behind the
other.

```
  header: search + suggestions
  map
  preview bar
  spot name + status
  now bar (active spot, always visible)
 -----------------------------
  (*) SPOTS       ( ) 7 DAYS
 -----------------------------
  (tab panel)
```

### Spots tab

Ranked by current score, best first. One card per spot:

```
  Umhlanga                  72
  rising · 1.4 m · high 16:41
  12 km/h NE
  next window 15:00-18:00   81
```

Tapping a card makes that spot active and switches to the 7 Days tab. Each card
keeps its remove control. `Clear all` sits at the foot of the list, as it does
today.

Below the cards, the existing spots × days compare grid is retained unchanged.
It answers "which spot on Thursday", which neither tab answers well alone, and
it already works.

Empty state (no saved spots): a line pointing at the map, no cards, no grid.

### 7 Days tab

Spot switcher strip (the existing chips), then the ranked best-windows list,
then seven day cards. Both existing components are reused as-is.

### Day card

Header, digest and sky line are unchanged — they already read well. The table is
replaced by three bands and a tap layer:

```
  TODAY                best 81
  Tides  H 04:12  L 10:33  H 16:41
  Tide   [24 hourly bars]
  Wind   [24 hourly bars]     12-34 NE
  Score  [24 hourly bars]
         00  03  06  09  12  15  18  21
```

Bands draw at hourly resolution — 24 bars — so the tide curve's peaks land on
the real high and low times. Three-hour means would render a blocky curve whose
peaks miss the printed times by up to 90 minutes.

The axis row beneath is eight 3-hour blocks, and those blocks are the tap
targets. 24 hourly bars at roughly 14 px each are too small to hit reliably on a
phone; 8 blocks at ~45 px are not.

Tapping a block expands a panel directly beneath the bands:

```
  15:00-18:00               81
  Tide      1.4 m rising
  Wind      18 km/h NE
  Gusts     27 km/h
  Swell     1.1 m / 9 s
  Temp      22 °C
  Rain      —
  Cloud     35 %
  Pressure  1014 hPa
  Why: rising pressure, incoming tide, near dusk
```

One block is open at a time, per day card. The values come from the existing
3-hour slot aggregation; the reasons come from the hours in that slot.

## Modules

New, pure, testable without a DOM:

| File | Responsibility |
|---|---|
| `js/bands.js` | Hourly series to band geometry: normalised bar heights, tide extrema markers, axis blocks |
| `js/spot-summary.js` | Scored hours to Spots-tab card model: now score, tide state, wind, next window |
| `js/tabs.js` | ARIA tablist controller; remembers the last tab under `fc:tab` |

New view module:

| File | Responsibility |
|---|---|
| `js/ui-spots-tab.js` | Renders the ranked spot cards and the empty state |

Modified:

| File | Change |
|---|---|
| `js/ui-days.js` | Rewritten: bands + slot detail panel. The `grid()` table is removed. |
| `js/daily.js` | Additive: each day gains `series` — hourly arrays for tide, wind and score |
| `js/main.js` | Owns tab state; repaints the visible panel only |
| `index.html` | Tablist markup, two panels |
| `app.css` | Band, card and tab styles |
| `sw.js` | New files added to `SHELL` |

Untouched: `api.js`, `score.js`, `astro.js`, `windows.js`, `compare.js`,
`cache.js`, `spots.js`, `suggest.js`, `map.js`.

## Data flow

Unchanged upstream of the view. `summariseDays` already returns per-day `hours`,
`slots`, `tides`, `sun` and `moon`; it gains `series` derived from the same
`hours` it already holds. No new fetches, no cache format change, so cached
payloads from the current version keep working.

```
api.normalise -> score.scoreHours -> daily.summariseDays -> bands.js -> ui-days.js
                                                         -> compare.js -> ui-compare.js
                 score.scoreHours -> spot-summary.js -> ui-spots-tab.js
```

## Behaviour details

**Band normalisation.** Each band scales to its own day's min/max, so a calm
day's wind band is not a flat line. The tide band scales to the day's tidal
range for the same reason. Bars are given a visible minimum height so a zero
value still reads as a bar rather than a gap.

**Missing data.** Inland spots have no tide or swell. The tide band is replaced
by the existing "No tide data for this spot" line; the slot detail omits the
tide, swell and period rows rather than printing dashes for all three. An
all-null series must not divide by zero.

**Tide state** in a spot card is derived from the two hours bracketing now:
rising, falling, or slack when the change is below a small threshold. The "next
turn" time is the next tide extremum after now.

**Next window** in a spot card is the first window from `findWindows` that ends
after now. A spot with no window above threshold shows "no good window in 7
days" rather than an empty space.

**Tab state** persists in `localStorage` under `fc:tab`, so it survives a reload
and is cleared by the existing `clearAll` prefix wipe.

## Accessibility

Real `role="tablist"` / `role="tab"` / `role="tabpanel"` with arrow-key
navigation and roving `tabindex`. Bands are decorative: each is wrapped in an
element carrying a text summary (`"Wind 12 to 34 km/h, north-east"`) so a screen
reader gets the range rather than 24 unlabelled bars. Slot buttons announce
their time range and score.

## Testing

Unit tests (`node --test`), no DOM:

- `bands.js` — normalisation across a known series; a flat series; an all-null
  series; extrema landing in the correct bar index; minimum bar height applied
- `spot-summary.js` — rising / falling / slack detection; next-turn selection;
  next-window selection skipping windows already past; the no-window case
- `daily.js` — `series` lengths match the day's hours; values line up with the
  source hours
- `tabs.js` — remembered tab restored; unknown stored value falls back to the
  first tab

Browser (Playwright against the container):

- **No element scrolls horizontally at 390 px** — asserted directly, since that
  is the complaint being fixed
- Tab switch shows the right panel and persists across reload
- Tapping a spot card activates it and lands on the 7 Days tab
- Tapping a 3-hour block opens the detail with all rows populated
- An inland spot shows the no-tide line and omits the marine rows
- No console errors

## Risks

**Rewriting `ui-days.js` is the largest single change.** It is one file with one
responsibility and full test coverage below it, so the blast radius is contained
to the view.

**Band rendering at hourly resolution across 7 day cards** is 168 bars plus the
compare grid. These are plain divs with no animation; if it proves slow on an
old phone, the fallback is to draw each band as a single inline SVG path, which
is a change inside `ui-days.js` alone.
