import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comfortScore, linearScore } from '../js/score.js';
import { CONFIG } from '../js/config.js';

const CALM = { windSpeed: 8, windGusts: 12, swellHeight: 0.6, precipitation: 0 };

test('linearScore is 1 at ideal and 0 at worst', () => {
  assert.equal(linearScore(15, 15, 45), 1);
  assert.equal(linearScore(45, 15, 45), 0);
  assert.equal(linearScore(30, 15, 45), 0.5);
});

test('linearScore clamps outside the band', () => {
  assert.equal(linearScore(0, 15, 45), 1);
  assert.equal(linearScore(200, 15, 45), 0);
});

test('calm conditions score full comfort', () => {
  assert.equal(comfortScore(CALM).value, 1);
});

test('a gale is capped at the floor, not zero', () => {
  assert.equal(comfortScore({ ...CALM, windSpeed: 60, windGusts: 90 }).value, CONFIG.comfort.floor);
});

test('the worst single factor decides the multiplier', () => {
  assert.equal(comfortScore({ ...CALM, swellHeight: 3.5 }).value, CONFIG.comfort.floor);
});

test('bad conditions are explained', () => {
  const { reasons } = comfortScore({ ...CALM, windSpeed: 50 });
  assert.ok(reasons.some((r) => /wind/i.test(r)), reasons.join('; '));
});

test('missing swell does not penalise an inland spot', () => {
  const inland = { windSpeed: 8, windGusts: 12, swellHeight: null, precipitation: 0 };
  assert.equal(comfortScore(inland).value, 1);
});
