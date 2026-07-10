import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import {
  MAIL_MARKETING_CAMPAIGN_JOB,
  MAIL_MARKETING_CAMPAIGN_QUEUE_NAME,
  REDIS_CONNECTION,
  queueName,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailMarketingService } from './mail-marketing.service.js';

type MailMarketingCampaignJobData = {
  tenantId: string;
  campaignId: string;
  scheduledAt: string | null;
};

@Injectable()
export class MailMarketingCampaignWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<MailMarketingCampaignJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly marketing: MailMarketingService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('mail_marketing', 'campaign_worker_disabled', 'REDIS_URL is not configured; scheduled Mail Marketing campaigns are disabled');
      return;
    }
    this.worker = new Worker<MailMarketingCampaignJobData>(
      queueName(this.config, MAIL_MARKETING_CAMPAIGN_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('mail_marketing', 'campaign_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
        campaign_id: job?.data?.campaignId,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<MailMarketingCampaignJobData>) {
    if (job.name !== MAIL_MARKETING_CAMPAIGN_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    const campaignId = String(job.data?.campaignId ?? '');
    if (!tenantId || !campaignId) throw new Error('Mail Marketing campaign job requires tenantId and campaignId');
    return this.tenantContext.run(
      { requestId: `mail-campaign-${job.id}`, tenantId, permissions: [] },
      () => this.marketing.processScheduledCampaign(campaignId, job.data.scheduledAt),
    );
  }
}
