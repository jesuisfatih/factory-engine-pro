import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import {
  type CalculatePricesInput,
  type CreatePricingRuleInput,
  type PricingRulesQuery,
  type TogglePricingRuleInput,
  type UpdatePricingRuleInput,
} from '@factory-engine-pro/contracts';
import { ShopifyAdminDiscountService } from '@factory-engine-pro/integrations';
import { AppLogger } from '../../shared/logger.service.js';
import { CryptoService } from '../../shared/crypto.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { PRICING_RULE_SYNC_QUEUE } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { PricingCalculatorService } from './pricing-calculator.service.js';
import { type PricingRuleWithRelations, PricingRepository } from './pricing.repository.js';
import {
  PRICING_RULE_SYNC_JOB,
  SHOPIFY_FUNCTION_METAFIELD_KEY,
  SHOPIFY_FUNCTION_METAFIELD_NAMESPACE,
} from './pricing-sync.constants.js';

@Injectable()
export class PricingService {
  private readonly shopify = new ShopifyAdminDiscountService();

  constructor(
    private readonly repository: PricingRepository,
    private readonly calculator: PricingCalculatorService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly crypto: CryptoService,
    private readonly logger: AppLogger,
    @Inject(PRICING_RULE_SYNC_QUEUE) private readonly syncQueue: Queue | null,
  ) {}

  calculate(input: CalculatePricesInput) {
    return this.calculator.calculate(input);
  }

  async listRules(query: PricingRulesQuery) {
    const rules = await this.repository.list(this.whereFromQuery(query), query.limit);
    return {
      data: rules.map((rule) => this.mapRule(rule)),
      meta: { count: rules.length, limit: query.limit },
    };
  }

  async getRule(id: string) {
    return this.mapRule(await this.repository.getRequired(id), true);
  }

  async createRule(input: CreatePricingRuleInput) {
    const executionMode = this.classifyExecutionMode(input.executionMode, input);
    const syncState = this.initialSyncState(executionMode, input.isActive);
    const rule = await this.repository.create({
      ...this.toCreateData(input),
      executionMode,
      shopifySyncState: syncState,
    });
    await this.enqueueSyncIfNeeded(rule);
    this.logger.log('pricing', 'create_rule', 'Pricing rule created', { rule_id: rule.id, execution_mode: executionMode });
    return this.mapRule(await this.repository.getRequired(rule.id), true);
  }

  async updateRule(id: string, input: UpdatePricingRuleInput) {
    const existing = await this.repository.getRequired(id);
    const executionMode = this.classifyExecutionMode(input.executionMode ?? existing.executionMode, {
      discountType: input.discountType ?? existing.discountType,
      targetType: input.targetType ?? existing.targetType,
      scopeType: input.scopeType ?? existing.scopeType,
      qtyBreaks: input.qtyBreaks ?? (Array.isArray(existing.qtyBreaks) ? existing.qtyBreaks : []),
    });
    const rule = await this.repository.update(id, {
      ...this.toUpdateData(input),
      executionMode,
      shopifySyncState: this.initialSyncState(executionMode, input.isActive ?? existing.isActive),
      shopifySyncError: null,
    });
    await this.enqueueSyncIfNeeded(rule);
    return this.mapRule(rule, true);
  }

  async deleteRule(id: string) {
    const result = await this.repository.delete(id);
    if (result.count === 0) throw new BadRequestException('Pricing rule cannot be deleted');
    return { ok: true };
  }

  async toggleRule(id: string, input: TogglePricingRuleInput) {
    const rule = await this.repository.update(id, {
      isActive: input.isActive,
      shopifySyncState: input.isActive ? 'pending' : 'disabled',
      shopifySyncError: null,
    });
    await this.enqueueSyncIfNeeded(rule);
    return this.mapRule(rule, true);
  }

  async resyncRule(id: string) {
    const rule = await this.repository.update(id, {
      shopifySyncState: 'pending',
      shopifySyncError: null,
    });
    await this.enqueueSyncIfNeeded(rule, true);
    return this.mapRule(await this.repository.getRequired(id), true);
  }

