import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setStatus, renderHero, renderWindows } from '../js/ui.js';

function makeStatusElement() {
  const classes = new Set();
  return {
    textContent: '',
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
      },
      contains(name) { return classes.has(name); },
    },
  };
}

test('setStatus adds status.loading when isLoading is true', () => {
  const target = makeStatusElement();
  setStatus(target, 'Loading forecast…', false, true);
  assert.equal(target.classList.contains('loading'), true);
  assert.equal(target.classList.contains('error'), false);
});

test('setStatus clears status.loading once loading ends', () => {
  const target = makeStatusElement();
  setStatus(target, 'Loading forecast…', false, true);
  setStatus(target, 'Ready', false, false);
  assert.equal(target.classList.contains('loading'), false);
});

test('setStatus still supports the 2 and 3-argument forms unchanged', () => {
  const target = makeStatusElement();
  setStatus(target, 'plain message');
  assert.equal(target.textContent, 'plain message');
  assert.equal(target.classList.contains('error'), false);
  assert.equal(target.classList.contains('loading'), false);
  setStatus(target, 'an error', true);
  assert.equal(target.classList.contains('error'), true);
});

// --- hero card --------------------------------------------------------------
// Minimal DOM stub, same approach as test/ui-hotspots.test.mjs, plus recorded
// listeners so the empty state's button can actually be exercised.
function makeNode(tag = 'div') {
  const classes = new Set();
  return {
    tagName: tag.toUpperCase(),
    children: [],
    listeners: {},
    textContent: '',
    className: '',
    classList: {
      add: (...n) => n.forEach((x) => classes.add(x)),
      remove: (...n) => n.forEach((x) => classes.delete(x)),
      contains: (n) => classes.has(n),
    },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}

function installDom() {
  globalThis.document = { createElement: (tag) => makeNode(tag) };
}

const heroText = (node) => [node.textContent, ...node.children.map(heroText)].join(' ').trim();

const findByTag = (node, tag) => (node.tagName === tag ? node
  : node.children.map((c) => findByTag(c, tag)).find(Boolean));

const SUMMARY = {
  score: 68,
  wind: { speed: 19, direction: 200 },
  tide: { state: 'rising', height: 1.2, nextTurn: { type: 'high', time: new Date('2026-09-07T14:20:00Z') } },
  swell: { height: 1.6, period: 11 },
  nextWindow: { start: new Date('2026-09-08T05:30:00Z'), end: new Date('2026-09-08T08:00:00Z'), score: 74 },
};

test('the hero leads with the score and its band', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY, { now: new Date('2026-09-07T09:00:00Z') });

  assert.match(heroText(target), /68/);
  assert.equal(target.classList.contains('band-good'), true);
});

test('the hero shows wind in km/h, matching the rest of the app', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY, { now: new Date('2026-09-07T09:00:00Z') });

  assert.match(heroText(target), /19 km\/h/);
  assert.doesNotMatch(heroText(target), /\bkt\b/);
});

test('the hero reports swell and the tide state', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY, { now: new Date('2026-09-07T09:00:00Z') });
  const out = heroText(target);

  assert.match(out, /1\.6 m/);
  assert.match(out, /rising/i);
  assert.match(out, /14:20/);
});

test('a missing reading renders a dash rather than null or NaN', () => {
  installDom();
  const target = makeNode();

  renderHero(target, {
    score: 41,
    wind: { speed: null, direction: null },
    tide: { state: null, height: null, nextTurn: null },
    swell: { height: null, period: null },
    nextWindow: null,
  }, { now: new Date('2026-09-07T09:00:00Z') });

  assert.doesNotMatch(heroText(target), /null|NaN|undefined/);
});

test('with no spot the hero offers a way to pick one', () => {
  installDom();
  const target = makeNode();
  let asked = 0;

  renderHero(target, null, { onPickSpot: () => { asked += 1; } });

  assert.match(heroText(target), /pick a spot/i);
  const button = findByTag(target, 'BUTTON');
  assert.ok(button, 'the empty state needs an actionable control, not just text');
  button.listeners.click();
  assert.equal(asked, 1, 'the button must open the map disclosure');
});

test('a summary with no score is treated as no spot', () => {
  installDom();
  const target = makeNode();

  renderHero(target, { score: null, wind: {}, tide: {}, swell: {}, nextWindow: null });

  assert.match(heroText(target), /pick a spot/i);
});

test('re-rendering clears the previous band rather than stacking bands', () => {
  installDom();
  const target = makeNode();

  renderHero(target, SUMMARY, { now: new Date('2026-09-07T09:00:00Z') });
  renderHero(target, { ...SUMMARY, score: 12 }, { now: new Date('2026-09-07T09:00:00Z') });

  assert.equal(target.classList.contains('band-good'), false);
  assert.equal(target.classList.contains('band-poor'), true);
});

test('window cards render their metrics line', () => {
  // renderWindows had no coverage at all, so deleting a helper it depended on
  // left the whole suite green while the page threw on load.
  installDom();
  const target = makeNode();

  renderWindows(target, [{
    start: new Date('2026-09-08T05:30:00Z'),
    end: new Date('2026-09-08T08:00:00Z'),
    meanFinal: 71,
    meanBite: 71,
    minComfort: 0.9,
    reasons: ['Light offshore wind'],
    hours: [{ windSpeed: 12, windDirection: 200, swellHeight: 1.4, swellPeriod: 10, pressure: 1016 }],
  }], new Date('2026-09-07T09:00:00Z'));

  const out = heroText(target);
  assert.match(out, /12 km\/h/);
  assert.match(out, /1\.4 m swell @ 10s/);
  assert.match(out, /1016 hPa/);
});

test('no windows renders a message rather than an empty panel', () => {
  installDom();
  const target = makeNode();

  renderWindows(target, [], new Date('2026-09-07T09:00:00Z'));

  assert.match(heroText(target), /No windows above the threshold/);
});
