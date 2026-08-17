import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  type TranscriptOperationalSignal,
  type TranscriptResolverOutput,
  type WorkflowTriggerFireResponse,
} from '@factory-engine-pro/contracts';
import { Prisma } from '@prisma/client';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { AppLogger } from '../../shared/logger.service.js';
import { prefixedId } from '../../shared/id.js';
import {
  AI_TRANSCRIPT_RESOLVER_JOB,
  AI_TRANSCRIPT_RESOLVER_QUEUE_NAME,
  REDIS_CONNECTION,
  queueName,
} from '../../shared/queue.module.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { CustomerContactResolverService } from '../../shared/customer-contact-resolver.service.js';
import { RulesService } from '../rules/rules.service.js';
import { AiService } from './ai.service.js';
import { boundedPositiveInt } from './ai-runtime-config.js';
import { transcriptOperationalSignals } from './transcript-operational-signals.js';
import { currentModelResolverOutput } from './transcript-resolver-trust.js';

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
    private readonly contactResolver: CustomerContactResolverService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.connection) {
      this.logger.warn('ai', 'transcript_resolver_worker_disabled', 'REDIS_URL is not configured; transcript resolver worker is disabled');
      return;
    }
    this.worker = new Worker<ResolverJobData>(
      queueName(this.config, AI_TRANSCRIPT_RESOLVER_QUEUE_NAME),
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
        resolverInputHash: true,
        resolverAttemptCount: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
    });
    if (!callEvent) throw new Error(`Aircall call event was not found for resolver job: ${callEventId}`);
    const targetVersion = normalizeTargetVersion(job.data?.targetVersion);
    const transcript = callEvent.transcriptRaw?.trim();
    const preparedTranscript = transcript ? prepareResolverTranscript(transcript) : null;
    const inputHash = preparedTranscript
      ? createHash('sha256').update(preparedTranscript.transcript, 'utf8').digest('hex')
      : null;
    const sameInput = !callEvent.resolverInputHash || callEvent.resolverInputHash === inputHash;
    if (!job.data?.forceReprocess && sameInput && callEvent.resolvedAt && (callEvent.resolvedWithVersion ?? 0) >= targetVersion) {
      const storedOutput = currentModelResolverOutput(callEvent, targetVersion);
      if (!storedOutput) {
        this.logger.warn('ai', 'resolved_transcript_output_untrusted', 'Stored transcript output is not a current model result; workflow replay was blocked', {
          call_event_id: callEvent.id,
          external_call_id: callEvent.externalCallId,
          resolver_status: callEvent.resolverStatus,
          resolver_model: callEvent.resolverModel,
          resolved_with_version: callEvent.resolvedWithVersion,
        });
        await this.prisma.db.aircallCallEvent.updateMany({
          where: { id: callEvent.id },
          data: {
            resolverStatus: 'degraded',
            resolverError: 'Stored resolver output is not a current model result. Explicit bounded model reprocessing is required.',
          },
        });
        return { status: 'degraded_untrusted_stored_output', resolvedWithVersion: callEvent.resolvedWithVersion };
      }
      const evaluations = await this.prisma.db.transcriptWorkflowEvaluation.findMany({
        where: { tenantId: callEvent.tenantId, callEventId: callEvent.id },
        select: { status: true },
      });
      const failedEvaluationCount = evaluations.filter((evaluation) => evaluation.status === 'failed').length;
      const repairFailedEvaluations = failedEvaluationCount > 0;
      const forceWorkflowEvaluationRepair = Boolean(job.data?.forceWorkflowEvaluationRepair) || repairFailedEvaluations;
      if (evaluations.length > 0 && !forceWorkflowEvaluationRepair) {
        return { status: 'skipped_already_resolved', resolvedWithVersion: callEvent.resolvedWithVersion, evaluationCount: evaluations.length };
      }

      await this.runDerivedWorkflowTriggers(
        callEvent,
        storedOutput,
        callEvent.resolverModel!,
        forceWorkflowEvaluationRepair,
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
        status: forceWorkflowEvaluationRepair
          ? 'repaired_workflow_evaluations'
          : 'repaired_missing_workflow_evaluations',
        resolvedWithVersion: callEvent.resolvedWithVersion,
        evaluationCount: repairedEvaluationCount,
      };
    }

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
        resolverInputHash: inputHash,
        resolverAttemptCount: { increment: 1 },
      },
    });

    try {
      if (!preparedTranscript) throw new Error('Prepared transcript is unavailable.');
      if (preparedTranscript.overLimit) {
        throw new ResolverInputReviewRequiredError(
          `Transcript has ${preparedTranscript.rawLength} characters and exceeds the configured ${preparedTranscript.maxLength}-character model input limit. Full transcript was preserved; human review or an explicit larger model limit is required.`,
        );
      }
      const result = await this.ai.resolveTranscript({
        transcript: preparedTranscript.transcript,
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
          transcriptPreparedMode: preparedTranscript.mode,
          transcriptCompressed: preparedTranscript.compressed,
          transcriptTruncated: preparedTranscript.truncated,
          transcriptRawLength: preparedTranscript.rawLength,
          transcriptPreparedLength: preparedTranscript.preparedLength,
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
          resolverInputHash: result.inputHash,
          resolverInputTokens: result.usage.inputTokens,
          resolverOutputTokens: result.usage.outputTokens,
          resolverCostMicros: result.costMicros,
          resolverRepairAttempted: result.repaired,
          resolverFailureKind: null,
          resolverNextRetryAt: null,
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
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        repair_attempted: result.repaired,
      });
      await this.runDerivedWorkflowTriggers(callEvent, result.output, result.model, Boolean(job.data?.forceWorkflowEvaluationRepair));
      return { status: 'succeeded', resolvedWithVersion: result.output.resolved_with_version };
    } catch (error) {
      if (error instanceof WorkflowEvaluationRetryableError) {
        const message = messageOf(error).slice(0, 500);
        this.logger.error('rules', 'transcript_workflow_retry_scheduled', 'Transcript resolution succeeded but workflow evaluation failed; model output was retained for a workflow-only retry', {
          call_event_id: callEventId,
          external_call_id: callEvent.externalCallId,
          error: message,
          target_version: targetVersion,
          attempt: job.attemptsMade + 1,
          configured_attempts: Math.max(1, Number(job.opts.attempts ?? 1)),
        });
        throw error;
      }
      const message = messageOf(error).slice(0, 500);
      await this.prisma.db.aircallCallEvent.updateMany({
        where: { id: callEventId },
        data: {
          resolverStatus: 'failed',
          resolverOutput: Prisma.DbNull,
          resolverError: message,
          resolverModel: null,
          resolverPromptKey: 'ai.transcript-resolver',
          resolverFailureKind: resolverFailureKind(error),
          resolverLatencyMs: null,
          resolvedAt: null,
          resolvedWithVersion: null,
        },
      });
      this.logger.error('ai', 'transcript_resolve_failed', 'Aircall transcript resolver failed; no workflow evaluation or task was produced', {
        call_event_id: callEventId,
        external_call_id: callEvent.externalCallId,
        error: message,
        target_version: targetVersion,
      });
      const configuredAttempts = Math.max(1, Number(job.opts.attempts ?? 1));
      const attemptsUsed = job.attemptsMade + 1;
      if (isRetryableResolverError(error) && attemptsUsed < configuredAttempts) {
        throw error;
      }
      return { status: 'failed', error: message };
    }
  }

  private async runDerivedWorkflowTriggers(
    callEvent: { id: string; externalCallId: string; eventTimestamp: Date; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
    resolverModel: string,
    forceWorkflowEvaluationRepair = false,
  ) {
    try {
      await this.fireDerivedWorkflowTriggers(callEvent, output, resolverModel, forceWorkflowEvaluationRepair);
    } catch (error) {
      if (error instanceof WorkflowEvaluationRetryableError) throw error;
      throw new WorkflowEvaluationRetryableError(`Workflow evaluation failed after transcript resolution: ${messageOf(error)}`);
    }
  }

  private async fireDerivedWorkflowTriggers(
    callEvent: { id: string; externalCallId: string; eventTimestamp: Date; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
    resolverModel: string,
    forceWorkflowEvaluationRepair = false,
  ) {
    const matchedCustomer = await this.resolveCustomerForCall(callEvent, output);
    const resolvedPhone = callEvent.contactPhoneE164 ?? output.customer_match.phone ?? null;
    if (matchedCustomer && resolvedPhone) {
      await this.contactResolver.capturePhonePoints(matchedCustomer.id, [{
        value: resolvedPhone,
        source: 'call',
        sourceRef: callEvent.id,
        priority: 70,
        metadata: {
          externalCallId: callEvent.externalCallId,
          eventTimestamp: callEvent.eventTimestamp.toISOString(),
          capturedBy: 'transcript_resolver',
        },
      }]);
    }
    const baseParams = {
      callEventId: callEvent.id,
      externalCallId: callEvent.externalCallId,
      contactPhoneE164: callEvent.contactPhoneE164 ?? null,
      contactEmail: callEvent.contactEmail ?? null,
      customerId: matchedCustomer?.id ?? output.customer_match.customer_id ?? null,
      customerPhone: resolvedPhone,
      customerEmail: callEvent.contactEmail ?? null,
      sourceOccurredAt: callEvent.eventTimestamp.toISOString(),
    };
    await this.fireOperationalSignalFlow(
      callEvent,
      output,
      baseParams,
      resolverModel,
      forceWorkflowEvaluationRepair,
    );
  }

  private async fireOperationalSignalFlow(
    callEvent: { id: string; externalCallId: string; eventTimestamp: Date; contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
    baseParams: Record<string, unknown>,
    resolverModel: string,
    forceWorkflowEvaluationRepair: boolean,
  ) {
    const signals = transcriptOperationalSignals(output);
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for transcript workflow evaluation');
    const currentSignalIntents = signals.map((signal) => signal.intent);
    const failures: Array<{ signal: string; error: string }> = [];
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
        failures.push({ signal: signal.intent, error: reason });
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
    if (failures.length > 0) {
      throw new WorkflowEvaluationRetryableError(
        `Workflow evaluation failed for ${failures.map((failure) => failure.signal).join(', ')}: ${failures.map((failure) => failure.error).join('; ')}`,
      );
    }
  }

  private async resolveCustomerForCall(
    callEvent: { contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
  ) {
    return this.contactResolver.findCustomer({
      customerId: output.customer_match.customer_id,
      email: callEvent.contactEmail,
      phone: callEvent.contactPhoneE164 ?? output.customer_match.phone,
    });
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
      : await this.prisma.db.staffWorkItem.findMany({
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

function prepareResolverTranscript(transcript: string) {
  const maxLength = boundedPositiveInt(process.env.ANTHROPIC_TRANSCRIPT_MAX_CHARS, 80_000, {
    min: 12_000,
    max: 160_000,
  });
  const normalized = transcript.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  return {
    transcript: normalized,
    mode: normalized.length <= maxLength ? 'full_transcript' : 'review_required_oversize',
    compressed: normalized.length < transcript.length,
    truncated: false,
    overLimit: normalized.length > maxLength,
    maxLength,
    rawLength: normalized.length,
    preparedLength: normalized.length,
  };
}

class ResolverInputReviewRequiredError extends Error {
  readonly code = 'resolver_input_review_required';
}

class WorkflowEvaluationRetryableError extends Error {
  readonly code = 'workflow_evaluation_retryable';

  constructor(message: string) {
    super(message);
    this.name = 'WorkflowEvaluationRetryableError';
  }
}

function isRetryableResolverError(error: unknown) {
  if (error instanceof ResolverInputReviewRequiredError) return false;
  if (!error || typeof error !== 'object') return true;
  const response = 'getResponse' in error && typeof error.getResponse === 'function'
    ? error.getResponse()
    : null;
  const detail = response && typeof response === 'object' ? response as Record<string, unknown> : null;
  const code = typeof detail?.code === 'string' ? detail.code : '';
  const status = typeof detail?.status === 'number' ? detail.status : null;
  if (code === 'anthropic_resolver_timeout' || code === 'anthropic_resolver_network_error') return true;
  if (code === 'anthropic_resolver_failed') return status === 408 || status === 409 || status === 429 || (status !== null && status >= 500);
  return false;
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

function resolverFailureKind(error: unknown) {
  const message = messageOf(error).toLowerCase();
  if (message.includes('daily cap') || message.includes('budget')) return 'budget';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('invalid structured output') || message.includes('json')) return 'invalid_output';
  if (message.includes('credential') || message.includes('api key')) return 'credentials';
  if (message.includes('network') || message.includes('could not reach')) return 'network';
  return 'provider';
}

function normalizeTargetVersion(value: unknown) {
  const parsed = Number(value ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
}