  async listShopifyDiscounts() {
    const credentials = await this.shopifyCredentials();
    if (!credentials) {
      return { codeDiscounts: [], automaticDiscounts: [], warning: 'Shopify Admin credentials are not configured for this tenant.' };
    }
    try {
      return await this.shopify.fetchDiscountCatalog(credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shopify discount catalog could not be loaded.';
      this.logger.warn('pricing', 'discount_catalog_failed', 'Shopify discount catalog could not be loaded', {
        shop_domain: credentials.shopDomain,
        error: message,
      });
      return {
        codeDiscounts: [],
        automaticDiscounts: [],
        warning: `Shopify discount catalog could not be loaded: ${message}`,
      };
    }
  }

  async processSyncJob(ruleId: string) {
    const rule = await this.repository.findById(ruleId);
    if (!rule) {
      this.logger.warn('pricing', 'sync_rule_missing', 'Pricing sync skipped because rule no longer exists', { rule_id: ruleId });
      return;
    }
    if (!rule.isActive) {
      await this.repository.setSyncState(rule.id, {
        shopifySyncState: 'disabled',
        shopifySyncError: null,
      });
      return;
    }
    if (['draft_order', 'display_only'].includes(rule.executionMode)) {
      await this.repository.setSyncState(rule.id, {
        shopifySyncState: 'not_applicable',
        shopifySyncError: null,
      });
      return;
    }

    await this.repository.setSyncState(rule.id, {
      shopifySyncState: 'syncing',
      shopifySyncError: null,
      shopifySyncAttempts: { increment: 1 },
    });

    try {
      const credentials = await this.shopifyCredentials();
      if (!credentials) throw new Error('Shopify Admin credentials are not configured for this tenant.');
      const result = rule.executionMode === 'shopify_function'
        ? await this.createFunctionDiscount(credentials, rule)
        : await this.shopify.createDiscountCode(credentials, {
            title: rule.name,
            code: rule.shopifyDiscountCode ?? discountCode(rule),
            startsAt: (rule.validFrom ?? new Date()).toISOString(),
            endsAt: rule.validUntil?.toISOString() ?? null,
            percentage: rule.discountType === 'percentage' ? money(rule.discountPercentage) : undefined,
            amount: rule.discountType === 'fixed_amount' ? money(rule.discountValue) : undefined,
          });
      await this.repository.setSyncState(rule.id, {
        shopifyDiscountCode: rule.shopifyDiscountCode ?? discountCode(rule),
        shopifyDiscountId: discountIdFromResult(result),
        shopifySyncState: 'synced',
        shopifySyncError: null,
        shopifySyncedAt: new Date(),
      });
    } catch (error) {
      await this.repository.setSyncState(rule.id, {
        shopifySyncState: 'failed',
        shopifySyncError: error instanceof Error ? error.message : 'Shopify discount sync failed',
      });
      throw error;
    }
  }

  private async enqueueSyncIfNeeded(rule: PricingRuleWithRelations, force = false) {
    if (!force && !['native_basic', 'shopify_function'].includes(rule.executionMode)) return;
    if (!rule.isActive) return;
    if (!this.syncQueue) {
      await this.repository.setSyncState(rule.id, {
        shopifySyncState: 'failed',
        shopifySyncError: 'REDIS_URL is not configured; pricing sync queue is unavailable.',
      });
      return;
    }
    const tenantId = this.tenantContext.require().tenantId;
    await this.syncQueue.add(PRICING_RULE_SYNC_JOB, { tenantId, ruleId: rule.id }, { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } });
  }

  private async shopifyCredentials() {
    const config = await this.prisma.db.tenantConfig.findFirst({});
    const token = this.crypto.decrypt(config?.shopifyAdminTokenEncrypted);
    if (!config?.shopifyDomain || !token) return null;
    return {
      shopDomain: config.shopifyDomain,
      adminAccessToken: token,
      apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-01',
    };
  }

