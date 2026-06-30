import { HttpException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
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
import {
  OPERATIONAL_INTENT_KEYWORDS,
  PURCHASE_SIGNAL_KEYWORDS,
  keywordMatches,
  normalizedText,
  transcriptOperationalSignals,
} from './transcript-operational-signals.js';

type ResolverJobData = {
  tenantId?: string;
  callEventId?: string;
  externalCallId?: string;
  forceReprocess?: boolean;
  forceWorkflowEvaluationRepair?: boolean;
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
      if (evaluationCount > 0 && !job.data?.forceWorkflowEvaluationRepair) {
        return { status: 'skipped_already_resolved', resolvedWithVersion: callEvent.resolvedWithVersion, evaluationCount };
      }

      const storedOutput = transcriptResolverOutputSchema.safeParse(callEvent.resolverOutput);
      if (storedOutput.success) {
        await this.fireDerivedWorkflowTriggers(
          callEvent,
          storedOutput.data,
          callEvent.resolverModel ?? 'stored-resolver-output',
          Boolean(job.data?.forceWorkflowEvaluationRepair),
        );
        await this.prisma.db.aircallCallEvent.updateMany({
          where: { id: callEvent.id },
          data: {
            resolverStatus: 'succeeded',
            resolverError: null,
            resolvedAt: callEvent.resolvedAt ?? new Date(),
            resolvedWithVersion: callEvent.resolvedWithVersion ?? targetVersion,
          },
        });
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
          status: job.data?.forceWorkflowEvaluationRepair
            ? 'repaired_workflow_evaluations'
            : 'repaired_missing_workflow_evaluations',
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
      await this.fireDerivedWorkflowTriggers(callEvent, result.output, result.model, Boolean(job.data?.forceWorkflowEvaluationRepair));
      return { status: 'succeeded', resolvedWithVersion: result.output.resolved_with_version };
    } catch (error) {
      const message = messageOf(error).slice(0, 500);
      const code = httpErrorCode(error);
      const fallbackOutput = localFallbackResolverOutput(transcript, targetVersion);
      const fallbackModel = 'local-rule-fallback';
      await this.prisma.db.aircallCallEvent.updateMany({
        where: { id: callEventId },
        data: {
          resolverStatus: 'succeeded',
          resolverOutput: fallbackOutput as Prisma.InputJsonValue,
          resolverError: code ? `local_fallback_after_${code}: ${message}` : `local_fallback_after_provider_error: ${message}`,
          resolverModel: fallbackModel,
          resolverPromptKey: 'ai.transcript-resolver.local-fallback',
          resolverLatencyMs: null,
          resolvedAt: new Date(),
          resolvedWithVersion: fallbackOutput.resolved_with_version,
        },
      });
      this.logger.warn('ai', 'transcript_resolve_local_fallback', 'Aircall transcript resolver failed; deterministic local fallback was used so workflow evaluation still runs', {
        call_event_id: callEventId,
        external_call_id: callEvent.externalCallId,
        error_code: code,
        error: message,
        fallback_model: fallbackModel,
        target_version: targetVersion,
      });
      await this.fireDerivedWorkflowTriggers(callEvent, fallbackOutput, fallbackModel, Boolean(job.data?.forceWorkflowEvaluationRepair));
      return { status: 'succeeded_with_local_fallback', resolvedWithVersion: fallbackOutput.resolved_with_version, error: message };
    }
  }

  private async fireDerivedWorkflowTriggers(
    callEvent: { id: string; externalCallId: string; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
    resolverModel: string,
    forceWorkflowEvaluationRepair = false,
  ) {
    const matchedCustomer = await this.resolveCustomerForCall(callEvent, output);
    const baseParams = {
      callEventId: callEvent.id,
      externalCallId: callEvent.externalCallId,
      contactPhoneE164: callEvent.contactPhoneE164 ?? null,
      contactEmail: callEvent.contactEmail ?? null,
      customerId: matchedCustomer?.id ?? output.customer_match.customer_id ?? null,
      customerPhone: callEvent.contactPhoneE164 ?? output.customer_match.phone ?? null,
      customerEmail: callEvent.contactEmail ?? null,
    };
    await this.fireOperationalSignalFlow(
      callEvent,
      output,
      baseParams,
      resolverModel,
      Boolean(matchedCustomer?.id ?? output.customer_match.customer_id),
      forceWorkflowEvaluationRepair,
    );
  }

  private async fireOperationalSignalFlow(
    callEvent: { id: string; externalCallId: string; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
    baseParams: Record<string, unknown>,
    resolverModel: string,
    customerMatched: boolean,
    forceWorkflowEvaluationRepair: boolean,
  ) {
    const signals = transcriptOperationalSignals(output, { customerMatched });
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for transcript workflow evaluation');
    const currentSignalIntents = signals.map((signal) => signal.intent);
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
            forceWorkflowEvaluationRepair,
            recommendedAxis: signal.recommended_axis,
            suggestedTaskTitle: signal.suggested_task_title,
            reason: signal.reason,
            callIntent: output.call_intent,
            psychTags: output.psych_tags,
            urgencySignal: output.urgency_signal,
          },
        });
        response = await this.recoverDuplicateWorkflowResponse(tenantId, eventId, response);
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
      const responseTaskIds = workflowResponseTaskIds(response);
      const responseTaskCount = responseTaskIds.length > 0 ? responseTaskIds.length : response?.tasksCreated ?? 0;

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
          tasksCreated: responseTaskCount,
          taskIds: responseTaskIds,
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
          tasksCreated: responseTaskCount,
          taskIds: responseTaskIds,
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
    await this.prisma.db.transcriptWorkflowEvaluation.updateMany({
      where: {
        tenantId,
        callEventId: callEvent.id,
        signal: { notIn: currentSignalIntents },
        status: { not: 'superseded' },
      },
      data: {
        status: 'superseded',
        reason: `Superseded by resolver output version ${output.resolved_with_version}; signal is not present in the current operational signal set.`,
        resolverVersion: output.resolved_with_version,
        resolverModel,
      },
    });
  }

  private async resolveCustomerForCall(
    callEvent: { contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
  ) {
    const tenantId = this.tenantContext.require().tenantId;
    if (output.customer_match.customer_id) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { tenantId, id: output.customer_match.customer_id },
        select: { id: true },
      });
      if (customer) return customer;
    }

    const email = (callEvent.contactEmail ?? '').trim();
    if (email) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { tenantId, email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (customer) return customer;
    }

    const phone = (callEvent.contactPhoneE164 ?? output.customer_match.phone ?? '').trim();
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    const phoneNeedles = uniqueStrings([phone, digits, digits.length > 10 ? digits.slice(-10) : digits]);
    for (const needle of phoneNeedles) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { tenantId, phone: { contains: needle } },
        select: { id: true },
      });
      if (customer) return customer;
    }
    return null;
  }

  private async recoverDuplicateWorkflowResponse(
    tenantId: string,
    eventId: string,
    response: WorkflowTriggerFireResponse,
  ): Promise<WorkflowTriggerFireResponse> {
    if (response.matchedRules > 0 || response.tasksCreated > 0) return response;

    const executions = await this.prisma.db.workflowRuleExecution.findMany({
      where: {
        tenantId,
        eventId,
        trigger: 'call.operational_signal.detected',
        status: { notIn: ['started', 'skipped'] },
      },
      include: {
        rule: { select: { id: true, name: true } },
      },
    });
    if (executions.length === 0) return response;

    const taskIds = uniqueStrings(executions.flatMap((execution) => execution.taskIds));
    const tasks = taskIds.length === 0
      ? []
      : await this.prisma.db.serviceRequest.findMany({
          where: { tenantId, id: { in: taskIds } },
          select: { id: true, title: true },
        });
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const executionByRuleId = new Map(executions.map((execution) => [execution.ruleId, execution]));
    const resultRuleIds = new Set(response.results.map((result) => result.ruleId));
    const recoveredResults = executions
      .filter((execution) => !resultRuleIds.has(execution.ruleId))
      .map((execution) => ({
        ruleId: execution.ruleId,
        ruleName: execution.rule?.name ?? execution.ruleId,
        status: recoveredExecutionStatus(execution.status),
        executionMode: 'active' as const,
        taskIds: execution.taskIds,
      }));
    return {
      ...response,
      matchedRules: executions.length,
      evaluatedRules: Math.max(response.evaluatedRules, executions.length),
      tasksCreated: taskIds.length,
      tasks: executions.flatMap((execution) => execution.taskIds.map((taskId) => ({
        ruleId: execution.ruleId,
        ruleName: execution.rule?.name ?? execution.ruleId,
        actionId: 'recovered_duplicate_execution',
        action: 'create_task',
        taskId,
        title: taskById.get(taskId)?.title ?? 'Recovered workflow task',
      }))),
      results: [
        ...response.results.map((result) => {
          const execution = executionByRuleId.get(result.ruleId);
          if (!execution) return result;
          const { reason, ...rest } = result;
          void reason;
          return {
            ...rest,
            status: recoveredExecutionStatus(execution.status),
            taskIds: execution.taskIds,
          };
        }),
        ...recoveredResults,
      ],
    };
  }
}

