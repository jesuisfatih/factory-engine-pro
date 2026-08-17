import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import { AircallIngestService } from './aircall-ingest.service.js';

test('requeues a failed workflow evaluation as a workflow-only repair', async () => {
  let removedExistingJob = false;
  let queuedData: Record<string, unknown> = {};
  const callEvent = {
    id: 'acev_failed_workflow',
    tenantId: 'ten_test',
    externalCallId: 'call_failed_workflow',
    transcriptRaw: 'Customer: Please call me back.',
    resolverQueuedAt: new Date('2026-08-06T12:00:00.000Z'),
    resolverQueueJobId: 'aircall-transcript-ten_test-call_failed_workflow-acev_failed_workflow',
    resolverStatus: 'succeeded',
    resolvedAt: new Date('2026-08-06T12:00:01.000Z'),
    resolvedWithVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  };
  const queue = {
    getJob: async () => ({
      getState: async () => 'completed',
      returnvalue: { status: 'succeeded' },
      remove: async () => { removedExistingJob = true; },
    }),
    add: async (_name: string, data: Record<string, unknown>) => { queuedData = data; },
  };
  const service = new AircallIngestService({
    db: {
      aircallCallEvent: {
        findFirst: async () => callEvent,
        updateMany: async () => ({ count: 1 }),
      },
      transcriptWorkflowEvaluation: {
        findMany: async () => [{ status: 'failed' }],
      },
    },
  } as never, {} as never, {} as never, { log() {}, warn() {} } as never, {} as never, {} as never, {} as never, {} as never, null, queue as never);

  const result = await service.enqueueTranscriptResolver(callEvent.id);

  assert.equal(result.queued, true);
  assert.equal(removedExistingJob, true);
  assert.equal(queuedData.forceReprocess, false);
  assert.equal(queuedData.forceWorkflowEvaluationRepair, true);
});

test('mirrors an Aircall event through a tenant-safe call lookup', async () => {
  let lookupWhere: Record<string, unknown> = {};
  let upsertInput: Record<string, unknown> = {};
  let updateInput: Record<string, unknown> = {};
  const service = new AircallIngestService({
    db: {
      call: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          lookupWhere = where;
          return null;
        },
        upsert: async (input: Record<string, unknown>) => {
          upsertInput = input;
          return { id: 'call_1' };
        },
        updateMany: async (input: Record<string, unknown>) => {
          updateInput = input;
          return { count: 1 };
        },
      },
    },
  } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, null, null);

  await (service as unknown as {
    mirrorCall: (
      tenantId: string,
      externalCallId: string,
      eventType: string,
      eventTimestamp: Date,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
  }).mirrorCall('ten_test', '4025985803', 'call.ended', new Date('2026-08-06T00:00:00.000Z'), {
    direction: 'inbound',
    status: 'done',
    ended_at: '2026-08-06T00:00:00.000Z',
  });

  assert.deepEqual(lookupWhere, { tenantId: 'ten_test', aircallCallId: '4025985803' });
  assert.deepEqual(upsertInput.where, {
    tenantId_aircallCallId: { tenantId: 'ten_test', aircallCallId: '4025985803' },
  });

  const linked = await (service as unknown as {
    attachCustomer: <T extends { id: string; customerId: string | null }>(
      tenantId: string,
      call: T,
      customerId: string,
    ) => Promise<T>;
  }).attachCustomer('ten_test', { id: 'call_1', customerId: null }, 'cust_1');

  assert.deepEqual(updateInput, {
    where: { tenantId: 'ten_test', id: 'call_1' },
    data: { customerId: 'cust_1' },
  });
  assert.equal(linked.customerId, 'cust_1');
});

