import { test } from 'node:test';
import assert from 'node:assert/strict';

// Same zero-dependency DOM stub as test/ui-videos.test.mjs -- this project
// takes no dependencies, so there is no jsdom to reach for.
function makeElement(tag) {
  return {
    tagName: tag, className: '', textContent: undefined, href: undefined,
    target: undefined, rel: undefined, hidden: false, children: [],
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
  };
}

globalThis.document = { createElement: makeElement };

const { renderHotspots } = await import('../js/ui-hotspots.js');

const NOW = new Date('2026-09-01T08:00:00Z');
const flatten = (node) => [node, ...node.children.flatMap(flatten)];
const textsOf = (node) => flatten(node).map((n) => n.textContent).filter(Boolean);

const hotspot = (over = {}) => ({
  name: 'Umkomaas',
  region: 'south',
  count: 2,
  species: ['Garrick', 'Shad'],
  videos: [
    { id: 'a', title: 'Shad at Umkomaas', link: 'https://www.youtube.com/watch?v=a', date: '2026-08-30T00:00:00Z', channel: 'Kents Fishing' },
  ],
  report: null,
  ...over,
});

test('an empty list hides the section entirely', () => {
  const target = makeElement('section');

  renderHotspots(target, [], NOW);

  assert.equal(target.hidden, true);
  assert.equal(target.children.length, 0);
});

test('a null list is treated as empty', () => {
  const target = makeElement('section');

  renderHotspots(target, null, NOW);

  assert.equal(target.hidden, true);
});

test('a hotspot row shows the mark, the count and the species', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot()], NOW);

  assert.equal(target.hidden, false);
  const texts = textsOf(target);
  assert.ok(texts.includes('Umkomaas'), `mark missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /2 videos/.test(t)), `count missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /Garrick/.test(t) && /Shad/.test(t)), 'species missing');
});

test('a single video reads "1 video", not "1 videos"', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({ count: 1 })], NOW);

  assert.ok(textsOf(target).some((t) => /\b1 video\b/.test(t)), 'expected singular');
});

test('every link opens safely in a new tab', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({
    report: { species: ['Kob'], link: 'https://www.kingfisher.co.za/r/', date: '2026-08-27T00:00:00Z' },
  })], NOW);

  const links = flatten(target).filter((n) => n.tagName === 'a');
  assert.ok(links.length >= 2, 'expected a video link and a report link');
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('the regional line is attributed to Kingfisher, not to the mark', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({
    report: { species: ['Kob'], link: 'https://www.kingfisher.co.za/r/', date: '2026-08-27T00:00:00Z' },
  })], NOW);

  const texts = textsOf(target);
  assert.ok(
    texts.some((t) => /Kingfisher/i.test(t) && /South Coast/i.test(t)),
    `expected an attributed regional line in ${JSON.stringify(texts)}`,
  );
});

test('a hotspot with no report line renders without one', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({ report: null })], NOW);

  assert.equal(textsOf(target).some((t) => /Kingfisher/i.test(t)), false);
});

test('a video row with an unsafe link is dropped', () => {
  const target = makeElement('section');

  renderHotspots(target, [hotspot({
    videos: [{ id: 'a', title: 'Bad', link: 'javascript:alert(1)', date: '2026-08-30T00:00:00Z', channel: 'X' }],
  })], NOW);

  assert.equal(textsOf(target).includes('Bad'), false);
});

test('rendering twice does not duplicate rows', () => {
  const target = makeElement('section');
  const rows = [hotspot()];

  renderHotspots(target, rows, NOW);
  const first = flatten(target).length;
  renderHotspots(target, rows, NOW);

  assert.equal(flatten(target).length, first);
});
