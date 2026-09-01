import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, attachIntel } from '../js/spot-intel.js';
import { CONFIG } from '../js/config.js';

// Real KZN positions, so the distance assertions mean something.
const UMKOMAAS = { lat: -30.2064, lon: 30.7961 };
const AMANZIMTOTI = { lat: -30.0497, lon: 30.8886 };

const spot = (id, name, at) => ({ id, name, lat: at.lat, lon: at.lon });
const hot = (name, at, over = {}) => ({
  name,
  region: 'south',
  count: 3,
  species: ['Garrick', 'Shad'],
  videos: [],
  report: null,
  lat: at ? at.lat : null,
  lon: at ? at.lon : null,
  ...over,
});

test('distance between two known KZN marks is about 19 km', () => {
  const d = distanceKm(UMKOMAAS, AMANZIMTOTI);

  assert.ok(d > 17 && d < 21, `expected ~19 km, got ${d}`);
});

test('distance from a point to itself is zero', () => {
  assert.equal(Math.round(distanceKm(UMKOMAAS, UMKOMAAS)), 0);
});

test('a spot on a hotspot picks up its intel', () => {
  const spots = [spot('s1', 'My Umkomaas mark', UMKOMAAS)];

  const intel = attachIntel(spots, [hot('Umkomaas', UMKOMAAS)]);

  assert.equal(intel.get('s1').name, 'Umkomaas');
  assert.equal(intel.get('s1').count, 3);
  assert.deepEqual(intel.get('s1').species, ['Garrick', 'Shad']);
});

test('a spot beyond the radius picks up nothing', () => {
  const spots = [spot('s1', 'Toti', AMANZIMTOTI)];

  // ~19 km apart, well beyond the 5 km radius.
  const intel = attachIntel(spots, [hot('Umkomaas', UMKOMAAS)]);

  assert.equal(intel.has('s1'), false);
});

test('the nearest hotspot wins when two are in range', () => {
  // 1 km and 3 km north of the spot respectively.
  const near = { lat: UMKOMAAS.lat + 0.009, lon: UMKOMAAS.lon };
  const far = { lat: UMKOMAAS.lat + 0.027, lon: UMKOMAAS.lon };
  const spots = [spot('s1', 'Mark', UMKOMAAS)];

  const intel = attachIntel(spots, [hot('Far', far), hot('Near', near)]);

  assert.equal(intel.get('s1').name, 'Near');
});

test('a hotspot with no coordinates never matches, however close the spot', () => {
  const spots = [spot('s1', 'Mark', UMKOMAAS)];

  const intel = attachIntel(spots, [hot('Umkomaas', null)]);

  assert.equal(intel.has('s1'), false);
});

test('the reported distance is the real one', () => {
  const near = { lat: UMKOMAAS.lat + 0.009, lon: UMKOMAAS.lon };
  const intel = attachIntel([spot('s1', 'Mark', UMKOMAAS)], [hot('Near', near)]);

  assert.ok(intel.get('s1').distanceKm < CONFIG.hotspots.maxDistanceKm);
  assert.ok(intel.get('s1').distanceKm > 0.5);
});

test('several spots each get their own nearest hotspot', () => {
  const spots = [
    spot('s1', 'A', UMKOMAAS),
    spot('s2', 'B', AMANZIMTOTI),
  ];

  const intel = attachIntel(spots, [hot('Umkomaas', UMKOMAAS), hot('Amanzimtoti', AMANZIMTOTI)]);

  assert.equal(intel.get('s1').name, 'Umkomaas');
  assert.equal(intel.get('s2').name, 'Amanzimtoti');
});

test('empty or malformed inputs yield an empty map rather than an error', () => {
  assert.equal(attachIntel([], []).size, 0);
  assert.equal(attachIntel(null, null).size, 0);
  assert.equal(attachIntel([spot('s1', 'A', UMKOMAAS)], []).size, 0);
  assert.equal(attachIntel([{ id: 's1' }], [hot('Umkomaas', UMKOMAAS)]).size, 0);
});
