import { HttpException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  transcriptOperationalSignalSchema,
  transcriptResolverOutputSchema,
  type TranscriptOperationalSignal,
  type TranscriptResolverOutput,
  type WorkflowTriggerFireResponse,
} from '@factory-engine-pro/contracts';
import type { Prisma } from '@prisma/client';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { prefixedId } from '../../shared/id.js';
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
        tenantId: true,
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
        resolverOutput: true,
        resolverModel: true,
        resolverStatus: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
    });
    if (!callEvent) throw new Error(`Aircall call event was not found for resolver job: ${callEventId}`);
    const targetVersion = normalizeTargetVersion(job.data?.targetVersion);
    if (!job.data?.forceReprocess && callEvent.resolvedAt && (callEvent.resolvedWithVersion ?? 0) >= targetVersion) {
      const evaluationCount = await this.prisma.db.transcriptWorkflowEvaluation.count({
        where: { tenantId: callEvent.tenantId, callEventId: callEvent.id },
      });
      if (evaluationCount > 0) {
        return { status: 'skipped_already_resolved', resolvedWithVersion: callEvent.resolvedWithVersion, evaluationCount };
      }

      const storedOutput = transcriptResolverOutputSchema.safeParse(callEvent.resolverOutput);
      if (storedOutput.success) {
        await this.fireDerivedWorkflowTriggers(callEvent, storedOutput.data, callEvent.resolverModel ?? 'stored-resolver-output');
        const repairedEvaluationCount = await this.prisma.db.transcriptWorkflowEvaluation.count({
          where: { tenantId: callEvent.tenantId, callEventId: callEvent.id },
        });
        this.logger.log('ai', 'transcript_workflow_evaluation_repaired', 'Resolved transcript was replayed through workflow flow because evaluations were missing', {
          call_event_id: callEvent.id,
          external_call_id: callEvent.externalCallId,
          resolved_with_version: callEvent.resolvedWithVersion,
          evaluations_created_or_updated: repairedEvaluationCount,
        });
        return {
          status: 'repaired_missing_workflow_evaluations',
          resolvedWithVersion: callEvent.resolvedWithVersion,
          evaluationCount: repairedEvaluationCount,
        };
      }

      this.logger.warn('ai', 'resolved_transcript_output_missing', 'Resolved transcript had no valid resolver output; resolver will run again to produce workflow evaluations', {
        call_event_id: callEvent.id,
        external_call_id: callEvent.externalCallId,
        resolver_status: callEvent.resolverStatus,
        resolved_with_version: callEvent.resolvedWithVersion,
      });
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
      await this.fireDerivedWorkflowTriggers(callEvent, result.output, result.model);
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
    resolverModel: string,
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
    await this.fireOperationalSignalFlow(callEvent, output, baseParams, resolverModel);
  }

  private async fireOperationalSignalFlow(
    callEvent: { id: string; externalCallId: string; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
    baseParams: Record<string, unknown>,
    resolverModel: string,
  ) {
    const signals = transcriptOperationalSignals(output);
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for transcript workflow evaluation');
    for (const signal of signals) {
      const eventId = `${callEvent.id}:operational_signal:${signal.intent}`;
      let response: WorkflowTriggerFireResponse | null = null;
      let status = 'failed';
      let reason = signal.reason;
      try {
        response = await this.rules.fireTrigger({
          trigger: 'call.operational_signal.detected',
          eventId,
          source: 'transcript-operational-signal',
          params: {
            ...baseParams,
            operationalIntent: signal.intent,
            operationalConfidence: signal.confidence,
            actionRequired: signal.action_required,
            recommendedAxis: signal.recommended_axis,
            suggestedTaskTitle: signal.suggested_task_title,
            reason: signal.reason,
            callIntent: output.call_intent,
            psychTags: output.psych_tags,
            urgencySignal: output.urgency_signal,
          },
        });
        status = transcriptEvaluationStatus(signal, response);
        reason = transcriptEvaluationReason(signal, response);
      } catch (error) {
        reason = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
        this.logger.warn('rules', 'transcript_operational_signal_failed', 'Transcript operational signal could not be evaluated', {
          call_event_id: callEvent.id,
          external_call_id: callEvent.externalCallId,
          signal: signal.intent,
          error: reason,
        });
      }

      await this.prisma.db.transcriptWorkflowEvaluation.upsert({
        where: {
          tenantId_callEventId_signal: {
            tenantId,
            callEventId: callEvent.id,
            signal: signal.intent,
          },
        },
        create: {
          id: prefixedId('wfev'),
          tenantId,
          callEventId: callEvent.id,
          externalCallId: callEvent.externalCallId,
          eventId,
          trigger: 'call.operational_signal.detected',
          signal: signal.intent,
          actionRequired: signal.action_required,
          recommendedAxis: signal.recommended_axis,
          status,
          reason,
          evaluatedRules: response?.evaluatedRules ?? 0,
          matchedRules: response?.matchedRules ?? 0,
          tasksCreated: response?.tasksCreated ?? 0,
          taskIds: response?.tasks.map((task) => task.taskId) ?? [],
          resolverVersion: output.resolved_with_version,
          resolverModel,
          result: {
            signal,
            response,
            resolver: {
              call_intent: output.call_intent,
              psych_tags: output.psych_tags,
              urgency_signal: output.urgency_signal,
            },
          } as Prisma.InputJsonValue,
        },
        update: {
          eventId,
          trigger: 'call.operational_signal.detected',
          actionRequired: signal.action_required,
          recommendedAxis: signal.recommended_axis,
          status,
          reason,
          evaluatedRules: response?.evaluatedRules ?? 0,
          matchedRules: response?.matchedRules ?? 0,
          tasksCreated: response?.tasksCreated ?? 0,
          taskIds: response?.tasks.map((task) => task.taskId) ?? [],
          resolverVersion: output.resolved_with_version,
          resolverModel,
          result: {
            signal,
            response,
            resolver: {
              call_intent: output.call_intent,
              psych_tags: output.psych_tags,
              urgency_signal: output.urgency_signal,
            },
          } as Prisma.InputJsonValue,
        },
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

function transcriptOperationalSignals(output: TranscriptResolverOutput): TranscriptOperationalSignal[] {
  const provided = dedupeSignals(output.operational_signals.flatMap((signal) => {
    const parsed = transcriptOperationalSignalSchema.safeParse(signal);
    return parsed.success ? [parsed.data] : [];
  }));
  const actionableProvided = provided.filter((signal) => signal.intent !== 'no_action');
  if (actionableProvided.length > 0) return actionableProvided;

  const derived = new Map<string, TranscriptOperationalSignal>();
  const text = normalizedText([
    output.summary,
    output.call_intent,
    output.psych_tags.join(' '),
    output.product_mentions.map((mention) => `${mention.sku ?? ''} ${mention.name_hint ?? ''}`).join(' '),
    output.competitor_mentioned.join(' '),
  ].join(' '));
  const hasTag = (tag: string) => output.psych_tags.includes(tag as TranscriptResolverOutput['psych_tags'][number]);
  const has = (...needles: string[]) => needles.some((needle) => text.includes(needle));
  const productText = normalizedText(output.product_mentions.map((mention) => `${mention.sku ?? ''} ${mention.name_hint ?? ''}`).join(' '));
  const action = (intent: TranscriptOperationalSignal['intent'], confidence: number, axis: TranscriptOperationalSignal['recommended_axis'], title: string, reason: string) => {
    derived.set(intent, {
      intent,
      confidence,
      action_required: intent !== 'no_action',
      recommended_axis: axis,
      reason,
      suggested_task_title: intent === 'no_action' ? null : title,
    });
  };

  if (output.payment_signals.refund_asked || hasTag('refund_intent') || has('refund', 'return', 'chargeback', 'cancel order')) {
    action('refund_requested', 0.86, 'account', 'Refund review follow-up', 'Customer mentioned refund, return, cancellation, or payment recovery.');
  }
  if (output.shipping_signals.tracking_asked || output.shipping_signals.address_mentioned || output.shipping_signals.complaint || hasTag('shipping_issue') || has('shipping', 'tracking', 'delivery', 'freight', 'liftgate', 'address')) {
    action('shipping_status_question', 0.78, 'account', 'Shipping status follow-up', 'Customer asked about shipping, delivery, tracking, freight, or address details.');
  }
  if (has('call back', 'callback', 'call me', 'follow up', 'reach out') || output.call_intent === 'follow_up' || hasTag('follow_up')) {
    action('callback_requested', 0.82, 'sales', 'Callback requested follow-up', 'Customer or agent indicated a follow-up call is needed.');
  }
  if (has('quote', 'estimate', 'proposal', 'invoice me', 'send pricing')) {
    action('quote_request', 0.84, 'sales', 'Quote request follow-up', 'Customer asked for a quote, estimate, proposal, or pricing send-out.');
  }
  if (output.payment_signals.method_mentioned || has('financing', 'finance', 'timepayment', 'lease', 'monthly payment', 'payment plan')) {
    action('financing_question', 0.8, 'account', 'Financing question follow-up', 'Customer discussed financing, payment method, lease, or payment plan.');
  }
  if (has('price', 'cost', 'discount', 'expensive', 'too much', 'cheaper', 'match price')) {
    action('price_objection', 0.72, 'sales', 'Price objection follow-up', 'Customer discussed price, discount, or cost objection.');
  }
  if (has('sample', 'samples', 'test print', 'demo print')) {
    action('sample_request', 0.82, 'sales', 'Sample request follow-up', 'Customer asked for samples, demo print, or test output.');
  }
  if (has('upgrade', 'bigger machine', 'larger machine', 'replace my machine', 'second machine', 'another machine')) {
    action('machine_upgrade_interest', 0.82, 'sales', 'Machine upgrade follow-up', 'Customer signaled upgrade, replacement, or additional machine interest.');
  }
  if (has('training', 'installation', 'install', 'setup', 'assembly', 'how to use', 'not heating', 'temperature', 'calibration')) {
    action('training_installation_need', 0.76, 'account', 'Training or installation follow-up', 'Customer needs setup, training, installation, or equipment-use follow-up.');
  }
  if (has('which machine', 'right machine', 'what size', 'compare', 'difference between', 'fit my', 'recommend')) {
    action('product_fit_question', 0.78, 'sales', 'Product fit consultation follow-up', 'Customer is evaluating fit, size, comparison, or recommendation.');
  }
  if (has('ink', 'powder', 'film', 'dtf supply', 'supplies', 'transfer sheet', 'gang sheet', 'dtf transfers', 'consumable')) {
    action('dtf_supply_reorder_signal', 0.78, 'sales', 'DTF supply reorder follow-up', 'Customer mentioned DTF supplies, transfers, film, powder, ink, or consumables.');
  }
  if ((hasTag('purchase_intent') || output.call_intent === 'sale' || has('buy', 'purchase', 'order one', 'interested in buying')) && (has('heat press', 'hydro', 'hydraulic press', 'press machine') || productText.includes('press'))) {
    action('heat_press_purchase_intent', 0.88, 'sales', 'Heat press purchase follow-up', 'Customer showed purchase intent for heat press or related machine.');
  }
  if (output.customer_match.customer_id && (hasTag('purchase_intent') || output.call_intent === 'sale' || has('add another', 'buy more', 'new product', 'also need'))) {
    action('existing_customer_expansion_signal', 0.74, 'sales', 'Existing customer expansion follow-up', 'Matched customer showed expansion, upsell, or additional purchase signal.');
  }
  if (derived.size === 0 && output.product_mentions.length > 0 && (hasTag('info_request') || output.call_intent === 'inquiry')) {
    action('product_fit_question', 0.62, 'sales', 'Product information follow-up', 'Customer asked about a product and may need sales consultation.');
  }
  if (derived.size === 0 && (hasTag('complaint') || output.call_intent === 'complaint' || output.call_intent === 'support')) {
    action('training_installation_need', 0.6, 'account', 'Customer recovery follow-up', 'Customer had an issue that needs personnel follow-up; no customer request is auto-created.');
  }
  if (derived.size === 0) {
    action('no_action', 1, null, '', 'No sales or personnel follow-up signal was detected.');
  }
  const derivedSignals = dedupeSignals(Array.from(derived.values()));
  if (derivedSignals.some((signal) => signal.intent !== 'no_action')) return derivedSignals;
  return provided.length > 0 ? provided : derivedSignals;
}

function transcriptEvaluationStatus(signal: TranscriptOperationalSignal, response: WorkflowTriggerFireResponse | null) {
  if (!response) return 'failed';
  if (response.tasksCreated > 0) return 'task_created';
  if (response.matchedRules > 0 && signal.intent === 'no_action') return 'no_action';
  if (response.matchedRules > 0) return 'matched_without_task';
  return signal.action_required ? 'no_matching_rule' : 'no_action_unmatched';
}

function transcriptEvaluationReason(signal: TranscriptOperationalSignal, response: WorkflowTriggerFireResponse | null) {
  if (!response) return signal.reason;
  if (response.tasksCreated > 0) return signal.reason;
  if (response.matchedRules > 0 && signal.intent === 'no_action') return signal.reason;
  if (response.matchedRules > 0) return `Matched rule without creating task: ${signal.reason}`;
  if (signal.action_required) return `No active rule matched operational intent ${signal.intent}. ${signal.reason}`;
  return signal.reason;
}

function dedupeSignals(signals: TranscriptOperationalSignal[]) {
  const byIntent = new Map<string, TranscriptOperationalSignal>();
  for (const signal of signals) {
    const existing = byIntent.get(signal.intent);
    if (!existing || signal.confidence > existing.confidence) byIntent.set(signal.intent, signal);
  }
  const actionable = Array.from(byIntent.values()).filter((signal) => signal.intent !== 'no_action');
  return actionable.length > 0 ? actionable : Array.from(byIntent.values());
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
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
