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

interface LifecycleRow extends Record<string, unknown> {
  id: string;
  tenantId: string;
  customerId: string | null;
  contactIdentityKey: string | null;
  operationalIntent: string;
  occurrenceCount: number;
  firstSignalAt: Date | null;
  lastSignalAt: Date | null;
  status: string;
  priority: string;
  workState: string;
  queueLocation: string;
  sourceEventId: string | null;
  sourceCallId: string | null;
  sourceOccurredAt: Date | null;
  title: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
  createdAt: Date;
}

interface LifecycleOccurrence extends Record<string, unknown> {
  tenantId: string;
  staffWorkItemId: string;
  sourceEventId: string;
  occurredAt: Date;
}

function lifecycleHarness() {
  const rows: LifecycleRow[] = [];
  const occurrences: LifecycleOccurrence[] = [];
  let clearedCustomOrders = 0;

  const repository = {
    findById: async (id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? {
        ...row,
        occurrences: occurrences.filter((occurrence) => occurrence.staffWorkItemId === id),
      } : null;
    },
  };

  const findActive = (where: Record<string, unknown>) => rows
    .filter((row) => {
      if ('customerId' in where && row.customerId !== where.customerId) return false;
      if ('contactIdentityKey' in where && row.contactIdentityKey !== where.contactIdentityKey) return false;
      if ('operationalIntent' in where && row.operationalIntent !== where.operationalIntent) return false;
      return !['closed', 'resolved', 'transferred'].includes(row.status);
    })
    .sort((left, right) => (right.lastSignalAt?.getTime() ?? 0) - (left.lastSignalAt?.getTime() ?? 0))[0] ?? null;

  const tx = {
    $queryRaw: async () => [],
    staffWorkOccurrence: {
      findUnique: async ({ where }: { where: { tenantId_sourceEventId: { tenantId: string; sourceEventId: string } } }) => {
        const key = where.tenantId_sourceEventId;
        return occurrences.find((occurrence) => occurrence.tenantId === key.tenantId && occurrence.sourceEventId === key.sourceEventId) ?? null;
      },
      create: async ({ data }: { data: LifecycleOccurrence }) => {
        occurrences.push(data);
        return data;
      },
    },
    staffWorkItem: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => findActive(where),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          ...data,
          updatedAt: now,
          createdAt: now,
        } as LifecycleRow;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        assert.ok(row);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    personDailyTaskOrder: {
      deleteMany: async () => {
        clearedCustomOrders += 1;
        return { count: 1 };
      },
    },
    workItemStateTransition: { create: async ({ data }: { data: Record<string, unknown> }) => data },
  };

  const prisma = {
    db: {
      customer: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
      member: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
      $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    },
  };
  const service = new StaffWorkService(
    repository as never,
    prisma as never,
    {
      require: () => ({ tenantId: 'ten_test' }),
      get: () => ({ principalId: 'tmbr_test' }),
    } as never,
    { log: () => undefined } as never,
    {} as never,
  );
  return {
    service,
    rows,
    occurrences,
    clearedCustomOrders: () => clearedCustomOrders,
  };
}

function lifecycleInput(eventId: string, overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'cust_1',
    contactIdentityKey: 'phone:+13125550100',
    title: 'Return customer call',
    description: 'Confirm the pending request.',
    source: 'transcript_workflow',
    priority: 'medium',
    axis: 'account' as const,
    sourceCallId: `call_${eventId}`,
    sourceEventId: eventId,
    sourceOccurredAt: new Date(`2026-08-${eventId === 'event_1' ? '08' : '09'}T12:00:00.000Z`),
    operationalIntent: 'callback_requested' as const,
    ...overrides,
  };
}

test('a later call continues the same active customer intent lifecycle', async () => {
  const harness = lifecycleHarness();
  const first = await harness.service.continueOrCreate(lifecycleInput('event_1', { priority: 'high' }));
  const second = await harness.service.continueOrCreate(lifecycleInput('event_2', {
    title: 'Call customer with the latest update',
    priority: 'low',
  }));

  assert.equal(first.outcome, 'created');
  assert.equal(second.outcome, 'continued');
  assert.equal(second.item.id, first.item.id);
  assert.equal(second.item.occurrenceCount, 2);
  assert.equal(second.item.title, 'Call customer with the latest update');
  assert.equal(second.item.priority, 'low');
  assert.equal(harness.occurrences.length, 2);
  assert.equal(harness.clearedCustomOrders(), 1);
});

test('replaying the same call event does not create or count it twice', async () => {
  const harness = lifecycleHarness();
  const first = await harness.service.continueOrCreate(lifecycleInput('event_1'));
  const replay = await harness.service.continueOrCreate(lifecycleInput('event_1'));

  assert.equal(replay.outcome, 'replayed');
  assert.equal(replay.item.id, first.item.id);
  assert.equal(replay.item.occurrenceCount, 1);
  assert.equal(harness.rows.length, 1);
  assert.equal(harness.occurrences.length, 1);
});

test('a closed lifecycle starts a new task episode for the next call', async () => {
  const harness = lifecycleHarness();
  const first = await harness.service.continueOrCreate(lifecycleInput('event_1'));
  harness.rows[0]!.status = 'closed';
  harness.rows[0]!.workState = 'completed';
  harness.rows[0]!.queueLocation = 'archive';

  const next = await harness.service.continueOrCreate(lifecycleInput('event_2'));

  assert.equal(next.outcome, 'created');
  assert.notEqual(next.item.id, first.item.id);
  assert.equal(harness.rows.length, 2);
  assert.equal(next.item.occurrenceCount, 1);
});

test('a provisional phone lifecycle attaches to the resolved Shopify customer without losing history', async () => {
  const harness = lifecycleHarness();
  const provisional = await harness.service.continueOrCreate(lifecycleInput('event_1', { customerId: undefined }));
  const resolved = await harness.service.continueOrCreate(lifecycleInput('event_2'));

  assert.equal(resolved.outcome, 'continued');
  assert.equal(resolved.item.id, provisional.item.id);
  assert.equal(resolved.item.customerId, 'cust_1');
  assert.equal(resolved.item.occurrenceCount, 2);
  assert.equal(harness.occurrences.length, 2);
});
