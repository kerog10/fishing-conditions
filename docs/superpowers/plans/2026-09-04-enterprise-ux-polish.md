# Enterprise-Level UX Polish - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every interactive element in the app a visible hover/active/
focus state, move every interactive/structural colour onto a named token,
bring touch targets to a 44px minimum, and add short, consistent motion on
state transitions plus a small loading indicator - without redesigning
anything.

**Architecture:** Almost entirely `app.css`. One `js/ui.js` change
(`setStatus` gains a loading flag) and its call sites in `js/main.js`. No
new files, no new dependencies, no `index.html` structural changes.

**Spec:** `docs/superpowers/specs/2026-09-04-enterprise-ux-polish-design.md`

## Global Constraints

- **No new dependencies, no build step.** Plain CSS custom properties, plain
  `node:test`.
- **No visual redesign.** Every value that isn't explicitly named below to
  change must stay pixel-for-pixel identical. When a step gives a choice
  ("pick whichever reads better"), apply that one choice uniformly to every
  element of the same shape - never a bespoke treatment per element.
- **The four status colours (`--excellent`/`--good`/`--fair`/`--poor`) and
  what they mean do not change.** Only how *other* colours are expressed
  changes.
- **`.ftable-day` sizing/density stays as-is** (out of scope, see spec). It
  may still gain a token-based focus ring in Task 2 for consistency, since
  that's a like-for-like swap of its existing `var(--good)` for the new
  `var(--focus-ring)` token (same colour), not a size or behaviour change.
- Test command is `npm test` (`node --test "test/**/*.test.mjs"`).
- Serve locally with `npm run serve` -> <http://127.0.0.1:8090>.
- If a step in Task 3's motion sub-section would require restructuring
  `paintTabs()` beyond a class toggle, drop that one sub-item and note it as
  a deliberate cut in the report - do not force a risky change to
  tab-switching logic, which `test/tabs.test.mjs` exercises closely.

---

### Task 1: Token consolidation

Adds the new design tokens and replaces every hardcoded colour/radius
literal this pass covers with its token. Purely additive/renaming - no
visible change when done correctly.

**Files:**
- Modify: `app.css` only

**Interfaces:**
- Produces: nine new tokens in `:root` (`--accent`, `--accent-ink`,
  `--focus-ring`, `--radius-sm`, `--radius-md`, `--radius-lg`,
  `--shadow-sm`, `--shadow-md`, `--transition-fast`), plus per-band ramp
  tokens (`--ramp-wind-0`...`--ramp-wind-6`, `--ramp-tide-0`...
  `--ramp-tide-3`, `--ramp-score-0`...`--ramp-score-2`). Tasks 2 and 3
  consume `--focus-ring`, `--transition-fast`, and `--accent`.

- [ ] **Step 1: Add the new tokens**

In `app.css`'s existing `:root` block, append:

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

- [ ] **Step 2: Name the severity-ramp literals**

Find the three ramp rule blocks (`.ramp-wind`/`.ramp-gusts`/`.ramp-swell`/
`.ramp-rain`, `.ramp-tide`, `.ramp-score`), roughly `app.css` lines 174-194.
For each `data-band="N"` background value currently a literal hex, add a
token to `:root` named `--ramp-wind-N` (wind/gusts/swell/rain share one
7-step ramp - the CSS already repeats the same seven values across all four
selectors, so this is seven tokens total, not twenty-eight), `--ramp-tide-N`
(four tokens), or `--ramp-score-N` (three tokens, backgrounds only). Example
for one step:

```css
/* :root */
--ramp-wind-0: #123028;
--ramp-tide-0: #12303f;
--ramp-score-0: #14361f;
```

```css
/* rule site, unchanged selector, only the value becomes a var() */
.ramp-wind[data-band="0"], .ramp-gusts[data-band="0"], .ramp-swell[data-band="0"], .ramp-rain[data-band="0"] {
  background: var(--ramp-wind-0);
}
```

