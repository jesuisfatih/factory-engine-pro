import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import {
  REDIS_CONNECTION,
  ROLLING_BACKFILL_JOB,
  ROLLING_BACKFILL_QUEUE_NAME,
  queueName,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { RollingBackfillService, type RollingBackfillJobData } from './rolling-backfill.service.js';

@Injectable()
export class RollingBackfillWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<RollingBackfillJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly backfill: RollingBackfillService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (!this.connection) {
      this.logger.warn('backfill', 'rolling_7d_worker_disabled', 'REDIS_URL is not configured; rolling 7d backfill worker is disabled');
      return;
    }
    this.worker = new Worker<RollingBackfillJobData>(
      queueName(this.config, ROLLING_BACKFILL_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('backfill', 'rolling_7d_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
      });
    });
    await this.backfill.ensureDailySchedulers();
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<RollingBackfillJobData>) {
    if (job.name !== ROLLING_BACKFILL_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    if (!tenantId) throw new Error('Rolling backfill job requires tenantId');
    return this.tenantContext.run(
      { requestId: `rolling-7d-backfill-${job.id}`, tenantId, permissions: [] },
      () => this.backfill.process(job.data),
    );
  }
}
