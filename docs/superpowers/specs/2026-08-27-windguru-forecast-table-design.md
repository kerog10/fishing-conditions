# Windguru-grade forecast table — design

Date: 2026-08-27
Status: approved, ready for implementation planning

## Goal

Replace the 7-days band cards with a dense, colour-coded forecast table in the
manner of Windguru: parameters down, hours across, every cell tinted by
severity, wind as arrows, and a marker on cells where forecast models disagree.

This is one of three sub-projects. The other two — a scheduled feed builder
consuming the Kingfisher weekly report, and social hotspot monitoring — depend
on infrastructure this one does not need, and have their own specs. Nothing
here requires a backend, an API key or a hosting change.

## Decisions

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Table vs cards | Table **replaces** the band cards | Keeping both was offered and declined. One forecast view, one mental model. |
| Time granularity | **3-hour** columns, 8 per day | Hourly doubles resolution but only half a day fits a phone, so you scroll constantly. At 3-hour steps a full day fits with room spare and the sideways swipe becomes a day-to-day gesture. |
| Rows | **13 fixed rows**; the other new readings live in the slot detail | A row-picker UI is not built in v1. The row list is a config array, so changing it is a one-line edit. |
| Model disagreement | **Diagonal hatch** over affected cells | Corner dot is easy to miss; washing the cell out destroys the severity colour, which is the table's payload. Hatch is noisier but unmissable. |
| Models displayed | **One** (`best_match`), with agreement computed behind it | Per-model sub-rows and a model switcher were both rejected: 3 models × 13 rows × 8 columns is unreadable on a phone, and a switcher makes you compare from memory. |
| Slot detail | **Kept**, extended | Carried over from the band-card view. Too useful to lose and it costs nothing against a table. |

## Verified API facts

Confirmed against live Open-Meteo requests on 2026-08-27, not assumed:

1. Multi-model works in a **single request**. `&models=gfs_seamless,icon_seamless,ecmwf_ifs025`
   returns suffixed fields: `wind_speed_10m_gfs_seamless`, `wind_speed_10m_icon_seamless`,
   `wind_speed_10m_ecmwf_ifs025`. No extra round trips per model.
2. **Model availability is regional and failures are silent.** Requesting
   `models=best_match,ewam,gwam` from the marine API off Durban returned only
   `wave_height_marine_best_match` and `wave_height_gwam` — `ewam` (European
   waters) was dropped with no error. Code must therefore derive the set of
   available models from the response keys, never from a hard-coded list.
3. **The marine API prefixes `best_match` differently**: `wave_height_marine_best_match`,
   not `wave_height_best_match`. Key parsing must tolerate both shapes.
4. All ten new forecast parameters exist and return data: `relative_humidity_2m`,
   `dew_point_2m`, `apparent_temperature`, `visibility`, `cape`,
   `freezing_level_height`, `cloud_cover_low`, `cloud_cover_mid`,
   `cloud_cover_high`, `uv_index`.
5. All eight new marine parameters exist and return data: `wind_wave_height`,
   `wind_wave_period`, `wind_wave_direction`, `swell_wave_height`,
   `secondary_swell_wave_height`, `wave_direction`, `ocean_current_velocity`,
   `ocean_current_direction`.
6. **A model key can be present while its data is absent.** Requesting
   `swell_wave_height` with `models=best_match,gwam,ecmwf_wam025` returned
   `swell_wave_height_ecmwf_wam025` with unit `"undefined"`. Presence of a key
   is therefore not evidence of data: a model counts as available only if it
   has at least one finite value, mirroring the `hasMarine` check already in
   `api.js`.
7. A multi-model request may resolve to a **different grid cell** than the
   single-model one (−29.93 vs −29.91 for the same input coordinates), because
   models have different grids. Agreement data is therefore approximate to the
   spot, which is acceptable for a confidence signal but must not be presented
   as the spot's reading.

## Request strategy

Four requests, issued in parallel via `Promise.allSettled`. Only the first is
required; the app must render without any of the other three.

