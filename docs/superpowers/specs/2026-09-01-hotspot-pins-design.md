# Hotspot Pins and Spot-Attached Intel - Design

**Date:** 2026-09-01
**Status:** Approved
**Sub-project:** 3c of 3 (roadmap: forecast table -> feed builder -> social hotspots)

## Goal

Put the hotspots on the map, and put the intel where the user already looks:
on the saved spot cards. This closes sub-project 3.

- **3a (done):** the source contract, `tools/feeds/youtube.mjs`, the
  recent-videos list.
- **3b (done):** the gazetteer, build-time place matching, the Hotspots list.
- **3c (this spec):** coordinates for marks, hotspot pins on the Leaflet map,
  and video intel on saved spot cards.

Both 3a and 3b are built on `feature/youtube-video-feed` and deliberately
unmerged. 3c continues on the same branch.

## Coordinates - established by probe, not assumption

Probed 2026-09-01 against all 56 gazetteer marks via OpenStreetMap's
Nominatim, bounded to the KZN coastal box.

| Result | Count |
|---|---|
| Real shore feature (usable as-is) | **3** |
| Town or suburb centroid - inland, not the shore | 37 |
| Wrong feature entirely | 9 |
| No result at all | 7 |

**Geocoding is rejected as a source of mark coordinates.** The failures are
not near-misses. La Mercy resolved to King Shaka International Airport, The
Bluff to a hang-gliding site, Tongaat to a railway station, Anstey's Beach to
Anstey Road, Banana Beach to a residential street called Banana Grove. The
seven that returned nothing at all - Glen Ashley, Vetch's Pier, Cave Rock,
Chain Rocks, Umgeni Mouth, Virginia Beach, Reunion Beach - are precisely the
named fishing marks rather than the towns. OSM knows settlements; it does not
know where people fish.

Even the 37 "successes" are the wrong kind of right: a suburb centroid sits
a kilometre or more inland of the shore an angler actually stands on.

**Consequence: coordinates are hand-supplied, and only for marks that carry
evidence.** Today that is seven, not fifty-six:

| Mark | Region | Videos |
|---|---|---|
| Amanzimtoti | south | 6 |
| Warner Beach | south | 3 |
| Umkomaas | south | 2 |
| Chain Rocks | central | 2 |
| Isipingo | central | 2 |
| Winklespruit | south | 1 |
| South Pier | central | 1 |

`lat: null, lon: null` placeholders are already committed against these seven.
This is the same evidence-driven growth the unmatched-phrase log gives the
gazetteer: a mark earns a coordinate when it first appears, not before.

## Architecture

No new modules on the build side. 3c is a gazetteer schema addition, one new
pure browser module, and changes to two existing render modules.

| Piece | Purpose |
|---|---|
| `data/gazetteer.json` | Gains optional `lat` / `lon` per mark. |
| `tools/feeds/places.mjs` | Carries `lat`/`lon` through onto each stamped mark. |
| `tools/build-feeds.mjs` | Logs marks that appeared with no coordinate. |
| `js/hotspots.js` | Hotspot rows gain `lat`/`lon` when known. |
| `js/spot-intel.js` | **New.** Pure. Joins saved spots to hotspots by distance. |
| `js/map.js` | Gains `setHotspots(rows, onPick)`. |
| `js/ui-spots-tab.js` | Renders an intel line on a spot card. |
| `js/main.js` | Wiring. |

### Coordinates travel on the stamped mark

`findMarks` already returns `{ name, region, where }`. It gains `lat` and
`lon`, copied from the gazetteer entry and `null` when absent. They are
therefore stamped onto each stored entry alongside the mark name, exactly as
`region` already is, and `js/hotspots.js` reads them without loading the
gazetteer.

This matters for the same reason 3b's re-stamping did: because matching is
re-derived on every merge, **adding a coordinate to the gazetteer takes
effect on the whole stored window at the next build**, with no refetch and no
migration.

### A mark without coordinates still ranks

This is the rule that keeps the feature honest as the gazetteer grows past
seven. A mark with no coordinate:

- still appears in the Hotspots list, with its videos and species;
- simply does not pin on the map;
- is logged by the build so it can be given one.

Ranking never depends on having a coordinate. The list is the primary
surface; the map is an additional view of the subset that can be placed.

## Map pins

`js/map.js` gains one method, mirroring the existing `setMarkers`:

```js
setHotspots(rows, onPick);   // rows: [{ name, count, lat, lon }]
```

Rows without finite `lat`/`lon` are skipped silently.

