import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  AIRCALL_ROLLING_SYNC_JOB,
  AIRCALL_ROLLING_SYNC_QUEUE,
  AIRCALL_ROLLING_SYNC_QUEUE_NAME,
  REDIS_CONNECTION,
  queueName,
} from '../../shared/queue.module.js';
import { RealtimeService } from '../../shared/realtime.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallService } from './aircall.service.js';

interface AircallRollingSyncJobData {
  tenantId?: string;
  source?: 'scheduled';
}

@Injectable()
export class AircallRollingSyncWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<AircallRollingSyncJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    @Inject(AIRCALL_ROLLING_SYNC_QUEUE) private readonly queue: Queue | null,
    private readonly aircall: AircallService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly realtime: RealtimeService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (!this.connection || !this.queue) {
      this.logger.warn('aircall', 'rolling_sync_worker_disabled', 'REDIS_URL is not configured; Aircall rolling sync worker is disabled');
      return;
    }
    this.worker = new Worker<AircallRollingSyncJobData>(
      queueName(this.config, AIRCALL_ROLLING_SYNC_QUEUE_NAME),
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('aircall', 'rolling_sync_job_failed', error.message, {
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
    if (!this.queue) return [];
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    const scheduled = [];
    for (const tenant of tenants) {
      const schedulerId = `aircall-rolling-sync:${tenant.id}:10m`;
      const job = await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: '*/10 * * * *' },
        {
          name: AIRCALL_ROLLING_SYNC_JOB,
          data: { tenantId: tenant.id, source: 'scheduled' } satisfies AircallRollingSyncJobData,
          opts: {
            attempts: 1,
            removeOnComplete: { age: 24 * 60 * 60, count: 200 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
          },
        },
      );
      scheduled.push({ tenantId: tenant.id, slug: tenant.slug, schedulerId, nextJobId: String(job.id) });
    }
    this.logger.log('aircall', 'rolling_sync_schedulers_ready', 'Aircall rolling sync schedulers are ready', {
      scheduler_count: scheduled.length,
    });
    return scheduled;
  }

  private async process(job: Job<AircallRollingSyncJobData>) {
    if (job.name !== AIRCALL_ROLLING_SYNC_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    if (!tenantId) throw new Error('Aircall rolling sync job requires tenantId');
    return this.tenantContext.run(
      { requestId: `aircall-rolling-sync-${job.id}`, tenantId, permissions: [] },
      () => this.syncTenant(tenantId),
    );
  }

  private async syncTenant(tenantId: string) {
    const recentDays = positiveInt(this.config.get<string>('AIRCALL_ROLLING_SYNC_RECENT_DAYS'), 7);
    const maxPages = positiveInt(this.config.get<string>('AIRCALL_ROLLING_SYNC_MAX_PAGES'), 5);

    const backfill = await this.aircall.backfillRecentCalls({ recentDays, maxPages });

    this.realtime.emitTenantInvalidate(tenantId, {
      module: 'call_center',
      reason: 'aircall.rolling_sync',
      at: new Date().toISOString(),
    });
    this.logger.log('aircall', 'rolling_sync_completed', 'Aircall rolling sync completed', {
      tenant_id: tenantId,
      recent_days: recentDays,
      fetched: backfill.fetched,
      ingested: backfill.ingested,
      new_transcript_resolver_queued: backfill.resolverQueued,
    });
    return {
      recentDays,
      maxPages,
      backfill,
    };
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
