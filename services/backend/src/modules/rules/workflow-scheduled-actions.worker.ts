import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  REDIS_CONNECTION,
  WORKFLOW_SCHEDULED_ACTION_JOB,
  WORKFLOW_SCHEDULED_ACTION_QUEUE,
  WORKFLOW_SCHEDULED_ACTION_QUEUE_NAME,
} from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { RulesService } from './rules.service.js';

interface WorkflowScheduledActionJobData {
  tenantId?: string;
  source?: 'scheduled';
}

@Injectable()
export class WorkflowScheduledActionsWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<WorkflowScheduledActionJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    @Inject(WORKFLOW_SCHEDULED_ACTION_QUEUE) private readonly queue: Queue | null,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly rules: RulesService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    if (!this.connection || !this.queue) {
      this.logger.warn('rules', 'workflow_scheduled_actions_worker_disabled', 'REDIS_URL is not configured; workflow scheduled action worker is disabled');
      return;
    }

    this.worker = new Worker<WorkflowScheduledActionJobData>(
      WORKFLOW_SCHEDULED_ACTION_QUEUE_NAME,
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('rules', 'workflow_scheduled_actions_job_failed', error.message, {
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
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    const scheduled = [];
    for (const tenant of tenants) {
      const schedulerId = `workflow-scheduled-actions:${tenant.id}:1m`;
      const job = await this.queue!.upsertJobScheduler(
        schedulerId,
        { pattern: '* * * * *' },
        {
          name: WORKFLOW_SCHEDULED_ACTION_JOB,
          data: { tenantId: tenant.id, source: 'scheduled' } satisfies WorkflowScheduledActionJobData,
          opts: {
            attempts: 1,
            removeOnComplete: { age: 24 * 60 * 60, count: 200 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
          },
        },
      );
      scheduled.push({ tenantId: tenant.id, slug: tenant.slug, schedulerId, nextJobId: String(job.id) });
    }
    this.logger.log('rules', 'workflow_scheduled_actions_schedulers_ready', 'Workflow scheduled action schedulers are ready', {
      scheduler_count: scheduled.length,
    });
    return scheduled;
  }

  private async process(job: Job<WorkflowScheduledActionJobData>) {
    if (job.name !== WORKFLOW_SCHEDULED_ACTION_JOB) return null;
    const tenantId = String(job.data?.tenantId ?? '');
    if (!tenantId) throw new Error('Workflow scheduled action job requires tenantId');
    return this.tenantContext.run(
      { requestId: `workflow-scheduled-actions-${job.id}`, tenantId, permissions: [] },
      () => this.rules.processDueScheduledActions(),
    );
  }
}
