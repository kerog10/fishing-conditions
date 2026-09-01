import { fetchConditions, geocode } from './api.js';
import { scoreHours } from './score.js';
import { findWindows } from './windows.js';
import { summariseDays, tideExtremes } from './daily.js';
import { buildComparison } from './compare.js';
import { load as loadCache, save as saveCache, clearAll, clearCaches } from './cache.js';
import { loadSpots, saveSpots, addSpot, removeSpot, makeSpot } from './spots.js';
import { initMap } from './map.js';
import { renderNow, renderWindows, renderSpotResults, highlightResult, setStatus, ageNotice } from './ui.js';
import { buildTable } from './table.js';
import { renderTable } from './ui-table.js';
import { renderSpotChips, renderCompare, renderPreview } from './ui-compare.js';
import { createSuggester } from './suggest.js';
import { CONFIG } from './config.js';
import { createTabs } from './tabs.js';
import { summariseSpot } from './spot-summary.js';
import { renderSpotsTab } from './ui-spots-tab.js';
import { loadFeed, currentEntry } from './feed.js';
import { renderFeedCard } from './ui-feed.js';
import { loadVideos, pickVideos } from './videos.js';
import { renderVideoList } from './ui-videos.js';
import { buildHotspots } from './hotspots.js';
import { renderHotspots } from './ui-hotspots.js';

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
  spotCards: $('spot-cards'),
  feed: $('feed'),
  videos: $('videos'),
  hotspots: $('hotspots'),
  panels: { spots: $('panel-spots'), days: $('panel-days') },
  tabButtons: { spots: $('tab-spots'), days: $('tab-days') },
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
  openSlot: null,
  feed: null,
  videos: null,
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
  renderTable(
    els.days,
    buildTable(summariseDays(view.hours, view.spot.lat, view.spot.lon, view.offset), now),
    now,
    {
      openKey: state.openDay,
      openSlot: state.openSlot,
      onSlot(dayKey, index) {
        state.openDay = dayKey;
        state.openSlot = index;
        paintDetail();
      },
    },
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
      state.openSlot = null;
      renderPreview(els.preview, null);
      paintChips();
      paintDetail();
      tabs.select('days');
      els.days.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
}

const tabs = createTabs({
  names: ['spots', 'days'],
  onChange: () => paintTabs(),
});

function paintTabs() {
  for (const name of tabs.names) {
    const selected = name === tabs.current();
    els.panels[name].hidden = !selected;
    els.tabButtons[name].setAttribute('aria-selected', String(selected));
    els.tabButtons[name].tabIndex = selected ? 0 : -1;
  }
  if (tabs.current() === 'spots') paintSpotCards();
}

for (const name of tabs.names) {
  els.tabButtons[name].addEventListener('click', () => tabs.select(name));
  els.tabButtons[name].addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = tabs.names.indexOf(name);
    const next = tabs.names[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.names.length) % tabs.names.length];
    tabs.select(next);
    els.tabButtons[next].focus();
  });
}

function paintFeed() {
  const now = new Date();
  renderFeedCard(els.feed, currentEntry(state.feed), now);
  // Both feeds load independently, so this runs correctly whichever arrives
  // first -- buildHotspots treats a missing feed as no evidence.
  renderHotspots(els.hotspots, buildHotspots(state.videos, state.feed, now), now);
  renderVideoList(els.videos, pickVideos(state.videos), now);
}

function paintSpotCards() {
  paintFeed();
  const now = new Date();
  // paintTabs() can run before refreshSavedSpots() resolves, so a spot may not
  // be scored yet. Keep it in the list with a null-score summary rather than
  // hiding it (and tripping the "no spots saved" empty state on cold start).
  const cards = state.spots
    .map((s) => {
      const { hours = [] } = state.scored.get(s.id) ?? {};
      return { spot: s, summary: summariseSpot(hours, findWindows(hours), tideExtremes(hours), now) };
    })
    // Best first: the whole point of the tab is "which one right now".
    .sort((a, b) => (b.summary.score ?? -1) - (a.summary.score ?? -1));

  renderSpotsTab(els.spotCards, cards, {
    onOpen(id) {
      state.active = id;
      state.preview = null;
      state.openDay = null;
      state.openSlot = null;
      renderPreview(els.preview, null);
      paintChips();
      paintDetail();
      tabs.select('days');
    },
    onRemove: removeSpotById,
    onClearAll: clearEverything,
  });
}

async function clearEverything() {
  const what = state.spots.length
    ? `Remove all ${state.spots.length} saved spots and every cached forecast?`
    : 'Clear every cached forecast and start fresh?';
  // eslint-disable-next-line no-alert
  if (!globalThis.confirm(what)) return;
  setStatus(els.status, 'Resetting…');
  clearAll();
  // Awaited, unlike the localStorage wipe: the reload below would otherwise
  // race the deletion and could be served the very shell being deleted.
  await clearCaches();
  // Reloading is the honest reset: it drops the in-memory scores, the map
  // markers and the remembered view in one step rather than unpicking them.
  globalThis.location.reload();
}

