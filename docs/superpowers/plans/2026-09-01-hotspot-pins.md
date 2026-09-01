# Hotspot Pins and Spot-Attached Intel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry hand-supplied coordinates through the matcher, pin hotspots on the Leaflet map distinctly from saved spots, and attach video intel to saved spot cards by distance.

**Architecture:** No new build-side modules. Marks gain optional `lat`/`lon` in `data/gazetteer.json`; `findMarks` copies them onto every stamped mark, so — because 3b re-derives matching on every merge — adding a coordinate takes effect across the whole stored window at the next build with no refetch. One new pure browser module, `js/spot-intel.js`, joins saved spots to hotspots by haversine distance. `js/map.js` gains a `setHotspots` method beside its existing `setMarkers`.

**Tech Stack:** Vanilla ES modules, no build step, **zero dependencies**. Leaflet is already loaded as a global by `index.html`. `node --test` for tests.

**Spec:** `docs/superpowers/specs/2026-09-01-hotspot-pins-design.md`

## Global Constraints

- **Zero runtime and dev dependencies.** Haversine is eight lines of arithmetic; do not add a geo library.
- **Coordinates are hand-supplied only.** Never geocode a mark at build time or in the browser. Measured 2026-09-01: Nominatim resolved only 3 of 56 marks to a real shore feature, and put La Mercy at King Shaka Airport and The Bluff at a hang-gliding site.
- **A mark without coordinates still ranks.** It appears in the Hotspots list with its videos and species, and simply does not pin. Ranking must never depend on having a coordinate.
- **A coordinate outside `KZN_BOX` is treated as absent** and logged at build time. `const KZN_BOX = { minLat: -31.2, maxLat: -28.8, minLon: 30.0, maxLon: 32.9 };` A pin in the wrong hemisphere is worse than no pin.
- **Hotspot pins must read as a different kind of thing from saved spots.** A saved spot is a place the user tracks; a hotspot is a place videos mentioned. Never render them identically.
- **The intel line never displaces** the tide, wind or window lines on a spot card. It is additive, and omitted entirely when there is no intel.
- **Source modules stay pure.** `tools/feeds/*.mjs` never import `node:fs` and never call `fetch`.
- **Browser-side failures are silent.** No banner, no `console.log`, no `console.error`.
- **Every external link keeps `target="_blank"` and `rel="noopener noreferrer"`.**
- **Ships correctly with zero coordinates filled in.** No pins, no intel lines, Hotspots list and map exactly as today. This must look deliberate, not broken.
- **`npm test` must pass at the end of every task.** Run: `npm test`

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/feeds/places.mjs` | **Modify.** Validate `lat`/`lon` against `KZN_BOX` in `loadGazetteer`; carry them onto each stamped mark in `findMarks`. |
| `tools/build-feeds.mjs` | **Modify.** Log marks that were stamped but carry no coordinate. |
| `js/config.js` | **Modify.** Add `maxDistanceKm` to the `hotspots` block. |
| `js/hotspots.js` | **Modify.** Expose `lat`/`lon` on each hotspot row. |
| `js/spot-intel.js` | **Create.** Pure. Haversine, and the nearest-hotspot join. |
| `js/map.js` | **Modify.** Add `setHotspots(rows, onPick)`. |
| `js/ui-hotspots.js` | **Modify.** Give each row a stable `id` so a pin tap can scroll to it. |
| `js/ui-spots-tab.js` | **Modify.** Render the intel line when present. |
| `js/main.js` | **Modify.** Wiring. |
| `app.css` | **Modify.** Hotspot pin label and intel line styles. |
| `test/places.test.mjs` | **Modify.** Coordinate validation and carry-through. |
| `test/hotspots.test.mjs` | **Modify.** Rows expose coordinates; rows without them still rank. |
| `test/spot-intel.test.mjs` | **Create.** Distance join. |
| `test/ui-spots-tab.test.mjs` | **Create.** The module has no tests today; scope to the intel line. |

`js/map.js` stays browser-verified rather than unit-tested — it is Leaflet-dependent DOM, the same line this project already draws.

**Note on writing these files:** this repo's Git Bash collapses `\\` inside quoted heredocs, which silently corrupted a regex in 3a. Write files containing regex escapes with the Write/Edit tools, and use `String.raw` where a regex comes from a template literal.

---

### Task 1: Coordinates through the matcher

**Files:**
- Modify: `tools/feeds/places.mjs`
- Modify: `tools/build-feeds.mjs`
- Test: `test/places.test.mjs`

**Interfaces:**
- Consumes: `loadGazetteer`, `findMarks` as they stand after 3b.
- Produces:
  - `KZN_BOX` exported from `places.mjs`.
  - A gazetteer mark may carry `lat: number|null, lon: number|null`. `loadGazetteer` normalises anything non-finite or out of box to `null`.
  - `findMarks` returns `{ name, region, where, lat, lon }` — `lat`/`lon` are `null` when the mark has none.
  - `marksWithoutCoords(gz, entries) -> { name, count }[]` for the build log.

- [ ] **Step 1: Write the failing tests**

Append to `test/places.test.mjs`, adding `KZN_BOX` and `marksWithoutCoords` to the existing import:

```javascript
import {
  loadGazetteer, cleanText, findMarks, findSpecies, findRegion,
  splitRegions, unmatchedPhrases, KZN_BOX, marksWithoutCoords,
} from '../tools/feeds/places.mjs';
```

Then append:

```javascript
const gzWith = (marks) => loadGazetteer({
  regions: { north: 'North Coast', central: 'Central Coast', south: 'South Coast' },
  regionTerms: ['Durban'],
  marks,
  species: [{ name: 'Shad', aliases: [] }],
});

