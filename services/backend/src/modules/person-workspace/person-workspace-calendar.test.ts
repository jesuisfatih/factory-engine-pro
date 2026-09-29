import assert from 'node:assert/strict';
import test from 'node:test';
import { PersonWorkspaceService, personCalendarCallEvents } from './person-workspace.service.js';

test('person calendar collapses repeated Aircall lifecycle events into one call', () => {
  const rows = personCalendarCallEvents([
    { id: 'ended_1', externalCallId: 'call_1' },
    { id: 'hungup_1', externalCallId: 'call_1' },
    { id: 'ended_2', externalCallId: 'call_2' },
  ]);

  assert.deepEqual(rows.map((row) => row.id), ['ended_1', 'ended_2']);
});

test('person calendar requests only calls owned by the signed-in member', async () => {
  let ownedCallWhere: Record<string, unknown> = {};
  let eventWhere: Record<string, unknown> = {};
  const eventAt = new Date('2026-09-29T12:00:00.000Z');
  const service = new PersonWorkspaceService(
    {
      db: {
        staffWorkItem: { findMany: async () => [] },
        call: {
          findMany: async ({ where }: { where: Record<string, unknown> }) => {
            ownedCallWhere = where;
            return [{ aircallCallId: 'aircall_owned_1' }];
          },
        },
        aircallCallEvent: {
          findMany: async ({ where }: { where: Record<string, unknown> }) => {
            eventWhere = where;
            return [
              callEvent('event_ended', 'call.ended', eventAt),
              callEvent('event_answered', 'call.answered', new Date(eventAt.getTime() - 1_000)),
            ];
          },
        },
        mailDelivery: { findMany: async () => [] },
      },
    } as never,
    { require: () => ({ tenantId: 'ten_test' }) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  (service as unknown as { currentMember: () => Promise<{ id: string }> }).currentMember = async () => ({ id: 'member_signed_in' });

  const events = await service.calendar() as Array<{ id: string }>;

  assert.equal(ownedCallWhere.currentOperatorId, 'member_signed_in');
  assert.deepEqual(eventWhere.externalCallId, { in: ['aircall_owned_1'] });
  assert.deepEqual(events.map((event) => event.id), ['call-event_ended']);
});

function callEvent(id: string, eventType: string, eventTimestamp: Date) {
  return {
    id,
    externalCallId: 'aircall_owned_1',
    eventType,
    eventTimestamp,
    direction: 'inbound',
    status: 'closed',
    durationSeconds: 120,
    contactPhone: null,
    contactPhoneE164: '+13125550100',
    contactEmail: null,
    transcriptRaw: null,
    resolverOutput: null,
    resolverStatus: null,
    resolverModel: null,
    resolvedAt: null,
    resolvedWithVersion: null,
  };
}
