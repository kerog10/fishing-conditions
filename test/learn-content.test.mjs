import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('entry ids are unique, since they will become element ids', () => {
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

test('no interpolation, no imports, no fetch; fills/strokes stay on palette tokens; stroke-widths stay in the established grammar', async () => {
  const source = await readFile(new URL('../js/learn-content.js', import.meta.url), 'utf8');
  // Strip comments before scanning for keywords: the file's own header
  // comment mentions "no fetch" in prose, which is not a code dependency.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  assert.ok(!source.includes('${'), 'template interpolation found in learn-content.js');
  assert.ok(!/\bimport\b/.test(code), 'import keyword found in learn-content.js');
  assert.ok(!/\bfetch\b/.test(code), 'fetch keyword found in learn-content.js');

  const allowedStrokeWidths = new Set(['1', '1.5', '2', '3']);

  for (const entry of LEARN) {
    for (const match of entry.svg.matchAll(/\b(fill|stroke)="([^"]*)"/g)) {
      const [, attr, value] = match;
      assert.ok(
        value === 'none' || value.startsWith('var(--diagram-'),
        `off-palette ${attr}="${value}" in ${entry.id}`,
      );
    }
    for (const match of entry.svg.matchAll(/stroke-width="([^"]*)"/g)) {
      const [, value] = match;
      assert.ok(allowedStrokeWidths.has(value), `unexpected stroke-width="${value}" in ${entry.id}`);
    }
  }
});
