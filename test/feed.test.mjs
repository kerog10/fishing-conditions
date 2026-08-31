import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentEntry, loadFeed } from '../js/feed.js';
import { CONFIG } from '../js/config.js';

const entry = (date, id = 1) => ({
  id,
  date,
  title: `KZN Fishing Report (${date.slice(0, 10)})`,
  link: 'https://www.kingfisher.co.za/report/',
  excerpt: 'Shad continue to dominate catches…',
});

const NOW = new Date('2026-08-28T08:00:00Z');

test('the newest entry is the one shown', () => {
  const feed = { entries: [entry('2026-08-27T14:00:00Z', 2), entry('2026-08-20T14:00:00Z', 1)] };

  assert.equal(currentEntry(feed, NOW).id, 2);
});

test('entries out of order are still resolved newest first', () => {
  // The builder sorts, but the file is committed by a bot and hand-editable.
  const feed = { entries: [entry('2026-08-20T14:00:00Z', 1), entry('2026-08-27T14:00:00Z', 2)] };

  assert.equal(currentEntry(feed, NOW).id, 2);
});

test('a report past the staleness window is not shown as current', () => {
  const feed = { entries: [entry('2026-07-01T14:00:00Z')] };

  assert.equal(currentEntry(feed, NOW), null);
});

test('an entry right on the window is still shown', () => {
  const days = CONFIG.feed.maxAgeDays;
  const at = new Date(NOW.getTime() - (days * 86400000) + 60000).toISOString();

  assert.ok(currentEntry({ entries: [entry(at)] }, NOW));
});

test('a missing feed yields nothing rather than throwing', () => {
  assert.equal(currentEntry(null, NOW), null);
});

test('a feed with no entries yields nothing', () => {
  assert.equal(currentEntry({ entries: [] }, NOW), null);
});

test('an entry with an unparseable date is ignored, not rendered as NaN', () => {
  const feed = { entries: [{ ...entry('2026-08-27T14:00:00Z'), date: 'last Thursday' }] };

  assert.equal(currentEntry(feed, NOW), null);
});

test('an entry missing its link is ignored — the link is the whole point', () => {
  const feed = { entries: [{ ...entry('2026-08-27T14:00:00Z'), link: '' }] };

  assert.equal(currentEntry(feed, NOW), null);
});

test('a 404 on the feed file resolves to null', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });

  assert.equal(await loadFeed(fetchImpl), null);
});

test('a network failure resolves to null rather than rejecting', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };

  assert.equal(await loadFeed(fetchImpl), null);
});

test('malformed JSON resolves to null', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } });

  assert.equal(await loadFeed(fetchImpl), null);
});

test('a good response is returned as-is', async () => {
  const feed = { source: 'kingfisher', entries: [entry('2026-08-27T14:00:00Z')] };
  const fetchImpl = async (url) => {
    assert.equal(url, CONFIG.feed.path);
    return { ok: true, json: async () => feed };
  };

  assert.deepEqual(await loadFeed(fetchImpl), feed);
});
