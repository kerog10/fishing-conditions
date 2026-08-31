import { test } from 'node:test';
import assert from 'node:assert/strict';

// js/ui-videos.js is DOM-only and this project takes no dependencies, so
// there is no jsdom to reach for. A minimal stub of the handful of DOM
// primitives the module actually calls is enough under plain node --test.
// This mirrors test/ui-feed.test.mjs.
function makeElement(tag) {
  return {
    tagName: tag,
    className: '',
    textContent: undefined,
    href: undefined,
    target: undefined,
    rel: undefined,
    hidden: false,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren() {
      this.children = [];
    },
  };
}

globalThis.document = { createElement: makeElement };

const { renderVideoList } = await import('../js/ui-videos.js');

const NOW = new Date('2026-08-31T08:00:00Z');

const video = (id, overrides = {}) => ({
  id,
  channel: 'Kents Fishing',
  channelUrl: 'https://www.youtube.com/channel/UC1QUL3Z5Ho7_Y0M562eqb8Q',
  title: `Video ${id}`,
  link: `https://www.youtube.com/watch?v=${id}`,
  date: '2026-08-30T00:00:00Z',
  description: null,
  via: 'scrape',
  ...overrides,
});

const flatten = (node) => [node, ...node.children.flatMap(flatten)];

test('an empty list hides the section entirely', () => {
  const target = makeElement('section');

  renderVideoList(target, [], NOW);

  assert.equal(target.hidden, true);
  assert.equal(target.children.length, 0);
});

test('a populated list is shown', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa')], NOW);

  assert.equal(target.hidden, false);
  assert.ok(target.children.length > 0);
});

test('every row links out safely', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa')], NOW);

  const links = flatten(target).filter((n) => n.tagName === 'a');
  assert.ok(links.length > 0, 'expected at least one link');
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('the row shows the channel, the title and a date', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa', { title: 'Shad at Umkomaas' })], NOW);

  const texts = flatten(target).map((n) => n.textContent).filter(Boolean);
  assert.ok(texts.includes('Kents Fishing'), `channel missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.includes('Shad at Umkomaas'), `title missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /Aug|Today|Tomorrow/.test(t)), `no date in ${JSON.stringify(texts)}`);
});

test('a row whose link is not http is dropped', () => {
  const target = makeElement('section');

  renderVideoList(target, [video('aaaaaaaaaaa', { link: 'javascript:alert(1)' })], NOW);

  assert.equal(target.hidden, true);
});

test('one unsafe row does not suppress the safe ones', () => {
  const target = makeElement('section');

  renderVideoList(target, [
    video('aaaaaaaaaaa', { link: 'javascript:alert(1)' }),
    video('bbbbbbbbbbb', { title: 'Safe one' }),
  ], NOW);

  assert.equal(target.hidden, false);
  const texts = flatten(target).map((n) => n.textContent).filter(Boolean);
  assert.ok(texts.includes('Safe one'));
});

test('rendering twice does not duplicate rows', () => {
  const target = makeElement('section');
  const list = [video('aaaaaaaaaaa')];

  renderVideoList(target, list, NOW);
  const first = flatten(target).length;
  renderVideoList(target, list, NOW);

  assert.equal(flatten(target).length, first);
});

test('a null list is treated as empty', () => {
  const target = makeElement('section');

  renderVideoList(target, null, NOW);

  assert.equal(target.hidden, true);
});
