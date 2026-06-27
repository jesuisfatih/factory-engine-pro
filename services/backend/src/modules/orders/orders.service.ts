import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type CreateDirectOrderInput,
  type OrderListQuery,
  type ResolveReorderInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { classifyFulfillment } from './order-fulfillment-classifier.js';
import { type CommerceOrderWithRelations, OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async list(query: OrderListQuery) {
    const where = this.whereFromQuery(query);
    const take = query.surface === 'design_files' || query.hasDesignFiles ? Math.max(query.limit * 4, 100) : query.limit;
    const orders = await this.repository.list(where, take);
    const filtered = (query.surface === 'design_files' || query.hasDesignFiles)
      ? orders.filter((order) => jsonArray(order.designFiles).length > 0)
      : orders;
    return {
      data: filtered.slice(0, query.limit).map((order) => this.mapOrder(order)),
      meta: {
        limit: query.limit,
        count: filtered.length,
      },
    };
  }

  async stats(query: Partial<OrderListQuery> = {}) {
    const where = this.whereFromQuery({ surface: 'all', limit: 100, ...query });
    const [count, totals, fulfilledCount, refundedCount, pickupCount, recent] = await Promise.all([
      this.repository.count(where),
      this.repository.aggregateTotals(where),
      this.repository.count({ ...where, fulfillmentStatus: { in: ['fulfilled', 'complete', 'completed'] } }),
      this.repository.count({ ...where, financialStatus: { in: ['refunded', 'partially_refunded'] } }),
      this.repository.count({ ...where, fulfillmentMode: 'pickup' }),
      this.repository.list(where, 500),
    ]);
    const designFileCount = recent.filter((order) => jsonArray(order.designFiles).length > 0).length;
    return {
      count,
      totalRevenue: money(totals._sum.totalPrice),
      totalRefunded: money(totals._sum.totalRefunded),
      totalShipping: money(totals._sum.totalShipping),
      refundedCount,
      fulfilledCount,
      fulfillmentRate: count === 0 ? 0 : Math.round((fulfilledCount / count) * 100),
      pickupCount,
      designFileCount,
    };
  }

  async get(id: string) {
    return this.mapOrder(await this.repository.getRequired(id), true);
  }

  async createDirectOrder(input: CreateDirectOrderInput) {
    if (input.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return this.mapOrder(existing, true);
    }

    const customer = input.customerId
      ? await this.prisma.db.customer.findFirst({ where: { id: input.customerId } })
      : null;
    if (input.customerId && !customer) throw new NotFoundException('Customer not found');

    const lineItems = input.lineItems.map((item) => ({
      ...item,
      unitPrice: item.unitPrice ?? 0,
      totalPrice: (item.unitPrice ?? 0) * item.quantity,
    }));
    const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const designFiles = extractDesignFiles(lineItems);
    const classification = classifyFulfillment({
      tags: input.tags,
      lineItems,
      shippingAddress: input.shippingAddress,
      shippingLines: [],
    });
    const order = await this.repository.create({
      customerId: input.customerId,
      customerUserId: input.customerUserId,
      source: 'direct',
      idempotencyKey: input.idempotencyKey,
      email: input.email ?? customer?.email,
      phone: input.phone ?? customer?.phone,
      subtotal,
      totalDiscounts: 0,
      totalTax: 0,
      totalPrice: subtotal,
      totalShipping: 0,
      totalRefunded: 0,
      currency: input.currency,
      financialStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      fulfillmentMode: classification.mode,
      notes: input.notes,
      tags: input.tags,
      lineItems: lineItems as Prisma.InputJsonValue,
      shippingAddress: input.shippingAddress as Prisma.InputJsonValue,
      billingAddress: input.billingAddress as Prisma.InputJsonValue,
      designFiles: designFiles as Prisma.InputJsonValue,
      fulfillmentEvidence: classification.evidence as Prisma.InputJsonValue,
      rawData: { direct: true } as Prisma.InputJsonValue,
      processedAt: new Date(),
    });

    if (order.fulfillmentMode === 'pickup') {
      await this.repository.ensurePickupOrder(order, designFiles as Prisma.InputJsonValue);
    }
    if (order.customerId) await this.refreshCustomerSnapshot(order.customerId);

    this.logger.log('orders', 'create_direct_order', 'Direct order created', { order_id: order.id });
    const created = await this.repository.getRequired(order.id);
    return this.mapOrder(created, true);
  }

  async resolveReorder(input: ResolveReorderInput) {
    const order = input.orderId
      ? await this.repository.findById(input.orderId)
      : input.shopifyOrderId
        ? await this.repository.findByShopifyOrderId(input.shopifyOrderId)
        : null;
    const lineItems = input.lineItems ?? jsonArray(order?.lineItems);
    if (!order && !input.lineItems?.length) throw new NotFoundException('Order not found');

    const resolved = await Promise.all(lineItems.map(async (item) => {
      const record = item as Record<string, unknown>;
      const shopifyVariantId = stringValue(record.shopifyVariantId ?? record.variant_id ?? record.variantId);
      const sku = stringValue(record.sku);
      const variant = shopifyVariantId
        ? await this.prisma.db.catalogVariant.findFirst({ where: { shopifyVariantId } })
        : sku
          ? await this.prisma.db.catalogVariant.findFirst({ where: { sku } })
          : null;
      return {
        title: stringValue(record.title) ?? variant?.title ?? 'Line item',
        quantity: Number(record.quantity ?? 1),
        sku,
        shopifyVariantId,
        catalogVariantId: variant?.id ?? null,
        canReorder: Boolean(variant),
      };
    }));

    return {
      sourceOrder: order ? this.mapOrder(order) : null,
      items: resolved,
    };
  }

  async customerJourney(shopifyCustomerId: string) {
    const [orders, activities] = await Promise.all([
      this.prisma.db.commerceOrder.findMany({
        where: { shopifyCustomerId },
        include: { customer: true, customerUser: true, pickupOrder: true },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.db.commerceActivityLog.findMany({
        where: { shopifyCustomerId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      shopifyCustomerId,
      orders: orders.map((order) => this.mapOrder(order)),
      activities,
      summary: {
        orderCount: orders.length,
        totalSpent: orders.reduce((sum, order) => sum + money(order.totalPrice), 0),
        lastOrderAt: orders[0]?.processedAt?.toISOString() ?? null,
      },
    };
  }

  async journeyFunnel() {
    const events = await this.prisma.db.commerceActivityLog.groupBy({
      by: ['eventType'],
      _count: { eventType: true },
      orderBy: { _count: { eventType: 'desc' } },
      take: 25,
    });
    const orderCount = await this.prisma.db.commerceOrder.count({});
    return {
      events: events.map((event) => ({ eventType: event.eventType, count: event._count.eventType })),
      orders: orderCount,
    };
  }

  private whereFromQuery(query: Partial<OrderListQuery>): Prisma.CommerceOrderWhereInput {
    const and: Prisma.CommerceOrderWhereInput[] = [];
    if (query.surface === 'pickup' || query.pickupOnly) and.push({ fulfillmentMode: 'pickup' });
    if (query.status) {
      and.push({
        OR: [
          { financialStatus: query.status },
          { fulfillmentStatus: query.status },
        ],
      });
    }
    if (query.financialStatus) and.push({ financialStatus: query.financialStatus });
    if (query.fulfillmentStatus) and.push({ fulfillmentStatus: query.fulfillmentStatus });
    if (query.fulfillmentMode) and.push({ fulfillmentMode: query.fulfillmentMode });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.surface === 'design_files' || query.hasDesignFiles) {
      and.push({ NOT: [{ designFiles: { equals: [] as Prisma.JsonArray } }] } as Prisma.CommerceOrderWhereInput);
    }
    if (query.search) {
      and.push({
        OR: [
          { shopifyOrderNumber: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { customer: { companyName: { contains: query.search, mode: 'insensitive' } } },
          { customer: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private mapOrder(order: CommerceOrderWithRelations, detailed = false) {
    const lineItems = jsonArray(order.lineItems);
    const designFiles = jsonArray(order.designFiles);
    const personName = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ');
    return {
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      orderNumber: order.shopifyOrderNumber ?? order.id,
      customerId: order.customerId,
      customerUserId: order.customerUserId,
      companyName: order.customer?.companyName ?? null,
      customerName: order.customer?.companyName ?? (personName || null),
      customerEmail: order.email ?? order.customer?.email ?? null,
      phone: order.phone ?? order.customer?.phone ?? null,
      source: order.source,
      subtotal: money(order.subtotal),
      totalDiscounts: money(order.totalDiscounts),
      totalTax: money(order.totalTax),
      totalPrice: money(order.totalPrice),
      totalShipping: money(order.totalShipping),
      totalRefunded: money(order.totalRefunded),
      currency: order.currency,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      fulfillmentMode: order.fulfillmentMode,
      pickupStatus: order.pickupOrder?.status ?? null,
      tags: order.tags,
      processedAt: order.processedAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      hasDesignFiles: designFiles.length > 0,
      designFiles,
      lineItems: detailed ? lineItems : lineItems.slice(0, 5),
      shippingAddress: detailed ? order.shippingAddress : undefined,
      billingAddress: detailed ? order.billingAddress : undefined,
      discountCodes: detailed ? order.discountCodes : undefined,
      fulfillments: detailed ? order.fulfillments : undefined,
      refunds: detailed ? order.refunds : undefined,
      notes: detailed ? order.notes : undefined,
      fulfillmentEvidence: detailed ? order.fulfillmentEvidence : undefined,
    };
  }

  private async refreshCustomerSnapshot(customerId: string) {
    const [orders, latest] = await Promise.all([
      this.prisma.db.commerceOrder.aggregate({
        where: { customerId },
        _count: { id: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.db.commerceOrder.findFirst({
        where: { customerId },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const count = orders._count.id;
    const total = money(orders._sum.totalPrice);
    await this.repository.updateCustomerCommerceSnapshot(customerId, {
      ordersCount: count,
      totalSpent: total,
      averageOrderValue: count === 0 ? 0 : total / count,
      lastOrderAt: latest?.processedAt ?? latest?.createdAt,
      syncedAt: new Date(),
    });
  }
}

function extractDesignFiles(lineItems: Array<Record<string, unknown>>) {
  const files: Array<Record<string, unknown>> = [];
  for (const item of lineItems) {
    const properties = item.properties;
    if (!properties || typeof properties !== 'object') continue;
    for (const [name, value] of Object.entries(properties as Record<string, unknown>)) {
      const lower = name.toLowerCase();
      if (!['design', 'artwork', 'file', 'upload', 'gang sheet', 'proof'].some((token) => lower.includes(token))) continue;
      if (!value) continue;
      files.push({
        lineItemTitle: item.title,
        name,
        value,
      });
    }
  }
  return files;
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function jsonArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const stringified = String(value).trim();
  return stringified || null;
}