Every value must be copied verbatim from its current literal - do not
recalculate, round, or otherwise change any of the fifteen colours. Leave
`.ramp-score`'s `color: var(--excellent|--fair|--poor)` declarations
untouched; only its `background` literals get tokens.

- [ ] **Step 3: Replace the accent-blue and button-text literals**

Replace every literal `#2b6ea8` with `var(--accent)` (three sites: the
search-form submit button, `.add-spot`, and `.chip-active`'s border - the
chip site is `border-color: #2b6ea8` today and becomes
`border-color: var(--accent)`). Replace the literal `#fff` used as button
text colour with `var(--accent-ink)` at its call sites (search submit and
`.add-spot`).

Leave `table.compare .cell`'s `color: #06231a` alone here - Task 2 revisits
it as part of that selector's interactive-state work, since it's a text
colour tied to that button's states, not a bare token swap.

- [ ] **Step 4: Consolidate radius literals**

Wherever a `border-radius` value in `app.css` is exactly `6px`, `8px`, or
`12px`, replace it with `var(--radius-sm)`, `var(--radius-md)`, or
`var(--radius-lg)` respectively. Where a value is `10px` (a near-miss, not
an exact match), only replace it with `var(--radius-lg)` (12px) if doing so
does not visibly change the element's proportions at a glance (e.g. a large
card, not a small chip) - if in doubt, leave the `10px` literal as-is rather
than force a visible size change. Note any `10px` site you left alone, and
why, in your report.

- [ ] **Step 5: Verify no visual change**

Run `npm test` (must stay green - no test asserts on CSS values, but a
broken build/lint would still show up). Serve locally
(`npm run serve`) and open the app; visually compare it against `git stash`
(un-stashed) to confirm nothing shifted - same colours, same corner
roundedness, same button proportions. Commit.

**Commit message:** `style: consolidate hardcoded colours and radii into tokens`

---

### Task 2: Focus, hover, active states and touch targets

Gives every interactive element a keyboard focus ring, a mouse hover state,
a pressed/active state, and (where short of it) a 44px minimum touch
target. This is the largest task - it must be exhaustive across the
complete element list below, not a sample.

**Files:**
- Modify: `app.css` only

**Depends on:** Task 1's `--focus-ring`, `--accent`, `--transition-fast`
tokens must exist first.

**The complete element list** (verified 2026-09-04 by grepping `app.css`
for every `button`-shaped selector and every `el('button', ...)` call
across `js/ui-compare.js`, `js/ui-spots-tab.js` and `js/ui.js` - no other
`js/ui-*.js` module constructs a button):

| Selector | Where | Notes |
|---|---|---|
| `.tab` | `index.html`, 3 buttons, `role="tab"` | already has default browser focus only |
| `#spot-search-form button` | `index.html`, the "Find" submit | uses `--accent` background today |
| `#spot-search` | `index.html`, the search input | native input, needs a focus ring too |
| `.results li button` | `js/ui.js:113`, place-suggestion list | has an `.active` variant class |
| `.chip-name` | `js/ui-compare.js:16` | |
| `.chip-remove` | `js/ui-compare.js:21` | icon-only "×", touch-target violation |
| `.clear-all` | `js/ui-compare.js:34` and `js/ui-spots-tab.js:70` | same class, both sites, one treatment |
| `.add-spot` | `js/ui-compare.js:56` | uses `--accent` background today |
| `table.compare .cell` | `js/ui-compare.js:91` | score button, `color: #06231a` literal |
| `.spot-open` | `js/ui-spots-tab.js:33` | block-level, full-width |
| `.spot-remove` | `js/ui-spots-tab.js:60` | icon-only "×", `position: absolute`, touch-target violation |

- [ ] **Step 1: `:focus-visible` on every element in the table**

For each selector above, plus `#spot-search`, add (or extend an existing
rule with):

```css
outline: 2px solid var(--focus-ring);
outline-offset: 2px;
```

