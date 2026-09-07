import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

export const SENTINEL = '/* === components: semantic tokens only below this line === */';

// Every custom property declared anywhere in the sheet, name -> raw value.
// Later declarations win, matching how the browser resolves them.
function declaredVars(text) {
  const out = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(text))) out.set(m[1], m[2].trim());
  return out;
}

// Follow var() chains down to a literal. A semantic token pointing at a name
// nobody defined is the failure this catches.
function resolve(vars, value, depth = 0) {
  assert.ok(depth < 10, `token reference cycle reaching ${value}`);
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value.trim());
  if (!m) return value.trim();
  const next = vars.get(m[1]);
  assert.ok(next !== undefined, `${m[1]} is referenced but never defined`);
  return resolve(vars, next, depth + 1);
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const pairs = h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g);
  const [r, g, b] = pairs.slice(0, 3).map((p) => {
    const c = parseInt(p, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SEMANTIC = [
  '--bg', '--surface', '--surface-sunk', '--line', '--line-strong',
  '--ink', '--ink-muted', '--ink-nontext', '--accent', '--accent-ink',
  '--score-excellent', '--score-good', '--score-fair', '--score-poor',
];

test('every semantic token resolves to a defined primitive', () => {
  const vars = declaredVars(css);
  for (const name of SEMANTIC) {
    const raw = vars.get(name);
    assert.ok(raw !== undefined, `${name} is not defined`);
    const literal = resolve(vars, raw);
    assert.match(literal, /^#[0-9a-f]{3,8}$/i, `${name} resolves to "${literal}", not a colour`);
  }
});

test('text tokens clear WCAG AA against the surfaces they sit on', () => {
  const vars = declaredVars(css);
  const lit = (n) => resolve(vars, vars.get(n));
  const surfaces = ['--surface', '--surface-sunk', '--bg'];
  const inks = [
    '--ink', '--ink-muted',
    '--score-excellent', '--score-good', '--score-fair', '--score-poor',
  ];

  for (const s of surfaces) {
    for (const i of inks) {
      const ratio = contrast(lit(i), lit(s));
      assert.ok(ratio >= 4.5, `${i} on ${s} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
    }
  }
});

test('accent ink is legible on the accent', () => {
  const vars = declaredVars(css);
  const lit = (n) => resolve(vars, vars.get(n));
  const ratio = contrast(lit('--accent-ink'), lit('--accent'));
  assert.ok(ratio >= 4.5, `--accent-ink on --accent is ${ratio.toFixed(2)}:1`);
});

test('--ink-nontext is deliberately excluded from the AA text set', () => {
  // It is a legitimate neutral that does NOT clear 4.5:1, which is exactly why
  // it must never be used as a colour. Task 2 adds the rule that enforces that.
  const vars = declaredVars(css);
  const lit = (n) => resolve(vars, vars.get(n));
  const ratio = contrast(lit('--ink-nontext'), lit('--surface'));
  assert.ok(ratio < 4.5, 'if this now passes AA, promote it and delete this test');
  assert.ok(ratio >= 3, `${ratio.toFixed(2)}:1 is too low even for icons and borders`);
});
