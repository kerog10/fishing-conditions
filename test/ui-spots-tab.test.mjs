import { test } from 'node:test';
import assert from 'node:assert/strict';

// The same zero-dependency DOM stub the other ui-* tests use. This module also
// attaches listeners and sets attributes, so the stub covers those too.
function makeElement(tag) {
  return {
    tagName: tag, className: '', textContent: undefined, type: undefined,
    title: undefined, hidden: false, children: [], attributes: {}, listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

globalThis.document = { createElement: makeElement };

const { renderSpotsTab } = await import('../js/ui-spots-tab.js');

const handlers = { onOpen() {}, onRemove() {}, onClearAll() {} };

const card = (over = {}) => ({
  spot: { id: 's1', name: 'Umkomaas', lat: -30.2064, lon: 30.7961 },
  summary: {
    score: 72,
    tide: { state: 'rising', height: 1.2, nextTurn: null },
    wind: { speed: 14, direction: 120 },
    nextWindow: null,
  },
  ...over,
});

const flatten = (node) => [node, ...node.children.flatMap(flatten)];
const textsOf = (node) => flatten(node).map((n) => n.textContent).filter(Boolean);

test('a card with no intel renders the lines it always did', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card()], handlers);

  const texts = textsOf(target);
  assert.ok(texts.includes('Umkomaas'), 'spot name missing');
  assert.ok(texts.some((t) => /rising/.test(t)), 'tide line missing');
  assert.ok(texts.some((t) => /km\/h/.test(t)), 'wind line missing');
  assert.equal(texts.some((t) => /recent video/.test(t)), false, 'unexpected intel line');
});

test('a card with intel gains one extra line', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card({
    intel: { name: 'Umkomaas', count: 3, species: ['Garrick', 'Shad'], distanceKm: 0.4 },
  })], handlers);

  const texts = textsOf(target);
  assert.ok(texts.some((t) => /3 recent videos/.test(t)), `intel line missing from ${JSON.stringify(texts)}`);
  assert.ok(texts.some((t) => /Garrick/.test(t) && /Shad/.test(t)), 'species missing');
});

test('the intel line does not displace the existing lines', () => {
  const plain = makeElement('div');
  const withIntel = makeElement('div');

  renderSpotsTab(plain, [card()], handlers);
  renderSpotsTab(withIntel, [card({
    intel: { name: 'Umkomaas', count: 1, species: ['Shad'], distanceKm: 0.4 },
  })], handlers);

  // Exactly one more node, and every original text still present.
  assert.equal(flatten(withIntel).length, flatten(plain).length + 1);
  for (const t of textsOf(plain)) {
    assert.ok(textsOf(withIntel).includes(t), `lost line: ${t}`);
  }
});

test('a single video reads "1 recent video"', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card({
    intel: { name: 'Umkomaas', count: 1, species: ['Shad'], distanceKm: 0.4 },
  })], handlers);

  assert.ok(textsOf(target).some((t) => /\b1 recent video\b/.test(t)), 'expected singular');
});

test('intel with no species still renders the count', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [card({
    intel: { name: 'Umkomaas', count: 2, species: [], distanceKm: 0.4 },
  })], handlers);

  assert.ok(textsOf(target).some((t) => /2 recent videos/.test(t)));
});

test('an empty card list still renders the empty state', () => {
  const target = makeElement('div');

  renderSpotsTab(target, [], handlers);

  assert.ok(textsOf(target).some((t) => /No spots saved/.test(t)));
});
