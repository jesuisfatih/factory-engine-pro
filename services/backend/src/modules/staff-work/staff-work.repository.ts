import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service.js';
import { prefixedId } from '../../shared/id.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export const staffWorkItemInclude = {
  customer: {
    include: {
      insight: true,
      segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 3 },
    },
  },
  assignedMember: true,
  participants: true,
  comments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StaffWorkItemInclude;

@Injectable()
export class StaffWorkRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  create(data: Prisma.StaffWorkItemUncheckedCreateInput) {
    return this.prisma.db.staffWorkItem.create({ data, include: staffWorkItemInclude });
  }

  findById(id: string) {
    return this.prisma.db.staffWorkItem.findFirst({ where: { id }, include: staffWorkItemInclude });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.db.staffWorkItem.findFirst({ where: { idempotencyKey }, include: staffWorkItemInclude });
  }

  update(id: string, data: Prisma.StaffWorkItemUncheckedUpdateManyInput) {
    return this.prisma.db.staffWorkItem.updateMany({ where: { id }, data });
  }

  async upsertParticipants(staffWorkItemId: string, memberIds: string[], role: string, source: string) {
    for (const memberId of memberIds) {
      await this.prisma.db.staffWorkParticipant.upsert({
        where: {
          tenantId_staffWorkItemId_memberId_role: {
            tenantId: this.tenantId(),
            staffWorkItemId,
            memberId,
            role,
          },
        },
        create: {
          id: prefixedId('swp'),
          tenantId: this.tenantId(),
          staffWorkItemId,
          memberId,
          role,
          source,
        },
        update: { source },
      });
    }
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is missing tenantId');
    return tenantId;
  }
}
