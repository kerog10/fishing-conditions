# Fishing Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keyless, backend-free static web app that ranks the next 7 days into fishing windows for any point on a map, using weather, tide, swell and solunar data.

**Architecture:** Plain ES modules, no bundler and no build step. Pure functions (`config`, `astro`, `score`, `windows`, `cache`, `format`) hold all the logic and are unit-tested under `node --test`; `api` fetches and normalises Open-Meteo responses; `ui` and `map` render. The same module files are imported by both the browser and the test runner.

**Tech Stack:** Vanilla JS (ES2022 modules), Leaflet (vendored, UMD global), SunCalc (vendored, ESM-shimmed), Open-Meteo APIs, `node --test`, service worker + web app manifest.

**Spec:** `docs/superpowers/specs/2026-08-19-fishing-conditions-design.md`

## Global Constraints

- **No API keys and no signups.** Every data source must be free and keyless.
- **No backend.** Static SPA only. Must run on a phone.
- **No runtime npm dependencies and no build step.** Third-party code is vendored into `vendor/`.
- **Node 22+** for `node --test` (verified present: v22.13.0).
- All scoring constants live in `js/config.js` and nowhere else. No magic numbers in `score.js` or `windows.js`.
- The tide disclaimer copy is fixed and non-dismissible. Exact string in Task 9.
- Times are handled as local wall-clock strings from Open-Meteo (`timezone=auto`). Never re-interpret them as UTC.

---

### Task 1: Project scaffold, vendored libraries, test harness

**Files:**
- Create: `package.json`, `.gitignore`, `tools/vendor.mjs`, `test/smoke.test.mjs`
- Create (generated): `vendor/suncalc.mjs`, `vendor/leaflet.js`, `vendor/leaflet.css`, `vendor/images/*`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs `node --test test/`. `vendor/suncalc.mjs` default-exports the SunCalc object with methods `getMoonPosition(date, lat, lng)`, `getMoonIllumination(date)`, `getMoonTimes(date, lat, lng)`, `getTimes(date, lat, lng)`.

- [ ] **Step 1: Initialise git and write `package.json`**

There is no git repository at this path yet, so commit steps in later tasks need one.

```bash
cd "C:/azure repo/personal-tools/projects/fishing-conditions"
git init
```

`package.json`:

```json
{
  "name": "fishing-conditions",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Ranks fishing windows from weather, tide, swell and solunar data. No API keys, no backend.",
  "scripts": {
    "test": "node --test test/",
    "vendor": "node tools/vendor.mjs",
    "serve": "npx --yes http-server -p 8080 -c-1 ."
  }
}
```

`.gitignore`:

```
node_modules/
.DS_Store
```

- [ ] **Step 2: Write the vendoring script**

SunCalc ships as UMD, which neither the browser nor `node --test` can `import` directly. The shim declares `module`/`exports` in module scope so the UMD footer assigns into them, then re-exports.

`tools/vendor.mjs`:

```js
// Downloads third-party libraries into vendor/. Run once: npm run vendor
import { mkdir, writeFile } from 'node:fs/promises';

const SUNCALC = 'https://unpkg.com/suncalc@1.9.0/suncalc.js';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_IMAGES = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png'];

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function main() {
  await mkdir('vendor/images', { recursive: true });

  const suncalc = await (await get(SUNCALC)).text();
  const shimmed = [
    '// Vendored from suncalc@1.9.0 (BSD-2-Clause). ESM shim added.',
    'const exports = {};',
    'const module = { exports };',
    suncalc,
    'export default module.exports;',
    '',
  ].join('\n');
  await writeFile('vendor/suncalc.mjs', shimmed, 'utf8');

  await writeFile('vendor/leaflet.js', await (await get(LEAFLET_JS)).text(), 'utf8');

  // Leaflet's CSS references images at ./images/*, which matches our layout.
  await writeFile('vendor/leaflet.css', await (await get(LEAFLET_CSS)).text(), 'utf8');

  for (const name of LEAFLET_IMAGES) {
    const res = await get(`https://unpkg.com/leaflet@1.9.4/dist/images/${name}`);
    await writeFile(`vendor/images/${name}`, Buffer.from(await res.arrayBuffer()));
  }

  console.log('vendored: suncalc.mjs, leaflet.js, leaflet.css, images/');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Write the failing smoke test**

`test/smoke.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import SunCalc from '../vendor/suncalc.mjs';

test('vendored SunCalc exposes the methods we depend on', () => {
  assert.equal(typeof SunCalc.getMoonPosition, 'function');
  assert.equal(typeof SunCalc.getMoonIllumination, 'function');
  assert.equal(typeof SunCalc.getMoonTimes, 'function');
  assert.equal(typeof SunCalc.getTimes, 'function');
});

test('SunCalc computes a plausible moon altitude for Durban', () => {
  const pos = SunCalc.getMoonPosition(new Date('2026-08-19T12:00:00Z'), -29.85, 31.05);
  assert.equal(typeof pos.altitude, 'number');
  assert.ok(pos.altitude >= -Math.PI / 2 && pos.altitude <= Math.PI / 2);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../vendor/suncalc.mjs`.

- [ ] **Step 5: Run the vendoring script**

Run: `npm run vendor`
Expected: prints `vendored: suncalc.mjs, leaflet.js, leaflet.css, images/`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore tools/vendor.mjs test/smoke.test.mjs vendor/
git commit -m "chore: scaffold project, vendor suncalc and leaflet, add test harness"
```

---

### Task 2: Scoring configuration

**Files:**
- Create: `js/config.js`
- Test: `test/config.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: named export `CONFIG` with these keys used by later tasks:
  - `CONFIG.biteWeights` — `{ pressure: 30, tide: 30, solunar: 20, dawnDusk: 15, moonPhase: 5 }`
  - `CONFIG.pressure` — `{ windowHours, bestHpa, neutralHpa, worstHpa }`
  - `CONFIG.solunar` — `{ majorHalfWidthHours, minorHalfWidthHours, minorCredit }`
  - `CONFIG.dawnDusk` — `{ halfWidthHours }`
  - `CONFIG.moonPhase` — `{ fullCreditDays, zeroCreditDays }`
  - `CONFIG.comfort` — `{ floor, wind: {ideal, worst}, gusts: {...}, swell: {...}, rain: {...} }`
  - `CONFIG.windows` — `{ threshold, splitDrop, minHours, maxHours, topN }`
  - `CONFIG.cache` — `{ freshMs, coordPrecision, keyPrefix }`
  - `CONFIG.forecastDays` — `7`

- [ ] **Step 1: Write the failing test**

`test/config.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';

test('bite weights sum to 100', () => {
  const sum = Object.values(CONFIG.biteWeights).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('comfort floor keeps unfishable windows visible but capped', () => {
  assert.ok(CONFIG.comfort.floor > 0, 'floor must not be zero, or windows vanish');
  assert.ok(CONFIG.comfort.floor < 0.5);
});

test('every comfort band has ideal strictly below worst', () => {
  for (const key of ['wind', 'gusts', 'swell', 'rain']) {
    const band = CONFIG.comfort[key];
    assert.ok(band.ideal < band.worst, `${key}: ideal must be below worst`);
  }
});

test('window bounds are coherent', () => {
  assert.ok(CONFIG.windows.minHours <= CONFIG.windows.maxHours);
  assert.ok(CONFIG.windows.threshold > 0 && CONFIG.windows.threshold < 100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/config.test.mjs`
Expected: FAIL — cannot find `../js/config.js`.

- [ ] **Step 3: Write the implementation**

`js/config.js`:

```js
// Every scoring constant lives here. Nothing else in the app hard-codes a
// threshold. Retuning the app against real results is a change to this file
// alone.

export const CONFIG = {
  forecastDays: 7,

  // Bite score: will fish feed? Weights sum to 100.
  biteWeights: {
    pressure: 30,
    tide: 30,
    solunar: 20,
    dawnDusk: 15,
    moonPhase: 5,
  },

  // Change in pressure_msl over the preceding window, in hPa.
  pressure: {
    windowHours: 3,
    bestHpa: 1.0,
    neutralHpa: 0,
    worstHpa: -1.5,
  },

  solunar: {
    majorHalfWidthHours: 1,
    minorHalfWidthHours: 1,
    minorCredit: 0.5, // minor periods score half of a major
  },

  dawnDusk: {
    halfWidthHours: 1,
  },

  moonPhase: {
    fullCreditDays: 3,     // within 3 days of new or full moon
    zeroCreditDays: 7.383, // quarter moon: a quarter of the synodic month
  },

  // Comfort multiplier: can I actually fish it? Each band degrades linearly
  // from ideal (1.0) to worst (floor). The overall multiplier is the minimum.
  comfort: {
    floor: 0.15,
    wind: { ideal: 15, worst: 45 },    // km/h
    gusts: { ideal: 25, worst: 60 },   // km/h
    swell: { ideal: 1.0, worst: 3.5 }, // m
    rain: { ideal: 0.5, worst: 5 },    // mm/h
  },

  windows: {
    threshold: 55,
    splitDrop: 15,
    minHours: 1,
    maxHours: 4,
    topN: 8,
  },

  cache: {
    freshMs: 60 * 60 * 1000,
    coordPrecision: 2,
    keyPrefix: 'fc:',
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/config.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add js/config.js test/config.test.mjs
git commit -m "feat: add scoring configuration with weight and threshold invariants"
```

