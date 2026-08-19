import { fetchConditions, geocode } from './api.js';
import { scoreHours } from './score.js';
import { findWindows } from './windows.js';
import { load as loadCache, save as saveCache } from './cache.js';
import { initMap } from './map.js';
import {
  renderNow, renderWindows, renderSpotResults, setStatus, ageNotice,
} from './ui.js';
import { renderDays } from './ui-days.js';
import { summariseDays } from './daily.js';

const $ = (id) => document.getElementById(id);

const els = {
  status: $('status'),
  spotName: $('spot-name'),
  now: $('now-bar'),
  windows: $('windows'),
  days: $('days'),
  searchForm: $('spot-search-form'),
  search: $('spot-search'),
  results: $('spot-results'),
};

const marineNote = (payload) => (payload.hasMarine
  ? ''
  : 'No tide or swell data here — scoring on weather and solunar only.');

function paint(payload, lat, lon) {
  const scored = scoreHours(payload.hours, lat, lon, payload.utcOffsetSeconds ?? 0);
  const now = new Date();
  renderNow(els.now, scored, now);
  renderWindows(els.windows, findWindows(scored), now);
  renderDays(els.days, summariseDays(scored, lat, lon, payload.utcOffsetSeconds ?? 0), now);
}

// Cached data paints immediately, then the network revalidates. navigator.onLine
// is not consulted: it reports that a link exists, not that anything is
// reachable, so a dead cell connection would still claim to be online. A failed
// refresh is the only honest signal that what you are looking at is not live.
let pending = 0;

async function show(lat, lon) {
  const token = ++pending;
  if (!els.spotName.dataset.named) {
    els.spotName.textContent = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }
  els.spotName.dataset.named = '';

  const cached = loadCache(lat, lon);
  if (cached) {
    paint(cached.payload, lat, lon);
    setStatus(els.status,
      cached.fresh ? marineNote(cached.payload) : ageNotice(cached.ageMs), !cached.fresh);
  } else {
    setStatus(els.status, 'Loading forecast…');
  }

  try {
    const payload = await fetchConditions(lat, lon);
    if (token !== pending) return; // a newer spot was picked while this was in flight
    saveCache(lat, lon, payload);
    paint(payload, lat, lon);
    setStatus(els.status, marineNote(payload));
  } catch (err) {
    if (token !== pending) return;
    if (cached) setStatus(els.status, ageNotice(cached.ageMs), true);
    else setStatus(els.status, `Could not load a forecast: ${err.message}`, true);
  }
}

const map = initMap('map', ({ lat, lon }) => show(lat, lon));

els.searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const term = els.search.value.trim();
  if (!term) return;

  setStatus(els.status, 'Searching…');
  try {
    const results = await geocode(term);
    if (!results.length) {
      setStatus(els.status, `No match for “${term}”.`, true);
      return;
    }
    setStatus(els.status, '');
    renderSpotResults(els.results, results, (r) => {
      els.spotName.textContent = [r.name, r.admin, r.country].filter(Boolean).join(', ');
      els.spotName.dataset.named = '1';
      map.moveTo(r.lat, r.lon);
    });
  } catch (err) {
    setStatus(els.status, `Search failed: ${err.message}`, true);
  }
});

show(map.start.lat, map.start.lon);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}