Hotspots render **visually distinct from saved spots**, in their own
`L.layerGroup`. Saved spots keep their blue `circleMarker`; hotspots use a
warm fill with the video count as the label, and a tooltip of the mark name.
The distinction is the point: a saved spot is a place the user tracks, a
hotspot is a place videos mentioned, and the map must not blur the two.

Tapping a hotspot calls `onPick(name)`, which scrolls the Spots tab to that
mark's row in the Hotspots list rather than opening a Leaflet popup - the
row already renders the videos, the species and the regional line, so
duplicating it in a popup would mean two places to maintain and two places to
get wrong.

## Spot-attached intel

`js/spot-intel.js` is pure:

```js
attachIntel(spots, hotspots) -> Map<spotId, { name, count, species, distanceKm }>
```

A saved spot picks up the **nearest hotspot within `maxDistanceKm`**, using
the haversine distance. Distance rather than name, because saved spots are
created by tapping the map or searching, so their names are whatever the
geocoder returned and will not match a curated mark name.

Only marks with coordinates can be matched, which is the deliberate trade
accepted above.

`js/ui-spots-tab.js` renders one additional line on a card that has intel:

> seen in 3 recent videos - Garrick, Shad

The line is omitted entirely when there is no intel. It never replaces the
existing tide, wind and window lines, which remain the reason the card
exists.

**Config:**

```js
hotspots: {
  // ...existing 3b keys...
  maxDistanceKm: 5,
},
```

The **KZN box** referenced under error handling is the coastal strip the
probe used, and is the only place a mark coordinate may legitimately fall:

```js
// tools/feeds/places.mjs
const KZN_BOX = { minLat: -31.2, maxLat: -28.8, minLon: 30.0, maxLon: 32.9 };
```

It is a sanity check on hand-entered data, not a geocoder. A transposed pair
or a dropped minus sign lands far outside it and is caught at build time
rather than rendering a pin in the wrong hemisphere.

Five kilometres is roughly the spacing of the named KZN beaches, so a spot
matches the beach it is on rather than its neighbour. A spot with no mark
within that distance simply gets no intel line.

## Error handling

- **No coordinates anywhere:** no pins, every Hotspots row still renders, no
  intel lines. The map is exactly as it is today. This is the state the
  feature ships in until the seven are filled, and it must look deliberate
  rather than broken.
- **A malformed coordinate** (non-finite, or outside the KZN box): treated as
  absent, and logged at build time. A pin in the Atlantic is worse than no
  pin.
- **A hotspot with coordinates but no saved spot nearby:** pins, no intel
  line anywhere. Normal.
- **Leaflet unavailable:** unchanged from today - the map is already
  independent of the Spots tab rendering.

## Testing

`test/places.test.mjs` gains: a mark with coordinates carries them onto the
stamped mark; a mark without them stamps `null`; an out-of-box coordinate is
rejected as absent.

`test/hotspots.test.mjs` gains: a row exposes `lat`/`lon` when the mark has
them; a row without them still ranks and still carries its videos.

`test/spot-intel.test.mjs` (new):

1. A spot within `maxDistanceKm` of a hotspot gets its intel.
2. A spot beyond it gets none.
3. The **nearest** hotspot wins when two are in range.
4. A hotspot with no coordinates never matches, however close the spot.
5. An empty hotspot list yields an empty map, not an error.
6. Distance is computed correctly across a known KZN pair.

`test/ui-spots-tab.test.mjs` is **new** - `js/ui-spots-tab.js` currently has
no tests. It is created with the zero-dependency DOM stub the other `ui-*`
tests use, and scoped to what 3c changes rather than retrofitting coverage
for the whole module: a card with intel renders the extra line, a card
without intel renders exactly the lines it does today, and the intel line
never displaces the tide, wind or window lines.

`js/map.js` is DOM-and-Leaflet and stays browser-verified, as it is today -
the project's existing line between unit-tested pure logic and visually
checked I/O.

## Done when

- The seven marks carry hand-supplied coordinates, and each pin lands on the
  shore rather than a town centre.
- Hotspot pins render on the map, visually distinct from saved spots, and
  tapping one scrolls to its row.
- A saved spot within 5 km of a hotspot shows an intel line; one further away
  shows none.
- A mark with no coordinate still ranks in the Hotspots list and does not pin.
- The build logs any mark that appeared in a hotspot with no coordinate.
- Deleting `data/feeds/youtube.json` leaves the map and spot cards working
  with no pins, no intel lines and no console error.
- `npm test` passes with the new tests present.