function removeSpotById(id) {
  state.spots = removeSpot(state.spots, id);
  state.scored.delete(id);
  saveSpots(state.spots);
  if (state.active === id) state.active = state.spots[0]?.id ?? null;
  paintChips();
  paintCompare();
  paintSpotCards();
  paintDetail();
}

function paintChips() {
  renderSpotChips(els.spots, state.spots, state.active, {
    onSelect(id) {
      state.active = id;
      state.preview = null;
      state.openDay = null;
      state.openSlot = null;
      renderPreview(els.preview, null);
      const spot = state.spots.find((s) => s.id === id);
      if (spot) map.setPreview(spot.lat, spot.lon);
      paintChips();
      paintDetail();
    },
    onClearAll: clearEverything,
    onRemove: removeSpotById,
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
      paintSpotCards();
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
  state.openSlot = null;
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
  paintSpotCards();
  paintDetail();
}

const map = initMap('map', ({ lat, lon }) => previewPoint(lat, lon));

// --- Place search -----------------------------------------------------------

// What is currently offered under the search box, and which of them the arrow
// keys have landed on. -1 means nothing is highlighted, so Enter submits the
// typed text instead of picking a suggestion.
let suggestions = [];
let activeIndex = -1;

function choose(r) {
  const name = [r.name, r.admin, r.country].filter(Boolean).join(', ');
  els.search.value = name;
  closeSuggestions();
  suggester.cancel();
  // moveTo fires onPick, which previews the bare coordinates; this call
  // re-previews with the place name and wins because it bumps pending.
  map.moveTo(r.lat, r.lon);
  previewPoint(r.lat, r.lon, name);
}

function closeSuggestions() {
  suggestions = [];
  activeIndex = -1;
  els.results.hidden = true;
  els.search.removeAttribute('aria-activedescendant');
  els.search.setAttribute('aria-expanded', 'false');
}

function showSuggestions(results) {
  suggestions = results;
  activeIndex = -1;
  renderSpotResults(els.results, results, choose);
  els.search.setAttribute('aria-expanded', String(results.length > 0));
  els.search.removeAttribute('aria-activedescendant');
}

function moveActive(step) {
  if (!suggestions.length) return;
  // Wraps at both ends, and passes through -1 so you can arrow back out to
  // whatever you actually typed.
  const span = suggestions.length + 1;
  activeIndex = ((activeIndex + 1 + step + span) % span) - 1;
  const id = highlightResult(els.results, activeIndex);
  if (id) els.search.setAttribute('aria-activedescendant', id);
  else els.search.removeAttribute('aria-activedescendant');
}

const suggester = createSuggester({
  search: geocode,
  onResults: showSuggestions,
  // A failed look-up while typing is not worth an error banner: the next
  // keystroke usually fixes it, and the map is still there to tap.
  onError: () => {},
});

els.search.addEventListener('input', () => suggester.query(els.search.value));

els.search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moveActive(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter' && activeIndex >= 0) {
    e.preventDefault();
    choose(suggestions[activeIndex]);
  } else if (e.key === 'Escape') {
    closeSuggestions();
  }
});

// Tapping the map or anything else dismisses the list, but not while the tap
// is landing on a suggestion.
els.search.addEventListener('focusout', (e) => {
  if (!els.results.contains(e.relatedTarget)) closeSuggestions();
});

// Submitting still works: it is the fallback when the suggestions have not
// arrived yet, and on a phone keyboard it is the obvious thing to press.
els.searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const term = els.search.value.trim();
  if (!term) return;

  if (activeIndex >= 0) {
    choose(suggestions[activeIndex]);
    return;
  }

  suggester.cancel();
  setStatus(els.status, 'Searching…');
  try {
    const results = await geocode(term);
    if (!results.length) {
      setStatus(els.status, `No match for “${term}”.`, true);
      closeSuggestions();
      return;
    }
    setStatus(els.status, '');
    if (results.length === 1) {
      choose(results[0]);
      return;
    }
    showSuggestions(results);
  } catch (err) {
    setStatus(els.status, `Search failed: ${err.message}`, true);
  }
});

paintChips();
paintTabs();

if (state.spots.length) {
  state.active = state.spots[0].id;
  paintChips();
  refreshSavedSpots();
} else {
  previewPoint(map.start.lat, map.start.lon);
}

// Additive context, so it is deliberately not awaited: the forecast paints
// without it and the card appears whenever it arrives.
loadFeed().then((feed) => {
  state.feed = feed;
  paintFeed();
});

// Same reasoning: the video list is extra context, never a prerequisite.
loadVideos().then((videos) => {
  state.videos = videos;
  paintFeed();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}
