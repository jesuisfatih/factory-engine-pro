import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { REDIS_CONNECTION, SHOPIFY_SYNC_QUEUE_NAME, queueName } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { SHOPIFY_INITIAL_SYNC_JOB } from './shopify-sync.constants.js';
import { SyncService } from './sync.service.js';

@Injectable()
export class ShopifySyncWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly sync: SyncService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('shopify', 'sync_worker_disabled', 'REDIS_URL is not configured; Shopify sync worker is disabled');
      return;
    }
    this.worker = new Worker(
      queueName(this.config, SHOPIFY_SYNC_QUEUE_NAME),
      async (job) => {
        if (job.name !== SHOPIFY_INITIAL_SYNC_JOB) return;
        const tenantId = String(job.data?.tenantId ?? '');
        if (!tenantId) throw new Error('Shopify sync job requires tenantId');
        return this.tenantContext.run(
          { requestId: `shopify-sync-${job.id}`, tenantId, permissions: [] },
          () => this.sync.processInitialSync(job.data),
        );
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('shopify', 'sync_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
