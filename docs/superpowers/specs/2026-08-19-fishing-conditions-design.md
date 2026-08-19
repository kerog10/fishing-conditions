# Fishing Conditions — Design

**Date:** 2026-08-19
**Status:** Approved, ready for implementation planning
**Location:** `personal-tools/projects/fishing-conditions`

## Purpose

Answer one question: **when should I go fishing?**

Given any coastal point on a map, rank the next 7 days into fishing windows using
weather, tide, swell and solunar data. Targets shore/rock-and-surf and estuary
fishing on the South African coast, though nothing in the design is
region-specific.

## Constraints

- **No API keys, no signups.** Every data source must be free and keyless.
- **No backend.** Static single-page app. Must run on a phone at the beach.
- **No build step, no bundler, no runtime npm dependencies.**
- **Not safety-critical.** The app must never imply navigational authority.

## Data Sources

All keyless and CORS-enabled.

| Data | Endpoint |
|---|---|
| Wind, gusts, pressure, precipitation, cloud, temperature, sunrise/sunset | `https://api.open-meteo.com/v1/forecast` |
| Tide (`sea_level_height_msl`), wave and swell height/period/direction, SST | `https://marine-api.open-meteo.com/v1/marine` |
| Spot name search | `https://geocoding-api.open-meteo.com/v1/search` |
| Moon phase, moonrise/set, moon altitude | Computed locally — vendored SunCalc (MIT) |

Two fetches per spot: 7 days of hourly data, `timezone=auto`. Requests are
combined per spot and cached, so panning the map does not re-hit the API.

### Solunar periods are derived, not fetched

No free solunar API exists. Instead:

- **Major periods** — sample moon altitude every 10 minutes across the day.
  The local maximum is moon transit (overhead); the local minimum is moon
  underfoot. Each defines a major period of transit ±1 hour.
- **Minor periods** — moonrise and moonset, each ±1 hour.

## Scoring

Two numbers, never blended into one. A perfect solunar window inside a 40-knot
onshore gale must not read as "good".

### Bite score (0–100) — will fish feed?

| Factor | Weight | Shape |
|---|---:|---|
| Barometric pressure trend | 30 | Rising scores highest; sharp fall scores lowest. Computed over a 3-hour window. |
| Tide movement | 30 | **Rate of change** of sea level, not stage. Mid-tide flow peaks; slack water scores lowest. |
| Solunar period | 20 | Major period full credit, minor period partial. |
| Dawn/dusk proximity | 15 | Within ±1 hour of sunrise or sunset. |
| Moon phase | 5 | New and full moon boost. |

### Comfort multiplier (0–1) — can I fish it?

Derived from wind speed and gusts, swell height and period, and precipitation.
Applied as a cap, not a weighted term, so genuinely unfishable conditions cannot
be outvoted by favourable solunar timing.

### Final

`final = bite × comfort`

All three values are surfaced. Every scored hour carries a `reasons[]` array of
plain-English strings, so the UI explains itself rather than showing an
unexplained number.

Weights live in a single exported object. Retuning them, or adding species
profiles later, is a data change rather than a rewrite.

## Concrete Parameters

Stated explicitly so implementation has no room to guess. All live in one
exported config object.

**Comfort multiplier** — the minimum of the individual penalties below:

| Input | 1.0 (ideal) | Degrades to | 0.15 (floor) |
|---|---|---|---|
| Wind speed | <= 15 km/h | linear | >= 45 km/h |
| Wind gusts | <= 25 km/h | linear | >= 60 km/h |
| Swell height | <= 1.0 m | linear | >= 3.5 m |
| Precipitation | <= 0.5 mm/h | linear | >= 5 mm/h |

The floor is 0.15 rather than 0 so a strong bite window still appears in the
list, visibly capped, rather than vanishing without explanation.

**Pressure trend** — change in `pressure_msl` over the preceding 3 hours.
`>= +1.0 hPa` scores 30; `0 hPa` scores 15; `<= -1.5 hPa` scores 0.

**Tide movement** — absolute change in `sea_level_height_msl` per hour,
normalised against that spot's maximum hourly change across the 7-day window.
Slack water scores 0; peak flow scores 30.

**Moon phase** — full credit (5) within 3 days of new or full moon, tapering
linearly to 0 at first and last quarter.