Before committing to a positive `outline-offset`, check whether the
element's ancestor chain includes an `overflow: hidden`/`overflow: auto`
container (`.results` for `.results li button`; check `.spot-cards` and any
scroll container around the compare table for `.cell`/`.spot-open`/
`.spot-remove`). Where the ring would be clipped, use `outline-offset: -2px`
instead (matching the existing `.ftable-day:focus-visible` pattern) so the
ring draws inside the element's own box.

Also update the existing `.ftable-day:focus-visible` rule's
`outline: 2px solid var(--good)` to `outline: 2px solid var(--focus-ring)`
- same colour (`--focus-ring` is defined as `var(--good)`), just routed
through the shared token for consistency.

- [ ] **Step 2: `transition` + `:hover` + `:active` on every button-shaped element**

For every selector in the table except `#spot-search` (an input, not a
button - it keeps only its focus ring from Step 1), add:

```css
transition: background-color var(--transition-fast),
  border-color var(--transition-fast), color var(--transition-fast);
```

Then add a `:hover` rule per element that shifts its background or border
toward `--accent`, or lightens the surface with
`color-mix(in srgb, var(--panel) 85%, white)` - pick whichever fits the
element's current background (an element already using `--accent` as its
background darkens or lightens slightly on hover via `color-mix`; an
element on `--panel` lightens via the `color-mix` pattern). Apply the same
choice to every element sharing a current background colour, not a
different pick per element.

Then add an `:active` rule one step further in the same direction as the
`:hover` rule, **except** for icon-only buttons (`.chip-remove`,
`.spot-remove`), which instead get `transform: scale(0.97)` on `:active` -
apply that same transform choice to both icon-only buttons, not a
per-button pick.

`table.compare .cell`'s `color: #06231a` literal (left alone in Task 1)
gets folded into this step: keep the literal value (it's a near-black text
colour for readability against the light band backgrounds, not one of the
four status tokens) but make sure it's declared once, not per `:hover`/
`:active` variant, so those states change only background/border, not text
colour - this preserves score-band readability across all three states.

- [ ] **Step 3: Touch targets**

`.chip-remove`, `.spot-remove` and `.tab` get `min-height: 44px` (and
`min-width: 44px` for `.chip-remove`/`.spot-remove`, both icon-only) via
padding adjustment, not by changing font size or icon size. `.spot-remove`
is `position: absolute`, so grow it via `padding`/box sizing rather than
moving its `top`/`right` offsets, so it doesn't drift off the card corner.

Also bring `.add-spot` and `.clear-all` up to the 44px minimum the same
way (both currently render just under it). Measure `#spot-search-form
button` (the submit) after Task 1 and Step 1/2 of this task are applied -
if it's already ≥44px tall, leave it; adjust only if it measures short.

`.spot-open` and `table.compare .cell` already clear 44px and need no size
change here - they already got their hover/focus/active treatment in Steps
1-2. `.ftable-day` stays exactly as-is (out of scope).

- [ ] **Step 4: Browser check and commit**

Serve locally (`npm run serve`). At both a mobile width (~375px) and
desktop width, Tab through every control in the table above and confirm a
visible focus ring on each; hover each with a mouse and confirm a visible
state change; click/tap each and confirm a pressed state; confirm nothing
shifted layout (no element grew in a way that pushes neighbours). Run
`npm test` (must stay green - no existing test asserts on hover/focus CSS).
Commit.

**Commit message:** `style: add focus, hover and active states; meet 44px touch targets`

---

### Task 3: Motion on state change and a loading indicator

Adds transition-based motion to tab switching, status colour changes, and
band colour changes, plus a CSS-only loading spinner driven by a new
`setStatus` parameter.

**Files:**
- Modify: `app.css`
- Modify: `js/ui.js` (`setStatus`, ~line 32)
- Modify: `js/main.js` (the `setStatus(els.status, 'Loading forecast…')` and
  `setStatus(els.status, 'Searching…')` call sites, ~lines 345 and 465)
- Test: `test/ui.test.mjs` (new file)