test('the KZN box covers the coastal strip and nothing else', () => {
  assert.ok(KZN_BOX.minLat < KZN_BOX.maxLat);
  assert.ok(KZN_BOX.minLon < KZN_BOX.maxLon);
  // Durban, roughly -29.86, 31.02, must sit inside it.
  assert.ok(-29.86 > KZN_BOX.minLat && -29.86 < KZN_BOX.maxLat);
  assert.ok(31.02 > KZN_BOX.minLon && 31.02 < KZN_BOX.maxLon);
});

test('a valid coordinate is kept', () => {
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [], lat: -30.2064, lon: 30.7961 }]);

  assert.equal(gz.marks[0].lat, -30.2064);
  assert.equal(gz.marks[0].lon, 30.7961);
});

test('a mark with no coordinate loads with nulls', () => {
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [] }]);

  assert.equal(gz.marks[0].lat, null);
  assert.equal(gz.marks[0].lon, null);
});

test('a coordinate outside the KZN box is rejected as absent', () => {
  // Cape Town: a real place, entirely the wrong one.
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [], lat: -33.92, lon: 18.42 }]);

  assert.equal(gz.marks[0].lat, null);
  assert.equal(gz.marks[0].lon, null);
});

test('a transposed lat/lon pair is rejected', () => {
  // The classic slip: 30.79, -30.20 instead of -30.20, 30.79.
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [], lat: 30.7961, lon: -30.2064 }]);

  assert.equal(gz.marks[0].lat, null);
});

test('a half-supplied coordinate is rejected outright', () => {
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [], lat: -30.2064, lon: null }]);

  assert.equal(gz.marks[0].lat, null, 'a lone latitude cannot place a pin');
  assert.equal(gz.marks[0].lon, null);
});

test('a non-numeric coordinate is rejected', () => {
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [], lat: 'south a bit', lon: 30.79 }]);

  assert.equal(gz.marks[0].lat, null);
});

test('coordinates are carried onto the stamped mark', () => {
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [], lat: -30.2064, lon: 30.7961 }]);

  const [mark] = findMarks(gz, { title: 'Shad at Umkomaas', body: '' });

  assert.equal(mark.lat, -30.2064);
  assert.equal(mark.lon, 30.7961);
  assert.equal(mark.name, 'Umkomaas');
  assert.equal(mark.where, 'title');
});

test('a stamped mark with no coordinate carries nulls, not undefined', () => {
  const gz = gzWith([{ name: 'Umkomaas', region: 'south', aliases: [] }]);

  const [mark] = findMarks(gz, { title: 'Shad at Umkomaas', body: '' });

  assert.equal(mark.lat, null);
  assert.equal(mark.lon, null);
});

test('marks that appeared without a coordinate are reported for the build log', () => {
  const gz = gzWith([
    { name: 'Umkomaas', region: 'south', aliases: [], lat: -30.2064, lon: 30.7961 },
    { name: 'Scottburgh', region: 'south', aliases: [] },
  ]);
  const entries = [
    { marks: [{ name: 'Umkomaas', lat: -30.2064, lon: 30.7961 }] },
    { marks: [{ name: 'Scottburgh', lat: null, lon: null }] },
    { marks: [{ name: 'Scottburgh', lat: null, lon: null }] },
    { marks: [] },
    { title: 'no marks field' },
  ];

  const missing = marksWithoutCoords(gz, entries);

  assert.deepEqual(missing, [{ name: 'Scottburgh', count: 2 }]);
});

