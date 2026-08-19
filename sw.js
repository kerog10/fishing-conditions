const CACHE = 'fishing-conditions-v1';

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
  './js/ui.js',
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

  // Forecasts and map tiles: always prefer the network, fall back to whatever
  // was cached. localStorage already holds the last forecast for the UI.
  if (url.hostname.endsWith('open-meteo.com') || url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
