import { Injectable } from '@nestjs/common';
import type { CalculatePricesInput } from '@factory-engine-pro/contracts';
import { PrismaService } from '../../shared/prisma.service.js';
import { type PricingRuleWithRelations, PricingRepository } from './pricing.repository.js';

@Injectable()
export class PricingCalculatorService {
  constructor(
    private readonly repository: PricingRepository,
    private readonly prisma: PrismaService,
  ) {}

  async calculate(input: CalculatePricesInput) {
    const [rules, customer, customerUser] = await Promise.all([
      this.repository.activeRules(),
      input.customerId ? this.prisma.db.customer.findFirst({ where: { id: input.customerId }, include: { insight: true } }) : null,
      input.customerUserId ? this.prisma.db.customerUser.findFirst({ where: { id: input.customerUserId }, include: { customer: { include: { insight: true } } } }) : null,
    ]);

    const items = await Promise.all(input.items.map(async (item) => {
      const variant = await this.resolveVariant(item.variantId, item.shopifyVariantId, item.sku);
      const basePrice = item.basePrice ?? money(variant?.price);
      const context = {
        customerId: input.customerId,
        customerUserId: input.customerUserId,
        customerTags: [...(input.customerTags ?? []), ...(customer?.tags ?? []), ...(customerUser?.customer.tags ?? [])],
        segment: customer?.insight?.rfmSegment ?? customerUser?.customer.insight?.rfmSegment ?? null,
        cartTotal: input.cartTotal ?? input.items.reduce((sum, current) => sum + (current.basePrice ?? 0) * current.quantity, 0),
      };
      const productTags = [...item.tags, ...(variant?.product.tags ?? [])];
      const applicable = rules
        .filter((rule) => targetApplies(rule, context))
        .filter((rule) => scopeApplies(rule, {
          variantId: item.variantId ?? variant?.id ?? null,
          shopifyVariantId: item.shopifyVariantId ?? variant?.shopifyVariantId ?? null,
          productId: item.productId ?? variant?.productId ?? null,
          shopifyProductId: item.shopifyProductId ?? variant?.product.shopifyProductId ?? null,
          tags: productTags,
        }))
        .filter((rule) => rule.minCartAmount === null || context.cartTotal >= money(rule.minCartAmount));
      const best = applicable
        .map((rule) => applyRule(rule, basePrice, item.quantity))
        .sort((left, right) => right.discountAmount - left.discountAmount || right.rule.priority - left.rule.priority)[0];
      return {
        variantId: item.variantId ?? variant?.id ?? null,
        shopifyVariantId: item.shopifyVariantId ?? variant?.shopifyVariantId ?? null,
        sku: item.sku ?? variant?.sku ?? null,
        quantity: item.quantity,
        basePrice,
        finalPrice: best ? round(Math.max(0, best.finalPrice)) : basePrice,
        discountAmount: best ? round(best.discountAmount) : 0,
        appliedRule: best ? mapRuleSummary(best.rule) : null,
      };
    }));

    return {
      items,
      subtotal: round(items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0)),
      discountedSubtotal: round(items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0)),
      totalDiscount: round(items.reduce((sum, item) => sum + item.discountAmount * item.quantity, 0)),
    };
  }

  private resolveVariant(variantId?: string, shopifyVariantId?: string, sku?: string) {
    if (variantId) {
      return this.prisma.db.catalogVariant.findFirst({ where: { id: variantId }, include: { product: true } });
    }
    if (shopifyVariantId) {
      return this.prisma.db.catalogVariant.findFirst({ where: { shopifyVariantId }, include: { product: true } });
    }
    if (sku) {
      return this.prisma.db.catalogVariant.findFirst({ where: { sku }, include: { product: true } });
    }
    return null;
  }
}

