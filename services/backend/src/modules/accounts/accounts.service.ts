import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AccountAddressInput,
  AccountAddressType,
  AccountCartAddItemInput,
  AccountCartCheckoutInput,
  AccountCartCreateInput,
  AccountCartUpdateItemInput,
  AccountDocumentListQuery,
  AccountInvoiceListQuery,
  AccountOrderListQuery,
  AccountReorderInput,
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
import { algorithmScore, algorithmScoreBand, algorithmVisible } from '../rules/algorithm-runtime.js';
import { RulesService } from '../rules/rules.service.js';
import { AccountsCheckoutService, type AccountCheckoutAttempt } from './accounts-checkout.service.js';

type CustomerUserRecord = Prisma.CustomerUserGetPayload<{
  include: { customer: true; roleAssignments: { include: { role: true } } };
}>;
type SubUserRecord = Prisma.SubUserGetPayload<{
  include: { customer: true; roleAssignments: { include: { role: true } } };
}>;
type AccountOrderRecord = Prisma.CommerceOrderGetPayload<{
  include: { customer: true; customerUser: true; pickupOrder: true };
}>;
type AccountInvoiceRecord = Prisma.AccountInvoiceGetPayload<{
  include: { order: true };
}>;
type AccountInvoiceDetailRecord = Prisma.AccountInvoiceGetPayload<{
  include: {
    order: true;
    payments: { orderBy: { recordedAt: 'desc' } };
    activities: { orderBy: { createdAt: 'desc' } };
  };
}>;
type AccountCartRecord = Prisma.AccountReorderCartGetPayload<{
  include: { items: true; sourceOrder: true; activities: true };
}>;
type AccountCartCatalogVariant = Prisma.CatalogVariantGetPayload<{
  include: { product: true };
}>;