**Windows** — consecutive hours with `final >= 55`. A drop of more than 15
points from the window's running mean splits it. Minimum length 1 hour, maximum
4 hours. Ranked by mean `final`, top 8 shown.

**Cache** — `localStorage`, keyed by lat/lon rounded to 2 decimal places.
Considered fresh for 1 hour; older entries are still served on network failure,
with their age shown.

## Views

1. **Now bar** — current-hour verdict plus a 12-hour strip.
2. **Best windows** — top ~8 windows across 7 days. Consecutive hours above a
   threshold are grouped, split on score dips, capped at ~4 hours, ranked by
   mean score. Each shows time range, bite, comfort, and its reasons.
3. **Day cards** — seven cards, each with the day's best score and headline.

Full timeline charts are out of scope for v1. Windows carry a compact
tide/wind/pressure readout instead.

## Structure

```
fishing-conditions/
  index.html
  app.css
  manifest.json
  sw.js
  js/
    api.js       Fetch + normalise Open-Meteo responses into a single hourly[]
    astro.js     SunCalc wrappers: solunar periods, moon phase, dawn/dusk
    score.js     Pure: hour -> { bite, comfort, final, reasons }
    windows.js   Pure: hours[] -> ranked windows[]
    ui.js        Render now bar, windows, day cards
    map.js       Leaflet init, click -> lat/lon, recent spots
    main.js      Wiring
  vendor/
    suncalc.js  leaflet.js  leaflet.css
  test/
    score.test.mjs  windows.test.mjs  astro.test.mjs
    fixtures/
```

Plain ES modules throughout — the same `score.js` the browser imports is the one
`node --test` imports. `score.js`, `windows.js` and `astro.js` are pure
functions and testable without network access. `api.js` is tested against a
saved fixture.

Leaflet and SunCalc are vendored rather than loaded from a CDN, so the app shell
works offline.

## Serving

ES modules cannot load over `file://` — browsers block it. "No backend" means no
server-side code, not no hosting.

- **Local development:** `npx http-server`
- **Phone use:** a static host such as GitHub Pages

## Offline

- Every successful fetch is cached to `localStorage`, keyed by rounded lat/lon.
- On network failure the cached forecast is shown with a *"last updated 3h ago"*
  badge rather than a blank screen.
- A minimal PWA — `manifest.json` plus a cache-first service worker for the app
  shell — makes the app installable to the home screen and openable offline.

## Error Handling

| Condition | Behaviour |
|---|---|
| Marine API returns nulls or an error (point is inland) | Degrade to a no-tide, no-swell mode. Score from pressure, solunar and dawn/dusk only, and say so explicitly in the UI. |
| Network unavailable | Serve the cached payload with an age badge. |
| Geocoding returns no match | Keep the current spot, show an inline "no match" message. |
| Both APIs fail with no cache | Explicit error state — never a blank or a zero score. |

## Accuracy and Safety

`sea_level_height_msl` comes from a global ocean model. Open-Meteo's own
documentation warns that *"accuracy is limited in coastal areas"* and that the
data is *"not suitable for coastal navigation."*

The tide readout therefore carries a permanent, non-dismissible banner stating
that tides are modelled, accurate to roughly ±30–45 minutes in coastal areas,
are not SANHO data, and must not be used for navigation or bar crossings.

This is a safety requirement, not a disclaimer. Estuary fishing involves bar
crossings, where acting on a wrong tide time can be fatal. The app must not
imply an authority it does not have.

## Out of Scope for v1

- Species-specific scoring profiles (the weights object is structured to accept
  them later).
- Full timeline charts.
- Catch logging and score-versus-catch comparison.
- Any paid or key-requiring tide source.

## References

- [Open-Meteo Marine Weather API](https://open-meteo.com/en/docs/marine-weather-api)
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- [SunCalc](https://github.com/mourner/suncalc)
- [Leaflet](https://leafletjs.com/)
- [SANHO — SA Navy Hydrographic Office](https://sanho.co.za/Default.htm) (authoritative SA tides; no public API)
- [Solunar theory and tidal timing — In The Spread](https://inthespread.com/blog/solunar-calendar-and-sport-fishing-unlocking-the-secrets-of-tides-335)
- [Solunar fishing calendars — FishingBooker](https://fishingbooker.com/blog/solunar-fishing-calendars-fishing-by-moon-phases/)
