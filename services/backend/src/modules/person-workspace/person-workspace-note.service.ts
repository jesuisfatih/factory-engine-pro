import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReplyPersonNoteInput, SavePersonNoteInput } from '@factory-engine-pro/contracts';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { RealtimeService } from '../../shared/realtime.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

const noteInclude = {
  author: { include: { roleAssignments: { include: { role: true } } } },
  customer: true,
  replies: {
    include: { author: { include: { roleAssignments: { include: { role: true } } } } },
    orderBy: { createdAt: 'asc' as const },
    take: 100,
  },
};
type PersonWorkspaceNoteRow = Prisma.PersonWorkspaceNoteGetPayload<{ include: typeof noteInclude }>;

@Injectable()
export class PersonWorkspaceNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly realtime: RealtimeService,
  ) {}

  async list(memberId: string) {
    const rows = await this.prisma.db.personWorkspaceNote.findMany({
      where: {
        deletedAt: null,
        OR: [{ kind: 'queue' }, { kind: 'scratch', authorMemberId: memberId }],
      },
      include: noteInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => this.toDto(row, memberId));
  }

  async save(memberId: string, input: SavePersonNoteInput) {
    if (input.id) {
      const existing = await this.prisma.db.personWorkspaceNote.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('Note not found');
      if (existing.authorMemberId !== memberId) {
        throw new ForbiddenException('Only the note author can edit this note');
      }
      await this.prisma.db.personWorkspaceNote.updateMany({
        where: { id: input.id, authorMemberId: memberId, deletedAt: null },
        data: {
          kind: input.kind,
          title: input.title,
          body: input.body,
          linkedCustomerId: input.linkedCustomer ?? null,
          linkedServiceRequestId: input.linkedQueueId ?? null,
        },
      });
      this.logAndInvalidate('note.update', input.id, memberId);
      return this.requireDto(input.id, memberId);
    }

    const created = await this.prisma.db.personWorkspaceNote.create({
      data: {
        id: prefixedId('pwn'),
        tenantId: this.tenantId(),
        authorMemberId: memberId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        linkedCustomerId: input.linkedCustomer ?? null,
        linkedServiceRequestId: input.linkedQueueId ?? null,
      },
      include: noteInclude,
    });
    this.logAndInvalidate('note.create', created.id, memberId);
    return this.toDto(created, memberId);
  }

  async reply(memberId: string, id: string, input: ReplyPersonNoteInput) {
    const note = await this.prisma.db.personWorkspaceNote.findFirst({
      where: { id, deletedAt: null },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.kind === 'scratch' && note.authorMemberId !== memberId) {
      throw new ForbiddenException('This personal note is not shared');
    }
    await this.prisma.db.personWorkspaceNoteReply.create({
      data: {
        id: prefixedId('pwnr'),
        tenantId: this.tenantId(),
        noteId: id,
        authorMemberId: memberId,
        body: input.body,
      },
    });
    await this.prisma.db.personWorkspaceNote.updateMany({
      where: { id, deletedAt: null },
      data: { updatedAt: new Date() },
    });
    this.logAndInvalidate('note.reply', id, memberId);
    return this.requireDto(id, memberId);
  }

  async remove(memberId: string, id: string) {
    const note = await this.prisma.db.personWorkspaceNote.findFirst({
      where: { id, deletedAt: null },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.authorMemberId !== memberId) {
      throw new ForbiddenException('Only the note author can delete this note');
    }
    await this.prisma.db.personWorkspaceNote.updateMany({
      where: { id, authorMemberId: memberId, deletedAt: null },
      data: { deletedAt: new Date(), deletedByMemberId: memberId },
    });
    this.logAndInvalidate('note.delete', id, memberId);
    return { id, deleted: true as const };
  }

  private async requireDto(id: string, memberId: string) {
    const row = await this.prisma.db.personWorkspaceNote.findFirst({
      where: { id, deletedAt: null },
      include: noteInclude,
    });
    if (!row) throw new NotFoundException('Note not found');
    return this.toDto(row, memberId);
  }

  private toDto(row: PersonWorkspaceNoteRow, memberId: string) {
    return {
      id: row.id,
      kind: row.kind === 'queue' ? 'queue' as const : 'scratch' as const,
      title: row.title,
      body: row.body,
      authorName: memberName(row.author),
      authorEmail: row.author.email,
      authorRole: row.author.roleAssignments[0]?.role.name ?? 'Member',
      linkedCustomer: row.linkedCustomerId ?? undefined,
      linkedCustomerName: row.customer ? customerName(row.customer) : undefined,
      linkedQueueId: row.linkedServiceRequestId ?? undefined,
      createdAt: relative(row.createdAt),
      updatedAt: relative(row.updatedAt),
      canDelete: row.authorMemberId === memberId,
      replies: row.replies.map((reply) => ({
        id: reply.id,
        body: reply.body,
        authorName: memberName(reply.author),
        authorRole: reply.author.roleAssignments[0]?.role.name ?? 'Member',
        createdAt: relative(reply.createdAt),
      })),
    };
  }

  private logAndInvalidate(action: string, noteId: string, memberId: string) {
    this.logger.log('person_workspace', action, 'Person workspace note changed', {
      note_id: noteId,
      member_id: memberId,
    });
    this.realtime.emitTenantInvalidate(this.tenantId(), {
      module: 'call_center',
      reason: `person.${action}`,
      at: new Date().toISOString(),
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for workspace notes');
    return tenantId;
  }
}

function memberName(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.email;
}

function customerName(customer: { companyName: string | null; firstName: string | null; lastName: string | null; email: string | null }) {
  return customer.companyName
    || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    || customer.email
    || 'Customer';
}

function relative(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toISOString().slice(0, 10);
}
