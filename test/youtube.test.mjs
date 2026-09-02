import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNELS, MAX_ENTRIES, SCRAPE_PER_CHANNEL, MAX_WATCH_LOOKUPS,
  meta, firstRound, consume, merge,
  parseFeed, hasEntries, parseUploadDate, channelUrl, watchUrl, videosUrl,
  parseChannelPage,
} from '../tools/feeds/youtube.mjs';

import { loadGazetteer } from '../tools/feeds/places.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const GZ = loadGazetteer(JSON.parse(
  readFileSync(new URL('../data/gazetteer.json', import.meta.url), 'utf8'),
));
const CTX = { gazetteer: GZ };

const KENTS = { name: 'Kents Fishing', id: 'UC1QUL3Z5Ho7_Y0M562eqb8Q' };

test('every configured channel has a name and a UC id', () => {
  // A floor, not an exact count: the channel list grows as new ones are found.
  assert.ok(CHANNELS.length >= 7, `only ${CHANNELS.length} channels`);
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

test('the watch page yields an exact UTC timestamp', () => {
  const date = parseUploadDate(fixture('youtube-watch.html'));

  assert.ok(date, 'expected an upload date');
  assert.match(date, /Z$/);
  assert.ok(Number.isFinite(Date.parse(date)));
});

test('an offset upload date is normalised to UTC', () => {
  const html = '{"uploadDate":"2026-08-23T21:43:42-07:00"}';

  assert.equal(parseUploadDate(html), '2026-08-24T04:43:42.000Z');
});

test('a watch page with no upload date yields null rather than a guess', () => {
  assert.equal(parseUploadDate('<html><body>no date here</body></html>'), null);
});

test('an unparseable upload date yields null', () => {
  assert.equal(parseUploadDate('{"uploadDate":"not a date"}'), null);
});

test('the watch round produces dated scrape entries', () => {
  const video = {
    id: 'abcdefghijk',
    channel: "Pa's Xtreme Fishing",
    channelUrl: channelUrl(PAS.id),
    title: 'Monster Garrick at Winklespruit',
    link: watchUrl('abcdefghijk'),
  };
  const results = [{
    key: 'watch:abcdefghijk', ok: true, status: 200,
    body: '{"uploadDate":"2026-08-23T21:43:42-07:00"}', video,
  }];

  const { entries, next } = consume(results, []);

  assert.deepEqual(next, []);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    id: 'abcdefghijk',
    channel: "Pa's Xtreme Fishing",
    channelUrl: channelUrl(PAS.id),
    title: 'Monster Garrick at Winklespruit',
    link: watchUrl('abcdefghijk'),
    date: '2026-08-24T04:43:42.000Z',
    description: null,
    via: 'scrape',
    marks: [],
    species: [],
  });
});

test('a video whose date cannot be resolved is dropped, not guessed', () => {
  const video = {
    id: 'abcdefghijk', channel: 'X', channelUrl: channelUrl(PAS.id),
    title: 'T', link: watchUrl('abcdefghijk'),
  };
  const failed = [{ key: 'watch:abcdefghijk', ok: false, status: 404, body: null, video }];
  const dateless = [{ key: 'watch:abcdefghijk', ok: true, status: 200, body: '<html></html>', video }];

  assert.deepEqual(consume(failed, []).entries, []);
  assert.deepEqual(consume(dateless, []).entries, []);
});

test('merge caps the window newest first', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `v${i}`,
    date: new Date(Date.UTC(2026, 0, 1) + (i * 86400000)).toISOString(),
  }));

  const merged = merge([], many);

  assert.equal(merged.length, MAX_ENTRIES);
  assert.equal(merged[0].id, 'v59');
  for (let i = 1; i < merged.length; i += 1) {
    assert.ok(Date.parse(merged[i - 1].date) >= Date.parse(merged[i].date));
  }
});

test('merge never duplicates a video id', () => {
  const existing = [{ id: 'a', date: '2026-08-01T00:00:00Z', title: 'old' }];
  const incoming = [{ id: 'a', date: '2026-08-01T00:00:00Z', title: 'new' }];

  const merged = merge(existing, incoming);

  assert.equal(merged.length, 1);
  // Incoming wins: it is the fresher parse of the same video.
  assert.equal(merged[0].title, 'new');
});

