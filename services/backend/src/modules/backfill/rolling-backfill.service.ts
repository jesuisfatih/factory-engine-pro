import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  rollingBackfillTriggerSchema,
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  type RollingBackfillRunResponse,
  type RollingBackfillSource,
  type RollingBackfillStatus,
  type RollingBackfillStatusResponse,
  type RollingBackfillStepDto,
  type RollingBackfillTriggerInput,
  type ShopifySyncResource,
} from '@factory-engine-pro/contracts';
import { Queue } from 'bullmq';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { ROLLING_BACKFILL_JOB, ROLLING_BACKFILL_QUEUE } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallService } from '../aircall/aircall.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { SegmentsService } from '../segments/segments.service.js';
import { SyncService } from '../sync/sync.service.js';

export interface RollingBackfillJobData {
  tenantId: string;
  syncLogId?: string | null;
  source: RollingBackfillSource;
  input: RollingBackfillTriggerInput;
}

@Injectable()
export class RollingBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly segments: SegmentsService,
    private readonly aircall: AircallService,
    private readonly customers: CustomersService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    @Inject(ROLLING_BACKFILL_QUEUE) private readonly queue: Queue | null,
  ) {}

  async trigger(input: Partial<RollingBackfillTriggerInput> = {}, source: RollingBackfillSource = 'manual'): Promise<RollingBackfillRunResponse> {
    const parsed = this.normalizeInput(input);
    const tenantId = this.tenantId();
    const running = await this.findRecentActiveRun();
    if (running) {
      return this.presentRun(running, true, 'Rolling 7d backfill is already queued or running.');
    }

    const log = await this.prisma.db.syncLog.create({
      data: {
        id: prefixedId('slog'),
        tenantId,
        service: 'backfill',
        action: 'rolling_7d',
        status: 'queued',
        message: 'Rolling 7d backfill queued.',
        metadata: this.metadata({ source, recentDays: parsed.recentDays, input: parsed, steps: [] }),
      },
    });
    const data: RollingBackfillJobData = { tenantId, syncLogId: log.id, source, input: parsed };

    if (!this.queue) {
      return this.process(data);
    }

    const job = await this.queue.add(ROLLING_BACKFILL_JOB, data, {
      jobId: `rolling-7d:${tenantId}:${log.id}`,
      attempts: 1,
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 14 * 24 * 60 * 60, count: 100 },
    });
    await this.prisma.db.syncLog.updateMany({
      where: { id: log.id },
      data: {
        metadata: this.metadata({ source, recentDays: parsed.recentDays, input: parsed, jobId: String(job.id), steps: [] }),
      },
    });

    return {
      syncLogId: log.id,
      jobId: String(job.id),
      queued: true,
      status: 'queued',
      message: 'Rolling 7d backfill queued.',
      source,
      recentDays: parsed.recentDays,
      startedAt: log.startedAt.toISOString(),
      finishedAt: null,
      steps: [],
    };
  }

  async status(): Promise<RollingBackfillStatusResponse> {
    const [logs, schedulers] = await Promise.all([
      this.prisma.db.syncLog.findMany({
        where: { service: 'backfill', action: 'rolling_7d' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.schedulers(),
    ]);
    return {
      queueConfigured: Boolean(this.queue),
      schedulerCount: schedulers.length,
      schedulers,
      recentRuns: logs.map((log) => this.presentRun(log, log.status === 'queued' || log.status === 'running')),
    };
  }

  async ensureDailySchedulers() {
    if (!this.queue) return [];
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    const input = this.normalizeInput({});
    const scheduled = [];
    for (const tenant of tenants) {
      const schedulerId = `rolling-7d:${tenant.id}:daily`;
      const job = await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 3 * * *' },
        {
          name: ROLLING_BACKFILL_JOB,
          data: { tenantId: tenant.id, source: 'scheduled', input } satisfies RollingBackfillJobData,
          opts: {
            attempts: 1,
            removeOnComplete: { age: 7 * 24 * 60 * 60, count: 100 },
            removeOnFail: { age: 14 * 24 * 60 * 60, count: 100 },
          },
        },
      );
      scheduled.push({ tenantId: tenant.id, slug: tenant.slug, schedulerId, nextJobId: String(job.id) });
    }
    this.logger.log('backfill', 'rolling_7d_schedulers_ready', 'Rolling 7d backfill schedulers are ready', {
      scheduler_count: scheduled.length,
    });
    return scheduled;
  }

  async process(job: RollingBackfillJobData): Promise<RollingBackfillRunResponse> {
    const input = this.normalizeInput(job.input);
    const syncLogId = job.syncLogId ?? await this.createRunLog(job.source, input);
    const startedAt = new Date();
    await this.prisma.db.syncLog.updateMany({
      where: { id: syncLogId },
      data: {
        status: 'running',
        message: 'Rolling 7d backfill is running.',
        startedAt,
        finishedAt: null,
        metadata: this.metadata({ source: job.source, recentDays: input.recentDays, input, jobId: syncLogId, steps: [] }),
      },
    });

    const since = new Date(Date.now() - input.recentDays * 86_400_000);
    const steps: RollingBackfillStepDto[] = [];
    steps.push(await this.captureStep('shopify_sync', async () => {
      try {
        const result = await this.sync.triggerRollingSync({
          resources: input.shopifyResources as ShopifySyncResource[],
          since,
        });
        return success(`Queued Shopify ${input.recentDays}d delta sync for ${result.resources.join(', ')}.`, result);
      } catch (error) {
        if (exceptionCode(error) === 'shopify_sync_already_running') {
          return skipped(messageOf(error), { code: 'shopify_sync_already_running' });
        }
        throw error;
      }
    }));
    steps.push(await this.captureStep('shopify_segments', async () => {
      const result = await this.segments.syncShopifySegments({ limit: input.shopifySegmentLimit, force: false });
      return success(`Synced ${result.scanned} Shopify-native segment(s).`, result);
    }));
    steps.push(await this.captureStep('segment_evaluation', async () => {
      const result = await this.segments.evaluateAll();
      return success(`Evaluated ${result.evaluated} canonical segment(s).`, result);
    }));
    steps.push(await this.captureStep('aircall_recent_calls', async () => {
      const result = await this.aircall.backfillRecentCalls({ recentDays: input.recentDays, maxPages: input.aircallMaxPages });
      return success(`Backfilled ${result.ingested}/${result.fetched} Aircall call(s) from the last ${input.recentDays} day(s).`, result);
    }));
    steps.push(await this.captureStep('aircall_resolver', async () => {
      const result = await this.aircall.reprocessResolver({
        targetVersion: input.targetResolverVersion ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
        limit: input.resolverLimit,
        recentDays: input.recentDays,
      });
      return success(`Queued ${result.queued}/${result.scanned} transcript resolver job(s).`, result);
    }));
    steps.push(await this.captureStep('customer_axis', async () => {
      const result = await this.customers.assignDefaultAxis({
        axes: ['sales', 'support', 'account'],
        limit: 10000,
        onlyMissing: true,
        source: 'rolling_7d_backfill',
        reason: 'Rolling 7 day customer axis delta.',
      });
      return success(`Wrote ${result.assigned} customer axis assignment(s).`, result);
    }));

    const status = finalStatus(steps);
    const message = status === 'success'
      ? 'Rolling 7d backfill completed.'
      : status === 'partial_success'
        ? 'Rolling 7d backfill completed with failed step(s).'
        : 'Rolling 7d backfill failed.';
    const finishedAt = new Date();
    await this.prisma.db.syncLog.updateMany({
      where: { id: syncLogId },
      data: {
        status,
        message,
        finishedAt,
        metadata: this.metadata({ source: job.source, recentDays: input.recentDays, input, jobId: syncLogId, steps }),
      },
    });
    this.logger[status === 'failed' ? 'error' : status === 'partial_success' ? 'warn' : 'log'](
      'backfill',
      'rolling_7d_completed',
      message,
      { status, step_count: steps.length, failed_steps: steps.filter((step) => step.status === 'failed').map((step) => step.key) },
    );

    return {
      syncLogId,
      jobId: syncLogId,
      queued: false,
      status,
      message,
      source: job.source,
      recentDays: input.recentDays,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      steps,
    };
  }

  private async captureStep(
    key: RollingBackfillStepDto['key'],
    action: () => Promise<Omit<RollingBackfillStepDto, 'key'>>,
  ): Promise<RollingBackfillStepDto> {
    try {
      const result = await action();
      return { key, ...result };
    } catch (error) {
      const message = messageOf(error);
      this.logger.warn('backfill', `${key}_failed`, 'Rolling 7d backfill step failed', {
        step: key,
        error: message,
      });
      return { key, status: 'failed', message, detail: { error: message, code: exceptionCode(error) } };
    }
  }

  private async findRecentActiveRun() {
    const activeSince = new Date(Date.now() - 6 * 60 * 60 * 1000);
    return this.prisma.db.syncLog.findFirst({
      where: {
        service: 'backfill',
        action: 'rolling_7d',
        status: { in: ['queued', 'running'] },
        startedAt: { gte: activeSince },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async createRunLog(source: RollingBackfillSource, input: RollingBackfillTriggerInput) {
    const log = await this.prisma.db.syncLog.create({
      data: {
        id: prefixedId('slog'),
        tenantId: this.tenantId(),
        service: 'backfill',
        action: 'rolling_7d',
        status: 'running',
        message: 'Rolling 7d backfill is running.',
        metadata: this.metadata({ source, recentDays: input.recentDays, input, steps: [] }),
      },
      select: { id: true },
    });
    return log.id;
  }

  private async schedulers() {
    if (!this.queue) return [];
    const schedulers = await this.queue.getJobSchedulers(0, 100, false);
    return schedulers
      .filter((scheduler) => scheduler.name === ROLLING_BACKFILL_JOB)
      .map((scheduler) => ({
        id: scheduler.id ?? scheduler.key,
        name: scheduler.name,
        pattern: scheduler.pattern ?? null,
        nextRunAt: scheduler.next ? new Date(scheduler.next).toISOString() : null,
      }));
  }

  private presentRun(log: {
    id: string;
    status: string;
    message: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    metadata: Prisma.JsonValue;
  }, queued: boolean, overrideMessage?: string): RollingBackfillRunResponse {
    const metadata = objectMetadata(log.metadata);
    const source = metadata.source === 'scheduled' ? 'scheduled' : 'manual';
    const recentDays = Number(metadata.recentDays ?? 7);
    const steps = Array.isArray(metadata.steps) ? metadata.steps as RollingBackfillStepDto[] : [];
    return {
      syncLogId: log.id,
      jobId: typeof metadata.jobId === 'string' ? metadata.jobId : null,
      queued,
      status: toRunStatus(log.status),
      message: overrideMessage ?? log.message ?? 'Rolling 7d backfill run.',
      source,
      recentDays: Number.isFinite(recentDays) ? recentDays : 7,
      startedAt: log.startedAt.toISOString(),
      finishedAt: log.finishedAt?.toISOString() ?? null,
      steps,
    };
  }

  private normalizeInput(input: Partial<RollingBackfillTriggerInput>): RollingBackfillTriggerInput {
    return rollingBackfillTriggerSchema.parse(input ?? {});
  }

  private metadata(input: {
    source: RollingBackfillSource;
    recentDays: number;
    input: RollingBackfillTriggerInput;
    jobId?: string | null;
    steps: RollingBackfillStepDto[];
  }) {
    return jsonValue({
      source: input.source,
      recentDays: input.recentDays,
      input: input.input,
      jobId: input.jobId ?? null,
      steps: input.steps,
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}

function success(message: string, detail: unknown): Omit<RollingBackfillStepDto, 'key'> {
  return { status: 'success', message, detail: jsonValue(detail) };
}

function skipped(message: string, detail: unknown): Omit<RollingBackfillStepDto, 'key'> {
  return { status: 'skipped', message, detail: jsonValue(detail) };
}

function finalStatus(steps: RollingBackfillStepDto[]): RollingBackfillStatus {
  const failed = steps.filter((step) => step.status === 'failed').length;
  if (failed === 0) return 'success';
  if (failed === steps.length) return 'failed';
  return 'partial_success';
}

function toRunStatus(status: string): RollingBackfillStatus {
  if (['queued', 'running', 'success', 'partial_success', 'failed', 'skipped'].includes(status)) {
    return status as RollingBackfillStatus;
  }
  return 'failed';
}

function objectMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) return {};
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

function exceptionCode(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const maybeHttp = error as { getResponse?: () => unknown };
  const response = typeof maybeHttp.getResponse === 'function' ? maybeHttp.getResponse() : null;
  if (response && typeof response === 'object' && 'code' in response) {
    return String((response as { code?: unknown }).code ?? '');
  }
  return null;
}
