import { test } from 'node:test';
import assert from 'node:assert/strict';

// Same zero-dependency DOM stub as test/ui-hotspots.test.mjs, plus innerHTML
// and setAttribute -- the diagrams need both.
function makeElement(tag) {
  return {
    tagName: tag, className: '', textContent: undefined, innerHTML: '',
    hidden: false, children: [], attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
  };
}

globalThis.document = { createElement: makeElement };

const { renderLearn } = await import('../js/ui-learn.js');

const flatten = (node) => [node, ...node.children.flatMap(flatten)];
const textsOf = (node) => flatten(node).map((n) => n.textContent).filter(Boolean);

const SECTIONS = [
  { key: 'water', title: 'Reading the water' },
  { key: 'knots', title: 'Knots and traces' },
];

const entry = (over = {}) => ({
  id: 'rip-currents',
  section: 'water',
  title: 'Rip currents',
  blurb: 'A river of water running back out.',
  svg: '<svg viewBox="0 0 320 200"></svg>',
  svgAlt: 'A beach seen from above.',
  steps: ['Look for a gap.', 'It looks darker.'],
  note: null,
  ...over,
});

test('every entry contributes a heading and its steps', () => {
  const target = makeElement('section');

  renderLearn(target, [entry()], SECTIONS);

  const texts = textsOf(target);
  assert.ok(texts.includes('Rip currents'));
  assert.ok(texts.includes('Look for a gap.'));
  assert.ok(texts.includes('It looks darker.'));
});

test('section headings appear once each, in the given order', () => {
  const target = makeElement('section');

  renderLearn(target, [entry(), entry({ id: 'uni', section: 'knots' })], SECTIONS);

  const texts = textsOf(target);
  assert.deepEqual(
    texts.filter((t) => t === 'Reading the water' || t === 'Knots and traces'),
    ['Reading the water', 'Knots and traces'],
  );
});

test('a section with no entries renders no heading at all', () => {
  const target = makeElement('section');

  renderLearn(target, [entry()], SECTIONS);

  assert.ok(!textsOf(target).includes('Knots and traces'));
});

test('the diagram goes in as markup and carries its label', () => {
  const target = makeElement('section');

  renderLearn(target, [entry()], SECTIONS);

  const figure = flatten(target).find((n) => n.className === 'guide-diagram');
  assert.ok(figure.innerHTML.startsWith('<svg'));
  assert.equal(figure.attributes.role, 'img');
  assert.equal(figure.attributes['aria-label'], 'A beach seen from above.');
});

test('a note renders when present and adds nothing when absent', () => {
  const withNote = makeElement('section');
  const without = makeElement('section');

  renderLearn(withNote, [entry({ note: { kind: 'safety', text: 'Swim parallel.' } })], SECTIONS);
  renderLearn(without, [entry()], SECTIONS);

  assert.ok(textsOf(withNote).includes('Swim parallel.'));
  assert.equal(flatten(without).filter((n) => n.className?.startsWith('guide-note')).length, 0);
});

test('steps are an ordered list for knots and unordered for water cues', () => {
  const water = makeElement('section');
  const knots = makeElement('section');

  renderLearn(water, [entry()], SECTIONS);
  renderLearn(knots, [entry({ id: 'uni', section: 'knots' })], SECTIONS);

  assert.ok(flatten(water).some((n) => n.tagName === 'ul'));
  assert.ok(flatten(knots).some((n) => n.tagName === 'ol'));
});

test('rendering twice does not duplicate content', () => {
  const target = makeElement('section');

  renderLearn(target, [entry()], SECTIONS);
  renderLearn(target, [entry()], SECTIONS);

  assert.equal(textsOf(target).filter((t) => t === 'Rip currents').length, 1);
});