test('merge keeps stored entries that this run did not see', () => {
  const existing = [{ id: 'a', date: '2026-08-01T00:00:00Z' }];
  const incoming = [{ id: 'b', date: '2026-08-02T00:00:00Z' }];

  assert.deepEqual(merge(existing, incoming).map((e) => e.id), ['b', 'a']);
});

test('rss entries are stamped with marks and species', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>Massive Shad at Umkomaas Beach</title>
    <published>2026-08-09T20:51:44+00:00</published>
    <media:description>A great day out. #Durban #KZNFishing</media:description>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS, GZ);

  // Coordinates come from data/gazetteer.json, which the user edits, so this
  // asserts what the parser decides -- not what the gazetteer happens to hold.
  assert.equal(entry.marks.length, 1);
  assert.equal(entry.marks[0].name, 'Umkomaas');
  assert.equal(entry.marks[0].region, 'south');
  assert.equal(entry.marks[0].where, 'title');
  assert.deepEqual(entry.species, ['Shad']);
});

test('a hashtag-only place does not become a mark on a stored entry', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>A good session</title>
    <published>2026-08-09T20:51:44+00:00</published>
    <media:description>Great day. #Durban #Umkomaas #Fishing</media:description>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS, GZ);

  assert.deepEqual(entry.marks, []);
});

test('entries parse with no gazetteer and store empty marks', () => {
  const xml = `<feed><entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <title>Shad at Umkomaas</title>
    <published>2026-08-09T20:51:44+00:00</published>
  </entry></feed>`;

  const [entry] = parseFeed(xml, KENTS, null);

  assert.deepEqual(entry.marks, []);
  assert.deepEqual(entry.species, []);
});

test('scraped entries are stamped from the title alone', () => {
  const video = {
    id: 'abcdefghijk', channel: "Pa's Xtreme Fishing", channelUrl: channelUrl(PAS.id),
    title: 'Monster Garrick at Winklespruit', link: watchUrl('abcdefghijk'),
  };
  const results = [{
    key: 'watch:abcdefghijk', ok: true, status: 200,
    body: '{"uploadDate":"2026-08-23T21:43:42-07:00"}', video,
  }];

  const { entries } = consume(results, [], CTX);

  assert.equal(entries[0].marks.length, 1);
  assert.equal(entries[0].marks[0].name, 'Winklespruit');
  assert.equal(entries[0].marks[0].where, 'title');
  assert.deepEqual(entries[0].species, ['Garrick']);
});

test('the real feed fixture yields at least one mark', () => {
  const entries = parseFeed(fixture('youtube-feed.xml'), KENTS, GZ);
  const withMarks = entries.filter((e) => e.marks.length);

  assert.ok(withMarks.length >= 1, 'expected at least one mark in the real feed');
});

test('merge re-stamps carried-over entries so gazetteer edits take effect', () => {
  // An entry stored before the gazetteer existed, or before it gained a mark.
  const stale = {
    id: 'aaaaaaaaaaa',
    channel: 'Kents Fishing',
    channelUrl: channelUrl(KENTS.id),
    title: 'Monster Garrick at Winklespruit',
    link: watchUrl('aaaaaaaaaaa'),
    date: '2026-08-20T00:00:00Z',
    description: null,
    via: 'rss',
  };

  const merged = merge([stale], [], CTX);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].marks.length, 1);
  assert.equal(merged[0].marks[0].name, 'Winklespruit');
  assert.equal(merged[0].marks[0].where, 'title');
  assert.deepEqual(merged[0].species, ['Garrick']);
});

test('merge re-stamps from the description too', () => {
  const stale = {
    id: 'aaaaaaaaaaa', channel: 'C', channelUrl: channelUrl(KENTS.id),
    title: 'A good day', link: watchUrl('aaaaaaaaaaa'),
    date: '2026-08-20T00:00:00Z', description: 'We fished Scottburgh today', via: 'rss',
  };

  const merged = merge([stale], [], CTX);

  assert.equal(merged[0].marks.length, 1);
  assert.equal(merged[0].marks[0].name, 'Scottburgh');
  assert.equal(merged[0].marks[0].where, 'body');
});

