import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';
import { AiTranscriptResolverWorker } from './ai-transcript-resolver.worker.js';

const actionableOutput = {
  customer_match: { customer_id: null, phone: '+13125550100', name_hint: 'Customer', confidence: 0.9 },
  product_mentions: [],
  psych_tags: ['follow_up'],
  call_intent: 'follow_up',
  shipping_signals: { address_mentioned: false, tracking_asked: false, complaint: false },
  payment_signals: { method_mentioned: false, refund_asked: false, complaint: false },
  urgency_signal: 'medium',
  conversation: {
    direction: 'inbound',
    kind: 'customer_conversation',
    customer_present: true,
    confidence: 0.95,
    evidence: [],
  },
  customer_mood: { label: 'calm', confidence: 0.8, evidence: [] },
  customer_issue: { detected: true, category: 'callback', description: 'Callback requested.', confidence: 0.9, evidence: [] },
  promise: { made: true, owner: 'agent', commitment: 'Call tomorrow.', due_hint: 'tomorrow', confidence: 0.9, evidence: [] },
  next_action: {
    required: true,
    owner: 'staff',
    action: 'Return the customer call.',
    expected_outcome: 'Confirm the pending request.',
    priority: 'medium',
    confidence: 0.9,
    evidence: [],
  },
  operational_signals: [{
    intent: 'callback_requested',
    confidence: 0.91,
    action_required: true,
    recommended_axis: 'account',
    reason: 'The customer requested a callback.',
    suggested_task_title: 'Return customer call',
  }],
  person_brief: {
    why_calling: 'The customer requested a callback.',
    upset_about: 'No complaint was captured.',
    call_goal: 'Confirm the pending request.',
    suggested_actions: ['Return the customer call.'],
    transcript_snippet: 'Please call me tomorrow.',
    direction: 'inbound',
    mood: 'calm',
    issue: 'Callback requested',
    promise: 'Call tomorrow',
    next_action: 'Return the customer call.',
    evidence: [],
  },
  competitor_mentioned: [],
  summary: 'Customer requested a callback.',
  language_detected: 'en',
  resolved_with_version: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
} satisfies TranscriptResolverOutput;

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

test('a workflow failure keeps the successful model result and fails the job for a workflow-only retry', async () => {
  const callUpdates: Array<Record<string, unknown>> = [];
  const evaluations: Array<Record<string, unknown>> = [];
  const callEvent = resolvedCallEvent({
    resolverOutput: null,
    resolverModel: null,
    resolverStatus: 'queued',
    resolvedAt: null,
    resolvedWithVersion: null,
  });
  const prisma = resolverPrisma(callEvent, callUpdates, evaluations, []);
  const worker = new AiTranscriptResolverWorker(
    null,
    {
      resolveTranscript: async () => ({
        output: actionableOutput,
        model: 'claude-haiku-4-5',
        promptKey: 'ai.transcript-resolver',
        inputHash: 'input_hash',
        usage: { inputTokens: 100, outputTokens: 50 },
        costMicros: 10,
        repaired: false,
        latencyMs: 20,
      }),
    } as never,
    { fireTrigger: async () => { throw new Error('forced task transaction failure'); } } as never,
    prisma as never,
    { require: () => ({ tenantId: 'ten_test' }) } as never,
    { findCustomer: async () => null } as never,
    { log() {}, warn() {}, error() {} } as never,
    { get: () => undefined } as never,
  );
  const job = resolverJob();

  await assert.rejects(
    (worker as unknown as { resolveCallEvent: (input: typeof job, callEventId: string) => Promise<unknown> })
      .resolveCallEvent(job, callEvent.id),
    /forced task transaction failure/,
  );

  assert.equal(callUpdates.some((data) => data.resolverStatus === 'succeeded' && data.resolverOutput === actionableOutput), true);
  assert.equal(callUpdates.some((data) => data.resolverStatus === 'failed'), false);
  assert.equal(evaluations.some((data) => data.status === 'failed'), true);
});

