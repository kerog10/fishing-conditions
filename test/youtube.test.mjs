import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNELS, MAX_ENTRIES, meta, firstRound, parseFeed, hasEntries,
  channelUrl, watchUrl,
} from '../tools/feeds/youtube.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const KENTS = { name: 'Kents Fishing', id: 'UC1QUL3Z5Ho7_Y0M562eqb8Q' };

test('every configured channel has a name and a UC id', () => {
  assert.equal(CHANNELS.length, 7);
  for (const c of CHANNELS) {
    assert.ok(c.name.length, 'channel needs a name');
    assert.match(c.id, /^UC[A-Za-z0-9_-]{22}$/);
  }
});

test('channel ids are unique', () => {
  assert.equal(new Set(CHANNELS.map((c) => c.id)).size, CHANNELS.length);
});

test('meta names the source and its output file', () => {
  assert.equal(meta.name, 'youtube');
  assert.equal(meta.out, 'data/feeds/youtube.json');
  assert.equal(meta.maxEntries, MAX_ENTRIES);
});

test('the first round asks for one feed per channel', () => {
  const requests = firstRound([]);

  assert.equal(requests.length, CHANNELS.length);
  for (const r of requests) {
    assert.equal(r.type, 'text');
    assert.match(r.url, /feeds\/videos\.xml\?channel_id=UC/);
    assert.ok(r.channel, 'the channel travels on the request');
  }
});

test('a real feed parses into entries', () => {
  const entries = parseFeed(fixture('youtube-feed.xml'), KENTS);

  assert.equal(entries.length, 15);
  for (const e of entries) {
    assert.match(e.id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(e.title.length, 'every entry has a title');
    assert.equal(e.link, `https://www.youtube.com/watch?v=${e.id}`);
    assert.equal(e.channel, KENTS.name);
    assert.equal(e.channelUrl, `https://www.youtube.com/channel/${KENTS.id}`);
    assert.ok(Number.isFinite(Date.parse(e.date)), `unparseable date: ${e.date}`);
    assert.match(e.date, /Z$/, 'dates are stored as UTC');
    assert.equal(e.via, 'rss');
  }
});

test('the feed carries full descriptions', () => {
  const entries = parseFeed(fixture('youtube-feed.xml'), KENTS);
  const described = entries.filter((e) => typeof e.description === 'string' && e.description.length);

  // Not every video has a description, but a real channel's feed has several.
  assert.ok(described.length >= 5, `only ${described.length} entries had a description`);
});

test('feed entries are ordered newest first', () => {
  const dates = parseFeed(fixture('youtube-feed.xml'), KENTS).map((e) => Date.parse(e.date));
  const sorted = [...dates].sort((a, b) => b - a);

  assert.deepEqual(dates, sorted);
});

test('XML entities in titles are decoded', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>Women&amp;#39;s Day &amp;amp; the Shad are biting!</title>
    <published>2026-08-09T20:51:44+00:00</published>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS);

  assert.equal(entry.title, "Women's Day & the Shad are biting!");
});

test('a valid feed with no entries yields nothing, and is detectable', () => {
  const xml = fixture('youtube-empty.xml');

  assert.equal(hasEntries(xml), false);
  assert.deepEqual(parseFeed(xml, KENTS), []);
});

test('a real feed is detected as having entries', () => {
  assert.equal(hasEntries(fixture('youtube-feed.xml')), true);
});

test('an entry missing a video id or date is dropped, not stored half-formed', () => {
  const xml = `<feed>
    <entry><title>No id</title><published>2026-08-09T20:51:44+00:00</published></entry>
    <entry><yt:videoId>abcdefghijk</yt:videoId><title>No date</title></entry>
    <entry><yt:videoId>bbcdefghijk</yt:videoId><title>Fine</title><published>2026-08-09T20:51:44+00:00</published></entry>
  </feed>`;

  const entries = parseFeed(xml, KENTS);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Fine');
});

test('url helpers build the documented shapes', () => {
  assert.equal(channelUrl('UC1QUL3Z5Ho7_Y0M562eqb8Q'), 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q');
  assert.equal(watchUrl('abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
});
