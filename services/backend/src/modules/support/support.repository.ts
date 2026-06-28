import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class SupportRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list(where: Prisma.ServiceRequestWhereInput, orderBy: Prisma.ServiceRequestOrderByWithRelationInput[], skip: number, take: number) {
    return this.prisma.db.serviceRequest.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        customer: true,
        customerUser: true,
        assignedMember: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  count(where: Prisma.ServiceRequestWhereInput) {
    return this.prisma.db.serviceRequest.count({ where });
  }

  groupByStatus(where: Prisma.ServiceRequestWhereInput) {
    return this.prisma.db.serviceRequest.groupBy({ by: ['status'], where, _count: { _all: true } });
  }

  groupBySurface(where: Prisma.ServiceRequestWhereInput) {
    return this.prisma.db.serviceRequest.groupBy({ by: ['surface'], where, _count: { _all: true } });
  }

  findById(id: string) {
    return this.prisma.db.serviceRequest.findFirst({
      where: { id },
      include: {
        customer: true,
        customerUser: true,
        assignedMember: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async create(data: Omit<Prisma.ServiceRequestUncheckedCreateInput, 'id' | 'tenantId'>) {
    return this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        ...data,
      },
      include: {
        customer: true,
        customerUser: true,
        assignedMember: true,
        comments: true,
      },
    });
  }

  async update(id: string, data: Prisma.ServiceRequestUncheckedUpdateManyInput) {
    await this.prisma.db.serviceRequest.updateMany({ where: { id }, data });
    return this.findById(id);
  }

  createComment(data: {
    serviceRequestId: string;
    actorId?: string | null;
    actorType?: string | null;
    body: string;
    internal?: boolean;
    attachmentsJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId: this.tenantId(),
        serviceRequestId: data.serviceRequestId,
        actorId: data.actorId ?? null,
        actorType: data.actorType ?? null,
        body: data.body,
        internal: data.internal ?? false,
        attachmentsJson: data.attachmentsJson ?? [],
      },
    });
  }

  async touch(id: string) {
    await this.prisma.db.serviceRequest.updateMany({ where: { id }, data: { updatedAt: new Date() } });
  }

  listOpenForOverdueSweep(excludedStatuses: string[], take: number) {
    return this.prisma.db.serviceRequest.findMany({
      where: { status: { notIn: excludedStatuses } },
      orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
      take,
      include: {
        customer: true,
        customerUser: true,
        assignedMember: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  listCustomers(search?: string) {
    return this.prisma.db.customer.findMany({
      where: search
        ? {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { companyName: 'asc' },
      take: 100,
    });
  }

  findCustomer(id: string) {
    return this.prisma.db.customer.findFirst({ where: { id } });
  }

  findCustomerUser(id: string) {
    return this.prisma.db.customerUser.findFirst({ where: { id } });
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
