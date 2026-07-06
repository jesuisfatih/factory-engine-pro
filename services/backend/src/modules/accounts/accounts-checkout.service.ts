import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../../shared/logger.service.js';
import { ShopifyClientService } from '../sync/shopify-client.service.js';

type AccountCheckoutCart = {
  id: string;
  currency: string;
  sourceOrderId: string | null;
  items: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal | number | string;
    shopifyVariantId: string | null;
    reorderable: boolean;
    propertiesJson: Prisma.JsonValue;
    metadata: Prisma.JsonValue;
  }>;
};

type AccountCheckoutActor = {
  principalId: string;
  principalType: 'customer_user' | 'sub_user';
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  customer: {
    companyName: string;
    shopifyCustomerId: string | null;
  };
};

export type AccountCheckoutAttempt = {
  checkoutUrl: string | null;
  checkoutError: string | null;
  checkoutInternalError: string | null;
  executionMode: 'shopify_draft_order' | 'review_required';
  shopifyDraftOrderId: string | null;
  shopifyDraftOrderName: string | null;
  totalUsd: number | null;
};

type DraftOrderCreateResponse = {
  draftOrderCreate?: {
    draftOrder?: {
      id?: string | null;
      name?: string | null;
      invoiceUrl?: string | null;
      totalPriceSet?: {
        shopMoney?: {
          amount?: string | null;
          currencyCode?: string | null;
        } | null;
      } | null;
    } | null;
    userErrors?: Array<{ field?: string[] | null; message?: string | null }> | null;
  } | null;
};

@Injectable()
export class AccountsCheckoutService {
  constructor(
    private readonly shopify: ShopifyClientService,
    private readonly logger: AppLogger,
  ) {}

  async createDraftOrderCheckout(
    cart: AccountCheckoutCart,
    actor: AccountCheckoutActor,
    options: { note?: string | null } = {},
  ): Promise<AccountCheckoutAttempt> {
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) {
      return reviewRequired(
        'Online checkout is not ready yet. Your items were saved for account review.',
        'Shopify Admin credentials are not configured for this tenant.',
      );
    }

    const lineItems = cart.items
      .filter((item) => item.reorderable && item.shopifyVariantId)
      .map((item) => ({
        variantId: shopifyVariantGid(item.shopifyVariantId!),
        quantity: Math.max(1, item.quantity),
        priceOverride: {
          amount: money(item.unitPrice).toFixed(2),
          currencyCode: cart.currency || 'USD',
        },
        customAttributes: lineItemCustomAttributes(item),
      }));

    if (lineItems.length === 0) {
      return reviewRequired(
        'Some items need availability review before checkout can be created.',
        'No Shopify variant id is available for checkout creation.',
      );
    }

