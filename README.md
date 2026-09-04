# Fishing Conditions

Ranks the next 7 days into fishing windows for any point on a map, using
weather, tide, swell and solunar data. Built for shore, rock-and-surf and
estuary fishing.

No API keys. No signups. No backend.

Tap a point on the map to preview it, then add it to the comparison. Up to 6
spots are compared as a grid of best-score-per-day; tap any cell to jump to that
spot's detail for that day.

Three tabs: **Spots** ranks every saved spot by its current score, with tide
state, wind and the next good window on each card, plus a week-at-a-glance
grid. It also carries the human intelligence — the latest KZN fishing report,
a ranked list of hotspots, and recent videos from local anglers. **7 days**
shows one spot at a time as a Windguru-style forecast table: thirteen rows of
readings against 3-hourly columns, colour-banded by severity, marked where the
weather models disagree, and scroll-snapped a day at a time. Tap any column
for the reasons behind that slot's score. **Learn** carries the reference
material: how to read a beach for rips, gullies and sandbanks, and the knots
and traces for rock-and-surf and estuary fishing. It is static content - no
forecast, no feed, no network.

The place search suggests matches as you type (debounced, keyboard-navigable)
using Open-Meteo's geocoder — no API key, no signup.

## Run it

```bash
npm run vendor   # once: downloads Leaflet and SunCalc into vendor/
npm run serve    # http://127.0.0.1:8090
```

ES modules do not load over `file://`, so it must be served. Any static host
works — GitHub Pages, Netlify, or the command above.

## Run it in a container

```bash
podman build --format docker -t fishing-conditions:1.0.0 .
podman run -d --name fishing -p 8090:8090 --restart unless-stopped fishing-conditions:1.0.0
```

Then open <http://127.0.0.1:8090>. `--format docker` is needed for the
`HEALTHCHECK` line; OCI format silently drops it.

### Reaching it from a phone

Podman runs inside a WSL VM, and WSL's relay only listens on `127.0.0.1` on the
Windows side, so publishing the port is not enough to reach it over wifi. In an
**Administrator** PowerShell:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8090 connectaddress=127.0.0.1 connectport=8090
New-NetFirewallRule -DisplayName "fishing-conditions 8090" -Direction Inbound -Protocol TCP -LocalPort 8090 -Action Allow -Profile Private
```

To undo:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8090
Remove-NetFirewallRule -DisplayName "fishing-conditions 8090"
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
truth, so an edit reaches an installed browser on the next load without
bumping a version.

The one thing that does need keeping in sync is the `SHELL` list in `sw.js`:
every module under `js/` must be listed, or the app breaks *offline* the
moment `main.js` imports one that was never precached. `npm test` asserts
this, and also asserts that `data/feeds/*.json` stays out of the list —
`caches.addAll` is atomic, and those files are cron-generated and may not
exist yet.

If you are running the container, the files are copied into the image at build
time — rebuild and restart it to pick up an edit:

```bash
podman build --format docker -t fishing-conditions:1.0.0 . &&   podman rm -f fishing &&   podman run -d --name fishing -p 8090:8090 --restart unless-stopped fishing-conditions:1.0.0
```

## Feeds

Two feeds add human intelligence beside the modelled forecast. Both are built
by a scheduled job, committed as JSON, and served same-origin — the browser
gains no API key and no third-party request.

```bash
npm run feeds    # builds data/feeds/*.json
```

`.github/workflows/feeds.yml` runs this daily and commits only when something
changed, so a quiet day produces no commit.

- **Kingfisher** — the weekly KZN fishing report. The WordPress REST API gives
  discovery only; the body is scraped from the post page. Their copyright, so
  the stored JSON holds a hard-capped 50-word excerpt plus title, date and
  link, and the card always links out.
- **YouTube** — recent videos from seven KZN fishing channels. The per-channel
  Atom feed is tried first and the channel page scraped when it fails, which
  it does intermittently; a watch-page fetch supplies the exact upload date.

`data/gazetteer.json` is a hand-curated list of KZN marks with aliases and
regions. Place names are matched against it at build time and never discovered
from prose — the reports mention Foton, Spotify and "Foot and Mouth Disease"
far more often than they mention beaches. Marks may carry `lat`/`lon`, which
are **hand-supplied**: geocoding was measured and rejected, having put La Mercy
at an airport and The Bluff at a hang-gliding site. A mark without coordinates
still ranks in the Hotspots list; it just does not pin on the map. Each build
logs which marks are still missing one.

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
- [The Kingfisher](https://www.kingfisher.co.za/) — weekly KZN fishing report (excerpt and link only)
- YouTube per-channel Atom feeds — recent videos from KZN fishing channels
