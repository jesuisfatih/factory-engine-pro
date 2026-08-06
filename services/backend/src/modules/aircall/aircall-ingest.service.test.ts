import assert from 'node:assert/strict';
import test from 'node:test';
import { AircallIngestService } from './aircall-ingest.service.js';

test('mirrors an Aircall event through a tenant-safe call lookup', async () => {
  let lookupWhere: Record<string, unknown> = {};
  let upsertInput: Record<string, unknown> = {};
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
});
