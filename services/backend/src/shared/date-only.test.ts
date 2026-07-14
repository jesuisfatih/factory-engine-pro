import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDateOnly, parseDateOnlyAtEndOfDay } from './date-only.js';

test('parses a valid calendar date at the end of the UTC day', () => {
  const parsed = parseDateOnlyAtEndOfDay('2028-02-29');
  assert.equal(parsed?.toISOString(), '2028-02-29T23:59:59.999Z');
  assert.equal(parsed ? formatDateOnly(parsed) : null, '2028-02-29');
});

test('rejects malformed and normalized calendar dates', () => {
  assert.equal(parseDateOnlyAtEndOfDay('2028-2-9'), null);
  assert.equal(parseDateOnlyAtEndOfDay('2027-02-29'), null);
  assert.equal(parseDateOnlyAtEndOfDay('2028-04-31'), null);
});