test('a stored model result automatically repairs failed workflow evaluations without another model call', async () => {
  const callUpdates: Array<Record<string, unknown>> = [];
  const evaluations: Array<Record<string, unknown>> = [];
  const fireInputs: Array<Record<string, unknown>> = [];
  let modelCalls = 0;
  const callEvent = resolvedCallEvent();
  const prisma = resolverPrisma(callEvent, callUpdates, evaluations, [{ status: 'failed' }]);
  const worker = new AiTranscriptResolverWorker(
    null,
    { resolveTranscript: async () => { modelCalls += 1; throw new Error('model must not run'); } } as never,
    {
      fireTrigger: async (input: Record<string, unknown>) => {
        fireInputs.push(input);
        return {
          eventId: String(input.eventId),
          trigger: 'call.operational_signal.detected',
          source: 'transcript-operational-signal',
          matchedRules: 1,
          evaluatedRules: 1,
          tasksCreated: 1,
          tasks: [{ ruleId: 'wrule_1', ruleName: 'Callback', actionId: 'create_task', action: 'create_task', taskId: 'swi_1', title: 'Return customer call' }],
          results: [{ ruleId: 'wrule_1', ruleName: 'Callback', status: 'task_created', executionMode: 'active', taskIds: ['swi_1'] }],
          checkedAt: new Date().toISOString(),
        };
      },
    } as never,
    prisma as never,
    { require: () => ({ tenantId: 'ten_test' }) } as never,
    { findCustomer: async () => null } as never,
    { log() {}, warn() {}, error() {} } as never,
    { get: () => undefined } as never,
  );
  const job = resolverJob();

  const result = await (worker as unknown as {
    resolveCallEvent: (input: typeof job, callEventId: string) => Promise<{ status: string }>;
  }).resolveCallEvent(job, callEvent.id);

  assert.equal(result.status, 'repaired_workflow_evaluations');
  assert.equal(modelCalls, 0);
  const params = fireInputs[0]?.params as Record<string, unknown>;
  assert.equal(params.forceWorkflowEvaluationRepair, true);
  assert.equal(evaluations.some((data) => data.status === 'task_created'), true);
});

function resolvedCallEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acev_workflow_retry',
    tenantId: 'ten_test',
    externalCallId: 'call_workflow_retry',
    eventType: 'call.ended',
    eventTimestamp: new Date('2026-08-06T12:00:00.000Z'),
    direction: 'inbound',
    durationSeconds: 45,
    aircallUserId: 'air_user_1',
    contactPhone: '+13125550100',
    contactPhoneE164: '+13125550100',
    contactEmail: 'customer@example.com',
    transcriptRaw: 'Customer: Please call me tomorrow. Agent: I will follow up.',
    transcriptSource: 'aircall_payload',
    transcriptPulledAt: new Date('2026-08-06T12:00:01.000Z'),
    resolverOutput: actionableOutput,
    resolverModel: 'claude-haiku-4-5',
    resolverStatus: 'succeeded',
    resolverInputHash: null,
    resolverAttemptCount: 1,
    resolvedAt: new Date('2026-08-06T12:00:02.000Z'),
    resolvedWithVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
    ...overrides,
  };
}

function resolverPrisma(
  callEvent: ReturnType<typeof resolvedCallEvent>,
  callUpdates: Array<Record<string, unknown>>,
  evaluations: Array<Record<string, unknown>>,
  existingEvaluations: Array<{ status: string }>,
) {
  return {
    db: {
      aircallCallEvent: {
        findFirst: async () => callEvent,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          callUpdates.push(data);
          return { count: 1 };
        },
      },
      transcriptWorkflowEvaluation: {
        findMany: async () => existingEvaluations,
        count: async () => 1,
        upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const data = evaluations.length === 0 ? create : update;
          evaluations.push(data);
          return data;
        },
        updateMany: async () => ({ count: 0 }),
      },
    },
  };
}

function resolverJob() {
  return {
    id: 'job_workflow_retry',
    data: { targetVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION },
    opts: { attempts: 5 },
    attemptsMade: 0,
  };
}