test('the shipped gazetteer has coordinates only inside the box', () => {
  for (const m of GZ.marks) {
    if (m.lat === null) continue;
    assert.ok(m.lat > KZN_BOX.minLat && m.lat < KZN_BOX.maxLat, `${m.name} lat out of box`);
    assert.ok(m.lon > KZN_BOX.minLon && m.lon < KZN_BOX.maxLon, `${m.name} lon out of box`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'KZN_BOX'`.

- [ ] **Step 3: Validate and carry the coordinates**

In `tools/feeds/places.mjs`, add the box and a validator above `loadGazetteer`:

```javascript
// The KZN coastal strip. Coordinates are hand-supplied, so this is a sanity
// check on typing, not a geocoder: a transposed pair or a dropped minus sign
// lands far outside it and is caught here rather than rendering a pin in the
// wrong hemisphere.
//
// Geocoding was measured and rejected on 2026-09-01: of 56 marks, Nominatim
// resolved 3 to a real shore feature, 37 to inland town centroids, 9 to the
// wrong feature entirely (La Mercy -> King Shaka Airport, The Bluff -> a
// hang-gliding site) and 7 not at all -- the 7 being the named fishing marks
// rather than the towns.
export const KZN_BOX = { minLat: -31.2, maxLat: -28.8, minLon: 30.0, maxLon: 32.9 };

// Both halves or neither: a lone latitude cannot place a pin.
function coordsOf(mark) {
  const lat = Number(mark.lat);
  const lon = Number(mark.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };
  const inBox = lat >= KZN_BOX.minLat && lat <= KZN_BOX.maxLat
    && lon >= KZN_BOX.minLon && lon <= KZN_BOX.maxLon;
  return inBox ? { lat, lon } : { lat: null, lon: null };
}
```

In `loadGazetteer`, extend the mark mapping:

```javascript
  ).map((m) => ({
    name: m.name,
    region: m.region,
    aliases: Array.isArray(m.aliases) ? m.aliases.filter((a) => typeof a === 'string') : [],
    ...coordsOf(m),
  }));
```

In `findMarks`, carry them onto both branches:

```javascript
    if (matchesAny(cleanTitle, mark)) {
      found.push({
        name: mark.name, region: mark.region, where: 'title',
        lat: mark.lat, lon: mark.lon,
      });
    } else if (matchesAny(cleanBody, mark)) {
      found.push({
        name: mark.name, region: mark.region, where: 'body',
        lat: mark.lat, lon: mark.lon,
      });
    }
```

And add the reporter at the end of the file:

```javascript
// Marks that earned a place in the data but cannot be pinned. The gazetteer
// grows by evidence: a mark gets a coordinate when it first shows up, not
// before, so this is the prompt to add one.
export function marksWithoutCoords(gz, entries) {
  if (!gz) return [];
  const counts = new Map();
  for (const entry of entries) {
    for (const mark of entry.marks ?? []) {
      if (mark.lat !== null && mark.lat !== undefined) continue;
      counts.set(mark.name, (counts.get(mark.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Log them in the build**

In `tools/build-feeds.mjs`, extend the import:

```javascript
import { loadGazetteer, unmatchedPhrases, marksWithoutCoords } from './feeds/places.mjs';
```

Add a reporter beside `reportUnmatched`:

```javascript
// Only the YouTube feed carries marks; the Kingfisher entries carry regions.
async function reportMissingCoords(gazetteer) {
  const entries = await readExisting(youtube.meta.out);
  const missing = marksWithoutCoords(gazetteer, entries);
  if (!missing.length) return;
  console.log('marks with evidence but no coordinate (add lat/lon in data/gazetteer.json):');
  for (const { name, count } of missing) {
    console.log(`  ${String(count).padStart(3)}  ${name}`);
  }
}
```

And call it from `main`, after the unmatched report:

```javascript
  if (gazetteer) {
    await reportUnmatched(gazetteer);
    await reportMissingCoords(gazetteer);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Rebuild and confirm the log names the seven**

Run: `npm run feeds`

Expected: a `marks with evidence but no coordinate` block naming Amanzimtoti, Warner Beach, Umkomaas, Chain Rocks, Isipingo, Winklespruit and South Pier — unless coordinates have been filled in by then, in which case the named marks are only those still missing.

Then confirm the stored entries carry the field:

```bash
node -e "
const y = JSON.parse(require('node:fs').readFileSync('data/feeds/youtube.json','utf8')).entries;
const marks = y.flatMap(e => e.marks || []);
console.log('stamped marks     :', marks.length);
console.log('with a coordinate :', marks.filter(m => m.lat !== null).length);
console.log('sample            :', JSON.stringify(marks[0]));
"
```

Every stamped mark must have `lat` and `lon` keys, even if `null`.

- [ ] **Step 7: Commit**

```bash
git add tools/feeds/places.mjs tools/build-feeds.mjs test/places.test.mjs data/feeds/
git commit -m "feat: carry hand-supplied mark coordinates through the matcher"
```

---

### Task 2: Expose coordinates and join spots by distance

**Files:**
- Modify: `js/config.js`
- Modify: `js/hotspots.js`
- Create: `js/spot-intel.js`
- Modify: `test/hotspots.test.mjs`
- Test: `test/spot-intel.test.mjs`

**Interfaces:**
- Consumes: stamped marks carrying `lat`/`lon` from Task 1.
- Produces:
  - A hotspot row gains `lat: number|null, lon: number|null`.
  - `distanceKm(a, b) -> number` where each argument is `{ lat, lon }`.
  - `attachIntel(spots, hotspots) -> Map<spotId, { name, count, species, distanceKm }>`.

- [ ] **Step 1: Add the config key**

In `js/config.js`, inside the existing `hotspots` block, after `minRecencyWeight`:

```javascript
    // Roughly the spacing of the named KZN beaches, so a saved spot matches
    // the beach it is on rather than its neighbour.
    maxDistanceKm: 5,
```

- [ ] **Step 2: Write the failing tests**

Append to `test/hotspots.test.mjs`:

```javascript
test('a hotspot row exposes the mark coordinates', () => {
  const entry = vid('a', 'Umkomaas');
  entry.marks[0].lat = -30.2064;
  entry.marks[0].lon = 30.7961;

  const rows = buildHotspots(feed([entry]), null, NOW);

  assert.equal(rows[0].lat, -30.2064);
  assert.equal(rows[0].lon, 30.7961);
});

test('a mark with no coordinates still ranks and carries nulls', () => {
  const rows = buildHotspots(feed([vid('a', 'Umkomaas')]), null, NOW);

  assert.equal(rows[0].name, 'Umkomaas');
  assert.equal(rows[0].count, 1);
  assert.equal(rows[0].lat, null);
  assert.equal(rows[0].lon, null);
});

test('a coordinate on any one mention is enough to place the row', () => {
  const withCoords = vid('a', 'Umkomaas');
  withCoords.marks[0].lat = -30.2064;
  withCoords.marks[0].lon = 30.7961;

  const rows = buildHotspots(feed([vid('b', 'Umkomaas', { age: 2 }), withCoords]), null, NOW);

  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].lat, -30.2064);
});
```

Create `test/spot-intel.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, attachIntel } from '../js/spot-intel.js';
import { CONFIG } from '../js/config.js';

// Real KZN positions, so the distance assertions mean something.
const UMKOMAAS = { lat: -30.2064, lon: 30.7961 };
const AMANZIMTOTI = { lat: -30.0497, lon: 30.8886 };

const spot = (id, name, at) => ({ id, name, lat: at.lat, lon: at.lon });
const hot = (name, at, over = {}) => ({
  name,
  region: 'south',
  count: 3,
  species: ['Garrick', 'Shad'],
  videos: [],
  report: null,
  lat: at ? at.lat : null,
  lon: at ? at.lon : null,
  ...over,
});

test('distance between two known KZN marks is about 19 km', () => {
  const d = distanceKm(UMKOMAAS, AMANZIMTOTI);

  assert.ok(d > 17 && d < 21, `expected ~19 km, got ${d}`);
});

test('distance from a point to itself is zero', () => {
  assert.equal(Math.round(distanceKm(UMKOMAAS, UMKOMAAS)), 0);
});

test('a spot on a hotspot picks up its intel', () => {
  const spots = [spot('s1', 'My Umkomaas mark', UMKOMAAS)];

  const intel = attachIntel(spots, [hot('Umkomaas', UMKOMAAS)]);

  assert.equal(intel.get('s1').name, 'Umkomaas');
  assert.equal(intel.get('s1').count, 3);
  assert.deepEqual(intel.get('s1').species, ['Garrick', 'Shad']);
});

test('a spot beyond the radius picks up nothing', () => {
  const spots = [spot('s1', 'Toti', AMANZIMTOTI)];

  // ~19 km apart, well beyond the 5 km radius.
  const intel = attachIntel(spots, [hot('Umkomaas', UMKOMAAS)]);

  assert.equal(intel.has('s1'), false);
});

test('the nearest hotspot wins when two are in range', () => {
  // 1 km and 3 km north of the spot respectively.
  const near = { lat: UMKOMAAS.lat + 0.009, lon: UMKOMAAS.lon };
  const far = { lat: UMKOMAAS.lat + 0.027, lon: UMKOMAAS.lon };
  const spots = [spot('s1', 'Mark', UMKOMAAS)];

  const intel = attachIntel(spots, [hot('Far', far), hot('Near', near)]);

  assert.equal(intel.get('s1').name, 'Near');
});

test('a hotspot with no coordinates never matches, however close the spot', () => {
  const spots = [spot('s1', 'Mark', UMKOMAAS)];

  const intel = attachIntel(spots, [hot('Umkomaas', null)]);

  assert.equal(intel.has('s1'), false);
});

test('the reported distance is the real one', () => {
  const near = { lat: UMKOMAAS.lat + 0.009, lon: UMKOMAAS.lon };
  const intel = attachIntel([spot('s1', 'Mark', UMKOMAAS)], [hot('Near', near)]);

  assert.ok(intel.get('s1').distanceKm < CONFIG.hotspots.maxDistanceKm);
  assert.ok(intel.get('s1').distanceKm > 0.5);
});

test('several spots each get their own nearest hotspot', () => {
  const spots = [
    spot('s1', 'A', UMKOMAAS),
    spot('s2', 'B', AMANZIMTOTI),
  ];

  const intel = attachIntel(spots, [hot('Umkomaas', UMKOMAAS), hot('Amanzimtoti', AMANZIMTOTI)]);

  assert.equal(intel.get('s1').name, 'Umkomaas');
  assert.equal(intel.get('s2').name, 'Amanzimtoti');
});

test('empty or malformed inputs yield an empty map rather than an error', () => {
  assert.equal(attachIntel([], []).size, 0);
  assert.equal(attachIntel(null, null).size, 0);
  assert.equal(attachIntel([spot('s1', 'A', UMKOMAAS)], []).size, 0);
  assert.equal(attachIntel([{ id: 's1' }], [hot('Umkomaas', UMKOMAAS)]).size, 0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module ... js/spot-intel.js`.

- [ ] **Step 4: Expose the coordinates on the row**

In `js/hotspots.js`, the accumulator must keep the first real coordinate it
sees for a mark. Replace the row creation:

```javascript
      let row = byMark.get(mark.name);
      if (!row) {
        row = {
          name: mark.name,
          region: mark.region ?? null,
          lat: null,
          lon: null,
          score: 0,
          species: new Set(),
          videos: [],
        };
        byMark.set(mark.name, row);
      }
      // Any one mention carrying a coordinate is enough to place the row: an
      // older entry stamped before the gazetteer had one would otherwise win
      // by arriving first.
      if (row.lat === null && Number.isFinite(mark.lat) && Number.isFinite(mark.lon)) {
        row.lat = mark.lat;
        row.lon = mark.lon;
      }
```

And add them to the returned object, beside `region`:

```javascript
        name: row.name,
        region: row.region,
        lat: row.lat,
        lon: row.lon,
        count: row.videos.length,
```

- [ ] **Step 5: Write the join**

Create `js/spot-intel.js`:

```javascript
// Joins saved spots to hotspots by distance. Pure: a function of two lists.
//
// By distance rather than by name, because saved spots are created by tapping
// the map or searching, so their names are whatever the geocoder returned --
// "Amanzimtoti Beach", "-30.052, 30.889" -- and would rarely match a curated
// mark name.
import { CONFIG } from './config.js';

const EARTH_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

const hasCoords = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = (Math.sin(dLat / 2) ** 2)
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLon / 2) ** 2));
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export function attachIntel(spots, hotspots) {
  const out = new Map();
  if (!Array.isArray(spots) || !Array.isArray(hotspots)) return out;

  // A hotspot with no coordinate cannot be placed, so it cannot be joined.
  // It still ranks in the list -- it just has nothing to attach to.
  const placed = hotspots.filter(hasCoords);
  if (!placed.length) return out;

  for (const spot of spots) {
    if (!hasCoords(spot)) continue;

    let best = null;
    for (const hotspot of placed) {
      const km = distanceKm(spot, hotspot);
      if (km > CONFIG.hotspots.maxDistanceKm) continue;
      if (!best || km < best.distanceKm) {
        best = { name: hotspot.name, count: hotspot.count, species: hotspot.species, distanceKm: km };
      }
    }
    if (best) out.set(spot.id, best);
  }

  return out;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/hotspots.js js/spot-intel.js test/hotspots.test.mjs test/spot-intel.test.mjs
git commit -m "feat: expose mark coordinates and join saved spots by distance"
```

---

### Task 3: Pin hotspots on the map

**Files:**
- Modify: `js/map.js`
- Modify: `js/ui-hotspots.js`
- Modify: `js/main.js`
- Modify: `app.css`

**Interfaces:**
- Consumes: hotspot rows carrying `lat`/`lon` from Task 2.
- Produces: `map.setHotspots(rows, onPick)` where `onPick(name)` fires on tap; `renderHotspots` gives each row `id = hotspotRowId(name)`.

- [ ] **Step 1: Give each hotspot row a stable id**

In `js/ui-hotspots.js`, add the helper above `renderHotspots`:

```javascript
// A pin tap scrolls to the row rather than opening a popup: the row already
// carries the videos, the species and the regional line, and duplicating that
// in a Leaflet popup would mean two places to maintain and two to get wrong.
export const hotspotRowId = (name) => `hotspot-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
```

And set it on each `<li>`, immediately after the row is created:

```javascript
    const item = el('li', 'hotspot-row');
    item.id = hotspotRowId(spot.name);
```

The DOM stub in `test/ui-hotspots.test.mjs` accepts arbitrary property
assignment, so the existing tests keep passing unchanged.

- [ ] **Step 2: Add the pin layer**

In `js/map.js`, create the layer group beside the existing `saved` one, inside
`initMap`:

```javascript
  const saved = L.layerGroup().addTo(map);
  const hotspots = L.layerGroup().addTo(map);
```

And add the method to the returned object, after `setMarkers`:

```javascript
    // Hotspots are a different kind of thing from saved spots: a saved spot is
    // a place you track, a hotspot is a place videos mentioned. They must not
    // read as the same marker. Rows without a coordinate are skipped -- the
    // Hotspots list still shows them, they just cannot be placed.
    setHotspots(rows, onPick) {
      hotspots.clearLayers();
      for (const row of rows) {
        if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
        const pin = L.circleMarker([row.lat, row.lon], {
          radius: 9,
          color: '#e8b83b',
          fillColor: '#e8b83b',
          fillOpacity: 0.85,
          weight: 2,
        });
        pin.bindTooltip(
          `${row.name} · ${row.count} video${row.count === 1 ? '' : 's'}`,
          { className: 'hotspot-tip' },
        );
        pin.on('click', (e) => {
          // Otherwise the map's own click handler fires too and drops a
          // preview pin underneath the hotspot.
          L.DomEvent.stopPropagation(e);
          onPick(row.name);
        });
        pin.addTo(hotspots);
      }
    },
```

- [ ] **Step 3: Wire it up**

In `js/main.js`, add the import beside the other hotspot imports:

```javascript
import { renderHotspots, hotspotRowId } from './ui-hotspots.js';
```

`paintFeed` currently builds the hotspot rows and throws them away after
rendering. Keep them, so the map and the spot cards can both use them:

```javascript
function paintFeed() {
  const now = new Date();
  renderFeedCard(els.feed, currentEntry(state.feed), now);
  // Both feeds load independently, so this runs correctly whichever arrives
  // first -- buildHotspots treats a missing feed as no evidence.
  state.hotspots = buildHotspots(state.videos, state.feed, now);
  renderHotspots(els.hotspots, state.hotspots, now);
  renderVideoList(els.videos, pickVideos(state.videos), now);

  map.setHotspots(state.hotspots, (name) => {
    tabs.select('spots');
    document.getElementById(hotspotRowId(name))?.scrollIntoView({
      behavior: 'smooth', block: 'center',
    });
  });
}
```

Add `hotspots: []` to `state`, after `videos: null,`:

```javascript
  hotspots: [],
```

**Ordering matters here:** `paintFeed` now references `map`, a `const` created
at `js/main.js:353` and therefore in the temporal dead zone until that line
runs. Verified safe: the only top-level call that reaches `paintFeed` is
`paintTabs()` at line 462, and the two feed `.then` callbacks are later still
and asynchronous besides. Do not add a top-level `paintFeed()`, `paintTabs()`
or `paintSpotCards()` call above line 353 — it would throw
`ReferenceError: Cannot access 'map' before initialization`.

- [ ] **Step 4: Style the pin label**

Append to `app.css`, after the `.hotspot-report` rule:

```css
/* The hotspot tooltip has to read against the OSM tiles, which are pale. */
.leaflet-tooltip.hotspot-tip {
  background: var(--panel);
  color: var(--ink);
  border: 1px solid var(--fair);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS — no test covers `map.js`, but the `ui-hotspots` tests must still pass with the added `id`.

- [ ] **Step 6: Check it in a browser**

Run: `npm run serve`

Open `http://localhost:8090` and confirm:

1. **With no coordinates filled in:** no hotspot pins at all, the map looks exactly as before, the Hotspots list is unchanged, and the console is clean. This is the expected shipping state until the seven are supplied.
2. **With at least one coordinate filled in:** a distinctly coloured pin appears at that mark, visually different from the blue saved-spot circles.
3. Hovering the pin shows `Umkomaas · 2 videos`.
4. Tapping the pin switches to the Spots tab and scrolls to that mark's row — and does **not** drop a preview pin underneath.
5. Saved spot circles still render and still open their spot.

- [ ] **Step 7: Commit**

```bash
git add js/map.js js/ui-hotspots.js js/main.js app.css
git commit -m "feat: pin hotspots on the map, distinct from saved spots"
```

---

### Task 4: Attach intel to the spot cards

**Files:**
- Modify: `js/ui-spots-tab.js`
- Modify: `js/main.js`
- Modify: `app.css`
- Test: `test/ui-spots-tab.test.mjs` (create)

**Interfaces:**
- Consumes: `attachIntel` from Task 2, `state.hotspots` from Task 3.
- Produces: `renderSpotsTab(target, cards, handlers)` where each card may carry `intel: { name, count, species, distanceKm } | null`.

- [ ] **Step 1: Write the failing tests**

Create `test/ui-spots-tab.test.mjs`. `js/ui-spots-tab.js` has no tests today;
this is scoped to what 3c changes rather than retrofitting whole-module
coverage.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The same zero-dependency DOM stub the other ui-* tests use. This module also
// attaches listeners and sets attributes, so the stub covers those too.
function makeElement(tag) {
  return {
    tagName: tag, className: '', textContent: undefined, type: undefined,
    title: undefined, hidden: false, children: [], attributes: {}, listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

globalThis.document = { createElement: makeElement };

const { renderSpotsTab } = await import('../js/ui-spots-tab.js');

const handlers = { onOpen() {}, onRemove() {}, onClearAll() {} };

const card = (over = {}) => ({
  spot: { id: 's1', name: 'Umkomaas', lat: -30.2064, lon: 30.7961 },
  summary: {
    score: 72,
    tide: { state: 'rising', height: 1.2, nextTurn: null },
    wind: { speed: 14, direction: 120 },
    nextWindow: null,
  },
  ...over,
});

const flatten = (node) => [node, ...node.children.flatMap(flatten)];
const textsOf = (node) => flatten(node).map((n) => n.textContent).filter(Boolean);

test('a card with no intel renders the lines it always did', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card()], handlers);

  const texts = textsOf(target);
  assert.ok(texts.includes('Umkomaas'), 'spot name missing');
  assert.ok(texts.some((t) => /rising/.test(t)), 'tide line missing');
  assert.ok(texts.some((t) => /km\/h/.test(t)), 'wind line missing');
  assert.equal(texts.some((t) => /recent video/.test(t)), false, 'unexpected intel line');
});

test('a card with intel gains one extra line', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card({
    intel: { name: 'Umkomaas', count: 3, species: ['Garrick', 'Shad'], distanceKm: 0.4 },
  })], handlers);

  const texts = textsOf(target);
  assert.ok(texts.some((t) => /3 recent videos/.test(t)), `intel line missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /Garrick/.test(t) && /Shad/.test(t)), 'species missing');
});

test('the intel line does not displace the existing lines', () => {
  const plain = makeElement('div');
  const withIntel = makeElement('div');

  renderSpotsTab(plain, [card()], handlers);
  renderSpotsTab(withIntel, [card({
    intel: { name: 'Umkomaas', count: 1, species: ['Shad'], distanceKm: 0.4 },
  })], handlers);

  // Exactly one more node, and every original text still present.
  assert.equal(flatten(withIntel).length, flatten(plain).length + 1);
  for (const t of textsOf(plain)) {
    assert.ok(textsOf(withIntel).includes(t), `lost line: ${t}`);
  }
});

test('a single video reads "1 recent video"', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card({
    intel: { name: 'Umkomaas', count: 1, species: ['Shad'], distanceKm: 0.4 },
  })], handlers);

  assert.ok(textsOf(target).some((t) => /\b1 recent video\b/.test(t)), 'expected singular');
});

test('intel with no species still renders the count', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card({
    intel: { name: 'Umkomaas', count: 2, species: [], distanceKm: 0.4 },
  })], handlers);

  assert.ok(textsOf(target).some((t) => /2 recent videos/.test(t)));
});

test('an empty card list still renders the empty state', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [], handlers);

  assert.ok(textsOf(target).some((t) => /No spots saved/.test(t)));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `a card with intel gains one extra line` finds no intel line.

- [ ] **Step 3: Render the line**

In `js/ui-spots-tab.js`, change the destructuring in the card loop and append
the line after the existing window line:

```javascript
  for (const { spot, summary, intel } of cards) {
```

```javascript
    open.appendChild(el('div', 'spot-line', summary.nextWindow
      ? `next ${timeRange(summary.nextWindow.start, summary.nextWindow.end)} · ${summary.nextWindow.score}`
      : 'no good window in the next 7 days'));

    // Additive only: this never replaces the tide, wind or window lines, which
    // are why the card exists. Omitted entirely when there is nothing to say.
    if (intel) {
      const bits = [`${intel.count} recent video${intel.count === 1 ? '' : 's'}`];
      if (intel.species.length) bits.push(intel.species.join(', '));
      open.appendChild(el('div', 'spot-line spot-intel', bits.join(' · ')));
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Wire it up**

In `js/main.js`, add the import:

```javascript
import { attachIntel } from './spot-intel.js';
```

In `paintSpotCards`, join the intel onto each card. `paintFeed()` runs first
in that function and refreshes `state.hotspots`, so the intel is current:

```javascript
function paintSpotCards() {
  paintFeed();
  const now = new Date();
  const intel = attachIntel(state.spots, state.hotspots);
  // paintTabs() can run before refreshSavedSpots() resolves, so a spot may not
  // be scored yet. Keep it in the list with a null-score summary rather than
  // hiding it (and tripping the "no spots saved" empty state on cold start).
  const cards = state.spots
    .map((s) => {
      const { hours = [] } = state.scored.get(s.id) ?? {};
      return {
        spot: s,
        summary: summariseSpot(hours, findWindows(hours), tideExtremes(hours), now),
        intel: intel.get(s.id) ?? null,
      };
    })
    // Best first: the whole point of the tab is "which one right now".
    .sort((a, b) => (b.summary.score ?? -1) - (a.summary.score ?? -1));
```

- [ ] **Step 6: Style the line**

Append to `app.css`:

```css
.spot-intel { color: var(--fair); }
```

- [ ] **Step 7: Check it in a browser**

Run: `npm run serve`

With at least one coordinate filled in, save a spot within 5 km of that mark
and confirm:

1. The card shows `3 recent videos · Garrick, Shad` below the window line.
2. A spot far from any mark shows no such line, and looks exactly as it did.
3. With no coordinates filled in at all, no card shows an intel line.

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/ui-spots-tab.js js/main.js app.css test/ui-spots-tab.test.mjs
git commit -m "feat: attach recent video intel to saved spot cards"
```

---

## Notes for the executor

**This plan is complete and correct with zero coordinates filled in.** Every
task can be built and tested before any real `lat`/`lon` exists — the tests
supply their own. What cannot be done without them is the *visual* half of
Task 3 Step 6 and Task 4 Step 7. If the gazetteer still holds `null` for all
seven marks, verify the no-coordinate state instead (no pins, no intel lines,
nothing broken) and say so plainly rather than reporting the pin check as
passed.

**Do not geocode anything.** If a mark lacks a coordinate, the build logs it
and the mark does not pin. That is the design, not a gap to fill. The measured
reason is in `KZN_BOX`'s comment and in the spec.

**The one failure worth stopping for** is a pin in the wrong place — a
transposed pair, a dropped minus sign, or a mark pinned to a town centre
rather than the shore. `KZN_BOX` catches the gross cases; the rest is the
browser check in Task 3 Step 6.
