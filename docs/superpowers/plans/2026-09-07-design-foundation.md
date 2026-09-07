# Design Foundation and Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc styling layer with a three-layer token system and rebuild the app frame answer-first for one-handed outdoor phone use.

**Architecture:** `app.css` gains three ordered layers - primitives, semantic tokens, component rules - separated by a sentinel comment that a test enforces. The chrome is restructured so the score is the first thing on screen: the map moves into a native `<details>`, the spot name becomes the `h1`, and the hero card renders `summariseSpot`'s output large. No model or fetching behaviour changes except one additive field on `summariseSpot`.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Leaflet as a global classic script. `node:test` for tests. CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-07-design-foundation-design.md`

## Global Constraints

- **No dependencies.** No npm packages may be added. Tests use `node:test` and `node:assert/strict` only.
- **No build step.** `app.css` stays a single stylesheet; no `@import`, no preprocessor.
- **Test command:** `npm test` (runs `node --test "test/**/*.test.mjs"`).
- **Every file in `js/` must appear in `SHELL` in `sw.js`** as `'./js/<name>.js'`. `test/smoke.test.mjs` enforces this.
- **Feed JSON must never appear in `SHELL`** - `caches.addAll` is atomic and those files may not exist yet.
- **Wind is displayed in km/h**, matching `metricsLine` in `js/ui.js`. Do not introduce knots.
- **Single palette.** No `prefers-color-scheme` block, and no partial scaffolding for one.
- **Sentinel line, verbatim:** `/* === components: semantic tokens only below this line === */`
- **`--ink-nontext` may never be used as a `color`.** Icons, borders and disabled states only.
- Sub-projects B (Learn diagrams) and C (data-dense screens) are out of scope. Do not modify `js/ui-slot.js`, `js/ui-table.js`, `js/ui-compare.js`, `js/ui-hotspots.js`, `js/ui-feed.js`, `js/ui-videos.js`, `js/ui-learn.js` or `js/learn-content.js`.
- **Visual claims must be backed by a screenshot, never by reading source.** This project has twice rejected work whose visual verification was mechanical. Playwright works here without adding a project dependency, and this machine already has browsers cached at `~/AppData/Local/ms-playwright/`:

```bash
npm install --no-save playwright   # in a scratch dir, not the project
```

Then launch headless Chromium from a short Node script against the running `npm run serve`, screenshot at 390x844 (mobile) and 1100x900 (desktop), and **view the PNGs with the Read tool** - it renders images. Do not claim a layout looks right on the strength of the CSS.

---

### Task 1: Token layers and the contrast test

Defines layers 1 and 2 and proves them, without touching a single component rule. The app looks exactly the same after this task - the old variables are still there and still in use. That is deliberate: it makes Task 2 a pure conversion with a green test already guarding it.

**Files:**
- Modify: `app.css:1-51` (the current `:root` block; new tokens are added above it, nothing is deleted yet)
- Test: `test/tokens.test.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the semantic token names every later task uses - `--bg`, `--surface`, `--surface-sunk`, `--line`, `--line-strong`, `--ink`, `--ink-muted`, `--ink-nontext`, `--accent`, `--accent-ink`, `--score-excellent`, `--score-good`, `--score-fair`, `--score-poor`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, and the `--diagram-*` set. Also the sentinel constant, reused by Task 2.

- [ ] **Step 1: Write the failing test**

Create `test/tokens.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

export const SENTINEL = '/* === components: semantic tokens only below this line === */';

// Every custom property declared anywhere in the sheet, name -> raw value.
function declaredVars(text) {
  const out = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(text))) out.set(m[1], m[2].trim());
  return out;
}