    try {
      const result = await this.shopify.graphql<DraftOrderCreateResponse>(credentials, `
        mutation AccountReorderDraftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              invoiceUrl
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        input: {
          email: actor.email,
          note: checkoutNote(cart, actor, options.note),
          tags: ['factory-engine-pro', 'customer-portal-reorder'],
          lineItems,
          customAttributes: [
            { key: 'factory_engine_cart_id', value: cart.id },
            { key: 'factory_engine_customer_id', value: actor.customerId },
            ...(cart.sourceOrderId ? [{ key: 'factory_engine_origin_order_id', value: cart.sourceOrderId }] : []),
          ],
        },
      });

      const payload = result.draftOrderCreate;
      const errors = payload?.userErrors?.filter((error) => error.message) ?? [];
      if (errors.length > 0) {
        return reviewRequired(
          'Availability or pricing needs account review before checkout can be created.',
          errors.map((error) => error.message).join('; '),
        );
      }

      const draftOrder = payload?.draftOrder;
      const checkoutUrl = draftOrder?.invoiceUrl?.trim() || null;
      if (!checkoutUrl) {
        return reviewRequired(
          'Online checkout is not ready yet. Your items were saved for account review.',
          'Shopify created a draft order but did not return an invoice checkout URL.',
        );
      }

      this.logger.log('accounts', 'checkout.draft_order.created', 'Customer reorder checkout created', {
        cart_id: cart.id,
        customer_id: actor.customerId,
        shopify_draft_order_id: draftOrder?.id ?? null,
        shopify_draft_order_name: draftOrder?.name ?? null,
      });

      return {
        checkoutUrl,
        checkoutError: null,
        checkoutInternalError: null,
        executionMode: 'shopify_draft_order',
        shopifyDraftOrderId: draftOrder?.id ?? null,
        shopifyDraftOrderName: draftOrder?.name ?? null,
        totalUsd: numberOrNull(draftOrder?.totalPriceSet?.shopMoney?.amount),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shopify checkout could not be created.';
      this.logger.warn('accounts', 'checkout.draft_order.failed', 'Customer reorder checkout creation failed', {
        cart_id: cart.id,
        customer_id: actor.customerId,
        error: message,
      });
      return reviewRequired(
        'Online checkout is not ready yet. Your items were saved for account review.',
        message,
      );
    }
  }
}

function reviewRequired(customerReason: string, internalReason = customerReason): AccountCheckoutAttempt {
  return {
    checkoutUrl: null,
    checkoutError: customerReason,
    checkoutInternalError: internalReason,
    executionMode: 'review_required',
    shopifyDraftOrderId: null,
    shopifyDraftOrderName: null,
    totalUsd: null,
  };
}

function shopifyVariantGid(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('gid://shopify/ProductVariant/')) return trimmed;
  return `gid://shopify/ProductVariant/${trimmed.replace(/^gid:\/\/shopify\/.*?\//, '')}`;
}

function checkoutNote(cart: AccountCheckoutCart, actor: AccountCheckoutActor, note?: string | null) {
  return [
    `Customer portal reorder cart ${cart.id}`,
    cart.sourceOrderId ? `Original order ${cart.sourceOrderId}` : null,
    `Requested by ${actor.email}`,
    actor.customer.companyName ? `Customer ${actor.customer.companyName}` : null,
    note?.trim() ? `Customer note: ${note.trim()}` : null,
  ].filter(Boolean).join('\n');
}

function lineItemCustomAttributes(item: AccountCheckoutCart['items'][number]) {
  const pricing = pricingMetadata(item.metadata);
  const attrs = [
    { key: 'factory_engine_cart_item_id', value: item.id },
    ...(item.sku ? [{ key: 'sku', value: item.sku }] : []),
    ...(pricing.ruleName ? [{ key: 'factory_engine_pricing_rule', value: pricing.ruleName }] : []),
    ...(pricing.discountAmount > 0 ? [{ key: 'factory_engine_discount', value: pricing.discountAmount.toFixed(2) }] : []),
    ...normalizedPropertyAttributes(item.propertiesJson),
  ];
  return attrs.slice(0, 20);
}

function pricingMetadata(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ruleName: null as string | null, discountAmount: 0 };
  const pricing = (value as Record<string, unknown>).pricing;
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return { ruleName: null as string | null, discountAmount: 0 };
  const record = pricing as Record<string, unknown>;
  const ruleName = typeof record.ruleName === 'string' ? record.ruleName : null;
  const discountAmount = Number(record.discountAmount ?? 0);
  return { ruleName, discountAmount: Number.isFinite(discountAmount) ? discountAmount : 0 };
}

function normalizedPropertyAttributes(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const key = String(record.name ?? record.key ?? record.label ?? `property_${index + 1}`).trim();
    const rawValue = String(record.value ?? record.text ?? record.url ?? '').trim();
    if (!key || !rawValue) return [];
    return [{ key: key.slice(0, 40), value: rawValue.slice(0, 240) }];
  });
}

function numberOrNull(value: string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}
