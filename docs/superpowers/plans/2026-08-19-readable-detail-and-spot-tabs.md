# Readable Detail & Spot Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sideways-scrolling day table with readable hourly bands plus a tap-for-detail panel, and put saved spots behind a Spots / 7 Days tab switch so every spot's current state is visible on one screen.

**Architecture:** All new logic lands in small pure modules (`bands.js`, `spot-summary.js`, `tabs.js`) that are unit-tested without a DOM; the view modules (`ui-days.js`, `ui-spots-tab.js`) only turn those models into elements. Nothing above the view changes — `api.js`, `score.js` and `astro.js` are untouched, and `daily.js` gains one additive field.

**Tech Stack:** Vanilla JS ES2022 modules, no bundler, no runtime dependencies. Tests: `node --test` (Node 22.13.0) via `npm test`. Browser verification: Playwright, driven from `file:///C:/azure repo/personal-tools/projects/price-checker/node_modules/playwright/index.mjs`. Served by a Podman container (`fishing-conditions:1.0.0`, container `fishing`, port 8080).

**Spec:** `docs/superpowers/specs/2026-08-19-readable-detail-and-spot-tabs-design.md`

## Global Constraints

- No new runtime dependencies, no backend, no API keys — unchanged from v1
- Vanilla ES modules only; every new `js/*.js` file MUST be added to `SHELL` in `sw.js` or the app breaks offline
- All `localStorage` keys use the `fc:` prefix so the existing `clearAll()` wipe reaches them
- Forecast hours carry **local wall-clock times stamped as UTC** — always read them with UTC getters (`getUTCHours()`), never local ones
- Comments explain *why*, not *what*; match the density of the surrounding code
- Commit after every task

---

### Task 1: Band geometry (`js/bands.js`)

Pure maths turning an hourly series into bar heights. No DOM.

**Files:**
- Create: `js/bands.js`
- Test: `test/bands.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `buildBand(values, {minBarPct = 6} = {}) -> {bars: [{value, pct}], min, max, hasData}`
  - `extremaMarkers(tides, key) -> [{index, type, time, height}]` where `index` is the 0–23 hour of the bar and `key` is a `YYYY-MM-DD` day key

- [ ] **Step 1: Write the failing test**

Create `test/bands.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBand, extremaMarkers } from '../js/bands.js';

test('bars span the full height between the low and high of the day', () => {
  const band = buildBand([0, 5, 10]);

  assert.equal(band.min, 0);
  assert.equal(band.max, 10);
  assert.equal(band.bars[0].pct, 6, 'the lowest value still gets a visible bar');
  assert.equal(band.bars[2].pct, 100, 'the highest value fills the band');
  assert.ok(band.bars[1].pct > 50 && band.bars[1].pct < 54, 'the middle sits mid-band');
});

test('a flat series draws a level band, not an empty one', () => {
  // A windless day is real data and should look like a calm line, not a
  // rendering failure.
  const band = buildBand([12, 12, 12]);

  assert.ok(band.hasData);
  assert.deepEqual(band.bars.map((b) => b.pct), [50, 50, 50]);
});

test('a series with no readings reports no data instead of dividing by zero', () => {
  const band = buildBand([null, null, null]);

  assert.equal(band.hasData, false);
  assert.deepEqual(band.bars.map((b) => b.pct), [0, 0, 0]);
  assert.equal(band.min, null);
  assert.equal(band.max, null);
});

test('gaps inside a series stay gaps', () => {
  const band = buildBand([0, null, 10]);

  assert.equal(band.bars[1].pct, 0);
  assert.equal(band.bars[1].value, null);
  assert.equal(band.bars[2].pct, 100);
});

