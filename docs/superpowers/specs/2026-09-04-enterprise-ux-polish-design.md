# Enterprise-Level UX Polish - Design

**Date:** 2026-09-04
**Status:** Draft - awaiting review
**Sub-project:** 5, added to the roadmap 2026-09-04 (forecast table -> feed
builder -> social hotspots -> Learn tab, all shipped). This is the
"Enterprise-level UX" half of the same request that produced the Learn tab.

## Goal

The app is functionally complete and visually coherent (one dark palette,
one type scale, no build step) but reads as a personal tool rather than a
product: interactive elements give no feedback until the state changes
underneath them, several controls hardcode colour instead of drawing from
the token palette, and touch targets are inconsistent. This closes that gap
without changing the information architecture, adding a framework, or
introducing a settings surface - all of which are explicitly out of scope
below.

"Enterprise-level" here means specifically: every interactive element has a
visible hover/active/focus state; every colour used for anything interactive
or structural comes from a token, not a literal hex value dropped inline;
touch targets meet a 44px minimum; and state transitions (tab switch, data
arriving, an error) are not instant snaps but short, consistent motion. It
does not mean a redesign, a new visual language, or a light theme - none of
those were asked for and all would be a much larger, separately-scoped
change.

## Current state (audited 2026-09-04)

`app.css` is 500+ lines with one `:root` token block (13 tokens: surface
colours, ink/muted text, four status colours, five diagram tokens). Outside
that block:

- **15 hardcoded hex values** with no token: the accent blue `#2b6ea8` used
  three times (search button, add-spot button, active chip border) with no
  name; `#fff` and `#06231a` as literal button/cell text colours; twelve
  more inside three severity-ramp rule blocks (`.ramp-wind`/`.ramp-gusts`/
  `.ramp-swell`/`.ramp-rain` - a shared 7-step green-to-red gradient keyed
  by `data-band="0"` through `"6"`; `.ramp-tide` - a separate 4-step blue
  gradient; `.ramp-score` - a 3-step gradient whose background is its own
  literal per band but whose *text* colour already correctly reuses
  `--excellent`/`--fair`/`--poor`, roughly `app.css` lines 174-194). These
  are a deliberate multi-step design, not simple duplicates of the four
  named status tokens at different opacities - the wind/tide ramps in
  particular have no equivalent named token to derive from at all, since
  7 and 4 steps do not map onto 4 status colours. They are unnamed literals,
  which is the actual defect worth fixing, not miscoloured.
- **One `:focus-visible` rule in the whole file** (`.ftable-day`). Every
  other button, input, tab, chip and link relies on the browser's default
  focus ring, which on this dark background is faint-to-invisible depending
  on browser and OS.
- **Zero `transition` declarations.** Tab selection, chip removal, band
  colour changes and the `.status` text swapping between loading/ready/error
  all happen as instant snaps.
- **No hover or active state** on any button or clickable element. A mouse
  user gets no affordance that `.chip-remove`, `.tab`, or `.results li
  button` are clickable beyond the cursor shape.
