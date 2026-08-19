# Detail Grid & Multi-Spot Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the forecast data the app already downloads but throws away — a Windguru-style parameter-by-time grid for each of the 7 days — and let the angler compare up to 6 spots side by side to pick where to go.

**Architecture:** No API change; `api.js` already fetches every parameter needed. Three new pure modules (`spots.js`, `daily.js`, `compare.js`) carry all logic and are unit-tested; two new render modules (`ui-days.js`, `ui-compare.js`) keep `ui.js` from becoming a grab bag. `main.js` grows from one active spot to a saved list plus a transient preview.

**Tech Stack:** Vanilla ES2022 modules, no bundler, no runtime dependencies. `node --test` for the pure modules, the browser against the running container for the rendering.

**Spec:** `docs/superpowers/specs/2026-08-19-fishing-conditions-design.md` (v1 design; this plan extends it). The v2 decisions below were settled in conversation on 2026-08-19 and are binding.

## Global Constraints

- No new runtime dependencies, no build step, no API keys.
- Open-Meteo returns local wall-clock strings and the app stores them as if UTC. **Every date read uses UTC getters.** A local getter is a bug.
- All user-visible text is set via `textContent`. Never `innerHTML`.
- Every threshold, limit and slot size lives in `js/config.js`. No other file hard-codes one.
- Units are km/h for wind, metres for swell and tide, °C, hPa, mm. Not knots.
- Maximum 6 compared spots (`CONFIG.spots.max`).
- A map tap **previews** a point; it joins the compare list only via an explicit "Add to compare" control.
- The compare layout is a spots × days grid of best-score-per-day. Tapping a cell opens that spot's day detail.
- New `js/*.js` files MUST be added to the `SHELL` array in `sw.js`, or the app breaks offline.
- Tide extrema are derived from a modelled hourly series and must be labelled as such wherever shown.

---

### Task 1: Spot list model

**Files:**
- Create: `js/spots.js`
- Modify: `js/config.js`
- Test: `test/spots.test.mjs`

**Interfaces:**
- Consumes: `CONFIG` from `js/config.js`.
- Produces: `spotId(lat, lon) -> string`, `makeSpot(lat, lon, name) -> Spot`, `addSpot(list, spot) -> {spots, error}` where `error` is `null | 'duplicate' | 'full'`, `removeSpot(list, id) -> Spot[]`, `loadSpots(storage?) -> Spot[]`, `saveSpots(list, storage?) -> void`. `Spot` is `{id, lat, lon, name}`.

- [ ] **Step 1: Write the failing test**

```js
// test/spots.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotId, makeSpot, addSpot, removeSpot, loadSpots, saveSpots } from '../js/spots.js';
import { CONFIG } from '../js/config.js';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('spotId rounds to the cache precision so near-identical taps are one spot', () => {
  assert.equal(spotId(-29.8531, 31.0512), spotId(-29.8534, 31.0509));
  assert.notEqual(spotId(-29.85, 31.05), spotId(-29.95, 31.05));
});

test('makeSpot falls back to coordinates when there is no name', () => {
  assert.equal(makeSpot(-29.85, 31.05, '').name, '-29.850, 31.050');
  assert.equal(makeSpot(-29.85, 31.05, 'Umhlanga').name, 'Umhlanga');
});

test('addSpot rejects a duplicate rather than growing the list', () => {
  const first = addSpot([], makeSpot(-29.85, 31.05, 'A'));
  const second = addSpot(first.spots, makeSpot(-29.8503, 31.0501, 'A again'));
  assert.equal(second.error, 'duplicate');
  assert.equal(second.spots.length, 1);
});

test('addSpot refuses to exceed the configured maximum', () => {
  let spots = [];
  for (let i = 0; i < CONFIG.spots.max; i++) {
    spots = addSpot(spots, makeSpot(-29 - i, 31, `S${i}`)).spots;
  }
  const overflow = addSpot(spots, makeSpot(-50, 31, 'one too many'));
  assert.equal(overflow.error, 'full');
  assert.equal(overflow.spots.length, CONFIG.spots.max);
});

test('removeSpot drops only the named spot', () => {
  const a = makeSpot(-29.85, 31.05, 'A');
  const b = makeSpot(-30.85, 31.05, 'B');
  assert.deepEqual(removeSpot([a, b], a.id).map((s) => s.name), ['B']);
});

test('saveSpots and loadSpots round-trip through storage', () => {
  const storage = memoryStorage();
  const spots = [makeSpot(-29.85, 31.05, 'A')];
  saveSpots(spots, storage);
  assert.deepEqual(loadSpots(storage), spots);
});

test('loadSpots survives corrupt storage instead of throwing', () => {
  const storage = memoryStorage();
  storage.setItem(CONFIG.spots.storageKey, '{not json');
  assert.deepEqual(loadSpots(storage), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../js/spots.js'`

- [ ] **Step 3: Add the config block**

In `js/config.js`, insert before the `cache:` block:

```js
  spots: {
    max: 6,
    storageKey: 'fc:spots',
  },
```

- [ ] **Step 4: Write the implementation**

```js
// js/spots.js
import { CONFIG } from './config.js';

// A spot's identity is its rounded position, matching the forecast cache key
// precision. Two taps a few metres apart are the same rock, and treating them
// as two spots would burn a comparison slot and a forecast fetch on a duplicate.
export function spotId(lat, lon) {
  const p = CONFIG.cache.coordPrecision;
  return `${lat.toFixed(p)},${lon.toFixed(p)}`;
}

export function makeSpot(lat, lon, name = '') {
  return {
    id: spotId(lat, lon),
    lat,
    lon,
    name: name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
  };
}

export function addSpot(list, spot) {
  if (list.some((s) => s.id === spot.id)) return { spots: list, error: 'duplicate' };
  if (list.length >= CONFIG.spots.max) return { spots: list, error: 'full' };
  return { spots: [...list, spot], error: null };
}

export function removeSpot(list, id) {
  return list.filter((s) => s.id !== id);
}

export function loadSpots(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(CONFIG.spots.storageKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon))
      .slice(0, CONFIG.spots.max)
      .map((s) => makeSpot(s.lat, s.lon, s.name));
  } catch {
    // A corrupt list must not brick the app on launch.
    return [];
  }
}

export function saveSpots(list, storage = globalThis.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(CONFIG.spots.storageKey, JSON.stringify(list));
  } catch {
    // Storage full or disabled. The list simply does not persist.
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — the 53 existing tests plus 7 new ones.

- [ ] **Step 6: Commit**

```bash
git add js/spots.js js/config.js test/spots.test.mjs
git commit -m "feat: add saved spot list model with a 6-spot cap"
```

---

### Task 2: Tide extrema and time-slot aggregation

**Files:**
- Create: `js/daily.js`
- Modify: `js/config.js`
- Test: `test/daily.test.mjs`

**Interfaces:**
- Consumes: `CONFIG` from `js/config.js`.
- Produces: `tideExtremes(hours) -> [{type: 'high'|'low', time: Date, height: number}]`, `toSlots(hours) -> Slot[]` where `Slot` is `{start: Date, hours, score: number, wind, gust, windDirection, tide, swellHeight, swellPeriod, temperature, rain, cloud, pressure}` and every field after `score` is `number|null`.

- [ ] **Step 1: Write the failing test**

```js
// test/daily.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tideExtremes, toSlots } from '../js/daily.js';

