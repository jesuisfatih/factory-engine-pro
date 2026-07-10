import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { MAIL_OUTBOUND_QUEUE_NAME, REDIS_CONNECTION, queueName } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService, MAIL_OUTBOUND_JOB } from './mail.service.js';

@Injectable()
export class MailOutboundWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly mail: MailService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('mail', 'worker_disabled', 'REDIS_URL is not configured; mail worker is disabled');
      return;
    }
    this.worker = new Worker(
      queueName(this.config, MAIL_OUTBOUND_QUEUE_NAME),
      async (job) => {
        if (job.name !== MAIL_OUTBOUND_JOB) return;
        const tenantId = String(job.data?.tenantId ?? '');
        const deliveryId = String(job.data?.deliveryId ?? '');
        if (!tenantId || !deliveryId) throw new Error('Mail job requires tenantId and deliveryId');
        return this.tenantContext.run(
          { requestId: `mail-${job.id}`, tenantId, permissions: [] },
          () => this.mail.deliverQueued(deliveryId),
        );
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('mail', 'job_failed', error.message, { job_id: job?.id, delivery_id: job?.data?.deliveryId });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
