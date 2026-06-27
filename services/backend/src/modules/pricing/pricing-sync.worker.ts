import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type ConnectionOptions } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { REDIS_CONNECTION } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { PricingService } from './pricing.service.js';
import { PRICING_RULE_SYNC_JOB } from './pricing-sync.constants.js';

@Injectable()
export class PricingSyncWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly pricing: PricingService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('pricing', 'sync_worker_disabled', 'REDIS_URL is not configured; pricing sync worker is disabled');
      return;
    }
    this.worker = new Worker(
      'pricing-rule-sync',
      async (job) => {
        if (job.name !== PRICING_RULE_SYNC_JOB) return;
        const tenantId = String(job.data?.tenantId ?? '');
        const ruleId = String(job.data?.ruleId ?? '');
        if (!tenantId || !ruleId) throw new Error('Pricing sync job requires tenantId and ruleId');
        return this.tenantContext.run(
          {
            requestId: `pricing-sync-${job.id}`,
            tenantId,
            permissions: [],
          },
          () => this.pricing.processSyncJob(ruleId),
        );
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('pricing', 'sync_job_failed', error.message, { job_id: job?.id, rule_id: job?.data?.ruleId });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
