# Learn Tab - Reading Water, Knots and Traces - Design

**Date:** 2026-09-04
**Status:** Draft - awaiting review
**Sub-project:** 4, added to the roadmap 2026-09-04 (forecast table -> feed
builder -> social hotspots, all shipped; this is new work, not a planned
fourth item). Instagram remains deferred and unrelated.

## Goal

The app tells you *when* to fish. It says nothing about *where on the beach*
to put a bait once you are standing there, or how to rig the trace that
carries it. This closes that gap with a third tab, **Learn**, holding two
static illustrated guides:

1. **Reading the water** - rips, gullies, sandbanks, and the method for
   mapping them at spring low.
2. **Knots and traces** - the knots and rigs a KZN rock-and-surf or estuary
   angler actually ties.

Both are fixed reference content. Nothing is fetched, scored, or scheduled.

## What makes this different from every other tab

Spots and 7 days are views over data that arrives at runtime - forecasts,
tides, feeds, videos. Learn has no data source at all. That single fact
drives most of the decisions below, and it is worth stating plainly so a
future reader does not go looking for the fetch that is not there.

There is no `learn.js` model module, because there is no state to model. The
content *is* the model.

## Architecture

Two new browser modules, one new panel in `index.html`, and a three-line
change to the tab wiring. No build-side work, no new npm scripts, no
`data/` file.

| Piece | Purpose |
|---|---|
| `js/learn-content.js` | The content itself, as a frozen array of entries. Text and SVG diagrams. No DOM, no imports. |
| `js/ui-learn.js` | Renders that array into `#panel-learn`. DOM only. |
| `index.html` | Gains a `Learn` tab button and an empty `<section id="panel-learn">`. |
| `js/main.js` | `tabs.names` becomes three; `els.tabButtons` gains `learn`; one `renderLearn()` call. |
| `app.css` | Guide card, diagram and step-list styling. |
| `sw.js` | Both new modules added to `SHELL`. |

### Why a content module rather than markup in `index.html`

The in-chat design said "write it straight into `index.html`". Reading the
code changed that.

`index.html` is presently 70 lines. The content described here is roughly
600-800 lines once the SVGs are in, so inlining it makes the app's shell
document ten times larger and pushes the actual page structure below a wall
of path data. Worse, it would be the only significant content in the app that
no test can see.

A content module costs nothing extra - `test/smoke.test.mjs` already asserts
every file in `js/` appears in the service worker `SHELL`, so a new module is
one line in `sw.js` either way - and it buys structural tests over the
content (see Testing). The `learn-content.js` / `ui-learn.js` split mirrors
the `hotspots.js` / `ui-hotspots.js` pairing already in use.

### Entry shape

```js
{
  id: 'rip-currents',        // unique, stable, used as the heading anchor
  section: 'water',          // 'water' | 'knots'
  title: 'Rip currents',
  blurb: 'One sentence on what it is and why it matters to an angler.',
  svg: '<svg viewBox="0 0 320 200" ...>...</svg>',
  svgAlt: 'Plain-language description of the diagram for screen readers.',
  steps: ['...', '...'],     // 'how to spot it', or the tying sequence
  note: { kind: 'safety', text: '...' } | null,
}
```

`steps` is an ordered list for knots and traces (the tying sequence) and an
unordered list of cues for water features. `ui-learn.js` picks `<ol>` or
`<ul>` off `section`, so the entry does not carry presentation.

### The `innerHTML` question

SVG cannot be built with the `document.createElement` the other render
modules use - it needs `createElementNS`, and hand-assembling forty path
elements per diagram in JavaScript would be unreadable. So `ui-learn.js`
assigns `entry.svg` to a container's `innerHTML`.

This is safe **because and only because** the strings are author-written
constants in a module with no imports, never interpolated, and never sourced
from a fetch, from `data/feeds/`, or from user input. That is a real
invariant, not a hope, so a test enforces it (see Testing). Any future change
that puts fetched text into `svg` breaks that test, which is the point.

The blurb, steps and note are plain text and go through `textContent` like
everything else in the app.

### The map stays visible on this tab

A 38vh map above a reading-heavy panel is not ideal. Hiding it is
nevertheless rejected: Leaflet miscalculates its own size when it is
re-shown after being hidden and needs an `invalidateSize()` call at exactly
the right moment, which turns a self-contained tab into a cross-cutting
concern touching `js/map.js`. The existing tabs do not special-case the map
and neither will this one. If the reading experience proves cramped in the
browser check, that is a follow-up with its own decision.

