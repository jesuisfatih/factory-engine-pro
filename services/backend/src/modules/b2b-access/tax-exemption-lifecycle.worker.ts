import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  REDIS_CONNECTION,
  TAX_EXEMPTION_LIFECYCLE_JOB,
  TAX_EXEMPTION_LIFECYCLE_QUEUE,
  TAX_EXEMPTION_LIFECYCLE_QUEUE_NAME,
  queueName,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { TaxExemptionLifecycleService } from './tax-exemption-lifecycle.service.js';

interface TaxExemptionLifecycleJobData {
  tenantId?: string;
}

@Injectable()
export class TaxExemptionLifecycleWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<TaxExemptionLifecycleJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    @Inject(TAX_EXEMPTION_LIFECYCLE_QUEUE) private readonly queue: Queue | null,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly lifecycle: TaxExemptionLifecycleService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (!this.connection || !this.queue) {
      this.logger.warn('b2b_access', 'tax_exemption_worker_disabled', 'REDIS_URL is not configured; tax exemption lifecycle worker is disabled');
      return;
    }
    this.worker = new Worker<TaxExemptionLifecycleJobData>(
      queueName(this.config, TAX_EXEMPTION_LIFECYCLE_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('b2b_access', 'tax_exemption_job_failed', error.message, {
        job_id: job?.id,
        tenant_id: job?.data?.tenantId,
      });
    });
    await this.ensureSchedulers();
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async ensureSchedulers() {
    const configuredTenantId = this.config.get<string>('TENANT_ID')?.trim()
      || this.config.get<string>('FACTORY_ENGINE_TENANT_ID')?.trim();
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active', ...(configuredTenantId ? { id: configuredTenantId } : {}) },
      select: { id: true },
    });
    for (const tenant of tenants) {
      await this.queue!.upsertJobScheduler(
        `tax-exemption-lifecycle:${tenant.id}:6h`,
        { pattern: '17 */6 * * *' },
        {
          name: TAX_EXEMPTION_LIFECYCLE_JOB,
          data: { tenantId: tenant.id },
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: { age: 7 * 24 * 60 * 60, count: 100 },
            removeOnFail: { age: 30 * 24 * 60 * 60, count: 300 },
          },
        },
      );
    }
  }

  private async process(job: Job<TaxExemptionLifecycleJobData>) {
    if (job.name !== TAX_EXEMPTION_LIFECYCLE_JOB) return null;
    const tenantId = String(job.data?.tenantId ?? '');
    if (!tenantId) throw new Error('Tax exemption lifecycle job requires tenantId');
    return this.tenantContext.run(
      { requestId: `tax-exemption-lifecycle-${job.id}`, tenantId, permissions: [] },
      () => this.lifecycle.sweep(),
    );
  }
}
