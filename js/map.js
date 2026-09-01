// Leaflet is loaded as a classic script in index.html, so it is a global here.
/* global L */

const DEFAULT_VIEW = { lat: -29.85, lon: 31.05, zoom: 9 }; // Durban
const LAST_SPOT_KEY = 'fc:last-spot';

function saveLastSpot(lat, lon, zoom) {
  try {
    localStorage.setItem(LAST_SPOT_KEY, JSON.stringify({ lat, lon, zoom }));
  } catch {
    // Storage disabled; the map simply starts at the default next time.
  }
}

function loadLastSpot() {
  try {
    const raw = localStorage.getItem(LAST_SPOT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) ? v : null;
  } catch {
    return null;
  }
}

export function initMap(elementId, onPick) {
  const start = loadLastSpot() ?? DEFAULT_VIEW;
  const map = L.map(elementId).setView([start.lat, start.lon], start.zoom ?? 11);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const previewMarker = L.marker([start.lat, start.lon], { opacity: 0.6 }).addTo(map);
  const saved = L.layerGroup().addTo(map);
  const hotspots = L.layerGroup().addTo(map);

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
  };
}
