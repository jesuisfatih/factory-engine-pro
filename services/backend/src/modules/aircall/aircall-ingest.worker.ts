import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { AIRCALL_INGEST_QUEUE_NAME, REDIS_CONNECTION, queueName } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallIngestService, AIRCALL_INGEST_JOB } from './aircall-ingest.service.js';

@Injectable()
export class AircallIngestWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly ingest: AircallIngestService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('aircall', 'ingest_worker_disabled', 'REDIS_URL is not configured; Aircall ingest worker is disabled');
      return;
    }
    this.worker = new Worker(
      queueName(this.config, AIRCALL_INGEST_QUEUE_NAME),
      async (job) => {
        if (job.name !== AIRCALL_INGEST_JOB) return;
        const tenantId = String(job.data?.tenantId ?? '');
        const inboxId = String(job.data?.inboxId ?? '');
        if (!tenantId || !inboxId) throw new Error('Aircall ingest job requires tenantId and inboxId');
        return this.tenantContext.run(
          { requestId: `aircall-ingest-${job.id}`, tenantId, permissions: [] },
          () => this.ingest.processInboxRow(inboxId),
        );
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('aircall', 'ingest_job_failed', error.message, {
        job_id: job?.id,
        inbox_id: job?.data?.inboxId,
        tenant_id: job?.data?.tenantId,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
