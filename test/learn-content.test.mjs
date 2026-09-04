import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARN, SECTIONS } from '../js/learn-content.js';

const KEYS = SECTIONS.map((s) => s.key);

test('every entry carries the fields the renderer reads', () => {
  for (const entry of LEARN) {
    assert.ok(entry.id, `missing id: ${JSON.stringify(entry)}`);
    assert.ok(entry.title, `missing title: ${entry.id}`);
    assert.ok(entry.blurb, `missing blurb: ${entry.id}`);
    assert.ok(entry.svg, `missing svg: ${entry.id}`);
    assert.ok(entry.svgAlt, `missing svgAlt: ${entry.id}`);
    assert.ok(entry.steps.length > 0, `no steps: ${entry.id}`);
    assert.ok(KEYS.includes(entry.section), `bad section: ${entry.id}`);
  }
});

test('entry ids are unique, since they become element ids', () => {
  const ids = LEARN.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('both sections have content, so neither renders as an empty heading', () => {
  for (const key of KEYS) {
    assert.ok(LEARN.some((e) => e.section === key), `empty section: ${key}`);
  }
});

test('no diagram carries script, handler or javascript: content', () => {
  // ui-learn.js assigns svg via innerHTML. That is safe only while these
  // strings stay author-written constants. This test is that invariant.
  for (const entry of LEARN) {
    assert.ok(!/<script/i.test(entry.svg), `script in ${entry.id}`);
    assert.ok(!/javascript:/i.test(entry.svg), `javascript: in ${entry.id}`);
    assert.ok(!/\son\w+\s*=/i.test(entry.svg), `event handler in ${entry.id}`);
  }
});

test('every diagram is a scalable svg', () => {
  for (const entry of LEARN) {
    assert.ok(entry.svg.trimStart().startsWith('<svg'), `not an svg: ${entry.id}`);
    assert.ok(entry.svg.includes('viewBox'), `no viewBox: ${entry.id}`);
  }
});

test('diagrams use palette tokens rather than hardcoded hex', () => {
  for (const entry of LEARN) {
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(entry.svg), `hardcoded colour in ${entry.id}`);
  }
});
