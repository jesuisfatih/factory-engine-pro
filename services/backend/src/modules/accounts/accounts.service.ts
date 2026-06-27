import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AccountAddressInput,
  AccountAddressType,
  CreateAccountSupportTicketInput,
  PrincipalType,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PasswordService } from '../../shared/password.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

type CustomerUserRecord = Prisma.CustomerUserGetPayload<{
  include: { customer: true; roleAssignments: { include: { role: true } } };
}>;
type SubUserRecord = Prisma.SubUserGetPayload<{
  include: { customer: true; roleAssignments: { include: { role: true } } };
}>;

type AccountActor = {
  principalId: string;
  principalType: Extract<PrincipalType, 'customer_user' | 'sub_user'>;
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  passwordHash: string | null;
  spendingLimitCents: number | null;
  spendingUsedCents: number;
  roleNames: string[];
  customer: CustomerUserRecord['customer'];
};

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly password: PasswordService,
    private readonly logger: AppLogger,
  ) {}

  async profile() {
    const actor = await this.currentActor();
    return this.profilePayload(actor);
  }

  async updateProfile(input: UpdateAccountProfileInput) {
    const actor = await this.currentActor();
    if (actor.principalType === 'customer_user') {
      await this.prisma.db.customerUser.updateMany({
        where: { id: actor.principalId },
        data: {
          ...(input.firstName !== undefined && { firstName: input.firstName }),
          ...(input.lastName !== undefined && { lastName: input.lastName }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
        },
      });
    } else {
      await this.prisma.db.subUser.updateMany({
        where: { id: actor.principalId },
        data: {
          ...(input.firstName !== undefined && { firstName: input.firstName }),
          ...(input.lastName !== undefined && { lastName: input.lastName }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
        },
      });
    }
    this.logger.log('accounts', 'profile.update', 'Customer profile updated', { principal_id: actor.principalId });
    return this.profile();
  }

  async updatePassword(input: UpdateAccountPasswordInput) {
    const actor = await this.currentActor();
    if (!actor.passwordHash) throw new BadRequestException('This account must accept an invitation before changing password');
    const valid = await this.password.verify(input.currentPassword, actor.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is invalid');
    const passwordHash = await this.password.hash(input.newPassword);
    if (actor.principalType === 'customer_user') {
      await this.prisma.db.customerUser.updateMany({ where: { id: actor.principalId }, data: { passwordHash } });
    } else {
      await this.prisma.db.subUser.updateMany({ where: { id: actor.principalId }, data: { passwordHash } });
    }
    this.logger.log('accounts', 'password.update', 'Customer password changed', { principal_id: actor.principalId });
    return { ok: true, request_id: this.tenantContext.require().requestId };
  }

  async addresses() {
    const actor = await this.currentActor();
    return this.addressList(actor.customer);
  }

  async saveAddress(type: AccountAddressType, input: AccountAddressInput) {
    const actor = await this.currentActor();
    if (type !== input.type) throw new BadRequestException('Address type does not match route');
    const address = addressToJson(input);
    const data: Prisma.CustomerUpdateManyMutationInput = type === 'billing'
      ? { billingAddress: address as Prisma.InputJsonValue }
      : { shippingAddress: address as Prisma.InputJsonValue };
    await this.prisma.db.customer.updateMany({ where: { id: actor.customerId }, data });
    this.logger.log('accounts', 'address.save', 'Customer address saved', { customer_id: actor.customerId, address_type: type });
    return (await this.addresses()).find((item) => item.type === type) ?? null;
  }

  async deleteAddress(type: AccountAddressType) {
    const actor = await this.currentActor();
    const data: Prisma.CustomerUpdateManyMutationInput = type === 'billing'
      ? { billingAddress: Prisma.DbNull }
      : { shippingAddress: Prisma.DbNull };
    await this.prisma.db.customer.updateMany({ where: { id: actor.customerId }, data });
    this.logger.log('accounts', 'address.delete', 'Customer address deleted', { customer_id: actor.customerId, address_type: type });
    return { ok: true };
  }

  async orders() {
    const actor = await this.currentActor();
    const rows = await this.customerOrders(actor.customerId, 100);
    return rows.map((order) => this.buyerOrder(order, actor));
  }

  async reorderTemplates() {
    const actor = await this.currentActor();
    const rows = await this.customerOrders(actor.customerId, 50);
    return rows
      .filter((order) => jsonArray(order.lineItems).length > 0)
      .map((order) => ({
        id: `reorder-${order.id}`,
        name: `Reorder ${order.shopifyOrderNumber ?? order.id}`,
        useCount: 1,
        lastUsedAt: isoDate(order.processedAt ?? order.createdAt),
        items: lineItems(order.lineItems),
      }));
  }

  async products() {
    const products = await this.prisma.db.catalogProduct.findMany({
      where: { status: 'active' },
      include: { variants: true },
      orderBy: { title: 'asc' },
      take: 120,
    });
    return products.flatMap((product, productIndex) => {
      const variants = product.variants.length > 0 ? product.variants : [null];
      return variants.map((variant, variantIndex) => {
        const listPrice = money(variant?.compareAtPrice ?? variant?.price ?? 0);
        const yourPrice = money(variant?.price ?? 0);
        const variantTitle = variant?.title && !['default title', 'default'].includes(variant.title.toLowerCase())
          ? ` - ${variant.title}`
          : '';
        return {
          id: variant?.id ?? product.id,
          productId: product.id,
          variantId: variant?.id ?? null,
          name: `${product.title}${variantTitle}`,
          sku: variant?.sku ?? product.handle ?? product.shopifyProductId,
          vendor: product.vendor ?? 'Catalog',
          listPriceUsd: listPrice,
          yourPriceUsd: yourPrice,
          inStock: variant?.availableForSale ?? true,
          inventoryQuantity: variant?.inventoryQuantity ?? null,
          imageUrl: firstImageUrl(product.images),
          imageBg: swatch(productIndex + variantIndex),
        };
      });
    });
  }

  async tracking() {
    const actor = await this.currentActor();
    const rows = await this.customerOrders(actor.customerId, 100);
    return rows.map((order) => this.trackingOrder(order, actor));
  }

  async pickup() {
    const actor = await this.currentActor();
    const rows = await this.prisma.db.commercePickupOrder.findMany({
      where: { customerId: actor.customerId },
      include: { order: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((pickup) => ({
      id: pickup.id,
      orderNumber: pickup.orderNumber ?? pickup.order.shopifyOrderNumber ?? pickup.order.id,
      status: pickupStatus(pickup.status),
      placedAt: isoDate(pickup.order.processedAt ?? pickup.order.createdAt),
      shelfCode: stringValue(metadata(pickup.metadata).shelfCode ?? metadata(pickup.metadata).shelf),
      pickupBy: pickup.pickupAt ? isoDate(pickup.pickupAt) : null,
      qrPayload: pickup.qrCode ?? pickup.id,
      designFiles: jsonArray(pickup.designFiles).map((file, index) => ({
        id: stringValue(file.id) ?? `${pickup.id}-file-${index}`,
        name: stringValue(file.name ?? file.filename ?? file.value) ?? `Design file ${index + 1}`,
        previewUrl: stringValue(file.previewUrl ?? file.url ?? file.value) ?? '#',
      })),
      steps: pickupSteps(pickup.status, pickup.createdAt, pickup.pickupAt),
    }));
  }

  async invoices() {
    const actor = await this.currentActor();
    const rows = await this.customerOrders(actor.customerId, 100);
    return rows.map((order) => {
      const issued = order.processedAt ?? order.createdAt;
      const due = addDays(issued, 30);
      const total = money(order.totalPrice);
      const paid = paidAmount(order.financialStatus, total, money(order.totalRefunded));
      const status = invoiceStatus(order.financialStatus, due, paid, total);
      return {
        id: `invoice-${order.id}`,
        orderId: order.id,
        invoiceNumber: `INV-${order.shopifyOrderNumber ?? order.id}`,
        orderNumber: order.shopifyOrderNumber ?? order.id,
        status,
        issuedAt: isoDate(issued),
        dueAt: isoDate(due),
        totalUsd: total,
        paidUsd: paid,
      };
    });
  }

  async documents() {
    const actor = await this.currentActor();
    const requests = await this.prisma.db.b2BAccessRequest.findMany({
      where: {
        OR: [
          { resolvedCustomerId: actor.customerId },
          { resolvedCustomerUserId: actor.principalType === 'customer_user' ? actor.principalId : undefined },
          { email: actor.email },
        ].filter((item) => Object.values(item).every((value) => value !== undefined)),
      },
      include: { files: true },
      orderBy: { submittedAt: 'desc' },
      take: 25,
    });
    return requests.flatMap((request) => request.files.map((file) => ({
      id: file.id,
      name: file.originalFilename,
      category: documentCategory(file.originalFilename, file.mimeType),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      uploadedAt: isoDate(file.uploadedAt),
      uploadedBy: request.email,
      requestId: request.id,
    })));
  }

  async documentFile(id: string) {
    const actor = await this.currentActor();
    const file = await this.prisma.db.b2BAccessRequestFile.findFirst({
      where: {
        id,
        request: {
          OR: [
            { resolvedCustomerId: actor.customerId },
            { resolvedCustomerUserId: actor.principalType === 'customer_user' ? actor.principalId : undefined },
            { email: actor.email },
          ].filter((item) => Object.values(item).every((value) => value !== undefined)),
        },
      },
    });
    if (!file || !file.contentBase64) throw new NotFoundException('Document file not found');
    return {
      filename: file.originalFilename,
      mimeType: file.mimeType,
      buffer: Buffer.from(file.contentBase64, 'base64'),
    };
  }

  async supportTickets() {
    const actor = await this.currentActor();
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: { customerId: actor.customerId, surface: 'customer_facing' },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.id,
      subject: ticket.title,
      description: ticket.description ?? '',
      category: supportCategory(metadata(ticket.metadata).category),
      priority: supportPriority(ticket.priority),
      relatedTo: stringValue(metadata(ticket.metadata).relatedTo),
      status: supportStatus(ticket.status),
      updatedAt: isoDate(ticket.updatedAt),
      responses: ticket.comments
        .filter((comment) => !comment.internal)
        .map((comment) => ({
          id: comment.id,
          author: comment.actorId === actor.principalId ? 'You' : 'Support team',
          at: isoDate(comment.createdAt),
          body: comment.body,
          fromMe: comment.actorId === actor.principalId,
        })),
      satisfactionRating: null,
    }));
  }

  async createSupportTicket(input: CreateAccountSupportTicketInput) {
    const actor = await this.currentActor();
    const ticket = await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        customerId: actor.customerId,
        customerUserId: actor.principalType === 'customer_user' ? actor.principalId : null,
        source: 'form',
        surface: 'customer_facing',
        title: input.subject,
        description: input.description,
        priority: input.priority === 'normal' ? 'medium' : input.priority,
        createdByActorId: actor.principalId,
        metadata: {
          category: input.category,
          ...(input.relatedTo ? { relatedTo: input.relatedTo } : {}),
        },
      },
    });
    await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId: this.tenantId(),
        serviceRequestId: ticket.id,
        actorId: actor.principalId,
        actorType: actor.principalType,
        body: input.description,
        internal: false,
        attachmentsJson: [],
      },
    });
    this.logger.log('accounts', 'support.create', 'Customer support ticket created', { service_request_id: ticket.id });
    return (await this.supportTickets()).find((item) => item.id === ticket.id) ?? ticket;
  }

  private async customerOrders(customerId: string, take: number) {
    return this.prisma.db.commerceOrder.findMany({
      where: { customerId },
      include: { customer: true, customerUser: true, pickupOrder: true },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  private async currentActor(): Promise<AccountActor> {
    const context = this.tenantContext.require();
    if (!context.principalId || !context.principalType) throw new UnauthorizedException('Missing principal context');
    if (context.principalType === 'customer_user') {
      const user = await this.prisma.db.customerUser.findFirst({
        where: { id: context.principalId },
        include: { customer: true, roleAssignments: { include: { role: true } } },
      });
      if (!user) throw new UnauthorizedException('Customer user no longer exists');
      return this.fromCustomerUser(user);
    }
    if (context.principalType === 'sub_user') {
      const user = await this.prisma.db.subUser.findFirst({
        where: { id: context.principalId },
        include: { customer: true, roleAssignments: { include: { role: true } } },
      });
      if (!user) throw new UnauthorizedException('Sub-user no longer exists');
      return this.fromSubUser(user);
    }
    throw new ForbiddenException('Accounts portal is only available to customer users');
  }

  private fromCustomerUser(user: CustomerUserRecord): AccountActor {
    return {
      principalId: user.id,
      principalType: 'customer_user',
      customerId: user.customerId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      passwordHash: user.passwordHash,
      spendingLimitCents: user.spendingLimitCents,
      spendingUsedCents: user.spendingUsedCents,
      roleNames: user.roleAssignments.map((assignment) => assignment.role.name),
      customer: user.customer,
    };
  }

  private fromSubUser(user: SubUserRecord): AccountActor {
    return {
      principalId: user.id,
      principalType: 'sub_user',
      customerId: user.customerId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      passwordHash: user.passwordHash,
      spendingLimitCents: user.spendingLimitCents,
      spendingUsedCents: user.spendingUsedCents,
      roleNames: user.roleAssignments.map((assignment) => assignment.role.name),
      customer: user.customer,
    };
  }

  private profilePayload(actor: AccountActor) {
    return {
      id: actor.principalId,
      type: actor.principalType,
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
      phone: actor.phone ?? '',
      status: actor.status,
      role: actor.roleNames[0] ?? (actor.principalType === 'customer_user' ? 'B2B Admin' : 'B2B User'),
      company: actor.customer.companyName,
      companyName: actor.customer.companyName,
      customerId: actor.customerId,
      taxId: actor.customer.taxId,
      ordersCount: actor.customer.ordersCount,
      quotesCount: 0,
      totalSpentUsd: money(actor.customer.totalSpent),
      spendingLimitCents: actor.spendingLimitCents,
      spendingUsedCents: actor.spendingUsedCents,
      addresses: this.addressList(actor.customer),
    };
  }

  private addressList(customer: AccountActor['customer']) {
    return [
      addressFromJson('shipping', customer.shippingAddress, customer),
      addressFromJson('billing', customer.billingAddress, customer),
    ].filter((item): item is AccountAddressInput => Boolean(item));
  }

  private buyerOrder(order: Awaited<ReturnType<AccountsService['customerOrders']>>[number], actor: AccountActor) {
    const items = lineItems(order.lineItems);
    return {
      id: order.id,
      orderNumber: order.shopifyOrderNumber ?? order.id,
      placedAt: isoDate(order.processedAt ?? order.createdAt),
      placedBy: order.customerUser ? `${order.customerUser.firstName} ${order.customerUser.lastName}`.trim() : actor.customer.companyName,
      status: orderStatus(order.financialStatus, order.fulfillmentStatus, order.cancelledAt),
      totalUsd: money(order.totalPrice),
      itemsCount: items.reduce((sum, item) => sum + item.qty, 0),
      items,
    };
  }

  private trackingOrder(order: Awaited<ReturnType<AccountsService['customerOrders']>>[number], actor: AccountActor) {
    const fulfillment = firstFulfillment(order.fulfillments);
    const status = trackingStatus(order.fulfillmentStatus, fulfillment.trackingNumber);
    return {
      id: order.id,
      orderNumber: order.shopifyOrderNumber ?? order.id,
      customerName: order.customer?.companyName ?? actor.customer.companyName,
      status,
      carrier: fulfillment.carrier ?? 'Carrier pending',
      trackingNumber: fulfillment.trackingNumber ?? '-',
      trackingUrl: fulfillment.trackingUrl ?? null,
      shippingAddress: formatAddress(order.shippingAddress),
      steps: trackingSteps(order, status),
    };
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}

function addressFromJson(type: AccountAddressType, value: unknown, customer: AccountActor['customer']): AccountAddressInput | null {
  const data = objectRecord(value);
  if (!data) return null;
  const address1 = stringValue(data.address1 ?? data.address_1 ?? data.addressLine1 ?? data.line1 ?? data.address);
  if (!address1) return null;
  return {
    id: type,
    type,
    firstName: stringValue(data.firstName ?? data.first_name) ?? customer.firstName ?? '',
    lastName: stringValue(data.lastName ?? data.last_name) ?? customer.lastName ?? '',
    company: stringValue(data.company ?? data.companyName ?? data.company_name) ?? customer.companyName,
    address1,
    address2: stringValue(data.address2 ?? data.address_2 ?? data.addressLine2 ?? data.line2) ?? '',
    city: stringValue(data.city) ?? '',
    province: stringValue(data.province ?? data.state) ?? '',
    zip: stringValue(data.zip ?? data.postalCode ?? data.postal_code) ?? '',
    country: stringValue(data.country ?? data.countryCode ?? data.country_code) ?? 'US',
    phone: stringValue(data.phone) ?? customer.phone ?? '',
    isDefault: booleanValue(data.isDefault ?? data.default) ?? true,
  };
}

function addressToJson(input: AccountAddressInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    province: input.province,
    zip: input.zip,
    country: input.country,
    phone: input.phone,
    isDefault: input.isDefault,
  };
}

function lineItems(value: unknown) {
  return jsonArray(value).map((item, index) => {
    const qty = numberValue(item.quantity ?? item.qty) || 1;
    const unit = numberValue(item.unitPrice ?? item.unit_price ?? item.price ?? item.original_unit_price) || 0;
    return {
      sku: stringValue(item.sku ?? item.variant_sku ?? item.shopifyVariantId) ?? `line-${index + 1}`,
      name: stringValue(item.title ?? item.name ?? item.product_title) ?? `Line item ${index + 1}`,
      qty,
      unitPriceUsd: unit,
    };
  });
}

function orderStatus(financialStatus: string | null, fulfillmentStatus: string | null, cancelledAt: Date | null) {
  if (cancelledAt) return 'cancelled';
  const fulfillment = (fulfillmentStatus ?? '').toLowerCase();
  if (['fulfilled', 'complete', 'completed'].includes(fulfillment)) return 'fulfilled';
  const financial = (financialStatus ?? '').toLowerCase();
  if (['paid', 'authorized', 'partially_paid'].includes(financial)) return 'paid';
  return 'pending';
}

function trackingStatus(fulfillmentStatus: string | null, trackingNumber: string | null) {
  const fulfillment = (fulfillmentStatus ?? '').toLowerCase();
  if (['fulfilled', 'complete', 'completed', 'delivered'].includes(fulfillment)) return 'delivered';
  if (trackingNumber || ['partial', 'in_progress', 'shipped'].includes(fulfillment)) return 'in_transit';
  return 'pending';
}

function trackingSteps(order: { processedAt: Date | null; createdAt: Date; fulfillmentStatus: string | null; syncedAt: Date }, status: string) {
  const placedAt = order.processedAt ?? order.createdAt;
  return [
    { key: 'placed', label: 'Order placed', done: true, at: isoDate(placedAt) },
    { key: 'production', label: 'Production started', done: status !== 'pending', at: status !== 'pending' ? isoDate(order.syncedAt) : null },
    { key: 'carrier', label: 'Carrier handoff', done: status === 'in_transit' || status === 'delivered', at: status === 'pending' ? null : isoDate(order.syncedAt) },
    { key: 'delivered', label: 'Delivered', done: status === 'delivered', at: status === 'delivered' ? isoDate(order.syncedAt) : null },
  ];
}

function pickupSteps(status: string, createdAt: Date, pickupAt: Date | null) {
  const normalized = pickupStatus(status);
  return [
    { key: 'queued', label: 'Order received', done: true, at: isoDate(createdAt) },
    { key: 'production', label: 'In production', done: ['in_production', 'ready_for_pickup', 'picked_up'].includes(normalized), at: null },
    { key: 'ready', label: 'Ready for pickup', done: ['ready_for_pickup', 'picked_up'].includes(normalized), at: null },
    { key: 'picked', label: 'Picked up', done: normalized === 'picked_up', at: pickupAt ? isoDate(pickupAt) : null },
  ];
}

function pickupStatus(status: string) {
  const value = status.toLowerCase();
  if (['ready', 'ready_for_pickup'].includes(value)) return 'ready_for_pickup';
  if (['complete', 'completed', 'picked_up'].includes(value)) return 'picked_up';
  if (['in_production', 'processing'].includes(value)) return 'in_production';
  return 'in_production';
}

function invoiceStatus(financialStatus: string | null, dueAt: Date, paid: number, total: number) {
  const status = (financialStatus ?? '').toLowerCase();
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  if (['pending', 'unpaid', 'voided'].includes(status) && dueAt.getTime() < Date.now()) return 'overdue';
  return 'unpaid';
}

function paidAmount(financialStatus: string | null, total: number, refunded: number) {
  const status = (financialStatus ?? '').toLowerCase();
  if (['paid', 'authorized'].includes(status)) return Math.max(0, total - refunded);
  if (status === 'partially_paid') return Math.max(0, Math.round((total / 2) * 100) / 100);
  return 0;
}

function documentCategory(filename: string, mimeType: string) {
  const lower = `${filename} ${mimeType}`.toLowerCase();
  if (lower.includes('tax')) return 'tax';
  if (lower.includes('certificate') || lower.includes('cert')) return 'certificate';
  if (lower.includes('license')) return 'license';
  if (lower.includes('contract')) return 'contract';
  return 'other';
}

function supportStatus(status: string) {
  const value = status.toLowerCase();
  if (['resolved', 'closed'].includes(value)) return value;
  if (['in_progress', 'waiting', 'waiting_on_customer', 'pending_resolve', 'reopened'].includes(value)) return 'in_progress';
  return 'open';
}

function supportPriority(priority: string) {
  if (priority === 'medium') return 'normal';
  if (['low', 'normal', 'high', 'urgent'].includes(priority)) return priority;
  return 'normal';
}

function supportCategory(value: unknown) {
  const text = stringValue(value);
  return text && ['billing', 'shipping', 'product', 'account', 'other'].includes(text) ? text : 'other';
}

function firstFulfillment(value: unknown) {
  const first = jsonArray(value)[0] ?? {};
  return {
    carrier: stringValue(first.tracking_company ?? first.carrier ?? first.company),
    trackingNumber: stringValue(first.tracking_number ?? first.trackingNumber),
    trackingUrl: stringValue(first.tracking_url ?? first.trackingUrl),
  };
}

function firstImageUrl(value: unknown) {
  const first = jsonArray(value)[0] ?? objectRecord(value);
  return stringValue(first?.src ?? first?.url ?? first?.originalSrc) ?? null;
}

function formatAddress(value: unknown) {
  const data = objectRecord(value);
  if (!data) return '-';
  return [
    stringValue(data.name),
    stringValue(data.address1 ?? data.line1),
    stringValue(data.address2 ?? data.line2),
    [stringValue(data.city), stringValue(data.province ?? data.state), stringValue(data.zip ?? data.postalCode)].filter(Boolean).join(', '),
    stringValue(data.country),
  ].filter(Boolean).join('\n') || '-';
}

function metadata(value: unknown) {
  return objectRecord(value) ?? {};
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function jsonArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return null;
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function swatch(index: number) {
  const colors = ['#E0F2FE', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#EDE9FE', '#FFE4E6', '#DBEAFE'];
  return colors[index % colors.length];
}
