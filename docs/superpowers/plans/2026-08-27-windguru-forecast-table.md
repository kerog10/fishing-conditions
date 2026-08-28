# Windguru-grade Forecast Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-days band cards with a dense, colour-coded 3-hourly forecast table — severity-tinted cells, wind arrows, a diagonal hatch where forecast models disagree, and an extended slot detail panel.

**Architecture:** Two new pure modules (`severity.js`, `models.js`) feed a third (`table.js`) that turns `daily.js` day summaries into a render-ready table model with no DOM and no formatting. Two thin render modules (`ui-table.js`, `ui-slot.js`) draw it. `api.js` grows the new Open-Meteo parameters and two extra multi-model requests, issued alongside the existing two via `Promise.allSettled` so only the first is required. `bands.js` and `ui-days.js` are retired.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. `node --test` for unit tests. Open-Meteo Forecast and Marine APIs, keyless.

**Spec:** `docs/superpowers/specs/2026-08-27-windguru-forecast-table-design.md`

## Global Constraints

- **No build step, no bundler, no new dependencies.** Browser-native ES modules with relative paths (`./config.js`). Everything must run by opening `index.html` from a static server.
- **No API keys, no backend.** Any URL built by `api.js` must stay key-free; `test/api.test.mjs` asserts this.
- **Every threshold lives in `js/config.js`.** No module may hard-code a band boundary, tolerance, model id or row label.
- **Local-wall-clock-as-UTC convention.** Open-Meteo `timezone=auto` returns local strings; `api.js` stamps them `Z`. **Every** formatter and every piece of date arithmetic in new code must use UTC getters (`getUTCHours()`), never local ones.
- **Tide data is modelled, not measured.** Never label it SANHO or navigation-grade. The tide notice at the bottom of `index.html` stays exactly as it is.
- **Phone first: 356 px viewport.** Label column 68 px + 8 columns × 34 px = 340 px, so a full day fits with no horizontal scrolling inside that day.
- **Three-state agreement.** `true` / `false` / `null` where only one model answered. These must never collapse into a boolean — "models agree" and "we only have one model" are different claims.
- **Tests:** `npm test` runs `node --test "test/**/*.test.mjs"`. Pure logic is unit-tested; render modules are verified in a browser.
- **Commit style:** short imperative subject with a `feat:` / `fix:` / `refactor:` / `docs:` prefix, matching the existing log.

## Deviations from the spec's sketches, decided here

1. The spec's `Column.cells[key].marker` field is dropped. The only marker needed is the tide `H`/`L` glyph, which the spec also models as `Column.tideExtreme`; one home for it, not two.
2. Agreement tolerance keys are named for **table row keys** (`rain`, `swell`) rather than the spec's API parameter names (`precipitation`, `swellHeight`), so a cell looks up its own tolerance by its own key with no translation table.
3. `Column.slot` carries the raw `daily.js` slot object. The table model is otherwise pure, but the slot detail needs the full hourly readings and `reasons`, and threading a second parallel array through the render layer to avoid one reference would be worse.
4. Marine rows are dropped by **emptiness**, not by a `hasMarine` flag: a row with no finite reading in any column of any day is omitted. Inland spots therefore lose tide, swell, period and sea temperature automatically.

---

### Task 1: Config — severity ramps, model requests, table rows

**Files:**
- Modify: `js/config.js` (append new keys after the `windows` block)
- Test: `test/config.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `CONFIG.severity` (`{wind, gusts, swell, rain: number[], tideSteps: number, scorePoor: number}`), `CONFIG.models` (`{forecast: string[], marine: string[], forecastParams: Record<rowKey, apiParam>, marineParams: Record<rowKey, apiParam>, tolerance: Record<rowKey, number>, scoreInputs: string[]}`), `CONFIG.tableRows` (`Array<{key, label, slot, kind, ramp?, digits?}>` where `kind` is `'score' | 'plain' | 'tinted' | 'arrow'`).

- [ ] **Step 1: Write the failing test**

Append to `test/config.test.mjs`:

```js
test('severity ramps bracket the comfort thresholds they colour', () => {
  const { severity, comfort } = CONFIG;
  // A cell must turn red at the same wind speed the comfort multiplier
  // collapses at, or the colour and the score disagree in front of the user.
  assert.ok(severity.wind.includes(comfort.wind.ideal), 'wind ramp needs a stop at comfort ideal');
  assert.ok(severity.wind.at(-1) < comfort.wind.worst, 'wind ramp must top out below comfort worst');
  assert.ok(severity.gusts.includes(comfort.gusts.ideal), 'gust ramp needs a stop at comfort ideal');
  assert.equal(severity.gusts.at(-1), comfort.gusts.worst);
  assert.equal(severity.swell.at(-1), comfort.swell.worst);
  assert.equal(severity.rain.at(-1), comfort.rain.worst);
});

test('every severity ramp ascends', () => {
  for (const key of ['wind', 'gusts', 'swell', 'rain']) {
    const ramp = CONFIG.severity[key];
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(ramp[i] > ramp[i - 1], `${key} ramp must ascend at index ${i}`);
    }
  }
});

test('the poor score boundary sits below the good one, which is the window threshold', () => {
  assert.ok(CONFIG.severity.scorePoor < CONFIG.windows.threshold);
});

test('a table row names a severity ramp only when it is tinted', () => {
  for (const row of CONFIG.tableRows) {
    assert.ok(row.key && row.label && row.slot, `row ${row.key} is incomplete`);
    assert.ok(['score', 'plain', 'tinted', 'arrow'].includes(row.kind), `row ${row.key} has kind ${row.kind}`);
    if (row.kind === 'tinted') {
      assert.ok(row.ramp === 'tide' || Array.isArray(CONFIG.severity[row.ramp]),
        `row ${row.key} names ramp ${row.ramp}, which does not exist`);
    } else {
      assert.equal(row.ramp, undefined, `row ${row.key} is not tinted but names a ramp`);
    }
  }
});

