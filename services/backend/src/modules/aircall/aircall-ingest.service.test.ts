import assert from 'node:assert/strict';
import test from 'node:test';
import { AircallIngestService } from './aircall-ingest.service.js';

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