function clipTranscript(transcript: string) {
  const maxLength = 12_000;
  return transcript.length > maxLength
    ? { transcript: transcript.slice(0, maxLength), truncated: true }
    : { transcript, truncated: false };
}

function localFallbackResolverOutput(transcript: string, targetVersion: number): TranscriptResolverOutput {
  const text = normalizedText(transcript);
  const hasAny = (needles: readonly string[]) => needles.some((needle) => keywordMatches(text, needle));
  const psychTags = new Set<TranscriptResolverOutput['psych_tags'][number]>();
  const productMentions: TranscriptResolverOutput['product_mentions'] = [];
  const hasPurchaseSignal = hasAny(PURCHASE_SIGNAL_KEYWORDS);
  const hasSparePartSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.spare_part_purchase_intent);
  const hasHeatPressMachineSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.heat_press_machine_purchase_intent);
  const hasHeatPressSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.heat_press_purchase_intent);
  const hasDtfSupplySignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.dtf_supply_reorder_signal);
  const hasQuoteSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.quote_request);
  const hasCallbackSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.callback_requested);
  const hasRefundSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.refund_requested);
  const hasShippingSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.shipping_status_question);
  const hasFinancingSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.financing_question);
  const hasPriceSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.price_objection);
  const hasFitSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.product_fit_question);
  const hasTrainingSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.training_installation_need);
  const hasSampleSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.sample_request);
  const hasUpgradeSignal = hasAny(OPERATIONAL_INTENT_KEYWORDS.machine_upgrade_interest);
  const hasComplaintSignal = hasRefundSignal
    || hasShippingSignal
    || hasTrainingSignal
    || hasAny(['complaint', 'problem', 'issue', 'broken', 'not working', 'wrong item', 'damaged']);

  if (hasPurchaseSignal || hasSparePartSignal || hasHeatPressMachineSignal || hasHeatPressSignal || hasDtfSupplySignal || hasQuoteSignal || hasUpgradeSignal) psychTags.add('purchase_intent');
  if (hasQuoteSignal || hasPriceSignal || hasFitSignal || hasFinancingSignal || hasSampleSignal) psychTags.add('info_request');
  if (hasCallbackSignal) psychTags.add('follow_up');
  if (hasRefundSignal) psychTags.add('refund_intent');
  if (hasShippingSignal) psychTags.add('shipping_issue');
  if (hasComplaintSignal) psychTags.add('complaint');

  if (hasSparePartSignal) {
    productMentions.push({ sku: null, name_hint: 'Spare part', confidence: 0.7 });
  }
  if (hasHeatPressMachineSignal) {
    productMentions.push({ sku: null, name_hint: 'Heat press machine', confidence: 0.74 });
  }
  if (hasHeatPressSignal) {
    productMentions.push({ sku: null, name_hint: 'Heat press', confidence: 0.72 });
  }
  if (hasDtfSupplySignal) {
    productMentions.push({ sku: null, name_hint: 'DTF supplies', confidence: 0.72 });
  }

  let callIntent: TranscriptResolverOutput['call_intent'] = 'inquiry';
  if (hasPurchaseSignal || hasSparePartSignal || hasHeatPressMachineSignal || hasHeatPressSignal || hasDtfSupplySignal || hasQuoteSignal || hasUpgradeSignal) callIntent = 'sale';
  else if (hasCallbackSignal) callIntent = 'follow_up';
  else if (hasComplaintSignal) callIntent = 'complaint';

  const output: TranscriptResolverOutput = {
    customer_match: {
      customer_id: null,
      phone: null,
      name_hint: null,
      confidence: 0,
    },
    product_mentions: productMentions,
    psych_tags: Array.from(psychTags),
    call_intent: callIntent,
    shipping_signals: {
      address_mentioned: hasAny(['address', 'ship to', 'delivery address']),
      tracking_asked: hasAny(['tracking', 'where is my order', 'eta']),
      complaint: hasShippingSignal && hasComplaintSignal,
    },
    payment_signals: {
      method_mentioned: hasFinancingSignal || hasAny(['card', 'wire', 'ach', 'paypal', 'payment method']),
      refund_asked: hasRefundSignal,
      complaint: hasRefundSignal || hasPriceSignal,
    },
    urgency_signal: hasAny(['urgent', 'asap', 'today', 'critical']) ? 'high' : 'medium',
    operational_signals: [],
    person_brief: {
      why_calling: '',
      upset_about: '',
      call_goal: '',
      suggested_actions: [],
      transcript_snippet: '',
    },
    competitor_mentioned: [],
    summary: transcript.replace(/\s+/g, ' ').trim().slice(0, 1200),
    language_detected: 'unknown',
    resolved_with_version: targetVersion,
  };
  output.person_brief = localFallbackPersonBrief(transcript, output, transcriptOperationalSignals(output, { customerMatched: false }));
  return output;
}

