import { HttpException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION, type TranscriptResolverOutput } from '@factory-engine-pro/contracts';
import type { Prisma } from '@prisma/client';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import {
  AI_TRANSCRIPT_RESOLVER_JOB,
  AI_TRANSCRIPT_RESOLVER_QUEUE_NAME,
  REDIS_CONNECTION,
} from '../../shared/queue.module.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { RulesService } from '../rules/rules.service.js';
import { AiService } from './ai.service.js';

type ResolverJobData = {
  tenantId?: string;
  callEventId?: string;
  externalCallId?: string;
  forceReprocess?: boolean;
  targetVersion?: number;
};

@Injectable()
export class AiTranscriptResolverWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<ResolverJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions | null,
    private readonly ai: AiService,
    private readonly rules: RulesService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('ai', 'transcript_resolver_worker_disabled', 'REDIS_URL is not configured; transcript resolver worker is disabled');
      return;
    }
    this.worker = new Worker<ResolverJobData>(
      AI_TRANSCRIPT_RESOLVER_QUEUE_NAME,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error('ai', 'transcript_resolver_job_failed', error.message, {
        job_id: job?.id,
        call_event_id: job?.data?.callEventId,
        tenant_id: job?.data?.tenantId,
        target_version: job?.data?.targetVersion,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<ResolverJobData>) {
    if (job.name !== AI_TRANSCRIPT_RESOLVER_JOB) return;
    const tenantId = String(job.data?.tenantId ?? '');
    const callEventId = String(job.data?.callEventId ?? '');
    if (!tenantId || !callEventId) throw new Error('AI transcript resolver job requires tenantId and callEventId');

    return this.tenantContext.run(
      { requestId: `ai-transcript-resolver-${job.id}`, tenantId, permissions: [] },
      () => this.resolveCallEvent(job, callEventId),
    );
  }

  private async resolveCallEvent(job: Job<ResolverJobData>, callEventId: string) {
    const callEvent = await this.prisma.db.aircallCallEvent.findFirst({
      where: { id: callEventId },
      select: {
        id: true,
        externalCallId: true,
        eventType: true,
        eventTimestamp: true,
        direction: true,
        durationSeconds: true,
        aircallUserId: true,
        contactPhone: true,
        contactPhoneE164: true,
        contactEmail: true,
        transcriptRaw: true,
        transcriptSource: true,
        transcriptPulledAt: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
    });
    if (!callEvent) throw new Error(`Aircall call event was not found for resolver job: ${callEventId}`);
    const targetVersion = normalizeTargetVersion(job.data?.targetVersion);
    if (!job.data?.forceReprocess && callEvent.resolvedAt) {
      return { status: 'skipped_already_resolved', resolvedWithVersion: callEvent.resolvedWithVersion };
    }

    const transcript = callEvent.transcriptRaw?.trim();
    if (!transcript) {
      await this.prisma.db.aircallCallEvent.updateMany({
        where: { id: callEventId },
        data: {
          resolverStatus: 'skipped',
          resolverError: 'Transcript is empty; resolver was not run.',
          resolverStartedAt: new Date(),
        },
      });
      return { status: 'skipped' };
    }

    await this.prisma.db.aircallCallEvent.updateMany({
      where: { id: callEventId },
      data: {
        resolverStatus: 'processing',
        resolverStartedAt: new Date(),
        resolverError: null,
      },
    });

    try {
      const clipped = clipTranscript(transcript);
      const result = await this.ai.resolveTranscript({
        transcript: clipped.transcript,
        metadata: {
          aircallCallEventId: callEvent.id,
          externalCallId: callEvent.externalCallId,
          eventType: callEvent.eventType,
          eventTimestamp: callEvent.eventTimestamp.toISOString(),
          direction: callEvent.direction,
          durationSeconds: callEvent.durationSeconds,
          aircallUserId: callEvent.aircallUserId,
          contactPhone: callEvent.contactPhone,
          contactPhoneE164: callEvent.contactPhoneE164,
          contactEmail: callEvent.contactEmail,
          transcriptSource: callEvent.transcriptSource,
          transcriptPulledAt: callEvent.transcriptPulledAt?.toISOString() ?? null,
          transcriptTruncated: clipped.truncated,
          queueJobId: job.id,
        },
      });

      await this.prisma.db.aircallCallEvent.updateMany({
        where: { id: callEventId },
        data: {
          resolverStatus: 'succeeded',
          resolverOutput: result.output as Prisma.InputJsonValue,
          resolverError: null,
          resolverModel: result.model,
          resolverPromptKey: result.promptKey,
          resolverLatencyMs: result.latencyMs,
          resolvedAt: new Date(),
          resolvedWithVersion: result.output.resolved_with_version,
        },
      });
      this.logger.log('ai', 'transcript_resolved', 'Aircall transcript resolved into structured output', {
        call_event_id: callEventId,
        external_call_id: callEvent.externalCallId,
        model: result.model,
        resolved_with_version: result.output.resolved_with_version,
        target_version: targetVersion,
        force_reprocess: Boolean(job.data?.forceReprocess),
        latency_ms: result.latencyMs,
      });
      await this.fireDerivedWorkflowTriggers(callEvent, result.output);
      return { status: 'succeeded', resolvedWithVersion: result.output.resolved_with_version };
    } catch (error) {
      const message = messageOf(error).slice(0, 500);
      const code = httpErrorCode(error);
      await this.prisma.db.aircallCallEvent.updateMany({
        where: { id: callEventId },
        data: {
          resolverStatus: 'failed',
          resolverError: code ? `${code}: ${message}` : message,
        },
      });
      this.logger.error('ai', 'transcript_resolve_failed', 'Aircall transcript resolver failed', {
        call_event_id: callEventId,
        external_call_id: callEvent.externalCallId,
        error_code: code,
        error: message,
      });
      if (code === 'anthropic_resolver_network_error' || code === 'anthropic_resolver_timeout') {
        throw error;
      }
      return { status: 'failed', error: message };
    }
  }

  private async fireDerivedWorkflowTriggers(
    callEvent: { id: string; externalCallId: string; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
  ) {
    const baseParams = {
      callEventId: callEvent.id,
      externalCallId: callEvent.externalCallId,
      contactPhoneE164: callEvent.contactPhoneE164 ?? null,
      contactEmail: callEvent.contactEmail ?? null,
    };
    try {
      await this.rules.fireTrigger({
        trigger: 'call_intent.classified',
        eventId: `${callEvent.id}:call_intent:${output.call_intent}`,
        source: 'ai-transcript-resolver',
        params: { ...baseParams, intent: output.call_intent },
      });
      for (const tag of output.psych_tags) {
        await this.rules.fireTrigger({
          trigger: 'psych.tag.detected',
          eventId: `${callEvent.id}:psych_tag:${tag}`,
          source: 'ai-transcript-resolver',
          params: { ...baseParams, tag },
        });
      }
      for (const mention of output.product_mentions) {
        await this.rules.fireTrigger({
          trigger: 'product.detected_in_transcript',
          eventId: `${callEvent.id}:product:${mention.sku ?? mention.name_hint ?? 'unknown'}`,
          source: 'ai-transcript-resolver',
          params: { ...baseParams, sku: mention.sku, nameHint: mention.name_hint, confidence: mention.confidence },
        });
      }
      if (output.customer_match.customer_id) {
        await this.rules.fireTrigger({
          trigger: 'customer.matched_from_transcript',
          eventId: `${callEvent.id}:customer:${output.customer_match.customer_id}`,
          source: 'ai-transcript-resolver',
          params: { ...baseParams, customerId: output.customer_match.customer_id, confidence: output.customer_match.confidence },
        });
      }
      await this.rules.fireTrigger({
        trigger: 'psych.analysis.completed',
        eventId: `${callEvent.id}:psych_analysis_completed:${output.resolved_with_version}`,
        source: 'ai-transcript-resolver',
        params: {
          ...baseParams,
          psychTags: output.psych_tags,
          callIntent: output.call_intent,
          urgencySignal: output.urgency_signal,
          resolvedWithVersion: output.resolved_with_version,
        },
      });
    } catch (error) {
      this.logger.warn('rules', 'ai_derived_trigger_fire_failed', 'AI-derived workflow triggers could not be evaluated', {
        call_event_id: callEvent.id,
        external_call_id: callEvent.externalCallId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function clipTranscript(transcript: string) {
  const maxLength = 12_000;
  return transcript.length > maxLength
    ? { transcript: transcript.slice(0, maxLength), truncated: true }
    : { transcript, truncated: false };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function httpErrorCode(error: unknown) {
  if (!(error instanceof HttpException)) return null;
  const response = error.getResponse();
  if (response && typeof response === 'object' && 'code' in response) {
    const code = (response as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function normalizeTargetVersion(value: unknown) {
  const parsed = Number(value ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
}