## Content

Written from general shore-fishing knowledge, in our own words, with our own
diagrams. Nothing is copied from a book, a forum or a video, so unlike the
Kingfisher reports there is no excerpt-and-link obligation here.

### Reading the water (4 entries)

| Entry | Cues covered |
|---|---|
| **Rip currents** | Gap in the line of breakers; darker, deeper channel; choppy seaward-flowing surface against calmer water either side; foam, sand and weed streaming out. Why fish patrol the edges. |
| **Gullies and trenches** | Darker green-blue against pale sand; swell passing over unbroken then breaking inshore of it; slick, calm-looking water. Where a bait wants to land. |
| **Sandbanks** | Consistent breaking, white and foaming; paler brown water; exposed or awash at low tide. Fishing the edge rather than the top. |
| **Mapping a beach at spring low** | The method, not a feature: walk it at spring low water, photograph or mark the gullies and banks, and fish that map for the weeks it holds. |

The rips entry carries a `safety` note - if caught, do not swim against it,
swim parallel to the beach until out of the pull, then in. The app already
carries a standing caution in the tide notice, so this pattern is
established.

### Knots and traces (roughly 9 entries)

Knots: **uni knot** (terminal, mono and braid), **double uni** (braid to
fluorocarbon leader, with the FG named as the lower-profile alternative for
anyone who wants to look it up), **blood knot** (mono to mono in a trace),
**dropper loop** (the stand-off a paternoster needs), **snell** (bait hooks
that sit straight).

Traces: **running sinker rig** (the standard surf bait rig), **paternoster /
flapper** (two hooks off the beach for edibles), **heavy sliding trace** for
rock-and-surf live or dead bait, **light estuary running rig** for grunter
and springer. The shad trace gets a short wire bite trace, which is the
detail that makes these KZN rigs rather than generic ones.

Exact wording and the final entry count are a build-time matter. The spec
fixes the shape and the subject list, not the prose.

## Accessibility

Each diagram is `role="img"` with an `aria-label` from `svgAlt`, so the
guides are usable without seeing the picture. Diagram strokes and fills use
the existing CSS custom properties rather than hardcoded colours, so the
diagrams inherit the app's palette rather than fighting it. The new tab
button joins the existing arrow-key roving tabindex loop for free, since
that loop already iterates `tabs.names`.

## Testing

Two new test files, one existing file extended. All `node:test`, no
dependencies, consistent with the rest of `test/`.

**`test/tabs.test.mjs` (extended)** - `NAMES` becomes three. Add: `learn`
is restored when remembered, and an unrecognised stored value still falls
back to `spots` rather than blanking the page.

**`test/learn-content.test.mjs` (new)** - structural guarantees over the
content:

- every entry has a non-empty `id`, `title`, `blurb`, `svg`, `svgAlt` and at
  least one step;
- `id` values are unique;
- `section` is `water` or `knots`, and both sections are non-empty;
- **no `svg` string contains `<script`, `javascript:` or an `on*=` handler** -
  the guard on the `innerHTML` invariant above;
- every `svg` opens with `<svg` and carries a `viewBox`, so a diagram cannot
  ship unscalable.

**`test/ui-learn.test.mjs` (new)** - uses the same zero-dependency DOM stub
as `test/ui-hotspots.test.mjs`, extended with an `innerHTML` property:

- every entry produces a heading bearing its title;
- an entry with a `note` renders it; one without renders no empty node;
- the section headings appear once each, in order;
- the panel is not left hidden after a render.

**`test/smoke.test.mjs`** needs no change - it will simply start asserting
the two new modules are precached, and fail until `sw.js` lists them. That is
the existing safety net doing its job.

**Browser check** - the content itself is not unit-testable. Verification is
a manual pass at mobile width and desktop: every diagram legible against the
dark palette, no horizontal overflow, tab switching and reload-persistence
working, and the roving arrow-key focus reaching all three tabs.

## Out of scope

- Search or filtering within the guides. Two short lists do not need it.
- Any link between a guide entry and a spot, a forecast slot or a hotspot.
  Tempting, and a plausible sub-project 5, but it would drag a data
  dependency into a tab that deliberately has none.
- Species identification, bag limits and regulations. Regulatory content
  goes stale and carries consequences when wrong.
- Video or animated knot-tying. Static diagrams only.

## Why this is a sub-project rather than a bounded change

It adds a navigation destination, a content subsystem with its own shape and
its own tests, and the app's first use of `innerHTML`. That is a new part of
the app rather than a change to an existing flow.
