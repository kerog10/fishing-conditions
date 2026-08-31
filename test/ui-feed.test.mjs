import { test } from 'node:test';
import assert from 'node:assert/strict';

// js/ui-feed.js is DOM-only (per its own header comment) and this project
// takes no dependencies, so there is no jsdom to reach for. A minimal stub
// of the handful of DOM primitives the module actually calls -- createElement,
// appendChild, replaceChildren, className/textContent/href/target/rel
// assignment -- is enough to exercise it under plain node --test.
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

const { renderFeedCard } = await import('../js/ui-feed.js');

const baseEntry = () => ({
  id: 30568,
  date: '2026-08-27T14:21:53Z',
  title: 'KZN Fishing Report (27 August 2026)',
  excerpt: 'Some report text…',
  link: 'https://www.kingfisher.co.za/kzn-fishing-report-27-august-2026/',
});

test('a valid https link renders a card that links out', () => {
  const target = makeElement('section');
  renderFeedCard(target, baseEntry());

  assert.equal(target.hidden, false);
  assert.equal(target.children.length, 1);
});

test('a javascript: link does not render a card at all', () => {
  const target = makeElement('section');
  const entry = { ...baseEntry(), link: 'javascript:alert(1)' };

  renderFeedCard(target, entry);

  assert.equal(target.hidden, true, 'an entry with an unsafe link should be treated as no card');
  assert.equal(target.children.length, 0);
});

test('a non-URL link string does not render a card', () => {
  const target = makeElement('section');
  const entry = { ...baseEntry(), link: 'not a url' };

  renderFeedCard(target, entry);

  assert.equal(target.hidden, true);
  assert.equal(target.children.length, 0);
});

test('an http (not just https) link still renders', () => {
  const target = makeElement('section');
  const entry = { ...baseEntry(), link: 'http://www.kingfisher.co.za/some-report/' };

  renderFeedCard(target, entry);

  assert.equal(target.hidden, false);
  assert.equal(target.children.length, 1);
});

test('no entry still renders no card', () => {
  const target = makeElement('section');
  renderFeedCard(target, null);

  assert.equal(target.hidden, true);
  assert.equal(target.children.length, 0);
});
