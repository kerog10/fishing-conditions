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

## Run it in a container

```bash
podman build --format docker -t fishing-conditions:1.0.0 .
podman run -d --name fishing -p 8080:8080 --restart unless-stopped fishing-conditions:1.0.0
```

Then open <http://127.0.0.1:8080>. `--format docker` is needed for the
`HEALTHCHECK` line; OCI format silently drops it.

### Reaching it from a phone

Podman runs inside a WSL VM, and WSL's relay only listens on `127.0.0.1` on the
Windows side, so publishing the port is not enough to reach it over wifi. In an
**Administrator** PowerShell:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8080 connectaddress=127.0.0.1 connectport=8080
New-NetFirewallRule -DisplayName "fishing-conditions 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
```

To undo:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8080
Remove-NetFirewallRule -DisplayName "fishing-conditions 8080"
```

Over plain `http://` on a LAN address the browser is not in a secure context, so
the service worker will not register: the app loads and fetches forecasts, but
"Add to home screen" and offline mode need HTTPS.

## Test

```bash
npm test
```

The logic (`config`, `astro`, `score`, `windows`, `cache`, `format`, `api`) is
pure and unit-tested. `ui` and `map` are verified in a browser.

## Editing the app

Edits show up on the next load. The service worker is network-first and asks
the server on every shell request (with `cache: 'no-cache'`, so the browser's
own HTTP cache cannot answer for it), and nginx sends `Cache-Control: no-cache`
for HTML, CSS and JS. The cache is the offline fallback, not the source of
truth, so there is no version constant to remember to bump.

If you are running the container, the files are copied into the image at build
time — rebuild and restart it to pick up an edit:

```bash
podman build --format docker -t fishing-conditions:1.0.0 . &&   podman rm -f fishing &&   podman run -d --name fishing -p 8080:8080 --restart unless-stopped fishing-conditions:1.0.0
```

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
