import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class B2BAccessRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  findPendingByIdentity(email: string, shopifyCustomerId?: string | null) {
    const tenantId = this.tenantId();
    return this.prisma.db.b2BAccessRequest.findFirst({
      where: {
        tenantId,
        status: 'pending',
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          ...(shopifyCustomerId ? [{ shopifyCustomerId }] : []),
        ],
      },
    });
  }

  create(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    companyName: string;
    legalName: string;
    website?: string | null;
    industry?: string | null;
    estimatedMonthlyVolume?: string | null;
    message?: string | null;
    passwordHash: string;
    shopifyCustomerId?: string | null;
    metadata: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.b2BAccessRequest.create({
      data: {
        id: prefixedId('b2br'),
        tenantId: this.tenantId(),
        ...data,
      },
    });
  }

  createFile(data: {
    requestId: string;
    storageKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    contentBase64?: string | null;
  }) {
    return this.prisma.db.b2BAccessRequestFile.create({
      data: {
        id: prefixedId('b2bf'),
        tenantId: this.tenantId(),
        ...data,
      },
    });
  }

  list(status?: string) {
    return this.prisma.db.b2BAccessRequest.findMany({
      where: status ? { status } : undefined,
      include: { files: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.db.b2BAccessRequest.findFirst({
      where: { id },
      include: { files: true },
    });
  }

  findLatestDecisionDelivery(requestId: string) {
    return this.prisma.db.mailDelivery.findFirst({
      where: {
        eventKey: {
          in: [
            'b2b_access.approved',
            'b2b.application_received.user',
            'b2b.application_received.internal',
            'b2b.application_approved.user',
            'b2b.application_rejected.user',
            'tax_exempt.request_received.user',
            'tax_exempt.request_received.internal',
            'tax_exempt.request_approved.user',
            'tax_exempt.request_rejected.user',
          ],
        },
        metadata: { path: ['requestId'], equals: requestId },
      },
      select: {
        id: true,
        eventKey: true,
        status: true,
        recipientEmail: true,
        createdAt: true,
        sentAt: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listInternalReviewRecipients() {
    return this.prisma.db.member.findMany({
      where: {
        tenantId: this.tenantId(),
        status: 'active',
        roleAssignments: {
          some: {
            role: { slug: { in: ['owner', 'admin'] } },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 25,
    });
  }

  async update(id: string, data: Prisma.B2BAccessRequestUpdateManyMutationInput) {
    await this.prisma.db.b2BAccessRequest.updateMany({ where: { id }, data });
    return this.findById(id);
  }

  findCustomerByIdentity(email: string, shopifyCustomerId?: string | null) {
    const tenantId = this.tenantId();
    return this.prisma.db.customer.findFirst({
      where: {
        tenantId,
        OR: [
          ...(shopifyCustomerId ? [{ shopifyCustomerId }] : []),
          { email: { equals: email, mode: 'insensitive' } },
        ],
      },
    });
  }

  findCustomerUserByEmail(email: string) {
    return this.prisma.db.customerUser.findFirst({
      where: {
        tenantId: this.tenantId(),
        email: { equals: email, mode: 'insensitive' },
      },
    });
  }

  createCustomer(data: {
    companyName: string;
    legalName?: string | null;
    email: string;
    phone?: string | null;
    status?: string;
    shopifyCustomerId?: string | null;
  }) {
    return this.prisma.db.customer.create({
      data: {
        id: prefixedId('cust'),
        tenantId: this.tenantId(),
        companyName: data.companyName,
        legalName: data.legalName,
        email: data.email,
        phone: data.phone,
        status: data.status ?? 'active',
        shopifyCustomerId: data.shopifyCustomerId,
      },
    });
  }

  updateCustomerFromB2BRequest(customerId: string, data: {
    email: string;
    phone?: string | null;
    companyName: string;
    legalName?: string | null;
    shopifyCustomerId?: string | null;
  }) {
    return this.prisma.db.customer.updateMany({
      where: { id: customerId },
      data: {
        email: data.email,
        phone: data.phone,
        companyName: data.companyName,
        legalName: data.legalName,
        ...(data.shopifyCustomerId ? { shopifyCustomerId: data.shopifyCustomerId } : {}),
        status: 'active',
      },
    });
  }

  createCustomerUser(data: {
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    passwordHash: string;
  }) {
    return this.prisma.db.customerUser.create({
      data: {
        id: prefixedId('cusr'),
        tenantId: this.tenantId(),
        customerId: data.customerId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        status: 'active',
      },
    });
  }

  findCustomerRoleBySlug(slug: string) {
    return this.prisma.db.customerRole.findFirst({ where: { slug } });
  }

  assignCustomerRole(customerUserId: string, roleId: string) {
    return this.prisma.db.customerUserRoleAssignment.createMany({
      data: [{
        id: prefixedId('asgn'),
        tenantId: this.tenantId(),
        customerUserId,
        roleId,
      }],
      skipDuplicates: true,
    });
  }

  activateCustomerUserForB2B(customerUserId: string, passwordHash: string | null) {
    return this.prisma.db.customerUser.updateMany({
      where: { id: customerUserId },
      data: {
        status: 'active',
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
  }

  async backfillApprovedCustomerOwnership(input: {
    customerId: string;
    customerUserId: string;
    email: string;
    shopifyCustomerId?: string | null;
  }) {
    const tenantId = this.tenantId();
    const orderMatchers: Prisma.CommerceOrderWhereInput[] = [
      { email: { equals: input.email, mode: 'insensitive' } },
    ];
    if (input.shopifyCustomerId) orderMatchers.unshift({ shopifyCustomerId: input.shopifyCustomerId });

    const eligibleOrders = await this.prisma.db.commerceOrder.findMany({
      where: {
        tenantId,
        OR: orderMatchers,
        AND: [
          { OR: [{ customerId: null }, { customerId: input.customerId }] },
          { OR: [{ customerUserId: null }, { customerUserId: input.customerUserId }] },
        ],
      },
      select: { id: true },
      take: 5000,
    });
    const orderIds = eligibleOrders.map((order) => order.id);
    if (orderIds.length === 0) {
      return { ordersMatched: 0, ordersUpdated: 0, pickupOrdersUpdated: 0 };
    }

    const orders = await this.prisma.db.commerceOrder.updateMany({
      where: {
        tenantId,
        id: { in: orderIds },
      },
      data: {
        customerId: input.customerId,
        customerUserId: input.customerUserId,
      },
    });
    const pickupOrders = await this.prisma.db.commercePickupOrder.updateMany({
      where: {
        tenantId,
        OR: [
          { orderId: { in: orderIds } },
          { customerEmail: { equals: input.email, mode: 'insensitive' } },
        ],
        AND: [
          { OR: [{ customerId: null }, { customerId: input.customerId }] },
          { OR: [{ customerUserId: null }, { customerUserId: input.customerUserId }] },
        ],
      },
      data: {
        customerId: input.customerId,
        customerUserId: input.customerUserId,
      },
    });

    return {
      ordersMatched: orderIds.length,
      ordersUpdated: orders.count,
      pickupOrdersUpdated: pickupOrders.count,
    };
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