- **Touch targets:** several controls are under 44px in their shorter
  dimension - `.chip-remove` (padding `6px 10px 6px 6px` on a ~16px glyph),
  `.tab` (no explicit min-height), `.ftable-day` cells (34px wide, below the
  44px guideline, though the plan for those is intentionally dense per the
  forecast table's own design and stays out of scope here).
- **Loading and error states are text-only.** `#status` swaps between three
  strings ("Loading...", "", an error message) with only a colour change
  (`.status.error`) to distinguish them. There is no visual loading
  indicator anywhere in the app - not on initial map load, not on a spot
  switch, not on the feed/hotspots/videos sections while they populate.

## What this is not

- **Not a redesign.** The palette, layout, type scale, and every existing
  class name stay. This is an additive pass: new tokens, new states on
  existing selectors, one new small loading-indicator component.
- **Not a component framework or CSS methodology change.** No CSS-in-JS, no
  utility classes, no build step. Plain `app.css`, same as today.
- **Not a light theme.** Never requested; doubles the token surface and the
  QA burden for no stated benefit.
- **Not a settings/preferences surface.** No new panel, no new tab, no
  `localStorage` beyond what already exists for spot/tab persistence.
- **Not a fix for the forecast table's information density** (`.ftable-day`
  33px cells, tested and deliberate per `docs/superpowers/plans/
  2026-08-27-windguru-forecast-table.md`) or the map's fixed 38vh height
  (deliberate per the Learn tab spec's "map stays visible" decision). Both
  are working as designed; this pass does not reopen either.

## Changes

All in `app.css` unless noted. No `index.html` structural changes except the
one loading-indicator markup addition below.

### 1. Token consolidation

Add to `:root`:

```css
--accent: #2b6ea8;
--accent-ink: #ffffff;
--focus-ring: var(--good);
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
--transition-fast: 120ms ease;
```

Replace every literal `#2b6ea8` with `var(--accent)` and every literal
`#fff` used as button/cell text with `var(--accent-ink)` (three call sites:
`.search button`, `.add-spot`, `.chip-active` border colour - the chip uses
it as a border colour, not a background, so it becomes
`border-color: var(--accent)`).

The twelve hardcoded severity-ramp hex values (`.ramp-wind`/`.ramp-gusts`/
`.ramp-swell`/`.ramp-rain`, `.ramp-tide`, `.ramp-score` - `app.css` roughly
lines 174-194) are **not** recoloured or derived from the four status
tokens - they are their own deliberate multi-step gradients (7 steps, 4
steps, 3 steps respectively) with no clean mapping onto 4 named colours,
and changing their actual values is a visual redesign this pass explicitly
does not do (see "What this is not"). Instead, name each existing literal
as its own token so nothing in the file is an anonymous magic value:
`--ramp-wind-0` through `--ramp-wind-6` (the wind/gusts/swell/rain block
shares one 7-step ramp, so one set of seven tokens, reused by all four
selectors exactly as the CSS already reuses the same background values),
`--ramp-tide-0` through `--ramp-tide-3`, and `--ramp-score-0` through
`--ramp-score-2` for the three backgrounds only (leave `.ramp-score`'s
`color` declarations as `var(--excellent)`/`var(--fair)`/`var(--poor)`,
unchanged - those are already tokens). Every value stays pixel-for-pixel
identical; only the CSS goes from a hardcoded hex per rule to a named
custom property per rule, added to the `:root` block alongside the other
new tokens.

Existing ad-hoc radius values (`8px` on inputs/buttons, `10px`/`12px` on
cards, `6px` on table cells) are replaced with the matching new token
(`--radius-md` for controls, `--radius-lg` for cards, `--radius-sm` for
dense elements) wherever the existing value is exactly one of 6/8/10/12 -
10px rounds up to `--radius-lg` (12px) only where doing so does not visibly
change a card's proportions at a glance; if in doubt, leave a near-miss
value as a literal rather than force it onto a token that changes the look.

### 2. Focus, hover and active states

Every native interactive element (`button`, `input`, `a`, and anything with
`role="tab"`, `role="button"`, `role="option"` or `tabindex`) gets a
`:focus-visible` rule using the new `--focus-ring` token, matching the
existing `.ftable-day:focus-visible` pattern (`outline: 2px solid
var(--focus-ring); outline-offset` tuned per element so the ring doesn't get
clipped by a parent's `overflow: hidden` - check `.ftable-scroll` and
`.results` for clipping ancestors before relying on a positive offset).

Every button-like element gets the treatment below. The complete list,
enumerated 2026-09-04 by grepping `app.css` for every `button` selector and
every `el('button', ...)` call across `js/ui-compare.js`, `js/ui-spots-tab.js`
and `js/ui.js` (no other `js/ui-*.js` module constructs a button):
`.tab` (3, role="tab"), `#spot-search-form button` (the "Find" submit),
`.results li button` (place-suggestion list, including its `.active`
variant), `.chip-name`, `.chip-remove`, `.clear-all` (appears twice, once
in the compare panel and once on the spots tab - same class, same
treatment), `.add-spot`, `table.compare .cell` (the score button inside the
compare grid), `.spot-open`, `.spot-remove`. This is the complete set - no
sampling.

```css
transition: background-color var(--transition-fast),
  border-color var(--transition-fast), color var(--transition-fast);
```

plus a `:hover` rule that shifts background or border toward `--accent` or
lightens the surface slightly (`color-mix(in srgb, var(--panel) 85%, white)`
is the pattern to reuse across all of them for consistency), and an
`:active` rule that shifts one step further (a `color-mix` with a higher
white percentage, or `transform: scale(0.97)` for icon-only buttons like
`.chip-remove` - pick whichever reads better for that element's size and
apply the same choice to every element of that shape, not a different
treatment per button).

### 3. Touch targets

`.chip-remove`, `.spot-remove` and `.tab` get `min-height: 44px` (and
`min-width: 44px` for `.chip-remove`/`.spot-remove`, both icon-only ×
buttons at 28px today) via padding adjustment, not by changing font size or
icon size - `.spot-remove` is `position: absolute`, so use padding/box
sizing rather than repositioning it, to avoid nudging it off the card
corner. `.add-spot` and `.clear-all` are close but currently just under
44px in their padded height (roughly 40px and 32px respectively at their
current font sizes) - bring both up to the 44px minimum the same way. Also
check `.search button` (submit) against 44px once its box-sizing is final
after the token pass; adjust only if it measures short. `.spot-open` and
`table.compare .cell` already clear 44px today and need no size change -
only the hover/focus/active treatment from section 2. `.ftable-day` stays
as-is (out of scope, see above).

### 4. Motion on state change

- Tab panel switching (`hidden` attribute toggling in `js/main.js`'s
  `paintTabs()`): add a CSS transition so the incoming panel fades in
  rather than snapping. Since `hidden` cannot be transitioned directly, this
  needs `[role="tabpanel"] { transition: opacity var(--transition-fast); }`
  paired with a class toggle rather than the `hidden` attribute alone - the
  implementer decides between (a) leaving `hidden` for the actual
  show/hide and layering a `.panel-enter` class purely for the opacity
  transition on the frame the class is added and removed on a
  `requestAnimationFrame` tick, or (b) a simpler CSS-only `@keyframes
  fade-in` applied via a class `js/main.js` already toggles for a different
  reason (`aria-selected`/`hidden` swap happens in the same function) -
  whichever needs the smaller diff to `js/main.js`. If neither can be done
  without meaningfully restructuring `paintTabs()`, this one sub-item is
  acceptable to drop; note it as a deliberate cut in the report rather than
  forcing a risky change to tab-switching logic, which several existing
  tests (`test/tabs.test.mjs`) exercise closely.
- `.status` text changing between loading/ready/error: `transition: color
  var(--transition-fast);` (cheap, safe, no JS change).
- Band colour changes (`.band-*` on `.now-bar`, `.window`): add `transition:
  border-color var(--transition-fast);` so a re-score on spot switch doesn't
  snap.

### 5. A loading indicator

`#status` currently shows the literal string `"Loading..."` while data
fetches. Add a small inline spinner next to that text, shown only while
`.status` carries a new `.status.loading` class (mirroring the existing
`.status.error` pattern - `js/ui.js`, wherever `.status` currently gets
`.error` toggled, gets the equivalent `.loading` toggle at the point the
loading string is set and cleared).

Markup: no new element in `index.html` - the spinner is a `::before`
pseudo-element on `.status.loading`, a small CSS-only spinning ring (border-
box trick: transparent border on three sides, `--accent` on the fourth,
`border-radius: 50%`, `animation: spin 0.6s linear infinite`), so it costs
zero JS and zero new DOM. `aria-hidden` is not needed since it's a
pseudo-element - screen readers never see it - and `#status` already carries
`role="status"`, so the loading state is announced via the text change
alone, unaffected by this.

## Testing

No new test files. This pass is CSS plus one small `js/ui.js` class-toggle
change and (if kept, per the motion section's judgement call) a small
`js/main.js` change to `paintTabs()`.

- `test/tabs.test.mjs` and any other existing test touching `paintTabs()`
  or `.status` must still pass unmodified - if the motion change to
  `paintTabs()` breaks one, that is a signal the change is too invasive and
  should be cut per the "acceptable to drop" note above, not a signal to
  edit the test.
- One new assertion, added to whichever test file already covers `js/ui.js`'s
  status rendering (or a new one if none does - check first): setting the
  loading state adds `status.loading` to the status element's class list and
  clears it when loading ends, mirroring however `.status.error` is already
  tested.
- `test/smoke.test.mjs` needs no change (no new `js/` files).
- **Browser check** (this is a visual/interaction pass - most of it is not
  meaningfully unit-testable): a manual pass at both mobile width and
  desktop confirming every button/tab/chip/input shows a visible focus ring
  on keyboard Tab, a visible hover state with a mouse, that switching tabs
  and switching spots doesn't feel like a snap, that the loading spinner
  appears and disappears at the right moments, and that nothing regressed
  visually (severity gradient still reads the same, cards still look the
  same size/shape).

## Out of scope

- Light theme, or any theme switching.
- A settings/preferences panel.
- Redesigning the forecast table's density or the map's fixed height (both
  deliberate, both covered above).
- Skeleton loading states (grey placeholder shapes) for the feed/hotspots/
  videos/spot-cards sections - the spinner-next-to-status-text approach
  covers "something is happening," which is the gap; per-section skeletons
  are a larger, separately-scoped visual change.
- Toast/snackbar notifications. Errors stay inline in `#status`, as today.
- Any change to the four status colours (`--excellent`/`--good`/`--fair`/
  `--poor`) themselves, or to what they mean. Only how *other* colours are
  expressed changes.
- Print styles, RTL support, or additional locales.

## Why this is a sub-project rather than a bounded change

It touches nearly every selector in `app.css`, needs a token-by-token audit
to do safely (an accidental colour or radius drift on 500 lines of CSS is
easy to introduce and hard to spot without a systematic pass), and its
correctness is mostly visual - it needs the same discipline (spec, review,
a deliberate browser check) as any other sub-project rather than being
folded into an existing one as a drive-by tweak.