type AccountDocumentItem = {
  id: string;
  name: string;
  category: 'invoice' | 'design' | 'contract' | 'certificate' | 'tax' | 'license' | 'other';
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string;
  uploadedBy: string;
  documentKind: 'account_file' | 'invoice_file' | 'order_design_file';
  addedAs: string;
  relatedLabel: string | null;
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  downloadMode: 'api' | 'url';
  downloadUrl: string | null;
  sortAt: Date;
};

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
    private readonly checkout: AccountsCheckoutService,
    private readonly rules: RulesService,
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
    return { ok: true };
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

  async orders(query: AccountOrderListQuery) {
    const actor = await this.currentActor();
    const page = await this.customerOrderPage(actor, query);
    return {
      data: page.rows.map((order) => this.buyerOrder(order, actor)),
      meta: page.meta,
    };
  }

  async orderDetail(orderId: string) {
    const actor = await this.currentActor();
    const order = await this.findCustomerOrder(actor, orderId);
    return this.buyerOrderDetail(order, actor);
  }

  async reorderOrder(orderId: string, input: AccountReorderInput) {
    const actor = await this.currentActor();
    const order = await this.findCustomerOrder(actor, orderId);
    const items = this.reorderableLineItems(order, input.quantity);
    return this.createReorderCart(actor, order, items);
  }

  async reorderLineItem(orderId: string, lineItemId: string, input: AccountReorderInput) {
    const actor = await this.currentActor();
    const order = await this.findCustomerOrder(actor, orderId);
    const item = detailedLineItems(order).find((line) => line.id === lineItemId || line.sourceKey === lineItemId);
    if (!item) throw new NotFoundException('Order line item not found');
    return this.createReorderCart(actor, order, [this.reorderLineFromDetail(item, input.quantity)]);
  }

  async activeCart() {
    const actor = await this.currentActor();
    const cart = await this.prisma.db.accountReorderCart.findFirst({
      where: { customerId: actor.customerId, status: { in: ['review_required', 'unavailable', 'checkout_ready'] } },
      include: accountCartInclude(),
      orderBy: { updatedAt: 'desc' },
    });
    return cart ? this.buyerCart(cart) : null;
  }

  async createCart(input: AccountCartCreateInput) {
    const actor = await this.currentActor();
    const sourceOrder = input.originOrderId ? await this.findCustomerOrder(actor, input.originOrderId) : null;
    const cart = await this.prisma.db.accountReorderCart.create({
      data: {
        id: prefixedId('arc'),
        tenantId: this.tenantId(),
        customerId: actor.customerId,
        sourceOrderId: sourceOrder?.id ?? null,
        status: 'review_required',
        currency: sourceOrder?.currency ?? 'USD',
        subtotal: 0,
        totalAmount: 0,
        itemCount: 0,
        checkoutUrl: null,
        checkoutError: null,
        metadata: {
          source: 'customer_portal_cart',
          principalId: actor.principalId,
          principalType: actor.principalType,
          ...(input.reason ? { reason: input.reason } : {}),
        },
      },
      include: accountCartInclude(),
    });
    await this.recordCartActivity(actor, cart, {
      action: 'cart.created',
      label: 'Cart created',
      detail: sourceOrder
        ? `Reorder cart started from order ${sourceOrder.shopifyOrderNumber ?? sourceOrder.id}.`
        : 'Empty reorder cart started from the customer portal.',
      metadata: { sourceOrderId: sourceOrder?.id ?? null },
    });
    const refreshed = await this.requireOwnedCart(actor, cart.id);
    return this.buyerCart(refreshed);
  }

  async addCartItem(cartId: string, input: AccountCartAddItemInput) {
    const actor = await this.currentActor();
    const cart = await this.requireEditableCart(actor, cartId);
    const variant = await this.findCatalogVariantForCart(input);
    if (!variant) throw new NotFoundException('Catalog variant not found for this cart item');

    const quantity = Math.max(1, input.quantity);
    const existing = await this.prisma.db.accountReorderCartItem.findFirst({
      where: {
        cartId: cart.id,
        OR: [
          { catalogVariantId: variant.id },
          { shopifyVariantId: variant.shopifyVariantId },
          ...(variant.sku ? [{ sku: variant.sku }] : []),
        ],
      },
    });

    if (existing) {
      const nextQuantity = existing.quantity + quantity;
      await this.prisma.db.accountReorderCartItem.updateMany({
        where: { id: existing.id, cartId: cart.id },
        data: {
          quantity: nextQuantity,
          unitPrice: variant.price,
          lineTotal: roundMoney(money(variant.price) * nextQuantity),
          reorderable: variant.availableForSale,
          reason: variant.availableForSale ? 'Ready for portal review' : 'Variant is not currently available',
        },
      });
      await this.recordCartActivity(actor, cart, {
        action: 'cart.item_quantity_increased',
        label: 'Item quantity increased',
        detail: `${variant.product.title} quantity increased to ${nextQuantity}.`,
        metadata: { itemId: existing.id, catalogVariantId: variant.id, quantity: nextQuantity },
      });
    } else {
      const item = await this.prisma.db.accountReorderCartItem.create({
        data: {
          id: prefixedId('arci'),
          tenantId: this.tenantId(),
          cartId: cart.id,
          sourceOrderId: cart.sourceOrderId,
          sourceLineItemKey: variant.shopifyVariantId,
          productTitle: variant.product.title,
          variantTitle: variant.title,
          sku: variant.sku,
          quantity,
          unitPrice: variant.price,
          lineTotal: roundMoney(money(variant.price) * quantity),
          shopifyVariantId: variant.shopifyVariantId,
          catalogVariantId: variant.id,
          reorderable: variant.availableForSale,
          reason: variant.availableForSale ? 'Ready for portal review' : 'Variant is not currently available',
          propertiesJson: [],
          designFilesJson: [],
          metadata: { source: 'catalog_add' },
        },
      });
      await this.recordCartActivity(actor, cart, {
        action: 'cart.item_added',
        label: 'Item added',
        detail: `${variant.product.title} was added to the reorder cart.`,
        metadata: { itemId: item.id, catalogVariantId: variant.id, quantity },
      });
    }

    return this.recalculateCart(cart.id);
  }

  async updateCartItem(cartId: string, itemId: string, input: AccountCartUpdateItemInput) {
    const actor = await this.currentActor();
    const cart = await this.requireEditableCart(actor, cartId);
    const item = await this.prisma.db.accountReorderCartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');
    if (input.quantity <= 0) {
      await this.prisma.db.accountReorderCartItem.deleteMany({ where: { id: item.id, cartId: cart.id } });
      await this.recordCartActivity(actor, cart, {
        action: 'cart.item_removed',
        label: 'Item removed',
        detail: `${item.productTitle} was removed from the reorder cart.`,
        metadata: { itemId: item.id, previousQuantity: item.quantity },
      });
      return this.recalculateCart(cart.id);
    }
    await this.prisma.db.accountReorderCartItem.updateMany({
      where: { id: item.id, cartId: cart.id },
      data: {
        quantity: input.quantity,
        lineTotal: roundMoney(money(item.unitPrice) * input.quantity),
      },
    });
    await this.recordCartActivity(actor, cart, {
      action: 'cart.item_quantity_updated',
      label: 'Item quantity updated',
      detail: `${item.productTitle} quantity changed from ${item.quantity} to ${input.quantity}.`,
      metadata: { itemId: item.id, previousQuantity: item.quantity, quantity: input.quantity },
    });
    return this.recalculateCart(cart.id);
  }

  async removeCartItem(cartId: string, itemId: string) {
    const actor = await this.currentActor();
    const cart = await this.requireEditableCart(actor, cartId);
    const item = await this.prisma.db.accountReorderCartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');
    const deleted = await this.prisma.db.accountReorderCartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    if (deleted.count === 0) throw new NotFoundException('Cart item not found');
    await this.recordCartActivity(actor, cart, {
      action: 'cart.item_removed',
      label: 'Item removed',
      detail: `${item.productTitle} was removed from the reorder cart.`,
      metadata: { itemId: item.id, previousQuantity: item.quantity },
    });
    return this.recalculateCart(cart.id);
  }

  async checkoutCart(cartId: string, input: AccountCartCheckoutInput) {
    const actor = await this.currentActor();
    const cart = await this.requireOwnedCart(actor, cartId);
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');
    const reorderable = cart.items.filter((item) => item.reorderable);
    if (reorderable.length === 0) {
      await this.prisma.db.accountReorderCart.updateMany({
        where: { id: cart.id },
        data: { status: 'unavailable', checkoutError: 'No reorderable items are in this cart' },
      });
      await this.recordCartActivity(actor, cart, {
        action: 'cart.checkout_unavailable',
        label: 'Checkout unavailable',
        detail: 'No item in this cart can be checked out yet.',
        metadata: { reorderableCount: 0 },
      });
      const refreshed = await this.requireOwnedCart(actor, cart.id);
      return this.cartCheckoutPayload(refreshed, 'unavailable', 'No item in this cart can be checked out yet.');
    }
    if (cart.checkoutUrl) {
      await this.recordCartActivity(actor, cart, {
        action: 'cart.checkout_reopened',
        label: 'Checkout link opened',
        detail: 'Existing secure checkout link was opened again.',
        metadata: { checkoutUrlReady: true },
      });
      const refreshed = await this.requireOwnedCart(actor, cart.id);
      return this.cartCheckoutPayload(refreshed, 'checkout', 'Checkout is ready.');
    }

    const checkout = await this.checkout.createDraftOrderCheckout(cart, actor, { note: input.note });
    const updatedCart = await this.persistCheckoutAttempt(cart, checkout);
    if (checkout.checkoutUrl) {
      await this.recordCartActivity(actor, updatedCart, {
        action: 'cart.checkout_ready',
        label: 'Checkout ready',
        detail: 'Secure checkout was prepared for the reorder cart.',
        metadata: {
          executionMode: checkout.executionMode,
          shopifyDraftOrderId: checkout.shopifyDraftOrderId ?? null,
          shopifyDraftOrderName: checkout.shopifyDraftOrderName ?? null,
        },
      });
      const refreshed = await this.requireOwnedCart(actor, cart.id);
      return this.cartCheckoutPayload(refreshed, 'checkout', 'Checkout is ready.');
    }

    await this.prisma.db.accountReorderCart.updateMany({
      where: { id: cart.id },
      data: {
        status: 'review_required',
        checkoutError: customerSafeCheckoutError(checkout.checkoutError),
        metadata: {
          ...metadata(updatedCart.metadata),
          checkoutRequestedAt: new Date().toISOString(),
          checkoutRequestedBy: actor.principalId,
          ...(checkout.checkoutInternalError ? { checkoutInternalError: checkout.checkoutInternalError } : {}),
          ...(input.note ? { checkoutNote: input.note } : {}),
        } as Prisma.InputJsonValue,
      },
    });
    await this.recordCartActivity(actor, updatedCart, {
      action: 'cart.account_review_requested',
      label: 'Account review requested',
      detail: 'Checkout could not be shown yet, so the cart was saved for account review.',
      metadata: {
        executionMode: checkout.executionMode,
        checkoutError: customerSafeCheckoutError(checkout.checkoutError),
        note: input.note ?? null,
      },
    });
    const refreshed = await this.requireOwnedCart(actor, cart.id);
    return this.cartCheckoutPayload(refreshed, 'account_review', 'This cart was saved for account review. Checkout will appear only after availability and pricing are confirmed.');
  }

  async reorderTemplates() {
    const actor = await this.currentActor();
    const rows = await this.customerOrders(actor, 50);
    return rows
      .filter((order) => detailedLineItems(order).length > 0)
      .map((order) => ({
        id: order.id,
        orderId: order.id,
        name: `Reorder ${order.shopifyOrderNumber ?? order.id}`,
        useCount: 1,
        lastUsedAt: isoDate(order.processedAt ?? order.createdAt),
        items: detailedLineItems(order).map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          unitPriceUsd: item.unitPriceUsd,
          canReorder: item.canReorder,
          reason: item.reorderReason,
        })),
        canReorder: detailedLineItems(order).some((item) => item.canReorder),
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
    const rows = await this.customerOrders(actor, 100);
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

  async invoices(query: AccountInvoiceListQuery) {
    const actor = await this.currentActor();
    const offset = listOffset(query.cursor);
    const where = this.customerInvoiceListWhere(actor, query);
    const [rows, total] = await Promise.all([
      this.prisma.db.accountInvoice.findMany({
        where,
        include: { order: true },
        orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.db.accountInvoice.count({ where }),
    ]);
    return {
      data: rows.map((invoice) => this.buyerInvoice(invoice)),
      meta: listMeta(total, query.limit, offset, rows.length),
    };
  }

  private async customerOrderPage(actor: AccountActor, query: AccountOrderListQuery) {
    const offset = listOffset(query.cursor);
    const where = this.customerOrderListWhere(actor, query);
    const [rows, total] = await Promise.all([
      this.prisma.db.commerceOrder.findMany({
        where,
        include: { customer: true, customerUser: true, pickupOrder: true },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.db.commerceOrder.count({ where }),
    ]);
    return { rows, meta: listMeta(total, query.limit, offset, rows.length) };
  }

  private customerOrderListWhere(actor: AccountActor, query: AccountOrderListQuery): Prisma.CommerceOrderWhereInput {
    const conditions: Prisma.CommerceOrderWhereInput[] = [{ OR: this.ownOrderScopes(actor) }];
    const status = query.status ?? 'all';
    if (status !== 'all') conditions.push(this.customerOrderStatusWhere(status));
    if (query.pickupOnly) conditions.push({ pickupOrder: { isNot: null } });
    if (query.hasDesignFiles) {
      conditions.push({ NOT: { designFiles: { equals: [] } } } as Prisma.CommerceOrderWhereInput);
    }
    const search = query.search?.trim();
    if (search) {
      conditions.push({
        OR: [
          { shopifyOrderNumber: { contains: search, mode: 'insensitive' } },
          { shopifyOrderId: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: conditions };
  }

  private customerOrderStatusWhere(status: AccountOrderListQuery['status']): Prisma.CommerceOrderWhereInput {
    switch (status) {
      case 'cancelled':
        return { cancelledAt: { not: null } };
      case 'fulfilled':
        return { cancelledAt: null, fulfillmentStatus: { in: ['fulfilled', 'complete', 'completed'] } };
      case 'paid':
        return {
          cancelledAt: null,
          fulfillmentStatus: { notIn: ['fulfilled', 'complete', 'completed'] },
          financialStatus: { in: ['paid', 'authorized', 'partially_paid'] },
        };
      case 'pending':
        return {
          cancelledAt: null,
          fulfillmentStatus: { notIn: ['fulfilled', 'complete', 'completed'] },
          OR: [
            { financialStatus: null },
            { financialStatus: { notIn: ['paid', 'authorized', 'partially_paid'] } },
          ],
        };
      case 'all':
      default:
        return {};
    }
  }

  private customerInvoiceListWhere(actor: AccountActor, query: AccountInvoiceListQuery): Prisma.AccountInvoiceWhereInput {
    const conditions: Prisma.AccountInvoiceWhereInput[] = [{ customerId: actor.customerId }, { status: { not: 'draft' } }];
    const status = query.status ?? 'all';
    if (status !== 'all') conditions.push(this.customerInvoiceStatusWhere(status));
    const search = query.search?.trim();
    if (search) {
      conditions.push({
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { order: { shopifyOrderNumber: { contains: search, mode: 'insensitive' } } },
          { order: { shopifyOrderId: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    return { AND: conditions };
  }

  private customerInvoiceStatusWhere(status: AccountInvoiceListQuery['status']): Prisma.AccountInvoiceWhereInput {
    const now = new Date();
    switch (status) {
      case 'paid':
        return { status: 'paid' };
      case 'partial':
        return {
          OR: [
            { status: 'partial' },
            { AND: [{ amountPaid: { gt: 0 } }, { status: { not: 'paid' } }] },
          ],
        };
      case 'overdue':
        return {
          OR: [
            { status: 'overdue' },
            { AND: [{ dueAt: { lt: now } }, { status: { in: ['unpaid', 'partial'] } }] },
          ],
        };
      case 'unpaid':
        return {
          status: 'unpaid',
          amountPaid: { equals: 0 },
          OR: [{ dueAt: null }, { dueAt: { gte: now } }],
        };
      case 'all':
      default:
        return {};
    }
  }

  async invoiceDetail(invoiceId: string) {
    const invoice = await this.customerInvoice(invoiceId);
    return {
      ...this.buyerInvoice(invoice),
      subtotalUsd: money(invoice.subtotal),
      discountUsd: money(invoice.discountAmount),
      shippingUsd: money(invoice.shippingAmount),
      taxUsd: money(invoice.taxAmount),
      currency: invoice.currency,
      notes: invoice.notes,
      fileUrl: invoice.fileUrl,
      payment: invoicePayment(invoice),
      items: invoiceLineItems(invoice.lineItems),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amountUsd: money(payment.amount),
        method: invoicePaymentMethodLabel(payment.method),
        recordedAt: payment.recordedAt.toISOString(),
      })),
      activities: invoice.activities.map((activity) => ({
        id: activity.id,
        label: invoiceActivityLabel(activity.action),
        detail: invoiceActivityDetail(activity.action, activity.metadata),
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  async invoiceDownload(invoiceId: string) {
    const invoice = await this.customerInvoice(invoiceId);
    if (!invoice.fileUrl || !isAbsoluteWebUrl(invoice.fileUrl)) {
      throw new BadRequestException('No downloadable invoice file is attached to this invoice.');
    }
    return {
      action: 'download' as const,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      url: invoice.fileUrl,
      label: 'Download invoice',
      message: 'Invoice file is ready to download.',
    };
  }

  async invoicePay(invoiceId: string) {
    const invoice = await this.customerInvoice(invoiceId);
    const totalUsd = money(invoice.totalAmount);
    const paidUsd = money(invoice.amountPaid);
    const balanceUsd = Math.max(0, roundMoney(totalUsd - paidUsd));
    const base = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoiceStatus(invoice.status, invoice.dueAt ?? addDays(invoice.issuedAt, 30), paidUsd, totalUsd),
      currency: invoice.currency,
      totalUsd,
      paidUsd,
      balanceUsd,
      amountDueUsd: balanceUsd,
      downloadAvailable: isAbsoluteWebUrl(invoice.fileUrl),
    };

    if (balanceUsd <= 0 || invoice.status === 'paid') {
      return {
        ...base,
        action: 'paid' as const,
        url: null,
        label: 'Paid in full',
        message: 'This invoice is already paid.',
      };
    }

    if (isAbsoluteWebUrl(invoice.externalPaymentUrl)) {
      return {
        ...base,
        action: 'payment_link' as const,
        url: invoice.externalPaymentUrl,
        label: 'Open secure payment link',
        message: 'A secure payment link is available for this invoice.',
      };
    }

    return {
      ...base,
      action: 'contact_billing' as const,
      url: null,
      label: invoice.fileUrl ? 'Download invoice or contact billing' : 'Contact billing',
      message: invoice.fileUrl
        ? 'Online payment is not configured for this invoice. Download the invoice or contact billing to complete payment.'
        : 'Online payment is not configured for this invoice. Contact billing to complete payment.',
    };
  }

  private async customerInvoice(invoiceId: string): Promise<AccountInvoiceDetailRecord> {
    const actor = await this.currentActor();
    const invoice = await this.prisma.db.accountInvoice.findFirst({
      where: { id: invoiceId, customerId: actor.customerId, status: { not: 'draft' } },
      include: {
        order: true,
        payments: { orderBy: { recordedAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async documents(query: AccountDocumentListQuery) {
    const actor = await this.currentActor();
    const [requests, invoices, orders] = await Promise.all([
      this.prisma.db.b2BAccessRequest.findMany({
        where: {
          OR: [
            { resolvedCustomerId: actor.customerId },
            { resolvedCustomerUserId: actor.principalType === 'customer_user' ? actor.principalId : undefined },
            { email: actor.email },
          ].filter((item) => Object.values(item).every((value) => value !== undefined)),
        },
        include: { files: true },
        orderBy: { submittedAt: 'desc' },
        take: 100,
      }),
      this.prisma.db.accountInvoice.findMany({
        where: { customerId: actor.customerId, status: { not: 'draft' }, fileUrl: { not: null } },
        include: { order: true },
        orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.db.commerceOrder.findMany({
        where: { AND: [{ OR: this.ownOrderScopes(actor) }, { NOT: { designFiles: { equals: [] } } as Prisma.CommerceOrderWhereInput }] },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
    ]);

    const documents: AccountDocumentItem[] = [];
    for (const request of requests) {
      for (const file of request.files) {
        documents.push({
          id: file.id,
          name: file.originalFilename,
          category: documentCategory(file.originalFilename, file.mimeType),
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadedAt: isoDate(file.uploadedAt),
          uploadedBy: request.email,
          documentKind: 'account_file',
          addedAs: 'Account document',
          relatedLabel: 'Account application',
          orderId: null,
          orderNumber: null,
          invoiceId: null,
          invoiceNumber: null,
          downloadMode: 'api',
          downloadUrl: null,
          sortAt: file.uploadedAt,
        });
      }
    }

    for (const invoice of invoices) {
      if (!isAbsoluteWebUrl(invoice.fileUrl)) continue;
      documents.push({
        id: `invoice:${invoice.id}`,
        name: `${invoice.invoiceNumber}.pdf`,
        category: 'invoice',
        mimeType: documentMimeType(invoice.fileUrl, 'application/pdf'),
        sizeBytes: null,
        uploadedAt: isoDate(invoice.issuedAt),
        uploadedBy: 'Billing',
        documentKind: 'invoice_file',
        addedAs: 'Invoice file',
        relatedLabel: invoice.order?.shopifyOrderNumber ? `Order ${invoice.order.shopifyOrderNumber}` : null,
        orderId: invoice.orderId,
        orderNumber: invoice.order?.shopifyOrderNumber ?? null,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        downloadMode: 'url',
        downloadUrl: invoice.fileUrl,
        sortAt: invoice.issuedAt,
      });
    }

    for (const order of orders) {
      const orderNumber = order.shopifyOrderNumber ?? order.id;
      for (const file of designFilesFromOrder(order.designFiles)) {
        if (!isAbsoluteWebUrl(file.url)) continue;
        documents.push({
          id: `order-design:${order.id}:${file.id}`,
          name: file.name,
          category: 'design',
          mimeType: documentMimeType(file.url, 'application/octet-stream'),
          sizeBytes: null,
          uploadedAt: isoDate(order.processedAt ?? order.createdAt),
          uploadedBy: 'Order file',
          documentKind: 'order_design_file',
          addedAs: 'Design file',
          relatedLabel: `Order ${orderNumber}`,
          orderId: order.id,
          orderNumber,
          invoiceId: null,
          invoiceNumber: null,
          downloadMode: 'url',
          downloadUrl: file.url,
          sortAt: order.processedAt ?? order.createdAt,
        });
      }
    }

    const category = query.category ?? 'all';
    const search = query.search?.trim().toLowerCase() ?? '';
    const filtered = documents
      .filter((doc) => category === 'all' || doc.category === category)
      .filter((doc) => !search || documentSearchText(doc).includes(search))
      .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
    const offset = listOffset(query.cursor);
    const rows = filtered.slice(offset, offset + query.limit);
    return {
      data: rows.map(({ sortAt, ...doc }) => doc),
      meta: listMeta(filtered.length, query.limit, offset, rows.length),
    };
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
        source: 'customer_self_service',
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

  private async customerOrders(actor: AccountActor, take: number) {
    return this.prisma.db.commerceOrder.findMany({
      where: { OR: this.ownOrderScopes(actor) },
      include: { customer: true, customerUser: true, pickupOrder: true },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  private async findCustomerOrder(actor: AccountActor, orderId: string) {
    const order = await this.prisma.db.commerceOrder.findFirst({
      where: {
        AND: [
          { OR: this.ownOrderScopes(actor) },
          {
            OR: [
              { id: orderId },
              { shopifyOrderNumber: orderId },
              { shopifyOrderId: orderId },
            ],
          },
        ],
      },
      include: { customer: true, customerUser: true, pickupOrder: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private ownOrderScopes(actor: AccountActor): Prisma.CommerceOrderWhereInput[] {
    const scopes: Prisma.CommerceOrderWhereInput[] = [{ customerId: actor.customerId }];
    if (actor.principalType === 'customer_user') scopes.push({ customerUserId: actor.principalId });
    if (actor.customer.shopifyCustomerId) scopes.push({ shopifyCustomerId: actor.customer.shopifyCustomerId });
    return scopes;
  }

  private reorderableLineItems(order: AccountOrderRecord, quantityOverride?: number) {
    return detailedLineItems(order).map((item) => this.reorderLineFromDetail(item, quantityOverride));
  }

  private reorderLineFromDetail(item: ReturnType<typeof detailedLineItems>[number], quantityOverride?: number) {
    const quantity = Math.max(1, quantityOverride ?? item.qty);
    return {
      ...item,
      qty: quantity,
      lineTotalUsd: roundMoney(item.unitPriceUsd * quantity),
    };
  }

  private async createReorderCart(
    actor: AccountActor,
    order: AccountOrderRecord,
    items: Array<ReturnType<AccountsService['reorderLineFromDetail']>>,
  ) {
    if (items.length === 0) throw new BadRequestException('This order has no line items to reorder');
    const strategy = await this.rules.algorithmRuntimeDefinition('customer_portal.reorder_eligibility');
    const variantKeys = items
      .flatMap((item) => [item.shopifyVariantId, item.sku])
      .filter((value): value is string => Boolean(value));
    const variants = variantKeys.length > 0
      ? await this.prisma.db.catalogVariant.findMany({
          where: { OR: [{ shopifyVariantId: { in: variantKeys } }, { sku: { in: variantKeys } }] },
          include: { product: true },
        })
      : [];
    const variantByKey = new Map<string, (typeof variants)[number]>();
    for (const variant of variants) {
      if (variant.shopifyVariantId) variantByKey.set(variant.shopifyVariantId, variant);
      if (variant.sku) variantByKey.set(variant.sku, variant);
    }

    const resolved = items.map((item) => {
      const variant = (item.shopifyVariantId ? variantByKey.get(item.shopifyVariantId) : null) ?? (item.sku ? variantByKey.get(item.sku) : null) ?? null;
      const baseReorderable = Boolean(variant?.availableForSale);
      const signals = reorderEligibilitySignals(order, item, variant, actor, baseReorderable);
      const strategyScore = algorithmScore(strategy, signals);
      const strategyBand = algorithmScoreBand(strategy, strategyScore);
      const strategyVisible = algorithmVisible(strategy, signals);
      const reorderable = baseReorderable && strategyVisible;
      const unitPriceUsd = reorderable && variant ? money(variant.price) : item.unitPriceUsd;
      const lineTotalUsd = roundMoney(unitPriceUsd * item.qty);
      return {
        item,
        variant,
        reorderable,
        unitPriceUsd,
        lineTotalUsd,
        strategyScore,
        strategyBand,
        reason: reorderable
          ? 'Ready for portal review'
          : !strategyVisible
            ? 'This item is not currently eligible under account reorder rules'
          : variant
            ? 'Current catalog variant is not available'
            : item.reorderReason === 'Missing SKU and variant id'
              ? item.reorderReason
              : 'Current catalog variant could not be matched by SKU or variant id',
      };
    });

    const reorderableItems = resolved.filter((entry) => entry.reorderable);
    const subtotal = roundMoney(reorderableItems.reduce((sum, entry) => sum + entry.lineTotalUsd, 0));
    const cart = await this.prisma.db.accountReorderCart.create({
      data: {
        id: prefixedId('arc'),
        tenantId: this.tenantId(),
        customerId: actor.customerId,
        sourceOrderId: order.id,
        status: reorderableItems.length > 0 ? 'review_required' : 'unavailable',
        currency: order.currency,
        subtotal,
        totalAmount: subtotal,
        itemCount: reorderableItems.reduce((sum, entry) => sum + entry.item.qty, 0),
        checkoutUrl: null,
        checkoutError: reorderableItems.length > 0 ? null : 'No current catalog variant could be confirmed for this reorder',
        metadata: {
          source: 'customer_portal_reorder',
          principalId: actor.principalId,
          principalType: actor.principalType,
          sourceOrderNumber: order.shopifyOrderNumber ?? order.id,
        },
      },
    });

    for (const entry of resolved) {
      await this.prisma.db.accountReorderCartItem.create({
        data: {
          id: prefixedId('arci'),
          tenantId: this.tenantId(),
          cartId: cart.id,
          sourceOrderId: order.id,
          sourceLineItemKey: entry.item.sourceKey,
          productTitle: entry.item.name,
          variantTitle: entry.item.variantTitle,
          sku: entry.item.sku,
          quantity: entry.item.qty,
          unitPrice: entry.unitPriceUsd,
          lineTotal: entry.lineTotalUsd,
          shopifyVariantId: entry.variant?.shopifyVariantId ?? entry.item.shopifyVariantId,
          catalogVariantId: entry.variant?.id ?? null,
          reorderable: entry.reorderable,
          reason: entry.reason,
          propertiesJson: entry.item.properties as Prisma.InputJsonValue,
          designFilesJson: entry.item.designFiles as Prisma.InputJsonValue,
          metadata: {
            originalLineItemId: entry.item.id,
            reorderStrategy: {
              surfaceId: strategy.surfaceId,
              score: entry.strategyScore,
              band: entry.strategyBand?.id ?? null,
            },
          },
        },
      });
    }

    this.logger.log('accounts', 'reorder.cart.create', 'Customer reorder cart created', {
      cart_id: cart.id,
      customer_id: actor.customerId,
      order_id: order.id,
      item_count: resolved.length,
      reorderable_count: reorderableItems.length,
    });
    await this.recordCartActivity(actor, cart, {
      action: 'cart.reorder_created',
      label: 'Reorder cart created',
      detail: `${resolved.length} item(s) were copied from order ${order.shopifyOrderNumber ?? order.id}.`,
      metadata: {
        sourceOrderId: order.id,
        sourceOrderNumber: order.shopifyOrderNumber ?? null,
        resolvedCount: reorderableItems.length,
        skippedCount: resolved.length - reorderableItems.length,
      },
    });

    const cartWithItems = await this.requireOwnedCart(actor, cart.id);
    const checkout = await this.checkout.createDraftOrderCheckout(cartWithItems, actor);
    const finalCart = await this.persistCheckoutAttempt(cartWithItems, checkout);
    await this.recordCartActivity(actor, finalCart, {
      action: finalCart.checkoutUrl ? 'cart.checkout_ready' : finalCart.status === 'unavailable' ? 'cart.checkout_unavailable' : 'cart.account_review_requested',
      label: finalCart.checkoutUrl ? 'Checkout ready' : finalCart.status === 'unavailable' ? 'Checkout unavailable' : 'Account review requested',
      detail: finalCart.checkoutUrl
        ? 'Secure checkout was prepared for this reorder.'
        : finalCart.status === 'unavailable'
          ? 'No item in this order could be confirmed as reorderable.'
          : 'Checkout could not be shown yet, so the reorder was saved for account review.',
      metadata: {
        executionMode: checkout.executionMode,
        shopifyDraftOrderId: checkout.shopifyDraftOrderId ?? null,
        shopifyDraftOrderName: checkout.shopifyDraftOrderName ?? null,
        checkoutError: customerSafeCheckoutError(checkout.checkoutError),
      },
    });

    return {
      cartId: finalCart.id,
      originOrderId: order.id,
      action: finalCart.checkoutUrl ? 'checkout' : finalCart.status === 'review_required' ? 'review_portal_cart' : 'unavailable',
      message: finalCart.checkoutUrl
        ? `${reorderableItems.length} item(s) are ready for secure checkout.`
        : finalCart.status === 'review_required'
          ? `${reorderableItems.length} item(s) were saved for reorder review. Checkout will appear only after availability is confirmed.`
        : 'No item in this order could be confirmed as reorderable.',
      checkoutUrl: finalCart.checkoutUrl,
      checkoutError: finalCart.checkoutError,
      resolvedCount: reorderableItems.length,
      skippedCount: resolved.length - reorderableItems.length,
      items: resolved.map((entry) => ({
        id: entry.item.id,
        sku: entry.item.sku,
        name: entry.item.name,
        qty: entry.item.qty,
        unitPriceUsd: entry.unitPriceUsd,
        lineTotalUsd: entry.lineTotalUsd,
        reorderable: entry.reorderable,
        reason: entry.reason,
        eligibilityScore: entry.strategyScore,
        eligibilityBand: entry.strategyBand?.label ?? null,
      })),
    };
  }

  private async persistCheckoutAttempt(cart: AccountCartRecord, checkout: AccountCheckoutAttempt) {
    const safeCheckoutError = customerSafeCheckoutError(checkout.checkoutError);
    await this.prisma.db.accountReorderCart.updateMany({
      where: { id: cart.id },
      data: {
        status: checkout.checkoutUrl ? 'checkout_ready' : cart.status === 'unavailable' ? 'unavailable' : 'review_required',
        checkoutUrl: checkout.checkoutUrl,
        checkoutError: safeCheckoutError,
        totalAmount: checkout.totalUsd ?? cart.totalAmount,
        metadata: {
          ...metadata(cart.metadata),
          checkoutAttemptedAt: new Date().toISOString(),
          checkoutExecutionMode: checkout.executionMode,
          ...(checkout.shopifyDraftOrderId ? { shopifyDraftOrderId: checkout.shopifyDraftOrderId } : {}),
          ...(checkout.shopifyDraftOrderName ? { shopifyDraftOrderName: checkout.shopifyDraftOrderName } : {}),
          ...(checkout.checkoutInternalError ? { checkoutInternalError: checkout.checkoutInternalError } : {}),
        } as Prisma.InputJsonValue,
      },
    });
    const refreshed = await this.prisma.db.accountReorderCart.findFirst({
      where: { id: cart.id },
      include: accountCartInclude(),
    });
    if (!refreshed) throw new NotFoundException('Cart not found');
    return refreshed;
  }

  private async recordCartActivity(
    actor: AccountActor,
    cart: Pick<AccountCartRecord, 'id' | 'customerId'>,
    input: {
      action: string;
      label: string;
      detail?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await this.prisma.db.accountReorderCartActivity.create({
      data: {
        id: prefixedId('arca'),
        tenantId: this.tenantId(),
        cartId: cart.id,
        customerId: cart.customerId,
        action: input.action,
        label: input.label,
        detail: input.detail ?? null,
        actorType: actor.principalType,
        actorId: actor.principalId,
        metadata: input.metadata ?? {},
      },
    });
  }

  private async requireOwnedCart(actor: AccountActor, cartId: string) {
    const cart = await this.prisma.db.accountReorderCart.findFirst({
      where: { id: cartId, customerId: actor.customerId },
      include: accountCartInclude(),
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  private async requireEditableCart(actor: AccountActor, cartId: string) {
    const cart = await this.requireOwnedCart(actor, cartId);
    if (!['review_required', 'unavailable'].includes(cart.status)) {
      throw new BadRequestException('This cart can no longer be edited');
    }
    return cart;
  }

  private async findCatalogVariantForCart(input: AccountCartAddItemInput): Promise<AccountCartCatalogVariant | null> {
    return this.prisma.db.catalogVariant.findFirst({
      where: {
        OR: [
          ...(input.catalogVariantId ? [{ id: input.catalogVariantId }] : []),
          ...(input.sku ? [{ sku: input.sku }] : []),
        ],
      },
      include: { product: true },
    });
  }

  private async recalculateCart(cartId: string) {
    const items = await this.prisma.db.accountReorderCartItem.findMany({ where: { cartId } });
    const reorderable = items.filter((item) => item.reorderable);
    const subtotal = roundMoney(reorderable.reduce((sum, item) => sum + money(item.lineTotal), 0));
    const itemCount = reorderable.reduce((sum, item) => sum + item.quantity, 0);
    await this.prisma.db.accountReorderCart.updateMany({
      where: { id: cartId },
      data: {
        subtotal,
        totalAmount: subtotal,
        itemCount,
        status: itemCount > 0 ? 'review_required' : 'unavailable',
        checkoutUrl: null,
        checkoutError: itemCount > 0 ? null : 'No reorderable items are in this cart',
      },
    });
    const cart = await this.prisma.db.accountReorderCart.findFirst({
      where: { id: cartId },
      include: accountCartInclude(),
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return this.buyerCart(cart);
  }

  private buyerCart(cart: AccountCartRecord) {
    const items = cart.items.map((item) => ({
      id: item.id,
      originOrderId: item.sourceOrderId,
      productTitle: item.productTitle,
      variantTitle: item.variantTitle,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceUsd: money(item.unitPrice),
      lineTotalUsd: money(item.lineTotal),
      reorderable: item.reorderable,
      reason: item.reason ?? (item.reorderable ? 'Ready for portal review' : 'Availability needs review'),
      properties: jsonArray(item.propertiesJson).map((property, index) => ({
        name: stringValue(property.name ?? property.key ?? property.label) ?? `Property ${index + 1}`,
        value: stringValue(property.value ?? property.text ?? property.url) ?? '',
      })),
      designFiles: jsonArray(item.designFilesJson).map((file, index) => ({
        id: stringValue(file.id ?? file.fileId ?? file.key) ?? `${item.id}-file-${index + 1}`,
        name: stringValue(file.name ?? file.filename ?? file.originalFilename ?? file.value) ?? `Design file ${index + 1}`,
        url: stringValue(file.url ?? file.previewUrl ?? file.downloadUrl ?? file.value),
      })),
    }));
    const checkoutAction = cart.checkoutUrl
      ? 'checkout'
      : items.some((item) => item.reorderable)
        ? 'review_cart'
        : 'unavailable';
    return {
      id: cart.id,
      status: cart.status,
      originOrderId: cart.sourceOrderId,
      originOrderNumber: cart.sourceOrder?.shopifyOrderNumber ?? cart.sourceOrder?.id ?? null,
      currency: cart.currency,
      subtotalUsd: money(cart.subtotal),
      totalUsd: money(cart.totalAmount),
      itemCount: cart.itemCount,
      checkoutUrl: cart.checkoutUrl,
      checkoutError: cart.checkoutError,
      checkoutAction,
      createdAt: isoDate(cart.createdAt),
      updatedAt: isoDate(cart.updatedAt),
      items,
      activities: cart.activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        label: activity.label,
        detail: activity.detail,
        actorType: activity.actorType,
        createdAt: isoDate(activity.createdAt),
      })),
    };
  }

  private cartCheckoutPayload(cart: AccountCartRecord, action: 'checkout' | 'review_cart' | 'account_review' | 'unavailable', message: string) {
    return {
      action,
      message,
      checkoutUrl: cart.checkoutUrl,
      checkoutError: cart.checkoutError,
      cart: this.buyerCart(cart),
    };
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

  private buyerOrder(order: AccountOrderRecord, actor: AccountActor) {
    const items = detailedLineItems(order);
    return {
      id: order.id,
      orderNumber: order.shopifyOrderNumber ?? order.id,
      placedAt: isoDate(order.processedAt ?? order.createdAt),
      placedBy: order.customerUser ? `${order.customerUser.firstName} ${order.customerUser.lastName}`.trim() : actor.customer.companyName,
      status: orderStatus(order.financialStatus, order.fulfillmentStatus, order.cancelledAt),
      totalUsd: money(order.totalPrice),
      itemsCount: items.reduce((sum, item) => sum + item.qty, 0),
      currency: order.currency,
      fulfillmentStatus: order.fulfillmentStatus,
      financialStatus: order.financialStatus,
      canReorder: items.some((item) => item.canReorder),
      items: items.map((item) => orderListItem(item)),
    };
  }

  private buyerOrderDetail(order: AccountOrderRecord, actor: AccountActor) {
    const fulfillment = firstFulfillment(order.fulfillments);
    const items = detailedLineItems(order);
    return {
      ...this.buyerOrder(order, actor),
      subtotalUsd: money(order.subtotal),
      taxUsd: money(order.totalTax),
      shippingUsd: money(order.totalShipping),
      discountsUsd: money(order.totalDiscounts),
      refundedUsd: money(order.totalRefunded),
      tags: order.tags,
      notes: order.notes,
      shippingAddress: addressDisplay(order.shippingAddress),
      billingAddress: addressDisplay(order.billingAddress),
      tracking: {
        carrier: fulfillment.carrier,
        trackingNumber: fulfillment.trackingNumber,
        trackingUrl: fulfillment.trackingUrl,
        status: trackingStatus(order.fulfillmentStatus, fulfillment.trackingNumber),
      },
      designFiles: designFilesFromOrder(order.designFiles).map(publicDesignFile),
      items: items.map((item) => orderDetailItem(item)),
      pickup: order.pickupOrder ? {
        id: order.pickupOrder.id,
        status: pickupStatus(order.pickupOrder.status),
        qrPayload: order.pickupOrder.qrCode ?? order.pickupOrder.id,
        shelfCode: stringValue(metadata(order.pickupOrder.metadata).shelfCode ?? metadata(order.pickupOrder.metadata).shelf),
      } : null,
    };
  }

  private buyerInvoice(invoice: AccountInvoiceRecord) {
    const total = money(invoice.totalAmount);
    const paid = money(invoice.amountPaid);
    const dueAt = invoice.dueAt ?? addDays(invoice.issuedAt, 30);
    return {
      id: invoice.id,
      orderId: invoice.orderId,
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.order?.shopifyOrderNumber ?? invoice.order?.id ?? null,
      status: invoiceStatus(invoice.status, dueAt, paid, total),
      issuedAt: isoDate(invoice.issuedAt),
      dueAt: isoDate(dueAt),
      totalUsd: total,
      paidUsd: paid,
      balanceUsd: Math.max(0, roundMoney(total - paid)),
      hasFile: isAbsoluteWebUrl(invoice.fileUrl),
      canPay: isAbsoluteWebUrl(invoice.externalPaymentUrl),
    };
  }

  private trackingOrder(order: AccountOrderRecord, actor: AccountActor) {
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
  const address = normalizedAddress(value);
  if (!address?.address1) return null;
  return {
    id: type,
    type,
    firstName: address.firstName ?? customer.firstName ?? '',
    lastName: address.lastName ?? customer.lastName ?? '',
    company: address.company ?? customer.companyName,
    address1: address.address1,
    address2: address.address2 ?? '',
    city: address.city ?? '',
    province: address.province ?? '',
    zip: address.zip ?? '',
    country: address.country ?? 'US',
    phone: address.phone ?? customer.phone ?? '',
    isDefault: address.isDefault ?? true,
  };
}

function accountCartInclude() {
  return {
    items: { orderBy: { createdAt: 'asc' as const } },
    sourceOrder: true,
    activities: { orderBy: { createdAt: 'desc' as const }, take: 8 },
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

function detailedLineItems(order: AccountOrderRecord) {
  const orderDesignFiles = designFilesFromOrder(order.designFiles);
  return jsonArray(order.lineItems).map((item, index) => {
    const qty = Math.max(1, numberValue(item.quantity ?? item.qty) ?? 1);
    const unit = money(item.unitPrice ?? item.unit_price ?? item.price ?? item.original_unit_price);
    const id = stringValue(item.id ?? item.line_item_id ?? item.admin_graphql_api_id) ?? `${order.id}-line-${index + 1}`;
    const sourceKey = stringValue(item.id ?? item.line_item_id ?? item.key ?? item.sku) ?? `${index + 1}`;
    const sku = stringValue(item.sku ?? item.variant_sku) ?? '';
    const shopifyVariantId = stringValue(item.shopifyVariantId ?? item.variantId ?? item.variant_id ?? item.variant_admin_graphql_api_id);
    const properties = lineItemProperties(item);
    const itemDesignFiles = designFilesForLineItem(orderDesignFiles, id, sourceKey, sku, properties);
    const canReorder = Boolean(shopifyVariantId || sku);
    return {
      id,
      sourceKey,
      sku,
      shopifyVariantId,
      name: stringValue(item.title ?? item.name ?? item.product_title) ?? `Line item ${index + 1}`,
      variantTitle: stringValue(item.variant_title ?? item.variantTitle),
      qty,
      unitPriceUsd: unit,
      lineTotalUsd: roundMoney(qty * unit),
      canReorder,
      reorderReason: canReorder ? 'SKU or variant is available for availability check' : 'Missing SKU and variant id',
      properties,
      designFiles: itemDesignFiles,
    };
  });
}

function reorderEligibilitySignals(
  order: AccountOrderRecord,
  item: ReturnType<typeof detailedLineItems>[number],
  variant: { availableForSale: boolean; product?: { productType: string | null } | null } | null,
  actor: AccountActor,
  baseReorderable: boolean,
): Record<string, unknown> {
  const lastPurchasedAt = order.processedAt ?? order.createdAt;
  const purchasedAgeDays = Math.max(0, (Date.now() - lastPurchasedAt.getTime()) / 86_400_000);
  const fulfillment = String(order.fulfillmentStatus ?? '').toLowerCase();
  return {
    orderStatus: orderStatus(order.financialStatus, order.fulfillmentStatus, order.cancelledAt),
    fulfillmentStatus: order.fulfillmentStatus ?? 'unknown',
    productType: variant?.product?.productType ?? '',
    variantAvailable: Boolean(variant?.availableForSale),
    customerOwnsOrder: order.customerId === actor.customerId,
    lastPurchasedAt,
    processedAt: lastPurchasedAt,
    totalPrice: money(order.totalPrice),
    lineItemTitle: item.name,
    recentPurchase: purchasedAgeDays <= 180,
    repeatableItem: Boolean(item.sku || item.shopifyVariantId),
    blockedFulfillment: Boolean(order.cancelledAt) || fulfillment.includes('cancel'),
    urgencyScore: baseReorderable ? 50 : 0,
  };
}

function orderListItem(item: ReturnType<typeof detailedLineItems>[number]) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    qty: item.qty,
    unitPriceUsd: item.unitPriceUsd,
    canReorder: item.canReorder,
    reason: item.reorderReason,
  };
}

function orderDetailItem(item: ReturnType<typeof detailedLineItems>[number]) {
  const { sourceKey: _sourceKey, shopifyVariantId: _shopifyVariantId, ...rest } = item;
  return {
    ...rest,
    designFiles: rest.designFiles.map(publicDesignFile),
  };
}

function publicDesignFile(file: ReturnType<typeof designFilesFromOrder>[number]) {
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    sku: file.sku,
  };
}

function lineItemProperties(item: Record<string, unknown>) {
  const raw = item.properties ?? item.customAttributes ?? item.custom_attributes ?? item.attributes ?? [];
  const parsedRaw = parseJsonValue(raw);
  if (Array.isArray(parsedRaw)) {
    return parsedRaw
      .map((entry, index) => {
        const data = objectRecord(entry);
        if (!data) return null;
        const name = stringValue(data.name ?? data.key ?? data.label) ?? `Property ${index + 1}`;
        const value = readablePropertyValue(data.value ?? data.text ?? data.url ?? data.file);
        return { name, value };
      })
      .filter((entry): entry is { name: string; value: string } => Boolean(entry));
  }
  const data = objectRecord(parsedRaw);
  if (!data) return [];
  return Object.entries(data).map(([name, value]) => ({ name, value: readablePropertyValue(value) }));
}

function designFilesFromOrder(value: unknown) {
  return jsonArray(value).map((file, index) => ({
    id: stringValue(file.id ?? file.fileId ?? file.key) ?? `design-${index + 1}`,
    name: stringValue(file.name ?? file.filename ?? file.originalFilename ?? file.value) ?? `Design file ${index + 1}`,
    url: stringValue(file.url ?? file.previewUrl ?? file.downloadUrl ?? file.value),
    lineItemId: stringValue(file.lineItemId ?? file.line_item_id),
    lineItemKey: stringValue(file.lineItemKey ?? file.line_item_key ?? file.key),
    sku: stringValue(file.sku),
  }));
}

function designFilesForLineItem(
  files: ReturnType<typeof designFilesFromOrder>,
  id: string,
  sourceKey: string,
  sku: string,
  properties: Array<{ name: string; value: string }>,
) {
  const propertyFiles = properties
    .filter((property) => isFileLike(property.value))
    .map((property, index) => ({
      id: `${sourceKey}-property-file-${index + 1}`,
      name: property.name,
      url: property.value,
      lineItemId: id,
      lineItemKey: sourceKey,
      sku,
    }));
  return files
    .filter((file) => file.lineItemId === id || file.lineItemKey === sourceKey || file.sku === sku)
    .concat(propertyFiles);
}

function invoiceLineItems(value: unknown) {
  return jsonArray(value).map((item, index) => {
    const quantity = Math.max(1, numberValue(item.quantity ?? item.qty) ?? 1);
    const unitPriceUsd = money(item.unitPrice ?? item.unit_price ?? item.price);
    return {
      id: stringValue(item.id) ?? `invoice-line-${index + 1}`,
      sku: stringValue(item.sku),
      name: stringValue(item.name ?? item.title) ?? `Invoice line ${index + 1}`,
      quantity,
      unitPriceUsd,
      totalUsd: roundMoney(money(item.total ?? item.lineTotal ?? item.line_total) || quantity * unitPriceUsd),
    };
  });
}

function invoicePayment(invoice: AccountInvoiceRecord) {
  const total = money(invoice.totalAmount);
  const paid = money(invoice.amountPaid);
  const amountDue = Math.max(0, roundMoney(total - paid));
  if (amountDue <= 0) {
    return { state: 'paid', amountDue, url: null, label: 'Paid in full' };
  }
  if (isAbsoluteWebUrl(invoice.externalPaymentUrl)) {
    return { state: 'payment_link', amountDue, url: invoice.externalPaymentUrl, label: 'Open secure payment link' };
  }
  return { state: 'contact_billing', amountDue, url: null, label: 'Contact billing' };
}

function invoicePaymentMethodLabel(method: string) {
  switch (method) {
    case 'card':
      return 'Card';
    case 'bank_transfer':
      return 'Bank transfer';
    case 'cash':
      return 'Cash';
    case 'check':
      return 'Check';
    case 'manual':
      return 'Manual payment';
    default:
      return method.replace(/_/g, ' ') || 'Payment';
  }
}

function invoiceActivityLabel(action: string) {
  switch (action) {
    case 'invoice_created':
      return 'Invoice created';
    case 'invoice_file_updated':
      return 'Invoice file updated';
    case 'invoice_status_updated':
      return 'Invoice status updated';
    case 'invoice_payment_recorded':
      return 'Payment recorded';
    case 'invoice_duplicated':
      return 'Invoice copied';
    case 'invoice_marked_overdue':
      return 'Marked overdue';
    default:
      return action.replace(/_/g, ' ') || 'Invoice updated';
  }
}

function invoiceActivityDetail(action: string, value: unknown) {
  const data = objectRecord(value) ?? {};
  if (action === 'invoice_payment_recorded' && data.amount !== undefined) {
    return `${fmtMoney(money(data.amount))} payment recorded.`;
  }
  if (data.status) return `Status: ${String(data.status).replace(/_/g, ' ')}.`;
  if (data.fileUrl || data.externalPaymentUrl) return 'Invoice file or payment link changed.';
  return 'Invoice record updated.';
}

function addressDisplay(value: unknown) {
  return normalizedAddress(value);
}

function listOffset(cursor?: string | null) {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function listMeta(total: number, limit: number, offset: number, pageCount: number) {
  const nextOffset = offset + pageCount;
  return {
    count: total,
    pageCount,
    limit,
    cursor: offset > 0 ? String(offset) : null,
    nextCursor: nextOffset < total ? String(nextOffset) : null,
  };
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
  if (status === 'paid') return 'paid';
  if (status === 'partial') return 'partial';
  if (status === 'overdue') return 'overdue';
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  if (['unpaid', 'voided'].includes(status) && dueAt.getTime() < Date.now()) return 'overdue';
  return 'unpaid';
}

function isAbsoluteWebUrl(value: string | null | undefined) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function paidAmount(financialStatus: string | null, total: number, refunded: number) {
  const status = (financialStatus ?? '').toLowerCase();
  if (['paid', 'authorized'].includes(status)) return Math.max(0, total - refunded);
  if (status === 'partially_paid') return Math.max(0, Math.round((total / 2) * 100) / 100);
  return 0;
}

function documentCategory(filename: string, mimeType: string): AccountDocumentItem['category'] {
  const lower = `${filename} ${mimeType}`.toLowerCase();
  if (lower.includes('invoice')) return 'invoice';
  if (lower.includes('design') || lower.includes('artwork') || lower.includes('proof')) return 'design';
  if (lower.includes('tax')) return 'tax';
  if (lower.includes('certificate') || lower.includes('cert')) return 'certificate';
  if (lower.includes('license')) return 'license';
  if (lower.includes('contract')) return 'contract';
  return 'other';
}

function documentMimeType(urlOrName: string | null | undefined, fallback: string) {
  const value = (urlOrName ?? '').toLowerCase().split('?')[0] ?? '';
  if (value.endsWith('.pdf')) return 'application/pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.svg')) return 'image/svg+xml';
  if (value.endsWith('.ai') || value.endsWith('.eps')) return 'application/postscript';
  if (value.endsWith('.csv')) return 'text/csv';
  if (value.endsWith('.txt')) return 'text/plain';
  if (value.endsWith('.doc')) return 'application/msword';
  if (value.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return fallback;
}

function documentSearchText(doc: AccountDocumentItem) {
  return [
    doc.name,
    doc.category,
    doc.addedAs,
    doc.relatedLabel,
    doc.orderNumber,
    doc.invoiceNumber,
    doc.uploadedBy,
  ].filter(Boolean).join(' ').toLowerCase();
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

function normalizedAddress(value: unknown) {
  const data = objectRecord(value);
  if (!data) return null;
  const firstName = stringValue(data.firstName ?? data.first_name);
  const lastName = stringValue(data.lastName ?? data.last_name);
  const derivedName = [firstName, lastName].filter(Boolean).join(' ');
  const name = stringValue(data.name) ?? (derivedName || null);
  const company = stringValue(data.company ?? data.companyName ?? data.company_name);
  const address1 = stringValue(data.address1 ?? data.address_1 ?? data.addressLine1 ?? data.line1 ?? data.address);
  const address2 = stringValue(data.address2 ?? data.address_2 ?? data.addressLine2 ?? data.line2);
  const city = stringValue(data.city);
  const province = stringValue(data.province ?? data.state ?? data.provinceCode ?? data.province_code);
  const zip = stringValue(data.zip ?? data.postalCode ?? data.postal_code);
  const country = stringValue(data.country ?? data.countryName ?? data.country_name ?? data.countryCode ?? data.country_code);
  const phone = stringValue(data.phone);
  const formatted = readableAddressLines({
    name,
    company,
    address1,
    address2,
    city,
    province,
    zip,
    country,
  }) ?? readableFormattedAddress(data);
  if (!formatted && !address1 && !city && !zip) return null;
  return {
    name,
    firstName,
    lastName,
    company,
    address1,
    address2,
    city,
    province,
    zip,
    country,
    phone,
    formatted: formatted ?? '-',
    isDefault: booleanValue(data.isDefault ?? data.default),
  };
}

function readableAddressLines(address: {
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
}) {
  const cityLine = [address.city, address.province, address.zip].filter(Boolean).join(', ');
  const lines = [address.name, address.company, address.address1, address.address2, cityLine, address.country].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

function readableFormattedAddress(data: Record<string, unknown>) {
  const formatted = stringValue(data.formatted ?? data.formattedAddress ?? data.formatted_address);
  if (!formatted || looksLikeStructuredPayload(formatted)) return null;
  return formatted;
}

function formatAddress(value: unknown) {
  return normalizedAddress(value)?.formatted ?? '-';
}

function metadata(value: unknown) {
  return objectRecord(value) ?? {};
}

function customerSafeCheckoutError(reason: string | null | undefined) {
  if (!reason) return 'Online checkout is not ready for this cart yet. Your items were saved for account review.';
  const lower = reason.toLowerCase();
  if (lower.includes('variant')) {
    return 'Some items need availability review before checkout can be created.';
  }
  if (lower.includes('price') || lower.includes('pricing')) {
    return 'Pricing needs account review before checkout can be created.';
  }
  if (lower.includes('inventory') || lower.includes('stock') || lower.includes('available')) {
    return 'Availability needs account review before checkout can be created.';
  }
  if (lower.includes('address') || lower.includes('shipping')) {
    return 'Shipping details need account review before checkout can be created.';
  }
  return 'Online checkout is not ready for this cart yet. Your items were saved for account review.';
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

function jsonArray(value: unknown): Array<Record<string, unknown>> {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function readablePropertyValue(value: unknown): string {
  const parsed = parseJsonValue(value);
  if (parsed === null || parsed === undefined) return '';
  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
    return String(parsed).trim();
  }
  if (Array.isArray(parsed)) {
    return parsed.map((entry) => readablePropertyValue(entry)).filter(Boolean).join(', ');
  }
  if (typeof parsed === 'object') {
    const data = parsed as Record<string, unknown>;
    const preferred = stringValue(data.value ?? data.text ?? data.label ?? data.name ?? data.filename ?? data.fileName ?? data.url ?? data.file ?? data.downloadUrl);
    const entries = Object.entries(data).filter(([key]) => !['id', 'admin_graphql_api_id', 'customer_id'].includes(key));
    if (preferred && entries.length <= 1) return preferred;
    const pairs = entries
      .filter(([key]) => !['id', 'admin_graphql_api_id', 'customer_id'].includes(key))
      .map(([key, entry]) => {
        const text = readablePropertyValue(entry);
        return text ? `${humanFieldLabel(key)}: ${text}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return pairs.join(', ') || preferred || '';
  }
  return '';
}

function humanFieldLabel(value: string) {
  const label = value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
}

function looksLikeStructuredPayload(value: string) {
  const text = value.trim();
  return text.startsWith('{') || text.startsWith('[');
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function isFileLike(value: string) {
  const lower = value.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.includes('.pdf') || lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg');
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
