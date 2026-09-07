# Design Foundation and Chrome - Design

**Date:** 2026-09-07
**Status:** Draft - awaiting review
**Sub-project:** A of a three-part visual rewrite (A -> B -> C). See
*Decomposition* below. Follows the Learn tab (2026-09-04), which shipped the
content this rewrite has to make legible.

## Goal

Two redesign passes have already landed - `93ef668` ("real visual pass on the
UI and Learn tab diagrams") and `8ec2004` ("redesign hero panel and knot
diagrams from real reference sites") - and the app still reads as unfinished.
Repeating the same kind of pass a third time would produce the same result.

This sub-project replaces the ad-hoc styling layer with a token system, and
rebuilds the app frame on top of it for the device the app is actually used
on: a phone, held in one hand, outdoors.

It does not touch the Learn diagrams (sub-project B) or the data-dense
forecast screens (sub-project C). It defines the tokens both of those will
consume.

## Diagnosis: why the previous passes did not land

Worth recording, because it is the reason this spec is shaped the way it is.

`app.css` is 620 lines with roughly 50 `:root` custom properties. There is a
colour vocabulary but no type scale, no spacing scale, and four radius values
within 14px of each other (`8 / 10 / 16 / 22`). Colours are named for what
they are (`--panel-2`, `--ramp-wind-3`) rather than what they do, so nothing
prevents a new rule from inventing a fifty-first value. Every pass therefore
adjusts individual surfaces rather than the system, and inconsistency grows
back.

The visible symptom is not ugliness in any one component. It is the absence of
rhythm: no two cards share a padding, headings and body text differ by
arbitrary amounts, and vertical spacing is whatever each rule chose. That is a
scale problem, and it is not fixable by choosing better colours.

The second, independent problem is that the frame is built for a desktop
reading posture. On a 390x844 phone the user scrolls past a topbar carrying
the app's own name, a ~38vh map, a preview region and a hero card before
reaching the first number. The app's whole purpose is to answer "is it worth
going out", and it does not answer it above the fold.

## Decomposition

The full rewrite is too large for one spec, and the three parts have
different failure modes and different kinds of test.

| | Scope | Depends on |
|---|---|---|
| **A** (this spec) | Token layer; topbar, hero, map disclosure, tab strip, tide notice | - |
| **B** | Diagram drawing grammar; all 13 Learn SVGs redrawn; Learn card layout | A's `--diagram-*` tokens |
| **C** | Spot cards, Kingfisher report, hotspots, videos, week-at-a-glance, 7-day table | A's full token set |

B and C are independent of each other. Each gets its own spec, plan and
implementation cycle.

## Decisions taken during design

Three forks were settled with the user before this document was written. They
are recorded with their reasoning, because each closes off alternatives that
a later reader might otherwise reopen.

**Answer-first chrome, map on demand.** Considered against keeping a compact
map with an overlapping hero, and against a full-bleed map with a draggable
bottom sheet and bottom navigation. The sheet was the best ergonomics and the
most build - snap points, scroll containment and a bottom nav that has to
preserve the existing roving-tabindex keyboard behaviour, in a codebase with
no framework. The deciding argument for answer-first: once spots are saved,
picking a *new* spot is the rare action, so a permanently visible map is
expensive real estate for something seldom done.

**A single daylight palette.** Considered against a lifted dark palette and
against shipping both behind `prefers-color-scheme`. Dual themes are cheap
only if committed to at the token layer - which is this sub-project - but the
cost lands later and is real: every diagram in B must be legible twice, and
C's severity ramps need two sets of values. Single-palette was chosen for the
field case, and daylight over dark because dark surfaces mirror bright sky
regardless of contrast ratio.

Note for the record: the current dark palette does *not* fail contrast.
`--muted: #93a6b3` on `--panel: #151f27` computes to about 6.5:1, comfortably
AA. The problem with dark UI outdoors is ambient reflection, which contrast
ratios do not model. The palette is being changed for the right reason, not a
mistaken one.

**Layered tokens in a single stylesheet.** Considered against splitting into
`tokens.css` / `base.css` / `components.css`, and against retinting the
existing variables in place. Splitting costs extra requests on a cold load and
introduces the project's first file-layout convention; the project has no
bundler and no dependencies, and that character is worth keeping. Retinting
was rejected outright: it would produce a light app with the same missing
scales, so the actual complaint would survive the work.

## Architecture

### The token layer

Three layers at the top of `app.css`, in order, with an enforced boundary
between the second and the third.

**Layer 1 - primitives.** Raw values, named for what they are, referenced only
by layer 2. One ramp per dimension.

| Scale | Steps |
|---|---|
| Neutral | `--n-0` `#ffffff`, `--n-50` `#f7fafb`, `--n-100` `#eef3f6`, `--n-200` `#dfe8ee`, `--n-300` `#c8d7e0`, `--n-400` `#9ab0bd`, `--n-500` `#6d8896`, `--n-600` `#4d6675`, `--n-700` `#33505f`, `--n-800` `#1d3644`, `--n-900` `#0d1c26` |
| Accent | `--blue-600` `#16659e`, `--blue-700` `#0f4f7d` |
| Score | `--green-700` `#17803f`, `--olive-700` `#4f7a1f`, `--amber-800` `#9a6b06`, `--red-700` `#b83f30` |
| Type | `--text-3xl` 40px, `--text-2xl` 24px, `--text-lg` 20px, `--text-base` 16px, `--text-sm` 14px, `--text-xs` 12.5px, `--text-2xs` 11px |
| Space | `--space-1` 4px through `--space-7` 48px: `4 / 8 / 12 / 16 / 24 / 32 / 48` |
| Radius | `--radius-sm` 8px, `--radius-md` 12px, `--radius-lg` 16px, `--radius-full` 999px |

16px is body text and the floor for anything read as a sentence. `--text-2xs`
is reserved for uppercase micro-labels and for sub-project C's forecast table,
whose 34px columns cannot carry more; the token's comment says so, so its use
elsewhere is a visible mistake rather than a silent one.

Radius collapses today's four values (`8 / 10 / 16 / 22`) to three plus a pill.
The 10px and 22px steps carried no meaning distinct from their neighbours.

**Layer 2 - semantic tokens.** Named for what they do, referencing only layer 1.

| Token | Value | Use |
|---|---|---|
| `--bg` | `--n-100` | Page ground |
| `--surface` | `--n-0` | Cards |
| `--surface-sunk` | `--n-50` | Wells inside cards, metric cells |
| `--line` | `--n-200` | Default borders |
| `--line-strong` | `--n-300` | Emphasised dividers |
| `--ink` | `--n-900` | Body and headings |
| `--ink-muted` | `--n-600` | Secondary text, labels |
| `--ink-nontext` | `--n-500` | Icons, dividers, disabled states - **never text** |
| `--accent` | `--blue-600` | Selected tab, primary action |
| `--accent-ink` | `--n-0` | Text on `--accent` |
| `--score-excellent` | `--green-700` | |
| `--score-good` | `--olive-700` | |
| `--score-fair` | `--amber-800` | |
| `--score-poor` | `--red-700` | |

The `--diagram-*` set is defined here rather than in B, because B must not be
free to invent its own palette - that is how the current diagrams ended up
tinted differently from the app around them. B may add tokens; it may not
introduce raw values.

| Diagram token | Value | Use |
|---|---|---|
| `--diagram-ground` | `--n-0` | Diagram background |
| `--diagram-line` | `--n-800` | Line, mono, braid - the primary stroke |
| `--diagram-line-soft` | `--n-400` | Line passing behind another line |
| `--diagram-hardware` | `--n-600` | Swivels, beads, sinkers, hooks |
| `--diagram-accent` | `--blue-600` | The strand under discussion in this step |
| `--diagram-callout` | `--amber-800` | Arrows, "pull here" annotation |
| `--diagram-label` | `--ink-muted` | Diagram text |
| `--diagram-sea` | `--blue-600` | Water, in the reading-the-water entries |
| `--diagram-sand` | `--amber-800` | Sand and sandbanks |
| `--diagram-foam` | `--n-200` | Broken water, foam |

Two of these exist specifically to make sub-project B possible rather than to
serve anything in A: `--diagram-line-soft` is what makes an over/under crossing
readable, and `--diagram-accent` is what lets a step highlight one strand
without recolouring the whole drawing. The current diagrams have neither, which
is a large part of why they read as flat schematics.

**Layer 3 - component rules.** May reference layer 2 only. No raw hex, no
layer-1 tokens.

### Why `--ink-nontext` cannot be a text token

`--n-500` `#6d8896` computes to roughly 3.75:1 against `--surface`, below the
4.5:1 AA threshold for body text. Rather than delete a useful neutral or
quietly misuse it, it is named for the only role it can legitimately hold, and
the naming is enforced by test rather than by memory.

### Contrast

Hand-computed WCAG ratios against `--surface` `#ffffff`:

| Pair | Ratio |
|---|---|
| `--score-excellent` | ~5.00:1 |
| `--score-good` | ~5.08:1 |
| `--score-fair` | ~4.68:1 |
| `--score-poor` | ~5.53:1 |
| `--ink-muted` | ~6.05:1 |
| `--ink-nontext` | ~3.75:1 (non-text only) |

These numbers are stated for review, not relied upon. `test/tokens.test.mjs`
recomputes them (see Testing), so an arithmetic error here fails the build
rather than shipping.

### The chrome

**Topbar.** One line. The `<h1>Fishing Conditions</h1>` is removed; `#spot-name`
promotes out of `<main>` and becomes the `h1`, so the document retains exactly
one top-level heading and it names what is on screen. The search form collapses
to a 44px icon button that expands the input in place. `#spot-results` keeps its
existing combobox role, `aria-controls` and `aria-expanded` wiring unchanged.

**Hero card.** The first element under the topbar, and the answer to the
question the app exists to answer:

- score at `--text-3xl` in the matching `--score-*`, the largest element on screen
- verdict word beside it, from the strings already in `js/ui.js`
- the slot it applies to, right-aligned, `--text-2xs`
- a 2x2 metric grid on `--surface-sunk`: wind, tide state, swell, next high
- `#status` as a slot inside the card, below the grid, `role="status"` retained,
  rendering nothing when empty

The metrics come from `js/spot-summary.js`, which already computes score-now,
tide direction, wind and next window. No new model code: this is the existing
model rendered large.

Below the hero, a single **Next best** strip carrying one entry from
`renderWindows`.

**Map disclosure.** The map moves into a native `<details>`/`<summary>`, which
supplies keyboard operability and `aria-expanded` without hand-rolling them.

Leaflet computes zero dimensions inside a closed `<details>`, so `map.invalidateSize()`
is called on the `toggle` event when it opens. That handler lives in `js/map.js`
so the concern does not leak into `main.js`.

Open/closed persists, mirroring `createTabs` in `js/tabs.js`: a pure
`initialMapOpen(stored, spotCount)` function separated from the DOM, and the
same `try/catch` around `localStorage` on the grounds that blocked storage
should cost the memory of a preference, never the ability to open the map.

Precedence is explicit, because "open when there are no spots" and "remember
what the user chose" can disagree:

1. A stored value of `'open'` or `'closed'` wins whenever there are saved
   spots. The user's choice is not overridden by a heuristic.
2. With no saved spots, the disclosure opens regardless of the stored value.
   There is nothing to show in a hero without a spot, so a remembered
   "closed" would present an empty screen with no obvious way forward.
3. No stored value, or an unrecognised one, falls back to closed when spots
   exist and open when they do not.

`#preview` moves inside the disclosure, directly beneath the map, since it only
ever appears in response to a map tap.

**First-run state.** With no spots and no preview the hero renders an empty
state - a short line and a button that opens the disclosure - rather than
today's "Tap the map to pick a spot" occupying the position where a spot name
belongs.

**Tab strip.** Restyled as a segmented control. The roving-tabindex loop,
`aria-selected` handling and `tabs.names` wiring are unchanged.

**Tide notice.** Stays visible at the foot of `<main>`. It states "do not use
it for navigation or bar crossings", so it is not collapsed behind a
disclosure. It demotes to `--text-sm` with a rule above it.

### Files touched

| File | Change |
|---|---|
| `app.css` | Rewritten: three-layer token block, then component rules against layer 2 |
| `index.html` | Topbar restructured; map wrapped in `<details>`; `#preview` moved inside it; `#spot-name` promoted to the header |
| `js/main.js` | `els` bindings at lines 31-37 follow the moved nodes; map-disclosure init |
| `js/ui.js` | `renderNow` emits the hero card shape; empty state added |
| `js/map.js` | `toggle` handler calling `invalidateSize()` |
| `js/tabs.js` | Unchanged - `initialMapOpen` is a sibling module, not an extension |
| `js/map-disclosure.js` | New. `initialMapOpen` plus the storage wrapper. No DOM. |
| `sw.js` | New module added to `SHELL` |

`ui-slot.js`, `ui-table.js`, `ui-compare.js`, `ui-hotspots.js`, `ui-feed.js`
and `ui-videos.js` are not touched. They will look inconsistent with the new
chrome until sub-project C lands, and that is accepted.

## Accessibility

- Exactly one `h1`, naming the current spot.
- `#status` keeps `role="status"`; the hero's score is not announced on every
  re-render, only the status line is.
- Touch targets at 44px minimum, including the collapsed search button and
  the `<summary>`.
- `<details>` supplies disclosure semantics natively.
- Contrast enforced by test, not convention (below).
- Existing roving-tabindex tab behaviour preserved unchanged.

## Testing

All `node:test`, no dependencies, consistent with the rest of `test/`.

**`test/tokens.test.mjs` (new)** - the file that stops this decaying:

- parses `app.css` and splits it on the sentinel line
  `/* === components: semantic tokens only below this line === */`, which the
  stylesheet must contain exactly once. Below it, no declaration may contain a
  raw hex colour or reference a layer-1 token (`--n-*`, `--blue-*`, `--green-*`,
  `--olive-*`, `--amber-*`, `--red-*`). This is the layer boundary, enforced.
  A missing or duplicated sentinel fails the test rather than silently
  disabling it.
- asserts every semantic token resolves to a defined layer-1 token.
- carries a ~20-line WCAG relative-luminance function and asserts each
  ink-on-surface and score-on-surface pair is >= 4.5:1.
- asserts `--ink-nontext` is never used in a rule setting `color`.

**`test/map-disclosure.test.mjs` (new)** - `initialMapOpen` as a pure function:
open when no spots exist; stored preference honoured when spots exist;
unrecognised stored values fall back rather than blanking; a throwing storage
does not propagate.

**`test/smoke.test.mjs`** - unchanged. It already asserts every file in `js/`
appears in the service worker `SHELL`, so it will fail until `js/map-disclosure.js`
is listed. That is the existing safety net working.

**Browser check** - manual pass at 390x844 and at desktop width: the score is
above the fold with no scroll on first paint with a spot selected; the map
expands and Leaflet renders at full size on first open; disclosure state
survives reload; first-run opens with the map expanded; no horizontal overflow;
keyboard reaches the search button, the summary and all three tabs.

## Out of scope

- **The Learn diagrams.** Sub-project B. They will render in the new palette
  via `--diagram-*` and will look better for it, but they are not redrawn here.
- **The data-dense screens.** Sub-project C.
- **Dark mode.** Explicitly rejected above. The token layer does not obstruct a
  later addition, but no `prefers-color-scheme` block is written now, and no
  partial scaffolding for one is left behind.
- **A bottom navigation bar.** Considered and rejected with the bottom-sheet
  layout.
- **Any change to scoring, fetching or caching.** This is a presentation
  sub-project throughout. No file under the model layer changes behaviour.

## Risks

**The hero depends on `spot-summary.js` output shape.** It already computes the
four metrics, but it was written to feed a compact list row, not a 2x2 grid. If
a field turns out to be formatted for the narrow case, the fix belongs in
`js/format.js`, not in a second computation path in the view.

**`invalidateSize()` timing.** Calling it synchronously in the `toggle` handler
may run before the browser has laid the element out. If the map renders at the
wrong size on first open, the fix is a single `requestAnimationFrame`, not a
timeout - a timeout would be a guess.

**Inconsistency during the gap.** Between A and C the app will carry a
redesigned frame around old-looking content. This is the accepted cost of
decomposing, and it is preferable to one unreviewable change.
