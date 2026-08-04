import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PersonWorkspaceNoteService } from './person-workspace-note.service.js';

test('soft deletes an authored note and rejects deletion by another member', async () => {
  const row = { id: 'pwn_1', authorMemberId: 'tmbr_linda', deletedAt: null as Date | null };
  const service = new PersonWorkspaceNoteService({
    db: {
      personWorkspaceNote: {
        findFirst: async ({ where }: { where: { id: string; deletedAt: null } }) => (
          row.id === where.id && row.deletedAt === null ? row : null
        ),
        updateMany: async ({ data }: { data: { deletedAt: Date } }) => {
          row.deletedAt = data.deletedAt;
          return { count: 1 };
        },
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never, {
    log: () => undefined,
  } as never, {
    emitTenantInvalidate: () => undefined,
  } as never);

  await assert.rejects(() => service.remove('tmbr_charlotte', row.id), ForbiddenException);
  const result = await service.remove('tmbr_linda', row.id);
  assert.equal(result.deleted, true);
  assert.ok(row.deletedAt instanceof Date);
});
