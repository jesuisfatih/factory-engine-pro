import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedPositiveInt } from './ai-runtime-config.js';

test('uses the configured fallback when the environment value is absent or blank', () => {
  assert.equal(boundedPositiveInt(undefined, 80_000, { min: 12_000, max: 160_000 }), 80_000);
  assert.equal(boundedPositiveInt('  ', 2_400, { min: 2_000, max: 4_096 }), 2_400);
});

test('accepts integers and clamps them to the supported range', () => {
  assert.equal(boundedPositiveInt('45000', 15_000, { min: 1_000, max: 120_000 }), 45_000);
  assert.equal(boundedPositiveInt('10', 2_400, { min: 2_000, max: 4_096 }), 2_000);
  assert.equal(boundedPositiveInt('9000', 2_400, { min: 2_000, max: 4_096 }), 4_096);
});

test('uses the fallback for malformed values', () => {
  assert.equal(boundedPositiveInt('not-a-number', 45_000, { min: 1_000, max: 120_000 }), 45_000);
  assert.equal(boundedPositiveInt('12.5', 2_400, { min: 2_000, max: 4_096 }), 2_400);
});
