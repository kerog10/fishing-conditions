import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadGazetteer, cleanText, findMarks, findSpecies, findRegion,
  splitRegions, unmatchedPhrases,
} from '../tools/feeds/places.mjs';

const raw = JSON.parse(readFileSync(new URL('../data/gazetteer.json', import.meta.url), 'utf8'));
const GZ = loadGazetteer(raw);

test('the shipped gazetteer loads', () => {
  assert.ok(GZ, 'gazetteer failed to load');
  assert.ok(GZ.marks.length >= 40, `only ${GZ.marks.length} marks`);
});

test('every mark has a known region', () => {
  for (const m of GZ.marks) {
    assert.ok(['north', 'central', 'south'].includes(m.region), `${m.name}: ${m.region}`);
  }
});

test('mark names and aliases are unique across the gazetteer', () => {
  const seen = new Set();
  for (const m of GZ.marks) {
    for (const term of [m.name, ...m.aliases]) {
      const key = term.toLowerCase();
      assert.equal(seen.has(key), false, `duplicate term: ${term}`);
      seen.add(key);
    }
  }
});

test('no mark is also a region term', () => {
  const regionTerms = new Set(GZ.regionTerms.map((t) => t.toLowerCase()));
  for (const m of GZ.marks) {
    assert.equal(regionTerms.has(m.name.toLowerCase()), false, `${m.name} is both`);
  }
});

test('a malformed gazetteer loads as null rather than throwing', () => {
  assert.equal(loadGazetteer(null), null);
  assert.equal(loadGazetteer({}), null);
  assert.equal(loadGazetteer({ marks: 'nonsense' }), null);
  assert.equal(loadGazetteer({ marks: [] }), null);
});

test('hashtags are stripped before matching', () => {
  const cleaned = cleanText('Great session #Durban #KZNFishing #Umkomaas');

  assert.equal(/#/.test(cleaned), false);
  assert.equal(/Durban/i.test(cleaned), false);
  assert.equal(/Umkomaas/i.test(cleaned), false);
});

test('urls are stripped before matching', () => {
  const cleaned = cleanText('Watch https://youtu.be/Umkomaas-abc and subscribe');

  assert.equal(/youtu\.be/.test(cleaned), false);
});

test('a place named only in a hashtag yields no mark', () => {
  const marks = findMarks(GZ, { title: 'Big session', body: '#Umkomaas #Durban' });

  assert.deepEqual(marks, []);
});

test('a mark matches on its name', () => {
  const marks = findMarks(GZ, { title: 'Shad at Umkomaas today', body: '' });

  assert.equal(marks.length, 1);
  assert.equal(marks[0].name, 'Umkomaas');
  assert.equal(marks[0].region, 'south');
  assert.equal(marks[0].where, 'title');
});

test('a mark matches on an alias and reports its canonical name', () => {
  const marks = findMarks(GZ, { title: 'Fishing at Toti', body: '' });

  assert.equal(marks[0].name, 'Amanzimtoti');
});

test('matching is case insensitive', () => {
  assert.equal(findMarks(GZ, { title: 'UMKOMAAS BEACH', body: '' })[0].name, 'Umkomaas');
});

test('word boundaries hold: Toti does not fire inside Amanzimtoti', () => {
  const marks = findMarks(GZ, { title: 'A day at Amanzimtoti', body: '' });

  assert.equal(marks.length, 1);
  assert.equal(marks[0].name, 'Amanzimtoti');
});

test('a title match is preferred over the same mark in the body', () => {
  const marks = findMarks(GZ, { title: 'Umkomaas session', body: 'we fished Umkomaas all day' });

  assert.equal(marks.length, 1);
  assert.equal(marks[0].where, 'title');
});

test('a body-only match is recorded as body', () => {
  const marks = findMarks(GZ, { title: 'Great day out', body: 'We fished Scottburgh' });

  assert.equal(marks[0].where, 'body');
});

test('several marks in one entry are all returned', () => {
  const marks = findMarks(GZ, { title: 'From Toti down to Scottburgh', body: '' });

  assert.deepEqual(marks.map((m) => m.name).sort(), ['Amanzimtoti', 'Scottburgh']);
});

test('a region term never becomes a mark', () => {
  for (const term of GZ.regionTerms) {
    const marks = findMarks(GZ, { title: `Fishing in ${term} today`, body: '' });
    assert.deepEqual(marks, [], `${term} produced a mark`);
  }
});

test('the measured decoys never become marks', () => {
  const decoys = [
    'Foton', 'Spotify', 'Apple Pods', 'Google Pods', 'Deezer', 'Facebook',
    'Albert Falls Dam', 'Midmar', 'Inanda', 'Mearns Dam', 'Kamberg Road',
    'Connington Road', 'Foot and Mouth Disease', 'Previous Next', 'Nino',
  ];

  for (const decoy of decoys) {
    const marks = findMarks(GZ, { title: `Report mentions ${decoy} this week`, body: '' });
    assert.deepEqual(marks, [], `${decoy} produced a mark`);
  }
});

test('a null gazetteer yields no marks rather than throwing', () => {
  assert.deepEqual(findMarks(null, { title: 'Umkomaas', body: '' }), []);
  assert.deepEqual(findSpecies(null, 'Shad'), []);
  assert.equal(findRegion(null, 'Durban'), null);
});

test('species match, with synonyms folded to the canonical name', () => {
  assert.deepEqual(findSpecies(GZ, 'Caught elf and leervis'), ['Garrick', 'Shad']);
});

test('species matching respects word boundaries', () => {
  assert.deepEqual(findSpecies(GZ, 'Kobus went fishing'), []);
});

test('species are deduplicated', () => {
  assert.deepEqual(findSpecies(GZ, 'Shad, more shad, and elf'), ['Shad']);
});

test('a region term sets a region without pinning a mark', () => {
  assert.equal(findRegion(GZ, 'Fishing the South Coast'), 'south');
  assert.equal(findRegion(GZ, 'A day in Durban'), 'central');
  assert.equal(findRegion(GZ, 'Nothing relevant here'), null);
});

test('a mark implies its own region', () => {
  assert.equal(findRegion(GZ, 'Fishing at Ballito'), 'north');
});

test('a Kingfisher body splits into regions with species per region', () => {
  const body = 'Rock and Surf: general notes. '
    + 'North Coast The north has produced garrick this week. '
    + 'Central Coast Shad continue to dominate from Glen Ashley through to uShaka. '
    + 'South Coast Kob and grunter have shown up well.';

  const regions = splitRegions(GZ, body);

  assert.deepEqual(regions.north.species, ['Garrick']);
  assert.deepEqual(regions.central.species, ['Shad']);
  assert.deepEqual(regions.south.species, ['Grunter', 'Kob']);
});

test('a body with no coast headings yields no regions', () => {
  assert.deepEqual(splitRegions(GZ, 'Just some text about fishing and shad.'), {});
});

test('region splitting does not bleed species across sections', () => {
  const body = 'North Coast Only snoek here. South Coast Only tuna here.';

  const regions = splitRegions(GZ, body);

  assert.deepEqual(regions.north.species, ['Snoek']);
  assert.deepEqual(regions.south.species, ['Tuna']);
});

test('unmatched capitalised phrases are reported for gazetteer growth', () => {
  const found = unmatchedPhrases(GZ, 'We fished Umkomaas with Foton and visited Nowhereville');
  const phrases = found.map((f) => f.phrase);

  assert.equal(phrases.includes('Umkomaas'), false, 'a known mark is not unmatched');
  assert.ok(phrases.includes('Nowhereville'), `expected Nowhereville in ${JSON.stringify(phrases)}`);
});