---

### Task 3: Astronomy — solunar periods, moon phase, dawn/dusk

**Files:**
- Create: `js/astro.js`
- Test: `test/astro.test.mjs`

**Interfaces:**
- Consumes: `SunCalc` from `vendor/suncalc.mjs`.
- Produces:
  - `solunarPeriods(date, lat, lon)` → `{ majors: Date[], minors: Date[] }` — centre instants. Majors are moon transit (overhead) and anti-transit (underfoot); minors are moonrise and moonset. Either array may be empty at extreme latitudes.
  - `moonPhaseFraction(date)` → number `0..1` (0 = new, 0.5 = full).
  - `daysFromNewOrFull(date)` → number of days to the nearest new or full moon.
  - `sunTimes(date, lat, lon)` → `{ sunrise: Date|null, sunset: Date|null }`.

- [ ] **Step 1: Write the failing test**

`test/astro.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solunarPeriods, moonPhaseFraction, daysFromNewOrFull, sunTimes } from '../js/astro.js';

const DURBAN = { lat: -29.85, lon: 31.05 };
const DAY = new Date('2026-08-19T00:00:00Z');

test('finds exactly two major periods, roughly 12 hours apart', () => {
  const { majors } = solunarPeriods(DAY, DURBAN.lat, DURBAN.lon);
  assert.equal(majors.length, 2);
  const gapHours = Math.abs(majors[1] - majors[0]) / 3600000;
  assert.ok(gapHours > 10 && gapHours < 14, `gap was ${gapHours}h`);
});

test('major periods fall on the same calendar day as the query', () => {
  const { majors } = solunarPeriods(DAY, DURBAN.lat, DURBAN.lon);
  for (const m of majors) assert.equal(m.getUTCDate(), DAY.getUTCDate());
});

test('moon phase fraction stays within range', () => {
  const p = moonPhaseFraction(DAY);
  assert.ok(p >= 0 && p <= 1);
});

test('a new or full moon occurs within any 30-day span', () => {
  let best = Infinity;
  for (let i = 0; i < 30; i++) {
    best = Math.min(best, daysFromNewOrFull(new Date(Date.UTC(2026, 7, 1 + i))));
  }
  assert.ok(best < 0.6, `closest approach was ${best} days`);
});

test('days from new or full never exceeds a quarter cycle', () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(daysFromNewOrFull(new Date(Date.UTC(2026, 7, 1 + i))) <= 7.5);
  }
});

test('sunrise precedes sunset in Durban', () => {
  const { sunrise, sunset } = sunTimes(DAY, DURBAN.lat, DURBAN.lon);
  assert.ok(sunrise instanceof Date);
  assert.ok(sunset instanceof Date);
  assert.ok(sunrise < sunset);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/astro.test.mjs`
Expected: FAIL — cannot find `../js/astro.js`.

- [ ] **Step 3: Write the implementation**

`js/astro.js`:

```js
// Solunar timing derived locally. No solunar API is free and keyless, so major
// periods are found by scanning moon altitude for its daily maximum (moon
// overhead) and minimum (moon underfoot).

import SunCalc from '../vendor/suncalc.mjs';

const SAMPLE_MINUTES = 10;
const SYNODIC_DAYS = 29.530588853;

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Scans one day of moon altitude and returns the instants of peak and trough.
export function solunarPeriods(date, lat, lon) {
  const start = startOfUTCDay(date);
  const stepMs = SAMPLE_MINUTES * 60 * 1000;
  const steps = (24 * 60) / SAMPLE_MINUTES;

  let peak = { alt: -Infinity, at: null };
  let trough = { alt: Infinity, at: null };

  for (let i = 0; i < steps; i++) {
    const at = new Date(start.getTime() + i * stepMs);
    const { altitude } = SunCalc.getMoonPosition(at, lat, lon);
    if (altitude > peak.alt) peak = { alt: altitude, at };
    if (altitude < trough.alt) trough = { alt: altitude, at };
  }

  const majors = [peak.at, trough.at].filter(Boolean).sort((a, b) => a - b);

  const times = SunCalc.getMoonTimes(start, lat, lon);
  const minors = [times.rise, times.set]
    .filter((t) => t instanceof Date && !Number.isNaN(t.getTime()))
    .sort((a, b) => a - b);

  return { majors, minors };
}

export function moonPhaseFraction(date) {
  return SunCalc.getMoonIllumination(date).phase;
}

// Distance in days to the nearest new (phase 0 or 1) or full (phase 0.5) moon.
export function daysFromNewOrFull(date) {
  const phase = moonPhaseFraction(date);
  const toNew = Math.min(phase, 1 - phase);
  const toFull = Math.abs(phase - 0.5);
  return Math.min(toNew, toFull) * SYNODIC_DAYS;
}

export function sunTimes(date, lat, lon) {
  const t = SunCalc.getTimes(startOfUTCDay(date), lat, lon);
  const ok = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null);
  return { sunrise: ok(t.sunrise), sunset: ok(t.sunset) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/astro.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add js/astro.js test/astro.test.mjs
git commit -m "feat: derive solunar periods, moon phase and sun times locally"
```

---

### Task 4: Comfort multiplier

**Files:**
- Create: `js/score.js`
- Test: `test/comfort.test.mjs`

**Interfaces:**
- Consumes: `CONFIG` from `js/config.js`.
- Produces:
  - `linearScore(value, ideal, worst)` → `0..1`; 1 at or below `ideal`, 0 at or above `worst`, linear between; returns 1 for `null`/`undefined`/`NaN`.
  - `comfortScore(hour)` → `{ value: number, reasons: string[] }`. `hour` is the normalised record from Task 7. Missing inputs are skipped, not scored as zero.

- [ ] **Step 1: Write the failing test**

`test/comfort.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comfortScore, linearScore } from '../js/score.js';
import { CONFIG } from '../js/config.js';

const CALM = { windSpeed: 8, windGusts: 12, swellHeight: 0.6, precipitation: 0 };

test('linearScore is 1 at ideal and 0 at worst', () => {
  assert.equal(linearScore(15, 15, 45), 1);
  assert.equal(linearScore(45, 15, 45), 0);
  assert.equal(linearScore(30, 15, 45), 0.5);
});

test('linearScore clamps outside the band', () => {
  assert.equal(linearScore(0, 15, 45), 1);
  assert.equal(linearScore(200, 15, 45), 0);
});

test('calm conditions score full comfort', () => {
  assert.equal(comfortScore(CALM).value, 1);
});

test('a gale is capped at the floor, not zero', () => {
  assert.equal(comfortScore({ ...CALM, windSpeed: 60, windGusts: 90 }).value, CONFIG.comfort.floor);
});

test('the worst single factor decides the multiplier', () => {
  assert.equal(comfortScore({ ...CALM, swellHeight: 3.5 }).value, CONFIG.comfort.floor);
});

test('bad conditions are explained', () => {
  const { reasons } = comfortScore({ ...CALM, windSpeed: 50 });
  assert.ok(reasons.some((r) => /wind/i.test(r)), reasons.join('; '));
});

test('missing swell does not penalise an inland spot', () => {
  const inland = { windSpeed: 8, windGusts: 12, swellHeight: null, precipitation: 0 };
  assert.equal(comfortScore(inland).value, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/comfort.test.mjs`
Expected: FAIL — cannot find `../js/score.js`.

- [ ] **Step 3: Write the implementation**

`js/score.js`:

```js
import { CONFIG } from './config.js';

// 1 at or below `ideal`, 0 at or above `worst`, linear in between.
export function linearScore(value, ideal, worst) {
  if (value === null || value === undefined || Number.isNaN(value)) return 1;
  if (value <= ideal) return 1;
  if (value >= worst) return 0;
  return (worst - value) / (worst - ideal);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Can I actually fish this hour? Returns the worst of the individual bands,
// floored so that a strong bite window in bad weather stays visible in the
// list rather than disappearing without explanation.
export function comfortScore(hour) {
  const c = CONFIG.comfort;
  const bands = [
    { value: hour.windSpeed, band: c.wind, label: 'wind', unit: 'km/h' },
    { value: hour.windGusts, band: c.gusts, label: 'gusts', unit: 'km/h' },
    { value: hour.swellHeight, band: c.swell, label: 'swell', unit: 'm' },
    { value: hour.precipitation, band: c.rain, label: 'rain', unit: 'mm/h' },
  ];

  const reasons = [];
  let worst = 1;

  for (const b of bands) {
    if (b.value === null || b.value === undefined || Number.isNaN(b.value)) continue;
    const s = linearScore(b.value, b.band.ideal, b.band.worst);
    if (s < worst) worst = s;
    if (s < 0.5) reasons.push(`Uncomfortable ${b.label} (${round1(b.value)} ${b.unit})`);
  }

  // worst === 1 maps to 1; worst === 0 maps exactly to the floor.
  return { value: c.floor + (1 - c.floor) * worst, reasons };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/comfort.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add js/score.js test/comfort.test.mjs
git commit -m "feat: add comfort multiplier with a floor so capped windows stay visible"
```

---

### Task 5: Bite score and final score

**Files:**
- Modify: `js/score.js` (append)
- Test: `test/bite.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `comfortScore` from Task 4, `solunarPeriods`/`daysFromNewOrFull`/`sunTimes` from Task 3.
- Produces:
  - `pressureScore(hours, i)` → `0..1`
  - `tideScore(hours, i, maxDelta)` → `0..1`
  - `solunarScoreAt(time, periods)` → `0..1`
  - `dawnDuskScore(time, sun)` → `0..1`
  - `scoreHours(hours, lat, lon)` → the same array with each element extended by `{ bite, comfort, final, reasons }`. `bite` and `final` are `0..100`; `comfort` is `0..1`.

- [ ] **Step 1: Write the failing test**

`test/bite.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHours, pressureScore, tideScore } from '../js/score.js';

// 24 hours of flat, calm, featureless conditions starting at midnight.
function flatDay(overrides = {}) {
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 7, 19, i)),
    pressure: 1015,
    windSpeed: 8,
    windGusts: 12,
    windDirection: 90,
    precipitation: 0,
    swellHeight: 0.6,
    swellPeriod: 9,
    seaLevel: 0,
    ...overrides,
  }));
}

test('rising pressure outscores falling pressure', () => {
  const rising = flatDay().map((h, i) => ({ ...h, pressure: 1010 + i * 0.5 }));
  const falling = flatDay().map((h, i) => ({ ...h, pressure: 1020 - i * 0.5 }));
  assert.ok(pressureScore(rising, 12) > pressureScore(falling, 12));
});

test('flat pressure scores mid-range', () => {
  const s = pressureScore(flatDay(), 12);
  assert.ok(s > 0.4 && s < 0.7, `got ${s}`);
});

test('moving tide outscores slack water', () => {
  const hours = flatDay().map((h, i) => ({ ...h, seaLevel: Math.sin((i / 24) * 2 * Math.PI) }));
  const maxDelta = 0.3;
  const slackIndex = 6;  // sine peak: rate of change near zero
  const flowIndex = 12;  // sine zero crossing: fastest change
  assert.ok(tideScore(hours, flowIndex, maxDelta) > tideScore(hours, slackIndex, maxDelta));
});

test('scoreHours returns bounded scores and reasons for every hour', () => {
  const scored = scoreHours(flatDay(), -29.85, 31.05);
  assert.equal(scored.length, 24);
  for (const h of scored) {
    assert.ok(h.bite >= 0 && h.bite <= 100, `bite ${h.bite}`);
    assert.ok(h.comfort >= 0 && h.comfort <= 1, `comfort ${h.comfort}`);
    assert.ok(h.final >= 0 && h.final <= 100, `final ${h.final}`);
    assert.ok(Array.isArray(h.reasons));
  }
});

test('final never exceeds bite', () => {
  for (const h of scoreHours(flatDay(), -29.85, 31.05)) {
    assert.ok(h.final <= h.bite + 1);
  }
});

test('a gale caps the final score even when the bite is strong', () => {
  const gale = scoreHours(flatDay({ windSpeed: 70, windGusts: 95 }), -29.85, 31.05);
  const best = Math.max(...gale.map((h) => h.final));
  assert.ok(best < 30, `best final in a gale was ${best}`);
});