  private whereFromQuery(query: PricingRulesQuery): Prisma.PricingRuleWhereInput {
    const and: Prisma.PricingRuleWhereInput[] = [];
    if (query.search) and.push({ name: { contains: query.search, mode: 'insensitive' } });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    if (query.syncState) and.push({ shopifySyncState: query.syncState });
    if (query.executionMode) and.push({ executionMode: query.executionMode });
    return and.length > 0 ? { AND: and } : {};
  }

  private classifyExecutionMode(
    requested: string | undefined,
    input: { discountType: string; targetType?: string; scopeType?: string; qtyBreaks?: unknown[] },
  ) {
    if (requested) return requested;
    if (input.discountType === 'qty_break') return 'shopify_function';
    if (input.targetType === 'all' && input.scopeType === 'all' && ['percentage', 'fixed_amount'].includes(input.discountType)) {
      return 'native_basic';
    }
    return requested ?? 'draft_order';
  }

  private initialSyncState(executionMode: string, isActive: boolean) {
    if (!isActive) return 'disabled';
    return ['native_basic', 'shopify_function'].includes(executionMode) ? 'pending' : 'not_applicable';
  }

  private toCreateData(input: CreatePricingRuleInput): Omit<Prisma.PricingRuleUncheckedCreateInput, 'id' | 'tenantId'> {
    return {
      name: input.name,
      description: input.description,
      targetType: input.targetType,
      targetCustomerId: input.targetCustomerId || null,
      targetCustomerUserId: input.targetCustomerUserId || null,
      targetCustomerGroup: input.targetCustomerGroup || null,
      targetShopifyCustomerId: input.targetShopifyCustomerId || null,
      targetTags: input.targetTags,
      scopeType: input.scopeType,
      scopeProductIds: input.scopeProductIds,
      scopeCollectionIds: input.scopeCollectionIds,
      scopeTags: input.scopeTags,
      scopeVariantIds: input.scopeVariantIds,
      discountType: input.discountType,
      discountValue: input.discountValue,
      discountPercentage: input.discountPercentage,
      qtyBreaks: input.qtyBreaks as Prisma.InputJsonValue,
      minCartAmount: input.minCartAmount,
      discountPolicy: input.discountPolicy,
      priority: input.priority,
      isActive: input.isActive,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    };
  }

  private toUpdateData(input: UpdatePricingRuleInput): Prisma.PricingRuleUpdateManyMutationInput {
    return this.sharedData(input);
  }

