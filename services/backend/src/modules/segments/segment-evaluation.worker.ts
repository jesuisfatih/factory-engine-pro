import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import {
  REDIS_CONNECTION,
  SEGMENT_EVALUATION_JOB,
  SEGMENT_EVALUATION_QUEUE_NAME,
  queueName,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { SegmentsService } from './segments.service.js';

type SegmentEvaluationJobData = {
  tenantId: string;
  customerId?: string;
  customerIds?: string[];
  source?: string;
};

@Injectable()
export class SegmentEvaluationWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<SegmentEvaluationJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly segments: SegmentsService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('segments', 'evaluation_worker_disabled', 'REDIS_URL is not configured; segment evaluation worker is disabled');
      return;
    }
    this.worker = new Worker<SegmentEvaluationJobData>(
      queueName(this.config, SEGMENT_EVALUATION_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('segments', 'evaluation_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
        customer_id: job?.data?.customerId,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<SegmentEvaluationJobData>) {
    if (job.name !== SEGMENT_EVALUATION_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    if (!tenantId) throw new Error('Segment evaluation job requires tenantId');
    return this.tenantContext.run(
      { requestId: `segment-evaluation-${job.id}`, tenantId, permissions: [] },
      async () => {
        const customerIds = Array.isArray(job.data.customerIds)
          ? job.data.customerIds.filter(Boolean)
          : [];
        if (customerIds.length > 0) return this.segments.evaluateBatch(customerIds);
        const customerId = String(job.data.customerId ?? '');
        if (!customerId) throw new Error('Segment evaluation job requires customerId or customerIds');
        return this.segments.evaluateForCustomer(customerId);
      },
    );
  }
}
