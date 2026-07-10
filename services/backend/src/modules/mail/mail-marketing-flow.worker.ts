import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import {
  MAIL_MARKETING_FLOW_JOB,
  MAIL_MARKETING_FLOW_QUEUE_NAME,
  REDIS_CONNECTION,
  queueName,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailMarketingService } from './mail-marketing.service.js';

type MailMarketingFlowJobData = {
  tenantId: string;
  enrollmentId: string;
  nodeKey: string;
};

@Injectable()
export class MailMarketingFlowWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<MailMarketingFlowJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly marketing: MailMarketingService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('mail_marketing', 'flow_worker_disabled', 'REDIS_URL is not configured; Mail Marketing flow worker is disabled');
      return;
    }
    this.worker = new Worker<MailMarketingFlowJobData>(
      queueName(this.config, MAIL_MARKETING_FLOW_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('mail_marketing', 'flow_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
        enrollment_id: job?.data?.enrollmentId,
        node_key: job?.data?.nodeKey,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<MailMarketingFlowJobData>) {
    if (job.name !== MAIL_MARKETING_FLOW_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    const enrollmentId = String(job.data?.enrollmentId ?? '');
    const nodeKey = String(job.data?.nodeKey ?? '');
    if (!tenantId || !enrollmentId || !nodeKey) throw new Error('Mail Marketing flow job requires tenantId, enrollmentId, and nodeKey');
    return this.tenantContext.run(
      { requestId: `mail-flow-${job.id}`, tenantId, permissions: [] },
      () => this.marketing.processFlowEnrollmentNode(enrollmentId, nodeKey),
    );
  }
}