  private sharedData(input: Partial<CreatePricingRuleInput>): Prisma.PricingRuleUpdateManyMutationInput {
    return {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.targetType !== undefined && { targetType: input.targetType }),
      ...(input.targetCustomerId !== undefined && { targetCustomerId: input.targetCustomerId || null }),
      ...(input.targetCustomerUserId !== undefined && { targetCustomerUserId: input.targetCustomerUserId || null }),
      ...(input.targetCustomerGroup !== undefined && { targetCustomerGroup: input.targetCustomerGroup || null }),
      ...(input.targetShopifyCustomerId !== undefined && { targetShopifyCustomerId: input.targetShopifyCustomerId || null }),
      ...(input.targetTags !== undefined && { targetTags: input.targetTags }),
      ...(input.scopeType !== undefined && { scopeType: input.scopeType }),
      ...(input.scopeProductIds !== undefined && { scopeProductIds: input.scopeProductIds }),
      ...(input.scopeCollectionIds !== undefined && { scopeCollectionIds: input.scopeCollectionIds }),
      ...(input.scopeTags !== undefined && { scopeTags: input.scopeTags }),
      ...(input.scopeVariantIds !== undefined && { scopeVariantIds: input.scopeVariantIds }),
      ...(input.discountType !== undefined && { discountType: input.discountType }),
      ...(input.discountValue !== undefined && { discountValue: input.discountValue }),
      ...(input.discountPercentage !== undefined && { discountPercentage: input.discountPercentage }),
      ...(input.qtyBreaks !== undefined && { qtyBreaks: input.qtyBreaks as Prisma.InputJsonValue }),
      ...(input.minCartAmount !== undefined && { minCartAmount: input.minCartAmount }),
      ...(input.discountPolicy !== undefined && { discountPolicy: input.discountPolicy }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.validFrom !== undefined && { validFrom: input.validFrom ? new Date(input.validFrom) : null }),
      ...(input.validUntil !== undefined && { validUntil: input.validUntil ? new Date(input.validUntil) : null }),
    };
  }

  private ruleConfig(rule: PricingRuleWithRelations) {
    return {
      ruleId: rule.id,
      targetType: rule.targetType,
      targetTags: rule.targetTags,
      scopeType: rule.scopeType,
      scopeProductIds: rule.scopeProductIds,
      scopeCollectionIds: rule.scopeCollectionIds,
      scopeTags: rule.scopeTags,
      scopeVariantIds: rule.scopeVariantIds,
      discountType: rule.discountType,
      discountValue: money(rule.discountValue),
      discountPercentage: money(rule.discountPercentage),
      qtyBreaks: rule.qtyBreaks,
    };
  }

  private createFunctionDiscount(credentials: { shopDomain: string; adminAccessToken: string; apiVersion?: string }, rule: PricingRuleWithRelations) {
    const functionId = process.env.SHOPIFY_PRICING_FUNCTION_ID;
    if (!functionId) {
      throw new Error('SHOPIFY_PRICING_FUNCTION_ID is required for Shopify Function pricing sync.');
    }
    return this.shopify.createAppDiscountCode(credentials, {
      title: rule.name,
      code: rule.shopifyDiscountCode ?? discountCode(rule),
      startsAt: (rule.validFrom ?? new Date()).toISOString(),
      endsAt: rule.validUntil?.toISOString() ?? null,
      functionId,
      metafields: [
        {
          namespace: SHOPIFY_FUNCTION_METAFIELD_NAMESPACE,
          key: SHOPIFY_FUNCTION_METAFIELD_KEY,
          type: 'json',
          value: JSON.stringify(this.ruleConfig(rule)),
        },
      ],
    });
  }

  private mapRule(rule: PricingRuleWithRelations, detailed = false) {
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      targetType: rule.targetType,
      targetCustomerId: rule.targetCustomerId,
      targetCustomerName: rule.targetCustomer?.companyName ?? null,
      targetCustomerUserId: rule.targetCustomerUserId,
      targetCustomerUserEmail: rule.targetCustomerUser?.email ?? null,
      targetCustomerGroup: rule.targetCustomerGroup,
      targetShopifyCustomerId: rule.targetShopifyCustomerId,
      targetTags: rule.targetTags,
      scopeType: rule.scopeType,
      scopeProductIds: detailed ? rule.scopeProductIds : undefined,
      scopeCollectionIds: detailed ? rule.scopeCollectionIds : undefined,
      scopeTags: rule.scopeTags,
      scopeVariantIds: detailed ? rule.scopeVariantIds : undefined,
      discountType: rule.discountType,
      discountValue: money(rule.discountValue),
      discountPercentage: money(rule.discountPercentage),
      qtyBreaks: rule.qtyBreaks,
      minCartAmount: money(rule.minCartAmount),
      discountPolicy: rule.discountPolicy,
      priority: rule.priority,
      isActive: rule.isActive,
      validFrom: rule.validFrom?.toISOString() ?? null,
      validUntil: rule.validUntil?.toISOString() ?? null,
      shopifyDiscountCode: rule.shopifyDiscountCode,
      shopifyDiscountId: rule.shopifyDiscountId,
      executionMode: rule.executionMode,
      shopifySyncState: rule.shopifySyncState,
      shopifySyncError: rule.shopifySyncError,
      shopifySyncedAt: rule.shopifySyncedAt?.toISOString() ?? null,
      shopifySyncAttempts: rule.shopifySyncAttempts,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}

function discountCode(rule: PricingRuleWithRelations) {
  return `FEP-${rule.id.replace(/^prule_/, '').slice(0, 10).toUpperCase()}`;
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function discountIdFromResult(result: { id?: string; discountId?: string } | null) {
  return result?.id ?? result?.discountId ?? null;
}
