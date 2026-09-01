import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHotspots } from '../js/hotspots.js';
import { CONFIG } from '../js/config.js';

const NOW = new Date('2026-09-01T08:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - (n * 86400000)).toISOString();

const vid = (id, mark, { where = 'title', region = 'south', age = 1, species = ['Shad'] } = {}) => ({
  id,
  channel: 'Test Channel',
  channelUrl: 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q',
  title: `Video ${id}`,
  link: `https://www.youtube.com/watch?v=${id}`,
  date: daysAgo(age),
  description: null,
  via: 'rss',
  marks: mark ? [{ name: mark, region, where }] : [],
  species,
});

const feed = (entries) => ({ entries });

test('a mark with evidence becomes a hotspot', () => {
  const rows = buildHotspots(feed([vid('a', 'Umkomaas')]), null, NOW);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Umkomaas');
  assert.equal(rows[0].count, 1);
  assert.deepEqual(rows[0].species, ['Shad']);
});

test('recency beats raw volume', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { age: 2 }),
    vid('b', 'Scottburgh', { age: 50 }),
    vid('c', 'Scottburgh', { age: 52 }),
    vid('d', 'Scottburgh', { age: 54 }),
  ]), null, NOW);

  assert.equal(rows[0].name, 'Umkomaas', 'the recent single mention should lead');
});

test('a title match outranks a body match of the same age', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { where: 'body', age: 3 }),
    vid('b', 'Scottburgh', { where: 'title', age: 3 }),
  ]), null, NOW);

  assert.equal(rows[0].name, 'Scottburgh');
});

test('videos older than the window do not contribute', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { age: CONFIG.hotspots.windowDays + 5 }),
  ]), null, NOW);

  assert.deepEqual(rows, []);
});

test('the list caps at max', () => {
  const marks = ['Umkomaas', 'Scottburgh', 'Ballito', 'Margate', 'Uvongo',
    'Sezela', 'Pennington', 'Trafalgar'];
  const rows = buildHotspots(feed(marks.map((m, i) => vid(`v${i}`, m, { age: i + 1 }))), null, NOW);

  assert.equal(rows.length, CONFIG.hotspots.max);
});

test('species from several videos at one mark are merged', () => {
  const rows = buildHotspots(feed([
    vid('a', 'Umkomaas', { species: ['Shad'] }),
    vid('b', 'Umkomaas', { species: ['Garrick', 'Shad'] }),
  ]), null, NOW);

  assert.equal(rows[0].count, 2);
  assert.deepEqual(rows[0].species, ['Garrick', 'Shad']);
});

test('a hotspot carries its videos newest first', () => {
  const rows = buildHotspots(feed([
    vid('old', 'Umkomaas', { age: 20 }),
    vid('new', 'Umkomaas', { age: 2 }),
  ]), null, NOW);

  assert.deepEqual(rows[0].videos.map((v) => v.id), ['new', 'old']);
});

test('entries with no marks are ignored, not crashed on', () => {
  const rows = buildHotspots(feed([
    vid('a', null),
    { id: 'b', title: 'No marks field at all', link: 'https://x.test/', date: daysAgo(1) },
    vid('c', 'Umkomaas'),
  ]), null, NOW);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Umkomaas');
});

test('the region report is attached when one is available', () => {
  const report = {
    entries: [{
      id: 1, date: daysAgo(2), title: 'KZN Fishing Report', excerpt: '…',
      link: 'https://www.kingfisher.co.za/report/',
      regions: { south: { species: ['Garrick', 'Kob'] } },
    }],
  };

  const rows = buildHotspots(feed([vid('a', 'Umkomaas', { region: 'south' })]), report, NOW);

  assert.deepEqual(rows[0].report.species, ['Garrick', 'Kob']);
  assert.equal(rows[0].report.link, 'https://www.kingfisher.co.za/report/');
});

test('a mark whose region has no report line carries a null report', () => {
  const report = {
    entries: [{
      id: 1, date: daysAgo(2), title: 'R', excerpt: '…', link: 'https://x.test/',
      regions: { north: { species: ['Shad'] } },
    }],
  };

  const rows = buildHotspots(feed([vid('a', 'Umkomaas', { region: 'south' })]), report, NOW);

  assert.equal(rows[0].report, null);
});

test('the newest report wins when several are stored', () => {
  const report = {
    entries: [
      { id: 1, date: daysAgo(20), title: 'old', excerpt: '…', link: 'https://old.test/', regions: { south: { species: ['Snoek'] } } },
      { id: 2, date: daysAgo(2), title: 'new', excerpt: '…', link: 'https://new.test/', regions: { south: { species: ['Kob'] } } },
    ],
  };

  const rows = buildHotspots(feed([vid('a', 'Umkomaas', { region: 'south' })]), report, NOW);

  assert.deepEqual(rows[0].report.species, ['Kob']);
});

test('a malformed or empty feed yields no rows rather than throwing', () => {
  assert.deepEqual(buildHotspots(null, null, NOW), []);
  assert.deepEqual(buildHotspots({}, null, NOW), []);
  assert.deepEqual(buildHotspots({ entries: 'nonsense' }, null, NOW), []);
  assert.deepEqual(buildHotspots(feed([]), null, NOW), []);
});

test('a malformed report feed does not stop the hotspots', () => {
  const rows = buildHotspots(feed([vid('a', 'Umkomaas')]), { entries: 'nonsense' }, NOW);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].report, null);
});

test('a hotspot row exposes the mark coordinates', () => {
  const entry = vid('a', 'Umkomaas');
  entry.marks[0].lat = -30.2064;
  entry.marks[0].lon = 30.7961;

  const rows = buildHotspots(feed([entry]), null, NOW);

  assert.equal(rows[0].lat, -30.2064);
  assert.equal(rows[0].lon, 30.7961);
});

test('a mark with no coordinates still ranks and carries nulls', () => {
  const rows = buildHotspots(feed([vid('a', 'Umkomaas')]), null, NOW);

  assert.equal(rows[0].name, 'Umkomaas');
  assert.equal(rows[0].count, 1);
  assert.equal(rows[0].lat, null);
  assert.equal(rows[0].lon, null);
});

test('a coordinate on any one mention is enough to place the row', () => {
  const withCoords = vid('a', 'Umkomaas');
  withCoords.marks[0].lat = -30.2064;
  withCoords.marks[0].lon = 30.7961;

  const rows = buildHotspots(feed([vid('b', 'Umkomaas', { age: 2 }), withCoords]), null, NOW);

  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].lat, -30.2064);
});
