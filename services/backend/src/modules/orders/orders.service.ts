import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type CreateDirectOrderInput,
  type OrderListQuery,
  type ResolveReorderInput,
  type TransferOrderToMemberInput,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
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

  async detail(id: string) {
    const order = await this.repository.getRequired(id);
    const historyWhere: Prisma.CommerceOrderWhereInput | null = order.customerId
      ? { customerId: order.customerId }
      : order.shopifyCustomerId
        ? { shopifyCustomerId: order.shopifyCustomerId }
        : null;
    const [history, activities] = await Promise.all([
      historyWhere
        ? this.prisma.db.commerceOrder.findMany({
            where: historyWhere,
            include: { customer: true, customerUser: true, pickupOrder: true },
            orderBy: [{ processedAt: 'asc' }, { createdAt: 'asc' }],
            take: 100,
          })
        : [],
      order.shopifyCustomerId
        ? this.prisma.db.commerceActivityLog.findMany({
            where: { shopifyCustomerId: order.shopifyCustomerId },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : [],
    ]);
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentOrders = history.filter((item) => {
      const timestamp = (item.processedAt ?? item.createdAt).getTime();
      return timestamp >= thirtyDaysAgo;
    });
    const totalSpent = history.reduce((sum, item) => sum + money(item.totalPrice), 0);
    return {
      order: this.mapOrder(order, true),
      customerHistory: {
        orders: history.map((item) => this.mapOrder(item)),
        activities,
        summary: {
          orderCount: history.length,
          totalSpent,
          averageOrderValue: history.length === 0 ? 0 : totalSpent / history.length,
          lastOrderAt: history.length > 0
            ? (history[history.length - 1].processedAt ?? history[history.length - 1].createdAt).toISOString()
            : null,
          last30Days: {
            orderCount: recentOrders.length,
            totalSpent: recentOrders.reduce((sum, item) => sum + money(item.totalPrice), 0),
          },
        },
      },
    };
  }

  async transferToMember(id: string, input: TransferOrderToMemberInput) {
    const order = await this.repository.getRequired(id);
    const target = await this.prisma.db.member.findFirst({ where: { id: input.targetMemberId, status: 'active' } });
    if (!target) throw new NotFoundException('Transfer target member not found');
    const note = input.note.trim();
    if (!note) throw new BadRequestException('Transfer note is required');

    const context = this.tenantContext.require();
    const tenantId = context.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const orderNumber = order.shopifyOrderNumber ?? order.id;
    const personName = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ').trim();
    const customerName = order.customer?.companyName
      ?? (personName || null)
      ?? order.email
      ?? order.phone
      ?? 'Unknown customer';
    const created = await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId,
        customerId: order.customerId,
        customerUserId: order.customerUserId,
        assignedMemberId: target.id,
        axis: input.axis,
        source: 'admin_created',
        surface: 'internal',
        title: `Order ${orderNumber} follow-up`,
        description: note,
        status: 'open',
        priority: input.priority,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdByActorId: context.principalId,
        metadata: {
          category: 'admin_order_transfer',
          personQueueVisible: true,
          orderId: order.id,
          orderNumber,
          shopifyOrderId: order.shopifyOrderId,
          shopifyCustomerId: order.shopifyCustomerId,
          customerName,
          customerEmail: order.email ?? order.customer?.email ?? null,
          customerPhone: order.phone ?? order.customer?.phone ?? null,
          adminNote: note,
          transferredByMemberId: context.principalId,
          transferredAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        conditionTrace: [] as Prisma.InputJsonValue,
        taskStateSnapshot: {
          order: {
            id: order.id,
            orderNumber,
            shopifyOrderId: order.shopifyOrderId,
            totalPrice: money(order.totalPrice),
            currency: order.currency,
            financialStatus: order.financialStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            fulfillmentMode: order.fulfillmentMode,
            processedAt: order.processedAt?.toISOString() ?? null,
          },
          customer: {
            id: order.customerId,
            name: customerName,
            email: order.email ?? order.customer?.email ?? null,
            phone: order.phone ?? order.customer?.phone ?? null,
          },
        } as Prisma.InputJsonValue,
      },
      include: { assignedMember: true, customer: true },
    });

    await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId,
        serviceRequestId: created.id,
        actorId: context.principalId,
        actorType: context.principalType,
        body: `Admin order transfer for ${orderNumber}: ${note}`,
        internal: true,
        attachmentsJson: [{
          kind: 'admin_order_transfer',
          orderId: order.id,
          orderNumber,
          shopifyOrderId: order.shopifyOrderId,
        }] as Prisma.InputJsonValue,
      },
    });

    this.logger.log('orders', 'transfer_to_member', 'Order transferred to staff queue', {
      order_id: order.id,
      service_request_id: created.id,
      target_member_id: target.id,
      axis: input.axis,
    });

    return {
      ok: true,
      orderId: order.id,
      serviceRequestId: created.id,
      assignedMemberId: target.id,
      assignedMemberName: memberDisplayName(target),
      axis: input.axis,
      source: 'admin_created',
      queueSource: 'admin_transfer',
    };
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
    const storedDesignFiles = jsonArray(order.designFiles);
    const designFiles = storedDesignFiles.length > 0 ? storedDesignFiles : extractDesignFiles(lineItems);
    const personName = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ');
    return {
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      shopifyCustomerId: order.shopifyCustomerId,
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
      cancelledAt: detailed ? order.cancelledAt?.toISOString() ?? null : undefined,
      closedAt: detailed ? order.closedAt?.toISOString() ?? null : undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      syncedAt: detailed ? order.syncedAt.toISOString() : undefined,
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
    const properties = normalizeProperties(item.properties);
    if (properties.length === 0) continue;
    const fileInfo: Record<string, unknown> = {
      lineItemTitle: item.title ?? item.name,
      variantTitle: item.variant_title ?? item.variantTitle,
      quantity: item.quantity,
      price: item.price ?? item.unitPrice,
      imageUrl: item.image_url ?? item.imageUrl ?? null,
    };
    for (const [name, value] of properties) {
      const lower = name.toLowerCase();
      if (!value) continue;
      const stringValue = String(value);
      if (lower.startsWith('_')
        && !['preview', 'upload', 'thumbnail', 'dpi', 'width', 'height', 'print'].some((token) => lower.includes(token))) {
        continue;
      }
      if (lower.includes('preview') || lower === '_preview') fileInfo.previewUrl = stringValue;
      if (lower.includes('print') && lower.includes('ready')) fileInfo.printReadyUrl = stringValue;
      if ((lower.includes('uploaded') || lower.includes('file_url') || lower.includes('file url')) && isUrl(stringValue)) {
        fileInfo.uploadedFileUrl = stringValue;
      }
      if (lower.includes('upload_id') || lower === '_ul_upload_id') fileInfo.uploadId = stringValue;
      if (lower.includes('thumbnail') || lower === '_ul_thumbnail') fileInfo.thumbnailUrl = stringValue;
      if (lower.includes('design_type') || lower === 'design type') fileInfo.designType = stringValue;
      if (lower.includes('file_name') || lower === 'file name' || lower === 'filename') fileInfo.fileName = stringValue;
      if (lower.includes('edit') && !lower.includes('admin') && isUrl(stringValue)) fileInfo.editUrl = stringValue;
      if (lower.includes('admin') && lower.includes('edit') && isUrl(stringValue)) fileInfo.adminEditUrl = stringValue;
      if (lower === 'dpi' || lower === '_dpi') fileInfo.dpi = Number.parseInt(stringValue, 10) || 300;
      if (lower.includes('width') && !lower.includes('screen')) fileInfo.rawWidth = stringValue;
      if (lower.includes('height') && !lower.includes('screen')) fileInfo.rawHeight = stringValue;
      if (!fileInfo.uploadedFileUrl && isUrl(stringValue)
        && ['image', 'file', 'artwork', 'design', 'photo', 'logo', 'graphic', 'attachment', 'gang sheet', 'proof'].some((token) => lower.includes(token))) {
        fileInfo.uploadedFileUrl = stringValue;
      }
    }
    if (!fileInfo.rawWidth && typeof item.variant_title === 'string') {
      const sizeMatch = item.variant_title.match(/(\d+\.?\d*)\s*[xXx]\s*(\d+\.?\d*)/);
      if (sizeMatch) {
        fileInfo.rawWidth = sizeMatch[1];
        fileInfo.rawHeight = sizeMatch[2];
      }
    }
    if (!fileInfo.dpi) fileInfo.dpi = 300;
    fileInfo.allProperties = properties.map(([name, value]) => ({ name, value }));
    if (fileInfo.previewUrl || fileInfo.printReadyUrl || fileInfo.uploadedFileUrl || fileInfo.editUrl || fileInfo.thumbnailUrl) {
      files.push(fileInfo);
    }
  }
  return files;
}

function normalizeProperties(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const name = String(record.name ?? record.key ?? '').trim();
      if (!name) return [];
      return [[name, record.value ?? record.val ?? ''] as [string, unknown]];
    });
  }
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>);
  return [];
}

function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//');
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

function memberDisplayName(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.email;
}
