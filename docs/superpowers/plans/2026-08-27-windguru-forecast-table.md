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