function localFallbackPersonBrief(
  transcript: string,
  output: TranscriptResolverOutput,
  signals: TranscriptOperationalSignal[],
): TranscriptResolverOutput['person_brief'] {
  const cleanTranscript = transcript.replace(/\s+/g, ' ').trim();
  const actionable = signals.filter((signal) => signal.action_required && signal.intent !== 'no_action');
  const primary = actionable[0] ?? signals[0] ?? null;
  const intent = primary?.intent ?? 'no_action';
  const products = output.product_mentions
    .map((mention) => mention.name_hint ?? mention.sku)
    .filter((value): value is string => Boolean(value?.trim()));
  const productText = products.length ? ` about ${products.join(', ')}` : '';
  const whyByIntent: Record<string, string> = {
    spare_part_purchase_intent: `Customer is asking about a replacement part${productText}; confirm fit before quoting.`,
    heat_press_machine_purchase_intent: `Customer is showing purchase intent for a heat press machine${productText}; qualify the machine sale.`,
    heat_press_purchase_intent: `Customer is evaluating a heat press purchase${productText}; guide them to the right model and next step.`,
    dtf_supply_reorder_signal: `Customer may need DTF supplies or consumables${productText}; confirm reorder details.`,
    quote_request: `Customer asked for pricing, quote, or proposal${productText}; prepare the sales follow-up.`,
    callback_requested: 'Customer or agent indicated a follow-up call is needed; call back and close the loop.',
    refund_requested: 'Customer mentioned refund, return, cancellation, or payment recovery; handle the account follow-up.',
    shipping_status_question: 'Customer asked about shipping, delivery, tracking, freight, or address details.',
    financing_question: 'Customer discussed financing, lease, payment method, or payment plan.',
    price_objection: 'Customer raised a price, discount, budget, or competitor objection.',
    product_fit_question: `Customer needs product fit guidance${productText}; clarify use case and recommend the right option.`,
    sample_request: 'Customer asked for samples, a demo print, or proof of output quality.',
    machine_upgrade_interest: 'Customer signaled upgrade, replacement, second machine, or higher-volume production interest.',
    training_installation_need: 'Customer needs setup, training, installation, or equipment-use follow-up.',
    existing_customer_expansion_signal: 'Existing customer showed expansion, upsell, or additional purchase signal.',
    no_action: output.summary || cleanTranscript.slice(0, 180) || 'Transcript captured no clear sales or account follow-up signal.',
  };
  const goalByIntent: Record<string, string> = {
    spare_part_purchase_intent: 'Confirm machine model, exact part, compatibility, price, and availability.',
    heat_press_machine_purchase_intent: 'Qualify the machine need and move the customer toward quote or order.',
    heat_press_purchase_intent: 'Match the customer to the right heat press and set the next sales step.',
    dtf_supply_reorder_signal: 'Confirm consumable quantities, SKU, timing, and reorder path.',
    quote_request: 'Collect required details and send or confirm the quote path.',
    callback_requested: 'Reach the customer and confirm what decision, order, or question is pending.',
    refund_requested: 'Clarify order number, reason, and the next account-side action.',
    shipping_status_question: 'Clarify order/tracking context and give the next accountable shipping update.',
    financing_question: 'Explain financing path and capture the details needed for the account step.',
    price_objection: 'Understand the objection and offer the best qualified sales path.',
    product_fit_question: 'Clarify use case, volume, material, and size before recommending a product.',
    sample_request: 'Confirm sample type and explain the sample or proof process.',
    machine_upgrade_interest: 'Qualify current setup and target production volume for the upgrade.',
    training_installation_need: 'Clarify the setup or training gap and schedule the next help step.',
    existing_customer_expansion_signal: 'Identify the expansion opportunity and guide the next purchase step.',
    no_action: 'Decide whether a human follow-up is still needed after reviewing the transcript.',
  };
  const upsetAbout = output.payment_signals.refund_asked
    ? 'Refund, return, cancellation, or payment recovery was mentioned.'
    : output.shipping_signals.complaint || output.shipping_signals.tracking_asked
      ? 'Shipping, delivery, tracking, freight, or address uncertainty was mentioned.'
      : output.payment_signals.complaint
        ? 'Payment, pricing, or refund friction was mentioned.'
        : output.psych_tags.includes('complaint')
          ? 'Complaint language was captured in the transcript.'
          : 'No explicit complaint captured in the transcript.';
  return {
    why_calling: whyByIntent[intent] ?? primary?.reason ?? output.summary ?? cleanTranscript.slice(0, 180),
    upset_about: upsetAbout,
    call_goal: goalByIntent[intent] ?? 'Move the customer to the next accountable sales or account step.',
    suggested_actions: localFallbackSuggestedActions(intent, products),
    transcript_snippet: cleanTranscript.slice(0, 500),
  };
}

