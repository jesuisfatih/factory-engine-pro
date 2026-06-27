import { BadRequestException, Injectable } from '@nestjs/common';
import type { ShopifySyncResource } from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import {
  SHOPIFY_SYNC_LOCK_TTL_MS,
  SHOPIFY_SYNC_MAX_FAILURES,
  SHOPIFY_SYNC_RESOURCES,
} from './shopify-sync.constants.js';

@Injectable()
export class ShopifySyncStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async getState(resource: ShopifySyncResource) {
    const tenantId = this.tenantId();
    return this.prisma.db.shopifySyncState.upsert({
      where: { tenantId_resource: { tenantId, resource } },
      create: {
        id: prefixedId('ssync'),
        tenantId,
        resource,
        status: 'idle',
      },
      update: {},
    });
  }

  async getAllStates() {
    await Promise.all(SHOPIFY_SYNC_RESOURCES.map((resource) => this.getState(resource)));
    return this.prisma.db.shopifySyncState.findMany({
      where: {},
      orderBy: { resource: 'asc' },
    });
  }

  async isRunning(resource: ShopifySyncResource) {
    const state = await this.getState(resource);
    if (!state.isLocked) return false;
    if (state.lockExpiresAt && new Date() > state.lockExpiresAt) {
      this.logger.warn('shopify', 'sync_stale_lock_released', 'Shopify sync stale lock released', {
        resource,
        tenant_id: this.tenantId(),
      });
      await this.releaseLock(resource, 'failed', 'Stale lock auto-released');
      return false;
    }
    return true;
  }

  async shouldSkip(resource: ShopifySyncResource) {
    const state = await this.getState(resource);
    return state.consecutiveFailures >= SHOPIFY_SYNC_MAX_FAILURES;
  }

  async reset(resources: ShopifySyncResource[]) {
    await Promise.all(resources.map((resource) => this.getState(resource)));
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource: { in: resources } },
      data: {
        isLocked: false,
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: null,
        currentSyncLogId: null,
        status: 'idle',
        lastCursor: null,
        lastStartedAt: null,
        lastCompletedAt: null,
        lastFailedAt: null,
        totalRecordsSynced: 0,
        lastRunRecords: 0,
        consecutiveFailures: 0,
        lastError: null,
        metadata: {},
      },
    });
  }

  async acquireLock(resource: ShopifySyncResource, syncLogId?: string) {
    await this.getState(resource);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SHOPIFY_SYNC_LOCK_TTL_MS);
    const result = await this.prisma.db.shopifySyncState.updateMany({
      where: { resource, isLocked: false },
      data: {
        isLocked: true,
        lockedAt: now,
        lockExpiresAt: expiresAt,
        heartbeatAt: now,
        currentSyncLogId: syncLogId ?? null,
        status: 'running',
        lastStartedAt: now,
        lastError: null,
      },
    });
    if (result.count > 0) return true;

    const state = await this.getState(resource);
    if (state.isLocked && state.lockExpiresAt && new Date() > state.lockExpiresAt) {
      await this.prisma.db.shopifySyncState.updateMany({
        where: { resource },
        data: {
          isLocked: true,
          lockedAt: now,
          lockExpiresAt: expiresAt,
          heartbeatAt: now,
          currentSyncLogId: syncLogId ?? null,
          status: 'running',
          lastStartedAt: now,
          lastError: null,
        },
      });
      return true;
    }
    return false;
  }

  async updateCursor(resource: ShopifySyncResource, cursor: string | null) {
    const now = new Date();
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource },
      data: {
        lastCursor: cursor,
        heartbeatAt: now,
        lockExpiresAt: new Date(now.getTime() + SHOPIFY_SYNC_LOCK_TTL_MS),
      },
    });
  }

  async releaseLock(resource: ShopifySyncResource, finalStatus: 'completed' | 'failed', error?: string) {
    const state = await this.getState(resource);
    const now = new Date();
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource },
      data: {
        isLocked: false,
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: now,
        currentSyncLogId: null,
        status: finalStatus,
        ...(finalStatus === 'completed'
          ? {
              lastCompletedAt: now,
              consecutiveFailures: 0,
              lastError: null,
            }
          : {
              lastFailedAt: now,
              consecutiveFailures: state.consecutiveFailures + 1,
              lastError: error ?? 'Unknown Shopify sync error',
            }),
      },
    });
  }

  async markFailed(resource: ShopifySyncResource, error: string) {
    await this.getState(resource);
    const state = await this.getState(resource);
    const now = new Date();
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource },
      data: {
        isLocked: false,
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: now,
        currentSyncLogId: null,
        status: 'failed',
        lastFailedAt: now,
        consecutiveFailures: state.consecutiveFailures + 1,
        lastError: error,
      },
    });
  }

  async complete(resource: ShopifySyncResource, recordsProcessed: number) {
    const state = await this.getState(resource);
    await this.prisma.db.shopifySyncState.updateMany({
      where: { resource },
      data: {
        lastRunRecords: recordsProcessed,
        totalRecordsSynced: state.totalRecordsSynced + recordsProcessed,
      },
    });
    await this.releaseLock(resource, 'completed');
  }

  async status(credentialState: { credentialRequired: boolean; configured: boolean; shopifyDomain: string | null }) {
    await Promise.all(SHOPIFY_SYNC_RESOURCES.map((resource) => this.isRunning(resource)));
    const [states, logs, counts] = await Promise.all([
      this.getAllStates(),
      this.prisma.db.syncLog.findMany({
        where: { service: 'shopify' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.snapshotCounts(),
    ]);

    return {
      credentialRequired: credentialState.credentialRequired,
      configured: credentialState.configured,
      shopifyDomain: credentialState.shopifyDomain,
      isAnySyncing: states.some((state) => state.isLocked),
      hasErrors: states.some((state) => state.consecutiveFailures > 0 || state.status === 'failed'),
      entities: Object.fromEntries(states.map((state) => [
        state.resource,
        {
          resource: state.resource,
          status: state.status,
          isRunning: state.isLocked,
          lastCompletedAt: state.lastCompletedAt?.toISOString() ?? null,
          lastFailedAt: state.lastFailedAt?.toISOString() ?? null,
          lastError: state.lastError,
          totalRecordsSynced: state.totalRecordsSynced,
          lastRunRecords: state.lastRunRecords,
          snapshotRecords: counts[state.resource as ShopifySyncResource] ?? 0,
          consecutiveFailures: state.consecutiveFailures,
          lastCursor: state.lastCursor,
          heartbeatAt: state.heartbeatAt?.toISOString() ?? null,
        },
      ])),
      recentLogs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        status: log.status,
        message: log.message,
        startedAt: log.startedAt.toISOString(),
        finishedAt: log.finishedAt?.toISOString() ?? null,
        metadata: log.metadata,
      })),
    };
  }

  private async snapshotCounts() {
    const [customers, products, orders] = await Promise.all([
      this.prisma.db.customer.count({ where: {} }),
      this.prisma.db.catalogProduct.count({ where: {} }),
      this.prisma.db.commerceOrder.count({ where: {} }),
    ]);
    return { customers, products, orders } satisfies Record<ShopifySyncResource, number>;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}