test('an inland spot with no tide data still scores', () => {
  const inland = flatDay({ seaLevel: null, swellHeight: null, swellPeriod: null });
  const scored = scoreHours(inland, -29.0, 26.0);
  assert.ok(scored.every((h) => Number.isFinite(h.final)));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/bite.test.mjs`
Expected: FAIL — `pressureScore is not a function`.

- [ ] **Step 3: Write the implementation**

Add this import at the top of `js/score.js`, below the existing `CONFIG` import:

```js
import { solunarPeriods, daysFromNewOrFull, sunTimes } from './astro.js';
```

Then append to `js/score.js`:

```js
const HOUR_MS = 3600000;

// Trend over the preceding window. Rising pressure is the strongest single
// predictor of active feeding; a sharp fall suppresses it.
export function pressureScore(hours, i) {
  const j = Math.max(0, i - CONFIG.pressure.windowHours);
  const now = hours[i].pressure;
  const then = hours[j].pressure;
  if (!Number.isFinite(now) || !Number.isFinite(then)) return 0.5;

  const delta = now - then;
  const { bestHpa, worstHpa } = CONFIG.pressure;
  if (delta >= bestHpa) return 1;
  if (delta <= worstHpa) return 0;
  return (delta - worstHpa) / (bestHpa - worstHpa);
}

// Rate of change of sea level, not stage. Slack water scores zero; peak flow
// scores one. Normalised against the spot's own maximum, so it works for both
// a 2 m range harbour and a 0.4 m range lagoon.
export function tideScore(hours, i, maxDelta) {
  if (!maxDelta || !Number.isFinite(maxDelta)) return 0;
  const lo = Math.max(0, i - 1);
  const hi = Math.min(hours.length - 1, i + 1);
  const span = hi - lo;
  if (span === 0) return 0;
  const prev = hours[lo].seaLevel;
  const next = hours[hi].seaLevel;
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return 0;
  return Math.min(1, Math.abs(next - prev) / span / maxDelta);
}

export function solunarScoreAt(time, periods) {
  const s = CONFIG.solunar;
  let best = 0;

  for (const centre of periods.majors) {
    const away = Math.abs(time - centre) / HOUR_MS;
    if (away <= s.majorHalfWidthHours) {
      best = Math.max(best, 1 - (away / s.majorHalfWidthHours) / 2);
    }
  }
  for (const centre of periods.minors) {
    const away = Math.abs(time - centre) / HOUR_MS;
    if (away <= s.minorHalfWidthHours) {
      best = Math.max(best, s.minorCredit * (1 - (away / s.minorHalfWidthHours) / 2));
    }
  }
  return best;
}

export function dawnDuskScore(time, sun) {
  const w = CONFIG.dawnDusk.halfWidthHours;
  let best = 0;
  for (const event of [sun.sunrise, sun.sunset]) {
    if (!event) continue;
    const away = Math.abs(time - event) / HOUR_MS;
    if (away <= w) best = Math.max(best, 1 - away / w);
  }
  return best;
}

function moonPhaseScore(time) {
  const days = daysFromNewOrFull(time);
  const { fullCreditDays, zeroCreditDays } = CONFIG.moonPhase;
  if (days <= fullCreditDays) return 1;
  if (days >= zeroCreditDays) return 0;
  return (zeroCreditDays - days) / (zeroCreditDays - fullCreditDays);
}

function dayKey(d) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function explain(parts, hasTide, hours, i) {
  const out = [];
  const j = Math.max(0, i - CONFIG.pressure.windowHours);
  const delta = hours[i].pressure - hours[j].pressure;

  if (parts.pressure >= 0.75) out.push(`Rising pressure (+${round1(delta)} hPa/3h)`);
  else if (parts.pressure <= 0.25) out.push(`Falling pressure (${round1(delta)} hPa/3h)`);

  if (hasTide) {
    if (parts.tide >= 0.7) out.push('Strong tidal flow');
    else if (parts.tide <= 0.2) out.push('Slack water');
  } else {
    out.push('No tide data for this spot');
  }

  if (parts.solunar >= 0.75) out.push('Major solunar period');
  else if (parts.solunar > 0) out.push('Minor solunar period');

  if (parts.dawnDusk >= 0.5) out.push('Near dawn or dusk');
  if (parts.moonPhase >= 1) out.push('Near new or full moon');

  return out;
}

// Extends each hour with bite (0-100), comfort (0-1), final (0-100) and the
// plain-English reasons behind them.
export function scoreHours(hours, lat, lon) {
  const w = CONFIG.biteWeights;

  // Normalise tide movement against this spot's own strongest hourly change.
  let maxDelta = 0;
  for (let i = 1; i < hours.length; i++) {
    const a = hours[i - 1].seaLevel;
    const b = hours[i].seaLevel;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      maxDelta = Math.max(maxDelta, Math.abs(b - a));
    }
  }
  const hasTide = maxDelta > 0;

  const astroCache = new Map();
  const astroFor = (time) => {
    const key = dayKey(time);
    if (!astroCache.has(key)) {
      astroCache.set(key, {
        periods: solunarPeriods(time, lat, lon),
        sun: sunTimes(time, lat, lon),
      });
    }
    return astroCache.get(key);
  };

  return hours.map((hour, i) => {
    const { periods, sun } = astroFor(hour.time);

    const parts = {
      pressure: pressureScore(hours, i),
      tide: tideScore(hours, i, maxDelta),
      solunar: solunarScoreAt(hour.time, periods),
      dawnDusk: dawnDuskScore(hour.time, sun),
      moonPhase: moonPhaseScore(hour.time),
    };

    // With no tide data the tide weight is redistributed rather than scored as
    // zero, so an inland spot is not permanently capped at 70.
    const activeWeight = hasTide ? 100 : 100 - w.tide;
    let bite = 0;
    for (const [key, weight] of Object.entries(w)) {
      if (key === 'tide' && !hasTide) continue;
      bite += parts[key] * weight;
    }
    bite = (bite / activeWeight) * 100;

    const comfort = comfortScore(hour);
    const reasons = explain(parts, hasTide, hours, i).concat(comfort.reasons);

    return {
      ...hour,
      bite: Math.round(bite),
      comfort: comfort.value,
      final: Math.round(bite * comfort.value),
      reasons,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/bite.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests from Tasks 1–5.

- [ ] **Step 6: Commit**

```bash
git add js/score.js test/bite.test.mjs
git commit -m "feat: add bite score from pressure, tide, solunar, dawn/dusk and moon phase"
```

---

### Task 6: Window detection and ranking

**Files:**
- Create: `js/windows.js`
- Test: `test/windows.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, scored hours from Task 5.
- Produces: `findWindows(scoredHours)` → array of `{ start: Date, end: Date, hours: object[], meanFinal: number, peakFinal: number, meanBite: number, minComfort: number, reasons: string[] }`, sorted by `meanFinal` descending, truncated to `CONFIG.windows.topN`.

- [ ] **Step 1: Write the failing test**

`test/windows.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWindows } from '../js/windows.js';
import { CONFIG } from '../js/config.js';

function hoursFrom(finals) {
  return finals.map((final, i) => ({
    time: new Date(Date.UTC(2026, 7, 19, i)),
    final,
    bite: final,
    comfort: 1,
    reasons: [],
  }));
}

test('no hours above threshold yields no windows', () => {
  assert.deepEqual(findWindows(hoursFrom([10, 20, 30, 40])), []);
});

test('a contiguous run above threshold becomes one window', () => {
  const w = findWindows(hoursFrom([10, 70, 75, 80, 10]));
  assert.equal(w.length, 1);
  assert.equal(w[0].hours.length, 3);
});

test('windows are capped at maxHours', () => {
  for (const win of findWindows(hoursFrom(Array(12).fill(80)))) {
    assert.ok(win.hours.length <= CONFIG.windows.maxHours, `${win.hours.length} hours`);
  }
});

test('a sharp drop splits a window', () => {
  const w = findWindows(hoursFrom([90, 92, 60, 90, 91]));
  assert.ok(w.length >= 2, `expected a split, got ${w.length} window(s)`);
});

test('windows are ranked by mean final score', () => {
  const w = findWindows(hoursFrom([90, 90, 10, 60, 60]));
  assert.ok(w[0].meanFinal > w[1].meanFinal);
});

test('only the top N windows are returned', () => {
  const pattern = [];
  for (let i = 0; i < 20; i++) pattern.push(80, 10);
  assert.ok(findWindows(hoursFrom(pattern)).length <= CONFIG.windows.topN);
});

test('a window carries start, end and deduplicated reasons', () => {
  const hours = hoursFrom([10, 80, 85, 10]);
  hours[1].reasons = ['Rising pressure', 'Major solunar period'];
  hours[2].reasons = ['Rising pressure'];
  const [win] = findWindows(hours);
  assert.ok(win.start instanceof Date);
  assert.ok(win.end instanceof Date);
  assert.deepEqual(win.reasons.sort(), ['Major solunar period', 'Rising pressure']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/windows.test.mjs`
Expected: FAIL — cannot find `../js/windows.js`.

- [ ] **Step 3: Write the implementation**

`js/windows.js`:

```js
import { CONFIG } from './config.js';

const HOUR_MS = 3600000;

function toWindow(hours) {
  const mean = (fn) => hours.reduce((a, h) => a + fn(h), 0) / hours.length;
  return {
    start: hours[0].time,
    end: new Date(hours[hours.length - 1].time.getTime() + HOUR_MS),
    hours,
    meanFinal: Math.round(mean((h) => h.final)),
    peakFinal: Math.max(...hours.map((h) => h.final)),
    meanBite: Math.round(mean((h) => h.bite)),
    minComfort: Math.min(...hours.map((h) => h.comfort)),
    reasons: [...new Set(hours.flatMap((h) => h.reasons || []))],
  };
}

// Groups consecutive above-threshold hours into fishable windows, splitting
// where the score drops sharply and capping length, then ranks them.
export function findWindows(scoredHours) {
  const { threshold, splitDrop, minHours, maxHours, topN } = CONFIG.windows;
  const runs = [];
  let current = [];

  const flush = () => {
    if (current.length >= minHours) runs.push(current);
    current = [];
  };

  for (const hour of scoredHours) {
    if (hour.final < threshold) {
      flush();
      continue;
    }
    if (current.length > 0) {
      const mean = current.reduce((a, h) => a + h.final, 0) / current.length;
      const contiguous = hour.time - current[current.length - 1].time === HOUR_MS;
      if (!contiguous || mean - hour.final > splitDrop || current.length >= maxHours) {
        flush();
      }
    }
    current.push(hour);
  }
  flush();

  return runs
    .map(toWindow)
    .sort((a, b) => b.meanFinal - a.meanFinal)
    .slice(0, topN);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/windows.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add js/windows.js test/windows.test.mjs
git commit -m "feat: group scored hours into ranked fishing windows"
```

---
### Task 7: Open-Meteo client and normalisation

**Files:**
- Create: `js/api.js`, `test/fixtures/forecast-durban.json`, `test/fixtures/marine-durban.json`
- Test: `test/api.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`.
- Produces:
  - `forecastUrl(lat, lon)`, `marineUrl(lat, lon)`, `geocodeUrl(name)` → URL strings.
  - `normalise(forecastJson, marineJson)` → `{ hours, timezone, hasMarine }`. Each hour is `{ time: Date, temperature, precipitation, cloudCover, pressure, windSpeed, windDirection, windGusts, seaLevel, waveHeight, swellHeight, swellPeriod, swellDirection, seaSurfaceTemperature }`. Marine fields are `null` when marine data is absent.
  - `fetchConditions(lat, lon, fetchImpl = globalThis.fetch)` → normalised object. Marine failure degrades to `hasMarine: false`; forecast failure throws.
  - `geocode(name, fetchImpl = globalThis.fetch)` → `[{ name, admin, country, lat, lon }]`.

- [ ] **Step 1: Capture real fixtures**

```bash
mkdir -p test/fixtures
curl -s "https://api.open-meteo.com/v1/forecast?latitude=-29.85&longitude=31.05&hourly=temperature_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset&timezone=auto&forecast_days=7" -o test/fixtures/forecast-durban.json
curl -s "https://marine-api.open-meteo.com/v1/marine?latitude=-29.85&longitude=31.05&hourly=sea_level_height_msl,wave_height,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature&timezone=auto&forecast_days=7" -o test/fixtures/marine-durban.json
```

Confirm both files contain an `hourly` object whose `time` array has 168 entries.

- [ ] **Step 2: Write the failing test**

`test/api.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { forecastUrl, marineUrl, geocodeUrl, normalise, fetchConditions } from '../js/api.js';

const forecast = JSON.parse(await readFile(new URL('./fixtures/forecast-durban.json', import.meta.url)));
const marine = JSON.parse(await readFile(new URL('./fixtures/marine-durban.json', import.meta.url)));

test('urls carry no api key and request 7 days', () => {
  for (const url of [forecastUrl(-29.85, 31.05), marineUrl(-29.85, 31.05)]) {
    assert.ok(!/apikey|api_key|token/i.test(url), url);
    assert.match(url, /forecast_days=7/);
    assert.match(url, /timezone=auto/);
  }
});

test('geocode url encodes the search term', () => {
  assert.match(geocodeUrl('Port Edward'), /name=Port(%20|\+)Edward/);
});

test('normalise merges forecast and marine into hourly records', () => {
  const { hours, hasMarine } = normalise(forecast, marine);
  assert.equal(hasMarine, true);
  assert.ok(hours.length >= 160);
  const h = hours[0];
  assert.ok(h.time instanceof Date);
  assert.equal(typeof h.pressure, 'number');
  assert.equal(typeof h.windSpeed, 'number');
  assert.equal(typeof h.seaLevel, 'number');
});

test('normalise degrades cleanly when marine data is missing', () => {
  const { hours, hasMarine } = normalise(forecast, null);
  assert.equal(hasMarine, false);
  assert.equal(hours[0].seaLevel, null);
  assert.equal(hours[0].swellHeight, null);
  assert.equal(typeof hours[0].pressure, 'number');
});

test('local wall-clock times are preserved, not shifted to UTC', () => {
  const { hours } = normalise(forecast, marine);
  const firstRaw = forecast.hourly.time[0]; // e.g. "2026-08-19T00:00"
  assert.equal(hours[0].time.toISOString().slice(0, 16), firstRaw.slice(0, 16));
});

test('fetchConditions survives a marine outage', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('marine')) return { ok: false, status: 500, statusText: 'boom' };
    return { ok: true, json: async () => forecast };
  };
  const result = await fetchConditions(-29.85, 31.05, fakeFetch);
  assert.equal(result.hasMarine, false);
  assert.ok(result.hours.length > 0);
});

test('fetchConditions throws when the forecast itself fails', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, statusText: 'down' });
  await assert.rejects(() => fetchConditions(-29.85, 31.05, fakeFetch), /503/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/api.test.mjs`
Expected: FAIL — cannot find `../js/api.js`.

- [ ] **Step 4: Write the implementation**

`js/api.js`:

```js
import { CONFIG } from './config.js';

const FORECAST_HOURLY = [
  'temperature_2m', 'precipitation', 'cloud_cover', 'pressure_msl',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
].join(',');

const MARINE_HOURLY = [
  'sea_level_height_msl', 'wave_height', 'wave_period',
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
  'sea_surface_temperature',
].join(',');

export function forecastUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + `&hourly=${FORECAST_HOURLY}`
    + '&daily=sunrise,sunset'
    + `&timezone=auto&forecast_days=${CONFIG.forecastDays}`;
}

export function marineUrl(lat, lon) {
  return 'https://marine-api.open-meteo.com/v1/marine'
    + `?latitude=${lat}&longitude=${lon}`
    + `&hourly=${MARINE_HOURLY}`
    + `&timezone=auto&forecast_days=${CONFIG.forecastDays}`;
}

export function geocodeUrl(name) {
  return 'https://geocoding-api.open-meteo.com/v1/search'
    + `?name=${encodeURIComponent(name)}&count=5&format=json`;
}

// Open-Meteo returns local wall-clock strings like "2026-08-19T14:00" when
// timezone=auto. Treating them as UTC keeps the displayed clock time intact
// instead of shifting it by the browser's offset. Every formatter therefore
// reads with UTC getters.
function toDate(localString) {
  return new Date(`${localString}:00Z`);
}

const at = (arr, i) => {
  const v = arr?.[i];
  return v === undefined || v === null ? null : v;
};

export function normalise(forecastJson, marineJson) {
  const f = forecastJson.hourly;
  const m = marineJson?.hourly ?? null;
  const hasMarine = Boolean(m && Array.isArray(m.time) && m.time.length > 0);

  // Index marine rows by time rather than position, so a length mismatch
  // cannot silently misalign tide data against the wrong hour.
  const marineIndex = new Map();
  if (hasMarine) m.time.forEach((t, i) => marineIndex.set(t, i));

  const hours = f.time.map((t, i) => {
    const mi = hasMarine ? marineIndex.get(t) : undefined;
    const hasRow = mi !== undefined;
    return {
      time: toDate(t),
      temperature: at(f.temperature_2m, i),
      precipitation: at(f.precipitation, i),
      cloudCover: at(f.cloud_cover, i),
      pressure: at(f.pressure_msl, i),
      windSpeed: at(f.wind_speed_10m, i),
      windDirection: at(f.wind_direction_10m, i),
      windGusts: at(f.wind_gusts_10m, i),
      seaLevel: hasRow ? at(m.sea_level_height_msl, mi) : null,
      waveHeight: hasRow ? at(m.wave_height, mi) : null,
      swellHeight: hasRow ? at(m.swell_wave_height, mi) : null,
      swellPeriod: hasRow ? at(m.swell_wave_period, mi) : null,
      swellDirection: hasRow ? at(m.swell_wave_direction, mi) : null,
      seaSurfaceTemperature: hasRow ? at(m.sea_surface_temperature, mi) : null,
    };
  });

  return { hours, timezone: forecastJson.timezone ?? 'auto', hasMarine };
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchConditions(lat, lon, fetchImpl = globalThis.fetch) {
  const forecast = await getJson(forecastUrl(lat, lon), fetchImpl);

  // A marine outage, or an inland point outside the ocean grid, must not take
  // the whole app down. Degrade to a no-tide, no-swell forecast.
  let marine = null;
  try {
    marine = await getJson(marineUrl(lat, lon), fetchImpl);
  } catch {
    marine = null;
  }

  return normalise(forecast, marine);
}

export async function geocode(name, fetchImpl = globalThis.fetch) {
  const data = await getJson(geocodeUrl(name), fetchImpl);
  return (data.results ?? []).map((r) => ({
    name: r.name,
    admin: r.admin1 ?? '',
    country: r.country ?? '',
    lat: r.latitude,
    lon: r.longitude,
  }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/api.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add js/api.js test/api.test.mjs test/fixtures/
git commit -m "feat: add Open-Meteo client that degrades gracefully without marine data"
```

---

### Task 8: Offline cache

**Files:**
- Create: `js/cache.js`
- Test: `test/cache.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.cache`.
- Produces:
  - `cacheKey(lat, lon)` → string.
  - `save(lat, lon, payload, storage, now)` → void; never throws.
  - `load(lat, lon, storage, now)` → `{ payload, ageMs, fresh }` or `null`. `payload.hours[].time` is revived as a `Date`.

- [ ] **Step 1: Write the failing test**

`test/cache.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, save, load } from '../js/cache.js';
import { CONFIG } from '../js/config.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const PAYLOAD = {
  hasMarine: true,
  hours: [{ time: new Date(Date.UTC(2026, 7, 19, 6)), pressure: 1015 }],
};

test('nearby coordinates share a cache key', () => {
  assert.equal(cacheKey(-29.8512, 31.0498), cacheKey(-29.8534, 31.0501));
});

test('distant coordinates do not share a cache key', () => {
  assert.notEqual(cacheKey(-29.85, 31.05), cacheKey(-30.85, 31.05));
});

test('a miss returns null', () => {
  assert.equal(load(-29.85, 31.05, fakeStorage(), 0), null);
});

test('a fresh entry round-trips with dates intact', () => {
  const s = fakeStorage();
  save(-29.85, 31.05, PAYLOAD, s, 1000);
  const hit = load(-29.85, 31.05, s, 1000);
  assert.equal(hit.fresh, true);
  assert.equal(hit.ageMs, 0);
  assert.ok(hit.payload.hours[0].time instanceof Date);
  assert.equal(hit.payload.hours[0].time.getTime(), PAYLOAD.hours[0].time.getTime());
});

test('a stale entry is still served, flagged as stale', () => {
  const s = fakeStorage();
  save(-29.85, 31.05, PAYLOAD, s, 0);
  const hit = load(-29.85, 31.05, s, CONFIG.cache.freshMs + 1);
  assert.equal(hit.fresh, false);
  assert.ok(hit.ageMs > CONFIG.cache.freshMs);
  assert.equal(hit.payload.hours.length, 1);
});

test('corrupt cache entries are discarded, not thrown', () => {
  const s = fakeStorage();
  s.setItem(cacheKey(-29.85, 31.05), '{not json');
  assert.equal(load(-29.85, 31.05, s, 0), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/cache.test.mjs`
Expected: FAIL — cannot find `../js/cache.js`.

- [ ] **Step 3: Write the implementation**

`js/cache.js`:

```js
import { CONFIG } from './config.js';

// Lose signal on the rocks and you get the last forecast with its age shown,
// rather than a blank screen.

export function cacheKey(lat, lon) {
  const p = CONFIG.cache.coordPrecision;
  return `${CONFIG.cache.keyPrefix}${lat.toFixed(p)},${lon.toFixed(p)}`;
}

export function save(lat, lon, payload, storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(cacheKey(lat, lon), JSON.stringify({ savedAt: now, payload }));
  } catch {
    // Quota exceeded or storage disabled. Caching is a convenience, not a
    // requirement, so a failure here must not break the app.
  }
}

export function load(lat, lon, storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return null;
  const key = cacheKey(lat, lon);
  const raw = storage.getItem(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return null;
  }
  if (!parsed?.payload?.hours) return null;

  const payload = {
    ...parsed.payload,
    hours: parsed.payload.hours.map((h) => ({ ...h, time: new Date(h.time) })),
  };
  const ageMs = Math.max(0, now - parsed.savedAt);

  return { payload, ageMs, fresh: ageMs <= CONFIG.cache.freshMs };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/cache.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add js/cache.js test/cache.test.mjs
git commit -m "feat: cache forecasts to localStorage and serve stale data offline"
```

---

### Task 9: Formatting helpers and page shell

**Files:**
- Create: `js/format.js`, `index.html`, `app.css`
- Test: `test/format.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `compass(degrees)`, `scoreBand(final)`, `timeRange(start, end)`, `relativeAge(ms)`, `dayLabel(date, today)`.
- The page shell exposes these element ids for Tasks 10 and 11: `#map`, `#spot-search-form`, `#spot-search`, `#spot-results`, `#spot-name`, `#now-bar`, `#windows`, `#days`, `#status`, `#tide-notice`.

- [ ] **Step 1: Write the failing test**

`test/format.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compass, scoreBand, timeRange, relativeAge, dayLabel } from '../js/format.js';

test('compass covers the cardinals', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(180), 'S');
  assert.equal(compass(270), 'W');
  assert.equal(compass(360), 'N');
});

test('compass rounds to 16 points', () => {
  assert.equal(compass(23), 'NNE');
  assert.equal(compass(247), 'WSW');
});

test('score bands partition 0 to 100', () => {
  assert.equal(scoreBand(95), 'excellent');
  assert.equal(scoreBand(70), 'good');
  assert.equal(scoreBand(50), 'fair');
  assert.equal(scoreBand(5), 'poor');
});

test('time range reads as a window', () => {
  const start = new Date(Date.UTC(2026, 7, 19, 5));
  const end = new Date(Date.UTC(2026, 7, 19, 8));
  assert.equal(timeRange(start, end), '05:00–08:00');
});

test('relative age is human readable', () => {
  assert.equal(relativeAge(30 * 1000), 'just now');
  assert.equal(relativeAge(3 * 3600 * 1000), '3h ago');
  assert.equal(relativeAge(25 * 3600 * 1000), '1d ago');
});

test('day labels name today and tomorrow', () => {
  const today = new Date(Date.UTC(2026, 7, 19, 9));
  assert.equal(dayLabel(new Date(Date.UTC(2026, 7, 19, 18)), today), 'Today');
  assert.equal(dayLabel(new Date(Date.UTC(2026, 7, 20, 6)), today), 'Tomorrow');
  assert.match(dayLabel(new Date(Date.UTC(2026, 7, 21, 6)), today), /21 Aug/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/format.test.mjs`
Expected: FAIL — cannot find `../js/format.js`.

- [ ] **Step 3: Write `js/format.js`**

Every formatter reads with UTC getters, because Task 7 stores Open-Meteo's
local wall-clock values as if they were UTC. Local getters would apply the
browser's offset a second time.

```js
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function compass(degrees) {
  if (!Number.isFinite(degrees)) return '';
  const idx = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[idx];
}

export function scoreBand(final) {
  if (final >= 80) return 'excellent';
  if (final >= 60) return 'good';
  if (final >= 40) return 'fair';
  return 'poor';
}

export function hhmm(d) {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function timeRange(start, end) {
  return `${hhmm(start)}–${hhmm(end)}`;
}

export function relativeAge(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function dayLabel(date, today = new Date()) {
  const dayNumber = (d) => Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000,
  );
  const diff = dayNumber(date) - dayNumber(today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/format.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write `index.html`**

The tide disclaimer copy is fixed. Do not soften it, shorten it, or add a
dismiss control.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b3d5c">
<title>Fishing Conditions</title>
<link rel="stylesheet" href="vendor/leaflet.css">
<link rel="stylesheet" href="app.css">
<link rel="manifest" href="manifest.json">
</head>
<body>
<header class="topbar">
  <h1>Fishing Conditions</h1>
  <form id="spot-search-form" class="search" role="search">
    <input id="spot-search" type="search" placeholder="Search a place, or tap the map" autocomplete="off">
    <button type="submit">Find</button>
  </form>
  <ul id="spot-results" class="results" hidden></ul>
</header>

<div id="map" aria-label="Pick a fishing spot"></div>

<main>
  <p id="spot-name" class="spot-name">Tap the map to pick a spot</p>
  <p id="status" class="status" role="status"></p>

  <section id="now-bar" class="now-bar" aria-label="Right now"></section>

  <section aria-labelledby="windows-heading">
    <h2 id="windows-heading">Best windows</h2>
    <div id="windows" class="windows"></div>
  </section>

  <section aria-labelledby="days-heading">
    <h2 id="days-heading">Next 7 days</h2>
    <div id="days" class="days"></div>
  </section>

  <p id="tide-notice" class="tide-notice">
    <strong>Tides are modelled, not measured.</strong>
    Tide heights come from a global ocean model and are typically accurate to
    within about 30&ndash;45 minutes near the coast. This is not SANHO data.
    Do not use it for navigation or bar crossings.
  </p>
</main>

<script src="vendor/leaflet.js"></script>
<script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Write `app.css`**

```css
:root {
  --bg: #0e1418;
  --panel: #17222a;
  --ink: #e8eef2;
  --muted: #93a6b3;
  --line: #26343f;
  --excellent: #35c26a;
  --good: #8fd14f;
  --fair: #e8b83b;
  --poor: #d1594a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.topbar { padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
.topbar h1 { margin: 0 0 8px; font-size: 18px; }

.search { display: flex; gap: 8px; }
.search input { flex: 1; min-width: 0; padding: 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
.search button { padding: 10px 14px; border-radius: 8px; border: 0; background: #2b6ea8; color: #fff; }

.results { list-style: none; margin: 8px 0 0; padding: 0; }
.results li button { width: 100%; text-align: left; padding: 10px; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 4px; }

#map { height: 38vh; min-height: 220px; }

main { padding: 16px; max-width: 900px; margin: 0 auto; }
h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 24px 0 10px; }

.spot-name { margin: 0 0 4px; font-weight: 600; }
.status { margin: 0 0 12px; color: var(--muted); font-size: 14px; min-height: 1.2em; }
.status.error { color: var(--poor); }

.now-bar { background: var(--panel); border: 1px solid var(--line); border-left: 5px solid var(--line); border-radius: 12px; padding: 14px; }
.now-verdict { display: flex; align-items: baseline; gap: 12px; }
.now-score { font-size: 40px; font-weight: 700; line-height: 1; }
.strip { display: flex; gap: 3px; margin-top: 12px; }
.strip span { flex: 1; height: 26px; border-radius: 3px; }

.windows { display: grid; gap: 10px; }
.window { background: var(--panel); border: 1px solid var(--line); border-left-width: 5px; border-radius: 10px; padding: 12px; }
.window header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.window .when { font-weight: 600; }
.window .score { font-size: 26px; font-weight: 700; }
.window .reasons { margin: 8px 0 0; padding-left: 18px; color: var(--muted); font-size: 14px; }
.window .metrics { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
.capped { color: var(--fair); font-size: 13px; margin: 6px 0 0; }

.days { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.day { background: var(--panel); border: 1px solid var(--line); border-left-width: 5px; border-radius: 10px; padding: 10px; }
.day .label { font-size: 13px; color: var(--muted); }
.day .score { font-size: 24px; font-weight: 700; }
.day .head { font-size: 13px; color: var(--muted); }

.band-excellent { border-left-color: var(--excellent); } .band-excellent .score, .band-excellent .now-score { color: var(--excellent); }
.band-good { border-left-color: var(--good); } .band-good .score, .band-good .now-score { color: var(--good); }
.band-fair { border-left-color: var(--fair); } .band-fair .score, .band-fair .now-score { color: var(--fair); }
.band-poor { border-left-color: var(--poor); } .band-poor .score, .band-poor .now-score { color: var(--poor); }

.bg-excellent { background: var(--excellent); }
.bg-good { background: var(--good); }
.bg-fair { background: var(--fair); }
.bg-poor { background: var(--poor); }

.tide-notice { margin: 28px 0 40px; padding: 12px; border: 1px solid var(--line); border-left: 4px solid var(--fair); border-radius: 8px; background: var(--panel); color: var(--muted); font-size: 13px; }
.tide-notice strong { color: var(--ink); display: block; margin-bottom: 4px; }
```

- [ ] **Step 7: Commit**

```bash
git add js/format.js test/format.test.mjs index.html app.css
git commit -m "feat: add formatting helpers, page shell and styling"
```

---

### Task 10: Rendering

**Files:**
- Create: `js/ui.js`

**Interfaces:**
- Consumes: `compass`, `scoreBand`, `timeRange`, `dayLabel`, `relativeAge`, `hhmm` from `js/format.js`; scored hours from Task 5; windows from Task 6.
- Produces:
  - `renderNow(target, scoredHours, now)`
  - `renderWindows(target, windows, now)`
  - `renderDays(target, scoredHours, now)`
  - `renderSpotResults(target, results, onPick)`
  - `setStatus(target, message, isError)`
  - `ageNotice(ageMs)` → string

- [ ] **Step 1: Write `js/ui.js`**

There is no DOM under `node --test` and no DOM shim is being added, so this
module is verified in the browser at the end of Task 11. Keep anything worth
testing in the pure modules; `ui.js` only turns data into elements. All text is
set via `textContent`, never `innerHTML`, so geocoder results cannot inject
markup.

```js
import { compass, scoreBand, timeRange, dayLabel, relativeAge, hhmm } from './format.js';

const VERDICTS = {
  excellent: 'Go now.',
  good: 'Worth a cast.',
  fair: 'Marginal.',
  poor: 'Not today.',
};

const BANDS = ['band-excellent', 'band-good', 'band-fair', 'band-poor'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metricsLine(hour) {
  const bits = [];
  if (Number.isFinite(hour.windSpeed)) {
    bits.push(`${Math.round(hour.windSpeed)} km/h ${compass(hour.windDirection)}`.trim());
  }
  if (Number.isFinite(hour.swellHeight)) {
    const period = Number.isFinite(hour.swellPeriod) ? ` @ ${Math.round(hour.swellPeriod)}s` : '';
    bits.push(`${hour.swellHeight.toFixed(1)} m swell${period}`);
  }
  if (Number.isFinite(hour.pressure)) bits.push(`${Math.round(hour.pressure)} hPa`);
  return bits.join(' · ');
}

export function setStatus(target, message, isError = false) {
  target.textContent = message ?? '';
  target.classList.toggle('error', Boolean(isError));
}

function currentIndex(hours, now) {
  let best = 0;
  let bestGap = Infinity;
  hours.forEach((h, i) => {
    const gap = Math.abs(h.time - now);
    if (gap < bestGap) { bestGap = gap; best = i; }
  });
  return best;
}

export function renderNow(target, hours, now = new Date()) {
  target.replaceChildren();
  target.classList.remove(...BANDS);
  if (!hours.length) return;

  const i = currentIndex(hours, now);
  const hour = hours[i];
  const band = scoreBand(hour.final);
  target.classList.add(`band-${band}`);

  const verdict = el('div', 'now-verdict');
  verdict.appendChild(el('span', 'now-score', String(hour.final)));

  const detail = el('div');
  detail.appendChild(el('div', null, VERDICTS[band]));
  detail.appendChild(el('div', 'metrics', metricsLine(hour)));
  verdict.appendChild(detail);
  target.appendChild(verdict);

  const strip = el('div', 'strip');
  for (const h of hours.slice(i, i + 12)) {
    const cell = el('span', `bg-${scoreBand(h.final)}`);
    cell.title = `${hhmm(h.time)} — ${h.final}`;
    strip.appendChild(cell);
  }
  target.appendChild(strip);
}

export function renderWindows(target, windows, now = new Date()) {
  target.replaceChildren();

  if (!windows.length) {
    target.appendChild(el('p', 'status', 'No windows above the threshold in the next 7 days.'));
    return;
  }

  for (const w of windows) {
    const band = scoreBand(w.meanFinal);
    const card = el('article', `window band-${band}`);

    const head = el('header');
    head.appendChild(el('span', 'when', `${dayLabel(w.start, now)} ${timeRange(w.start, w.end)}`));
    head.appendChild(el('span', 'score', String(w.meanFinal)));
    card.appendChild(head);

    if (w.minComfort < 0.6) {
      card.appendChild(el('p', 'capped',
        `Bite ${w.meanBite}, capped to ${w.meanFinal} by conditions.`));
    }

    const reasons = el('ul', 'reasons');
    for (const r of w.reasons.slice(0, 5)) reasons.appendChild(el('li', null, r));
    card.appendChild(reasons);

    card.appendChild(el('p', 'metrics', metricsLine(w.hours[0])));
    target.appendChild(card);
  }
}

export function renderDays(target, hours, now = new Date()) {
  target.replaceChildren();

  const byDay = new Map();
  for (const h of hours) {
    const key = h.time.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(h);
  }

  for (const dayHours of byDay.values()) {
    const best = dayHours.reduce((a, b) => (b.final > a.final ? b : a));
    const card = el('article', `day band-${scoreBand(best.final)}`);
    card.appendChild(el('div', 'label', dayLabel(best.time, now)));
    card.appendChild(el('div', 'score', String(best.final)));
    card.appendChild(el('div', 'head', `best ${hhmm(best.time)}`));
    target.appendChild(card);
  }
}

export function renderSpotResults(target, results, onPick) {
  target.replaceChildren();
  target.hidden = results.length === 0;

  for (const r of results) {
    const item = el('li');
    const label = [r.name, r.admin, r.country].filter(Boolean).join(', ');
    const button = el('button', null, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      target.hidden = true;
      onPick(r);
    });
    item.appendChild(button);
    target.appendChild(item);
  }
}

export function ageNotice(ageMs) {
  return `Offline — showing cached forecast from ${relativeAge(ageMs)}.`;
}
```

- [ ] **Step 2: Check the module parses**

Run: `node --check js/ui.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: render now bar, window cards and day cards"
```

---

### Task 11: Map, wiring and end-to-end verification

**Files:**
- Create: `js/map.js`, `js/main.js`

**Interfaces:**
- Consumes: everything from Tasks 2–10. Leaflet as the global `L` from the classic `<script>` tag in `index.html`.
- Produces:
  - `initMap(elementId, onPick)` → `{ moveTo(lat, lon, zoom), start }`. `onPick` receives `{ lat, lon }`.
  - `js/main.js` is the entry point and exports nothing.

- [ ] **Step 1: Write `js/map.js`**

```js
// Leaflet is loaded as a classic script in index.html, so it is a global here.
/* global L */

const DEFAULT_VIEW = { lat: -29.85, lon: 31.05, zoom: 9 }; // Durban
const LAST_SPOT_KEY = 'fc:last-spot';

function saveLastSpot(lat, lon, zoom) {
  try {
    localStorage.setItem(LAST_SPOT_KEY, JSON.stringify({ lat, lon, zoom }));
  } catch {
    // Storage disabled; the map simply starts at the default next time.
  }
}

function loadLastSpot() {
  try {
    const raw = localStorage.getItem(LAST_SPOT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) ? v : null;
  } catch {
    return null;
  }
}

export function initMap(elementId, onPick) {
  const start = loadLastSpot() ?? DEFAULT_VIEW;
  const map = L.map(elementId).setView([start.lat, start.lon], start.zoom ?? 11);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const marker = L.marker([start.lat, start.lon]).addTo(map);

  const pick = (lat, lon) => {
    marker.setLatLng([lat, lon]);
    saveLastSpot(lat, lon, map.getZoom());
    onPick({ lat, lon });
  };

  map.on('click', (e) => pick(e.latlng.lat, e.latlng.lng));

  return {
    start,
    moveTo(lat, lon, zoom = 12) {
      map.setView([lat, lon], zoom);
      pick(lat, lon);
    },
  };
}
```

- [ ] **Step 2: Write `js/main.js`**

```js
import { fetchConditions, geocode } from './api.js';
import { scoreHours } from './score.js';
import { findWindows } from './windows.js';
import { load as loadCache, save as saveCache } from './cache.js';
import { initMap } from './map.js';
import {
  renderNow, renderWindows, renderDays, renderSpotResults, setStatus, ageNotice,
} from './ui.js';

const $ = (id) => document.getElementById(id);

const els = {
  status: $('status'),
  spotName: $('spot-name'),
  now: $('now-bar'),
  windows: $('windows'),
  days: $('days'),
  searchForm: $('spot-search-form'),
  search: $('spot-search'),
  results: $('spot-results'),
};

function paint(payload, lat, lon) {
  const scored = scoreHours(payload.hours, lat, lon);
  const now = new Date();
  renderNow(els.now, scored, now);
  renderWindows(els.windows, findWindows(scored), now);
  renderDays(els.days, scored, now);
}

async function show(lat, lon) {
  if (!els.spotName.dataset.named) {
    els.spotName.textContent = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }
  els.spotName.dataset.named = '';
  setStatus(els.status, 'Loading forecast…');

  const cached = loadCache(lat, lon);
  if (cached?.fresh) {
    paint(cached.payload, lat, lon);
    setStatus(els.status, cached.payload.hasMarine
      ? ''
      : 'No tide or swell data here — scoring on weather and solunar only.');
    return;
  }

  try {
    const payload = await fetchConditions(lat, lon);
    saveCache(lat, lon, payload);
    paint(payload, lat, lon);
    setStatus(els.status, payload.hasMarine
      ? ''
      : 'No tide or swell data here — scoring on weather and solunar only.');
  } catch (err) {
    if (cached) {
      paint(cached.payload, lat, lon);
      setStatus(els.status, ageNotice(cached.ageMs), true);
    } else {
      setStatus(els.status, `Could not load a forecast: ${err.message}`, true);
    }
  }
}

const map = initMap('map', ({ lat, lon }) => show(lat, lon));

els.searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const term = els.search.value.trim();
  if (!term) return;

  setStatus(els.status, 'Searching…');
  try {
    const results = await geocode(term);
    if (!results.length) {
      setStatus(els.status, `No match for “${term}”.`, true);
      return;
    }
    setStatus(els.status, '');
    renderSpotResults(els.results, results, (r) => {
      els.spotName.textContent = [r.name, r.admin, r.country].filter(Boolean).join(', ');
      els.spotName.dataset.named = '1';
      map.moveTo(r.lat, r.lon);
    });
  } catch (err) {
    setStatus(els.status, `Search failed: ${err.message}`, true);
  }
});

show(map.start.lat, map.start.lon);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}
```

- [ ] **Step 3: Check both modules parse**

Run: `node --check js/map.js && node --check js/main.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests from Tasks 1–9.

- [ ] **Step 5: Verify in a browser**

Run `npm run serve`, open `http://127.0.0.1:8080`, and confirm each of these:

1. The map loads centred on Durban with a marker.
2. Tapping a point at sea populates the now bar, at least one window, and seven day cards.
3. Searching "Port Edward" lists results; picking one moves the map, renames the spot, and reloads the forecast.
4. Tapping a point well inland shows the "No tide or swell data here" status, and windows still render.
5. The tide notice is visible at the bottom with no dismiss control.
6. In DevTools, set the network to Offline and reload: cached data renders with an "Offline — showing cached forecast from …" status.
7. The console has no errors.

- [ ] **Step 6: Commit**

```bash
git add js/map.js js/main.js
git commit -m "feat: wire map, search, scoring and rendering into a working app"
```

---

### Task 12: Installable offline app and README

**Files:**
- Create: `tools/icons.mjs`, `icon-192.png`, `icon-512.png`, `manifest.json`, `sw.js`, `README.md`

**Interfaces:**
- Consumes: the finished app shell.
- Produces: an installable PWA that opens offline.

- [ ] **Step 1: Generate the icons**

`tools/icons.mjs` writes two solid-colour PNGs with no dependencies, so the
manifest has real icons without pulling in an image library.

```js
// Writes minimal solid-colour PNG icons. No dependencies.
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const pixel = Buffer.from([r, g, b]);
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array(size).fill(pixel))]);
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLOUR = [0x0b, 0x3d, 0x5c];
await writeFile('icon-192.png', png(192, COLOUR));
await writeFile('icon-512.png', png(512, COLOUR));
console.log('wrote icon-192.png and icon-512.png');
```

Run: `node tools/icons.mjs`
Expected: prints `wrote icon-192.png and icon-512.png`. Open one to confirm it
renders as a solid dark blue square.

- [ ] **Step 2: Write `manifest.json`**

```json
{
  "name": "Fishing Conditions",
  "short_name": "Fishing",
  "description": "Best fishing windows from weather, tide, swell and solunar data.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0e1418",
  "theme_color": "#0b3d5c",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Write `sw.js`**

Cache-first for the app shell so it opens without signal; network-first for
Open-Meteo and map tiles so a live forecast always wins when there is signal.

```js
const CACHE = 'fishing-conditions-v1';

const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.json',
  './js/main.js',
  './js/api.js',
  './js/astro.js',
  './js/cache.js',
  './js/config.js',
  './js/format.js',
  './js/map.js',
  './js/score.js',
  './js/ui.js',
  './js/windows.js',
  './vendor/suncalc.mjs',
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/images/marker-icon.png',
  './vendor/images/marker-icon-2x.png',
  './vendor/images/marker-shadow.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Forecasts and map tiles: always prefer the network, fall back to whatever
  // was cached. localStorage already holds the last forecast for the UI.
  if (url.hostname.endsWith('open-meteo.com') || url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
```

- [ ] **Step 4: Write `README.md`**

````markdown
# Fishing Conditions

Ranks the next 7 days into fishing windows for any point on a map, using
weather, tide, swell and solunar data. Built for shore, rock-and-surf and
estuary fishing.

No API keys. No signups. No backend.

## Run it

```bash
npm run vendor   # once: downloads Leaflet and SunCalc into vendor/
npm run serve    # http://127.0.0.1:8080
```

ES modules do not load over `file://`, so it must be served. Any static host
works — GitHub Pages, Netlify, or the command above.

## Test

```bash
npm test
```

The logic (`config`, `astro`, `score`, `windows`, `cache`, `format`, `api`) is
pure and unit-tested. `ui` and `map` are verified in a browser.

## How the score works

Two numbers, never blended:

- **Bite (0–100)** — will fish feed? Pressure trend 30, tide movement 30,
  solunar period 20, dawn/dusk 15, moon phase 5.
- **Comfort (0–1)** — can you fish it? Wind, gusts, swell and rain, applied as
  a cap so a gale cannot be outvoted by good solunar timing.

`final = bite × comfort`. Both are shown, so a strong bite window in bad
weather reads as exactly that rather than quietly disappearing.

Every constant lives in `js/config.js`. Retuning the app against what you
actually catch is a change to that one file.

## Tides

Tide heights come from Open-Meteo's `sea_level_height_msl`, a global ocean
model. Open-Meteo's own documentation warns that accuracy is limited in coastal
areas and that the data is not suitable for coastal navigation.

**This is not SANHO data. Do not use it for navigation or bar crossings.** For
anything safety-critical, use the
[SA Navy Hydrographic Office](https://sanho.co.za/Default.htm) tide tables.

## Data sources

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs) — wind, pressure, rain, sun times
- [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) — tide, swell, sea temperature
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) — place search
- [SunCalc](https://github.com/mourner/suncalc) — moon position and phase, computed locally
- [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/copyright) — map
````

- [ ] **Step 5: Verify the PWA in a browser**

Run `npm run serve`, open `http://127.0.0.1:8080`, then in DevTools:

1. Application → Manifest shows the name and both icons with no errors.
2. Application → Service Workers shows `sw.js` activated and running.
3. Set the network to Offline and reload: the shell still renders, with the
   cached-forecast status from Task 11.

- [ ] **Step 6: Run the full suite one last time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add manifest.json sw.js icon-192.png icon-512.png README.md tools/icons.mjs
git commit -m "feat: make the app installable and usable offline, add README"
```
