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
