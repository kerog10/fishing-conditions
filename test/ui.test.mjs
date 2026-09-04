import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setStatus } from '../js/ui.js';

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