// Follow var() chains down to a literal. A semantic token that points at a
// name nobody defined is the failure this catches.
function resolve(vars, value, depth = 0) {
  assert.ok(depth < 10, `token reference cycle reaching ${value}`);
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value.trim());
  if (!m) return value.trim();
  const next = vars.get(m[1]);
  assert.ok(next !== undefined, `${m[1]} is referenced but never defined`);
  return resolve(vars, next, depth + 1);
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const pairs = h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g);
  const [r, g, b] = pairs.slice(0, 3).map((p) => {
    const c = parseInt(p, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SEMANTIC = [
  '--bg', '--surface', '--surface-sunk', '--line', '--line-strong',
  '--ink', '--ink-muted', '--ink-nontext', '--accent', '--accent-ink',
  '--score-excellent', '--score-good', '--score-fair', '--score-poor',
];

test('every semantic token resolves to a defined primitive', () => {
  const vars = declaredVars(css);
  for (const name of SEMANTIC) {
    const raw = vars.get(name);
    assert.ok(raw !== undefined, `${name} is not defined`);
    const literal = resolve(vars, raw);
    assert.match(literal, /^#[0-9a-f]{3,8}$/i, `${name} resolves to "${literal}", not a colour`);
  }
});

test('text tokens clear WCAG AA against the surfaces they sit on', () => {
  const vars = declaredVars(css);
  const lit = (n) => resolve(vars, vars.get(n));
  const surfaces = ['--surface', '--surface-sunk', '--bg'];
  const inks = [
    '--ink', '--ink-muted',
    '--score-excellent', '--score-good', '--score-fair', '--score-poor',
  ];

  for (const s of surfaces) {
    for (const i of inks) {
      const ratio = contrast(lit(i), lit(s));
      assert.ok(ratio >= 4.5, `${i} on ${s} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
    }
  }
});

test('accent ink is legible on the accent', () => {
  const vars = declaredVars(css);
  const lit = (n) => resolve(vars, vars.get(n));
  const ratio = contrast(lit('--accent-ink'), lit('--accent'));
  assert.ok(ratio >= 4.5, `--accent-ink on --accent is ${ratio.toFixed(2)}:1`);
});

test('--ink-nontext is deliberately excluded from the AA text set', () => {
  // It is a legitimate neutral that does NOT clear 4.5:1, which is exactly why
  // it must never be used as a colour. Task 2 adds the rule that enforces that.
  const vars = declaredVars(css);
  const lit = (n) => resolve(vars, vars.get(n));
  const ratio = contrast(lit('--ink-nontext'), lit('--surface'));
  assert.ok(ratio < 4.5, 'if this now passes AA, promote it and delete this test');
  assert.ok(ratio >= 3, `${ratio.toFixed(2)}:1 is too low even for icons and borders`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL on `every semantic token resolves to a defined primitive` with `--bg is not defined`.

- [ ] **Step 3: Add the token layers to app.css**

Insert this **above** the existing `:root` block at `app.css:1`, leaving the existing block untouched below it:

```css
/* === layer 1: primitives =============================================
   Raw values. Referenced only by layer 2, never by a component rule.
   One ramp per dimension: a value that is not on a ramp does not exist. */
:root {
  --n-0: #ffffff;
  --n-50: #f7fafb;
  --n-100: #eef3f6;
  --n-200: #dfe8ee;
  --n-300: #c8d7e0;
  --n-400: #9ab0bd;
  --n-500: #6d8896;
  --n-600: #4d6675;
  --n-700: #33505f;
  --n-800: #1d3644;
  --n-900: #0d1c26;

  --blue-600: #16659e;
  --blue-700: #0f4f7d;

  --green-700: #17803f;
  --olive-700: #4f7a1f;
  --amber-800: #9a6b06;
  --red-700: #b83f30;

  /* 16px is body text and the floor for anything read as a sentence.
     --text-2xs is for uppercase micro-labels and sub-project C's 34px
     forecast columns, which cannot carry more. Nowhere else. */
  --text-3xl: 40px;
  --text-2xl: 24px;
  --text-lg: 20px;
  --text-base: 16px;
  --text-sm: 14px;
  --text-xs: 12.5px;
  --text-2xs: 11px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 999px;
}

/* === layer 2: semantic tokens ========================================
   What a thing does, not what colour it is. Components use only these. */
:root {
  --bg: var(--n-100);
  --surface: var(--n-0);
  --surface-sunk: var(--n-50);
  --line: var(--n-200);
  --line-strong: var(--n-300);

  --ink: var(--n-900);
  --ink-muted: var(--n-600);
  /* Below AA for text by design. Icons, borders, disabled states only. */
  --ink-nontext: var(--n-500);

  --accent: var(--blue-600);
  --accent-ink: var(--n-0);

  --score-excellent: var(--green-700);
  --score-good: var(--olive-700);
  --score-fair: var(--amber-800);
  --score-poor: var(--red-700);

  --shadow-sm: 0 1px 2px rgba(13, 28, 38, 0.06);
  --shadow-md: 0 4px 12px rgba(13, 28, 38, 0.08);
  --shadow-lg: 0 12px 28px rgba(13, 28, 38, 0.12);

  /* Consumed by sub-project B. Defined here so the diagram rewrite cannot
     invent its own palette the way the current diagrams did. */
  --diagram-ground: var(--n-0);
  --diagram-line: var(--n-800);
  --diagram-line-soft: var(--n-400);
  --diagram-hardware: var(--n-600);
  --diagram-accent: var(--blue-600);
  --diagram-callout: var(--amber-800);
  --diagram-label: var(--n-600);
  --diagram-sea: var(--blue-600);
  --diagram-sand: var(--amber-800);
  --diagram-foam: var(--n-200);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, all four token tests green. The rest of the suite stays green - nothing consumed these yet.

- [ ] **Step 5: Commit**

```bash
git add app.css test/tokens.test.mjs
git commit -m "feat: add the primitive and semantic token layers"
```

---

### Task 2: Convert component rules and delete the old palette

Turns the app light. This is the largest diff in the plan and the one that must land atomically: a half-converted stylesheet fails the boundary test, which is the point.

**Files:**
- Modify: `app.css` (whole file - old `:root` deleted, sentinel inserted, every rule converted)
- Modify: `test/tokens.test.mjs` (add the boundary assertions)

**Interfaces:**
- Consumes: every semantic token from Task 1.
- Produces: a stylesheet where the sentinel exists exactly once and nothing below it references a primitive or a literal colour.

- [ ] **Step 1: Write the failing test**

Append to `test/tokens.test.mjs`:

```js
test('the sentinel exists exactly once', () => {
  const first = css.indexOf(SENTINEL);
  assert.notEqual(first, -1, 'sentinel line is missing from app.css');
  assert.equal(css.indexOf(SENTINEL, first + 1), -1, 'sentinel line is duplicated');
});

test('no component rule uses a literal colour', () => {
  const body = css.slice(css.indexOf(SENTINEL) + SENTINEL.length);
  const hexes = body.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  const funcs = body.match(/\b(?:rgba?|hsla?)\s*\(/gi) ?? [];
  assert.deepEqual(hexes, [], `literal hex below the sentinel: ${hexes.join(', ')}`);
  assert.deepEqual(funcs, [], `literal colour function below the sentinel: ${funcs.join(', ')}`);
});

test('no component rule reaches past the semantic layer', () => {
  const body = css.slice(css.indexOf(SENTINEL) + SENTINEL.length);
  const prims = body.match(/var\(\s*--(?:n|blue|green|olive|amber|red)-\d+/gi) ?? [];
  assert.deepEqual(prims, [], `primitive tokens below the sentinel: ${prims.join(', ')}`);
});

test('--ink-nontext is never used as a text colour', () => {
  const body = css.slice(css.indexOf(SENTINEL) + SENTINEL.length);
  const misuse = body.match(/(?<!-)\bcolor\s*:\s*var\(\s*--ink-nontext\s*\)/gi) ?? [];
  assert.deepEqual(misuse, [], 'use --ink-muted for text; --ink-nontext is below AA');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL on `the sentinel exists exactly once` with `sentinel line is missing from app.css`.

- [ ] **Step 3: Convert the stylesheet**

Three edits, in order:

1. **Delete** the original `:root` block (the one starting `--bg: #0a1014;`). Every name in it is replaced by a semantic token; none survive.
2. **Insert** the sentinel on its own line immediately after the layer-2 block:

```css
/* === components: semantic tokens only below this line === */
```

3. **Convert every rule below it.** The mapping from the deleted names:

| Old | New |
|---|---|
| `--bg`, `--bg-glow` | `--bg` |
| `--panel` | `--surface` |
| `--panel-2` | `--surface-sunk` |
| `--ink` | `--ink` (value changes, name does not) |
| `--muted` | `--ink-muted` |
| `--line` | `--line` |
| `--excellent` / `--good` / `--fair` / `--poor` | `--score-excellent` / `--score-good` / `--score-fair` / `--score-poor` |
| `--accent`, `--accent-2` | `--accent`, and `--blue-700` promoted to a semantic `--accent-strong` if a second step is genuinely needed |
| `--accent-ink` | `--accent-ink` |
| `--focus-ring` | `--accent` |
| `--radius-sm/md/lg/xl` | `--radius-sm/md/lg`; the 22px step becomes `--radius-lg` |
| `--shadow-sm/md/lg` | same names, now semantic and far softer |
| `--transition-fast`, `--transition-lift` | keep as semantic tokens above the sentinel |
| `--ramp-wind-*`, `--ramp-tide-*`, `--ramp-score-*` | **leave as primitives above the sentinel for now.** They are sub-project C's problem; they are dark-palette values and will look wrong until C lands. Add a comment saying exactly that. |
| `--hatch-opacity` | keep as a semantic token above the sentinel |
| `--diagram-*` (old values) | delete; the layer-2 set replaces them |

Every literal `rgba(...)` in a `box-shadow` becomes `var(--shadow-sm|md|lg)`. Any remaining literal below the sentinel is a conversion miss and the test names it.

Note on the ramps: they are dark values sitting above the sentinel, so the boundary test permits them, and the forecast table will look out of place until sub-project C. The spec accepts this.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. If `no component rule uses a literal colour` fails, the message lists each miss - fix and rerun.

- [ ] **Step 5: Browser check**

Run: `npm run serve`, open `http://127.0.0.1:8090`.
Expected: the app is light throughout. The forecast table's severity cells still look dark and out of place - that is Task 2's accepted outcome, not a bug.

- [ ] **Step 6: Commit**

```bash
git add app.css test/tokens.test.mjs
git commit -m "feat: convert every component rule to semantic tokens"
```

---

### Task 3: Add swell to summariseSpot

The hero's 2x2 grid needs wind, tide, swell and next high. `summariseSpot` returns the first, second and fourth. This adds the third rather than letting the view compute it separately.

**Files:**
- Modify: `js/spot-summary.js:39-61` (the `summariseSpot` return object)
- Test: `test/spot-summary.test.mjs` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `summariseSpot(hours, windows, tides, now)` gains `swell: { height: number|null, period: number|null }`. All existing fields keep their names and types: `score`, `wind: {speed, direction}`, `tide: {state, height, nextTurn: {type, time}}`, `nextWindow: {start, end, score}`.

- [ ] **Step 1: Write the failing test**

Append to `test/spot-summary.test.mjs`:

```js
test('the summary carries the swell reading for the current hour', () => {
  const hours = [
    { time: new Date('2026-09-07T09:00:00Z'), final: 72, windSpeed: 19, windDirection: 45,
      seaLevel: 1.2, swellHeight: 1.6, swellPeriod: 11 },
  ];
  const card = summariseSpot(hours, [], [], new Date('2026-09-07T09:00:00Z'));

  assert.equal(card.swell.height, 1.6);
  assert.equal(card.swell.period, 11);
});

test('a missing swell reading reports null rather than NaN', () => {
  const hours = [
    { time: new Date('2026-09-07T09:00:00Z'), final: 72, windSpeed: 19, windDirection: 45,
      seaLevel: 1.2 },
  ];
  const card = summariseSpot(hours, [], [], new Date('2026-09-07T09:00:00Z'));

  assert.equal(card.swell.height, null);
  assert.equal(card.swell.period, null);
});

test('an empty hour series still yields a swell shape', () => {
  // The hero destructures summary.swell unconditionally; it must always exist.
  const card = summariseSpot([], [], [], new Date('2026-09-07T09:00:00Z'));

  assert.deepEqual(card.swell, { height: null, period: null });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/spot-summary.test.mjs`
Expected: FAIL with `Cannot read properties of undefined (reading 'height')`.

- [ ] **Step 3: Add the field**

In `js/spot-summary.js`, inside the object returned by `summariseSpot`, after the `wind` block:

```js
    swell: {
      height: Number.isFinite(hour?.swellHeight) ? hour.swellHeight : null,
      period: Number.isFinite(hour?.swellPeriod) ? hour.swellPeriod : null,
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. `js/ui-spots-tab.js` consumes this summary and is unaffected - the change is purely additive.

- [ ] **Step 5: Commit**

```bash
git add js/spot-summary.js test/spot-summary.test.mjs
git commit -m "feat: carry the swell reading on the spot summary"
```

---

### Task 4: The map disclosure module

A pure decision function plus two storage helpers, mirroring `js/tabs.js`. No DOM, so it is fully testable.

**Files:**
- Create: `js/map-disclosure.js`
- Create: `test/map-disclosure.test.mjs`
- Modify: `sw.js` (add the new module to `SHELL`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `initialMapOpen(stored: string|null, spotCount: number) => boolean`
  - `readMapOpen(storage?) => string|null`
  - `rememberMapOpen(open: boolean, storage?) => void`

- [ ] **Step 1: Write the failing test**

Create `test/map-disclosure.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMapOpen, readMapOpen, rememberMapOpen } from '../js/map-disclosure.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

const hostileStorage = () => ({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
});

test('with no saved spots the map opens whatever was remembered', () => {
  // A remembered "closed" plus no spots is a dead end: an empty hero and no
  // visible way to pick a spot. The heuristic wins here on purpose.
  assert.equal(initialMapOpen('closed', 0), true);
  assert.equal(initialMapOpen('open', 0), true);
  assert.equal(initialMapOpen(null, 0), true);
});

test('with saved spots the remembered choice wins', () => {
  assert.equal(initialMapOpen('open', 3), true);
  assert.equal(initialMapOpen('closed', 3), false);
});

test('with saved spots and nothing remembered the map starts closed', () => {
  assert.equal(initialMapOpen(null, 3), false);
});

test('an unrecognised stored value falls back rather than throwing', () => {
  assert.equal(initialMapOpen('maybe', 3), false);
  assert.equal(initialMapOpen('maybe', 0), true);
});

test('the preference round-trips through storage', () => {
  const storage = fakeStorage();
  rememberMapOpen(true, storage);
  assert.equal(readMapOpen(storage), 'open');
  rememberMapOpen(false, storage);
  assert.equal(readMapOpen(storage), 'closed');
});

test('blocked storage costs the preference, never the map', () => {
  assert.doesNotThrow(() => rememberMapOpen(true, hostileStorage()));
  assert.equal(readMapOpen(hostileStorage()), null);
  assert.equal(readMapOpen(null), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/map-disclosure.test.mjs`
Expected: FAIL with `Cannot find module '../js/map-disclosure.js'`.

- [ ] **Step 3: Write the module**

Create `js/map-disclosure.js`:

```js
// Whether the map disclosure starts open. No DOM here, matching js/tabs.js:
// this owns the answer, the view owns the element.

const KEY = 'fc:map-open';

export function initialMapOpen(stored, spotCount) {
  // Nothing saved means nothing to show in the hero, so the map has to be
  // the thing on screen regardless of what was remembered last time.
  if (!spotCount) return true;
  return stored === 'open';
}

export function readMapOpen(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberMapOpen(open, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, open ? 'open' : 'closed');
  } catch {
    // Storage full or blocked. Costs the memory of a preference, nothing more.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: `map-disclosure` tests PASS; `smoke.test.mjs` FAILS with `not precached: map-disclosure.js`.

- [ ] **Step 5: Add the module to the service worker**

In `sw.js`, inside the `SHELL` array, after `'./js/map.js',`:

```js
  './js/map-disclosure.js',
```

- [ ] **Step 6: Run the tests to verify the suite is green**

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 7: Commit**

```bash
git add js/map-disclosure.js test/map-disclosure.test.mjs sw.js
git commit -m "feat: add the map disclosure state module"
```

---

### Task 5: Restructure the frame

The markup move. No new visual design yet - Task 7 styles it. After this task the app is structurally correct and slightly ugly.

**Files:**
- Modify: `index.html:12-34` (header and map region)
- Modify: `js/main.js:29-48` (the `els` block) and the map init call at `js/main.js:384`
- Modify: `js/map.js:26-45` (add `invalidateSize` to the returned facade)

**Interfaces:**
- Consumes: `initialMapOpen`, `readMapOpen`, `rememberMapOpen` from Task 4.
- Produces: `initMap(...)` facade gains `invalidateSize(): void`. `els.mapDetails` is the `<details>` element. `els.spotName` now resolves to a node inside `<header>`.

- [ ] **Step 1: Restructure the markup**

In `index.html`, replace the header, map and preview region (currently lines 12-24) with:

```html
<header class="topbar">
  <h1 id="spot-name" class="spot-name">Fishing Conditions</h1>
  <button id="search-toggle" class="search-toggle" type="button"
          aria-expanded="false" aria-controls="spot-search-form">
    <span class="visually-hidden">Search for a place</span>
    <span aria-hidden="true">&#9906;</span>
  </button>
  <form id="spot-search-form" class="search" role="search" hidden>
    <input id="spot-search" type="search" placeholder="Search a place, or tap the map" autocomplete="off"
           role="combobox" aria-controls="spot-results" aria-expanded="false" aria-autocomplete="list">
    <button type="submit">Find</button>
  </form>
  <ul id="spot-results" class="results" role="listbox" aria-label="Place suggestions" hidden></ul>
</header>
```

Then, inside `<main>` and **above** the hero card, place the map disclosure:

```html
  <details id="map-details" class="map-details">
    <summary class="map-summary">Map &mdash; tap to pick a spot</summary>
    <div id="map" aria-label="Pick a fishing spot"></div>
    <section id="preview" class="preview" aria-live="polite" hidden></section>
  </details>
```

Finally, remove `<p id="spot-name" class="spot-name">` from the hero card - it now lives in the header. The hero becomes:

```html
  <div class="hero-card">
    <section id="now-bar" class="now-bar" aria-label="Right now"></section>
    <p id="status" class="status" role="status"></p>
  </div>
```

- [ ] **Step 2: Add invalidateSize to the map facade**

In `js/map.js`, add to the object returned by `initMap`, before `moveTo`:

```js
    // Leaflet measures zero inside a closed <details>, so the map must be told
    // to re-measure when the disclosure opens. rAF rather than a bare call:
    // the toggle event fires before the browser has laid the element out.
    // A timeout would be a guess about how long that takes.
    invalidateSize() {
      requestAnimationFrame(() => map.invalidateSize());
    },
```

- [ ] **Step 3: Wire the disclosure in main.js**

Add the import beside the other module imports at the top of `js/main.js`:

```js
import { initialMapOpen, readMapOpen, rememberMapOpen } from './map-disclosure.js';
```

Add to the `els` object:

```js
  mapDetails: $('map-details'),
  searchToggle: $('search-toggle'),
```

After the `const map = initMap(...)` line at `js/main.js:384`, add:

```js
els.mapDetails.open = initialMapOpen(readMapOpen(), state.spots.length);
if (els.mapDetails.open) map.invalidateSize();

els.mapDetails.addEventListener('toggle', () => {
  rememberMapOpen(els.mapDetails.open);
  if (els.mapDetails.open) map.invalidateSize();
});
```

And wire the search toggle:

```js
els.searchToggle.addEventListener('click', () => {
  const open = els.searchForm.hidden;
  els.searchForm.hidden = !open;
  els.searchToggle.setAttribute('aria-expanded', String(open));
  if (open) els.search.focus();
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. No test reads `index.html` structure, so this is a regression check on the modules.

- [ ] **Step 5: Browser check**

Run: `npm run serve`.
Expected, with no saved spots: the disclosure is open and the map renders at full width. Collapse it, reload - it stays closed only if a spot is saved. With a spot saved, collapse and reload: still closed. Expand: the map renders at full size, not a sliver. The search icon expands the field and focuses it.

- [ ] **Step 6: Commit**

```bash
git add index.html js/main.js js/map.js
git commit -m "feat: move the map into a disclosure and promote the spot name"
```

---

### Task 6: The hero card

Replaces `renderNow`'s 12-cell strip output with the answer-first card. The strip goes: it is a miniature of the forecast table, which is one tab away.

**Files:**
- Modify: `js/ui.js:46-74` (`renderNow`)
- Modify: `js/main.js` (the `renderNow` call site)
- Test: `test/ui.test.mjs` (extend)

**Interfaces:**
- Consumes: `summariseSpot(...)` including `swell` from Task 3; `scoreBand`, `compass`, `hhmm`, `dayLabel`, `timeRange` from `js/format.js`.
- Produces: `renderHero(target, summary, options?)` where `options` is `{ onPickSpot?: () => void, now?: Date }`. `renderNow` is removed; no other module may call it.

**Deviation from the spec, flagged for review.** The spec describes two separate
elements: the slot the score applies to, inside the hero, and a "Next best"
strip below it. This task renders one line, not two. `summariseSpot` exposes
`nextWindow` but not the current slot's time range, so honouring the spec
literally would mean either a second model change or a second data path in the
view - and the two lines would frequently read almost identically, since the
current slot is often inside the next good window. One line, showing
`nextWindow`, is the simplification. If you want both, the fix is to add the
current slot's range to `summariseSpot` in Task 3.

- [ ] **Step 1: Write the failing test**

Append to `test/ui.test.mjs`:

Add `renderHero` to the existing `import { setStatus } from '../js/ui.js';` line at
the top of the file, then append the rest:

```js
// Minimal DOM stub, same approach as test/ui-hotspots.test.mjs.
function makeNode(tag = 'div') {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    children: [],
    textContent: '',
    className: '',
    classList: {
      add: (...n) => n.forEach((x) => classes.add(x)),
      remove: (...n) => n.forEach((x) => classes.delete(x)),
      contains: (n) => classes.has(n),
    },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
    addEventListener() {},
  };
  return node;
}

function installDom() {
  globalThis.document = { createElement: (tag) => makeNode(tag) };
}

const text = (node) => [node.textContent, ...node.children.map(text)].join(' ').trim();

const SUMMARY = {
  score: 68,
  wind: { speed: 19, direction: 200 },
  tide: { state: 'rising', height: 1.2, nextTurn: { type: 'high', time: new Date('2026-09-07T14:20:00Z') } },
  swell: { height: 1.6, period: 11 },
  nextWindow: { start: new Date('2026-09-08T05:30:00Z'), end: new Date('2026-09-08T08:00:00Z'), score: 74 },
};

test('the hero leads with the score and its band', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY);

  assert.match(text(target), /68/);
  assert.equal(target.classList.contains('band-good'), true);
});

test('the hero shows wind in km/h, matching the rest of the app', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY);

  assert.match(text(target), /19 km\/h/);
  assert.doesNotMatch(text(target), /kt\b/);
});

test('the hero reports swell and the next tide turn', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY);
  const out = text(target);

  assert.match(out, /1\.6 m/);
  assert.match(out, /rising/i);
});

test('a missing reading renders a dash rather than null or NaN', () => {
  installDom();
  const target = makeNode();

  renderHero(target, {
    score: 41,
    wind: { speed: null, direction: null },
    tide: { state: null, height: null, nextTurn: null },
    swell: { height: null, period: null },
    nextWindow: null,
  });
  const out = text(target);

  assert.doesNotMatch(out, /null|NaN|undefined/);
});

test('with no spot the hero offers a way to pick one', () => {
  installDom();
  const target = makeNode();
  let asked = 0;

  renderHero(target, null, { onPickSpot: () => { asked += 1; } });

  assert.match(text(target), /pick a spot/i);
  assert.equal(target.children.length > 0, true);
});

test('re-rendering clears the previous band rather than stacking bands', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY);
  renderHero(target, { ...SUMMARY, score: 12 });

  assert.equal(target.classList.contains('band-good'), false);
  assert.equal(target.classList.contains('band-poor'), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui.test.mjs`
Expected: FAIL with `renderHero is not a function` (or an import error naming it).

- [ ] **Step 3: Implement renderHero**

In `js/ui.js`, delete `renderNow` and `metricsLine`, and add:

```js
const DASH = '—';

function metric(label, value) {
  const cell = el('div', 'metric');
  cell.appendChild(el('span', 'metric-key', label));
  cell.appendChild(el('span', 'metric-value', value));
  return cell;
}

function emptyHero(onPickSpot) {
  const empty = el('div', 'hero-empty');
  empty.appendChild(el('p', 'hero-empty-text', 'Pick a spot to see conditions.'));
  const button = el('button', 'hero-empty-action', 'Open the map');
  button.type = 'button';
  if (onPickSpot) button.addEventListener('click', onPickSpot);
  empty.appendChild(button);
  return empty;
}

export function renderHero(target, summary, { onPickSpot, now = new Date() } = {}) {
  target.replaceChildren();
  target.classList.remove(...BANDS);

  if (!summary || summary.score === null || summary.score === undefined) {
    target.appendChild(emptyHero(onPickSpot));
    return;
  }

  const band = scoreBand(summary.score);
  target.classList.add(`band-${band}`);

  const verdict = el('div', 'hero-verdict');
  verdict.appendChild(el('span', 'hero-score', String(summary.score)));
  verdict.appendChild(el('span', 'hero-word', VERDICTS[band]));
  if (summary.nextWindow) {
    verdict.appendChild(el(
      'span',
      'hero-when',
      `${dayLabel(summary.nextWindow.start, now)} ${timeRange(summary.nextWindow.start, summary.nextWindow.end)}`,
    ));
  }
  target.appendChild(verdict);

  const grid = el('div', 'hero-metrics');
  grid.appendChild(metric(
    'Wind',
    Number.isFinite(summary.wind.speed)
      ? `${Math.round(summary.wind.speed)} km/h ${compass(summary.wind.direction)}`.trim()
      : DASH,
  ));
  grid.appendChild(metric('Tide', summary.tide.state ?? DASH));
  grid.appendChild(metric(
    'Swell',
    Number.isFinite(summary.swell.height) ? `${summary.swell.height.toFixed(1)} m` : DASH,
  ));
  grid.appendChild(metric(
    'Next turn',
    summary.tide.nextTurn ? `${summary.tide.nextTurn.type} ${hhmm(summary.tide.nextTurn.time)}` : DASH,
  ));
  target.appendChild(grid);
}
```

- [ ] **Step 4: Update the call site**

In `js/main.js`, change the import from `renderNow` to `renderHero`, and replace the `renderNow(els.now, ...)` call with:

```js
  renderHero(els.now, summariseSpot(view.hours, windows, tides), {
    onPickSpot: () => { els.mapDetails.open = true; },
  });
```

Use the same `windows` and `tides` values already computed at that call site for `renderWindows` and the day table. Where no spot is active, call `renderHero(els.now, null, { onPickSpot })`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. Any remaining reference to `renderNow` fails the import - remove it.

- [ ] **Step 6: Commit**

```bash
git add js/ui.js js/main.js test/ui.test.mjs
git commit -m "feat: render the hero as an answer-first card"
```

---

### Task 7: Chrome styling

The visual pass. Everything before this was structure; this is where the app stops looking unfinished.

**Files:**
- Modify: `app.css` (component rules below the sentinel only)

**Interfaces:**
- Consumes: every semantic token; the class names emitted in Tasks 5 and 6 (`topbar`, `spot-name`, `search-toggle`, `map-details`, `map-summary`, `hero-card`, `hero-verdict`, `hero-score`, `hero-word`, `hero-when`, `hero-metrics`, `metric`, `metric-key`, `metric-value`, `hero-empty`, `hero-empty-text`, `hero-empty-action`).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the visually-hidden utility**

Task 5's markup uses it for the search button label. Below the sentinel:

```css
.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Style the topbar**

```css
.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.topbar .spot-name {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.2px;
  color: var(--ink);
}

.search-toggle {
  margin-left: auto;
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-sunk);
  color: var(--ink-muted);
  font-size: var(--text-base);
}
```

- [ ] **Step 3: Style the map disclosure**

```css
.map-details {
  margin: var(--space-3) var(--space-4) 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.map-summary {
  padding: var(--space-3) var(--space-4);
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.map-details #map {
  height: 38vh;
}
```

- [ ] **Step 4: Style the hero**

```css
.hero-card {
  margin: var(--space-3) var(--space-4);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.hero-verdict {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hero-score {
  font-size: var(--text-3xl);
  font-weight: 700;
  line-height: 0.92;
  letter-spacing: -2px;
}

.hero-word { font-size: var(--text-base); font-weight: 650; }

.hero-when {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.band-excellent .hero-score, .band-excellent .hero-word { color: var(--score-excellent); }
.band-good .hero-score, .band-good .hero-word { color: var(--score-good); }
.band-fair .hero-score, .band-fair .hero-word { color: var(--score-fair); }
.band-poor .hero-score, .band-poor .hero-word { color: var(--score-poor); }

.hero-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin-top: var(--space-4);
  background: var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.metric {
  background: var(--surface-sunk);
  padding: var(--space-2) var(--space-3);
}

.metric-key {
  display: block;
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 700;
  color: var(--ink-muted);
}

.metric-value {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 620;
  color: var(--ink);
}

.hero-empty { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
.hero-empty-text { margin: 0; color: var(--ink-muted); font-size: var(--text-base); }

.hero-empty-action {
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-ink);
  font-size: var(--text-sm);
  font-weight: 620;
}
```

- [ ] **Step 5: Style the tab strip as a segmented control**

```css
.tabs {
  display: flex;
  gap: var(--space-1);
  margin: var(--space-4) var(--space-4) var(--space-3);
  padding: var(--space-1);
  background: var(--surface-sunk);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.tab {
  flex: 1;
  min-height: 40px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-muted);
  font-size: var(--text-sm);
  font-weight: 620;
}

.tab[aria-selected="true"] {
  background: var(--accent);
  color: var(--accent-ink);
}

.tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Demote the tide notice**

```css
.tide-notice {
  margin: var(--space-6) var(--space-4) var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--ink-muted);
}

.tide-notice strong { color: var(--ink); }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including the boundary test - every rule above uses semantic tokens only.

- [ ] **Step 8: Screenshot check**

Run `npm run serve`, then drive headless Chromium per the Global Constraints and capture 390x844 and 1100x900. **Read the PNGs.** This is the gate the whole sub-project is judged on, so it is a screenshot, not a source review.

Capture four states: first run with `localStorage` cleared; a spot selected with the map collapsed; the same with the map expanded; and the 7 days tab.

Verify:
- with a spot selected and the map collapsed, the score is visible without scrolling
- the map expands and Leaflet renders full-size on first open
- disclosure state survives a reload
- first run (clear `localStorage`) opens with the map expanded
- no horizontal overflow at 390px
- keyboard: Tab reaches the search button, the summary and all three tabs; arrow keys still cycle the tabs
- the status line still appears on load and on error

- [ ] **Step 9: Commit**

```bash
git add app.css
git commit -m "feat: style the topbar, hero, map disclosure and tab strip"
```

---

## Definition of done

- `npm test` green, including `test/tokens.test.mjs` and `test/map-disclosure.test.mjs`.
- The score for the active spot is above the fold at 390x844 with the map collapsed.
- No literal colour and no primitive token appears below the sentinel in `app.css`.
- The forecast table and the Learn diagrams are visibly inconsistent with the new chrome. This is expected and is the subject of sub-projects C and B.