const HOUR = 3600000;
const base = Date.UTC(2026, 7, 19, 0, 0, 0);

// A clean semidiurnal tide: 12.4 h period, 1.5 m amplitude around a 1.5 m mean.
const tideHours = (n = 26) => Array.from({ length: n }, (_, i) => ({
  time: new Date(base + i * HOUR),
  seaLevel: 1.5 + 1.5 * Math.sin((2 * Math.PI * i) / 12.4),
}));

test('tideExtremes finds alternating highs and lows', () => {
  const found = tideExtremes(tideHours());
  assert.ok(found.length >= 4, `expected at least 4 turning points, got ${found.length}`);
  for (let i = 1; i < found.length; i++) {
    assert.notEqual(found[i].type, found[i - 1].type, 'highs and lows must alternate');
  }
});

test('tideExtremes refines the peak off the sampled hour', () => {
  // The sine peaks at i = 3.1 h, which no hourly sample lands on. A naive
  // pick-the-largest-sample would report 03:00 exactly and understate the height.
  const high = tideExtremes(tideHours()).find((e) => e.type === 'high');
  const hoursFromBase = (high.time.getTime() - base) / HOUR;
  assert.ok(Math.abs(hoursFromBase - 3.1) < 0.2, `peak at ${hoursFromBase} h, expected ~3.1 h`);
  assert.ok(high.height > 2.99, `refined height ${high.height} should approach the 3.0 m crest`);
});

test('tideExtremes returns nothing when the spot has no tide data', () => {
  const hours = Array.from({ length: 12 }, (_, i) => ({
    time: new Date(base + i * HOUR),
    seaLevel: null,
  }));
  assert.deepEqual(tideExtremes(hours), []);
});

const weatherHour = (i, over = {}) => ({
  time: new Date(base + i * HOUR),
  final: 40 + i,
  windSpeed: 10,
  windGusts: 15,
  windDirection: 0,
  seaLevel: 1,
  swellHeight: 1.2,
  swellPeriod: 11,
  temperature: 20,
  precipitation: 0.5,
  cloudCover: 50,
  pressure: 1013,
  ...over,
});

test('toSlots groups hours into 3-hour columns', () => {
  const slots = toSlots(Array.from({ length: 24 }, (_, i) => weatherHour(i)));
  assert.equal(slots.length, 8);
  assert.equal(slots[0].start.getUTCHours(), 0);
  assert.equal(slots[1].start.getUTCHours(), 3);
});

test('toSlots reports the best hour for score and the worst for gusts', () => {
  const hours = [weatherHour(0), weatherHour(1), weatherHour(2)];
  hours[1].final = 90;
  hours[2].windGusts = 44;
  const [slot] = toSlots(hours);
  assert.equal(slot.score, 90, 'a good hour must not be averaged away');
  assert.equal(slot.gust, 44, 'the peak gust is the one that decides safety');
});

test('toSlots sums rain rather than averaging it', () => {
  const [slot] = toSlots([0, 1, 2].map((i) => weatherHour(i, { precipitation: 1 })));
  assert.equal(slot.rain, 3);
});

test('toSlots averages wind direction as a vector, not as a number', () => {
  // Naive averaging of 350 and 10 gives 180 -- a southerly reported for a
  // northerly, which would send you to the wrong side of the point.
  const hours = [
    weatherHour(0, { windDirection: 350 }),
    weatherHour(1, { windDirection: 10 }),
    weatherHour(2, { windDirection: 0 }),
  ];
  const [slot] = toSlots(hours);
  const offset = Math.min(slot.windDirection, 360 - slot.windDirection);
  assert.ok(offset < 5, `expected ~0 degrees, got ${slot.windDirection}`);
});

