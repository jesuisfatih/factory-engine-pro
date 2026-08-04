import assert from 'node:assert/strict';
import test from 'node:test';
import { businessDayRange } from './business-time.js';

test('America/Chicago business day follows standard time', () => {
  const range = businessDayRange('America/Chicago', new Date('2026-01-15T12:00:00.000Z'));
  assert.equal(range.localDate, '2026-01-15');
  assert.equal(range.start.toISOString(), '2026-01-15T06:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-01-16T06:00:00.000Z');
});

test('America/Chicago business day follows daylight time', () => {
  const range = businessDayRange('America/Chicago', new Date('2026-07-15T12:00:00.000Z'));
  assert.equal(range.localDate, '2026-07-15');
  assert.equal(range.start.toISOString(), '2026-07-15T05:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-07-16T05:00:00.000Z');
});

test('America/Chicago spring transition produces a 23 hour business day', () => {
  const range = businessDayRange('America/Chicago', new Date('2026-03-08T18:00:00.000Z'));
  assert.equal(range.start.toISOString(), '2026-03-08T06:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-03-09T05:00:00.000Z');
  assert.equal(range.end.getTime() - range.start.getTime(), 23 * 60 * 60 * 1000);
});

test('America/Chicago fall transition produces a 25 hour business day', () => {
  const range = businessDayRange('America/Chicago', new Date('2026-11-01T18:00:00.000Z'));
  assert.equal(range.start.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-11-02T06:00:00.000Z');
  assert.equal(range.end.getTime() - range.start.getTime(), 25 * 60 * 60 * 1000);
});