**Interfaces:**
- Changes: `setStatus(target, message, isError = false)` becomes
  `setStatus(target, message, isError = false, isLoading = false)` -
  backward compatible, every existing call site with 2-3 args keeps working
  unchanged.
- Produces: `.status.loading` class, toggled the same way `.status.error`
  already is.

- [ ] **Step 1: Write the failing test**

Create `test/ui.test.mjs`. Mirror the DOM-stub pattern from
`test/ui-feed.test.mjs` (a `makeElement`-style stub object with
`textContent` and a `classList` that supports `toggle`/`contains` - the
existing stubs in this repo's other UI tests don't implement `classList`,
so add a minimal one: `{ toggle(name, force) {...}, contains(name) {...} }`
backed by a `Set`). Then:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setStatus } from '../js/ui.js';

function makeStatusElement() {
  const classes = new Set();
  return {
    textContent: '',
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
      },
      contains(name) { return classes.has(name); },
    },
  };
}

test('setStatus adds status.loading when isLoading is true', () => {
  const target = makeStatusElement();
  setStatus(target, 'Loading forecast…', false, true);
  assert.equal(target.classList.contains('loading'), true);
  assert.equal(target.classList.contains('error'), false);
});

test('setStatus clears status.loading once loading ends', () => {
  const target = makeStatusElement();
  setStatus(target, 'Loading forecast…', false, true);
  setStatus(target, 'Ready', false, false);
  assert.equal(target.classList.contains('loading'), false);
});

test('setStatus still supports the 2 and 3-argument forms unchanged', () => {
  const target = makeStatusElement();
  setStatus(target, 'plain message');
  assert.equal(target.textContent, 'plain message');
  assert.equal(target.classList.contains('error'), false);
  assert.equal(target.classList.contains('loading'), false);
  setStatus(target, 'an error', true);
  assert.equal(target.classList.contains('error'), true);
});
```

Run `npm test` - these three fail (`isLoading` doesn't exist yet).

- [ ] **Step 2: Extend `setStatus`**

In `js/ui.js`:

```js
export function setStatus(target, message, isError = false, isLoading = false) {
  target.textContent = message ?? '';
  target.classList.toggle('error', Boolean(isError));
  target.classList.toggle('loading', Boolean(isLoading));
}
```

Run `npm test` - the three new tests pass; no other test regresses (grep
confirms no other test file currently imports `setStatus`, so this is a
pure addition).

- [ ] **Step 3: Wire the loading state at the two real loading call sites**

In `js/main.js`, the two calls that set a genuinely in-flight loading
message become 4-arg calls with `isLoading: true`:

```js
setStatus(els.status, 'Loading forecast…', false, true);
// ...
setStatus(els.status, 'Searching…', false, true);
```

Every other `setStatus` call in `js/main.js` (the reset message, the two
error calls, the success/stale call, the "no match" error, the clear-status
call) stays exactly as it is today - 2 or 3 args, `isLoading` defaults to
`false`. Do not add `isLoading: true` anywhere except the two sites named
above.

- [ ] **Step 4: The spinner**

In `app.css`, add:

```css
.status.loading::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 2px solid var(--muted);
  border-top-color: var(--accent);
  border-radius: 50%;
  vertical-align: -2px;
  animation: status-spin 0.6s linear infinite;
}

@keyframes status-spin {
  to { transform: rotate(360deg); }
}
```

No `aria-hidden` needed - `::before` content is never exposed to assistive
tech, and `#status` already carries `role="status"` in `index.html`, so the
loading state is still announced via the text change alone.

Also add:

```css
.status { transition: color var(--transition-fast); }
```

- [ ] **Step 5: Band colour transitions**

Wherever `.band-excellent`/`.band-good`/`.band-fair`/`.band-poor` (or the
shared `[class*="band-"]` pattern, whichever the existing CSS uses - check
`app.css` for how `.now-bar`/`.window` currently select on band) set
`border-color`, add:

```css
transition: border-color var(--transition-fast);
```

