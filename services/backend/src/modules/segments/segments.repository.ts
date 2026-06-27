import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class SegmentsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list() {
    return this.prisma.db.segment.findMany({
      include: { ownerships: { include: { member: true } } },
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findById(id: string) {
    return this.prisma.db.segment.findFirst({
      where: { id },
      include: { ownerships: { include: { member: true } } },
    });
  }

  create(data: {
    name: string;
    description?: string | null;
    color: string;
    priority: number;
    priorityGlobal: number;
    audienceType: string;
    lifecycleStage?: string | null;
    matchMode: string;
    conditions: Prisma.InputJsonValue;
    rules: Prisma.InputJsonValue;
    rulesHash: string;
    isActive: boolean;
  }) {
    return this.prisma.db.segment.create({
      data: {
        id: prefixedId('seg'),
        tenantId: this.tenantId(),
        ...data,
      },
    });
  }

  async update(id: string, data: Prisma.SegmentUpdateManyMutationInput) {
    await this.prisma.db.segment.updateMany({ where: { id }, data });
    return this.findById(id);
  }

  delete(id: string) {
    return this.prisma.db.segment.deleteMany({ where: { id } });
  }

  listCustomers() {
    return this.prisma.db.customer.findMany({
      include: { insight: true },
      orderBy: [{ totalSpent: 'desc' }, { updatedAt: 'desc' }],
      take: 5000,
    });
  }

  listMemberships(segmentId: string) {
    return this.prisma.db.segmentCustomerMembership.findMany({
      where: { segmentId },
      include: { customer: { include: { insight: true } } },
      orderBy: { matchedAt: 'desc' },
      take: 100,
    });
  }

  async replaceMemberships(segmentId: string, customerIds: string[]) {
    await this.prisma.db.segmentCustomerMembership.deleteMany({ where: { segmentId } });
    if (customerIds.length > 0) {
      await this.prisma.db.segmentCustomerMembership.createMany({
        data: customerIds.map((customerId) => ({
          id: prefixedId('smem'),
          tenantId: this.tenantId(),
          segmentId,
          customerId,
        })),
        skipDuplicates: true,
      });
    }
    await this.prisma.db.segment.updateMany({
      where: { id: segmentId },
      data: { customerCount: customerIds.length, lastEvaluatedAt: new Date() },
    });
  }

  async upsertOwnership(segmentId: string, input: {
    memberId: string;
    priority: number;
    importance: string;
    dailyCap?: number | null;
    autoAssignNew: boolean;
    notes?: string | null;
    visualToken?: string | null;
  }) {
    const existing = await this.prisma.db.segmentOwnership.findFirst({
      where: { segmentId, memberId: input.memberId },
    });
    const data = {
      memberId: input.memberId,
      priority: input.priority,
      importance: input.importance,
      dailyCap: input.dailyCap ?? null,
      autoAssignNew: input.autoAssignNew,
      notes: input.notes ?? null,
      visualToken: input.visualToken ?? null,
    };
    if (existing) {
      await this.prisma.db.segmentOwnership.updateMany({ where: { id: existing.id }, data });
      return this.prisma.db.segmentOwnership.findFirst({ where: { id: existing.id }, include: { member: true } });
    }
    return this.prisma.db.segmentOwnership.create({
      data: {
        id: prefixedId('sown'),
        tenantId: this.tenantId(),
        segmentId,
        ...data,
      },
      include: { member: true },
    });
  }

  removeOwnership(segmentId: string, ownershipId?: string) {
    return this.prisma.db.segmentOwnership.deleteMany({
      where: ownershipId ? { id: ownershipId, segmentId } : { segmentId },
    });
  }

  findActiveMember(id: string) {
    return this.prisma.db.member.findFirst({ where: { id, status: 'active' } });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