test('toSlots leaves marine fields null for an inland spot', () => {
  const hours = [0, 1, 2].map((i) => weatherHour(i, {
    seaLevel: null, swellHeight: null, swellPeriod: null,
  }));
  const [slot] = toSlots(hours);
  assert.equal(slot.tide, null);
  assert.equal(slot.swellHeight, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../js/daily.js'`

- [ ] **Step 3: Add the config block**

In `js/config.js`, insert immediately after the `spots:` block:

```js
  daily: {
    slotHours: 3, // columns per day in the detail grid: 24 / 3 = 8
  },
```

- [ ] **Step 4: Write the implementation**

```js
// js/daily.js
import { CONFIG } from './config.js';

const num = (v) => (Number.isFinite(v) ? v : null);

const mean = (values) => {
  const real = values.filter(Number.isFinite);
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
};

const maxOf = (values) => {
  const real = values.filter(Number.isFinite);
  return real.length ? Math.max(...real) : null;
};

const sum = (values) => values.filter(Number.isFinite).reduce((a, b) => a + b, 0);

// Compass bearings are circular: the mean of 350 and 10 is 0, not 180.
// Averaging the unit vectors is the only way to get that right.
function meanDirection(degrees) {
  const real = degrees.filter(Number.isFinite);
  if (!real.length) return null;
  let x = 0;
  let y = 0;
  for (const d of real) {
    const r = (d * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  if (x === 0 && y === 0) return null; // exactly opposing winds: no meaningful mean
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Finds the highs and lows in an hourly sea-level series.
//
// The series is sampled hourly but a real tide does not turn on the hour, so
// taking the largest sample would round every high and low to the nearest hour
// and understate its height. Fitting a parabola through the turning sample and
// its two neighbours recovers both, which for a smooth semidiurnal curve is
// accurate to a few minutes. It is still a modelled series, not a gauge
// reading, and must be labelled that way wherever it is shown.
export function tideExtremes(hours) {
  const out = [];

  for (let i = 1; i < hours.length - 1; i++) {
    const y0 = num(hours[i - 1].seaLevel);
    const y1 = num(hours[i].seaLevel);
    const y2 = num(hours[i + 1].seaLevel);
    if (y0 === null || y1 === null || y2 === null) continue;

    const rising = y1 - y0;
    const falling = y2 - y1;
    if (rising === 0 || falling === 0) continue;
    if (Math.sign(rising) === Math.sign(falling)) continue;

    const curvature = y0 - 2 * y1 + y2;
    // A straight line has no vertex to refine towards; keep the sample as-is.
    const offset = curvature === 0
      ? 0
      : Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / curvature));

    out.push({
      type: rising > 0 ? 'high' : 'low',
      time: new Date(hours[i].time.getTime() + offset * 3600000),
      height: y1 - 0.25 * (y0 - y2) * offset,
    });
  }

  return out;
}

// Collapses a day's hours into fixed-width columns for the detail grid.
//
// The aggregate differs per row on purpose: a three-hour block is summarised by
// its best score, because averaging hides the one good hour you would actually
// fish; by its worst gust, because that is what decides whether you can stand
// on the rocks; and by total rain, because millimetres accumulate.
export function toSlots(hours) {
  const size = CONFIG.daily.slotHours;
  const buckets = new Map();

  for (const hour of hours) {
    const key = Math.floor(hour.time.getUTCHours() / size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(hour);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => ({
      start: group[0].time,
      hours: group,
      score: maxOf(group.map((h) => h.final)) ?? 0,
      wind: mean(group.map((h) => h.windSpeed)),
      gust: maxOf(group.map((h) => h.windGusts)),
      windDirection: meanDirection(group.map((h) => h.windDirection)),
      tide: mean(group.map((h) => h.seaLevel)),
      swellHeight: mean(group.map((h) => h.swellHeight)),
      swellPeriod: mean(group.map((h) => h.swellPeriod)),
      temperature: mean(group.map((h) => h.temperature)),
      rain: sum(group.map((h) => h.precipitation)),
      cloud: mean(group.map((h) => h.cloudCover)),
      pressure: mean(group.map((h) => h.pressure)),
    }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 new tests.

- [ ] **Step 6: Commit**

```bash
git add js/daily.js js/config.js test/daily.test.mjs
git commit -m "feat: derive tide turning points and 3-hour forecast slots"
```

---

### Task 3: Day summaries with sun and moon

**Files:**
- Modify: `js/daily.js`, `js/astro.js`, `js/format.js`
- Test: `test/daily.test.mjs`, `test/format.test.mjs`

**Interfaces:**
- Consumes: `tideExtremes`, `toSlots` from Task 2; `solunarPeriods(date, lat, lon)`, `sunTimes(date, lat, lon)` from `js/astro.js`.
- Produces: `summariseDays(scoredHours, lat, lon) -> Day[]` where `Day` is `{key: string, date: Date, hours, best: {score, time}, slots: Slot[], tides, sun: {sunrise, sunset}, moon: {phase, illumination, name, majors, minors}, wind: {min, max, maxGust, direction}, swell: {min, max, maxPeriod}|null, temperature: {min, max}, rain: number, pressure: {min, max}}`. Also `moonIllumination(date) -> {phase, fraction}` from `js/astro.js` and `moonPhaseName(phase) -> string` from `js/format.js`.

- [ ] **Step 1: Write the failing tests**

Append to `test/daily.test.mjs`:

```js
import { summariseDays } from '../js/daily.js';

const twoDays = () => Array.from({ length: 48 }, (_, i) => ({
  time: new Date(base + i * HOUR),
  final: 30 + (i % 24),
  bite: 50,
  comfort: 0.8,
  reasons: [],
  windSpeed: 5 + (i % 12),
  windGusts: 10 + (i % 12),
  windDirection: 180,
  seaLevel: 1.5 + 1.5 * Math.sin((2 * Math.PI * i) / 12.4),
  swellHeight: 1 + (i % 3) * 0.2,
  swellPeriod: 10,
  temperature: 15 + (i % 10),
  precipitation: 0.1,
  cloudCover: 40,
  pressure: 1010 + (i % 5),
}));

test('summariseDays returns one entry per calendar day', () => {
  const days = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(days.length, 2);
  assert.equal(days[0].key, '2026-08-19');
  assert.equal(days[1].key, '2026-08-20');
});

test('summariseDays reports the best hour of each day', () => {
  const [day] = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(day.best.score, 53);
  assert.equal(day.best.time.getUTCHours(), 23);
});

test('summariseDays carries slots, tides, sun and moon for the day', () => {
  const [day] = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(day.slots.length, 8);
  assert.ok(day.tides.length >= 1);
  assert.ok(day.sun.sunrise instanceof Date);
  assert.ok(day.moon.illumination >= 0 && day.moon.illumination <= 1);
  assert.equal(typeof day.moon.name, 'string');
  assert.ok(Array.isArray(day.moon.majors));
});

test('summariseDays ranges cover the day, and rain is a daily total', () => {
  const [day] = summariseDays(twoDays(), -29.85, 31.05);
  assert.equal(day.wind.min, 5);
  assert.equal(day.wind.max, 16);
  assert.equal(day.temperature.min, 15);
  assert.ok(Math.abs(day.rain - 2.4) < 1e-9, `expected 24 x 0.1 mm, got ${day.rain}`);
});

test('summariseDays reports no swell for an inland spot', () => {
  const inland = twoDays().map((h) => ({
    ...h, seaLevel: null, swellHeight: null, swellPeriod: null,
  }));
  const [day] = summariseDays(inland, -29.1, 26.2);
  assert.equal(day.swell, null);
  assert.deepEqual(day.tides, []);
});
```

Append to `test/format.test.mjs`:

```js
import { moonPhaseName } from '../js/format.js';

test('moonPhaseName names the eight phases from the SunCalc phase fraction', () => {
  assert.equal(moonPhaseName(0), 'New moon');
  assert.equal(moonPhaseName(0.25), 'First quarter');
  assert.equal(moonPhaseName(0.5), 'Full moon');
  assert.equal(moonPhaseName(0.75), 'Last quarter');
  assert.equal(moonPhaseName(0.99), 'New moon');
  assert.equal(moonPhaseName(0.13), 'Waxing crescent');
  assert.equal(moonPhaseName(0.63), 'Waning gibbous');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `summariseDays is not a function` and `moonPhaseName is not a function`.

- [ ] **Step 3: Add `moonIllumination` to `js/astro.js`**

Add below `moonPhaseFraction`:

```js
// phase runs 0 (new) through 0.5 (full) to 1 (new again); fraction is the lit
// portion of the disc, which is what people mean by "62% moon".
export function moonIllumination(date) {
  const { phase, fraction } = SunCalc.getMoonIllumination(date);
  return { phase, fraction };
}
```

- [ ] **Step 4: Add `moonPhaseName` to `js/format.js`**

```js
const MOON_PHASES = [
  'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
  'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
];

// SunCalc's phase runs 0 (new) -> 0.5 (full) -> 1 (new). Rounding to eighths
// puts each name on the phase it is centred on, and wraps 1 back to new.
export function moonPhaseName(phase) {
  return MOON_PHASES[Math.round((((phase % 1) + 1) % 1) * 8) % 8];
}
```

- [ ] **Step 5: Add `summariseDays` to `js/daily.js`**

Add the imports at the top of `js/daily.js`:

```js
import { solunarPeriods, sunTimes, moonIllumination } from './astro.js';
import { moonPhaseName } from './format.js';
```

Append:

```js
const minOf = (values) => {
  const real = values.filter(Number.isFinite);
  return real.length ? Math.min(...real) : null;
};

function dayKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Groups scored hours into calendar days and attaches everything the detail
// view shows: the 3-hour grid, the day's tide turning points, sun times and
// the moon. Astronomy is computed once per day, not once per hour.
export function summariseDays(scoredHours, lat, lon) {
  const byDay = new Map();
  for (const hour of scoredHours) {
    const key = dayKey(hour.time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(hour);
  }

  // Extrema need a neighbour on each side, so they are found across the whole
  // series once and filtered per day. Finding them day by day would miss any
  // turn falling in a day's first or last hour.
  const allTides = tideExtremes(scoredHours);

  return [...byDay.entries()].map(([key, hours]) => {
    const noon = new Date(Date.UTC(
      hours[0].time.getUTCFullYear(),
      hours[0].time.getUTCMonth(),
      hours[0].time.getUTCDate(),
      12,
    ));
    const best = hours.reduce((a, b) => (b.final > a.final ? b : a));
    const { phase, fraction } = moonIllumination(noon);
    const swellHeights = hours.map((h) => h.swellHeight).filter(Number.isFinite);

    return {
      key,
      date: hours[0].time,
      hours,
      best: { score: best.final, time: best.time },
      slots: toSlots(hours),
      tides: allTides.filter((t) => dayKey(t.time) === key),
      sun: sunTimes(noon, lat, lon),
      moon: {
        phase,
        illumination: fraction,
        name: moonPhaseName(phase),
        ...solunarPeriods(noon, lat, lon), // contributes majors and minors
      },
      wind: {
        min: minOf(hours.map((h) => h.windSpeed)),
        max: maxOf(hours.map((h) => h.windSpeed)),
        maxGust: maxOf(hours.map((h) => h.windGusts)),
        direction: meanDirection(hours.map((h) => h.windDirection)),
      },
      swell: swellHeights.length ? {
        min: Math.min(...swellHeights),
        max: Math.max(...swellHeights),
        maxPeriod: maxOf(hours.map((h) => h.swellPeriod)),
      } : null,
      temperature: {
        min: minOf(hours.map((h) => h.temperature)),
        max: maxOf(hours.map((h) => h.temperature)),
      },
      rain: sum(hours.map((h) => h.precipitation)),
      pressure: {
        min: minOf(hours.map((h) => h.pressure)),
        max: maxOf(hours.map((h) => h.pressure)),
      },
    };
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 6 new tests.

- [ ] **Step 7: Commit**

```bash
git add js/daily.js js/astro.js js/format.js test/daily.test.mjs test/format.test.mjs
git commit -m "feat: summarise each forecast day with tides, sun and moon"
```

---

### Task 4: Comparison model

**Files:**
- Create: `js/compare.js`
- Test: `test/compare.test.mjs`

**Interfaces:**
- Consumes: `Day[]` from `summariseDays` (Task 3), `Spot` from `js/spots.js` (Task 1).
- Produces: `buildComparison(entries) -> {dayKeys: string[], dates: (Date|null)[], rows: Row[], best: {spotId, spotName, dayKey, date, score}|null}` where `entries` is `[{spot, days}]` and `Row` is `{spot, cells: [{dayKey, score: number|null}]}`.

- [ ] **Step 1: Write the failing test**

```js
// test/compare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison } from '../js/compare.js';

const day = (key, score) => ({
  key,
  date: new Date(`${key}T00:00:00Z`),
  best: { score, time: new Date(`${key}T06:00:00Z`) },
});

const entry = (name, scores) => ({
  spot: { id: name, name, lat: -29, lon: 31 },
  days: Object.entries(scores).map(([k, v]) => day(k, v)),
});

test('buildComparison lays spots down and days across', () => {
  const c = buildComparison([
    entry('Umhlanga', { '2026-08-19': 41, '2026-08-20': 58 }),
    entry('Ballito', { '2026-08-19': 44, '2026-08-20': 49 }),
  ]);
  assert.deepEqual(c.dayKeys, ['2026-08-19', '2026-08-20']);
  assert.deepEqual(c.rows.map((r) => r.spot.name), ['Umhlanga', 'Ballito']);
  assert.deepEqual(c.rows[0].cells.map((x) => x.score), [41, 58]);
});

test('buildComparison names the best spot and day overall', () => {
  const c = buildComparison([
    entry('Umhlanga', { '2026-08-19': 41, '2026-08-20': 81 }),
    entry('Ballito', { '2026-08-19': 44, '2026-08-20': 79 }),
  ]);
  assert.equal(c.best.spotName, 'Umhlanga');
  assert.equal(c.best.dayKey, '2026-08-20');
  assert.equal(c.best.score, 81);
});

test('buildComparison pads a spot that is missing a day', () => {
  // A spot added late, or one whose refresh failed, must not shift the grid.
  const c = buildComparison([
    entry('Umhlanga', { '2026-08-19': 41, '2026-08-20': 58 }),
    entry('Ballito', { '2026-08-20': 49 }),
  ]);
  assert.deepEqual(c.dayKeys, ['2026-08-19', '2026-08-20']);
  assert.deepEqual(c.rows[1].cells.map((x) => x.score), [null, 49]);
});

test('buildComparison handles an empty spot list', () => {
  const c = buildComparison([]);
  assert.deepEqual(c.dayKeys, []);
  assert.deepEqual(c.rows, []);
  assert.equal(c.best, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../js/compare.js'`

- [ ] **Step 3: Write the implementation**

```js
// js/compare.js

// Turns per-spot day summaries into the spots x days grid.
//
// The day axis is the union of every spot's days, not the first spot's, so a
// spot added mid-week or one whose refresh failed leaves a gap in its own row
// instead of shifting every column out of alignment.
export function buildComparison(entries) {
  const dayKeys = [...new Set(entries.flatMap((e) => e.days.map((d) => d.key)))].sort();

  const dates = dayKeys.map((key) => {
    for (const e of entries) {
      const hit = e.days.find((d) => d.key === key);
      if (hit) return hit.date;
    }
    return null;
  });

  const rows = entries.map((e) => {
    const byKey = new Map(e.days.map((d) => [d.key, d]));
    return {
      spot: e.spot,
      cells: dayKeys.map((key) => ({
        dayKey: key,
        score: byKey.has(key) ? byKey.get(key).best.score : null,
      })),
    };
  });

  let best = null;
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      if (cell.score === null) return;
      if (best && cell.score <= best.score) return;
      best = {
        spotId: row.spot.id,
        spotName: row.spot.name,
        dayKey: cell.dayKey,
        date: dates[i],
        score: cell.score,
      };
    });
  }

  return { dayKeys, dates, rows, best };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add js/compare.js test/compare.test.mjs
git commit -m "feat: build the spots-by-days comparison grid model"
```

---

### Task 5: Render the day detail grid

**Files:**
- Create: `js/ui-days.js`
- Modify: `js/ui.js` (remove `renderDays`), `js/main.js`, `app.css`, `sw.js`
- Verify: browser

**Interfaces:**
- Consumes: `Day[]` from `summariseDays`; `compass`, `scoreBand`, `hhmm`, `dayLabel` from `js/format.js`.
- Produces: `renderDays(target, days, now, options) -> void`, where `options` is `{openKey: string|null}` naming the day to expand.

- [ ] **Step 1: Delete the old `renderDays` from `js/ui.js`**

Remove the whole `export function renderDays(...)` block. Drop `dayLabel` from that file's import list if nothing else there uses it. `renderNow`, `renderWindows`, `renderSpotResults`, `setStatus` and `ageNotice` stay.

- [ ] **Step 2: Write `js/ui-days.js`**

```js
// js/ui-days.js
import { compass, scoreBand, hhmm, dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const n0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–');
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');

// Wind shading mirrors the comfort thresholds: comfortable, workable, ugly.
function windClass(kmh) {
  if (!Number.isFinite(kmh)) return '';
  if (kmh >= 45) return 'wind-hard';
  if (kmh >= 25) return 'wind-fresh';
  return 'wind-easy';
}

const ROWS = [
  { label: 'Score', get: (s) => n0(s.score), cls: (s) => `bg-${scoreBand(s.score)} score-cell` },
  { label: 'Wind km/h', get: (s) => n0(s.wind), cls: (s) => windClass(s.wind) },
  { label: 'Gust km/h', get: (s) => n0(s.gust), cls: (s) => windClass(s.gust) },
  { label: 'Direction', get: (s) => compass(s.windDirection) || '–' },
  { label: 'Tide m', get: (s) => n1(s.tide) },
  { label: 'Swell m', get: (s) => n1(s.swellHeight) },
  { label: 'Period s', get: (s) => n0(s.swellPeriod) },
  { label: 'Temp °C', get: (s) => n0(s.temperature) },
  { label: 'Rain mm', get: (s) => (s.rain > 0.05 ? s.rain.toFixed(1) : '–') },
  { label: 'Cloud %', get: (s) => n0(s.cloud) },
  { label: 'Pressure', get: (s) => n0(s.pressure) },
];

function grid(day) {
  const table = el('table', 'grid');

  const headRow = el('tr');
  headRow.appendChild(el('th', 'row-label', ''));
  for (const slot of day.slots) headRow.appendChild(el('th', null, hhmm(slot.start)));
  const head = el('thead');
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  for (const row of ROWS) {
    const tr = el('tr');
    tr.appendChild(el('th', 'row-label', row.label));
    for (const slot of day.slots) {
      tr.appendChild(el('td', row.cls ? row.cls(slot) : null, row.get(slot)));
    }
    body.appendChild(tr);
  }
  table.appendChild(body);

  const scroller = el('div', 'grid-scroll');
  scroller.appendChild(table);
  return scroller;
}

function tideLine(day) {
  if (!day.tides.length) return 'No tide data for this spot';
  const parts = day.tides.map((t) => `${t.type === 'high' ? 'High' : 'Low'} ${hhmm(t.time)} (${t.height.toFixed(1)} m)`);
  return `Tides (modelled): ${parts.join(' · ')}`;
}

function skyLine(day) {
  const bits = [];
  if (day.sun.sunrise) bits.push(`Sunrise ${hhmm(day.sun.sunrise)}`);
  if (day.sun.sunset) bits.push(`Sunset ${hhmm(day.sun.sunset)}`);
  bits.push(`${day.moon.name} ${Math.round(day.moon.illumination * 100)}%`);
  if (day.moon.majors.length) bits.push(`Major ${day.moon.majors.map(hhmm).join(', ')}`);
  if (day.moon.minors.length) bits.push(`Minor ${day.moon.minors.map(hhmm).join(', ')}`);
  return bits.join(' · ');
}

function digest(day) {
  const bits = [`${n0(day.wind.min)}–${n0(day.wind.max)} km/h ${compass(day.wind.direction)}`.trim()];
  if (day.swell) bits.push(`${n1(day.swell.min)}–${n1(day.swell.max)} m swell`);
  bits.push(`${n0(day.temperature.min)}–${n0(day.temperature.max)} °C`);
  if (day.rain > 0.05) bits.push(`${day.rain.toFixed(1)} mm rain`);
  return bits.join(' · ');
}

export function renderDays(target, days, now = new Date(), { openKey = null } = {}) {
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
    card.appendChild(grid(day));
    target.appendChild(card);
  }
}
```

- [ ] **Step 3: Add the styles to `app.css`**

Replace the existing `.days` and `.day` rules with:

```css
.days { display: grid; gap: 8px; }
.day { background: var(--panel); border: 1px solid var(--line); border-left-width: 5px; border-radius: 10px; padding: 10px 12px; }
.day summary { cursor: pointer; list-style: none; }
.day summary::-webkit-details-marker { display: none; }
.day-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.day .label { font-weight: 600; }
.day .score { font-size: 24px; font-weight: 700; }
.day .digest { color: var(--muted); font-size: 13px; }
.tide-line, .sky-line { margin: 8px 0 0; color: var(--muted); font-size: 13px; }

.grid-scroll { overflow-x: auto; margin-top: 10px; -webkit-overflow-scrolling: touch; }
table.grid { border-collapse: collapse; font-size: 13px; white-space: nowrap; }
table.grid th, table.grid td { padding: 4px 8px; text-align: right; border-bottom: 1px solid var(--line); }
table.grid thead th { color: var(--muted); font-weight: 500; }
/* The parameter names must stay readable while the times scroll under them. */
table.grid .row-label { position: sticky; left: 0; background: var(--panel); text-align: left; color: var(--muted); font-weight: 500; }
table.grid .score-cell { color: #06231a; font-weight: 700; }
.wind-easy { color: var(--good); }
.wind-fresh { color: var(--fair); }
.wind-hard { color: var(--poor); }
```

- [ ] **Step 4: Point `main.js` at the new module**

In `js/main.js`, drop `renderDays` from the `./ui.js` import and add:

```js
import { renderDays } from './ui-days.js';
import { summariseDays } from './daily.js';
```

and change the call inside `paint` to:

```js
  renderDays(els.days, summariseDays(scored, lat, lon), now);
```

- [ ] **Step 5: Add the new modules to the service worker shell**

In `sw.js`, add `'./js/daily.js'`, `'./js/spots.js'`, `'./js/compare.js'` and `'./js/ui-days.js'` to `SHELL`. A module missing from this list is a module that fails offline.

- [ ] **Step 6: Verify in the browser**

```bash
npm test
podman build --format docker -t fishing-conditions:1.0.0 .
podman rm -f fishing
podman run -d --name fishing -p 8080:8080 --restart unless-stopped fishing-conditions:1.0.0
```

Open `http://127.0.0.1:8080`. Expected: 7 day cards, today expanded, showing an 11-row grid across 8 columns, a tide line naming the highs and lows, and a sun/moon line. The parameter labels stay put while the grid scrolls sideways.

- [ ] **Step 7: Commit**

```bash
git add js/ui-days.js js/ui.js js/main.js app.css sw.js
git commit -m "feat: expand each day into a scrollable forecast grid"
```

---

### Task 6: Render the spot chips and comparison grid

**Files:**
- Create: `js/ui-compare.js`
- Modify: `index.html`, `app.css`, `sw.js`
- Verify: browser (wired up in Task 7)

**Interfaces:**
- Consumes: the comparison object from `buildComparison` (Task 4); `Spot` from `js/spots.js`.
- Produces: `renderSpotChips(target, spots, activeId, {onSelect, onRemove}) -> void`; `renderCompare(target, comparison, now, {onCell}) -> void`; `renderPreview(target, preview, {onAdd}) -> void` where `preview` is `{name, score, canAdd, reason}` or `null`.

- [ ] **Step 1: Add the containers to `index.html`**

Insert directly after the `<div id="map"></div>` element:

```html
  <section id="preview" class="preview" aria-live="polite" hidden></section>
  <div id="spots" class="spots" aria-label="Saved spots"></div>
```

and insert before the "Best windows" section:

```html
  <section id="compare-section" aria-labelledby="compare-heading" hidden>
    <h2 id="compare-heading">Compare spots</h2>
    <div id="compare"></div>
  </section>
```

- [ ] **Step 2: Write `js/ui-compare.js`**

```js
// js/ui-compare.js
import { scoreBand, dayLabel } from './format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderSpotChips(target, spots, activeId, { onSelect, onRemove }) {
  target.replaceChildren();

  for (const spot of spots) {
    const chip = el('span', `chip${spot.id === activeId ? ' chip-active' : ''}`);

    const pick = el('button', 'chip-name', spot.name);
    pick.type = 'button';
    pick.addEventListener('click', () => onSelect(spot.id));
    chip.appendChild(pick);

    const drop = el('button', 'chip-remove', '×');
    drop.type = 'button';
    drop.title = `Remove ${spot.name}`;
    drop.setAttribute('aria-label', `Remove ${spot.name}`);
    drop.addEventListener('click', () => onRemove(spot.id));
    chip.appendChild(drop);

    target.appendChild(chip);
  }
}

export function renderPreview(target, preview, { onAdd } = {}) {
  target.replaceChildren();
  target.hidden = !preview;
  if (!preview) return;

  const row = el('div', 'preview-row');
  row.appendChild(el('span', 'preview-name', preview.name));
  if (Number.isFinite(preview.score)) {
    row.appendChild(el('span', `preview-score band-${scoreBand(preview.score)}`, String(preview.score)));
  }

  if (preview.canAdd) {
    const add = el('button', 'add-spot', '+ Add to compare');
    add.type = 'button';
    add.addEventListener('click', onAdd);
    row.appendChild(add);
  } else if (preview.reason) {
    row.appendChild(el('span', 'preview-reason', preview.reason));
  }

  target.appendChild(row);
}

export function renderCompare(target, comparison, now = new Date(), { onCell }) {
  target.replaceChildren();
  if (!comparison.rows.length) return;

  const table = el('table', 'grid compare');

  const headRow = el('tr');
  headRow.appendChild(el('th', 'row-label', ''));
  for (const date of comparison.dates) {
    headRow.appendChild(el('th', null, date ? dayLabel(date, now).slice(0, 3) : '?'));
  }
  const head = el('thead');
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  for (const row of comparison.rows) {
    const tr = el('tr');
    tr.appendChild(el('th', 'row-label', row.spot.name));
    for (const cell of row.cells) {
      const td = el('td');
      if (cell.score === null) {
        td.textContent = '–';
      } else {
        const button = el('button', `cell bg-${scoreBand(cell.score)}`, String(cell.score));
        button.type = 'button';
        button.addEventListener('click', () => onCell(row.spot.id, cell.dayKey));
        td.appendChild(button);
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);

  const scroller = el('div', 'grid-scroll');
  scroller.appendChild(table);
  target.appendChild(scroller);

  if (comparison.best) {
    const when = comparison.best.date ? dayLabel(comparison.best.date, now) : '';
    target.appendChild(el('p', 'best-line',
      `Best this week: ${comparison.best.spotName}, ${when} — ${comparison.best.score}`));
  }
}
```

- [ ] **Step 3: Add the styles to `app.css`**

```css
.preview { padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
.preview-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; max-width: 900px; margin: 0 auto; }
.preview-name { font-weight: 600; }
.preview-score { font-weight: 700; font-size: 20px; }
.preview-reason { color: var(--muted); font-size: 13px; }
.add-spot { margin-left: auto; padding: 8px 12px; border: 0; border-radius: 8px; background: #2b6ea8; color: #fff; }

.spots { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px 0; max-width: 900px; margin: 0 auto; }
.chip { display: inline-flex; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.chip-active { border-color: #2b6ea8; }
.chip-name { background: none; border: 0; color: var(--ink); padding: 6px 4px 6px 12px; font-size: 14px; }
.chip-remove { background: none; border: 0; color: var(--muted); padding: 6px 10px 6px 6px; font-size: 16px; line-height: 1; }

table.compare .cell { border: 0; border-radius: 6px; padding: 6px 10px; font-weight: 700; color: #06231a; min-width: 40px; }
.best-line { margin: 10px 0 0; font-size: 14px; }
```

- [ ] **Step 4: Add `ui-compare.js` to the service worker shell**

Add `'./js/ui-compare.js'` to `SHELL` in `sw.js`.

- [ ] **Step 5: Confirm nothing regressed**

Run: `npm test`
Expected: PASS, count unchanged. These modules touch the DOM and are exercised in the browser in Task 7; this step only catches an accidental break elsewhere.

- [ ] **Step 6: Commit**

```bash
git add js/ui-compare.js index.html app.css sw.js
git commit -m "feat: add spot chips, map preview bar and comparison grid rendering"
```

---

### Task 7: Wire it together

**Files:**
- Modify: `js/main.js`, `js/map.js`, `README.md`
- Verify: browser

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: the finished app. `initMap(elementId, onPick)`'s return value gains `setMarkers(spots, activeId)` and `setPreview(lat, lon)`.

- [ ] **Step 1: Give the map multiple markers**

Replace the marker handling in `js/map.js`. The single `marker` becomes a preview marker plus a layer group of saved-spot markers:

```js
export function initMap(elementId, onPick) {
  const start = loadLastSpot() ?? DEFAULT_VIEW;
  const map = L.map(elementId).setView([start.lat, start.lon], start.zoom ?? 11);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const previewMarker = L.marker([start.lat, start.lon], { opacity: 0.6 }).addTo(map);
  const saved = L.layerGroup().addTo(map);

  const pick = (lat, lon) => {
    previewMarker.setLatLng([lat, lon]);
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
    setPreview(lat, lon) {
      previewMarker.setLatLng([lat, lon]);
    },
    // Saved spots are drawn as labelled circles so they read differently from
    // the single translucent pin marking whatever you last tapped.
    setMarkers(spots, activeId) {
      saved.clearLayers();
      for (const spot of spots) {
        L.circleMarker([spot.lat, spot.lon], {
          radius: spot.id === activeId ? 10 : 7,
          color: '#2b6ea8',
          fillColor: spot.id === activeId ? '#2b6ea8' : '#17222a',
          fillOpacity: 1,
          weight: 3,
        }).bindTooltip(spot.name).addTo(saved);
      }
    },
  };
}
```

- [ ] **Step 2: Rewrite `js/main.js`**

```js
import { fetchConditions, geocode } from './api.js';
import { scoreHours } from './score.js';
import { findWindows } from './windows.js';
import { summariseDays } from './daily.js';
import { buildComparison } from './compare.js';
import { load as loadCache, save as saveCache } from './cache.js';
import { loadSpots, saveSpots, addSpot, removeSpot, makeSpot } from './spots.js';
import { initMap } from './map.js';
import { renderNow, renderWindows, renderSpotResults, setStatus, ageNotice } from './ui.js';
import { renderDays } from './ui-days.js';
import { renderSpotChips, renderCompare, renderPreview } from './ui-compare.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);

const els = {
  status: $('status'),
  spotName: $('spot-name'),
  now: $('now-bar'),
  windows: $('windows'),
  days: $('days'),
  spots: $('spots'),
  preview: $('preview'),
  compare: $('compare'),
  compareSection: $('compare-section'),
  searchForm: $('spot-search-form'),
  search: $('spot-search'),
  results: $('spot-results'),
};

const state = {
  spots: loadSpots(),
  scored: new Map(), // spot id -> scored hours
  active: null,      // spot id, or null while a preview is showing
  preview: null,     // {lat, lon, name, scored}
  openDay: null,
};

const marineNote = (hasMarine) => (hasMarine
  ? ''
  : 'No tide or swell data here — scoring on weather and solunar only.');

function shown() {
  if (state.active) {
    const spot = state.spots.find((s) => s.id === state.active);
    const scored = state.scored.get(state.active);
    return spot && scored ? { spot, scored } : null;
  }
  return state.preview?.scored
    ? { spot: state.preview, scored: state.preview.scored }
    : null;
}

function nearestIndex(hours, now = Date.now()) {
  let best = 0;
  let gap = Infinity;
  hours.forEach((h, i) => {
    const d = Math.abs(h.time - now);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
}

function paintDetail() {
  const view = shown();
  if (!view) return;
  const now = new Date();

  els.spotName.textContent = view.spot.name;
  renderNow(els.now, view.scored, now);
  renderWindows(els.windows, findWindows(view.scored), now);
  renderDays(
    els.days,
    summariseDays(view.scored, view.spot.lat, view.spot.lon),
    now,
    { openKey: state.openDay },
  );
}

function paintCompare() {
  const entries = state.spots
    .filter((s) => state.scored.has(s.id))
    .map((s) => ({ spot: s, days: summariseDays(state.scored.get(s.id), s.lat, s.lon) }));

  // One spot is not a comparison; the day grid below already covers it.
  els.compareSection.hidden = entries.length < 2;
  renderCompare(els.compare, buildComparison(entries), new Date(), {
    onCell(spotId, dayKey) {
      state.active = spotId;
      state.preview = null;
      state.openDay = dayKey;
      renderPreview(els.preview, null);
      paintChips();
      paintDetail();
      els.days.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
}

function paintChips() {
  renderSpotChips(els.spots, state.spots, state.active, {
    onSelect(id) {
      state.active = id;
      state.preview = null;
      state.openDay = null;
      renderPreview(els.preview, null);
      const spot = state.spots.find((s) => s.id === id);
      if (spot) map.setPreview(spot.lat, spot.lon);
      paintChips();
      paintDetail();
    },
    onRemove(id) {
      state.spots = removeSpot(state.spots, id);
      state.scored.delete(id);
      saveSpots(state.spots);
      if (state.active === id) state.active = state.spots[0]?.id ?? null;
      paintChips();
      paintCompare();
      paintDetail();
    },
  });
  map.setMarkers(state.spots, state.active);
}

function paintPreviewBar() {
  if (!state.preview) {
    renderPreview(els.preview, null);
    return;
  }

  const id = makeSpot(state.preview.lat, state.preview.lon).id;
  const already = state.spots.some((s) => s.id === id);
  const full = state.spots.length >= CONFIG.spots.max;
  const hours = state.preview.scored;

  renderPreview(els.preview, {
    name: state.preview.name,
    score: hours?.length ? hours[nearestIndex(hours)].final : null,
    canAdd: !already && !full,
    reason: already ? 'Already comparing' : (full ? `Limit is ${CONFIG.spots.max} spots` : ''),
  }, {
    onAdd() {
      const spot = makeSpot(state.preview.lat, state.preview.lon, state.preview.name);
      const result = addSpot(state.spots, spot);
      if (result.error) return;
      state.spots = result.spots;
      saveSpots(state.spots);
      if (state.preview.scored) state.scored.set(spot.id, state.preview.scored);
      state.active = spot.id;
      state.preview = null;
      paintPreviewBar();
      paintChips();
      paintCompare();
      paintDetail();
    },
  });
}

// Cached data paints immediately, then the network revalidates. navigator.onLine
// is deliberately not consulted: it reports that a link exists, not that
// anything is reachable, so a dead cell connection still claims to be online.
async function loadSpotData(lat, lon) {
  const cached = loadCache(lat, lon);
  let payload = cached?.payload ?? null;
  let stale = Boolean(cached && !cached.fresh);
  let error = null;

  try {
    payload = await fetchConditions(lat, lon);
    saveCache(lat, lon, payload);
    stale = false;
  } catch (err) {
    error = err;
  }

  return { payload, stale, error, ageMs: cached?.ageMs ?? 0 };
}

let pending = 0;

async function previewPoint(lat, lon, name = '') {
  const token = ++pending;
  state.active = null;
  state.openDay = null;
  state.preview = { lat, lon, name: name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, scored: null };
  paintChips();
  paintPreviewBar();
  setStatus(els.status, 'Loading forecast…');

  const { payload, stale, error, ageMs } = await loadSpotData(lat, lon);
  // A newer point was tapped while this was in flight; its result wins.
  if (token !== pending) return;

  if (!payload) {
    setStatus(els.status, `Could not load a forecast: ${error.message}`, true);
    return;
  }

  state.preview.scored = scoreHours(payload.hours, lat, lon);
  paintPreviewBar();
  paintDetail();
  setStatus(els.status, stale ? ageNotice(ageMs) : marineNote(payload.hasMarine), stale);
}

async function refreshSavedSpots() {
  const results = await Promise.all(state.spots.map(async (spot) => ({
    spot,
    payload: (await loadSpotData(spot.lat, spot.lon)).payload,
  })));

  for (const { spot, payload } of results) {
    if (payload) state.scored.set(spot.id, scoreHours(payload.hours, spot.lat, spot.lon));
  }
  paintCompare();
  paintDetail();
}

const map = initMap('map', ({ lat, lon }) => previewPoint(lat, lon));

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
      const name = [r.name, r.admin, r.country].filter(Boolean).join(', ');
      // moveTo fires onPick, which previews the bare coordinates; this call
      // re-previews with the place name and wins because it bumps pending.
      map.moveTo(r.lat, r.lon);
      previewPoint(r.lat, r.lon, name);
    });
  } catch (err) {
    setStatus(els.status, `Search failed: ${err.message}`, true);
  }
});

paintChips();

if (state.spots.length) {
  state.active = state.spots[0].id;
  paintChips();
  refreshSavedSpots();
} else {
  previewPoint(map.start.lat, map.start.lon);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}
```

- [ ] **Step 3: Update `README.md`**

Replace the feature list under the intro with:

```markdown
Tap a point on the map to preview it, then add it to the comparison. Up to 6
spots are compared as a grid of best-score-per-day; tap any cell to jump to that
spot's detail for that day. Each of the 7 days expands into a 3-hourly grid of
score, wind, gusts, direction, tide, swell, temperature, rain, cloud and
pressure, with the day's tide turning points, sunrise and sunset, moon phase and
solunar periods above it.
```

- [ ] **Step 4: Rebuild and verify in the browser**

```bash
npm test
podman build --format docker -t fishing-conditions:1.0.0 .
podman rm -f fishing
podman run -d --name fishing -p 8080:8080 --restart unless-stopped fishing-conditions:1.0.0
```

Check by hand at `http://127.0.0.1:8080`:
1. A map tap shows the preview bar with a score and "+ Add to compare"; the compare grid does not appear yet.
2. Adding two spots reveals the compare grid with both rows and a "Best this week" line.
3. Tapping a compare cell opens that spot's detail with that day expanded.
4. The × on a chip removes the spot, and the remaining list survives a reload.
5. With 6 spots saved, a 7th preview offers no button and says "Limit is 6 spots".
6. An inland point still renders: dashes in the swell rows and "No tide data for this spot".
7. Offline (devtools), the app still paints from cache with the age notice.

- [ ] **Step 5: Commit**

```bash
git add js/main.js js/map.js README.md
git commit -m "feat: compare up to 6 spots and browse each day's full forecast"
```

---

## Self-Review

**Spec coverage:** every v2 decision maps to a task — the day grid (5), the spots × days comparison (4, 6), preview-then-add (6, 7), the 6-spot cap (1), and tides / wind / temperature / pressure / moon phase (2, 3, 5).

**Type consistency:** `Slot` is produced by `toSlots` (Task 2) and read by `ui-days.js` (Task 5) under the same field names. `Day.best.score` is produced in Task 3 and read by `buildComparison` (Task 4) and `ui-days.js` (Task 5). `Spot` (`{id, lat, lon, name}`) is produced in Task 1 and read in Tasks 4, 6 and 7. `summariseDays(scoredHours, lat, lon)` keeps one signature throughout.

**Known risk:** Task 7 refreshes every saved spot on load, up to 12 requests (forecast plus marine per spot). Open-Meteo's free tier absorbs this comfortably; if it ever rate-limits, stagger `refreshSavedSpots` rather than shrink the cap.
