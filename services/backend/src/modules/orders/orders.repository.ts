import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export const orderInclude = {
  customer: true,
  customerUser: true,
  pickupOrder: true,
} satisfies Prisma.CommerceOrderInclude;

export type CommerceOrderWithRelations = Prisma.CommerceOrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list(where: Prisma.CommerceOrderWhereInput, take: number) {
    return this.prisma.db.commerceOrder.findMany({
      where,
      include: orderInclude,
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  count(where: Prisma.CommerceOrderWhereInput) {
    return this.prisma.db.commerceOrder.count({ where });
  }

  aggregateTotals(where: Prisma.CommerceOrderWhereInput) {
    return this.prisma.db.commerceOrder.aggregate({
      where,
      _sum: {
        totalPrice: true,
        totalRefunded: true,
        totalShipping: true,
      },
    });
  }

  findById(id: string) {
    return this.prisma.db.commerceOrder.findFirst({
      where: { id },
      include: orderInclude,
    });
  }

  findByShopifyOrderId(shopifyOrderId: string) {
    return this.prisma.db.commerceOrder.findFirst({
      where: { shopifyOrderId },
      include: orderInclude,
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.db.commerceOrder.findFirst({
      where: { idempotencyKey },
      include: orderInclude,
    });
  }

  async getRequired(id: string) {
    const order = await this.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  create(data: Omit<Prisma.CommerceOrderUncheckedCreateInput, 'id' | 'tenantId'>) {
    return this.prisma.db.commerceOrder.create({
      data: {
        ...data,
        id: prefixedId('ord'),
        tenantId: this.tenantId(),
      },
      include: orderInclude,
    });
  }

  async ensurePickupOrder(order: CommerceOrderWithRelations, designFiles: Prisma.InputJsonValue) {
    const existing = await this.prisma.db.commercePickupOrder.findFirst({ where: { orderId: order.id } });
    if (existing) return existing;
    return this.prisma.db.commercePickupOrder.create({
      data: {
        id: prefixedId('pick'),
        tenantId: this.tenantId(),
        orderId: order.id,
        customerId: order.customerId,
        customerUserId: order.customerUserId,
        status: 'pending',
        orderNumber: order.shopifyOrderNumber,
        customerEmail: order.email,
        customerName: order.customer?.companyName,
        designFiles,
        metadata: {},
      },
    });
  }

  updateCustomerCommerceSnapshot(customerId: string, data: Prisma.CustomerUpdateManyMutationInput) {
    return this.prisma.db.customer.updateMany({ where: { id: customerId }, data });
  }

  listCustomerOrders(customerId: string, take = 25) {
    return this.prisma.db.commerceOrder.findMany({
      where: { customerId },
      include: orderInclude,
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