| # | Request | Purpose | On failure |
|---|---|---|---|
| 1 | Forecast, all atmospheric params, **no** `models=` | The displayed values (`best_match`) | Fatal — as today |
| 2 | Marine, all marine params, no `models=` | Displayed tide, swell, sea temp | Degrade to no-tide, no-swell — existing behaviour, unchanged |
| 3 | Forecast, **only** `wind_speed_10m,wind_gusts_10m,pressure_msl,precipitation`, with `models=gfs_seamless,icon_seamless,ecmwf_ifs025` | Agreement on the parameters the score turns on | Render with no hatching |
| 4 | Marine, **only** `swell_wave_height`, with `models=gwam,ecmwf_wam025` | Agreement on swell | Render with no hatching on swell |

Request 4 uses `swell_wave_height`, the same quantity the swell row displays —
not `wave_height`, which is a different measurement and would attach a
confidence claim to a value it was not computed from.

Requests 3 and 4 carry only the parameters that decide whether you go fishing.
Tripling all twenty parameters across three models would be payload for
nothing.

**Payload budget:** measure the total during implementation. Expectation is
well under 200 KB for 7 days; if it exceeds that, drop request 4 first, then
reduce request 3 to wind and gusts only. This is a measurement, not an
assertion.

## Modules

Follows the existing split: pure logic in testable modules, thin render layer
on top.

| Module | Responsibility | Depends on |
|---|---|---|
| `js/models.js` | Parse suffixed response keys, list models actually present, compute per-hour per-parameter spread and an `agree` boolean | `config.js` |
| `js/severity.js` | `(parameter, value) → band index`. Pure, table-driven from config | `config.js` |
| `js/table.js` | Build the table model: days → columns → rows, each cell `{value, band, agree, marker}`. No DOM, no formatting | `config`, `severity`, `models`, `daily` |
| `js/ui-table.js` | Render the table, frozen label column, day-snapping horizontal scroll, column tap → slot detail | `table`, `format` |
| `js/ui-slot.js` | The slot detail panel, lifted out of `ui-days.js` and extended with the new readings and the model spread | `format`, `score` |

**Retired:** `js/bands.js`, `js/ui-days.js`, `test/bands.test.mjs`, and the
band-card CSS in `app.css`. The `Spots` tab and everything under it is
untouched.

`js/daily.js` keeps its role as the day/slot summariser; `table.js` consumes
its hourly series rather than re-deriving one.

## Table model

```
TableModel {
  days: [ { date, label, columns: [ Column ] } ]
  rows: [ { key, label, unit, kind } ]   // kind: 'tinted' | 'plain' | 'arrow' | 'score'
}
Column {
  time, slotIndex,
  cells: { [rowKey]: { value, band, agree, marker } },
  tideExtreme: 'H' | 'L' | null
}
```

`band` is an integer index into the row's severity ramp, or `null` for
untinted rows. `agree` is `true`, `false`, or `null` when only one model
returned — the three states are distinct and must not collapse, because
"models agree" and "we only have one model" are different claims.

## Rows

Fixed order, defined as an array in `config.js`:

| Row | Kind | Notes |
|---|---|---|
| score | score | `bite × comfort`, banded against `windows.threshold` |
| bite | plain | |
| comfort | plain | shown as `.90` |
| wind km/h | tinted | agreement-marked |
| gusts | tinted | agreement-marked |
| dir | arrow | arrow rotated to `direction + 180°` — points where the wind is going |
| swell m | tinted | agreement-marked |
| period s | plain | |
| tide m | tinted | blue ramp; `H`/`L` glyph on turning points |
| rain mm | tinted | agreement-marked; blank rather than `0.0` when dry |
| cloud % | plain | |
| air °C | plain | |
| sea °C | plain | |

The remaining new readings — humidity, dew point, apparent temperature,
visibility, UV index, CAPE, freezing level, cloud cover split by altitude,
wind-wave vs swell-wave split, secondary swell, wave direction, ocean current
velocity and direction — appear **only in the slot detail**. This is how both
"more parameters" and "a scannable table" are satisfied at once.

## Severity ramps

Seven bands, added to `config.js` beside the existing comfort thresholds so the
colour shown and the comfort cap it feeds cannot drift apart. Upper bounds:

