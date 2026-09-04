const CACHE = 'fishing-conditions-v5';

// How long to wait for the network before falling back to the cached copy.
// Long enough to ride out a slow beach connection, short enough that a dead
// one does not leave you staring at a blank screen.
const NETWORK_TIMEOUT_MS = 3000;

const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.json',
  './js/main.js',
  './js/api.js',
  './js/astro.js',
  './js/cache.js',
  './js/config.js',
  './js/format.js',
  './js/map.js',
  './js/score.js',
  './js/spot-summary.js',
  './js/ui.js',
  './js/table.js',
  './js/ui-table.js',
  './js/ui-slot.js',
  './js/severity.js',
  './js/models.js',
  './js/daily.js',
  './js/spots.js',
  './js/suggest.js',
  './js/tabs.js',
  './js/learn-content.js',
  './js/compare.js',
  './js/ui-compare.js',
  './js/ui-spots-tab.js',
  './js/feed.js',
  './js/ui-feed.js',
  './js/videos.js',
  './js/ui-videos.js',
  './js/hotspots.js',
  './js/ui-hotspots.js',
  './js/spot-intel.js',
  './js/windows.js',
  './vendor/suncalc.mjs',
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/images/marker-icon.png',
  './vendor/images/marker-icon-2x.png',
  './vendor/images/marker-shadow.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Forecasts and map tiles: network only, falling back to whatever was
  // cached. localStorage already holds the last forecast for the UI.
  if (url.hostname.endsWith('open-meteo.com') || url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Everything else is the app itself. This is deliberately network-first, not
  // cache-first: cache-first meant an installed browser kept serving the
  // version it first saw and no edit could ever reach it. The cache is the
  // offline fallback, never the source of truth.
  event.respondWith(networkFirst(request));
});

async function fromNetwork(request) {
  // Deliberately not a plain fetch(request). Inside a service worker, fetch
  // still answers from the browser's own HTTP cache, so a network-first
  // strategy can be handed a stale copy that never reached the server -- which
  // is exactly what made this app look frozen. cache: 'no-cache' forces a
  // conditional request every time; nginx answers 304 when nothing changed, so
  // it stays cheap. Rebuilt from the URL rather than the original Request
  // because a navigation request cannot be cloned with a new cache mode.
  const response = await fetch(new Request(request.url, {
    cache: 'no-cache',
    credentials: 'same-origin',
  }));
  if (response.ok) {
    const copy = response.clone();
    // Refreshing the cache must not delay the response, and a failure to
    // store is survivable, so this is deliberately not awaited.
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return response;
}

function networkFirst(request) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('network timeout')), NETWORK_TIMEOUT_MS);
  });

  return Promise.race([fromNetwork(request), timeout])
    .catch(async () => {
      const hit = await caches.match(request);
      // No network and nothing cached: let the browser report the failure
      // rather than hand back a fake empty response.
      if (!hit) throw new Error(`offline and not cached: ${request.url}`);
      return hit;
    })
    .finally(() => clearTimeout(timer));
}
