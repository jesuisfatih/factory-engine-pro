import assert from 'node:assert/strict';
import test from 'node:test';
import { existingTranscriptSyncAction } from './aircall.service.js';

test('normal sync queues a stored transcript only when it has never entered analysis', () => {
  assert.equal(existingTranscriptSyncAction({
    transcriptRaw: 'Customer asked for a callback.',
    resolverQueuedAt: null,
    resolverStatus: null,
    resolvedAt: null,
  }), 'queue');
});

test('normal sync does not spend tokens again for resolved, pending, or failed transcripts', () => {
  const transcriptRaw = 'Customer asked for a callback.';
  assert.equal(existingTranscriptSyncAction({
    transcriptRaw,
    resolverQueuedAt: new Date('2026-08-06T12:00:00.000Z'),
    resolverStatus: 'queued',
    resolvedAt: null,
  }), 'skip');
  assert.equal(existingTranscriptSyncAction({
    transcriptRaw,
    resolverQueuedAt: new Date('2026-08-06T12:00:00.000Z'),
    resolverStatus: 'succeeded',
    resolvedAt: new Date('2026-08-06T12:01:00.000Z'),
  }), 'skip');
  assert.equal(existingTranscriptSyncAction({
    transcriptRaw,
    resolverQueuedAt: null,
    resolverStatus: 'failed',
    resolvedAt: null,
  }), 'skip');
});
