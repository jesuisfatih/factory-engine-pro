import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export const customerInclude = {
  insight: true,
  _count: {
    select: {
      customerUsers: true,
      orders: true,
      listItems: true,
    },
  },
} satisfies Prisma.CustomerInclude;

export type CustomerWithCommerce = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

export const customerAssignmentInclude = {
  member: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
  approvedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.CustomerAssignmentInclude;

export const customerAssignmentAuditInclude = {
  previousMember: { select: { id: true, email: true, firstName: true, lastName: true } },
  newMember: { select: { id: true, email: true, firstName: true, lastName: true } },
  actorMember: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.CustomerAssignmentAuditInclude;

export type CustomerAssignmentWithMember = Prisma.CustomerAssignmentGetPayload<{ include: typeof customerAssignmentInclude }>;
export type CustomerAssignmentAuditWithMembers = Prisma.CustomerAssignmentAuditGetPayload<{ include: typeof customerAssignmentAuditInclude }>;

@Injectable()
export class CustomersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list(where: Prisma.CustomerWhereInput, orderBy: Prisma.CustomerOrderByWithRelationInput[], take: number) {
    return this.prisma.db.customer.findMany({
      where,
      include: customerInclude,
      orderBy,
      take,
    });
  }

  count(where: Prisma.CustomerWhereInput) {
    return this.prisma.db.customer.count({ where });
  }

  aggregate(where: Prisma.CustomerWhereInput) {
    return this.prisma.db.customer.aggregate({
      where,
      _sum: { totalSpent: true, ordersCount: true },
      _avg: { averageOrderValue: true },
    });
  }

  findById(id: string) {
    return this.prisma.db.customer.findFirst({
      where: { id },
      include: {
        ...customerInclude,
        orders: {
          orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        },
      },
    });
  }

  async getRequired(id: string) {
    const customer = await this.findById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  upsertInsight(customerId: string, data: Omit<Prisma.CustomerInsightUncheckedCreateInput, 'id' | 'customerId'>) {
    return this.prisma.db.customerInsight.upsert({
      where: {
        tenantId_customerId: {
          tenantId: data.tenantId,
          customerId,
        },
      },
      create: {
        id: prefixedId('cins'),
        customerId,
        ...data,
      },
      update: data,
    });
  }

  listCustomerLists() {
    return this.prisma.db.customerList.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  findListById(id: string) {
    return this.prisma.db.customerList.findFirst({
      where: { id },
      include: {
        items: {
          include: { customer: { include: { insight: true } } },
          orderBy: { addedAt: 'desc' },
        },
      },
    });
  }

  createList(data: { name: string; description?: string; color: string; icon: string }) {
    return this.prisma.db.customerList.create({
      data: {
        id: prefixedId('clst'),
        tenantId: this.tenantId(),
        ...data,
      },
    });
  }

  updateList(id: string, data: Prisma.CustomerListUpdateManyMutationInput) {
    return this.prisma.db.customerList.updateMany({ where: { id, isSystem: false }, data });
  }

  deleteList(id: string) {
    return this.prisma.db.customerList.deleteMany({ where: { id, isSystem: false } });
  }

  addCustomersToList(listId: string, customerIds: string[], notes?: string) {
    return this.prisma.db.customerListItem.createMany({
      data: customerIds.map((customerId) => ({
        id: prefixedId('clit'),
        tenantId: this.tenantId(),
        listId,
        customerId,
        notes,
      })),
      skipDuplicates: true,
    });
  }

  removeCustomersFromList(listId: string, customerIds: string[]) {
    return this.prisma.db.customerListItem.deleteMany({
      where: { listId, customerId: { in: customerIds } },
    });
  }

  updateListItemNote(itemId: string, notes: string | null) {
    return this.prisma.db.customerListItem.updateMany({
      where: { id: itemId },
      data: { notes },
    });
  }

  listAssignments(customerId: string) {
    return this.prisma.db.customerAssignment.findMany({
      where: { customerId },
      include: customerAssignmentInclude,
      orderBy: [{ axis: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  findAssignment(customerId: string, axis: string) {
    return this.prisma.db.customerAssignment.findFirst({
      where: { customerId, axis },
      include: customerAssignmentInclude,
    });
  }

  upsertAssignment(input: {
    customerId: string;
    axis: string;
    memberId: string;
    source: string;
    reason?: string;
    approvedByMemberId: string | null;
  }) {
    const tenantId = this.tenantId();
    return this.prisma.db.customerAssignment.upsert({
      where: {
        tenantId_customerId_axis: {
          tenantId,
          customerId: input.customerId,
          axis: input.axis,
        },
      },
      create: {
        id: prefixedId('casn'),
        tenantId,
        customerId: input.customerId,
        axis: input.axis,
        memberId: input.memberId,
        source: input.source,
        reason: input.reason,
        approvedByMemberId: input.approvedByMemberId,
        approvedAt: new Date(),
      },
      update: {
        memberId: input.memberId,
        source: input.source,
        reason: input.reason,
        approvedByMemberId: input.approvedByMemberId,
        approvedAt: new Date(),
        isPrimary: true,
      },
      include: customerAssignmentInclude,
    });
  }

  createAssignmentAudit(input: {
    customerId: string;
    axis: string;
    action: string;
    previousMemberId?: string | null;
    newMemberId?: string | null;
    actorMemberId?: string | null;
    source: string;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.customerAssignmentAudit.create({
      data: {
        id: prefixedId('caud'),
        tenantId: this.tenantId(),
        customerId: input.customerId,
        axis: input.axis,
        action: input.action,
        previousMemberId: input.previousMemberId ?? null,
        newMemberId: input.newMemberId ?? null,
        actorMemberId: input.actorMemberId ?? null,
        source: input.source,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      },
      include: customerAssignmentAuditInclude,
    });
  }

  listAssignmentAudits(customerId: string, take = 20) {
    return this.prisma.db.customerAssignmentAudit.findMany({
      where: { customerId },
      include: customerAssignmentAuditInclude,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  findActiveMember(memberId: string) {
    return this.prisma.db.member.findFirst({
      where: { id: memberId, status: 'active' },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
