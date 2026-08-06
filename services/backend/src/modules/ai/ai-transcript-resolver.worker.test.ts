import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import { AiTranscriptResolverWorker } from './ai-transcript-resolver.worker.js';

test('a model failure records failed state and never evaluates workflow rules', async () => {
  const updates: Array<Record<string, unknown>> = [];
  let ruleFireCount = 0;
  const callEvent = {
    id: 'acev_model_failure',
    tenantId: 'ten_test',
    externalCallId: 'call_model_failure',
    eventType: 'call.ended',
    eventTimestamp: new Date('2026-08-06T12:00:00.000Z'),
    direction: 'inbound',
    durationSeconds: 45,
    aircallUserId: 'air_user_1',
    contactPhone: '+13125550100',
    contactPhoneE164: '+13125550100',
    contactEmail: 'customer@example.com',
    transcriptRaw: 'Customer: Please call me tomorrow about the pending order. Agent: I will follow up.',
    transcriptSource: 'aircall_payload',
    transcriptPulledAt: new Date('2026-08-06T12:00:01.000Z'),
    resolverOutput: null,
    resolverModel: null,
    resolverStatus: 'queued',
    resolverInputHash: null,
    resolverAttemptCount: 0,
    resolvedAt: null,
    resolvedWithVersion: null,
  };
  const prisma = {
    db: {
      aircallCallEvent: {
        findFirst: async () => callEvent,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { count: 1 };
        },
      },
    },
  };
  const worker = new AiTranscriptResolverWorker(
    null,
    { resolveTranscript: async () => { throw new Error('forced model failure'); } } as never,
    { fireTrigger: async () => { ruleFireCount += 1; } } as never,
    prisma as never,
    { require: () => ({ tenantId: 'ten_test' }) } as never,
    {} as never,
    { log() {}, warn() {}, error() {} } as never,
    { get: () => undefined } as never,
  );
  const job = {
    id: 'job_model_failure',
    data: { targetVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION },
    opts: { attempts: 1 },
    attemptsMade: 0,
  };

  const result = await (worker as unknown as {
    resolveCallEvent: (input: typeof job, callEventId: string) => Promise<{ status: string; error?: string }>;
  }).resolveCallEvent(job, callEvent.id);

  assert.equal(result.status, 'failed');
  assert.match(result.error ?? '', /forced model failure/);
  assert.equal(ruleFireCount, 0);
  assert.equal(updates.some((data) => data.resolverStatus === 'processing'), true);
  const failedUpdate = updates.find((data) => data.resolverStatus === 'failed');
  assert.ok(failedUpdate);
  assert.equal(failedUpdate.resolverModel, null);
  assert.equal(failedUpdate.resolvedAt, null);
  assert.equal(failedUpdate.resolvedWithVersion, null);
});