test('merge without a gazetteer leaves entries untouched', () => {
  const stored = {
    id: 'aaaaaaaaaaa', channel: 'C', channelUrl: channelUrl(KENTS.id),
    title: 'Shad at Umkomaas', link: watchUrl('aaaaaaaaaaa'),
    date: '2026-08-20T00:00:00Z', description: null, via: 'rss',
    marks: [{ name: 'Umkomaas', region: 'south', where: 'title' }], species: ['Shad'],
  };

  const merged = merge([stored], []);

  // No gazetteer means no opinion: whatever was stored survives.
  assert.deepEqual(merged[0].marks, [{ name: 'Umkomaas', region: 'south', where: 'title' }]);
});

test('the watch-page round is globally capped, not just per channel', () => {
  // Every channel fails its feed and every scraped video is unstored: the
  // worst case, and the one that would blow the workflow's 10-minute budget.
  const pages = CHANNELS.map((c) => ({
    key: `page:${c.id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: c,
  }));

  const { next } = consume(pages, [], CTX);

  assert.ok(next.length <= MAX_WATCH_LOOKUPS, `${next.length} watch requests, cap is ${MAX_WATCH_LOOKUPS}`);
  // The cap must still be enough to fill the stored window in one run.
  assert.ok(MAX_WATCH_LOOKUPS >= MAX_ENTRIES, 'cap must be able to fill the window');
});

test('the global cap does not starve a single-channel run', () => {
  const one = [{
    key: `page:${CHANNELS[0].id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: CHANNELS[0],
  }];

  const { next } = consume(one, [], CTX);

  assert.equal(next.length, SCRAPE_PER_CHANNEL);
});

test('the watch budget is shared round-robin, not spent on the first channels', () => {
  // Enough channels to exceed MAX_WATCH_LOOKUPS: 8 per channel x 8 channels =
  // 64 candidates against a budget of 40, so the cap really does bite. A naive
  // slice in channel order would hand the whole budget to the first five and
  // leave the last three with nothing.
  const chans = CHANNELS.slice(0, 8).map((c, i) => ({ name: `Channel ${i}`, id: c.id }));
  const pages = chans.map((c) => ({
    key: `page:${c.id}`, ok: true, status: 200,
    body: fixture('youtube-channel.html'), channel: c,
  }));

  const { next } = consume(pages, [], CTX);

  assert.equal(next.length, MAX_WATCH_LOOKUPS, 'the cap should bite here');
  const per = chans.map((c) => next.filter((r) => r.video.channel === c.name).length);
  assert.equal(per.filter((n) => n === 0).length, 0, `starved channels: ${JSON.stringify(per)}`);
  // Round-robin: no channel gets more than one extra over any other.
  assert.ok(Math.max(...per) - Math.min(...per) <= 1, `uneven split: ${JSON.stringify(per)}`);
});

test('a channel with few videos does not hold back the others', () => {
  const many = CHANNELS.slice(0, 7).map((c, i) => ({ name: `Many ${i}`, id: c.id }));
  const few = { name: 'Few', id: CHANNELS[7].id };
  const onePage = '"lockupMetadataViewModel":{"title":{"content":"Only video"},'
    + '"image":{}},"videoId":"zzzzzzzzzzz"';
  const pages = [
    { key: `page:${few.id}`, ok: true, status: 200, body: onePage, channel: few },
    ...many.map((c) => ({
      key: `page:${c.id}`, ok: true, status: 200,
      body: fixture('youtube-channel.html'), channel: c,
    })),
  ];

  const { next } = consume(pages, [], CTX);

  // The short channel contributes its one video and the rest of the budget
  // goes to the others rather than being left unspent.
  assert.equal(next.filter((r) => r.video.channel === 'Few').length, 1);
  assert.equal(next.length, MAX_WATCH_LOOKUPS);
});
