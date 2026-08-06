import assert from 'node:assert/strict';
import test from 'node:test';
import { PersonWorkspacePinService } from './person-workspace-pin.service.js';

test('pins and unpins the same workspace target without creating duplicate state', async () => {
  const rows: Array<Record<string, unknown>> = [];
  const service = new PersonWorkspacePinService({
    db: {
      personWorkspacePin: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => (
          row.memberId === where.memberId && row.targetKind === where.targetKind && row.targetId === where.targetId
        )) ?? null,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          const existing = rows.find((row) => (
            row.memberId === create.memberId && row.targetKind === create.targetKind && row.targetId === create.targetId
          ));
          if (existing) return existing;
          const row = { ...create, createdAt: new Date('2026-08-04T12:00:00.000Z') };
          rows.push(row);
          return row;
        },
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const index = rows.findIndex((row) => (
            row.memberId === where.memberId && row.targetKind === where.targetKind && row.targetId === where.targetId
          ));
          if (index >= 0) rows.splice(index, 1);
        },
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never);

  const first = await service.toggle('tmbr_linda', 'staff_work_item', 'swi_1', true);
  const second = await service.toggle('tmbr_linda', 'staff_work_item', 'swi_1', true);
  const removed = await service.toggle('tmbr_linda', 'staff_work_item', 'swi_1', false);

  assert.equal(first.pinned, true);
  assert.equal(second.id, first.id);
  assert.equal(rows.length, 0);
  assert.equal(removed.pinned, false);
});
