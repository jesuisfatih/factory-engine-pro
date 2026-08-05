import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomerContactTimelineService } from './customer-contact-timeline.service.js';

test('records an active dial with a ten minute collision window', async () => {
  let created: Record<string, unknown> = {};
  const service = new CustomerContactTimelineService({
    db: {
      customerContactActivity: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return data;
        },
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never, {} as never, {
    log: () => undefined,
  } as never, {
    emitTenantInvalidate: () => undefined,
  } as never);

  await service.recordDial({
    customerId: 'cust_1',
    memberId: 'tmbr_linda',
    phone: '+18325550100',
    result: {
      ok: true,
      mode: 'aircall_dial',
      phone: '+18325550100',
      message: 'Calling',
      normalizedPhone: '+18325550100',
      aircallUserId: 'aircall_linda',
      telHref: 'tel:+18325550100',
      providerStatus: 200,
    },
  });

  assert.ok(Object.keys(created).length > 0);
  assert.equal(created.status, 'calling');
  assert.equal(created.customerId, 'cust_1');
  const ttl = (created.expiresAt as Date).getTime() - (created.startedAt as Date).getTime();
  assert.equal(ttl, 10 * 60_000);
});

test('turns an ended Aircall event into a completed shared contact state', async () => {
  let upserted: Record<string, unknown> = {};
  const service = new CustomerContactTimelineService({
    db: {
      customerContactActivity: {
        findUnique: async () => null,
        upsert: async (input: Record<string, unknown>) => {
          upserted = input;
          return { id: 'cca_1', customerId: 'cust_1' };
        },
        updateMany: async () => ({ count: 1 }),
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never, {
    findCustomer: async () => ({ id: 'cust_1', phone: '+18325550100' }),
    capturePhonePoints: async () => [],
  } as never, {
    log: () => undefined,
    warn: () => undefined,
  } as never, {
    emitTenantInvalidate: () => undefined,
  } as never);

  await service.recordAircallEvent({
    externalCallId: 'call_1',
    eventType: 'call.ended',
    eventAt: new Date('2026-08-04T12:00:00.000Z'),
    memberId: 'tmbr_linda',
    phone: '+18325550100',
    durationSeconds: 120,
  });

  assert.ok(Object.keys(upserted).length > 0);
  const create = upserted.create as Record<string, unknown>;
  assert.equal(create.status, 'completed');
  assert.ok(create.endedAt instanceof Date);
  assert.equal(create.expiresAt, null);
});

test('does not regress a completed call when an older ringing webhook arrives late', async () => {
  let update: Record<string, unknown> = {};
  const service = new CustomerContactTimelineService({
    db: {
      customerContactActivity: {
        findUnique: async () => ({
          id: 'cca_1',
          status: 'completed',
          startedAt: new Date('2026-08-04T12:00:00.000Z'),
          updatedAt: new Date('2026-08-04T12:05:00.000Z'),
          endedAt: new Date('2026-08-04T12:05:00.000Z'),
          expiresAt: null,
          metadata: { eventAt: '2026-08-04T12:05:00.000Z', eventType: 'call.ended' },
        }),
        upsert: async (input: Record<string, unknown>) => {
          update = input.update as Record<string, unknown>;
          return { id: 'cca_1', customerId: 'cust_1' };
        },
        updateMany: async () => ({ count: 1 }),
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never, {
    findCustomer: async () => ({ id: 'cust_1', phone: '+18325550100' }),
    capturePhonePoints: async () => [],
  } as never, {
    log: () => undefined,
    warn: () => undefined,
  } as never, {
    emitTenantInvalidate: () => undefined,
  } as never);

  await service.recordAircallEvent({
    externalCallId: 'call_1',
    eventType: 'call.started',
    eventAt: new Date('2026-08-04T12:01:00.000Z'),
    memberId: 'tmbr_linda',
    phone: '+18325550100',
  });

  assert.equal(update.status, 'completed');
  assert.equal(update.expiresAt, null);
  assert.deepEqual(update.metadata, { eventAt: '2026-08-04T12:05:00.000Z', eventType: 'call.ended' });
});

test('keeps an active call visible ahead of a newer scheduled follow-up', async () => {
  const now = Date.now();
  const service = new CustomerContactTimelineService({
    db: {
      customerContactActivity: {
        findMany: async () => [
          activity('follow_up_scheduled', new Date(now), null),
          activity('calling', new Date(now - 60_000), new Date(now + 9 * 60_000)),
        ],
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never, {} as never, {
    log: () => undefined,
  } as never, {
    emitTenantInvalidate: () => undefined,
  } as never);

  const states = await service.latestForCustomers(['cust_1']);
  assert.equal(states.get('cust_1')?.status, 'calling');
  assert.equal(states.get('cust_1')?.active, true);
});

function activity(status: string, startedAt: Date, expiresAt: Date | null) {
  return {
    id: `cca_${status}`,
    customerId: 'cust_1',
    status,
    memberId: 'tmbr_linda',
    member: { firstName: 'Linda', lastName: 'M', email: 'linda@example.com' },
    phone: '+18325550100',
    startedAt,
    endedAt: null,
    expiresAt,
  };
}
