import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { accountPortalExperienceSchema } from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { ShopifyClientService } from './shopify-client.service.js';

const RESOURCE = 'abandoned_checkouts';
const LOCK_TTL_MS = 15 * 60 * 1000;
const INCREMENTAL_OVERLAP_MS = 10 * 60 * 1000;

export type ShopifyAbandonedCheckoutJobData = {
  tenantId: string;
  full?: boolean;
};

@Injectable()
export class ShopifyAbandonedCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopify: ShopifyClientService,
    private readonly crypto: CryptoService,
    private readonly logger: AppLogger,
  ) {}

  async eligibleTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      include: { config: true },
      orderBy: { slug: 'asc' },
    });
    return tenants.filter((tenant) => portalMode(tenant.config?.accountPortalExperience) === 'order_history');
  }

  async sync(job: ShopifyAbandonedCheckoutJobData) {
    const tenantId = job.tenantId;
    if (!await this.enabled(tenantId)) return { skipped: true, reason: 'portal_mode_disabled' };
    const credentials = await this.shopify.resolveCredentials(tenantId);
    if (!credentials) return { skipped: true, reason: 'shopify_credentials_missing' };

    const state = await this.prisma.db.shopifySyncState.upsert({
      where: { tenantId_resource: { tenantId, resource: RESOURCE } },
      create: { id: prefixedId('ssync'), tenantId, resource: RESOURCE, status: 'idle' },
      update: {},
    });
    const now = new Date();
    if (state.isLocked && state.lockExpiresAt && state.lockExpiresAt > now) {
      return { skipped: true, reason: 'sync_locked' };
    }
    const lockExpiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource: RESOURCE },
      data: {
        isLocked: true,
        lockedAt: now,
        lockExpiresAt,
        heartbeatAt: now,
        lastStartedAt: now,
        status: 'running',
        lastError: null,
      },
    });

    const full = Boolean(job.full || !state.lastCompletedAt);
    const query: Record<string, string> = full || !state.lastCompletedAt
      ? {}
      : { updated_at_min: new Date(state.lastCompletedAt.getTime() - INCREMENTAL_OVERLAP_MS).toISOString() };
    let cursor: string | null = null;
    let seen = 0;
    let stored = 0;
    try {
      do {
        const page = await this.shopify.abandonedCheckouts(credentials, cursor, query);
        for (const checkout of page.items) {
          seen += 1;
          if (await this.persist(tenantId, checkout)) stored += 1;
        }
        cursor = page.nextCursor;
        const heartbeat = new Date();
        await this.prisma.db.shopifySyncState.updateMany({
          where: { resource: RESOURCE },
          data: {
            lastCursor: cursor,
            heartbeatAt: heartbeat,
            lockExpiresAt: new Date(heartbeat.getTime() + LOCK_TTL_MS),
          },
        });
      } while (cursor);

      if (full) {
        await this.prisma.db.accountAbandonedCheckout.updateMany({
          where: { status: 'open', syncedAt: { lt: now } },
          data: { status: 'closed', closedAt: new Date(), recoveryUrlEncrypted: null },
        });
      }
      await this.finish(state.totalRecordsSynced + stored, stored);
      this.logger.log('shopify', 'abandoned_checkout_sync_completed', 'Shopify abandoned checkout sync completed', {
        tenant_id: tenantId,
        mode: full ? 'full' : 'incremental',
        provider_records: seen,
        matched_records: stored,
      });
      return { skipped: false, full, seen, stored };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.db.shopifySyncState.updateMany({
        where: { resource: RESOURCE },
        data: {
          isLocked: false,
          lockedAt: null,
          lockExpiresAt: null,
          heartbeatAt: new Date(),
          status: 'failed',
          lastFailedAt: new Date(),
          consecutiveFailures: state.consecutiveFailures + 1,
          lastError: message.slice(0, 500),
        },
      });
      this.logger.warn('shopify', 'abandoned_checkout_sync_failed', 'Shopify abandoned checkout sync failed', {
        tenant_id: tenantId,
        error: message,
      });
      throw error;
    }
  }

  private async enabled(tenantId: string) {
    const config = await this.prisma.db.tenantConfig.findFirst({
      where: { tenantId },
      select: { accountPortalExperience: true },
    });
    return portalMode(config?.accountPortalExperience) === 'order_history';
  }

  private async persist(tenantId: string, raw: Record<string, unknown>) {
    const shopifyCheckoutId = textId(raw.id);
    if (!shopifyCheckoutId) return false;
    const customerRaw = record(raw.customer);
    const shopifyCustomerId = textId(customerRaw?.id);
    const email = text(raw.email) ?? text(customerRaw?.email);
    const customer = await this.resolveCustomer(tenantId, shopifyCustomerId, email);
    if (!customer) return false;

    const completedAt = date(raw.completed_at);
    const closedAt = date(raw.closed_at);
    const recoveryUrl = completedAt || closedAt ? null : secureRecoveryUrl(raw.abandoned_checkout_url);
    const lineItems = checkoutLineItems(raw.line_items);
    const data = {
      customerId: customer.id,
      shopifyCustomerId,
      name: text(raw.name),
      email,
      status: completedAt ? 'completed' : closedAt ? 'closed' : 'open',
      currency: text(raw.presentment_currency) ?? text(raw.currency) ?? 'USD',
      subtotal: decimal(raw.subtotal_price),
      totalPrice: decimal(raw.total_price),
      totalDiscounts: decimal(raw.total_discounts),
      lineItems: lineItems as Prisma.InputJsonValue,
      recoveryUrlEncrypted: recoveryUrl ? this.crypto.encrypt(recoveryUrl) : null,
      providerCreatedAt: date(raw.created_at) ?? new Date(),
      providerUpdatedAt: date(raw.updated_at) ?? new Date(),
      completedAt,
      closedAt,
      syncedAt: new Date(),
    };
    await this.prisma.db.accountAbandonedCheckout.upsert({
      where: { tenantId_shopifyCheckoutId: { tenantId, shopifyCheckoutId } },
      create: { id: prefixedId('acout'), tenantId, shopifyCheckoutId, ...data },
      update: data,
    });
    return true;
  }

  private async resolveCustomer(tenantId: string, shopifyCustomerId: string | null, email: string | null) {
    if (shopifyCustomerId) {
      const direct = await this.prisma.db.customer.findFirst({ where: { tenantId, shopifyCustomerId } });
      if (direct) return direct;
    }
    if (!email) return null;
    const matches = await this.prisma.db.customer.findMany({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      take: 2,
    });
    return matches.length === 1 ? matches[0] : null;
  }

  private async finish(totalRecordsSynced: number, lastRunRecords: number) {
    const now = new Date();
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource: RESOURCE },
      data: {
        isLocked: false,
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: now,
        currentSyncLogId: null,
        status: 'completed',
        lastCompletedAt: now,
        consecutiveFailures: 0,
        lastError: null,
        lastCursor: null,
        totalRecordsSynced,
        lastRunRecords,
      },
    });
  }
}

export function checkoutLineItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const item = record(entry);
    if (!item) return [];
    return [{
      id: textId(item.id) ?? `line-${index + 1}`,
      productId: textId(item.product_id),
      variantId: textId(item.variant_id),
      title: text(item.title) ?? 'Item',
      variantTitle: text(item.variant_title),
      sku: text(item.sku),
      quantity: integer(item.quantity, 1),
      unitPrice: decimal(item.price),
      lineTotal: decimal(item.line_price),
    }];
  });
}

export function secureRecoveryUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function portalMode(value: unknown) {
  const parsed = accountPortalExperienceSchema.safeParse(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  return parsed.success ? parsed.data.portalMode : 'standard';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function textId(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value);
}

function date(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decimal(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