function localFallbackSuggestedActions(intent: string, products: string[]) {
  const productAction = products.length ? `Mention detected product context: ${products.slice(0, 3).join(', ')}` : null;
  const actionsByIntent: Record<string, string[]> = {
    spare_part_purchase_intent: ['Confirm exact machine model and part needed', 'Check compatibility before quoting', 'Give price and availability if the part match is clear'],
    heat_press_machine_purchase_intent: ['Qualify size, production volume, and budget', 'Confirm model fit and availability', 'Set quote or order next step'],
    heat_press_purchase_intent: ['Clarify target use case and machine size', 'Compare the best fit options', 'Set quote or order next step'],
    dtf_supply_reorder_signal: ['Confirm SKU, quantity, and timing', 'Check recent purchase pattern', 'Guide reorder or quote path'],
    quote_request: ['Collect product, quantity, and timing details', 'Confirm email for the quote', 'Set quote follow-up owner and deadline'],
    callback_requested: ['Call the customer back from the task phone number', 'Confirm what decision or question is pending', 'Record the outcome before leaving the task'],
    refund_requested: ['Ask for order number and refund reason', 'Clarify whether replacement, return, or account review is needed', 'Set the next account-side action'],
    shipping_status_question: ['Ask for order or tracking number', 'Clarify freight, address, or delivery issue', 'Give the next accountable update path'],
    financing_question: ['Clarify product and total budget', 'Explain financing or lease path', 'Capture details needed for account review'],
    price_objection: ['Ask what price or competitor they are comparing', 'Confirm quantity and urgency', 'Offer the best qualified pricing path'],
    product_fit_question: ['Ask use case, volume, material, and size', 'Recommend the matching product family', 'Confirm next quote/order step'],
    sample_request: ['Clarify sample type and use case', 'Explain sample or proof process', 'Set follow-up after sample decision'],
    machine_upgrade_interest: ['Ask current machine and production bottleneck', 'Qualify target volume and timeline', 'Recommend upgrade path'],
    training_installation_need: ['Clarify setup or usage blocker', 'Confirm machine/model involved', 'Schedule the next training or account follow-up'],
    existing_customer_expansion_signal: ['Confirm current setup and expansion goal', 'Identify cross-sell or upgrade fit', 'Set next sales action'],
    no_action: ['Review transcript signal', 'Decide if follow-up is required', 'Record the outcome before leaving the task'],
  };
  return [...(actionsByIntent[intent] ?? actionsByIntent.no_action), productAction]
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);
}

