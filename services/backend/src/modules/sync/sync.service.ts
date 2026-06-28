import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ShopifyConnectionTestResponse,
  ShopifyInitialSyncInput,
  ShopifyInitialSyncResponse,
  ShopifySyncResource,
  ShopifySyncStatus,
} from '@factory-engine-pro/contracts';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { SEGMENT_EVALUATION_JOB, SEGMENT_EVALUATION_QUEUE, SHOPIFY_SYNC_QUEUE } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { classifyFulfillment } from '../orders/order-fulfillment-classifier.js';
import { SegmentsService } from '../segments/segments.service.js';
import { ShopifyAdminApiError, ShopifyClientService, type ShopifyCredentials } from './shopify-client.service.js';
import { SHOPIFY_INITIAL_SYNC_JOB, SHOPIFY_SYNC_RESOURCES } from './shopify-sync.constants.js';
import { ShopifySyncStateService } from './shopify-sync-state.service.js';

interface InitialSyncJob {
  tenantId: string;
  batchId: string;
  resources: ShopifySyncResource[];
  syncLogIds: Record<ShopifySyncResource, string>;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopify: ShopifyClientService,
    private readonly state: ShopifySyncStateService,
    private readonly segments: SegmentsService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    @Inject(SHOPIFY_SYNC_QUEUE) private readonly syncQueue: Queue | null,
    @Inject(SEGMENT_EVALUATION_QUEUE) private readonly segmentQueue: Queue | null,
  ) {}

  async status(): Promise<ShopifySyncStatus> {
    return this.state.status(await this.shopify.credentialState()) as Promise<ShopifySyncStatus>;
  }

  async testConnection(): Promise<ShopifyConnectionTestResponse> {
    const startedAt = Date.now();
    const credentialState = await this.shopify.credentialState();
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) {
      const response: ShopifyConnectionTestResponse = {
        ok: false,
        status: 'missing_credentials',
        credentialRequired: true,
        configured: false,
        source: credentialState.source,
        shopifyDomain: credentialState.shopifyDomain,
        apiVersion: null,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        shopId: null,
        shopName: null,
        shopEmail: null,
        error: 'Shopify shop domain and Admin API access token are not configured for this tenant.',
      };
      this.logger.warn('shopify', 'connection_test_failed', 'Shopify connection test skipped because credentials are missing', {
        status: response.status,
        shopify_domain: response.shopifyDomain,
      });
      return response;
    }

    try {
      const shop = await this.shopify.shop(credentials);
      const response: ShopifyConnectionTestResponse = {
        ok: true,
        status: 'ok',
        credentialRequired: false,
        configured: true,
        source: credentials.source,
        shopifyDomain: credentials.shopifyDomain,
        apiVersion: credentials.apiVersion,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        shopId: stringId(shop.id),
        shopName: stringOrNull(shop.name),
        shopEmail: stringOrNull(shop.email),
        error: null,
      };
      this.logger.log('shopify', 'connection_test_ok', 'Shopify connection test succeeded', {
        shopify_domain: response.shopifyDomain,
        source: response.source,
        api_version: response.apiVersion,
        latency_ms: response.latencyMs,
        shop_id: response.shopId,
      });
      return response;
    } catch (error) {
      const response: ShopifyConnectionTestResponse = {
        ok: false,
        status: error instanceof ShopifyAdminApiError ? 'provider_error' : 'network_error',
        credentialRequired: false,
        configured: true,
        source: credentials.source,
        shopifyDomain: credentials.shopifyDomain,
        apiVersion: credentials.apiVersion,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        shopId: null,
        shopName: null,
        shopEmail: null,
        error: providerSafeMessage(error),
      };
      this.logger.warn('shopify', 'connection_test_failed', 'Shopify connection test failed', {
        status: response.status,
        shopify_domain: response.shopifyDomain,
        source: response.source,
        provider_status: providerStatus(error),
        latency_ms: response.latencyMs,
        error: response.error,
      });
      return response;
    }
  }

  async triggerInitialSync(input: ShopifyInitialSyncInput): Promise<ShopifyInitialSyncResponse> {
    const tenantId = this.tenantId();
    const resources = uniqueResources(input.resources ?? SHOPIFY_SYNC_RESOURCES);
    const running = await Promise.all(resources.map(async (resource) => ({
      resource,
      running: await this.state.isRunning(resource),
    })));
    const runningResources = running.filter((entry) => entry.running).map((entry) => entry.resource);
    if (runningResources.length > 0) {
      throw new ConflictException({
        message: `Shopify sync is already running for: ${runningResources.join(', ')}`,
        code: 'shopify_sync_already_running',
      });
    }

    await this.state.reset(resources);
    const batchId = randomUUID();
    const syncLogIds = await this.createQueuedLogs(resources, batchId);
    const job: InitialSyncJob = { tenantId, batchId, resources, syncLogIds };

    if (!this.syncQueue) {
      await this.processInitialSync(job);
      return {
        message: 'Shopify initial sync completed inline because REDIS_URL is not configured.',
        batchId,
        queued: false,
        resources,
        syncLogIds: resources.map((resource) => syncLogIds[resource]),
      };
    }

    await this.syncQueue.add(SHOPIFY_INITIAL_SYNC_JOB, job, {
      attempts: 1,
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 14 * 24 * 60 * 60, count: 100 },
    });

    return {
      message: 'Shopify initial sync queued.',
      batchId,
      queued: true,
      resources,
      syncLogIds: resources.map((resource) => syncLogIds[resource]),
    };
  }

  async processInitialSync(job: InitialSyncJob) {
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) {
      await Promise.all(job.resources.map((resource) => this.failResource(
        resource,
        job.syncLogIds[resource],
        'Shopify Admin credentials are not configured for this tenant.',
      )));
      return { ok: false, reason: 'credentials_missing' };
    }

    const results: Record<string, unknown> = {};
    for (const resource of job.resources) {
      results[resource] = await this.processResource(resource, job.syncLogIds[resource], credentials);
    }
    return results;
  }

  private async processResource(resource: ShopifySyncResource, syncLogId: string, credentials: ShopifyCredentials) {
    if (await this.state.shouldSkip(resource)) {
      await this.finishLog(syncLogId, 'skipped', `${resource} sync disabled after repeated failures.`, { resource });
      return { skipped: true, reason: 'too_many_failures' };
    }

    const acquired = await this.state.acquireLock(resource, syncLogId);
    if (!acquired) {
      await this.finishLog(syncLogId, 'skipped', `${resource} sync lock was not acquired.`, { resource });
      return { skipped: true, reason: 'lock_not_acquired' };
    }

    await this.updateLog(syncLogId, {
      status: 'running',
      message: `${resource} initial sync is running.`,
      metadata: { resource, source: credentials.source },
    });

    try {
      let cursor: string | null = null;
      let processed = 0;
      let pages = 0;
      do {
        const page = await this.fetchPage(resource, credentials, cursor);
        await this.persistPage(resource, page.items);
        processed += page.items.length;
        pages += 1;
        cursor = page.nextCursor;
        await this.state.updateCursor(resource, cursor);
        await this.updateLog(syncLogId, {
          metadata: {
            resource,
            pages,
            recordsProcessed: processed,
            lastCursor: cursor,
            source: credentials.source,
          },
        });
        if (pages > 10_000) throw new Error(`${resource} sync exceeded the safety page limit.`);
      } while (cursor);

      await this.state.complete(resource, processed);
      await this.finishLog(syncLogId, 'completed', `${resource} initial sync completed.`, {
        resource,
        recordsProcessed: processed,
        pages,
        source: credentials.source,
      });
      this.logger.log('shopify', 'sync_completed', 'Shopify sync resource completed', {
        resource,
        records_processed: processed,
      });
      return { processed, pages };
    } catch (error) {
      const message = providerSafeMessage(error);
      await this.state.releaseLock(resource, 'failed', message);
      await this.finishLog(syncLogId, 'failed', message, { resource, providerStatus: providerStatus(error) });
      this.logger.warn('shopify', 'sync_failed', 'Shopify sync resource failed', {
        resource,
        provider_status: providerStatus(error),
        error: message,
      });
      return { failed: true, error: message };
    }
  }

  private fetchPage(resource: ShopifySyncResource, credentials: ShopifyCredentials, cursor: string | null) {
    if (resource === 'customers') return this.shopify.customers(credentials, cursor);
    if (resource === 'products') return this.shopify.products(credentials, cursor);
    return this.shopify.orders(credentials, cursor);
  }

  private async persistPage(resource: ShopifySyncResource, records: Record<string, unknown>[]) {
    if (resource === 'customers') {
      for (const record of records) await this.persistCustomer(record);
      return;
    }
    if (resource === 'products') {
      for (const record of records) await this.persistProduct(record);
      return;
    }
    for (const record of records) await this.persistOrder(record);
  }

  private async persistCustomer(raw: Record<string, unknown>) {
    const shopifyCustomerId = stringId(raw.id);
    if (!shopifyCustomerId) return;
    const firstName = stringOrNull(raw.first_name);
    const lastName = stringOrNull(raw.last_name);
    const email = stringOrNull(raw.email);
    const phone = stringOrNull(raw.phone);
    const totalSpent = numeric(raw.total_spent);
    const ordersCount = integer(raw.orders_count);
    const companyName = stringOrNull((raw.default_address as Record<string, unknown> | undefined)?.company)
      || [firstName, lastName].filter(Boolean).join(' ').trim()
      || email
      || `Shopify Customer ${shopifyCustomerId}`;

    const customer = await this.prisma.db.customer.upsert({
      where: { tenantId_shopifyCustomerId: { tenantId: this.tenantId(), shopifyCustomerId } },
      create: {
        id: prefixedId('cust'),
        tenantId: this.tenantId(),
        shopifyCustomerId,
        companyName,
        firstName,
        lastName,
        email,
        phone,
        billingAddress: jsonOrDbNull(raw.default_address),
        shippingAddress: jsonOrDbNull(raw.default_address),
        tags: tags(raw.tags),
        note: stringOrNull(raw.note),
        totalSpent,
        ordersCount,
        averageOrderValue: ordersCount > 0 ? totalSpent / ordersCount : 0,
        rawData: raw as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      update: {
        companyName,
        firstName,
        lastName,
        email,
        phone,
        billingAddress: jsonOrDbNull(raw.default_address),
        shippingAddress: jsonOrDbNull(raw.default_address),
        tags: tags(raw.tags),
        note: stringOrNull(raw.note),
        totalSpent,
        ordersCount,
        averageOrderValue: ordersCount > 0 ? totalSpent / ordersCount : 0,
        rawData: raw as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    await this.evaluateCustomerSegments(customer.id, 'shopify_customer_sync');
  }

  private async persistProduct(raw: Record<string, unknown>) {
    const shopifyProductId = stringId(raw.id);
    if (!shopifyProductId) return;
    const product = await this.prisma.db.catalogProduct.upsert({
      where: { tenantId_shopifyProductId: { tenantId: this.tenantId(), shopifyProductId } },
      create: {
        id: prefixedId('prod'),
        tenantId: this.tenantId(),
        shopifyProductId,
        title: stringOrNull(raw.title) ?? `Shopify Product ${shopifyProductId}`,
        handle: stringOrNull(raw.handle),
        vendor: stringOrNull(raw.vendor),
        productType: stringOrNull(raw.product_type),
        tags: tags(raw.tags),
        status: stringOrNull(raw.status) ?? 'active',
        images: jsonOrDbNull(raw.images),
        collections: Prisma.JsonNull,
        rawData: raw as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      update: {
        title: stringOrNull(raw.title) ?? `Shopify Product ${shopifyProductId}`,
        handle: stringOrNull(raw.handle),
        vendor: stringOrNull(raw.vendor),
        productType: stringOrNull(raw.product_type),
        tags: tags(raw.tags),
        status: stringOrNull(raw.status) ?? 'active',
        images: jsonOrDbNull(raw.images),
        rawData: raw as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });

    const variants = Array.isArray(raw.variants) ? raw.variants as Record<string, unknown>[] : [];
    for (const variant of variants) {
      const shopifyVariantId = stringId(variant.id);
      if (!shopifyVariantId) continue;
      await this.prisma.db.catalogVariant.upsert({
        where: { tenantId_shopifyVariantId: { tenantId: this.tenantId(), shopifyVariantId } },
        create: {
          id: prefixedId('var'),
          tenantId: this.tenantId(),
          productId: product.id,
          shopifyVariantId,
          sku: stringOrNull(variant.sku),
          title: stringOrNull(variant.title) ?? product.title,
          price: numeric(variant.price),
          compareAtPrice: nullableNumeric(variant.compare_at_price),
          inventoryQuantity: nullableInteger(variant.inventory_quantity),
          inventoryPolicy: stringOrNull(variant.inventory_policy),
          availableForSale: nullableInteger(variant.inventory_quantity) !== 0,
          position: integer(variant.position),
          rawData: variant as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        update: {
          productId: product.id,
          sku: stringOrNull(variant.sku),
          title: stringOrNull(variant.title) ?? product.title,
          price: numeric(variant.price),
          compareAtPrice: nullableNumeric(variant.compare_at_price),
          inventoryQuantity: nullableInteger(variant.inventory_quantity),
          inventoryPolicy: stringOrNull(variant.inventory_policy),
          availableForSale: nullableInteger(variant.inventory_quantity) !== 0,
          position: integer(variant.position),
          rawData: variant as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      });
    }
  }

  private async persistOrder(raw: Record<string, unknown>) {
    const shopifyOrderId = stringId(raw.id);
    if (!shopifyOrderId) return;
    const customer = objectOrNull(raw.customer);
    const shopifyCustomerId = stringId(customer?.id);
    const localCustomer = customer ? await this.ensureCustomerFromOrder(customer) : null;
    const lineItems = Array.isArray(raw.line_items) ? raw.line_items as Record<string, unknown>[] : [];
    const shippingLines = Array.isArray(raw.shipping_lines) ? raw.shipping_lines as Record<string, unknown>[] : [];
    const fulfillment = classifyFulfillment({
      tags: tags(raw.tags),
      lineItems,
      shippingAddress: raw.shipping_address,
      shippingLines,
      fulfillmentStatus: stringOrNull(raw.fulfillment_status),
    });

    await this.prisma.db.commerceOrder.upsert({
      where: { tenantId_shopifyOrderId: { tenantId: this.tenantId(), shopifyOrderId } },
      create: {
        id: prefixedId('ord'),
        tenantId: this.tenantId(),
        customerId: localCustomer?.id,
        shopifyOrderId,
        shopifyOrderNumber: stringOrNull(raw.order_number) ?? stringOrNull(raw.name)?.replace('#', '') ?? null,
        shopifyCustomerId,
        source: 'shopify',
        email: stringOrNull(raw.email),
        phone: stringOrNull(raw.phone),
        subtotal: numeric(raw.subtotal_price),
        totalDiscounts: numeric(raw.total_discounts),
        totalTax: numeric(raw.total_tax),
        totalPrice: numeric(raw.total_price),
        totalShipping: shippingLines.reduce((sum, line) => sum + numeric(line.price), 0),
        totalRefunded: 0,
        currency: stringOrNull(raw.currency) ?? 'USD',
        financialStatus: stringOrNull(raw.financial_status),
        fulfillmentStatus: stringOrNull(raw.fulfillment_status),
        fulfillmentMode: fulfillment.mode,
        notes: stringOrNull(raw.note),
        tags: tags(raw.tags),
        riskLevel: null,
        lineItems: lineItems.map(mapLineItem) as Prisma.InputJsonValue,
        shippingAddress: jsonOrDbNull(raw.shipping_address),
        billingAddress: jsonOrDbNull(raw.billing_address),
        discountCodes: jsonOrDbNull(raw.discount_codes),
        fulfillments: jsonOrDbNull(raw.fulfillments),
        refunds: jsonOrDbNull(raw.refunds),
        fulfillmentEvidence: fulfillment.evidence as Prisma.InputJsonValue,
        rawData: raw as Prisma.InputJsonValue,
        processedAt: dateOrNull(raw.processed_at),
        cancelledAt: dateOrNull(raw.cancelled_at),
        closedAt: dateOrNull(raw.closed_at),
        syncedAt: new Date(),
      },
      update: {
        customerId: localCustomer?.id,
        shopifyOrderNumber: stringOrNull(raw.order_number) ?? stringOrNull(raw.name)?.replace('#', '') ?? null,
        shopifyCustomerId,
        email: stringOrNull(raw.email),
        phone: stringOrNull(raw.phone),
        subtotal: numeric(raw.subtotal_price),
        totalDiscounts: numeric(raw.total_discounts),
        totalTax: numeric(raw.total_tax),
        totalPrice: numeric(raw.total_price),
        totalShipping: shippingLines.reduce((sum, line) => sum + numeric(line.price), 0),
        currency: stringOrNull(raw.currency) ?? 'USD',
        financialStatus: stringOrNull(raw.financial_status),
        fulfillmentStatus: stringOrNull(raw.fulfillment_status),
        fulfillmentMode: fulfillment.mode,
        notes: stringOrNull(raw.note),
        tags: tags(raw.tags),
        lineItems: lineItems.map(mapLineItem) as Prisma.InputJsonValue,
        shippingAddress: jsonOrDbNull(raw.shipping_address),
        billingAddress: jsonOrDbNull(raw.billing_address),
        discountCodes: jsonOrDbNull(raw.discount_codes),
        fulfillments: jsonOrDbNull(raw.fulfillments),
        refunds: jsonOrDbNull(raw.refunds),
        fulfillmentEvidence: fulfillment.evidence as Prisma.InputJsonValue,
        rawData: raw as Prisma.InputJsonValue,
        processedAt: dateOrNull(raw.processed_at),
        cancelledAt: dateOrNull(raw.cancelled_at),
        closedAt: dateOrNull(raw.closed_at),
        syncedAt: new Date(),
      },
    });
  }

  private async ensureCustomerFromOrder(customer: Record<string, unknown>) {
    const shopifyCustomerId = stringId(customer.id);
    if (!shopifyCustomerId) return null;
    const existing = await this.prisma.db.customer.findFirst({ where: { shopifyCustomerId } });
    if (existing) {
      await this.evaluateCustomerSegments(existing.id, 'shopify_order_customer_sync');
      return existing;
    }
    const firstName = stringOrNull(customer.first_name);
    const lastName = stringOrNull(customer.last_name);
    const email = stringOrNull(customer.email);
    const companyName = [firstName, lastName].filter(Boolean).join(' ').trim()
      || email
      || `Shopify Customer ${shopifyCustomerId}`;
    const created = await this.prisma.db.customer.create({
      data: {
        id: prefixedId('cust'),
        tenantId: this.tenantId(),
        shopifyCustomerId,
        companyName,
        firstName,
        lastName,
        email,
        phone: stringOrNull(customer.phone),
        tags: tags(customer.tags),
        rawData: customer as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    await this.evaluateCustomerSegments(created.id, 'shopify_order_customer_sync');
    return created;
  }

  private async evaluateCustomerSegments(customerId: string, source: string) {
    try {
      if (this.segmentQueue) {
        const tenantId = this.tenantId();
        const job = await this.segmentQueue.add(
          SEGMENT_EVALUATION_JOB,
          { tenantId, customerId, source },
          { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 500, removeOnFail: 500 },
        );
        this.logger.log('shopify', 'segment_evaluation_queued', 'Shopify sync queued customer segment evaluation', {
          customer_id: customerId,
          source,
          job_id: job.id,
        });
        return;
      }
      const result = await this.segments.evaluateForCustomer(customerId);
      this.logger.log('shopify', 'segment_evaluation_completed', 'Shopify sync evaluated customer segments', {
        customer_id: customerId,
        source,
        matched_count: result.matched.length,
        added_count: result.added.length,
        removed_count: result.removed.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('shopify', 'segment_evaluation_failed', 'Shopify sync segment evaluation failed', {
        customer_id: customerId,
        source,
        error: message,
      });
    }
  }

  private async createQueuedLogs(resources: ShopifySyncResource[], batchId: string) {
    const entries = await Promise.all(resources.map(async (resource) => {
      const log = await this.prisma.db.syncLog.create({
        data: {
          id: prefixedId('slog'),
          tenantId: this.tenantId(),
          service: 'shopify',
          action: `initial.${resource}`,
          status: 'queued',
          message: `${resource} initial sync queued.`,
          metadata: { resource, batchId, mode: 'initial' },
        },
      });
      return [resource, log.id] as const;
    }));
    return Object.fromEntries(entries) as Record<ShopifySyncResource, string>;
  }

  private async failResource(resource: ShopifySyncResource, syncLogId: string, message: string) {
    await this.state.markFailed(resource, message);
    await this.finishLog(syncLogId, 'failed', message, { resource });
  }

  private updateLog(id: string, data: { status?: string; message?: string; metadata?: Prisma.InputJsonValue }) {
    return this.prisma.db.syncLog.updateMany({ where: { id }, data });
  }

  private finishLog(id: string, status: string, message: string, metadata: Prisma.InputJsonValue) {
    return this.prisma.db.syncLog.updateMany({
      where: { id },
      data: {
        status,
        message,
        finishedAt: new Date(),
        metadata,
      },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}

function uniqueResources(resources: ShopifySyncResource[]) {
  const unique = [...new Set(resources)];
  if (unique.some((resource) => !SHOPIFY_SYNC_RESOURCES.includes(resource))) {
    throw new BadRequestException('Invalid Shopify sync resource.');
  }
  return unique;
}

function providerSafeMessage(error: unknown) {
  if (error instanceof ShopifyAdminApiError) return error.message;
  return error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
}

function providerStatus(error: unknown) {
  return error instanceof ShopifyAdminApiError ? error.status : null;
}

function stringId(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function stringOrNull(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text || null;
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return numeric(value);
}

function integer(value: unknown) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return integer(value);
}

function tags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function jsonOrDbNull(value: unknown) {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function dateOrNull(value: unknown) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapLineItem(item: Record<string, unknown>) {
  return {
    id: stringId(item.id),
    title: stringOrNull(item.title),
    quantity: integer(item.quantity),
    sku: stringOrNull(item.sku),
    variant_id: stringId(item.variant_id),
    product_id: stringId(item.product_id),
    variant_title: stringOrNull(item.variant_title),
    price: stringOrNull(item.price),
    properties: Array.isArray(item.properties) ? item.properties : [],
  };
}
