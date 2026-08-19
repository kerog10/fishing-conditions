import { test } from 'node:test';
import assert from 'node:assert/strict';
import SunCalc from '../vendor/suncalc.mjs';

test('vendored SunCalc exposes the methods we depend on', () => {
  assert.equal(typeof SunCalc.getMoonPosition, 'function');
  assert.equal(typeof SunCalc.getMoonIllumination, 'function');
  assert.equal(typeof SunCalc.getMoonTimes, 'function');
  assert.equal(typeof SunCalc.getTimes, 'function');
});

test('SunCalc computes a plausible moon altitude for Durban', () => {
  const pos = SunCalc.getMoonPosition(new Date('2026-08-19T12:00:00Z'), -29.85, 31.05);
  assert.equal(typeof pos.altitude, 'number');
  assert.ok(pos.altitude >= -Math.PI / 2 && pos.altitude <= Math.PI / 2);
});
