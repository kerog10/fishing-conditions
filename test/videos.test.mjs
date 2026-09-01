import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadVideos, pickVideos } from '../js/videos.js';
import { CONFIG } from '../js/config.js';

const video = (id, channel, date) => ({
  id,
  channel,
  channelUrl: 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q',
  title: `Video ${id}`,
  link: `https://www.youtube.com/watch?v=${id}`,
  date,
  description: null,
  via: 'scrape',
});

test('videos are returned newest first', () => {
  const feed = {
    entries: [
      video('aaaaaaaaaaa', 'A', '2026-08-01T00:00:00Z'),
      video('bbbbbbbbbbb', 'B', '2026-08-20T00:00:00Z'),
    ],
  };

  assert.deepEqual(pickVideos(feed).map((v) => v.id), ['bbbbbbbbbbb', 'aaaaaaaaaaa']);
});

test('no more than perChannel videos come from one channel', () => {
  const entries = Array.from({ length: 6 }, (_, i) =>
    video(`aaaaaaaaaa${i}`, 'Loud Channel', `2026-08-2${i}T00:00:00Z`));

  const picked = pickVideos({ entries });

  assert.equal(picked.length, CONFIG.videos.perChannel);
});

test('the per-channel cap keeps a quieter channel on the list', () => {
  const entries = [
    video('aaaaaaaaaa1', 'Loud', '2026-08-28T00:00:00Z'),
    video('aaaaaaaaaa2', 'Loud', '2026-08-27T00:00:00Z'),
    video('aaaaaaaaaa3', 'Loud', '2026-08-26T00:00:00Z'),
    video('bbbbbbbbbb1', 'Quiet', '2026-08-01T00:00:00Z'),
  ];

  const picked = pickVideos({ entries });

  // The Loud channel's third video is displaced even though it is newer.
  assert.deepEqual(picked.map((v) => v.id), ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'bbbbbbbbbb1']);
});

test('the per-channel cap keeps the newest from that channel', () => {
  const entries = [
    video('aaaaaaaaaa1', 'Loud', '2026-08-01T00:00:00Z'),
    video('aaaaaaaaaa2', 'Loud', '2026-08-28T00:00:00Z'),
    video('aaaaaaaaaa3', 'Loud', '2026-08-27T00:00:00Z'),
  ];

  assert.deepEqual(pickVideos({ entries }).map((v) => v.id), ['aaaaaaaaaa2', 'aaaaaaaaaa3']);
});

test('the total cap applies after the per-channel cap', () => {
  const entries = [];
  for (let c = 0; c < 7; c += 1) {
    for (let v = 0; v < 3; v += 1) {
      entries.push(video(`c${c}v${v}aaaaaaa`, `Channel ${c}`, `2026-08-1${v}T00:00:00Z`));
    }
  }

  assert.equal(pickVideos({ entries }).length, CONFIG.videos.max);
});

test('there is no staleness cutoff -- old footage is still useful', () => {
  const entries = [video('aaaaaaaaaaa', 'A', '2024-01-01T00:00:00Z')];

  assert.equal(pickVideos({ entries }).length, 1);
});

test('entries missing a link, title or parseable date are dropped', () => {
  const entries = [
    { ...video('aaaaaaaaaaa', 'A', '2026-08-01T00:00:00Z'), link: undefined },
    { ...video('bbbbbbbbbbb', 'B', '2026-08-01T00:00:00Z'), title: '' },
    { ...video('ccccccccccc', 'C', 'not a date') },
    video('ddddddddddd', 'D', '2026-08-01T00:00:00Z'),
  ];

  assert.deepEqual(pickVideos({ entries }).map((v) => v.id), ['ddddddddddd']);
});

test('a malformed or empty feed yields no rows rather than throwing', () => {
  assert.deepEqual(pickVideos(null), []);
  assert.deepEqual(pickVideos({}), []);
  assert.deepEqual(pickVideos({ entries: 'nonsense' }), []);
  assert.deepEqual(pickVideos({ entries: [] }), []);
});

test('a missing file loads as null instead of throwing', async () => {
  const missing = async () => ({ ok: false, status: 404 });

  assert.equal(await loadVideos(missing), null);
});

test('a malformed file loads as null instead of throwing', async () => {
  const malformed = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } });

  assert.equal(await loadVideos(malformed), null);
});

test('a network failure loads as null instead of throwing', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };

  assert.equal(await loadVideos(offline), null);
});

test('loadVideos reads the configured path', async () => {
  let asked = null;
  const spy = async (url) => {
    asked = url;
    return { ok: true, json: async () => ({ entries: [] }) };
  };

  await loadVideos(spy);

  assert.equal(asked, CONFIG.videos.path);
});