```
wind    km/h : [10, 15, 20, 25, 30, 40]
gusts   km/h : [16, 22, 28, 35, 45, 60]
swell   m    : [0.5, 1.0, 1.5, 2.0, 2.5, 3.5]
rain    mm/h : [0.1, 0.5, 1.0, 2.0, 5.0]
```

The wind and gust ramps deliberately bracket the existing
`comfort.wind.ideal = 15` / `worst = 45` and `comfort.gusts.ideal = 25` /
`worst = 60`, so a cell turning red and the comfort multiplier collapsing
happen at the same wind speed.

Tide is tinted on a four-step blue ramp by height normalised within that day's
own range, not an absolute scale — tidal range varies by location and spring/
neap, and an absolute ramp would render some spots permanently one colour.

**Score bands** reuse `windows.threshold` (55) as the good/moderate boundary
rather than introducing a second definition of "good", with poor below 35.
This reconciles a discrepancy in the mockups, where 56 rendered as moderate;
under this rule it renders as good. Deliberate: one threshold, one meaning.

## Agreement

A cell is hatched when `max − min` across available models exceeds a
per-parameter tolerance:

```
wind          : 8 km/h
gusts         : 12 km/h
pressure      : 2 hPa
precipitation : 1 mm/h
swellHeight   : 0.5 m
```

The **score** cell is hatched when any parameter contributing to that slot's
score is hatched — uncertainty in an input is uncertainty in the output.

Where only one model returned, nothing is hatched and the slot detail states
that only one model was available. Silence must not read as agreement.

The slot detail shows the actual spread per parameter ("GFS 18, ICON 24,
ECMWF 31 km/h"). The hatch's only job is to tell you the column is worth
tapping.

## Geometry and interaction

- Label column 68 px, frozen (`position: sticky; left: 0`).
- 8 columns × 34 px = 272 px, so label plus a full day is 340 px and fits a
  356 px viewport without horizontal scrolling inside a day.
- Horizontal scroll uses CSS scroll snapping per day, so a swipe advances one
  day rather than landing mid-day.
- Row height 19 px. The tap target is the **whole column** (13 rows, ~250 px
  tall), so the small row height does not create an undersized touch target.
- Tapping a column opens the slot detail for that 3-hour block.
- Day header row shows the date and stays visible while scrolling vertically.

## Cache

`cache.js` must include the model list in the cache key. Without it, editing
`config.models` would silently serve stale single-model data with no hatching
and no way to tell. The existing `freshMs` and `coordPrecision` behaviour is
unchanged.

## Testing

Test-driven, matching the existing convention that pure logic is unit-tested
and render layers are checked in a browser.

- `test/severity.test.mjs` — band boundaries, values below and above the ramp,
  null and undefined input.
- `test/models.test.mjs` — key parsing for both prefix shapes; a fixture with a
  **deliberately missing regional model**, since that is a real response shape;
  the three-state `agree` distinction; tolerance boundaries.
- `test/table.test.mjs` — model shape, day and column counts, tide extreme
  placement, score hatching propagation from inputs.
- `test/api.test.mjs` — extended for the new parameters and the `models=`
  requests, including all three optional requests failing.
- `ui-table.js` and `ui-slot.js` — verified in a browser at 356 px and on
  desktop.

Delete `test/bands.test.mjs` with its module.

## Risks

| Risk | Handling |
|---|---|
| Payload growth | Measure; documented fallback order above |
| Regional model gaps produce no agreement data anywhere inland | Expected — degrade to no hatching, state it in the slot detail |
| Hatching muddies numbers on a bright screen outdoors | Verify on a phone in daylight; hatch opacity is a config value so it can be tuned without a code change |
| Losing the at-a-glance week view that the band cards provided | The Spots tab already carries a week-at-a-glance grid; that tab is unchanged |

## Out of scope

- The Kingfisher feed and social hotspots — separate specs, and they need the
  scheduled feed builder that this sub-project does not.
- Any hosting, GitHub Actions or Pages change.
- A row-picker UI.
- Per-model sub-rows or a model switcher.