function targetApplies(
  rule: PricingRuleWithRelations,
  context: { customerId?: string; customerUserId?: string; customerTags: string[]; segment: string | null; cartTotal: number },
) {
  if (rule.targetType === 'all') return true;
  if (rule.targetType === 'anonymous') return !context.customerId && !context.customerUserId;
  if (rule.targetType === 'customer') return Boolean(rule.targetCustomerId && rule.targetCustomerId === context.customerId);
  if (rule.targetType === 'customer_user') return Boolean(rule.targetCustomerUserId && rule.targetCustomerUserId === context.customerUserId);
  if (rule.targetType === 'customer_tag') {
    return rule.targetTags.some((tag) => context.customerTags.map((value) => value.toLowerCase()).includes(tag.toLowerCase()));
  }
  if (rule.targetType === 'segment') return Boolean(rule.targetCustomerGroup && rule.targetCustomerGroup === context.segment);
  if (rule.targetType === 'buyer_intent') return context.cartTotal > 0;
  return false;
}

function scopeApplies(
  rule: PricingRuleWithRelations,
  product: {
    variantId: string | null;
    shopifyVariantId: string | null;
    productId: string | null;
    shopifyProductId: string | null;
    tags: string[];
  },
) {
  if (rule.scopeType === 'all') return true;
  if (rule.scopeType === 'variants') {
    return Boolean(
      product.variantId && rule.scopeVariantIds.includes(product.variantId)
      || product.shopifyVariantId && rule.scopeVariantIds.includes(product.shopifyVariantId),
    );
  }
  if (rule.scopeType === 'products') {
    return Boolean(
      product.productId && rule.scopeProductIds.includes(product.productId)
      || product.shopifyProductId && rule.scopeProductIds.includes(product.shopifyProductId),
    );
  }
  if (rule.scopeType === 'tags') {
    const tags = product.tags.map((tag) => tag.toLowerCase());
    return rule.scopeTags.some((tag) => tags.includes(tag.toLowerCase()));
  }
  if (rule.scopeType === 'collections') return rule.scopeCollectionIds.length > 0;
  return false;
}

function applyRule(rule: PricingRuleWithRelations, basePrice: number, quantity: number) {
  if (rule.discountType === 'percentage') {
    const percentage = money(rule.discountPercentage);
    const discountAmount = basePrice * (percentage / 100);
    return { rule, finalPrice: basePrice - discountAmount, discountAmount };
  }
  if (rule.discountType === 'fixed_amount') {
    const discountAmount = Math.min(basePrice, money(rule.discountValue));
    return { rule, finalPrice: basePrice - discountAmount, discountAmount };
  }
  if (rule.discountType === 'fixed_price') {
    const finalPrice = Math.min(basePrice, money(rule.discountValue));
    return { rule, finalPrice, discountAmount: basePrice - finalPrice };
  }
  const breakRule = qtyBreaks(rule)
    .filter((qtyBreak) => quantity >= qtyBreak.minQty)
    .sort((left, right) => right.minQty - left.minQty)[0];
  if (!breakRule) return { rule, finalPrice: basePrice, discountAmount: 0 };
  if (breakRule.type === 'percentage') {
    const discountAmount = basePrice * (breakRule.value / 100);
    return { rule, finalPrice: basePrice - discountAmount, discountAmount };
  }
  if (breakRule.type === 'fixed_amount') {
    const discountAmount = Math.min(basePrice, breakRule.value);
    return { rule, finalPrice: basePrice - discountAmount, discountAmount };
  }
  const finalPrice = Math.min(basePrice, breakRule.value);
  return { rule, finalPrice, discountAmount: basePrice - finalPrice };
}

function qtyBreaks(rule: PricingRuleWithRelations) {
  if (!Array.isArray(rule.qtyBreaks)) return [];
  return rule.qtyBreaks
    .map((entry) => entry as { minQty?: unknown; value?: unknown; type?: unknown })
    .map((entry) => ({
      minQty: Number(entry.minQty ?? 0),
      value: Number(entry.value ?? 0),
      type: String(entry.type ?? 'percentage'),
    }))
    .filter((entry): entry is { minQty: number; value: number; type: 'percentage' | 'fixed_amount' | 'fixed_price' } =>
      entry.minQty > 0 && entry.value >= 0 && ['percentage', 'fixed_amount', 'fixed_price'].includes(entry.type),
    );
}

function mapRuleSummary(rule: PricingRuleWithRelations) {
  return {
    id: rule.id,
    name: rule.name,
    discountType: rule.discountType,
    priority: rule.priority,
  };
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
