import { fetchConditions, geocode } from './api.js';
import { scoreHours } from './score.js';
import { findWindows } from './windows.js';
import { load as loadCache, save as saveCache } from './cache.js';
import { initMap } from './map.js';
import {
  renderNow, renderWindows, renderDays, renderSpotResults, setStatus, ageNotice,
} from './ui.js';

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

function paint(payload, lat, lon) {
  const scored = scoreHours(payload.hours, lat, lon);
  const now = new Date();
  renderNow(els.now, scored, now);
  renderWindows(els.windows, findWindows(scored), now);
  renderDays(els.days, scored, now);
}

async function show(lat, lon) {
  if (!els.spotName.dataset.named) {
    els.spotName.textContent = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }
  els.spotName.dataset.named = '';
  setStatus(els.status, 'Loading forecast…');

  const cached = loadCache(lat, lon);
  if (cached?.fresh) {
    paint(cached.payload, lat, lon);
    setStatus(els.status, cached.payload.hasMarine
      ? ''
      : 'No tide or swell data here — scoring on weather and solunar only.');
    return;
  }

  try {
    const payload = await fetchConditions(lat, lon);
    saveCache(lat, lon, payload);
    paint(payload, lat, lon);
    setStatus(els.status, payload.hasMarine
      ? ''
      : 'No tide or swell data here — scoring on weather and solunar only.');
  } catch (err) {
    if (cached) {
      paint(cached.payload, lat, lon);
      setStatus(els.status, ageNotice(cached.ageMs), true);
    } else {
      setStatus(els.status, `Could not load a forecast: ${err.message}`, true);
    }
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
