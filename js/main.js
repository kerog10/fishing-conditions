import { fetchConditions, geocode } from './api.js';
import { scoreHours } from './score.js';
import { findWindows } from './windows.js';
import { summariseDays } from './daily.js';
import { buildComparison } from './compare.js';
import { load as loadCache, save as saveCache, clearAll } from './cache.js';
import { loadSpots, saveSpots, addSpot, removeSpot, makeSpot } from './spots.js';
import { initMap } from './map.js';
import { renderNow, renderWindows, renderSpotResults, setStatus, ageNotice } from './ui.js';
import { renderDays } from './ui-days.js';
import { renderSpotChips, renderCompare, renderPreview } from './ui-compare.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);

const els = {
  status: $('status'),
  spotName: $('spot-name'),
  now: $('now-bar'),
  windows: $('windows'),
  days: $('days'),
  spots: $('spots'),
  preview: $('preview'),
  compare: $('compare'),
  compareSection: $('compare-section'),
  searchForm: $('spot-search-form'),
  search: $('spot-search'),
  results: $('spot-results'),
};

const state = {
  spots: loadSpots(),
  // spot id -> {hours, offset}. The offset travels with the hours because it is
  // a property of the spot's timezone, and every astronomy call needs it to
  // line up with hours that carry local wall-clock times stamped as UTC.
  scored: new Map(),
  active: null,   // spot id, or null while a preview is showing
  preview: null,  // {lat, lon, name, hours, offset}
  openDay: null,
};

const marineNote = (hasMarine) => (hasMarine
  ? ''
  : 'No tide or swell data here — scoring on weather and solunar only.');

function shown() {
  if (state.active) {
    const spot = state.spots.find((s) => s.id === state.active);
    const data = state.scored.get(state.active);
    return spot && data ? { spot, ...data } : null;
  }
  return state.preview?.hours
    ? { spot: state.preview, hours: state.preview.hours, offset: state.preview.offset }
    : null;
}