test('table row keys are unique', () => {
  const keys = CONFIG.tableRows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every agreement tolerance and score input names a requested parameter', () => {
  const params = { ...CONFIG.models.forecastParams, ...CONFIG.models.marineParams };
  for (const key of Object.keys(CONFIG.models.tolerance)) {
    assert.ok(params[key], `tolerance for ${key} has no requested parameter`);
  }
  for (const key of CONFIG.models.scoreInputs) {
    assert.ok(CONFIG.models.tolerance[key], `score input ${key} has no tolerance`);
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- --test-name-pattern "severity ramps bracket"`
Expected: FAIL — `CONFIG.severity` is undefined, so reading `severity.wind` throws.

- [ ] **Step 3: Add the config**

Insert into `js/config.js` immediately after the closing brace of the `windows: { ... },` block:

```js
  // Severity ramps for the forecast table: the upper bound of each band. A
  // value above the last bound falls into one final band beyond the array, so
  // a ramp of six bounds paints seven bands.
  //
  // wind and gusts deliberately bracket comfort.wind and comfort.gusts above,
  // so a cell turning red and the comfort multiplier collapsing happen at the
  // same wind speed. Retuning one without the other is the bug this prevents.
  severity: {
    wind: [10, 15, 20, 25, 30, 40],         // km/h
    gusts: [16, 22, 28, 35, 45, 60],        // km/h
    swell: [0.5, 1.0, 1.5, 2.0, 2.5, 3.5],  // m
    rain: [0.1, 0.5, 1.0, 2.0, 5.0],        // mm/h
    // Tide has no absolute ramp: tidal range varies by spot and by spring or
    // neap, so an absolute scale would leave some spots one colour all week
    // and tell you nothing about when the water moves. It is normalised
    // within each day's own range into this many steps instead.
    tideSteps: 4,
    // The good boundary is windows.threshold, not a second definition of
    // "good". Only the poor boundary is new here.
    scorePoor: 35,
  },

  // Multi-model agreement. These are requests, not guarantees: model coverage
  // is regional and Open-Meteo drops an unavailable model silently, so the
  // models actually present are always read back off the response.
  models: {
    forecast: ['gfs_seamless', 'icon_seamless', 'ecmwf_ifs025'],
    marine: ['gwam', 'ecmwf_wam025'],
    // Only the parameters that decide whether you go. Tripling all twenty
    // across three models would be payload for nothing. Keys are table row
    // keys; values are Open-Meteo parameter names.
    forecastParams: {
      wind: 'wind_speed_10m',
      gusts: 'wind_gusts_10m',
      pressure: 'pressure_msl',
      rain: 'precipitation',
    },
    // swell_wave_height, not wave_height: agreement must be computed on the
    // same quantity the swell row displays.
    marineParams: {
      swell: 'swell_wave_height',
    },
    // Spread (max - min) across the available models above which a cell is
    // marked disputed.
    tolerance: {
      wind: 8,      // km/h
      gusts: 12,    // km/h
      pressure: 2,  // hPa
      rain: 1,      // mm/h
      swell: 0.5,   // m
    },
    // A dispute in any of these is a dispute in the score built from them.
    scoreInputs: ['wind', 'gusts', 'pressure', 'rain', 'swell'],
  },

  // The forecast table, top row first. `slot` names the property on a slot
  // from daily.js; `ramp` names a severity ramp above. Changing the table is
  // an edit to this array.
  tableRows: [
    { key: 'score', label: 'SCORE', slot: 'score', kind: 'score' },
    { key: 'bite', label: 'bite', slot: 'bite', kind: 'plain', digits: 0 },
    { key: 'comfort', label: 'comf', slot: 'comfort', kind: 'plain', digits: 2 },
    { key: 'wind', label: 'wind', slot: 'wind', kind: 'tinted', ramp: 'wind', digits: 0 },
    { key: 'gusts', label: 'gust', slot: 'gust', kind: 'tinted', ramp: 'gusts', digits: 0 },
    { key: 'dir', label: 'dir', slot: 'windDirection', kind: 'arrow' },
    { key: 'swell', label: 'swell', slot: 'swellHeight', kind: 'tinted', ramp: 'swell', digits: 1 },
    { key: 'period', label: 'per s', slot: 'swellPeriod', kind: 'plain', digits: 0 },
    { key: 'tide', label: 'tide', slot: 'tide', kind: 'tinted', ramp: 'tide', digits: 1 },
    { key: 'rain', label: 'rain', slot: 'rain', kind: 'tinted', ramp: 'rain', digits: 1 },
    { key: 'cloud', label: 'cloud', slot: 'cloud', kind: 'plain', digits: 0 },
    { key: 'air', label: 'air °C', slot: 'temperature', kind: 'plain', digits: 0 },
    { key: 'sea', label: 'sea °C', slot: 'seaTemperature', kind: 'plain', digits: 0 },
  ],
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/config.js test/config.test.mjs
git commit -m "feat: severity ramps, model agreement and table row config"
```

---

### Task 2: `severity.js` — value to band index

**Files:**
- Create: `js/severity.js`
- Test: `test/severity.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.severity`, `CONFIG.windows.threshold` from Task 1.
- Produces:
  - `band(ramp: string, value: number|null) => number|null` — index into the named ramp, `0` calmest; `ramp.length` for anything above the last bound; `null` for a missing reading or an unknown ramp.
  - `bandCount(ramp: string) => number` — how many bands the ramp paints.
  - `tideBand(value, min, max, steps?) => number|null` — `0..steps-1`, normalised within `[min, max]`.
  - `scoreBandIndex(score: number|null) => 0|1|2|null` — `0` good, `1` moderate, `2` poor.

- [ ] **Step 1: Write the failing test**

Create `test/severity.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { band, bandCount, tideBand, scoreBandIndex } from '../js/severity.js';
import { CONFIG } from '../js/config.js';

test('a value on a band boundary stays in the lower band', () => {
  // 15 km/h is comfort.wind.ideal. It must read as still-fine, not as the
  // start of the next band up.
  assert.equal(band('wind', 15), 1);
  assert.equal(band('wind', 15.1), 2);
});

test('the calmest reading is band zero', () => {
  assert.equal(band('wind', 0), 0);
  assert.equal(band('wind', 10), 0);
});

test('anything above the ramp falls into one final band', () => {
  const last = CONFIG.severity.wind.length;
  assert.equal(band('wind', 40), last - 1);
  assert.equal(band('wind', 41), last);
  assert.equal(band('wind', 400), last, 'a hurricane is not a new colour');
});

test('a missing reading has no band, so a gap is never coloured as calm', () => {
  assert.equal(band('wind', null), null);
  assert.equal(band('wind', undefined), null);
  assert.equal(band('wind', NaN), null);
});

test('an unknown ramp reports no band rather than throwing', () => {
  assert.equal(band('nonsense', 12), null);
});

test('bandCount is one more than the number of bounds', () => {
  assert.equal(bandCount('wind'), CONFIG.severity.wind.length + 1);
  assert.equal(bandCount('nonsense'), 0);
});

test('tide is normalised within the range it is given', () => {
  assert.equal(tideBand(0.0, 0, 2, 4), 0);
  assert.equal(tideBand(0.6, 0, 2, 4), 1);
  assert.equal(tideBand(1.2, 0, 2, 4), 2);
  assert.equal(tideBand(2.0, 0, 2, 4), 3, 'the top of the range is the top step, not off the end');
});

test('a flat tide draws a mid step rather than dividing by zero', () => {
  assert.equal(tideBand(1.4, 1.4, 1.4, 4), 1);
});

test('tide with no range reports no band', () => {
  assert.equal(tideBand(1.2, Infinity, -Infinity, 4), null, 'an empty day has no min or max');
  assert.equal(tideBand(null, 0, 2, 4), null);
});

test('the good score boundary is the window threshold, not a second number', () => {
  assert.equal(scoreBandIndex(CONFIG.windows.threshold), 0);
  assert.equal(scoreBandIndex(CONFIG.windows.threshold - 1), 1);
  assert.equal(scoreBandIndex(CONFIG.severity.scorePoor), 1);
  assert.equal(scoreBandIndex(CONFIG.severity.scorePoor - 1), 2);
  assert.equal(scoreBandIndex(null), null);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- --test-name-pattern "a value on a band boundary"`
Expected: FAIL — cannot find module `../js/severity.js`.

- [ ] **Step 3: Write the implementation**

Create `js/severity.js`:

```js
import { CONFIG } from './config.js';

// Turns a reading into a colour band index. Free of the DOM and of any colour:
// this answers what band a 24 km/h wind is in, the table decides what band 4
// looks like.

// 0 is the calmest band. A value above the last bound lands in one final band
// beyond the array, so a ramp of six bounds paints seven bands. A boundary
// value stays in the band below it: 15 km/h is still the second band, because
// 15 is the top of "fine", not the bottom of "getting up".
export function band(ramp, value) {
  const bounds = CONFIG.severity[ramp];
  if (!Array.isArray(bounds) || !Number.isFinite(value)) return null;
  for (let i = 0; i < bounds.length; i++) {
    if (value <= bounds[i]) return i;
  }
  return bounds.length;
}

export function bandCount(ramp) {
  const bounds = CONFIG.severity[ramp];
  return Array.isArray(bounds) ? bounds.length + 1 : 0;
}

// Tide is normalised within the day's own range. Tidal range varies by spot
// and by spring or neap, so an absolute ramp would leave some spots one colour
// all week and tell you nothing about when the water moves.
export function tideBand(value, min, max, steps = CONFIG.severity.tideSteps) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  // A dead-flat day has no range to normalise against. A mid step reads as
  // "no movement", which is what happened.
  if (max === min) return Math.floor((steps - 1) / 2);
  const fraction = (value - min) / (max - min);
  return Math.max(0, Math.min(steps - 1, Math.floor(fraction * steps)));
}

// One threshold, one meaning: good starts where the best-windows finder starts
// counting a window. Only the poor boundary is the table's own.
export function scoreBandIndex(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= CONFIG.windows.threshold) return 0;
  if (score >= CONFIG.severity.scorePoor) return 1;
  return 2;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/severity.js test/severity.test.mjs
git commit -m "feat: severity band indexing for the forecast table"
```

---

### Task 3: `models.js` — multi-model response parsing and agreement

**Files:**
- Create: `js/models.js`
- Test: `test/models.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.models.tolerance` from Task 1.
- Produces:
  - `modelSeries(hourly: object, param: string) => Array<{model: string, values: number[]}>` — one entry per model that actually returned data, `marine_` stripped from the model name.
  - `agrees(values: number[], tolerance: number) => boolean|null` — `null` when fewer than two values.
  - `agreementByTime(sources: Array<{json, params: Record<rowKey, apiParam>}>) => Record<timeString, Record<rowKey, {readings: Array<{model, value}>, agree: boolean|null}>>`

- [ ] **Step 1: Write the failing test**

Create `test/models.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelSeries, agrees, agreementByTime } from '../js/models.js';
import { CONFIG } from '../js/config.js';

const TIMES = ['2026-08-27T00:00', '2026-08-27T01:00', '2026-08-27T02:00'];

// A real multi-model response shape: three models asked for, one dropped
// silently because it does not cover this region, and one present as a key
// with no data at all.
const forecastHourly = {
  time: TIMES,
  wind_speed_10m_gfs_seamless: [10, 18, 30],
  wind_speed_10m_icon_seamless: [11, 20, 12],
  wind_speed_10m_ecmwf_ifs025: [null, null, null],
  wind_gusts_10m_gfs_seamless: [20, 30, 44],
  wind_gusts_10m_icon_seamless: [21, 31, 45],
};

test('models are read off the response keys, not a requested list', () => {
  const series = modelSeries(forecastHourly, 'wind_speed_10m');
  assert.deepEqual(series.map((s) => s.model).sort(), ['gfs_seamless', 'icon_seamless']);
});

test('a model key with no data is not an available model', () => {
  // Open-Meteo returns keys with unit "undefined" and all-null values.
  // Presence of a key is not evidence of data.
  const series = modelSeries(forecastHourly, 'wind_speed_10m');
  assert.ok(!series.some((s) => s.model === 'ecmwf_ifs025'));
});

test('the marine best_match prefix is normalised', () => {
  const series = modelSeries({
    time: TIMES,
    swell_wave_height_marine_best_match: [1.1, 1.2, 1.3],
    swell_wave_height_gwam: [1.2, 1.3, 1.4],
  }, 'swell_wave_height');
  assert.deepEqual(series.map((s) => s.model).sort(), ['best_match', 'gwam']);
});

test('a parameter that is a prefix of another does not steal its models', () => {
  const series = modelSeries({
    time: TIMES,
    swell_wave_height_gwam: [1, 1, 1],
    secondary_swell_wave_height_gwam: [0.4, 0.4, 0.4],
  }, 'swell_wave_height');
  assert.equal(series.length, 1);
});

test('one model is not a consensus', () => {
  assert.equal(agrees([12], 8), null);
  assert.equal(agrees([], 8), null);
});

test('agreement is the spread against the tolerance, boundary inclusive', () => {
  assert.equal(agrees([10, 18], 8), true);
  assert.equal(agrees([10, 18.1], 8), false);
  assert.equal(agrees([10, 14, 30], 8), false, 'the outlier decides it');
});

test('agreementByTime indexes every hour by its own time string', () => {
  const index = agreementByTime([
    { json: { hourly: forecastHourly }, params: CONFIG.models.forecastParams },
  ]);

  assert.equal(index[TIMES[0]].wind.agree, true, 'spread of 1 km/h');
  assert.equal(index[TIMES[2]].wind.agree, false, 'spread of 18 km/h');
  assert.deepEqual(
    index[TIMES[2]].wind.readings.map((r) => r.value).sort((a, b) => a - b),
    [12, 30],
  );
  assert.equal(index[TIMES[2]].gusts.agree, true, 'gusts have their own tolerance');
});

test('a parameter that was never asked for is simply absent', () => {
  const index = agreementByTime([
    { json: { hourly: forecastHourly }, params: CONFIG.models.forecastParams },
  ]);
  assert.equal(index[TIMES[0]].pressure, undefined);
  assert.equal(index[TIMES[0]].swell, undefined);
});

test('forecast and marine sources merge into one index', () => {
  const index = agreementByTime([
    { json: { hourly: forecastHourly }, params: CONFIG.models.forecastParams },
    {
      json: {
        hourly: {
          time: TIMES,
          swell_wave_height_gwam: [1.0, 1.0, 1.0],
          swell_wave_height_ecmwf_wam025: [1.2, 2.0, 1.1],
        },
      },
      params: CONFIG.models.marineParams,
    },
  ]);

  assert.equal(index[TIMES[0]].swell.agree, true);
  assert.equal(index[TIMES[1]].swell.agree, false);
  assert.equal(index[TIMES[1]].wind.agree, true, 'the forecast source survives the merge');
});

test('a missing or malformed source is skipped, not fatal', () => {
  const index = agreementByTime([
    { json: null, params: CONFIG.models.forecastParams },
    { json: { hourly: { time: null } }, params: CONFIG.models.marineParams },
  ]);
  assert.deepEqual(index, {});
});

test('only one model available reports null, never agreement', () => {
  const index = agreementByTime([
    {
      json: { hourly: { time: TIMES, wind_speed_10m_gfs_seamless: [10, 11, 12] } },
      params: CONFIG.models.forecastParams,
    },
  ]);
  assert.equal(index[TIMES[0]].wind.agree, null, 'silence must not read as agreement');
  assert.equal(index[TIMES[0]].wind.readings.length, 1);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- --test-name-pattern "models are read off the response keys"`
Expected: FAIL — cannot find module `../js/models.js`.

- [ ] **Step 3: Write the implementation**

Create `js/models.js`:

```js
import { CONFIG } from './config.js';

// Reads a multi-model Open-Meteo response and turns it into a per-hour view of
// how much the models disagree. No DOM, no colours: this answers "do they
// agree", the table decides what that looks like.

// Open-Meteo returns one field per model, suffixed with the model id:
// wind_speed_10m_gfs_seamless. Three things make reconstructing those names
// from the requested list wrong, so the keys are read back instead:
//   - model coverage is regional, and an unavailable model is dropped with no
//     error at all;
//   - the marine API suffixes best_match as _marine_best_match;
//   - a key can come back with unit "undefined" and no data, so presence of a
//     key is not evidence of data. One real reading is the bar, mirroring the
//     hasMarine check in api.js.
export function modelSeries(hourly, param) {
  const out = [];
  for (const key of Object.keys(hourly ?? {})) {
    if (!key.startsWith(`${param}_`)) continue;
    const values = hourly[key];
    if (!Array.isArray(values) || !values.some(Number.isFinite)) continue;
    out.push({ model: key.slice(param.length + 1).replace(/^marine_/, ''), values });
  }
  return out;
}

// Three states, deliberately distinct. null means one model answered, which is
// not agreement: silence must never be rendered as confidence.
export function agrees(values, tolerance) {
  if (values.length < 2) return null;
  return (Math.max(...values) - Math.min(...values)) <= tolerance;
}

// Keyed by the raw Open-Meteo time string so api.js can attach each hour's
// entry to the hour it belongs to by name rather than by position -- the
// multi-model request can resolve to a different grid cell, and nothing
// guarantees it returns the same row count.
//
// A plain object, not a Map, because the whole payload goes through
// JSON.stringify into localStorage and a Map serialises to {}.
export function agreementByTime(sources) {
  const index = {};

  for (const { json, params } of sources) {
    const hourly = json?.hourly;
    const times = hourly?.time;
    if (!Array.isArray(times)) continue;

    for (const [rowKey, param] of Object.entries(params)) {
      const series = modelSeries(hourly, param);
      if (!series.length) continue;
      const tolerance = CONFIG.models.tolerance[rowKey];

      times.forEach((time, i) => {
        const readings = series
          .map(({ model, values }) => ({ model, value: values[i] }))
          .filter((r) => Number.isFinite(r.value));
        if (!readings.length) return;
        index[time] ??= {};
        index[time][rowKey] = {
          readings,
          agree: agrees(readings.map((r) => r.value), tolerance),
        };
      });
    }
  }

  return index;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/models.js test/models.test.mjs
git commit -m "feat: parse multi-model responses into per-hour agreement"
```

---

### Task 4: `api.js` — new parameters, model requests, cache key

**Files:**
- Modify: `js/api.js` (parameter lists, URL builders, `normalise`, `fetchConditions`)
- Modify: `js/cache.js` (`cacheKey`)
- Test: `test/api.test.mjs`, `test/cache.test.mjs`

**Interfaces:**
- Consumes: `agreementByTime` from Task 3; `CONFIG.models` from Task 1.
- Produces:
  - `modelForecastUrl(lat, lon) => string`, `modelMarineUrl(lat, lon) => string`
  - `normalise(forecastJson, marineJson, agreement = {})` — each hour gains `humidity, dewPoint, apparentTemperature, visibility, cape, freezingLevel, cloudLow, cloudMid, cloudHigh, uvIndex, wavePeriod, waveDirection, windWaveHeight, windWavePeriod, windWaveDirection, secondarySwellHeight, currentVelocity, currentDirection`, plus `agreement: Record<rowKey, {readings, agree}>|null`.
  - `fetchConditions(lat, lon, fetchImpl?)` — unchanged signature, now four requests via `Promise.allSettled`, only the forecast required.
  - `cacheKey(lat, lon)` — now suffixed `:<model list>`.

- [ ] **Step 1: Write the failing tests**

Append to `test/api.test.mjs` (and add `modelForecastUrl, modelMarineUrl` to the existing `../js/api.js` import, plus `import { CONFIG } from '../js/config.js';`):

```js
test('the model urls request every configured model and no api key', () => {
  const f = modelForecastUrl(-29.85, 31.05);
  assert.ok(!/apikey|api_key|token/i.test(f));
  for (const m of CONFIG.models.forecast) assert.ok(f.includes(m), `${m} missing from ${f}`);
  for (const p of Object.values(CONFIG.models.forecastParams)) assert.ok(f.includes(p));
  // Only the parameters the score turns on, not all twenty.
  assert.ok(!f.includes('visibility'), 'the model request must stay small');

  const m = modelMarineUrl(-29.85, 31.05);
  for (const model of CONFIG.models.marine) assert.ok(m.includes(model));
  assert.ok(m.includes('swell_wave_height'));
  assert.ok(!m.includes('sea_level_height_msl'), 'tide models do not disagree with themselves');
});

test('normalise carries the new atmospheric and marine readings through', () => {
  const { hours } = normalise(forecast, marine);
  const h = hours[0];
  for (const key of ['humidity', 'dewPoint', 'apparentTemperature', 'uvIndex', 'cloudLow',
    'windWaveHeight', 'secondarySwellHeight', 'currentVelocity', 'waveDirection']) {
    assert.ok(key in h, `${key} missing from the hour record`);
  }
});

test('normalise attaches agreement to the hour with the matching time', () => {
  const t = forecast.hourly.time[1];
  const agreement = { [t]: { wind: { readings: [{ model: 'gfs', value: 10 }], agree: false } } };
  const { hours } = normalise(forecast, marine, agreement);
  assert.equal(hours[0].agreement, null, 'hours with no model data carry null, not {}');
  assert.equal(hours[1].agreement.wind.agree, false);
});

test('fetchConditions renders without any of the three optional requests', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('models=')) return { ok: false, status: 500, statusText: 'no models' };
    if (url.includes('marine')) return { ok: false, status: 500, statusText: 'no marine' };
    return { ok: true, json: async () => forecast };
  };
  const result = await fetchConditions(-29.85, 31.05, fakeFetch);
  assert.equal(result.hasMarine, false);
  assert.ok(result.hours.length > 0);
  assert.equal(result.hours[0].agreement, null, 'no model data means nothing is marked, not everything');
});

test('fetchConditions computes agreement when the model request succeeds', async () => {
  const times = forecast.hourly.time;
  const modelJson = {
    hourly: {
      time: times,
      wind_speed_10m_gfs_seamless: times.map(() => 10),
      wind_speed_10m_icon_seamless: times.map(() => 30),
    },
  };
  const fakeFetch = async (url) => {
    if (url.includes('models=') && url.includes('marine')) {
      return { ok: false, status: 500, statusText: 'no marine models' };
    }
    if (url.includes('models=')) return { ok: true, json: async () => modelJson };
    if (url.includes('marine')) return { ok: true, json: async () => marine };
    return { ok: true, json: async () => forecast };
  };
  const result = await fetchConditions(-29.85, 31.05, fakeFetch);
  assert.equal(result.hours[0].agreement.wind.agree, false, '20 km/h apart is a dispute');
  assert.equal(result.hours[0].agreement.swell, undefined);
});

test('the plain forecast request is still the only fatal one', async () => {
  const fakeFetch = async (url) => (url.includes('open-meteo.com/v1/forecast') && !url.includes('models=')
    ? { ok: false, status: 503, statusText: 'down' }
    : { ok: true, json: async () => ({ hourly: { time: [] } }) });
  await assert.rejects(() => fetchConditions(-29.85, 31.05, fakeFetch), /503/);
});
```

Append to `test/cache.test.mjs` (adding `import { CONFIG } from '../js/config.js';` if it is not already imported):

```js
test('the cache key includes the model list', () => {
  // Without this, editing CONFIG.models keeps serving a payload built from the
  // old list -- single-model data with no agreement marks -- and nothing in
  // the UI could tell you it was stale.
  const key = cacheKey(-29.85, 31.05);
  for (const m of [...CONFIG.models.forecast, ...CONFIG.models.marine]) {
    assert.ok(key.includes(m), `${m} missing from ${key}`);
  }
  assert.ok(key.startsWith(CONFIG.cache.keyPrefix), 'clearAll matches on the prefix');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm test -- --test-name-pattern "the model urls request every configured model"`
Expected: FAIL — `modelForecastUrl` is not exported.

- [ ] **Step 3: Extend the parameter lists and add the model URLs**

Replace the top of `js/api.js`, from the import down to and including `geocodeUrl`'s preceding blank line, with:

```js
import { CONFIG } from './config.js';
import { agreementByTime } from './models.js';

const FORECAST_HOURLY = [
  'temperature_2m', 'precipitation', 'cloud_cover', 'pressure_msl',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  // Added for the forecast table's slot detail. All verified against live
  // responses; none of them need a key or a different endpoint.
  'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature',
  'visibility', 'cape', 'freezing_level_height',
  'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'uv_index',
].join(',');

const MARINE_HOURLY = [
  'sea_level_height_msl', 'wave_height', 'wave_period',
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
  'sea_surface_temperature',
  // Wind wave and swell wave are different seas arriving at the same beach,
  // and the table's swell row only shows one of them.
  'wind_wave_height', 'wind_wave_period', 'wind_wave_direction',
  'secondary_swell_wave_height', 'wave_direction',
  'ocean_current_velocity', 'ocean_current_direction',
].join(',');

const base = (lat, lon) => `?latitude=${lat}&longitude=${lon}`
  + `&timezone=auto&forecast_days=${CONFIG.forecastDays}`;

export function forecastUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + base(lat, lon)
    + `&hourly=${FORECAST_HOURLY}`
    + '&daily=sunrise,sunset';
}

export function marineUrl(lat, lon) {
  return 'https://marine-api.open-meteo.com/v1/marine'
    + base(lat, lon)
    + `&hourly=${MARINE_HOURLY}`;
}

// The agreement requests. Deliberately narrow: only the parameters that decide
// whether you go fishing, because tripling all twenty across three models
// would be payload for nothing.
export function modelForecastUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + base(lat, lon)
    + `&hourly=${Object.values(CONFIG.models.forecastParams).join(',')}`
    + `&models=${CONFIG.models.forecast.join(',')}`;
}

export function modelMarineUrl(lat, lon) {
  return 'https://marine-api.open-meteo.com/v1/marine'
    + base(lat, lon)
    + `&hourly=${Object.values(CONFIG.models.marineParams).join(',')}`
    + `&models=${CONFIG.models.marine.join(',')}`;
}
```

Keep `geocodeUrl`, `toDate`, `at`, `getJson` and the daily-sun handling in `normalise` exactly as they are. If `forecastUrl` or `marineUrl` previously inlined `latitude=...&timezone=auto&forecast_days=...` rather than using a shared helper, the `base` helper above replaces those inline copies; the resulting URLs are unchanged, which the existing `forecast_days=7` and `timezone=auto` tests confirm.

- [ ] **Step 4: Extend `normalise`**

Change the signature:

```js
export function normalise(forecastJson, marineJson, agreement = {}) {
```

and replace the object returned from the `f.time.map((t, i) => {` callback with:

```js
    return {
      time: toDate(t),
      temperature: at(f.temperature_2m, i),
      precipitation: at(f.precipitation, i),
      cloudCover: at(f.cloud_cover, i),
      pressure: at(f.pressure_msl, i),
      windSpeed: at(f.wind_speed_10m, i),
      windDirection: at(f.wind_direction_10m, i),
      windGusts: at(f.wind_gusts_10m, i),
      humidity: at(f.relative_humidity_2m, i),
      dewPoint: at(f.dew_point_2m, i),
      apparentTemperature: at(f.apparent_temperature, i),
      visibility: at(f.visibility, i),
      cape: at(f.cape, i),
      freezingLevel: at(f.freezing_level_height, i),
      cloudLow: at(f.cloud_cover_low, i),
      cloudMid: at(f.cloud_cover_mid, i),
      cloudHigh: at(f.cloud_cover_high, i),
      uvIndex: at(f.uv_index, i),
      seaLevel: hasRow ? at(m.sea_level_height_msl, mi) : null,
      waveHeight: hasRow ? at(m.wave_height, mi) : null,
      wavePeriod: hasRow ? at(m.wave_period, mi) : null,
      waveDirection: hasRow ? at(m.wave_direction, mi) : null,
      swellHeight: hasRow ? at(m.swell_wave_height, mi) : null,
      swellPeriod: hasRow ? at(m.swell_wave_period, mi) : null,
      swellDirection: hasRow ? at(m.swell_wave_direction, mi) : null,
      secondarySwellHeight: hasRow ? at(m.secondary_swell_wave_height, mi) : null,
      windWaveHeight: hasRow ? at(m.wind_wave_height, mi) : null,
      windWavePeriod: hasRow ? at(m.wind_wave_period, mi) : null,
      windWaveDirection: hasRow ? at(m.wind_wave_direction, mi) : null,
      currentVelocity: hasRow ? at(m.ocean_current_velocity, mi) : null,
      currentDirection: hasRow ? at(m.ocean_current_direction, mi) : null,
      seaSurfaceTemperature: hasRow ? at(m.sea_surface_temperature, mi) : null,
      // Attached by time string, not by position: the multi-model request can
      // resolve to a different grid cell, and nothing guarantees it returns
      // the same row count. null rather than {}, so "no model data" is one
      // check for every consumer.
      agreement: agreement[t] ?? null,
    };
```

`hasRow`, `m` and `mi` are the existing locals from the marine time-string lookup — keep whatever names the file already uses.

- [ ] **Step 5: Rewrite `fetchConditions`**

Replace the whole function with:

```js
export async function fetchConditions(lat, lon, fetchImpl = globalThis.fetch) {
  // All four in parallel. Only the first is required: a marine outage or an
  // inland point degrades to no tide and no swell, and a failed model request
  // degrades to no agreement marks, which is the honest rendering of "we do
  // not know" rather than a claim that the models agree.
  const [forecast, marine, modelForecast, modelMarine] = await Promise.allSettled([
    getJson(forecastUrl(lat, lon), fetchImpl),
    getJson(marineUrl(lat, lon), fetchImpl),
    getJson(modelForecastUrl(lat, lon), fetchImpl),
    getJson(modelMarineUrl(lat, lon), fetchImpl),
  ]);

  if (forecast.status !== 'fulfilled') throw forecast.reason;
  const value = (r) => (r.status === 'fulfilled' ? r.value : null);

  const agreement = agreementByTime([
    { json: value(modelForecast), params: CONFIG.models.forecastParams },
    { json: value(modelMarine), params: CONFIG.models.marineParams },
  ]);

  return normalise(forecast.value, value(marine), agreement);
}
```

If `getJson` does not already exist as a helper that throws on `!res.ok` with the status in the message, extract it from the current body of `fetchConditions` unchanged — the existing `/503/` rejection test depends on that message.

- [ ] **Step 6: Change the cache key**

Replace `cacheKey` in `js/cache.js`:

```js
export function cacheKey(lat, lon) {
  const p = CONFIG.cache.coordPrecision;
  // The model list is part of the key. Without it, editing CONFIG.models would
  // keep serving a payload built from the old list -- single-model data with
  // no agreement marks -- and nothing in the UI could tell you.
  const models = [...CONFIG.models.forecast, ...CONFIG.models.marine].join('+');
  return `${CONFIG.cache.keyPrefix}${lat.toFixed(p)},${lon.toFixed(p)}:${models}`;
}
```

- [ ] **Step 7: Run the tests and make sure they pass**

Run: `npm test`
Expected: PASS. If any test asserted an exact cache key string, change it to compare against `cacheKey()` rather than a literal.

- [ ] **Step 8: Verify against the live API**

```bash
node -e "import('./js/api.js').then(async (m) => {
  const r = await m.fetchConditions(-29.85, 31.05);
  const h = r.hours.find((x) => x.agreement);
  console.log('hours', r.hours.length, 'hasMarine', r.hasMarine);
  console.log('agreement keys', h ? Object.keys(h.agreement) : 'none');
  console.log(JSON.stringify(h?.agreement?.wind, null, 2));
})"
```
Expected: 168 hours, `hasMarine true`, agreement keys including `wind`, `gusts`, `pressure`, `rain`, and `swell` if the marine models cover Durban. A missing key means that model is not available there — expected behaviour, not a failure.

- [ ] **Step 9: Commit**

```bash
git add js/api.js js/cache.js test/api.test.mjs test/cache.test.mjs
git commit -m "feat: request the extra parameters and multi-model agreement"
```

---

### Task 5: `daily.js` — slot aggregates for every table row

**Files:**
- Modify: `js/daily.js` (`toSlots`, and a new `mergeAgreement` helper above it)
- Test: `test/daily.test.mjs`

**Interfaces:**
- Consumes: hour records from Task 4.
- Produces: each slot from `toSlots` additionally carries `bite, comfort, seaTemperature, humidity, dewPoint, apparentTemperature, visibility, cape, freezingLevel, cloudLow, cloudMid, cloudHigh, uvIndex, swellDirection, secondarySwellHeight, waveHeight, wavePeriod, waveDirection, windWaveHeight, windWavePeriod, windWaveDirection, currentVelocity, currentDirection`, and `agreement: Record<rowKey, {agree, readings}>|null`. `summariseDays` is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `test/daily.test.mjs`. Reuse the file's existing `base` and `HOUR` constants; if it does not define `HOUR`, add `const HOUR = 3600000;`.

```js
const scored = (overrides = {}) => ({
  time: new Date(base),
  final: 40, bite: 50, comfort: 0.8,
  windSpeed: 10, windGusts: 20, windDirection: 90,
  seaLevel: 1, swellHeight: 1, swellPeriod: 8, precipitation: 0,
  temperature: 20, cloudCover: 50, pressure: 1015,
  seaSurfaceTemperature: 22, uvIndex: 3, humidity: 70,
  agreement: null,
  ...overrides,
});

test('bite and comfort come from the hour the slot score belongs to', () => {
  // score is the best hour in the block. If bite were the max and comfort the
  // mean, bite x comfort would not equal the score printed above them and the
  // table would look broken.
  const [slot] = toSlots([
    scored({ time: new Date(base), final: 20, bite: 90, comfort: 0.2 }),
    scored({ time: new Date(base + HOUR), final: 64, bite: 80, comfort: 0.8 }),
    scored({ time: new Date(base + 2 * HOUR), final: 30, bite: 60, comfort: 0.5 }),
  ]);

  assert.equal(slot.score, 64);
  assert.equal(slot.bite, 80);
  assert.equal(slot.comfort, 0.8);
});

test('sea temperature is averaged and UV is the peak in the block', () => {
  const [slot] = toSlots([
    scored({ time: new Date(base), seaSurfaceTemperature: 22, uvIndex: 1 }),
    scored({ time: new Date(base + HOUR), seaSurfaceTemperature: 24, uvIndex: 7 }),
  ]);
  assert.equal(slot.seaTemperature, 23);
  assert.equal(slot.uvIndex, 7, 'a UV index of 7 for one hour is what burns you');
});

test('a slot is disputed if any hour in it is disputed', () => {
  const [slot] = toSlots([
    scored({ time: new Date(base), agreement: { wind: { agree: true, readings: [] } } }),
    scored({ time: new Date(base + HOUR), agreement: { wind: { agree: false, readings: [] } } }),
  ]);
  assert.equal(slot.agreement.wind.agree, false);
});

test('a slot where only one model answered stays null, not agreed', () => {
  const one = { readings: [{ model: 'gfs', value: 12 }], agree: null };
  const [slot] = toSlots([
    scored({ time: new Date(base), agreement: { wind: one } }),
    scored({ time: new Date(base + HOUR), agreement: { wind: one } }),
  ]);
  assert.equal(slot.agreement.wind.agree, null);
});

test('the readings shown are the ones behind the score', () => {
  const [slot] = toSlots([
    scored({ time: new Date(base), final: 10,
      agreement: { wind: { agree: true, readings: [{ model: 'gfs', value: 5 }] } } }),
    scored({ time: new Date(base + HOUR), final: 70,
      agreement: { wind: { agree: true, readings: [{ model: 'gfs', value: 50 }] } } }),
  ]);
  assert.equal(slot.agreement.wind.readings[0].value, 50);
});

test('no model data anywhere in the slot means no agreement object at all', () => {
  const [slot] = toSlots([scored()]);
  assert.equal(slot.agreement, null);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- --test-name-pattern "bite and comfort come from the hour"`
Expected: FAIL — `slot.bite` is `undefined`.

- [ ] **Step 3: Add the agreement merge helper**

Insert into `js/daily.js` immediately above `toSlots`:

```js
// A three-hour block counts as disputed if any hour in it is disputed: a blow
// arriving at 16:00 is a disputed afternoon. The readings kept are the ones
// from the hour the score came from, so the numbers in the slot detail are the
// numbers the score was built on.
function mergeAgreement(group, best) {
  const keys = new Set(group.flatMap((h) => Object.keys(h.agreement ?? {})));
  if (!keys.size) return null;

  const out = {};
  for (const key of keys) {
    const entries = group.map((h) => h.agreement?.[key]).filter(Boolean);
    let agree = null;
    if (entries.some((e) => e.agree === false)) agree = false;
    else if (entries.some((e) => e.agree === true)) agree = true;
    out[key] = { agree, readings: (best?.agreement?.[key] ?? entries[0]).readings };
  }
  return out;
}
```

- [ ] **Step 4: Extend the slot object**

In `toSlots`, replace the `.map(([, group]) => ({ ... }))` arrow with a block body:

```js
    .map(([, group]) => {
      // The block's score is its best hour, so bite and comfort come from that
      // same hour. Mixing aggregates would print three numbers that do not
      // multiply together.
      const best = group.reduce((a, b) => ((b.final ?? -Infinity) > (a.final ?? -Infinity) ? b : a));

      return {
        start: group[0].time,
        hours: group,
        score: maxOf(group.map((h) => h.final)) ?? 0,
        bite: mean([best.bite]),
        comfort: mean([best.comfort]),
        wind: mean(group.map((h) => h.windSpeed)),
        gust: maxOf(group.map((h) => h.windGusts)),
        windDirection: meanDirection(group.map((h) => h.windDirection)),
        tide: mean(group.map((h) => h.seaLevel)),
        swellHeight: mean(group.map((h) => h.swellHeight)),
        swellPeriod: mean(group.map((h) => h.swellPeriod)),
        swellDirection: meanDirection(group.map((h) => h.swellDirection)),
        secondarySwellHeight: mean(group.map((h) => h.secondarySwellHeight)),
        waveHeight: mean(group.map((h) => h.waveHeight)),
        wavePeriod: mean(group.map((h) => h.wavePeriod)),
        waveDirection: meanDirection(group.map((h) => h.waveDirection)),
        windWaveHeight: mean(group.map((h) => h.windWaveHeight)),
        windWavePeriod: mean(group.map((h) => h.windWavePeriod)),
        windWaveDirection: meanDirection(group.map((h) => h.windWaveDirection)),
        currentVelocity: mean(group.map((h) => h.currentVelocity)),
        currentDirection: meanDirection(group.map((h) => h.currentDirection)),
        seaTemperature: mean(group.map((h) => h.seaSurfaceTemperature)),
        temperature: mean(group.map((h) => h.temperature)),
        apparentTemperature: mean(group.map((h) => h.apparentTemperature)),
        dewPoint: mean(group.map((h) => h.dewPoint)),
        humidity: mean(group.map((h) => h.humidity)),
        visibility: mean(group.map((h) => h.visibility)),
        // The peak, not the average: a UV index of 9 for one hour is what
        // burns you, and the CAPE peak is what builds the thunderstorm.
        uvIndex: maxOf(group.map((h) => h.uvIndex)),
        cape: maxOf(group.map((h) => h.cape)),
        freezingLevel: mean(group.map((h) => h.freezingLevel)),
        rain: sum(group.map((h) => h.precipitation)),
        cloud: mean(group.map((h) => h.cloudCover)),
        cloudLow: mean(group.map((h) => h.cloudLow)),
        cloudMid: mean(group.map((h) => h.cloudMid)),
        cloudHigh: mean(group.map((h) => h.cloudHigh)),
        pressure: mean(group.map((h) => h.pressure)),
        agreement: mergeAgreement(group, best),
      };
    });
```

`mean([best.bite])` is the file's existing one-value-through-the-null-filter idiom: it yields the number when finite and `null` otherwise, so a missing `bite` never becomes `NaN` in the table.

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npm test`
Expected: PASS, including the existing `toSlots` tests — score, gust, rain and direction aggregates are unchanged.

- [ ] **Step 6: Commit**

```bash
git add js/daily.js test/daily.test.mjs
git commit -m "feat: slot aggregates for every forecast table row"
```

---

### Task 6: `table.js` — days and slots to a render-ready table model

**Files:**
- Create: `js/table.js`
- Create: `test/table.test.mjs`

**Interfaces:**

```js
// js/table.js
export function buildTable(days, now = new Date()): TableModel
```

```
TableModel {
  days: [ { key, date, label, columns: [ Column ] } ]
  rows: [ { key, label, kind, digits } ]        // CONFIG.tableRows, minus empty ones
}
Column {
  time,                       // Date, slot start
  slotIndex,                  // index into day.slots
  slot,                       // the raw daily.js slot (deviation 3)
  tideExtreme: 'H' | 'L' | null,
  cells: { [rowKey]: { value, band, agree } }
}
```

Pure: no DOM, no `toFixed`, no colour. `value` stays a number (or `null`);
formatting is `ui-table.js`'s job so the same model could be rendered as text.

**Decisions this task settles:**

1. **The tide ramp is not in `CONFIG.severity`.** `tableRows` names `ramp: 'tide'`
   but `severity` has `tideSteps`, not a `tide` bounds array — deliberately, since
   the spec normalises tide *within each day's own range*. `buildTable` therefore
   special-cases `ramp === 'tide'` and calls `tideBand(value, dayMin, dayMax)`,
   where the min and max are taken across that day's columns only. Every other
   tinted row goes through `band(ramp, value)`.
2. **Row dropping is by emptiness** (deviation 4). A row is kept if any column of
   any day has a finite value for it. `score`, `bite` and `comfort` are never
   dropped — a day with no score at all is a bug, not an inland spot.
3. **Score hatching propagates.** `cells.score.agree` is `false` if any key in
   `CONFIG.models.scoreInputs` is `false` for that slot; otherwise `true` if any
   is `true`; otherwise `null`. Same precedence as `mergeAgreement`, for the same
   reason: uncertainty in an input is uncertainty in the output.
4. **Tide extremes attach to the column that contains them.** A turning point at
   14:20 belongs to the 12:00–15:00 column. Matching is by
   `slot.start <= t.time < slot.start + slot.hours.length hours`, not by
   nearest-hour rounding, so a turn never lands in the neighbouring block. If two
   turns fall in one column, the first wins — a 3-hour block that holds both a
   high and a low cannot be labelled with one glyph, and the slot detail lists
   both anyway.

- [ ] **Step 1: Write the failing tests**

Create `test/table.test.mjs`. Build days with `summariseDays` from synthetic
scored hours rather than hand-rolling a day object, so the test breaks if
`daily.js` changes shape. Reuse the `HOUR` / `base` constants from
`test/daily.test.mjs`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTable } from '../js/table.js';
import { summariseDays } from '../js/daily.js';
import { CONFIG } from '../js/config.js';
```

Tests to write:

1. **Shape** — `buildTable(days)` returns `{ days, rows }`; `rows` is an array of
   `{ key, label, kind }`; every `rows[i].key` appears in `CONFIG.tableRows`.
2. **Day and column counts** — two days of 24 hours each gives `model.days.length
   === 2` and `model.days[0].columns.length === 24 / CONFIG.daily.slotHours` (8).
3. **Cell values track the slot** — `columns[0].cells.wind.value` equals
   `days[0].slots[0].wind`, and `columns[0].slotIndex === 0`.
4. **Tinted rows carry a band, plain rows do not** — `cells.wind.band` is an
   integer in `[0, bandCount('wind') - 1]`; `cells.air.band === null`.
5. **Tide is banded within the day** — a day whose sea level runs 0.2 m to 1.8 m
   puts the lowest column at band 0 and the highest at `tideSteps - 1`, and the
   *same absolute height* in a second day with a smaller range gets a different
   band. This is the whole reason tide is special-cased; assert it directly.
6. **Tide extreme placement** — a synthetic series with a high at 14:00 marks
   `columns[4].tideExtreme === 'H'` (12:00 block) and every other column `null`.
7. **Score hatching propagates** — a slot whose `agreement.wind.agree === false`
   yields `cells.score.agree === false`; a slot where every input is `true`
   yields `true`; a slot with `agreement: null` yields `null`.
8. **Empty marine rows are dropped** — days built from hours with no `seaLevel`,
   `swellHeight` or `seaSurfaceTemperature` produce a `rows` array containing no
   `tide`, `swell`, `period` or `sea` key, while still containing `wind`.
9. **`score`, `bite` and `comfort` survive an all-null day** — dropping them
   would leave a table with no score row, which is never what you want.

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/table.js'`.

- [ ] **Step 2: Implement `js/table.js`**

```js
import { CONFIG } from './config.js';
import { band, tideBand } from './severity.js';
import { dayLabel } from './format.js';
```

Sketch:

```js
const ALWAYS_KEEP = new Set(['score', 'bite', 'comfort']);

// Uncertainty in an input is uncertainty in the output: one disputed
// contributor hatches the score. Same precedence as daily.js mergeAgreement --
// false beats true beats null -- so "we do not know" never reads as agreement.
function scoreAgreement(agreement) {
  if (!agreement) return null;
  const states = CONFIG.models.scoreInputs
    .map((k) => agreement[k]?.agree)
    .filter((v) => v !== undefined);
  if (states.includes(false)) return false;
  if (states.includes(true)) return true;
  return null;
}

function extremeFor(day, slot) {
  const start = slot.start.getTime();
  const end = start + slot.hours.length * 3600000;
  const hit = day.tides.find((t) => t.time.getTime() >= start && t.time.getTime() < end);
  return hit ? (hit.type === 'high' ? 'H' : 'L') : null;
}
```

`buildTable` then, per day: compute the day's finite tide min/max once, map
`day.slots` to columns, and per column map `CONFIG.tableRows` to cells —
`value = slot[row.slot] ?? null`, `band` per the rules above, `agree` =
`row.key === 'score' ? scoreAgreement(slot.agreement) : slot.agreement?.[row.key]?.agree ?? null`.

Finally filter `CONFIG.tableRows` down to the rows that survive:

```js
  const kept = CONFIG.tableRows.filter((row) => ALWAYS_KEEP.has(row.key)
    || model.some((d) => d.columns.some((c) => Number.isFinite(c.cells[row.key].value))));
```

Cells are built for every configured row and only the *row list* is filtered, so
`ui-table.js` can index `cells[row.key]` for any row in `rows` without a guard.

- [ ] **Step 3: Run the tests and make sure they pass**

Run: `npm test`
Expected: PASS, all previous tests included.

- [ ] **Step 4: Commit**

```bash
git add js/table.js test/table.test.mjs
git commit -m "feat: table model - days, columns, banded and agreement-marked cells"
```

---

### Task 7: `ui-table.js` — render the forecast table

**Files:**
- Create: `js/ui-table.js`
- Modify: `app.css` (add the table styles; band-card CSS is removed in Task 9)

**Interfaces:**

```js
// js/ui-table.js
export function renderTable(target, model, now = new Date(), {
  openKey = null, openSlot = null, onSlot = () => {},
} = {}): void
```

Same callback contract as `renderDays` so `main.js`'s existing `onSlot(dayKey,
index)` handler and `state.openDay` / `state.openSlot` need no change.

No unit test: this is DOM, and the project's convention is that render modules
are verified in a browser. The pure part is already covered by Task 6.

**Geometry, from the spec:** label column 68 px frozen, 8 × 34 px columns,
19 px rows, one `scroll-snap-align: start` per day, whole column is the tap
target.

- [ ] **Step 1: Markup**

One `<table>` per day inside a horizontally scrolling flex strip, rather than a
single table spanning the week. A single table cannot scroll-snap per day, and
seven small tables also let a day be re-rendered without touching the rest.

```
<div class="ftable-scroll">            // overflow-x: auto; scroll-snap-type: x mandatory
  <div class="ftable-labels">          // position: sticky; left: 0 - row labels, drawn once
    <div class="ftable-corner"></div>  // spacer aligned with the day header
    <div class="ftable-rowlabel">wind</div> ...
  </div>
  <table class="ftable-day" data-day-key="2026-08-28">   // scroll-snap-align: start
    <caption>Fri 28</caption>
    <tbody>
      <tr data-row="wind">
        <td class="cell ramp-wind" data-band="3">18</td> ...
```

The label column is a sibling of the day tables, not a first `<th>` in each —
one sticky element, and the seven tables stay pure grids of equal-width cells.
Row order and heights are identical on both sides because both are driven by
`model.rows`.

Accessibility: each day table gets `aria-label` "Forecast for Friday 28 August";
each cell gets a `title` of `"<row label> <value> <unit>"` so a long-press or a
desktop hover reads it; the hatch gets `aria-label` "models disagree" via a
visually-hidden span, not colour alone.

- [ ] **Step 2: Cell rendering by kind**

```js
const KIND = {
  score:  (cell) => Math.round(cell.value),
  plain:  (cell, row) => cell.value.toFixed(row.digits ?? 0),
  tinted: (cell, row) => cell.value.toFixed(row.digits ?? 0),
  arrow:  (cell) => arrowSvg(cell.value),
};
```

- `null` value renders an empty cell, never a dash and never `NaN`. At 34 px wide
  a dash is noise; a blank column reads as "no data" on sight.
- `rain` renders blank when `< 0.05`, per the spec's "blank rather than 0.0 when
  dry". Config-free: it is a formatting rule, not a threshold.
- `arrow` is an inline `<svg>` rotated to `direction + 180deg` — it points where
  the wind is *going*, matching Windguru. Rotation is set via
  `style.transform`, not a class, since it is continuous.
- Tinted cells get `class="cell ramp-<ramp>"` and `data-band="<n>"`. Colour is
  entirely in CSS: `.ramp-wind[data-band="5"] { background: ... }`. This keeps
  every colour in one file, and a ramp can be retuned without touching JS.
- `score` cells get `data-band` from `scoreBandIndex` (0 good / 1 moderate /
  2 poor) and reuse the existing `--excellent` / `--fair` / `--poor` variables,
  so the table and the day cards cannot disagree about what 56 means.
- `cell.agree === false` adds `class="disputed"`, a `repeating-linear-gradient`
  overlay at `--hatch-opacity` (a CSS variable so it can be tuned outdoors
  without a code change, per the spec's risk table). `agree === null` adds
  nothing — silence must not read as agreement, and must not read as dispute
  either.

- [ ] **Step 3: Interaction**

Clicking anywhere in a column opens that slot. The listener is delegated on the
day table, resolving `event.target.closest('td')?.cellIndex` to a `slotIndex` —
13 rows × 8 columns × 7 days is 728 cells and binding each is waste.

```js
  table.addEventListener('click', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    const i = td.cellIndex;
    onSlot(dayKey, dayKey === openKey && i === openSlot ? null : i);
  });
```

Keyboard: the day table is `tabindex="0"` with left/right arrows moving the
selected column and Enter opening it, so the view is not mouse-only.

The open column gets `class="col-open"` on every cell in it, drawn as a 2 px
outline spanning the column — the whole column is the tap target, so the whole
column is what highlights.

`ui-slot.js` renders the detail panel; `renderTable` appends it directly below
the day table it belongs to.

- [ ] **Step 4: Scroll behaviour**

- `scroll-snap-type: x mandatory` on the strip, `scroll-snap-align: start` on
  each day table, so a swipe advances exactly one day.
- On first render with no `openKey`, scroll today's table into view with
  `scrollIntoView({ inline: 'start', behavior: 'auto' })` — instant, not smooth,
  because an animated scroll on page load reads as a glitch.
- **Preserve scroll position across re-renders.** `renderTable` runs again on
  every slot tap; reading `scrollLeft` before `replaceChildren` and restoring it
  after is the difference between tapping a column and being thrown back to
  Monday. This is the one bug most likely to survive to the browser check —
  write it in the first version, not as a fix.
- The day header row uses `position: sticky; top: 0` so the date stays visible
  while scrolling vertically.

- [ ] **Step 5: CSS**

Add to `app.css`, above the band-card block that Task 9 deletes:

```css
.ftable-scroll { display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
                 -webkit-overflow-scrolling: touch; }
.ftable-labels { position: sticky; left: 0; z-index: 2; flex: 0 0 68px;
                 background: var(--panel); }
.ftable-day    { flex: 0 0 auto; scroll-snap-align: start; border-collapse: collapse; }
.ftable-day td { width: 34px; height: 19px; text-align: center; font-size: 11px;
                 font-variant-numeric: tabular-nums; }
.ftable-rowlabel { height: 19px; font-size: 11px; color: var(--muted); }
.disputed { background-image: repeating-linear-gradient(45deg,
              rgba(255,255,255,var(--hatch-opacity)) 0 2px, transparent 2px 4px); }
```

Seven-step ramps as `[data-band]` rules per ramp, four steps of blue for
`.ramp-tide`, three score colours from the existing variables. `--hatch-opacity`
goes in `:root` beside the other tokens.

`font-variant-numeric: tabular-nums` matters: at 34 px, proportional digits make
a column of numbers visibly ragged.

- [ ] **Step 6: Browser check**

Serve with `npm run serve` and open at 356 px width (device toolbar) and on
desktop. Verify:
- label + one full day = 340 px, no horizontal scrolling *inside* a day
- swiping advances one day at a time
- tapping a column opens the detail; tapping it again closes it
- scroll position survives a tap
- hatched cells are legible; numbers are readable at 11 px

- [ ] **Step 7: Commit**

```bash
git add js/ui-table.js app.css
git commit -m "feat: render the 3-hourly forecast table"
```

---

### Task 8: `ui-slot.js` — the extended slot detail panel

**Files:**
- Create: `js/ui-slot.js`
- Modify: `app.css` (extend the existing `.slot-detail` rules)

**Interfaces:**

```js
// js/ui-slot.js
export function renderSlotDetail(day, slotIndex): HTMLElement
```

Returns a detached element; the caller appends it. Lifted from
`ui-days.js`'s private `slotDetail`, which is deleted with that file in Task 9.

- [ ] **Step 1: Move the existing panel across**

Copy `slotDetail`, its `el` / `n0` / `n1` helpers and `DETAIL_ROWS` from
`ui-days.js` into `js/ui-slot.js` unchanged, and export it as
`renderSlotDetail`. Keep the existing behaviour exactly: header with time range
and score, `<dl>` of rows, `null`-valued rows skipped, and the `Why:` line from
`slot.hours.flatMap(h => h.reasons)`.

Moving first and extending second keeps the diff readable and means a regression
in the panel is attributable to the extension, not the move.

- [ ] **Step 2: Add the readings that are not in the table**

Extend `DETAIL_ROWS` with everything Task 5 added to the slot that the table
does not show — this is what makes "more parameters" and "a scannable table"
compatible:

| Group | Rows |
|---|---|
| Air | apparent temperature, dew point, humidity, visibility, UV index, CAPE, freezing level |
| Cloud | low / mid / high split |
| Sea | wind wave (height, period, direction), secondary swell height, wave height/period/direction, current velocity and direction |

Rules that must hold:
- Every row keeps the existing `get(s) => string | null` contract, and `null`
  still means "omit the row". Inland spots must not grow a block of dashes.
- Group the rows under small headings rather than one 25-row list — a flat list
  of that length is unreadable on a phone.
- Directions use `compass()`; keep the units in the value string as the existing
  rows do (`"18 km/h NE"`), not in a separate column.
- CAPE and UV are the *peak* for the block (Task 5 aggregates them with `maxOf`);
  label them so, e.g. "UV (peak)". The other rows are means and need no
  qualifier.

- [ ] **Step 3: Add the per-model spread**

The hatch's only job is to say the column is worth tapping; this is what it is
worth tapping *for*.

For each key in `slot.agreement` with `agree === false`, print the readings:

```
Models disagree
  wind   GFS 18 - ICON 24 - ECMWF 31 km/h
  swell  GWAM 1.2 - ECMWF-WAM 2.1 m
```

- Model ids come from the `readings` map that `models.js` builds
  (`{ gfs_seamless: 18, ... }`). Render them upper-cased with `_seamless` and
  `_ifs025` stripped, in `CONFIG.models.forecast` order so the same model is
  always in the same position.
- Where `agree === null`, print "Only one model available for these values" and
  name it. Silence must not read as agreement — the spec is explicit, and the
  panel is the only place it can be said in words.
- Where `slot.agreement` is `null` entirely (the model requests failed, or the
  payload came from a pre-Task-4 cache), print "Model comparison unavailable".
  A missing section would be indistinguishable from full agreement.

- [ ] **Step 4: Browser check**

At 356 px: open a slot from the table. Verify the panel scrolls rather than
overflowing, that an inland spot shows no marine rows and no empty headings,
and that a hatched column's detail actually names the disagreeing models.

- [ ] **Step 5: Commit**

```bash
git add js/ui-slot.js app.css
git commit -m "feat: extended slot detail with per-model spread"
```

---

### Task 9: Wire it up and retire the band cards

**Files:**
- Modify: `js/main.js`, `index.html`, `app.css`, `sw.js`
- Delete: `js/bands.js`, `js/ui-days.js`, `test/bands.test.mjs`

Done last so that every earlier task leaves the app in a working state: up to
here the table exists but nothing renders it, and the day cards still work.

- [ ] **Step 1: Confirm `bands.js` has no other caller**

```bash
grep -rn "bands\.js\|ui-days\.js\|buildBand\|extremaMarkers\|renderDays" js test index.html
```

Expected: only `js/ui-days.js`, `js/main.js`, `test/bands.test.mjs` and the
files being deleted. **If `ui-spots-tab.js` or `ui-compare.js` appears, stop** —
the Spots tab is explicitly out of scope and must not lose a dependency.

- [ ] **Step 2: Swap the render call in `main.js`**

```js
import { buildTable } from './table.js';
import { renderTable } from './ui-table.js';
```

In `paintDetail`, replace the `renderDays(...)` call with:

```js
  renderTable(
    els.days,
    buildTable(summariseDays(view.hours, view.spot.lat, view.spot.lon, view.offset), now),
    now,
    { openKey: state.openDay, openSlot: state.openSlot, onSlot(dayKey, index) { ... } },
  );
```

The `onSlot` body, `state.openDay` / `state.openSlot` and every other site that
resets them (the compare-cell handler, the spot switch, the refresh) are
unchanged — that is why Task 7 kept the callback signature.

- [ ] **Step 3: `index.html`**

The `#days` container and its `7 days` tab stay. Update the `<h2>` from
"Next 7 days" to match the table, and check the tide notice at the bottom is
still present and unedited — it is a Global Constraint.

- [ ] **Step 4: Delete the retired modules**

```bash
git rm js/bands.js js/ui-days.js test/bands.test.mjs
```

Then remove the now-dead CSS from `app.css`: `.band`, `.band-label`, `.bars`,
`.bar`, `.bar-high`, `.bar-low`, `.band-range`, `.slots`, `.slot`, `.slot-open`,
`.day-head`, `.digest`, `.tide-line`, `.sky-line`.

**Keep** `.band-excellent` / `.band-good` / `.band-fair` / `.band-poor` and
`.slot-detail` / `.slot-head` / `.slot-rows` / `.slot-why`: the score-band
classes are used by `ui.js` and `ui-compare.js` for the now-card and the preview
badge, and the slot-detail classes are used by `ui-slot.js`. Grep before
deleting each one:

```bash
grep -rn "band-excellent\|slot-detail\|digest\|tide-line" js index.html
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS. The count drops by the `bands.test.mjs` cases and rises by
`table.test.mjs`. `test/smoke.test.mjs` imports every module — if it names
`ui-days.js`, update it in this step.

- [ ] **Step 6: Bump the service worker cache name**

`sw.js` is network-first, but its precache list names the files. Add
`js/table.js`, `js/ui-table.js`, `js/ui-slot.js`, `js/severity.js`,
`js/models.js`, drop `js/bands.js` and `js/ui-days.js`, and bump the cache name
(`fishing-conditions-v3` to `-v4`) so an old shell cannot serve a deleted
module.

- [ ] **Step 7: Full browser check**

`npm run serve`, then at 356 px and on desktop:
- a coastal spot shows all 13 rows; an inland spot shows the table with tide,
  swell, period and sea dropped and no empty rows
- the Spots tab is visually and behaviourally unchanged
- switching spots, refreshing and tapping a compare cell all still land on the
  right day with the right column open
- hard-reload with the service worker active picks up the new modules

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: replace the 7-day band cards with the forecast table"
```

---

## Done when

- `npm test` passes with `test/table.test.mjs` present and `test/bands.test.mjs`
  gone.
- The `7 days` tab renders the 3-hourly table for a coastal spot and a degraded
  table for an inland one.
- Hatched cells appear where models disagree, and tapping one names the models.
- No file in `js/` references `bands.js` or `ui-days.js`.
- The Spots tab is byte-identical in behaviour.