to that same rule (or a new rule targeting `.now-bar`, `.window` if the
band classes don't carry a shared base selector already).

- [ ] **Step 6: Tab panel fade-in (best-effort)**

Look at `js/main.js`'s `paintTabs()` (or equivalent tab-switch function)
and how it toggles `hidden`/`aria-selected` on tab panels. If a `.panel-enter`
class (or reusing whatever class the function already toggles) can be
layered in with a one-or-two-line diff to `js/main.js` plus:

```css
[role="tabpanel"] { transition: opacity var(--transition-fast); }
[role="tabpanel"][hidden] { display: none; }
[role="tabpanel"]:not([hidden]) { opacity: 1; }
```

(with an initial `opacity: 0` set via the class right before removing
`hidden`, then cleared on the next frame) do it. If achieving this needs
restructuring `paintTabs()` beyond that, **skip this step**, leave the
existing behaviour untouched, and note the cut explicitly in your report -
per Global Constraints, this is an acceptable, expected outcome, not a
failure. Run `test/tabs.test.mjs` specifically after any change here; if it
breaks, revert this step rather than editing the test.

- [ ] **Step 7: Full test run, browser check, commit**

Run `npm test` (all tests green, including the new `test/ui.test.mjs`).
Serve locally; trigger a spot switch and a search to see the spinner appear
next to the status text and disappear when data arrives; switch tabs and
confirm no jank or console error. Commit.

**Commit message:** `feat: add loading spinner and motion on state transitions`

---

### Task 4: Verification pass

No code changes expected. Confirms the whole branch together, since Tasks
1-3 each verified in isolation but never all three layered.

**Files:** none (verification only, unless it surfaces a regression, in
which case fix it in this task and note it in the report)

- [ ] **Step 1: Full test suite**

Run `npm test`. All tests green, including the three from `test/ui.test.mjs`
and every pre-existing test.

- [ ] **Step 2: Full browser check**

Serve locally (`npm run serve`) and, at both mobile (~375px) and desktop
widths:
- Tab through the entire page with the keyboard; confirm every element in
  Task 2's table shows a visible focus ring, and that Tab order still makes
  sense (nothing new introduces a focus trap or an out-of-order stop).
- Hover every button-shaped element with a mouse; confirm a visible state
  change on every one.
- Trigger a loading state (switch spots, or search a new place) and confirm
  the spinner appears next to `#status` and disappears when data lands.
- Switch tabs (Spots / 7 days / Learn) and confirm the transition (if kept
  from Task 3 Step 6) reads as a fade, not a snap, and that keyboard
  arrow-key tab navigation still works (`test/tabs.test.mjs` covers this
  logically, but confirm it visually too).
- Confirm the severity-ramp colours (wind/gusts/swell/rain/tide/score) look
  pixel-identical to before this branch - open the same spot on `master` in
  a second tab if needed to compare.
- Confirm no layout shifted: card corners, button sizes, and spacing all
  read the same as before, except where Task 2 deliberately grew a touch
  target (`.chip-remove`, `.spot-remove`, `.tab`, `.add-spot`, `.clear-all`).

- [ ] **Step 3: Report**

Note in the final report: any Task 3 Step 6 cut (tab fade-in dropped or
kept), any Task 1 Step 4 `10px` radius literals left un-tokenised and why,
and confirmation that the browser check above passed with no regressions.

---

## Testing

- `npm test` must stay green after every task.
- `test/ui.test.mjs` is the only new test file, added in Task 3, covering
  `setStatus`'s new `isLoading` parameter and its backward compatibility.
- `test/tabs.test.mjs` must pass unmodified throughout - if Task 3 Step 6
  breaks it, that step is dropped, not the test changed.
- `test/smoke.test.mjs` needs no change (no new `js/` files - `js/ui.js`
  already exists and is already in `SHELL`).
- The primary verification for Tasks 2 and 3 is the manual browser check in
  their own steps and in Task 4 - most of this plan's correctness is visual
  and interactive, not unit-testable.