function nearestIndex(hours, now = Date.now()) {
  let best = 0;
  let gap = Infinity;
  hours.forEach((h, i) => {
    const d = Math.abs(h.time - now);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
}

function paintDetail() {
  const view = shown();
  if (!view) return;
  const now = new Date();

  els.spotName.textContent = view.spot.name;
  renderNow(els.now, view.hours, now);
  renderWindows(els.windows, findWindows(view.hours), now);
  renderDays(
    els.days,
    summariseDays(view.hours, view.spot.lat, view.spot.lon, view.offset),
    now,
    { openKey: state.openDay },
  );
}

function paintCompare() {
  const entries = state.spots
    .filter((s) => state.scored.has(s.id))
    .map((s) => {
      const { hours, offset } = state.scored.get(s.id);
      return { spot: s, days: summariseDays(hours, s.lat, s.lon, offset) };
    });

  // One spot is not a comparison; the day grid below already covers it.
  els.compareSection.hidden = entries.length < 2;
  renderCompare(els.compare, buildComparison(entries), new Date(), {
    onCell(spotId, dayKey) {
      state.active = spotId;
      state.preview = null;
      state.openDay = dayKey;
      renderPreview(els.preview, null);
      paintChips();
      paintDetail();
      els.days.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
}

function paintChips() {
  renderSpotChips(els.spots, state.spots, state.active, {
    onSelect(id) {
      state.active = id;
      state.preview = null;
      state.openDay = null;
      renderPreview(els.preview, null);
      const spot = state.spots.find((s) => s.id === id);
      if (spot) map.setPreview(spot.lat, spot.lon);
      paintChips();
      paintDetail();
    },
    onClearAll() {
      const what = state.spots.length
        ? `Remove all ${state.spots.length} saved spots and every cached forecast?`
        : 'Clear every cached forecast and start fresh?';
      // eslint-disable-next-line no-alert
      if (!globalThis.confirm(what)) return;
      clearAll();
      // Reloading is the honest reset: it drops the in-memory scores, the map
      // markers and the remembered view in one step rather than unpicking them.
      globalThis.location.reload();
    },
    onRemove(id) {
      state.spots = removeSpot(state.spots, id);
      state.scored.delete(id);
      saveSpots(state.spots);
      if (state.active === id) state.active = state.spots[0]?.id ?? null;
      paintChips();
      paintCompare();
      paintDetail();
    },
  });
  map.setMarkers(state.spots, state.active);
}

function paintPreviewBar() {
  if (!state.preview) {
    renderPreview(els.preview, null);
    return;
  }

  const id = makeSpot(state.preview.lat, state.preview.lon).id;
  const already = state.spots.some((s) => s.id === id);
  const full = state.spots.length >= CONFIG.spots.max;
  const hours = state.preview.hours;

  renderPreview(els.preview, {
    name: state.preview.name,
    score: hours?.length ? hours[nearestIndex(hours)].final : null,
    canAdd: !already && !full,
    reason: already ? 'Already comparing' : (full ? `Limit is ${CONFIG.spots.max} spots` : ''),
  }, {
    onAdd() {
      const spot = makeSpot(state.preview.lat, state.preview.lon, state.preview.name);
      const result = addSpot(state.spots, spot);
      if (result.error) return;
      state.spots = result.spots;
      saveSpots(state.spots);
      if (state.preview.hours) {
        state.scored.set(spot.id, { hours: state.preview.hours, offset: state.preview.offset });
      }
      state.active = spot.id;
      state.preview = null;
      paintPreviewBar();
      paintChips();
      paintCompare();
      paintDetail();
    },
  });
}

// Cached data paints immediately, then the network revalidates. navigator.onLine
// is deliberately not consulted: it reports that a link exists, not that
// anything is reachable, so a dead cell connection still claims to be online.
async function loadSpotData(lat, lon) {
  const cached = loadCache(lat, lon);
  let payload = cached?.payload ?? null;
  let stale = Boolean(cached && !cached.fresh);
  let error = null;

  try {
    payload = await fetchConditions(lat, lon);
    saveCache(lat, lon, payload);
    stale = false;
  } catch (err) {
    error = err;
  }

  return { payload, stale, error, ageMs: cached?.ageMs ?? 0 };
}

const score = (payload, lat, lon) => ({
  hours: scoreHours(payload.hours, lat, lon, payload.utcOffsetSeconds ?? 0),
  offset: payload.utcOffsetSeconds ?? 0,
});

let pending = 0;

async function previewPoint(lat, lon, name = '') {
  const token = ++pending;
  state.active = null;
  state.openDay = null;
  state.preview = {
    lat, lon, name: name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, hours: null, offset: 0,
  };
  paintChips();
  paintPreviewBar();
  setStatus(els.status, 'Loading forecast…');

  const { payload, stale, error, ageMs } = await loadSpotData(lat, lon);
  // A newer point was tapped while this was in flight; its result wins.
  if (token !== pending) return;

  if (!payload) {
    setStatus(els.status, `Could not load a forecast: ${error.message}`, true);
    return;
  }

  Object.assign(state.preview, score(payload, lat, lon));
  paintPreviewBar();
  paintDetail();
  setStatus(els.status, stale ? ageNotice(ageMs) : marineNote(payload.hasMarine), stale);
}

async function refreshSavedSpots() {
  const results = await Promise.all(state.spots.map(async (spot) => ({
    spot,
    payload: (await loadSpotData(spot.lat, spot.lon)).payload,
  })));

  for (const { spot, payload } of results) {
    if (payload) state.scored.set(spot.id, score(payload, spot.lat, spot.lon));
  }
  paintCompare();
  paintDetail();
}

const map = initMap('map', ({ lat, lon }) => previewPoint(lat, lon));

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
      const name = [r.name, r.admin, r.country].filter(Boolean).join(', ');
      // moveTo fires onPick, which previews the bare coordinates; this call
      // re-previews with the place name and wins because it bumps pending.
      map.moveTo(r.lat, r.lon);
      previewPoint(r.lat, r.lon, name);
    });
  } catch (err) {
    setStatus(els.status, `Search failed: ${err.message}`, true);
  }
});

paintChips();

if (state.spots.length) {
  state.active = state.spots[0].id;
  paintChips();
  refreshSavedSpots();
} else {
  previewPoint(map.start.lat, map.start.lon);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}
