import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import {
  REDIS_CONNECTION,
  SHOPIFY_ABANDONED_CHECKOUT_JOB,
  SHOPIFY_ABANDONED_CHECKOUT_QUEUE,
  SHOPIFY_ABANDONED_CHECKOUT_QUEUE_NAME,
  queueName,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { ShopifyAbandonedCheckoutService, type ShopifyAbandonedCheckoutJobData } from './shopify-abandoned-checkout.service.js';

@Injectable()
export class ShopifyAbandonedCheckoutWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<ShopifyAbandonedCheckoutJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    @Inject(SHOPIFY_ABANDONED_CHECKOUT_QUEUE) private readonly queue: Queue | null,
    private readonly sync: ShopifyAbandonedCheckoutService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (!this.connection || !this.queue) {
      this.logger.warn('shopify', 'abandoned_checkout_worker_disabled', 'Shopify abandoned checkout worker is disabled because REDIS_URL is not configured');
      return;
    }
    this.worker = new Worker<ShopifyAbandonedCheckoutJobData>(
      queueName(this.config, SHOPIFY_ABANDONED_CHECKOUT_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('shopify', 'abandoned_checkout_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
      });
    });
    const tenants = await this.sync.eligibleTenants();
    for (const tenant of tenants) {
      await this.queue.upsertJobScheduler(
        `abandoned-checkouts:${tenant.id}:incremental`,
        { pattern: '*/5 * * * *' },
        { name: SHOPIFY_ABANDONED_CHECKOUT_JOB, data: { tenantId: tenant.id, full: false } },
      );
      await this.queue.upsertJobScheduler(
        `abandoned-checkouts:${tenant.id}:daily-full`,
        { pattern: '20 3 * * *' },
        { name: SHOPIFY_ABANDONED_CHECKOUT_JOB, data: { tenantId: tenant.id, full: true } },
      );
      await this.queue.add(SHOPIFY_ABANDONED_CHECKOUT_JOB, { tenantId: tenant.id, full: false }, {
        jobId: `abandoned-checkouts-bootstrap-${tenant.id}-${Date.now()}`,
        removeOnComplete: { age: 24 * 60 * 60, count: 20 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 20 },
      });
    }
    this.logger.log('shopify', 'abandoned_checkout_schedulers_ready', 'Shopify abandoned checkout schedulers are ready', {
      tenant_count: tenants.length,
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<ShopifyAbandonedCheckoutJobData>) {
    if (job.name !== SHOPIFY_ABANDONED_CHECKOUT_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    if (!tenantId) throw new Error('Shopify abandoned checkout sync requires tenantId');
    return this.tenantContext.run(
      { requestId: `shopify-abandoned-checkout-${job.id}`, tenantId, permissions: [] },
      () => this.sync.sync(job.data),
    );
  }
}