test('tide turns are placed on the bar for their own hour', () => {
  const tides = [
    { time: new Date('2026-08-19T04:00:00Z'), type: 'high', height: 1.8 },
    { time: new Date('2026-08-19T10:00:00Z'), type: 'low', height: 0.3 },
    { time: new Date('2026-08-20T05:00:00Z'), type: 'high', height: 1.7 },
  ];

  const marks = extremaMarkers(tides, '2026-08-19');

  assert.deepEqual(marks.map((m) => m.index), [4, 10], 'the next day is not our problem');
  assert.equal(marks[0].type, 'high');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bands.test.mjs`
Expected: FAIL with `Cannot find module '.../js/bands.js'`

- [ ] **Step 3: Write the implementation**

Create `js/bands.js`:

```js
// Turns an hourly series into bar heights for the day cards. Kept free of the
// DOM so the awkward parts -- flat days, missing readings, where a tide turn
// lands -- can be tested directly.

// Every real reading gets at least this much height. A bar of zero pixels
// reads as missing data, and "calm" is not the same as "no reading".
const MIN_BAR_PCT = 6;

export function buildBand(values, { minBarPct = MIN_BAR_PCT } = {}) {
  const real = values.filter(Number.isFinite);

  if (!real.length) {
    return {
      bars: values.map(() => ({ value: null, pct: 0 })),
      min: null,
      max: null,
      hasData: false,
    };
  }

  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min;

  const bars = values.map((value) => {
    if (!Number.isFinite(value)) return { value: null, pct: 0 };
    // A windless day has no span to scale against. Drawing it half height
    // says "steady" where scaling would either divide by zero or flatten it
    // to nothing.
    if (span === 0) return { value, pct: 50 };
    const fraction = (value - min) / span;
    return { value, pct: minBarPct + fraction * (100 - minBarPct) };
  });

  return { bars, min, max, hasData: true };
}

// Tide turns are found across the whole 7-day series, so they arrive here
// carrying days we are not drawing.
export function extremaMarkers(tides, key) {
  return tides
    .filter((t) => dayKeyOf(t.time) === key)
    .map((t) => ({
      index: t.time.getUTCHours(),
      type: t.type,
      time: t.time,
      height: t.height,
    }));
}

function dayKeyOf(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bands.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add js/bands.js test/bands.test.mjs
git commit -m "feat: band geometry for the day cards"
```

---

### Task 2: Hourly series on each day (`js/daily.js`)

The day summary currently exposes only 3-hour means. A tide curve drawn from those has peaks up to 90 minutes away from the printed high/low times, so the bands need the raw hours.

**Files:**
- Modify: `js/daily.js` (the object returned by `summariseDays`)
- Test: `test/daily.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: each day object gains `series: {tide: number[], wind: number[], score: number[]}`, one entry per hour of that day

(`tideExtremes` is already exported from `js/daily.js` and already imported by `test/daily.test.mjs` — Task 3 can import it as-is, no change needed.)

- [ ] **Step 1: Write the failing test**

Append to `test/daily.test.mjs`:

```js
test('each day carries its raw hourly series for the bands', () => {
  const days = summariseDays(HOURS, -29.85, 31.05, 7200);
  const day = days[0];

  assert.equal(day.series.tide.length, day.hours.length);
  assert.equal(day.series.wind.length, day.hours.length);
  assert.equal(day.series.score.length, day.hours.length);

  // Hourly, not the 3-hour means: a 24-hour day must give 24 points, which is
  // what puts a tide peak on the right bar.
  assert.equal(day.series.score[0], day.hours[0].final);
  assert.equal(day.series.tide[3], day.hours[3].seaLevel);
  assert.equal(day.series.wind[5], day.hours[5].windSpeed);
});
```

(`HOURS` is the fixture the existing tests in that file already build — reuse it rather than declaring a second one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/daily.test.mjs`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'tide')`

- [ ] **Step 3: Write the implementation**

In `js/daily.js`, in the object returned by `summariseDays`, immediately after the `slots: toSlots(hours),` line (line 150), add:

```js
      // The bands draw hourly. slots above are 3-hour means, which would put a
      // tide peak up to 90 minutes away from the high-water time printed
      // beside it.
      series: {
        tide: hours.map((h) => h.seaLevel),
        wind: hours.map((h) => h.windSpeed),
        score: hours.map((h) => h.final),
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, all existing tests still green

- [ ] **Step 5: Commit**

```bash
git add js/daily.js test/daily.test.mjs
git commit -m "feat: expose the hourly series from the day summary"
```

---

### Task 3: Spot card model (`js/spot-summary.js`)

What a Spots-tab card needs to say, derived once per spot. No DOM.

**Files:**
- Create: `js/spot-summary.js`
- Test: `test/spot-summary.test.mjs`

**Interfaces:**
- Consumes: `tideExtremes(scoredHours)` from `js/daily.js` (already exported); `findWindows(scoredHours)` from `js/windows.js` (existing, returns objects with `{start, end, peakFinal}`)
- Produces: `summariseSpot(hours, windows, tides, now = new Date()) -> {score, wind: {speed, direction}, tide: {state, height, nextTurn}, nextWindow}` where `state` is `'rising' | 'falling' | 'slack' | null`, `nextTurn` is `{type, time} | null`, and `nextWindow` is `{start, end, score} | null`

- [ ] **Step 1: Write the failing test**

Create `test/spot-summary.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseSpot } from '../js/spot-summary.js';

const H = (hour, { seaLevel = 1, final = 50, windSpeed = 12, windDirection = 45 } = {}) => ({
  time: new Date(Date.UTC(2026, 7, 19, hour)),
  seaLevel,
  final,
  windSpeed,
  windDirection,
});

const NOW = new Date(Date.UTC(2026, 7, 19, 10));

test('a rising tide is reported as rising', () => {
  const hours = [H(9, { seaLevel: 1.0 }), H(10, { seaLevel: 1.4 }), H(11, { seaLevel: 1.7 })];

  const card = summariseSpot(hours, [], [], NOW);

  assert.equal(card.tide.state, 'rising');
  assert.equal(card.tide.height, 1.4);
});

test('a falling tide is reported as falling', () => {
  const hours = [H(9, { seaLevel: 1.7 }), H(10, { seaLevel: 1.3 }), H(11, { seaLevel: 0.9 })];

  assert.equal(summariseSpot(hours, [], [], NOW).tide.state, 'falling');
});

test('a tide barely moving is slack, not a coin flip between rising and falling', () => {
  const hours = [H(9, { seaLevel: 1.40 }), H(10, { seaLevel: 1.41 }), H(11, { seaLevel: 1.41 })];

  assert.equal(summariseSpot(hours, [], [], NOW).tide.state, 'slack');
});

test('an inland spot has no tide state at all', () => {
  const hours = [H(9, { seaLevel: null }), H(10, { seaLevel: null })];

  const card = summariseSpot(hours, [], [], NOW);

  assert.equal(card.tide.state, null);
  assert.equal(card.tide.height, null);
});

test('the next turn is the first one still ahead of us', () => {
  const tides = [
    { time: new Date(Date.UTC(2026, 7, 19, 4)), type: 'high', height: 1.8 },
    { time: new Date(Date.UTC(2026, 7, 19, 16)), type: 'high', height: 1.9 },
  ];

  const card = summariseSpot([H(10)], [], tides, NOW);

  assert.equal(card.tide.nextTurn.time.getUTCHours(), 16, 'the 04:00 high is behind us');
});

test('the next window skips windows that have already closed', () => {
  const windows = [
    { start: new Date(Date.UTC(2026, 7, 19, 5)), end: new Date(Date.UTC(2026, 7, 19, 8)), peakFinal: 88 },
    { start: new Date(Date.UTC(2026, 7, 19, 15)), end: new Date(Date.UTC(2026, 7, 19, 18)), peakFinal: 81 },
  ];

  const card = summariseSpot([H(10)], windows, [], NOW);

  assert.equal(card.nextWindow.score, 81);
  assert.equal(card.nextWindow.start.getUTCHours(), 15);
});

test('a spot with nothing worth fishing says so rather than showing a blank', () => {
  assert.equal(summariseSpot([H(10)], [], [], NOW).nextWindow, null);
});

test('the score and wind come from the hour we are actually in', () => {
  const hours = [
    H(9, { final: 30, windSpeed: 8, windDirection: 90 }),
    H(10, { final: 72, windSpeed: 19, windDirection: 45 }),
    H(11, { final: 40, windSpeed: 25, windDirection: 20 }),
  ];

  const card = summariseSpot(hours, [], [], NOW);

  assert.equal(card.score, 72);
  assert.equal(card.wind.speed, 19);
  assert.equal(card.wind.direction, 45);
});

test('an empty forecast produces an empty card rather than throwing', () => {
  const card = summariseSpot([], [], [], NOW);

  assert.equal(card.score, null);
  assert.equal(card.tide.state, null);
  assert.equal(card.nextWindow, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/spot-summary.test.mjs`
Expected: FAIL with `Cannot find module '.../js/spot-summary.js'`

- [ ] **Step 3: Write the implementation**

Create `js/spot-summary.js`:

```js
// One spot, boiled down to the four things worth reading off a list: how it
// scores now, which way the tide is going, what the wind is doing, and when
// the next decent window opens.

// Below this much movement in an hour the tide is not meaningfully going
// anywhere, and calling it "rising" on a 1 cm change is noise dressed as
// information.
const SLACK_M = 0.03;

const nearestIndex = (hours, now) => {
  let best = -1;
  let gap = Infinity;
  hours.forEach((h, i) => {
    const d = Math.abs(h.time - now);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
};

function tideState(hours, i) {
  const here = hours[i]?.seaLevel;
  if (!Number.isFinite(here)) return null;

  // Compare against the previous hour where there is one, the next where
  // there is not, so the first hour of the series still gets a direction.
  const other = Number.isFinite(hours[i - 1]?.seaLevel) ? hours[i - 1].seaLevel
    : (Number.isFinite(hours[i + 1]?.seaLevel) ? hours[i + 1].seaLevel : null);
  if (other === null) return 'slack';

  const delta = i > 0 ? here - other : other - here;
  if (Math.abs(delta) < SLACK_M) return 'slack';
  return delta > 0 ? 'rising' : 'falling';
}

export function summariseSpot(hours, windows, tides, now = new Date()) {
  const i = nearestIndex(hours, now);
  const hour = i >= 0 ? hours[i] : null;

  const upcoming = windows.find((w) => w.end > now) ?? null;
  const nextTurn = tides.find((t) => t.time > now) ?? null;

  return {
    score: hour ? hour.final : null,
    wind: {
      speed: hour ? hour.windSpeed : null,
      direction: hour ? hour.windDirection : null,
    },
    tide: {
      state: hour ? tideState(hours, i) : null,
      height: Number.isFinite(hour?.seaLevel) ? hour.seaLevel : null,
      nextTurn: nextTurn ? { type: nextTurn.type, time: nextTurn.time } : null,
    },
    nextWindow: upcoming
      ? { start: upcoming.start, end: upcoming.end, score: upcoming.peakFinal }
      : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/spot-summary.test.mjs`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add js/spot-summary.js test/spot-summary.test.mjs
git commit -m "feat: spot card model for the Spots tab"
```

---

### Task 4: Tab state (`js/tabs.js`)

Which tab is showing, and remembering it. Deliberately DOM-free — the view applies the attributes, this only owns the state.

**Files:**
- Create: `js/tabs.js`
- Test: `test/tabs.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `initialTab(names, stored) -> string` (falls back to `names[0]`)
  - `createTabs({names, storage = globalThis.localStorage, storageKey = 'fc:tab', onChange = () => {}}) -> {current(), select(name), names}`

- [ ] **Step 1: Write the failing test**

Create `test/tabs.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTab, createTabs } from '../js/tabs.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

const NAMES = ['spots', 'days'];

test('with nothing remembered the first tab wins', () => {
  assert.equal(initialTab(NAMES, null), 'spots');
});

test('a remembered tab is restored', () => {
  assert.equal(initialTab(NAMES, 'days'), 'days');
});

test('a stored value we no longer recognise falls back rather than blanking the page', () => {
  // A renamed or removed tab must not leave the app showing no panel at all.
  assert.equal(initialTab(NAMES, 'charts'), 'spots');
});

test('selecting a tab reports it and remembers it', () => {
  const storage = fakeStorage();
  const seen = [];
  const tabs = createTabs({ names: NAMES, storage, onChange: (n) => seen.push(n) });

  tabs.select('days');

  assert.equal(tabs.current(), 'days');
  assert.deepEqual(seen, ['days']);
  assert.equal(storage.getItem('fc:tab'), 'days');
});

test('re-selecting the current tab does not churn', () => {
  const seen = [];
  const tabs = createTabs({ names: NAMES, storage: fakeStorage(), onChange: (n) => seen.push(n) });

  tabs.select('spots');

  assert.deepEqual(seen, [], 'already on spots, nothing to repaint');
});

test('an unknown tab name is ignored', () => {
  const tabs = createTabs({ names: NAMES, storage: fakeStorage() });

  tabs.select('charts');

  assert.equal(tabs.current(), 'spots');
});

test('a spot with storage unavailable still switches tabs', () => {
  const tabs = createTabs({ names: NAMES, storage: null });

  tabs.select('days');

  assert.equal(tabs.current(), 'days');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tabs.test.mjs`
Expected: FAIL with `Cannot find module '.../js/tabs.js'`

- [ ] **Step 3: Write the implementation**

Create `js/tabs.js`:

```js
// Which panel is showing. No DOM here on purpose: the view owns the aria
// attributes and classes, this owns the answer to "which one" and the fact
// that the answer survives a reload.

export function initialTab(names, stored) {
  return names.includes(stored) ? stored : names[0];
}

export function createTabs({
  names,
  storage = globalThis.localStorage,
  storageKey = 'fc:tab',
  onChange = () => {},
}) {
  const read = () => {
    try {
      return storage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  };

  let current = initialTab(names, read());

  return {
    names,
    current: () => current,
    select(name) {
      if (!names.includes(name) || name === current) return;
      current = name;
      try {
        // Storage being full or blocked is not a reason to refuse to switch
        // tabs; it only costs us the memory of which one.
        storage?.setItem(storageKey, name);
      } catch { /* not worth reporting */ }
      onChange(name);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tabs.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add js/tabs.js test/tabs.test.mjs
git commit -m "feat: tab state with a remembered selection"
```

---

### Task 5: Day card rewrite (`js/ui-days.js`)

Replace the 11×8 scrolling table with three hourly bands and a tap-for-detail panel.

**Files:**
- Modify: `js/ui-days.js` (replace `ROWS`, `grid()`, and the body of `renderDays`)
- Modify: `app.css` (append the band and slot styles)

**Interfaces:**
- Consumes: `buildBand`, `extremaMarkers` from `js/bands.js` (Task 1); `day.series` from `js/daily.js` (Task 2); existing `compass`, `scoreBand`, `hhmm`, `dayLabel` from `js/format.js`
- Produces: `renderDays(target, days, now = new Date(), {openKey = null, openSlot = null, onSlot = () => {}} = {})` — `onSlot(dayKey, slotIndex)` fires when a 3-hour block is tapped

- [ ] **Step 1: Replace the table with bands**

In `js/ui-days.js`, change the import line at the top from:

```js
import { compass, scoreBand, hhmm, dayLabel } from './format.js';
```

to:

```js
import { compass, scoreBand, hhmm, dayLabel } from './format.js';
import { buildBand, extremaMarkers } from './bands.js';
```

Delete the entire `ROWS` array and the entire `grid(day)` function, and add in their place:

```js
// A row of hourly bars. Screen readers get the range as text -- 24 unlabelled
// bars are noise to anyone not looking at them.
function band(label, values, summary, marks = []) {
  const built = buildBand(values);
  const row = el('div', 'band');
  row.appendChild(el('span', 'band-label', label));

  const bars = el('div', 'bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${label}: ${summary}`);

  const byIndex = new Map(marks.map((m) => [m.index, m]));
  built.bars.forEach((bar, i) => {
    const mark = byIndex.get(i);
    const b = el('span', `bar${mark ? ` bar-${mark.type}` : ''}`);
    b.style.height = `${bar.pct}%`;
    bars.appendChild(b);
  });

  row.appendChild(bars);
  row.appendChild(el('span', 'band-range', summary));
  return row;
}

// The bands are drawn hourly so the tide peaks land on the printed high-water
// times, but 24 bars across a phone is a 14px tap target. The 3-hour slots
// are the things you actually press.
function axis(day, openSlot, onSlot) {
  const row = el('div', 'slots');
  day.slots.forEach((slot, i) => {
    const b = el('button', `slot${i === openSlot ? ' slot-open' : ''}`, hhmm(slot.start));
    b.type = 'button';
    b.setAttribute('aria-expanded', String(i === openSlot));
    b.setAttribute('aria-label', `${hhmm(slot.start)}, score ${Math.round(slot.score)}`);
    b.addEventListener('click', () => onSlot(day.key, i === openSlot ? null : i));
    row.appendChild(b);
  });
  return row;
}

const DETAIL_ROWS = [
  { label: 'Tide', marine: true, get: (s) => (Number.isFinite(s.tide) ? `${s.tide.toFixed(1)} m` : null) },
  { label: 'Wind', get: (s) => (Number.isFinite(s.wind) ? `${n0(s.wind)} km/h ${compass(s.windDirection)}`.trim() : null) },
  { label: 'Gusts', get: (s) => (Number.isFinite(s.gust) ? `${n0(s.gust)} km/h` : null) },
  { label: 'Swell', marine: true, get: (s) => (Number.isFinite(s.swellHeight) ? `${n1(s.swellHeight)} m` : null) },
  { label: 'Period', marine: true, get: (s) => (Number.isFinite(s.swellPeriod) ? `${n0(s.swellPeriod)} s` : null) },
  { label: 'Temp', get: (s) => (Number.isFinite(s.temperature) ? `${n0(s.temperature)} °C` : null) },
  { label: 'Rain', get: (s) => (s.rain > 0.05 ? `${s.rain.toFixed(1)} mm` : '—') },
  { label: 'Cloud', get: (s) => (Number.isFinite(s.cloud) ? `${n0(s.cloud)} %` : null) },
  { label: 'Pressure', get: (s) => (Number.isFinite(s.pressure) ? `${n0(s.pressure)} hPa` : null) },
];

function slotDetail(day, index) {
  const slot = day.slots[index];
  const panel = el('div', 'slot-detail');

  const head = el('div', 'slot-head');
  head.appendChild(el('span', null, `${hhmm(slot.start)}–${hhmm(new Date(slot.start.getTime() + slot.hours.length * 3600000))}`));
  head.appendChild(el('span', `score band-${scoreBand(slot.score)}`, String(Math.round(slot.score))));
  panel.appendChild(head);

  const list = el('dl', 'slot-rows');
  for (const row of DETAIL_ROWS) {
    const value = row.get(slot);
    // Inland spots have no tide, swell or period at all. Three rows of dashes
    // is worse than not printing them.
    if (value === null) continue;
    list.appendChild(el('dt', null, row.label));
    list.appendChild(el('dd', null, value));
  }
  panel.appendChild(list);

  const why = [...new Set(slot.hours.flatMap((h) => h.reasons ?? []))];
  if (why.length) panel.appendChild(el('p', 'slot-why', `Why: ${why.join(' · ')}`));

  return panel;
}
```

- [ ] **Step 2: Rewrite `renderDays` to use them**

Replace the whole `renderDays` function with:

```js
export function renderDays(target, days, now = new Date(), { openKey = null, openSlot = null, onSlot = () => {} } = {}) {
  target.replaceChildren();

  for (const day of days) {
    const card = el('details', `day band-${scoreBand(day.best.score)}`);
    // With no day nominated, today is the one you want open on arrival.
    card.open = openKey ? day.key === openKey : dayLabel(day.date, now) === 'Today';
    card.dataset.dayKey = day.key;

    const summary = el('summary');
    const line = el('div', 'day-head');
    line.appendChild(el('span', 'label', dayLabel(day.date, now)));
    line.appendChild(el('span', 'score', String(day.best.score)));
    summary.appendChild(line);
    summary.appendChild(el('div', 'digest', digest(day)));
    card.appendChild(summary);

    card.appendChild(el('p', 'tide-line', tideLine(day)));
    card.appendChild(el('p', 'sky-line', skyLine(day)));

    if (day.tides.length) {
      card.appendChild(band(
        'Tide',
        day.series.tide,
        `${n1(Math.min(...day.series.tide.filter(Number.isFinite)))}–${n1(Math.max(...day.series.tide.filter(Number.isFinite)))} m`,
        extremaMarkers(day.tides, day.key),
      ));
    }
    card.appendChild(band(
      'Wind',
      day.series.wind,
      `${n0(day.wind.min)}–${n0(day.wind.max)} km/h ${compass(day.wind.direction)}`.trim(),
    ));
    card.appendChild(band('Score', day.series.score, `best ${day.best.score}`));

    card.appendChild(axis(day, day.key === openKey ? openSlot : null, onSlot));
    if (day.key === openKey && openSlot !== null && day.slots[openSlot]) {
      card.appendChild(slotDetail(day, openSlot));
    }

    target.appendChild(card);
  }
}
```

- [ ] **Step 3: Add the styles**

Append to `app.css`:

```css
.band { display: grid; grid-template-columns: 52px 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: end; margin: 10px 0; }
.band-label { font-size: 12px; color: var(--muted); grid-row: 1; }
.bars { display: flex; align-items: flex-end; gap: 1px; height: 44px; grid-row: 1; }
.bar { flex: 1 1 0; min-width: 0; background: var(--line); border-radius: 1px 1px 0 0; }
.bar-high { background: var(--excellent); }
.bar-low { background: var(--fair); }
.band-range { grid-column: 2; grid-row: 2; font-size: 12px; color: var(--muted); margin-top: 2px; }
.slots { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; margin-top: 6px; }
.slot { padding: 8px 0; font-size: 12px; background: var(--panel); color: var(--muted); border: 1px solid var(--line); border-radius: 6px; }
.slot-open { color: var(--ink); border-color: var(--excellent); }
.slot-detail { margin-top: 8px; padding: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.slot-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 8px; }
.slot-rows { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; }
.slot-rows dt { color: var(--muted); font-size: 13px; }
.slot-rows dd { margin: 0; font-size: 13px; text-align: right; }
.slot-why { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS — no test targets `ui-days.js` directly (it needs a DOM); this confirms nothing below it broke.

- [ ] **Step 5: Commit**

```bash
git add js/ui-days.js app.css
git commit -m "feat: replace the day table with hourly bands and slot detail"
```

---

### Task 6: Spots tab view (`js/ui-spots-tab.js`)

**Files:**
- Create: `js/ui-spots-tab.js`
- Modify: `app.css` (append the spot card styles)

**Interfaces:**
- Consumes: the card model from `summariseSpot` (Task 3); `scoreBand`, `compass`, `hhmm`, `timeRange` from `js/format.js`
- Produces: `renderSpotsTab(target, cards, {onOpen, onRemove, onClearAll})` where `cards` is `[{spot, summary}]`

- [ ] **Step 1: Write the implementation**

Create `js/ui-spots-tab.js`:

```js
import { scoreBand, compass, hhmm, timeRange } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const n0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–');

function tideLine(tide) {
  if (!tide.state) return 'No tide data here';
  const bits = [tide.state];
  if (Number.isFinite(tide.height)) bits.push(`${tide.height.toFixed(1)} m`);
  if (tide.nextTurn) bits.push(`${tide.nextTurn.type} ${hhmm(tide.nextTurn.time)}`);
  return bits.join(' · ');
}

export function renderSpotsTab(target, cards, { onOpen, onRemove, onClearAll }) {
  target.replaceChildren();

  if (!cards.length) {
    target.appendChild(el('p', 'empty', 'No spots saved yet. Tap the map or search for a place, then add it to compare.'));
    return;
  }

  for (const { spot, summary } of cards) {
    const card = el('article', 'spot-card');

    // The whole card opens the spot, so the remove control sits outside the
    // button rather than nested inside it.
    const open = el('button', 'spot-open');
    open.type = 'button';

    const head = el('div', 'spot-head');
    head.appendChild(el('span', 'spot-title', spot.name));
    head.appendChild(el('span', `score band-${scoreBand(summary.score ?? 0)}`,
      Number.isFinite(summary.score) ? String(summary.score) : '–'));
    open.appendChild(head);

    open.appendChild(el('div', 'spot-line', tideLine(summary.tide)));
    open.appendChild(el('div', 'spot-line',
      `${n0(summary.wind.speed)} km/h ${compass(summary.wind.direction)}`.trim()));
    open.appendChild(el('div', 'spot-line', summary.nextWindow
      ? `next ${timeRange(summary.nextWindow.start, summary.nextWindow.end)} · ${summary.nextWindow.score}`
      : 'no good window in the next 7 days'));

    open.addEventListener('click', () => onOpen(spot.id));
    card.appendChild(open);

    const drop = el('button', 'spot-remove', '×');
    drop.type = 'button';
    drop.title = `Remove ${spot.name}`;
    drop.setAttribute('aria-label', `Remove ${spot.name}`);
    drop.addEventListener('click', () => onRemove(spot.id));
    card.appendChild(drop);

    target.appendChild(card);
  }

  const clear = el('button', 'clear-all', 'Clear all');
  clear.type = 'button';
  clear.title = 'Remove every saved spot and cached forecast';
  clear.addEventListener('click', onClearAll);
  target.appendChild(clear);
}
```

- [ ] **Step 2: Add the styles**

Append to `app.css`:

```css
.spot-card { position: relative; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
.spot-open { display: block; width: 100%; text-align: left; padding: 12px 40px 12px 12px; background: none; border: 0; color: var(--ink); }
.spot-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.spot-title { font-weight: 600; }
.spot-line { font-size: 13px; color: var(--muted); margin-top: 4px; }
.spot-remove { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; background: none; border: 0; color: var(--muted); font-size: 18px; line-height: 1; }
.empty { color: var(--muted); font-size: 14px; }
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS, unchanged count — this file needs a DOM and is covered by the browser checks in Task 8.

- [ ] **Step 4: Commit**

```bash
git add js/ui-spots-tab.js app.css
git commit -m "feat: Spots tab with ranked spot cards"
```

---

### Task 7: Wire the tabs (`index.html`, `js/main.js`, `sw.js`)

**Files:**
- Modify: `index.html` (the `<main>` block)
- Modify: `js/main.js` (tab state, panel painting, slot handling)
- Modify: `sw.js` (`SHELL`)
- Modify: `app.css` (tablist styles)

**Interfaces:**
- Consumes: `createTabs` (Task 4), `summariseSpot` (Task 3), `tideExtremes` (already exported from `js/daily.js`), `renderSpotsTab` (Task 6), `renderDays` with its new `{openKey, openSlot, onSlot}` options (Task 5)
- Produces: the finished app; no exports

- [ ] **Step 1: Restructure the markup**

In `index.html`, replace everything from `<section id="compare-section"` through the closing `</section>` of the days section with:

```html
  <div class="tabs" role="tablist" aria-label="Views">
    <button id="tab-spots" class="tab" role="tab" type="button" aria-controls="panel-spots" aria-selected="true">Spots</button>
    <button id="tab-days" class="tab" role="tab" type="button" aria-controls="panel-days" aria-selected="false" tabindex="-1">7 days</button>
  </div>

  <section id="panel-spots" role="tabpanel" aria-labelledby="tab-spots">
    <div id="spot-cards" class="spot-cards"></div>
    <section id="compare-section" aria-labelledby="compare-heading" hidden>
      <h2 id="compare-heading">Week at a glance</h2>
      <div id="compare"></div>
    </section>
  </section>

  <section id="panel-days" role="tabpanel" aria-labelledby="tab-days" hidden>
    <div id="spots" class="spots" aria-label="Saved spots"></div>
    <section aria-labelledby="windows-heading">
      <h2 id="windows-heading">Best windows</h2>
      <div id="windows" class="windows"></div>
    </section>
    <section aria-labelledby="days-heading">
      <h2 id="days-heading">Next 7 days</h2>
      <div id="days" class="days"></div>
    </section>
  </section>
```

Then delete the now-duplicated `<div id="spots" class="spots" aria-label="Saved spots"></div>` that sits above `<main>` — the chips moved into the days panel.

- [ ] **Step 2: Add the tab styles**

Append to `app.css`:

```css
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 12px 0; }
.tab { padding: 10px; background: var(--panel); color: var(--muted); border: 1px solid var(--line); border-radius: 8px; font-size: 14px; }
.tab[aria-selected="true"] { color: var(--ink); border-color: var(--excellent); }
```

- [ ] **Step 3: Wire it in `main.js`**

Add to the imports:

```js
import { createTabs } from './tabs.js';
import { summariseSpot } from './spot-summary.js';
import { tideExtremes } from './daily.js';
import { renderSpotsTab } from './ui-spots-tab.js';
```

(`summariseDays` is already imported from `./daily.js` — add `tideExtremes` to that existing import rather than writing a second one.)

Add the new elements to the `els` object:

```js
  spotCards: $('spot-cards'),
  panels: { spots: $('panel-spots'), days: $('panel-days') },
  tabButtons: { spots: $('tab-spots'), days: $('tab-days') },
```

Add `openSlot: null` to `state`, next to `openDay`.

Add the tab controller and painters (place them above the existing `paintChips`):

```js
const tabs = createTabs({
  names: ['spots', 'days'],
  onChange: () => paintTabs(),
});

function paintTabs() {
  for (const name of tabs.names) {
    const selected = name === tabs.current();
    els.panels[name].hidden = !selected;
    els.tabButtons[name].setAttribute('aria-selected', String(selected));
    els.tabButtons[name].tabIndex = selected ? 0 : -1;
  }
  if (tabs.current() === 'spots') paintSpotCards();
}

for (const name of tabs.names) {
  els.tabButtons[name].addEventListener('click', () => tabs.select(name));
  els.tabButtons[name].addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = tabs.names.indexOf(name);
    const next = tabs.names[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.names.length) % tabs.names.length];
    tabs.select(next);
    els.tabButtons[next].focus();
  });
}

function paintSpotCards() {
  const now = new Date();
  const cards = state.spots
    .filter((s) => state.scored.has(s.id))
    .map((s) => {
      const { hours } = state.scored.get(s.id);
      return { spot: s, summary: summariseSpot(hours, findWindows(hours), tideExtremes(hours), now) };
    })
    // Best first: the whole point of the tab is "which one right now".
    .sort((a, b) => (b.summary.score ?? -1) - (a.summary.score ?? -1));

  renderSpotsTab(els.spotCards, cards, {
    onOpen(id) {
      state.active = id;
      state.preview = null;
      state.openDay = null;
      state.openSlot = null;
      renderPreview(els.preview, null);
      paintChips();
      paintDetail();
      tabs.select('days');
    },
    onRemove: removeSpotById,
    onClearAll: clearEverything,
  });
}
```

Extract the two handlers currently inline in `paintChips` so both tabs can share them — replace the `onClearAll` and `onRemove` bodies inside `paintChips` with references to these new functions, defined just above `paintChips`:

```js
async function clearEverything() {
  const what = state.spots.length
    ? `Remove all ${state.spots.length} saved spots and every cached forecast?`
    : 'Clear every cached forecast and start fresh?';
  // eslint-disable-next-line no-alert
  if (!globalThis.confirm(what)) return;
  setStatus(els.status, 'Resetting…');
  clearAll();
  // Awaited, unlike the localStorage wipe: the reload below would otherwise
  // race the deletion and could be served the very shell being deleted.
  await clearCaches();
  globalThis.location.reload();
}

function removeSpotById(id) {
  state.spots = removeSpot(state.spots, id);
  state.scored.delete(id);
  saveSpots(state.spots);
  if (state.active === id) state.active = state.spots[0]?.id ?? null;
  paintChips();
  paintCompare();
  paintSpotCards();
  paintDetail();
}
```

so `paintChips` now reads:

```js
    onClearAll: clearEverything,
    onRemove: removeSpotById,
```

In `paintDetail`, pass the new options to `renderDays`:

```js
  renderDays(
    els.days,
    summariseDays(view.hours, view.spot.lat, view.spot.lon, view.offset),
    now,
    {
      openKey: state.openDay,
      openSlot: state.openSlot,
      onSlot(dayKey, index) {
        state.openDay = dayKey;
        state.openSlot = index;
        paintDetail();
      },
    },
  );
```

In `paintCompare`'s `onCell` handler, add `state.openSlot = null;` beside the existing `state.openDay = dayKey;`, and change `els.days.scrollIntoView(...)` to switch tabs first:

```js
      tabs.select('days');
      els.days.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

In `refreshSavedSpots`, add `paintSpotCards();` beside the existing `paintCompare();`.

Finally, at the bottom of the file where `paintChips()` is called on startup, add `paintTabs();` immediately after it.

- [ ] **Step 4: Add the new files to the offline shell**

In `sw.js`, add to `SHELL` (keeping the list alphabetical within the `js/` group):

```js
  './js/bands.js',
  './js/spot-summary.js',
  './js/tabs.js',
  './js/ui-spots-tab.js',
```

Bump the cache name so returning visitors get a clean shell:

```js
const CACHE = 'fishing-conditions-v3';
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS, all green

- [ ] **Step 6: Commit**

```bash
git add index.html js/main.js sw.js app.css
git commit -m "feat: Spots / 7 days tab switch"
```

---

### Task 8: Verify in a browser and ship the container

**Files:**
- Create: scratchpad script `verify-tabs.mjs` (not committed — it lives in the session scratchpad)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing; this is the verification gate

- [ ] **Step 1: Rebuild the container**

```bash
podman build -t fishing-conditions:1.0.0 .
podman rm -f fishing
podman run -d --name fishing -p 8080:8080 fishing-conditions:1.0.0
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:8080
```

Expected: `HTTP 200`

- [ ] **Step 2: Write the browser check**

Create `verify-tabs.mjs` in the scratchpad directory:

```js
import { chromium } from 'file:///C:/azure repo/personal-tools/projects/price-checker/node_modules/playwright/index.mjs';
const URL = 'http://127.0.0.1:8080';
const say = (k, v) => console.log(`${k}: ${v}`);

const browser = await chromium.launch();
// 390px is an iPhone 12/13/14 in portrait -- the width the complaint came from.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.day', { timeout: 30000 });

// Add two spots so the Spots tab has something to rank.
const box = await page.locator('#map').boundingBox();
const tap = async (dx, dy) => {
  await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy);
  await page.waitForFunction(() => {
    const b = document.querySelector('#preview .preview-score');
    return b && b.textContent.trim().length > 0;
  }, { timeout: 30000 });
};
await tap(0.45, 0.4);
await page.click('#preview .add-spot');
await tap(0.62, 0.62);
await page.click('#preview .add-spot');

// 1. The actual complaint: nothing may scroll sideways.
await page.click('#tab-days');
await page.waitForSelector('#panel-days:not([hidden]) .day', { timeout: 30000 });
const overflow = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter((n) => n.scrollWidth > n.clientWidth + 1)
  .map((n) => `${n.tagName}.${n.className}`));
say('1 horizontally scrolling elements', JSON.stringify(overflow));
say('1 page wider than viewport', await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth));

// 2. Bands render, one bar per hour.
say('2 bands on the open day', await page.locator('.day[open] .band').count());
say('2 bars in the first band', await page.locator('.day[open] .band').first().locator('.bar').count());
say('2 tide markers', await page.locator('.day[open] .bar-high, .day[open] .bar-low').count());

// 3. Tapping a 3-hour block opens the detail.
await page.locator('.day[open] .slot').nth(5).click();
await page.waitForSelector('.day[open] .slot-detail', { timeout: 10000 });
say('3 detail rows', await page.locator('.day[open] .slot-detail dt').count());
say('3 detail head', await page.locator('.day[open] .slot-head').innerText().then((t) => t.replace(/\n/g, ' ')));
say('3 why line', await page.locator('.day[open] .slot-why').innerText().catch(() => '(none)'));

// 4. Spots tab ranks the cards and opening one lands on 7 days.
await page.click('#tab-spots');
await page.waitForSelector('#panel-spots:not([hidden]) .spot-card', { timeout: 10000 });
const scores = await page.locator('.spot-card .score').allInnerTexts();
say('4 card scores in order', scores.join(' >= '));
say('4 ranked correctly', scores.map(Number).every((v, i, a) => i === 0 || a[i - 1] >= v));
say('4 card lines', await page.locator('.spot-card').first().innerText().then((t) => t.replace(/\n/g, ' | ')));
await page.locator('.spot-card .spot-open').first().click();
await page.waitForTimeout(400);
say('4 landed on days tab', await page.locator('#panel-days').isVisible());

// 5. The tab choice survives a reload.
await page.reload();
await page.waitForSelector('#panel-days:not([hidden])', { timeout: 30000 });
say('5 remembered tab', await page.locator('#tab-days').getAttribute('aria-selected'));

// 6. An inland spot omits the marine rows instead of printing dashes.
await page.evaluate(() => {
  document.querySelector('#spot-search').value = 'Bloemfontein';
  document.querySelector('#spot-search-form').dispatchEvent(new Event('submit', { cancelable: true }));
});
await page.waitForSelector('#spot-results button', { timeout: 30000 });
await page.locator('#spot-results button').first().click();
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('No tide'), { timeout: 30000 });
await page.click('#tab-days');
await page.waitForSelector('.day[open]', { timeout: 10000 });
say('6 tide band present', await page.locator('.day[open] .band-label', { hasText: 'Tide' }).count());
say('6 tide line', await page.locator('.day[open] .tide-line').innerText());
await page.locator('.day[open] .slot').nth(4).click();
await page.waitForSelector('.day[open] .slot-detail', { timeout: 10000 });
say('6 detail labels', (await page.locator('.day[open] .slot-detail dt').allInnerTexts()).join(', '));

say('errors', JSON.stringify(errors));
await browser.close();
```

- [ ] **Step 3: Run it**

Run: `node <scratchpad>/verify-tabs.mjs`

Expected:
- `1 horizontally scrolling elements: []` and `1 page wider than viewport: false` — **this is the gate; if it fails the task is not done**
- `2 bands on the open day: 3`, `2 bars in the first band: 24`, `2 tide markers` at least 1
- `3 detail rows: 9`
- `4 ranked correctly: true`, `4 landed on days tab: true`
- `5 remembered tab: true`
- `6 tide band present: 0` and `6 detail labels` containing no `Tide`, `Swell` or `Period`
- `errors: []`

- [ ] **Step 4: Update the README**

Replace the v2 feature paragraph in `README.md` with:

```markdown
Two tabs: **Spots** ranks every saved spot by its current score, with tide
state, wind and the next good window on each card, plus a week-at-a-glance
grid. **7 days** shows one spot at a time as day cards — hourly tide, wind
and score bands with the high and low water times marked, and a tap on any
3-hour block for all eleven readings and the reasons behind the score.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe the tabbed layout"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: page structure and tabs → Task 7; Spots tab and its empty state → Task 6; compare grid retained → Task 7 markup; day card bands → Task 5; hourly resolution rationale → Task 2; slot detail → Task 5; the three pure modules → Tasks 1, 3, 4; missing-data handling → Tasks 1 (all-null series), 3 (no tide state), 5 (`DETAIL_ROWS` skipping null); tab persistence → Task 4; accessibility → Tasks 5, 6, 7; the 390 px assertion → Task 8.

**Two spec items folded rather than given their own task:** the "now bar above the tabs" needs no change (it already sits above the point where the tablist is inserted), and `js/ui-compare.js` is untouched because the chips and compare grid move by relocating their container elements in `index.html`, not by editing the renderers.

**Type consistency.** `buildBand(values, opts) -> {bars, min, max, hasData}` is consumed in Task 5 as `built.bars[i].pct`. `extremaMarkers(tides, key) -> [{index, type, ...}]` is consumed as `bar-${mark.type}`, giving `bar-high` / `bar-low`, which match the CSS. `summariseSpot(...) -> {score, wind, tide, nextWindow}` is consumed in Task 6 as `summary.tide.state`, `summary.wind.speed`, `summary.nextWindow.score`. `createTabs({names, onChange}) -> {current, select, names}` is consumed in Task 7 as `tabs.current()`, `tabs.select(name)`, `tabs.names`. `renderDays(..., {openKey, openSlot, onSlot})` is defined in Task 5 and called with exactly those keys in Task 7.

**One known dependency to respect:** Task 5 reads `day.series`, which Task 2 adds. Running Task 5 before Task 2 throws on `undefined.tide`.