test('keeps a missed call pending when Aircall duration only contains ringing time', async () => {
  let upsertInput: Record<string, unknown> = {};
  const service = new AircallIngestService({
    db: {
      call: {
        findFirst: async () => null,
        upsert: async (input: Record<string, unknown>) => {
          upsertInput = input;
          return { id: 'call_missed' };
        },
      },
    },
  } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, null, null);

  await (service as unknown as {
    mirrorCall: (
      tenantId: string,
      externalCallId: string,
      eventType: string,
      eventTimestamp: Date,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
  }).mirrorCall('ten_test', 'missed_1', 'call.ended', new Date('2026-08-06T00:00:30.000Z'), {
    direction: 'inbound',
    status: 'done',
    started_at: '2026-08-06T00:00:00.000Z',
    ended_at: '2026-08-06T00:00:30.000Z',
    answered_at: null,
    duration: 30,
    missed_call_reason: 'users_did_not_answer',
  });

  const create = upsertInput.create as Record<string, unknown>;
  assert.equal(create.status, 'missed_pending');
  assert.equal(create.reconciliationStatus, 'pending');
  assert.deepEqual(create.missedAt, new Date('2026-08-06T00:00:30.000Z'));
  assert.equal(create.callbackResolvedAt, null);
});

test('does not read unanswered status as an answered status', async () => {
  let upsertInput: Record<string, unknown> = {};
  const service = new AircallIngestService({
    db: {
      call: {
        findFirst: async () => null,
        upsert: async (input: Record<string, unknown>) => {
          upsertInput = input;
          return { id: 'call_unanswered' };
        },
      },
    },
  } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, null, null);

  await (service as unknown as {
    mirrorCall: (
      tenantId: string,
      externalCallId: string,
      eventType: string,
      eventTimestamp: Date,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
  }).mirrorCall('ten_test', 'missed_2', 'call.ended', new Date('2026-08-06T00:00:23.000Z'), {
    direction: 'inbound',
    status: 'unanswered',
    started_at: '2026-08-06T00:00:00.000Z',
    ended_at: '2026-08-06T00:00:23.000Z',
    answered_at: null,
    duration: 23,
  });

  const create = upsertInput.create as Record<string, unknown>;
  assert.equal(create.status, 'missed_pending');
  assert.equal(create.reconciliationStatus, 'pending');
});

test('reconciliation does not close a missed call because ringing duration is non-zero', async () => {
  let fired = 0;
  let updateInput: Record<string, unknown> = {};
  const missedAt = new Date('2026-08-05T23:50:00.000Z');
  const service = new AircallIngestService({
    db: {
      call: {
        findMany: async () => [{
          id: 'call_missed',
          aircallCallId: 'missed_3',
          customerId: null,
          callerNumber: '+13125550100',
          callerNumberE164: '+13125550100',
          missedAt,
          answeredAt: null,
          durationSeconds: 48,
          reconciliationStatus: 'pending',
        }],
        findFirst: async () => null,
        updateMany: async (input: Record<string, unknown>) => {
          updateInput = input;
          return { count: 1 };
        },
      },
      aircallCallEvent: {
        findFirst: async () => ({
          id: 'acev_missed',
          externalCallId: 'missed_3',
          eventType: 'call.missed',
          transcriptRaw: null,
        }),
      },
    },
  } as never, {} as never, {} as never, { log: () => undefined } as never, {} as never, {} as never, {} as never, {
    require: () => ({ tenantId: 'ten_test' }),
  } as never, null, null);
  (service as unknown as { fireWorkflowTrigger: () => Promise<void> }).fireWorkflowTrigger = async () => {
    fired += 1;
  };

  const result = await service.reconcileMissedCalls();

  assert.equal(fired, 1);
  assert.equal(result.confirmedMissed, 1);
  assert.deepEqual(updateInput, {
    where: { tenantId: 'ten_test', id: 'call_missed' },
    data: { status: 'missed', reconciliationStatus: 'confirmed_missed' },
  });
});

test('ring-group answer resolves the aggregate without firing a missed workflow', async () => {
  let fired = 0;
  let resolvedUpdate: Record<string, unknown> = {};
  const answeredAt = new Date('2026-08-06T00:02:00.000Z');
  const service = new AircallIngestService({
    db: {
      call: {
        findMany: async () => [{
          id: 'call_ring_group',
          aircallCallId: 'ring_group_1',
          customerId: 'cust_1',
          callerNumber: '+13125550101',
          callerNumberE164: '+13125550101',
          missedAt: new Date('2026-08-05T23:55:00.000Z'),
          answeredAt,
          durationSeconds: 45,
          reconciliationStatus: 'pending',
        }],
      },
      aircallCallEvent: {
        findMany: async () => [{ id: 'acev_ring_group' }],
      },
      $transaction: async (callback: (tx: Record<string, unknown>) => Promise<void>) => callback({
        call: {
          updateMany: async (input: Record<string, unknown>) => {
            resolvedUpdate = input;
            return { count: 1 };
          },
        },
        staffWorkItem: {
          findMany: async () => [],
        },
      }),
    },
  } as never, {} as never, {} as never, { log: () => undefined } as never, {} as never, {} as never, {} as never, {
    require: () => ({ tenantId: 'ten_test' }),
  } as never, null, null);
  (service as unknown as { fireWorkflowTrigger: () => Promise<void> }).fireWorkflowTrigger = async () => {
    fired += 1;
  };

  const result = await service.reconcileMissedCalls();

  assert.equal(fired, 0);
  assert.equal(result.answeredInGroup, 1);
  assert.deepEqual(resolvedUpdate, {
    where: { tenantId: 'ten_test', id: 'call_ring_group' },
    data: {
      status: 'closed',
      missedAt: null,
      callbackResolvedAt: answeredAt,
      reconciliationStatus: 'answered_in_ring_group',
    },
  });
});

test('callback reconciliation archives the one open missed-call work item', async () => {
  let fired = 0;
  let workUpdate: Record<string, unknown> = {};
  let transitions: Array<Record<string, unknown>> = [];
  const callbackAt = new Date('2026-08-06T00:10:00.000Z');
  const service = new AircallIngestService({
    db: {
      call: {
        findMany: async () => [{
          id: 'call_missed_callback',
          aircallCallId: 'missed_callback_1',
          customerId: 'cust_2',
          callerNumber: '+13125550102',
          callerNumberE164: '+13125550102',
          missedAt: new Date('2026-08-05T23:55:00.000Z'),
          answeredAt: null,
          durationSeconds: 0,
          reconciliationStatus: 'confirmed_missed',
        }],
        findFirst: async () => ({ id: 'call_callback', startedAt: callbackAt }),
      },
      aircallCallEvent: {
        findMany: async () => [{ id: 'acev_missed_callback' }],
      },
      $transaction: async (callback: (tx: Record<string, unknown>) => Promise<void>) => callback({
        call: { updateMany: async () => ({ count: 1 }) },
        staffWorkItem: {
          findMany: async () => [{
            id: 'swi_missed_callback',
            customerId: 'cust_2',
            workState: 'ready',
            queueLocation: 'daily',
          }],
          updateMany: async (input: Record<string, unknown>) => {
            workUpdate = input;
            return { count: 1 };
          },
        },
        workItemStateTransition: {
          createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
            transitions = data;
            return { count: data.length };
          },
        },
      }),
    },
  } as never, {} as never, {} as never, { log: () => undefined } as never, {} as never, {} as never, {} as never, {
    require: () => ({ tenantId: 'ten_test' }),
  } as never, null, null);
  (service as unknown as { fireWorkflowTrigger: () => Promise<void> }).fireWorkflowTrigger = async () => {
    fired += 1;
  };

  const result = await service.reconcileMissedCalls();

  assert.equal(fired, 0);
  assert.equal(result.callbackResolved, 1);
  assert.deepEqual(workUpdate, {
    where: { id: { in: ['swi_missed_callback'] } },
    data: {
      status: 'closed',
      workState: 'completed',
      queueLocation: 'archive',
      archivedAt: callbackAt,
      archiveReason: 'callback_resolved',
      closedAt: callbackAt,
      resolutionCode: 'callback_resolved',
    },
  });
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0]?.staffWorkItemId, 'swi_missed_callback');
  assert.equal(transitions[0]?.reason, 'aircall_reconciliation:callback_resolved');
});
