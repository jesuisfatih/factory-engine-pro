import assert from 'node:assert/strict';
import test from 'node:test';
import { StaffWorkService } from './staff-work.service.js';

const baseRow = {
  id: 'swi_1',
  tenantId: 'ten_test',
  customerId: 'cust_1',
  assignedMemberId: 'tmbr_1',
  axis: 'sales',
  matchedRuleId: 'rule_1',
  source: 'call',
  sourceCallId: 'call_1',
  sourceEmailId: null,
  sourceEventId: null,
  sourceOccurredAt: new Date('2026-08-06T12:00:00.000Z'),
  title: 'Customer follow-up',
  description: 'Call customer',
  status: 'open',
  priority: 'high',
  dueAt: null,
  visibleAfter: null,
  workState: 'new',
  queueLocation: 'follow_up',
  metadata: {},
  conditionTrace: [],
  taskStateSnapshot: {},
} as const;

function harness(input: {
  contactPoint?: { id: string } | null;
  existingOutcome?: Record<string, unknown> | null;
} = {}) {
  const captures = {
    staffUpdate: null as Record<string, unknown> | null,
    transition: null as Record<string, unknown> | null,
    reappearance: null as Record<string, unknown> | null,
    invalidatedContact: null as Record<string, unknown> | null,
    contactPolicy: null as Record<string, unknown> | null,
    transactions: 0,
  };
  const repository = {
    findById: async () => baseRow,
  };
  const tx = {
    customerCallOutcome: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        selectedAt: new Date('2026-08-06T12:00:00.000Z'),
      }),
    },
    staffWorkItem: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        captures.staffUpdate = data;
        return { count: 1 };
      },
      upsert: async (args: Record<string, unknown>) => {
        captures.reappearance = args;
        return args;
      },
    },
    workItemStateTransition: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        captures.transition = data;
        return data;
      },
    },
    staffWorkComment: { create: async ({ data }: { data: Record<string, unknown> }) => data },
    customerContactPoint: {
      updateMany: async (args: Record<string, unknown>) => {
        captures.invalidatedContact = args;
        return { count: 1 };
      },
    },
    customerContactPolicy: {
      upsert: async (args: Record<string, unknown>) => {
        captures.contactPolicy = args;
        return args;
      },
    },
  };
  const prisma = {
    db: {
      customerCallOutcome: { findFirst: async () => input.existingOutcome ?? null },
      customerContactPoint: { findFirst: async () => input.contactPoint ?? null },
      $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => {
        captures.transactions += 1;
        return operation(tx);
      },
    },
  };
  const businessClock = {
    calendar: async () => ({
      repeatPolicy: {
        maxCalls: 2,
        windowDays: 5,
        defaultFollowUpBusinessDays: 4,
        completionReappearanceDays: 15,
      },
    }),
    addBusinessDays: async () => new Date('2026-08-12T12:00:00.000Z'),
    addCalendarDays: async () => new Date('2026-08-21T12:00:00.000Z'),
  };
  const service = new StaffWorkService(
    repository as never,
    prisma as never,
    { require: () => ({ tenantId: 'ten_test' }) } as never,
    { log: () => undefined } as never,
    businessClock as never,
  );
  return { service, captures };
}

test('no answer schedules the same work item four tenant business days later', async () => {
  const { service, captures } = harness();

  const result = await service.recordOutcome('swi_1', 'tmbr_1', { disposition: 'no_answer' });

  assert.equal(result.queueLocation, 'scheduled');
  assert.equal(result.visibleAfter, '2026-08-12T12:00:00.000Z');
  assert.equal(captures.staffUpdate?.workState, 'scheduled');
  assert.equal((captures.staffUpdate?.visibleAfter as Date).toISOString(), '2026-08-12T12:00:00.000Z');
});

test('completed archives the current work and creates one fifteen-day reappearance', async () => {
  const { service, captures } = harness();

  const result = await service.recordOutcome('swi_1', 'tmbr_1', { disposition: 'completed' });

  assert.equal(result.queueLocation, 'archive');
  assert.equal(result.visibleAfter, '2026-08-21T12:00:00.000Z');
  assert.equal(captures.staffUpdate?.status, 'closed');
  const reappearance = captures.reappearance as { create?: Record<string, unknown> };
  assert.equal(reappearance.create?.queueLocation, 'scheduled');
  assert.equal((reappearance.create?.visibleAfter as Date).toISOString(), '2026-08-21T12:00:00.000Z');
  assert.match(String(reappearance.create?.idempotencyKey), /^completion-reappearance:swi_1:/);
});

test('wrong number invalidates only the selected phone contact point', async () => {
  const { service, captures } = harness({ contactPoint: { id: 'ccp_wrong' } });

  await service.recordOutcome('swi_1', 'tmbr_1', {
    disposition: 'wrong_number',
    phone: '+1 (312) 555-0100',
  });

  assert.deepEqual(captures.invalidatedContact, {
    where: { id: 'ccp_wrong' },
    data: {
      isValid: false,
      invalidReason: 'staff_reported_wrong_number',
      invalidatedAt: captures.invalidatedContact && (captures.invalidatedContact.data as Record<string, unknown>).invalidatedAt,
    },
  });
  assert.equal(captures.contactPolicy, null);
});

test('do not call creates a customer-wide contact policy', async () => {
  const { service, captures } = harness();

  await service.recordOutcome('swi_1', 'tmbr_1', {
    disposition: 'do_not_call',
    note: 'Customer requested no more calls.',
  });

  const policy = captures.contactPolicy as { create?: Record<string, unknown>; update?: Record<string, unknown> };
  assert.equal(policy.create?.doNotCall, true);
  assert.equal(policy.create?.customerId, 'cust_1');
  assert.equal(policy.update?.reason, 'Customer requested no more calls.');
  assert.equal(captures.invalidatedContact, null);
});

test('an idempotency key returns the recorded outcome without a second transaction', async () => {
  const existing = {
    id: 'cco_existing',
    staffWorkItemId: 'swi_1',
    customerId: 'cust_1',
    disposition: 'no_answer',
    note: null,
    resultingWorkState: 'scheduled',
    resultingQueue: 'scheduled',
    selectedAt: new Date('2026-08-06T12:00:00.000Z'),
  };
  const { service, captures } = harness({ existingOutcome: existing });

  const result = await service.recordOutcome('swi_1', 'tmbr_1', {
    disposition: 'no_answer',
    idempotencyKey: 'outcome-once',
  });

  assert.equal(result.id, 'cco_existing');
  assert.equal(captures.transactions, 0);
});
