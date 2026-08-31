import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNELS, MAX_ENTRIES, SCRAPE_PER_CHANNEL, meta, firstRound, consume,
  parseFeed, hasEntries, channelUrl, watchUrl, videosUrl, parseChannelPage,
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

const PAS = { name: "Pa's Xtreme Fishing", id: 'UCh8UMAxna8IRRu2sRV3kDIQ' };

test('the channel page yields pending videos with no date yet', () => {
  const pending = parseChannelPage(fixture('youtube-channel.html'), PAS);

  assert.ok(pending.length >= 20, `only ${pending.length} videos found`);
  for (const p of pending) {
    assert.match(p.id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(p.title.length, 'every pending video has a title');
    assert.equal(p.link, `https://www.youtube.com/watch?v=${p.id}`);
    assert.equal(p.channel, PAS.name);
    assert.equal(p.channelUrl, `https://www.youtube.com/channel/${PAS.id}`);
    // The date is not knowable from this page; round three resolves it.
    assert.equal(p.date, undefined);
  }
});

test('scraped videos are unique', () => {
  const pending = parseChannelPage(fixture('youtube-channel.html'), PAS);

  assert.equal(new Set(pending.map((p) => p.id)).size, pending.length);
});

test('a page with no video records yields nothing rather than throwing', () => {
  assert.deepEqual(parseChannelPage('<html><body>nothing here</body></html>', PAS), []);
});

test('escaped sequences in scraped titles are decoded', () => {
  const html = '"lockupMetadataViewModel":{"title":{"content":"Boat Fishing with Pa \\u0026 Rasto"},'
    + '"image":{"thumbnailViewModel":{}}},"videoId":"abcdefghijk"';

  const [video] = parseChannelPage(html, PAS);

  assert.equal(video.title, 'Boat Fishing with Pa & Rasto');
});

test('videosUrl points at the videos tab', () => {
  assert.equal(videosUrl('UCh8UMAxna8IRRu2sRV3kDIQ'), 'https://www.youtube.com/channel/UCh8UMAxna8IRRu2sRV3kDIQ/videos');
});

test('a working feed produces entries and no scrape request', () => {
  const results = [{
    key: `rss:${KENTS.id}`, ok: true, status: 200,
    body: fixture('youtube-feed.xml'), channel: KENTS,
  }];

  const { entries, next } = consume(results, []);

  assert.equal(entries.length, 15);
  assert.deepEqual(next, []);
});

test('a 404 feed sends that channel to the channel page', () => {
  const results = [{
    key: `rss:${PAS.id}`, ok: false, status: 404, body: null, channel: PAS,
  }];

  const { entries, next } = consume(results, []);

  assert.deepEqual(entries, []);
  assert.equal(next.length, 1);
  assert.equal(next[0].url, videosUrl(PAS.id));
  assert.equal(next[0].channel.id, PAS.id);
});

test('an empty but valid feed also sends that channel to the channel page', () => {
  const results = [{
    key: `rss:${PAS.id}`, ok: true, status: 200,
    body: fixture('youtube-empty.xml'), channel: PAS,
  }];

  const { next } = consume(results, []);

  assert.equal(next.length, 1);
  assert.equal(next[0].url, videosUrl(PAS.id));
});

test('one dead channel does not cost the others their entries', () => {
  const results = [
    { key: `rss:${PAS.id}`, ok: false, status: 404, body: null, channel: PAS },
    { key: `rss:${KENTS.id}`, ok: true, status: 200, body: fixture('youtube-feed.xml'), channel: KENTS },
  ];

  const { entries, next } = consume(results, []);

  assert.equal(entries.length, 15);
  assert.equal(next.length, 1);
});

test('videos already stored are not looked up again', () => {
  const pending = parseChannelPage(fixture('youtube-channel.html'), PAS);
  const existing = pending.slice(0, 3).map((p) => ({ ...p, date: '2026-08-01T00:00:00Z' }));
  const results = [{
    key: `page:${PAS.id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: PAS,
  }];

  const { next } = consume(results, existing);

  const askedFor = new Set(next.map((r) => r.video.id));
  for (const stored of existing) {
    assert.equal(askedFor.has(stored.id), false, `${stored.id} was re-fetched`);
  }
});

test('the channel page round is capped so a first run cannot stampede', () => {
  const results = [{
    key: `page:${PAS.id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: PAS,
  }];

  const { next } = consume(results, []);

  assert.equal(next.length, SCRAPE_PER_CHANNEL);
  for (const r of next) {
    assert.match(r.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.ok(r.video, 'the pending video travels on the request');
  }
});

test('a channel page that failed to fetch is skipped silently', () => {
  const results = [{
    key: `page:${PAS.id}`, ok: false, status: 500, body: null, channel: PAS,
  }];

  assert.deepEqual(consume(results, []), { entries: [], next: [] });
});