function transcriptEvaluationStatus(signal: TranscriptOperationalSignal, response: WorkflowTriggerFireResponse | null) {
  if (!response) return 'failed';
  if (workflowResponseHasTaskOutcome(response)) return 'task_created';
  if (response.results.some((result) => result.status === 'cooldown_suppressed')) return 'cooldown_suppressed';
  if (!signal.action_required) return response.matchedRules > 0 ? 'no_action' : 'no_action_unmatched';
  if (response.matchedRules > 0 && signal.intent === 'no_action') return 'no_action';
  if (response.matchedRules > 0) return 'matched_without_task';
  return signal.action_required ? 'no_matching_rule' : 'no_action_unmatched';
}

function transcriptEvaluationReason(signal: TranscriptOperationalSignal, response: WorkflowTriggerFireResponse | null) {
  if (!response) return signal.reason;
  if (workflowResponseHasTaskOutcome(response)) return signal.reason;
  const cooldown = response.results.find((result) => result.status === 'cooldown_suppressed')?.cooldown;
  if (cooldown) {
    return `Workflow matched but task creation was suppressed by cooldown until ${cooldown.nextEligibleAt ?? 'the next eligible window'}. ${signal.reason}`;
  }
  if (response.matchedRules > 0 && signal.intent === 'no_action') return signal.reason;
  if (response.matchedRules > 0) return `Matched rule without creating task: ${signal.reason}`;
  if (signal.action_required) return `No active rule matched operational intent ${signal.intent}. ${signal.reason}`;
  if (!signal.action_required) return `No active no-action audit rule matched operational intent ${signal.intent}. ${signal.reason}`;
  return signal.reason;
}

function workflowResponseHasTaskOutcome(response: WorkflowTriggerFireResponse) {
  return response.tasksCreated > 0 || workflowResponseTaskIds(response).length > 0;
}

function workflowResponseTaskIds(response: WorkflowTriggerFireResponse | null) {
  if (!response) return [];
  return uniqueStrings([
    ...response.tasks.map((task) => task.taskId),
    ...response.results.flatMap((result) => result.taskIds),
  ]);
}

function recoveredExecutionStatus(status: string): WorkflowTriggerFireResponse['results'][number]['status'] {
  if (status === 'task_created'
    || status === 'actions_applied'
    || status === 'no_op'
    || status === 'shadow_matched'
    || status === 'cooldown_suppressed'
    || status === 'existing_task'
    || status === 'skipped') {
    return status;
  }
  return 'actions_applied';
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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
