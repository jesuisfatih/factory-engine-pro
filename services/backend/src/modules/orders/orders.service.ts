import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AccountInvoiceQuery,
  type CreateDirectOrderInput,
  type OrderListQuery,
  type OrderSortBy,
  type RecordAccountInvoicePaymentInput,
  type ResolveReorderInput,
  type SaveAccountInvoiceInput,
  type SendAccountInvoiceInput,
  type TransferOrderToMemberInput,
  type UpdateAccountInvoiceFileInput,
  type UpdateAccountInvoiceStatusInput,
  type UpdateCommercePickupInput,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService } from '../mail/mail.service.js';
import { classifyFulfillment } from './order-fulfillment-classifier.js';
import { defaultOrderOrderBy, type CommerceOrderOrderBy, type CommerceOrderWithRelations, OrdersRepository } from './orders.repository.js';

const accountInvoiceInclude = {
  customer: true,
  order: true,
  payments: { orderBy: { recordedAt: 'desc' } },
  activities: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.AccountInvoiceInclude;

type InvoiceRecord = Prisma.AccountInvoiceGetPayload<{ include: typeof accountInvoiceInclude }>;

function invoiceInclude() {
  return accountInvoiceInclude;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly mail: MailService,
  ) {}

  async list(query: OrderListQuery) {
    const where = this.whereFromQuery(query);
    const take = query.surface === 'design_files' || query.hasDesignFiles ? Math.max(query.limit * 4, 100) : query.limit;
    const orders = await this.repository.list(where, take, this.orderByFromQuery(query));
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

  async invoices(query: AccountInvoiceQuery) {
    const where: Prisma.AccountInvoiceWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.orderId) where.orderId = query.orderId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { order: { shopifyOrderNumber: { contains: query.search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.db.accountInvoice.findMany({
      where,
      include: invoiceInclude(),
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit,
    });
    return {
      data: rows.map((invoice) => this.mapInvoice(invoice)),
      meta: { count: rows.length, limit: query.limit },
    };
  }

  async orderInvoices(orderId: string) {
    await this.repository.getRequired(orderId);
    const rows = await this.prisma.db.accountInvoice.findMany({
      where: { orderId },
      include: invoiceInclude(),
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    return rows.map((invoice) => this.mapInvoice(invoice, true));
  }

  async invoice(invoiceId: string) {
    return this.mapInvoice(await this.requireInvoice(invoiceId), true);
  }

  async createInvoice(input: SaveAccountInvoiceInput) {
    const order = input.orderId ? await this.repository.getRequired(input.orderId) : null;
    const customerId = input.customerId ?? order?.customerId;
    if (!customerId) throw new BadRequestException('Select a customer or order before creating an invoice');
    if (order?.customerId && input.customerId && input.customerId !== order.customerId) {
      throw new BadRequestException('Selected order belongs to a different customer');
    }
    const customer = await this.prisma.db.customer.findFirst({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (order?.id && input.status !== 'draft') {
      const existingForOrder = await this.prisma.db.accountInvoice.findFirst({
        where: { orderId: order.id, status: { not: 'draft' } },
        select: { invoiceNumber: true },
      });
      if (existingForOrder) {
        throw new ConflictException(`Invoice ${existingForOrder.invoiceNumber} already exists for this order`);
      }
    }

    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date();
    const dueAt = input.dueAt ? new Date(input.dueAt) : addDays(issuedAt, 30);
    assertInvoiceUrl(input.fileUrl, 'Invoice file URL');
    assertInvoiceUrl(input.externalPaymentUrl, 'Payment URL');
    const lineItems = input.lineItems?.length ? input.lineItems : invoiceItemsFromOrder(order);
    const subtotal = input.subtotal ?? roundMoney(lineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0));
    const totalAmount = input.totalAmount ?? roundMoney(subtotal - input.discountAmount + input.shippingAmount + input.taxAmount);
    const amountPaid = input.status === 'paid' ? totalAmount : input.amountPaid;
    const status = invoiceStatusFromPayment(input.status, totalAmount, amountPaid);
    const invoice = await this.prisma.db.accountInvoice.create({
      data: {
        id: prefixedId('ainv'),
        tenantId: this.requireTenantId(),
        customerId,
        orderId: order?.id ?? null,
        shopifyCustomerId: customer.shopifyCustomerId ?? order?.shopifyCustomerId ?? null,
        invoiceNumber: input.invoiceNumber || `INV-${Date.now()}`,
        status,
        issuedAt,
        dueAt,
        subtotal,
        discountAmount: input.discountAmount,
        shippingAmount: input.shippingAmount,
        taxAmount: input.taxAmount,
        totalAmount,
        amountPaid,
        currency: input.currency || order?.currency || 'USD',
        fileUrl: input.fileUrl ?? null,
        externalPaymentUrl: input.externalPaymentUrl ?? null,
        notes: input.notes ?? null,
        lineItems: lineItems as Prisma.InputJsonValue,
        metadata: {
          source: 'admin_invoice_create',
          orderNumber: order?.shopifyOrderNumber ?? null,
        } as Prisma.InputJsonValue,
      },
      include: invoiceInclude(),
    });
    await this.recordInvoiceActivity(invoice.id, 'invoice_created', { orderId: order?.id ?? null, totalAmount });
    this.logger.log('orders', 'invoice.create', 'Account invoice created', { invoice_id: invoice.id, order_id: order?.id, customer_id: customerId });
    return this.invoice(invoice.id);
  }

  async updateInvoiceStatus(invoiceId: string, input: UpdateAccountInvoiceStatusInput) {
    const existing = await this.requireInvoice(invoiceId);
    const total = money(existing.totalAmount);
    const amountPaid = input.status === 'paid' ? total : input.amountPaid ?? money(existing.amountPaid);
    const status = invoiceStatusFromPayment(input.status, total, amountPaid);
    const updated = await this.prisma.db.accountInvoice.updateMany({
      where: { id: invoiceId },
      data: {
        status,
        amountPaid,
      },
    });
    if (updated.count === 0) throw new NotFoundException('Invoice not found');
    await this.recordInvoiceActivity(invoiceId, 'invoice_status_updated', {
      previousStatus: existing.status,
      status,
      note: input.note ?? null,
      amountPaid,
    });
    return this.invoice(invoiceId);
  }

  async updateInvoiceFile(invoiceId: string, input: UpdateAccountInvoiceFileInput) {
    const existing = await this.requireInvoice(invoiceId);
    assertInvoiceUrl(input.fileUrl, 'Invoice file URL');
    assertInvoiceUrl(input.externalPaymentUrl, 'Payment URL');
    if (existing.status !== 'draft' && existing.fileUrl && existing.fileUrl !== input.fileUrl) {
      throw new ConflictException('Issued invoice file cannot be replaced. Duplicate the invoice or void it before attaching a different file.');
    }
    const updated = await this.prisma.db.accountInvoice.updateMany({
      where: { id: invoiceId },
      data: {
        fileUrl: input.fileUrl,
        ...(input.externalPaymentUrl !== undefined ? { externalPaymentUrl: input.externalPaymentUrl } : {}),
      },
    });
    if (updated.count === 0) throw new NotFoundException('Invoice not found');
    await this.recordInvoiceActivity(invoiceId, 'invoice_file_updated', input);
    return this.invoice(invoiceId);
  }

  async recordInvoicePayment(invoiceId: string, input: RecordAccountInvoicePaymentInput) {
    const invoice = await this.requireInvoice(invoiceId);
    const previousPaid = money(invoice.amountPaid);
    const total = money(invoice.totalAmount);
    const nextPaid = roundMoney(previousPaid + input.amount);
    const status = invoiceStatusFromPayment(invoice.status, total, nextPaid);
    const context = this.tenantContext.require();
    await this.prisma.db.accountInvoicePayment.create({
      data: {
        id: prefixedId('aip'),
        tenantId: this.requireTenantId(),
        invoiceId,
        amount: input.amount,
        method: input.method,
        note: input.note ?? null,
        recordedByMemberId: context.principalType === 'member' ? context.principalId : null,
        metadata: { previousPaid, nextPaid } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.accountInvoice.updateMany({
      where: { id: invoiceId },
      data: { amountPaid: nextPaid, status },
    });
    await this.recordInvoiceActivity(invoiceId, 'invoice_payment_recorded', {
      amount: input.amount,
      method: input.method,
      previousStatus: invoice.status,
      status,
    });
    return this.invoice(invoiceId);
  }

  async sendInvoice(invoiceId: string, input: SendAccountInvoiceInput) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === 'draft') throw new BadRequestException('Publish the invoice before sending it to the customer');
    if (invoice.status === 'void') throw new BadRequestException('Voided invoices cannot be sent to the customer');
    const email = invoice.customer.email?.trim();
    if (!email) throw new BadRequestException('Customer email is required before sending an invoice');
    const total = money(invoice.totalAmount);
    const paid = money(invoice.amountPaid);
    const delivery = await this.mail.sendAccountInvoiceDelivered({
      to: email,
      recipientName: customerDisplayName(invoice.customer),
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountDue: Math.max(0, roundMoney(total - paid)),
      currency: invoice.currency,
      dueAt: invoice.dueAt,
      invoiceUrl: invoice.fileUrl,
      paymentUrl: invoice.externalPaymentUrl,
      note: input.note ?? invoice.notes,
    });
    await this.recordInvoiceActivity(invoice.id, 'invoice_sent', {
      mailDeliveryId: delivery.id,
      status: delivery.status,
      recipientEmail: delivery.recipientEmail,
      note: input.note ?? null,
    });
    this.logger.log('orders', 'invoice.send', 'Account invoice delivery queued', {
      invoice_id: invoice.id,
      mail_delivery_id: delivery.id,
      recipient_email: delivery.recipientEmail,
    });
    return {
      invoice: await this.invoice(invoice.id),
      delivery: {
        id: delivery.id,
        status: delivery.status,
        recipientEmail: delivery.recipientEmail,
      },
    };
  }

  async duplicateInvoice(invoiceId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    const created = await this.prisma.db.accountInvoice.create({
      data: {
        id: prefixedId('ainv'),
        tenantId: this.requireTenantId(),
        customerId: invoice.customerId,
        orderId: invoice.orderId,
        shopifyCustomerId: invoice.shopifyCustomerId,
        invoiceNumber: `INV-${Date.now()}`,
        status: 'draft',
        issuedAt: new Date(),
        dueAt: invoice.dueAt,
        subtotal: invoice.subtotal,
        discountAmount: invoice.discountAmount,
        shippingAmount: invoice.shippingAmount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        amountPaid: 0,
        currency: invoice.currency,
        fileUrl: null,
        externalPaymentUrl: invoice.externalPaymentUrl,
        notes: invoice.notes,
        lineItems: invoice.lineItems as Prisma.InputJsonValue,
        metadata: { duplicatedFromInvoiceId: invoice.id } as Prisma.InputJsonValue,
      },
      include: invoiceInclude(),
    });
    await this.recordInvoiceActivity(created.id, 'invoice_duplicated', { sourceInvoiceId: invoice.id });
    return this.invoice(created.id);
  }

  async markOverdueInvoices() {
    const now = new Date();
    const rows = await this.prisma.db.accountInvoice.findMany({
      where: { status: { in: ['unpaid', 'partial'] }, dueAt: { lt: now } },
      take: 500,
    });
    for (const invoice of rows) {
      await this.prisma.db.accountInvoice.updateMany({ where: { id: invoice.id }, data: { status: 'overdue' } });
      await this.recordInvoiceActivity(invoice.id, 'invoice_marked_overdue', { previousStatus: invoice.status });
    }
    return { updated: rows.length };
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

  async updatePickup(id: string, input: UpdateCommercePickupInput) {
    const order = await this.repository.getRequired(id);
    if (order.fulfillmentMode !== 'pickup' && !order.pickupOrder) {
      throw new BadRequestException('Only pickup orders can use pickup operations');
    }
    const pickup = order.pickupOrder ?? await this.repository.ensurePickupOrder(
      order,
      (order.designFiles ?? []) as Prisma.InputJsonValue,
    );
    const previousStatus = pickup.status;
    if (input.status) assertPickupStatusTransition(previousStatus, input.status);

    const previousMetadata = jsonObject(pickup.metadata);
    const nextShelfCode = input.shelfCode === undefined
      ? stringValue(previousMetadata.shelfCode)
      : input.shelfCode;
    const notification = input.status === 'notified'
      ? await this.mail.sendPickupReady({
          to: order.email ?? order.customer?.email ?? '',
          recipientName: order.customer ? customerDisplayName(order.customer) : order.email ?? 'Customer',
          pickupOrderId: pickup.id,
          orderNumber: order.shopifyOrderNumber ?? order.id,
          shelfCode: nextShelfCode,
        }).catch((error) => {
          if (!order.email && !order.customer?.email) {
            throw new BadRequestException('Customer email is required before marking pickup as notified');
          }
          throw error;
        })
      : null;
    const history = Array.isArray(previousMetadata.history) ? previousMetadata.history.slice(-49) : [];
    const changedAt = new Date();
    const nextMetadata = {
      ...previousMetadata,
      ...(input.shelfCode !== undefined ? { shelfCode: input.shelfCode } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      history: [
        ...history,
        {
          at: changedAt.toISOString(),
          actorMemberId: this.tenantContext.require().principalId,
          previousStatus,
          status: input.status ?? previousStatus,
          shelfCode: input.shelfCode === undefined ? previousMetadata.shelfCode ?? null : input.shelfCode,
          note: input.note ?? null,
          mailDeliveryId: notification?.id ?? null,
        },
      ],
    };
    const updated = await this.prisma.db.commercePickupOrder.updateMany({
      where: { id: pickup.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.qrCode !== undefined ? { qrCode: input.qrCode } : {}),
        ...(input.status === 'picked_up' ? { pickupAt: changedAt } : {}),
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });
    if (updated.count === 0) throw new NotFoundException('Pickup order not found');

    await this.prisma.db.commerceActivityLog.create({
      data: {
        id: prefixedId('alog'),
        tenantId: this.requireTenantId(),
        customerId: order.customerId,
        shopifyCustomerId: order.shopifyCustomerId,
        eventType: 'pickup.updated',
        payload: {
          orderId: order.id,
          pickupOrderId: pickup.id,
          previousStatus,
          status: input.status ?? previousStatus,
          shelfCode: input.shelfCode === undefined ? previousMetadata.shelfCode ?? null : input.shelfCode,
          qrCodeChanged: input.qrCode !== undefined,
          note: input.note ?? null,
          mailDeliveryId: notification?.id ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('orders', 'pickup.update', 'Pickup order updated', {
      order_id: order.id,
      pickup_order_id: pickup.id,
      previous_status: previousStatus,
      status: input.status ?? previousStatus,
    });
    return this.get(order.id);
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

  private async requireInvoice(invoiceId: string) {
    const invoice = await this.prisma.db.accountInvoice.findFirst({
      where: { id: invoiceId },
      include: invoiceInclude(),
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async recordInvoiceActivity(invoiceId: string, action: string, metadata: Record<string, unknown> = {}) {
    const context = this.tenantContext.require();
    await this.prisma.db.accountInvoiceActivity.create({
      data: {
        id: prefixedId('aia'),
        tenantId: this.requireTenantId(),
        invoiceId,
        action,
        actorMemberId: context.principalType === 'member' ? context.principalId : null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private mapInvoice(invoice: InvoiceRecord, detailed = false) {
    const totalAmount = money(invoice.totalAmount);
    const amountPaid = money(invoice.amountPaid);
    const amountDue = Math.max(0, roundMoney(totalAmount - amountPaid));
    const dueAt = invoice.dueAt ?? addDays(invoice.issuedAt, 30);
    const status = invoice.status === 'void'
      ? 'void'
      : invoice.status === 'draft'
        ? 'draft'
        : amountDue <= 0
          ? 'paid'
          : invoice.status === 'partial'
            ? 'partial'
            : dueAt.getTime() < Date.now() && invoice.status !== 'draft'
              ? 'overdue'
              : invoice.status;
    const lastDelivery = invoiceLastDelivery(invoice);
    const base = {
      id: invoice.id,
      customerId: invoice.customerId,
      customerName: invoice.customer.companyName,
      customerEmail: invoice.customer.email,
      orderId: invoice.orderId,
      orderNumber: invoice.order?.shopifyOrderNumber ?? invoice.order?.id ?? null,
      invoiceNumber: invoice.invoiceNumber,
      status,
      issuedAt: invoice.issuedAt.toISOString(),
      dueAt: dueAt.toISOString(),
      subtotal: money(invoice.subtotal),
      discountAmount: money(invoice.discountAmount),
      shippingAmount: money(invoice.shippingAmount),
      taxAmount: money(invoice.taxAmount),
      totalAmount,
      amountPaid,
      amountDue,
      currency: invoice.currency,
      fileUrl: invoice.fileUrl,
      externalPaymentUrl: invoice.externalPaymentUrl,
      notes: invoice.notes,
      payment: invoicePaymentState(invoice),
      lastDelivery,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
    if (!detailed) return base;
    return {
      ...base,
      lineItems: invoiceLineItems(invoice.lineItems),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amount: money(payment.amount),
        method: payment.method,
        note: payment.note,
        recordedAt: payment.recordedAt.toISOString(),
        recordedByMemberId: payment.recordedByMemberId,
      })),
      activities: invoice.activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        actorMemberId: activity.actorMemberId,
        metadata: activity.metadata,
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  private requireTenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
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
    const dateRange = this.dateRangeFromQuery(query.dateFrom, query.dateTo);
    if (dateRange) {
      and.push({
        OR: [
          { processedAt: dateRange },
          { AND: [{ processedAt: null }, { createdAt: dateRange }] },
        ],
      });
    }
    if (query.search?.trim()) and.push(this.searchWhere(query.search));
    if (query.orderSearch?.trim()) and.push(this.orderSearchWhere(query.orderSearch));
    if (query.customerSearch?.trim()) and.push(this.customerSearchWhere(query.customerSearch));
    return and.length > 0 ? { AND: and } : {};
  }

  private orderByFromQuery(query: Partial<OrderListQuery>): CommerceOrderOrderBy {
    const direction: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';
    const sortBy: OrderSortBy = query.sortBy ?? 'shopify_updated';
    switch (sortBy) {
      case 'shopify_updated':
        return [
          { updatedAt: direction },
          { syncedAt: direction },
          { processedAt: direction },
          { createdAt: direction },
        ];
      case 'order_date':
        return [{ processedAt: direction }, { createdAt: direction }, { updatedAt: direction }];
      case 'order_number':
        return [{ shopifyOrderNumber: direction }, ...defaultOrderOrderBy];
      case 'customer_name':
        return [{ customer: { companyName: direction } }, { email: direction }, ...defaultOrderOrderBy];
      case 'total':
        return [{ totalPrice: direction }, ...defaultOrderOrderBy];
      case 'payment':
        return [{ financialStatus: direction }, ...defaultOrderOrderBy];
      case 'fulfillment':
        return [{ fulfillmentStatus: direction }, { fulfillmentMode: direction }, ...defaultOrderOrderBy];
      default:
        return assertNever(sortBy);
    }
  }

  private searchWhere(value: string): Prisma.CommerceOrderWhereInput {
    const search = value.trim();
    return {
      OR: [
        ...this.orderSearchConditions(search),
        ...this.customerSearchConditions(search),
      ],
    };
  }

  private orderSearchWhere(value: string): Prisma.CommerceOrderWhereInput {
    return { OR: this.orderSearchConditions(value.trim()) };
  }

  private customerSearchWhere(value: string): Prisma.CommerceOrderWhereInput {
    return { OR: this.customerSearchConditions(value.trim()) };
  }

  private orderSearchConditions(search: string): Prisma.CommerceOrderWhereInput[] {
    return [
      { id: { contains: search, mode: 'insensitive' } },
      { shopifyOrderId: { contains: search, mode: 'insensitive' } },
      { shopifyOrderNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  private customerSearchConditions(search: string): Prisma.CommerceOrderWhereInput[] {
    return [
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { shopifyCustomerId: { contains: search, mode: 'insensitive' } },
      { customer: { companyName: { contains: search, mode: 'insensitive' } } },
      { customer: { legalName: { contains: search, mode: 'insensitive' } } },
      { customer: { firstName: { contains: search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: search, mode: 'insensitive' } } },
      { customer: { email: { contains: search, mode: 'insensitive' } } },
      { customer: { phone: { contains: search, mode: 'insensitive' } } },
    ];
  }

  private dateRangeFromQuery(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter<'CommerceOrder'> | null {
    const from = this.parseOrderDateFilter(dateFrom, false);
    const to = this.parseOrderDateFilter(dateTo, true);
    if (!from && !to) return null;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('Order date range start must be before the end date');
    }
    return {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  private parseOrderDateFilter(value: string | undefined, endOfDay: boolean) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : trimmed;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid order date filter');
    return date;
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
      pickup: detailed && order.pickupOrder ? {
        id: order.pickupOrder.id,
        status: order.pickupOrder.status,
        qrCode: order.pickupOrder.qrCode,
        shelfCode: stringValue(jsonObject(order.pickupOrder.metadata).shelfCode),
        note: stringValue(jsonObject(order.pickupOrder.metadata).note),
        pickupAt: order.pickupOrder.pickupAt?.toISOString() ?? null,
        createdAt: order.pickupOrder.createdAt.toISOString(),
        updatedAt: order.pickupOrder.updatedAt.toISOString(),
        history: Array.isArray(jsonObject(order.pickupOrder.metadata).history)
          ? jsonObject(order.pickupOrder.metadata).history
          : [],
      } : undefined,
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

const PICKUP_STATUS_RANK: Record<string, number> = {
  pending: 0,
  processing: 1,
  ready: 2,
  notified: 3,
  picked_up: 4,
};

function assertPickupStatusTransition(current: string, next: string) {
  if (current === next) return;
  if (current === 'picked_up' || current === 'cancelled') {
    throw new ConflictException(`Pickup status ${current} is final`);
  }
  if (next === 'cancelled') return;
  const currentRank = PICKUP_STATUS_RANK[current];
  const nextRank = PICKUP_STATUS_RANK[next];
  if (currentRank === undefined || nextRank === undefined || nextRank < currentRank) {
    throw new BadRequestException(`Pickup status cannot move from ${current} to ${next}`);
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function invoiceItemsFromOrder(order: CommerceOrderWithRelations | null) {
  if (!order) return [];
  return jsonArray(order.lineItems).map((item, index) => {
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const unitPrice = money(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
    return {
      id: stringValue(item.id) ?? `${order.id}-invoice-line-${index + 1}`,
      sku: stringValue(item.sku),
      name: stringValue(item.title ?? item.name ?? item.product_title) ?? `Line item ${index + 1}`,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPrice,
      total: roundMoney((Number.isFinite(quantity) && quantity > 0 ? quantity : 1) * unitPrice),
    };
  });
}

function invoiceLineTotal(item: { quantity?: number; unitPrice?: number; total?: number }) {
  return item.total ?? roundMoney((item.quantity ?? 1) * (item.unitPrice ?? 0));
}

function invoiceLineItems(value: unknown) {
  return jsonArray(value).map((item, index) => {
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const unitPrice = money(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
    return {
      id: stringValue(item.id) ?? `invoice-line-${index + 1}`,
      sku: stringValue(item.sku),
      name: stringValue(item.name ?? item.title) ?? `Invoice line ${index + 1}`,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPrice,
      total: money(item.total ?? item.lineTotal ?? item.line_total) || roundMoney((Number.isFinite(quantity) && quantity > 0 ? quantity : 1) * unitPrice),
    };
  });
}

function invoicePaymentState(invoice: Pick<InvoiceRecord, 'status' | 'totalAmount' | 'amountPaid' | 'externalPaymentUrl' | 'fileUrl'>) {
  const total = money(invoice.totalAmount);
  const paid = money(invoice.amountPaid);
  const amountDue = Math.max(0, roundMoney(total - paid));
  if (invoice.status === 'draft') return { state: 'draft', amountDue, url: null, label: 'Draft invoice' };
  if (amountDue <= 0) return { state: 'paid', amountDue, url: null, label: 'Paid in full' };
  if (isInvoiceWebUrl(invoice.externalPaymentUrl)) return { state: 'payment_link', amountDue, url: invoice.externalPaymentUrl, label: 'Open payment link' };
  if (isInvoiceWebUrl(invoice.fileUrl)) return { state: 'invoice_file', amountDue, url: invoice.fileUrl, label: 'Open invoice file' };
  return { state: 'contact_billing', amountDue, url: null, label: 'Contact billing' };
}

function invoiceStatusFromPayment(currentStatus: string, totalAmount: number, amountPaid: number) {
  if (currentStatus === 'void') return 'void';
  if (currentStatus === 'draft') return 'draft';
  if (totalAmount > 0 && amountPaid >= totalAmount) return 'paid';
  if (amountPaid > 0) return 'partial';
  if (currentStatus === 'overdue') return 'overdue';
  return 'unpaid';
}

function assertInvoiceUrl(value: string | null | undefined, label: string) {
  if (value === null || value === undefined || value === '') return;
  if (!isInvoiceWebUrl(value)) {
    throw new BadRequestException(`${label} must start with http:// or https://`);
  }
}

function isInvoiceWebUrl(value: string | null | undefined) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function customerDisplayName(customer: InvoiceRecord['customer']) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
    || customer.companyName
    || customer.email
    || 'Customer';
}

function invoiceLastDelivery(invoice: InvoiceRecord) {
  const activity = invoice.activities.find((entry) => entry.action === 'invoice_sent');
  if (!activity) return null;
  const metadata = activity.metadata && typeof activity.metadata === 'object' && !Array.isArray(activity.metadata)
    ? activity.metadata as Record<string, unknown>
    : {};
  return {
    id: stringValue(metadata.mailDeliveryId),
    status: stringValue(metadata.status) ?? 'recorded',
    recipientEmail: stringValue(metadata.recipientEmail),
    sentAt: activity.createdAt.toISOString(),
  };
}

function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//');
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
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

function assertNever(value: never): never {
  throw new BadRequestException(`Unsupported order sort field: ${String(value)}`);
}
