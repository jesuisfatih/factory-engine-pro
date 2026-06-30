import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  activeWorkflowRuleStatsQuerySchema,
  backfillWorkflowRuleSchema,
  fireWorkflowTriggerSchema,
  rollbackWorkflowRuleSchema,
  saveWorkflowRuleSchema,
  workflowMcpCreateDraftRuleSchema,
  workflowMcpDraftRuleSchema,
  workflowMcpPublishRuleSchema,
  workflowMcpSimulateRuleSchema,
  workflowMcpValidateRuleSchema,
  WORKFLOW_ENUM_CATALOG,
  WORKFLOW_ENUM_COUNTS,
  WORKFLOW_ENUM_VERSION,
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  transcriptResolverOutputSchema,
  OPERATIONAL_INTENTS,
  OPERATIONAL_INTENT_REGISTRY,
  createTaskAxisSchema,
  operationalIntentSchema,
  defaultAxisForOperationalIntent,
  detectOperationalIntentFromText,
  expectedOutcomeForOperationalIntent,
  taskTitleForOperationalIntent as registryTaskTitleForOperationalIntent,
  workflowRuleDefinitionSchema,
  workflowEnumProbeValues,
  type ActiveWorkflowRuleStatsQuery,
  type ActiveWorkflowRuleStatsResponse,
  type BackfillWorkflowRuleInput,
  type BootstrapWorkflowDefaultsResponse,
  type WorkflowActionTrace,
  type WorkflowCooldownTrace,
  type SaveWorkflowRuleInput,
  type RollbackWorkflowRuleInput,
  type CreateTaskAxis,
  type TaskAxis,
  type WorkflowConditionTrace,
  type WorkflowEnumCatalogResponse,
  type WorkflowEnumChainProbeResponse,
  type WorkflowRuleAction,
  type WorkflowRuleCondition,
  type WorkflowRuleDefinition,
  type WorkflowRuleWhenGroup,
  type WorkflowWhenGroupTrace,
  type WorkflowTriggerFireInput,
  type WorkflowTriggerFireResponse,
  type WorkflowMcpCapabilitiesResponse,
  type WorkflowMcpCreateDraftRuleInput,
  type WorkflowMcpCreateDraftRuleResponse,
  type WorkflowMcpDraftRuleInput,
  type WorkflowMcpDraftRuleResponse,
  type WorkflowMcpPublishRuleInput,
  type WorkflowMcpPublishRuleResponse,
  type WorkflowMcpSimulateRuleInput,
  type WorkflowMcpSimulateRuleResponse,
  type WorkflowMcpValidateRuleInput,
  type WorkflowMcpValidateRuleResponse,
  type WorkflowOperationalContractProbeResponse,
  type WorkflowRuleDto,
  type WorkflowRuleBackfillReportDto,
  type WorkflowRuleBackfillReportsResponse,
  type WorkflowRuleBackfillRunResponse,
  type WorkflowRuleBackfillSample,
  type WorkflowRuleExecutionsResponse,
  type WorkflowRuleVersionsResponse,
  type WorkflowRulesResponse,
  type WorkflowTrigger,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { CustomersService } from '../customers/customers.service.js';
import { MailService } from '../mail/mail.service.js';
import { SupportService } from '../support/support.service.js';
import { transcriptOperationalSignals } from '../ai/transcript-operational-signals.js';
import { RulesRepository } from './rules.repository.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

const DEFAULT_WORKFLOW_RULES: SaveWorkflowRuleInput[] = [
  defaultRule(
    'operational_heat_press_purchase_sales_task',
    'Default: Heat press purchase follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_heat_press_purchase', 'operational_intent', '=', 'heat_press_purchase_intent')],
    [defaultAction('create_heat_press_sales_task', 'create_task', 'Heat press purchase follow-up', 'sales')],
    70,
  ),
  defaultRule(
    'operational_dtf_supply_reorder_sales_task',
    'Default: DTF supply reorder follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_dtf_supply_reorder', 'operational_intent', '=', 'dtf_supply_reorder_signal')],
    [defaultAction('create_dtf_supply_reorder_task', 'create_task', 'DTF supply reorder follow-up', 'sales')],
    65,
  ),
  defaultRule(
    'operational_quote_request_sales_task',
    'Default: Quote request follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_quote_request', 'operational_intent', '=', 'quote_request')],
    [defaultAction('create_quote_request_task', 'create_task', 'Quote request follow-up', 'sales')],
    70,
  ),
  defaultRule(
    'operational_callback_requested_sales_task',
    'Default: Callback requested follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_callback_requested', 'operational_intent', '=', 'callback_requested')],
    [defaultAction('create_callback_task', 'create_task', 'Callback requested follow-up', 'sales')],
    70,
  ),
  defaultRule(
    'operational_refund_requested_account_task',
    'Default: Refund review follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_refund_requested', 'operational_intent', '=', 'refund_requested')],
    [defaultAction('create_refund_review_task', 'create_task', 'Refund review follow-up', 'account')],
    70,
  ),
  defaultRule(
    'operational_shipping_status_account_task',
    'Default: Shipping status follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_shipping_status', 'operational_intent', '=', 'shipping_status_question')],
    [defaultAction('create_shipping_status_task', 'create_task', 'Shipping status follow-up', 'account')],
    60,
  ),
  defaultRule(
    'operational_financing_question_account_task',
    'Default: Financing question follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_financing_question', 'operational_intent', '=', 'financing_question')],
    [defaultAction('create_financing_follow_up_task', 'create_task', 'Financing question follow-up', 'account')],
    65,
  ),
  defaultRule(
    'operational_price_objection_sales_task',
    'Default: Price objection follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_price_objection', 'operational_intent', '=', 'price_objection')],
    [defaultAction('create_price_objection_task', 'create_task', 'Price objection follow-up', 'sales')],
    60,
  ),
  defaultRule(
    'operational_product_fit_sales_task',
    'Default: Product fit consultation',
    'call.operational_signal.detected',
    [defaultCondition('intent_product_fit', 'operational_intent', '=', 'product_fit_question')],
    [defaultAction('create_product_fit_task', 'create_task', 'Product fit consultation follow-up', 'sales')],
    60,
  ),
  defaultRule(
    'operational_sample_request_sales_task',
    'Default: Sample request follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_sample_request', 'operational_intent', '=', 'sample_request')],
    [defaultAction('create_sample_request_task', 'create_task', 'Sample request follow-up', 'sales')],
    60,
  ),
  defaultRule(
    'operational_machine_upgrade_sales_task',
    'Default: Machine upgrade follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_machine_upgrade', 'operational_intent', '=', 'machine_upgrade_interest')],
    [defaultAction('create_machine_upgrade_task', 'create_task', 'Machine upgrade follow-up', 'sales')],
    65,
  ),
  defaultRule(
    'operational_training_installation_account_task',
    'Default: Training and installation follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_training_installation', 'operational_intent', '=', 'training_installation_need')],
    [defaultAction('create_training_installation_task', 'create_task', 'Training or installation follow-up', 'account')],
    60,
  ),
  defaultRule(
    'operational_existing_customer_expansion_sales_task',
    'Default: Existing customer expansion follow-up',
    'call.operational_signal.detected',
    [defaultCondition('intent_existing_expansion', 'operational_intent', '=', 'existing_customer_expansion_signal')],
    [defaultAction('create_existing_expansion_task', 'create_task', 'Existing customer expansion follow-up', 'sales')],
    65,
  ),
  defaultRule(
    'operational_no_action_audit',
    'Default: No actionable sales task',
    'call.operational_signal.detected',
    [defaultCondition('intent_no_action', 'operational_intent', '=', 'no_action')],
    [defaultAction('audit_no_action', 'no-op', 'Transcript has no actionable sales or personnel follow-up.')],
    10,
  ),
  defaultRule(
    'customer_repeat_call_account_escalation',
    'Default: Repeat call account escalation',
    'customer.repeat_call.detected',
    [defaultCondition('call_count_7d', 'call_count_in_window', '>=', '3')],
    [
      defaultAction('escalate_repeat_call', 'escalate', 'Repeat call escalation'),
      defaultAction('add_account_watcher', 'add_watcher', 'account'),
    ],
    70,
  ),
  defaultRule(
    'customer_ltv_vip_pin',
    'Default: VIP customer pin',
    'customer.ltv.crossed_threshold',
    [defaultCondition('ltv_gte_1000', 'customer_ltv_gte', '>=', '1000')],
    [
      defaultAction('add_vip_segment', 'segment_add', 'VIP'),
      defaultAction('pin_vip_customer', 'pin_customer', 'VIP customer'),
    ],
  ),
  defaultRule(
    'shopify_first_order_note',
    'Default: First order customer note',
    'shopify.order.created',
    [defaultCondition('first_order', 'order_count_in_window', '=', '1')],
    [defaultAction('add_first_order_note', 'add_note', 'New customer first order')],
  ),
  defaultRule(
    'task_overdue_account_escalation',
    'Default: Overdue task escalation',
    'task.overdue',
    [],
    [
      defaultAction('escalate_overdue_task', 'escalate', 'Overdue task escalation'),
      defaultAction('add_account_watcher', 'add_watcher', 'account'),
    ],
    70,
  ),
  defaultRule(
    'aircall_missed_call_callback_review',
    'Default: Missed call callback',
    'aircall.call.missed',
    [],
    [defaultAction('missed_call_manual_review', 'no-op', 'Missed call requires staff callback review.')],
    70,
  ),
];

@Injectable()
export class RulesService {
  constructor(
    private readonly repository: RulesRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly customers: CustomersService,
    private readonly mail: MailService,
    private readonly support: SupportService,
    private readonly executor: WorkflowExecutorService,
    private readonly prompt: WorkflowPromptService,
    private readonly logger: AppLogger,
  ) {}

  async listRules(): Promise<WorkflowRulesResponse> {
    const rules = await this.repository.list();
    return { rules: rules.map(toDto) };
  }

  async bootstrapDefaults(): Promise<BootstrapWorkflowDefaultsResponse> {
    const existing = await this.repository.list();
    const existingByKey = new Map(existing.flatMap((rule) => {
      const key = defaultRuleKeyFromDefinition(rule.definition);
      return key ? [[key, rule] as const] : [];
    }));
    const existingByName = new Map(existing.map((rule) => [rule.name.trim().toLowerCase(), rule] as const));
    const created: WorkflowRuleDto[] = [];
    const updated: WorkflowRuleDto[] = [];
    const updatedKeys: string[] = [];
    const skippedKeys: string[] = [];

    for (const input of DEFAULT_WORKFLOW_RULES) {
      const key = defaultRuleKeyFromInput(input);
      const matchingRule = existingByKey.get(key) ?? existingByName.get(input.name.trim().toLowerCase());
      if (matchingRule) {
        if (defaultRuleNeedsRefresh(matchingRule.definition, input.definition)) {
          const refreshed = await this.repository.update(matchingRule.id, {
            ...input,
            comment: 'Default workflow rule refreshed',
          }, this.editedByMemberId());
          if (refreshed) {
            updated.push(toDto(refreshed));
            updatedKeys.push(key);
            continue;
          }
        }
        skippedKeys.push(key);
        continue;
      }
      const rule = await this.repository.create(input, this.editedByMemberId());
      created.push(toDto(rule));
    }

    this.logger.log('rules', 'default_rules_bootstrap', 'Default workflow rules bootstrap completed', {
      created: created.length,
      updated: updated.length,
      skipped: skippedKeys.length,
      total_defaults: DEFAULT_WORKFLOW_RULES.length,
      updated_keys: updatedKeys,
      skipped_keys: skippedKeys,
    });

    return {
      created: created.length,
      updated: updated.length,
      skipped: skippedKeys.length,
      totalDefaults: DEFAULT_WORKFLOW_RULES.length,
      rules: [...created, ...updated],
      updatedKeys,
      skippedKeys,
    };
  }

  async getRule(id: string): Promise<WorkflowRuleDto> {
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    return toDto(rule);
  }

  async listRuleVersions(id: string): Promise<WorkflowRuleVersionsResponse> {
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    const versions = await this.repository.listVersions(id);
    return { ruleId: id, versions: versions.map(toVersionDto) };
  }

  async listBackfillReports(id: string): Promise<WorkflowRuleBackfillReportsResponse> {
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    const reports = await this.repository.listBackfillReports(id);
    return { ruleId: id, reports: reports.map(toBackfillReportDto) };
  }

  async listExecutions(id: string): Promise<WorkflowRuleExecutionsResponse> {
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    const tenantId = this.tenantContext.require().tenantId;
    const executions = await this.prisma.db.workflowRuleExecution.findMany({
      where: { tenantId, ruleId: id },
      orderBy: { firstSeenAt: 'desc' },
      take: 50,
    });
    const taskIds = uniqueStrings(executions.flatMap((execution) => execution.taskIds));
    const callEventIds = uniqueStrings(executions.map((execution) => callEventIdFromExecutionEvent(execution.eventId)));
    const [tasks, callEvents] = await Promise.all([
      taskIds.length === 0
        ? []
        : this.prisma.db.serviceRequest.findMany({
            where: { tenantId, id: { in: taskIds } },
            include: {
              customer: true,
              assignedMember: true,
            },
          }),
      callEventIds.length === 0
        ? []
        : this.prisma.db.aircallCallEvent.findMany({
            where: { tenantId, id: { in: callEventIds } },
            select: {
              id: true,
              externalCallId: true,
              contactPhone: true,
              contactPhoneE164: true,
              contactEmail: true,
              transcriptRaw: true,
              resolverStatus: true,
              resolvedAt: true,
            },
          }),
    ]);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const callEventsById = new Map(callEvents.map((event) => [event.id, event]));

    return {
      ruleId: id,
      executions: executions.map((execution) => {
        const result = asRecord(execution.result);
        const eventCallId = callEventIdFromExecutionEvent(execution.eventId);
        const callEvent = eventCallId ? callEventsById.get(eventCallId) ?? null : null;
        return {
          id: execution.id,
          ruleId: execution.ruleId,
          eventId: execution.eventId,
          trigger: execution.trigger as WorkflowTrigger,
          status: execution.status,
          executionMode: executionMode(result),
          source: sourceFromExecution(execution.eventId, result),
          taskIds: execution.taskIds,
          tasks: execution.taskIds.flatMap((taskId) => {
            const task = tasksById.get(taskId);
            return task ? [toExecutionTaskDto(task)] : [];
          }),
          conditionTrace: traceArray<WorkflowConditionTrace>(result.conditionTrace),
          whenTrace: traceArray<WorkflowWhenGroupTrace>(result.whenTrace),
          actionTrace: traceArray<WorkflowActionTrace>(result.actionTrace),
          transcript: callEvent
            ? {
                callEventId: callEvent.id,
                externalCallId: callEvent.externalCallId,
                contactPhone: callEvent.contactPhoneE164 ?? callEvent.contactPhone,
                contactEmail: callEvent.contactEmail,
                resolvedAt: callEvent.resolvedAt?.toISOString() ?? null,
                resolverStatus: callEvent.resolverStatus,
                transcriptSnippet: snippet(callEvent.transcriptRaw),
              }
            : null,
          firstSeenAt: execution.firstSeenAt.toISOString(),
          updatedAt: execution.updatedAt.toISOString(),
        };
      }),
    };
  }

  async activeStats(input: ActiveWorkflowRuleStatsQuery): Promise<ActiveWorkflowRuleStatsResponse> {
    const parsed = activeWorkflowRuleStatsQuerySchema.parse(input);
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - parsed.days * 24 * 60 * 60 * 1000);
    const { rules, executions } = await this.repository.activeStatsRows(windowStart);
    const executionsByRule = new Map<string, typeof executions>();
    for (const execution of executions) {
      const group = executionsByRule.get(execution.ruleId) ?? [];
      group.push(execution);
      executionsByRule.set(execution.ruleId, group);
    }

    const rows = rules.map((row) => {
      const rule = toDto(row);
      const ruleExecutions = executionsByRule.get(rule.id) ?? [];
      const fireCount = ruleExecutions.length;
      const matched = ruleExecutions.filter((execution) => execution.status !== 'skipped' && execution.status !== 'started');
      const latencies = ruleExecutions
        .filter((execution) => execution.status !== 'started')
        .map((execution) => Math.max(0, execution.updatedAt.getTime() - execution.firstSeenAt.getTime()));
      const matchRate = fireCount === 0 ? 0 : Math.round((matched.length / fireCount) * 1000) / 10;
      const avgLatencyMs = averageMs(latencies);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: rule.trigger,
        priority: rule.priority,
        fireCount,
        matchCount: matched.length,
        matchRate,
        taskCreatedCount: ruleExecutions.reduce((sum, execution) => sum + execution.taskIds.length, 0),
        avgLatencyMs,
        lastFiredAt: ruleExecutions[0]?.firstSeenAt.toISOString() ?? null,
        health: ruleHealth(fireCount, matchRate, avgLatencyMs),
      };
    });

    const totalLatencyValues = executions
      .filter((execution) => execution.status !== 'started')
      .map((execution) => Math.max(0, execution.updatedAt.getTime() - execution.firstSeenAt.getTime()));
    const response: ActiveWorkflowRuleStatsResponse = {
      windowDays: parsed.days,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      totals: {
        activeRules: rows.length,
        fireCount: rows.reduce((sum, row) => sum + row.fireCount, 0),
        matchCount: rows.reduce((sum, row) => sum + row.matchCount, 0),
        taskCreatedCount: rows.reduce((sum, row) => sum + row.taskCreatedCount, 0),
        avgLatencyMs: averageMs(totalLatencyValues),
      },
      rows,
    };
    this.logger.log('rules', 'active_stats_read', 'Active workflow rule stats read', {
      window_days: response.windowDays,
      active_rules: response.totals.activeRules,
      fire_count: response.totals.fireCount,
      match_count: response.totals.matchCount,
      avg_latency_ms: response.totals.avgLatencyMs,
    });
    return response;
  }

  async runBackfill(id: string, input: BackfillWorkflowRuleInput): Promise<WorkflowRuleBackfillRunResponse> {
    const parsed = backfillWorkflowRuleSchema.parse(input);
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Workflow rule was not found.');
    const rule = toDto(row);
    this.executor.recognizeTrigger(rule.definition.trigger);

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - parsed.recentDays * 24 * 60 * 60 * 1000);
    const taskCountBefore = await this.prisma.db.serviceRequest.count({ where: {} });
    const candidates = await this.backfillCandidates(rule.definition.trigger, windowStart, windowEnd, parsed.limit);
    const samples: WorkflowRuleBackfillSample[] = [];

    for (const candidate of candidates) {
      samples.push(await this.evaluateBackfillCandidate(rule, candidate));
    }

    const taskCountAfter = await this.prisma.db.serviceRequest.count({ where: {} });
    const actualTasksCreated = Math.max(0, taskCountAfter - taskCountBefore);
    const matchedEvents = samples.filter((sample) => sample.matched).length;
    const wouldCreateTasks = samples.reduce((sum, sample) => sum + sample.wouldCreateTaskCount, 0);
    const finishedAt = new Date();
    const report = await this.repository.createBackfillReport({
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: rule.definition.trigger,
      recentDays: parsed.recentDays,
      status: actualTasksCreated === 0 ? 'completed' : 'failed',
      windowStart,
      windowEnd,
      evaluatedEvents: samples.length,
      matchedEvents,
      skippedEvents: samples.length - matchedEvents,
      wouldCreateTasks,
      actualTasksCreated,
      result: {
        noMutation: actualTasksCreated === 0,
        candidateSource: backfillCandidateSource(rule.definition.trigger),
        sampleLimit: parsed.limit,
        ruleDefinitionHash: ruleDefinitionHash(rule.definition),
        samples,
      } as unknown as Prisma.InputJsonValue,
      createdByMemberId: this.editedByMemberId(),
      finishedAt,
    });

    this.logger.log('rules', 'backfill_completed', 'Workflow rule backfill completed in shadow mode', {
      rule_id: rule.id,
      trigger: rule.definition.trigger,
      recent_days: parsed.recentDays,
      evaluated_events: samples.length,
      matched_events: matchedEvents,
      would_create_tasks: wouldCreateTasks,
      actual_tasks_created: actualTasksCreated,
      report_id: report.id,
    });

    return { report: toBackfillReportDto(report) };
  }

  async fireTrigger(input: WorkflowTriggerFireInput): Promise<WorkflowTriggerFireResponse> {
    const parsed = fireWorkflowTriggerSchema.parse(input);
    this.executor.recognizeTrigger(parsed.trigger);

    const eventId = parsed.eventId ?? `wevt_${randomUUID()}`;
    const rules = await this.repository.findRunnableByTrigger(parsed.trigger);
    const tasks: WorkflowTriggerFireResponse['tasks'] = [];
    const results: WorkflowTriggerFireResponse['results'] = [];

    for (const row of rules) {
      const rule = toDto(row);
      const state = await this.resolveConditionState(parsed.params);
      const whenTrace = await this.resolveWhenGroups(conditionGroups(rule.definition), state);
      const conditionTrace = whenTrace.flatMap((group) => group.conditionTrace);
      const conditionsMatched = whenTrace.every((entry) => entry.matched);
      this.logger.log(
        'rules',
        conditionsMatched ? 'conditions_matched' : 'conditions_not_matched',
        'Workflow rule condition trace evaluated',
        {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          matched: conditionsMatched,
          when_trace: whenTrace,
          condition_trace: conditionTrace,
        },
      );
      if (!conditionsMatched) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'skipped',
          reason: 'conditions_not_matched',
          executionMode: rule.status === 'shadow' ? 'shadow' : 'active',
          taskIds: [],
          conditionTrace,
          whenTrace,
        });
        continue;
      }

      let execution = await this.repository.claimExecution({
        eventId,
        ruleId: rule.id,
        trigger: parsed.trigger,
      });
      let recoveringStaleExecution = false;
      let replayingWorkflowRepairExecution = false;
      if (!execution) {
        const existing = await this.repository.findExecution({ eventId, ruleId: rule.id });
        const stale = await this.staleExecutionRecovery(existing);
        const repairReplay = Boolean(existing)
          && booleanParam(parsed.params, 'forceWorkflowEvaluationRepair')
          && stale.reason !== 'tasks_present'
          && stale.reason !== 'partial_tasks_present';
        if (existing && (stale.reason === 'tasks_present' || stale.reason === 'partial_tasks_present')) {
          this.logger.log('rules', 'event_duplicate_existing_task', 'Duplicate workflow event/rule already has task rows; treating as completed flow.', {
            event_id: eventId,
            trigger: parsed.trigger,
            rule_id: rule.id,
            execution_mode: rule.status === 'shadow' ? 'shadow' : 'active',
            duplicate_reason: stale.reason,
            task_ids: stale.taskIds,
          });
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            status: 'existing_task',
            reason: 'existing_task',
            executionMode: rule.status === 'shadow' ? 'shadow' : 'active',
            shortCircuited: rule.status === 'active' && !rule.composable,
            taskIds: stale.taskIds,
            conditionTrace,
            whenTrace,
          });
          if (rule.status === 'active' && !rule.composable) break;
          continue;
        }
        if (!existing || (!stale.recover && !repairReplay)) {
          this.logger.log('rules', 'event_duplicate_skipped', 'Duplicate workflow event/rule execution skipped', {
            event_id: eventId,
            trigger: parsed.trigger,
            rule_id: rule.id,
            execution_mode: rule.status === 'shadow' ? 'shadow' : 'active',
            short_circuited: rule.status === 'active' && !rule.composable,
            duplicate_reason: stale.reason,
          });
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            status: 'skipped',
            reason: 'duplicate_event',
            executionMode: rule.status === 'shadow' ? 'shadow' : 'active',
            shortCircuited: rule.status === 'active' && !rule.composable,
            taskIds: [],
            conditionTrace,
            whenTrace,
          });
          if (rule.status === 'active' && !rule.composable) break;
          continue;
        }
        execution = existing;
        if (stale.recover) {
          recoveringStaleExecution = true;
          this.logger.warn('rules', 'stale_execution_recovered', 'Workflow execution referenced missing task rows; actions will be replayed.', {
            event_id: eventId,
            trigger: parsed.trigger,
            rule_id: rule.id,
            execution_id: execution.id,
            stale_task_ids: stale.taskIds,
            missing_task_count: stale.missingTaskCount,
          });
        } else {
          replayingWorkflowRepairExecution = true;
          this.logger.warn('rules', 'workflow_repair_execution_replayed', 'Workflow repair is replaying an existing non-task execution result.', {
            event_id: eventId,
            trigger: parsed.trigger,
            rule_id: rule.id,
            execution_id: execution.id,
            previous_status: existing.status,
            duplicate_reason: stale.reason,
          });
        }
      }

      const cooldown = await this.evaluateCooldown(rule, state);
      if (!cooldown.allowed) {
        if (recoveringStaleExecution) {
          this.logger.warn('rules', 'stale_execution_cooldown_bypassed', 'Workflow stale execution recovery bypassed cooldown because the original task row is missing.', {
            event_id: eventId,
            trigger: parsed.trigger,
            rule_id: rule.id,
            customer_id: cooldown.trace.customerId,
            next_eligible_at: cooldown.trace.nextEligibleAt,
          });
        } else {
          this.logger.log('rules', 'cooldown_skipped', 'Workflow rule skipped by per-customer cooldown', {
            event_id: eventId,
            trigger: parsed.trigger,
            rule_id: rule.id,
            customer_id: cooldown.trace.customerId,
            cooldown_hours: cooldown.trace.hours,
            cooldown_limit: cooldown.trace.limit,
            cooldown_count: cooldown.trace.currentCount,
            next_eligible_at: cooldown.trace.nextEligibleAt,
          });
          const cooldownResult: WorkflowTriggerFireResponse['results'][number] = {
            ruleId: rule.id,
            ruleName: rule.name,
            status: 'cooldown_suppressed',
            reason: 'cooldown',
            executionMode: 'active',
            shortCircuited: !rule.composable,
            taskIds: [],
            conditionTrace,
            whenTrace,
            cooldown: cooldown.trace,
          };
          results.push(cooldownResult);
          await this.repository.completeExecution(execution.id, {
            status: cooldownResult.status,
            taskIds: [],
            result: cooldownResult as unknown as Prisma.InputJsonValue,
          });
          if (!rule.composable) break;
          continue;
        }
      }

      if (rule.status === 'shadow') {
        this.logger.log('rules', 'shadow_rule_matched', 'Shadow workflow rule matched without mutating state', {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          when_trace: whenTrace,
          condition_trace: conditionTrace,
        });
        const shadowResult: WorkflowTriggerFireResponse['results'][number] = {
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'shadow_matched',
          executionMode: 'shadow',
          taskIds: [],
          conditionTrace,
          whenTrace,
        };
        results.push(shadowResult);
        await this.repository.completeExecution(execution.id, {
          status: shadowResult.status,
          taskIds: [],
          result: shadowResult as unknown as Prisma.InputJsonValue,
        });
        continue;
      }

      const taskIds: string[] = [];
      const actionTrace: WorkflowActionTrace[] = [];
      for (const action of rule.definition.actions) {
        const applied = await this.applyAction(action, {
          eventId,
          trigger: parsed.trigger,
          source: parsed.source,
          occurredAt: parsed.occurredAt ?? null,
          params: parsed.params,
          rule,
          state,
          conditionTrace,
          whenTrace,
          cooldown: cooldown.trace,
          taskIds,
        });
        actionTrace.push(applied.trace);
        if (applied.task) {
          taskIds.push(applied.task.id);
          tasks.push({
            ruleId: rule.id,
            ruleName: rule.name,
            actionId: action.id,
            action: action.action,
            taskId: applied.task.id,
            title: applied.task.title,
          });
        }
      }

      const actionStatus = resultStatus(taskIds, actionTrace);
      const activeResult: WorkflowTriggerFireResponse['results'][number] = {
        ruleId: rule.id,
        ruleName: rule.name,
        status: actionStatus,
        ...(actionStatus === 'skipped' ? { reason: 'actions_skipped' as const } : {}),
        executionMode: 'active',
        shortCircuited: !rule.composable && actionStatus !== 'skipped',
        taskIds,
        conditionTrace,
        whenTrace,
        cooldown: cooldown.trace,
        actionTrace,
      };
      results.push(activeResult);
      await this.repository.completeExecution(execution.id, {
        status: activeResult.status,
        taskIds,
        result: activeResult as unknown as Prisma.InputJsonValue,
      });
      if (!recoveringStaleExecution && !replayingWorkflowRepairExecution) await this.recordCooldownFire(rule, cooldown, actionStatus);

      if (!rule.composable && actionStatus !== 'skipped') {
        this.logger.log('rules', 'runtime_short_circuit', 'Workflow runtime stopped after non-composable active rule', {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          priority: rule.priority,
        });
        break;
      }
    }

    const matchedResults = results.filter((result) => result.status !== 'skipped');
    const response: WorkflowTriggerFireResponse = {
      eventId,
      trigger: parsed.trigger,
      source: parsed.source,
      matchedRules: matchedResults.length,
      evaluatedRules: results.length,
      tasksCreated: tasks.length,
      tasks,
      results,
      checkedAt: new Date().toISOString(),
    };

    this.logger.log('rules', 'trigger_fired', 'Workflow trigger evaluated active rules', {
      event_id: eventId,
      trigger: parsed.trigger,
      source: parsed.source,
      evaluated_rules: response.evaluatedRules,
      matched_rules: response.matchedRules,
      tasks_created: response.tasksCreated,
    });
    return response;
  }

  private async staleExecutionRecovery(
    execution: Awaited<ReturnType<RulesRepository['findExecution']>>,
  ): Promise<
    | { recover: true; reason: 'missing_task_rows'; taskIds: string[]; missingTaskCount: number }
    | { recover: false; reason: 'execution_not_found' | 'not_task_created' | 'no_task_ids' | 'tasks_present' | 'partial_tasks_present'; taskIds: string[]; missingTaskCount: number }
  > {
    if (!execution) return { recover: false, reason: 'execution_not_found', taskIds: [], missingTaskCount: 0 };
    const taskIds = uniqueStrings(execution.taskIds);
    if (execution.status !== 'task_created') {
      return { recover: false, reason: 'not_task_created', taskIds, missingTaskCount: 0 };
    }
    if (taskIds.length === 0) {
      return { recover: false, reason: 'no_task_ids', taskIds, missingTaskCount: 0 };
    }
    const existingTaskCount = await this.prisma.db.serviceRequest.count({
      where: {
        tenantId: this.tenantId(),
        id: { in: taskIds },
      },
    });
    const missingTaskCount = taskIds.length - existingTaskCount;
    if (existingTaskCount === taskIds.length) {
      return { recover: false, reason: 'tasks_present', taskIds, missingTaskCount };
    }
    if (existingTaskCount > 0) {
      return { recover: false, reason: 'partial_tasks_present', taskIds, missingTaskCount };
    }
    return { recover: true, reason: 'missing_task_rows', taskIds, missingTaskCount };
  }

  private async resolveWhenGroups(
    groups: WorkflowRuleWhenGroup[],
    state: Awaited<ReturnType<RulesService['resolveConditionState']>>,
  ): Promise<WorkflowWhenGroupTrace[]> {
    const traces: WorkflowWhenGroupTrace[] = [];
    for (const group of groups) {
      const conditionTrace = await this.resolveConditions(group.conditions, state);
      traces.push({
        id: group.id,
        matched: conditionTrace.every((entry) => entry.matched),
        conditionTrace,
      });
    }
    return traces;
  }

  private async resolveConditions(
    conditions: WorkflowRuleCondition[],
    state: Awaited<ReturnType<RulesService['resolveConditionState']>>,
  ): Promise<WorkflowConditionTrace[]> {
    if (conditions.length === 0) return [];
    const traces: WorkflowConditionTrace[] = [];
    for (const condition of conditions) {
      const actual = await this.resolveConditionValue(condition.condition, state, condition.value);
      traces.push({
        id: condition.id,
        condition: condition.condition,
        operator: condition.operator,
        expected: condition.value,
        actual: actual.value,
        matched: compareCondition(actual.value, condition.operator, condition.value, condition.confidenceGte),
        source: actual.source,
      });
    }
    return traces;
  }

  private async resolveConditionState(params: Record<string, unknown>) {
    const customer = await this.resolveCustomer(params);
    const callEventId = stringParam(params, 'callEventId') ?? stringParam(params, 'aircallCallEventId');
    const callEvent = callEventId
      ? await this.prisma.db.aircallCallEvent.findFirst({ where: { id: callEventId } })
      : null;
    const resolverOutput = asRecord(callEvent?.resolverOutput);
    return {
      params,
      customer,
      callEvent,
      resolverOutput,
      now: dateParam(params, 'now') ?? new Date(),
    };
  }

  private async evaluateCooldown(
    rule: WorkflowRuleDto,
    state: Awaited<ReturnType<RulesService['resolveConditionState']>>,
  ): Promise<RuleCooldownDecision> {
    const config = normalizeCooldown(rule.definition);
    const customerId = state.customer?.id ?? null;
    const base: Omit<RuleCooldownDecision, 'allowed'> = {
      config,
      customerId,
      existing: null,
      firedAt: state.now,
      trace: cooldownTrace(config, customerId, null, state.now),
    };
    if (rule.status !== 'active' || config.disabled || !customerId) return { ...base, allowed: true };

    const existing = await this.repository.findCooldown(rule.id, customerId);
    const trace = cooldownTrace(config, customerId, existing, state.now);
    const decision = { ...base, existing, trace };
    if (!existing || cooldownExpired(existing.windowStartedAt, state.now, config.hours)) {
      return { ...decision, allowed: true };
    }
    if (existing.fireCount >= config.limit) return { ...decision, allowed: false };
    return { ...decision, allowed: true };
  }

  private async recordCooldownFire(
    rule: WorkflowRuleDto,
    decision: RuleCooldownDecision,
    status: WorkflowTriggerFireResponse['results'][number]['status'],
  ) {
    if (status === 'skipped' || decision.config.disabled || !decision.customerId) return;
    const shouldReset = !decision.existing || cooldownExpired(decision.existing.windowStartedAt, decision.firedAt, decision.config.hours);
    await this.repository.upsertCooldown({
      ruleId: rule.id,
      customerId: decision.customerId,
      windowStartedAt: shouldReset ? decision.firedAt : decision.existing!.windowStartedAt,
      lastFiredAt: decision.firedAt,
      fireCount: shouldReset ? 1 : decision.existing!.fireCount + 1,
    });
  }

  private async resolveCustomer(params: Record<string, unknown>) {
    const customerId = stringParam(params, 'customerId');
    if (customerId) return this.prisma.db.customer.findFirst({ where: { id: customerId } });
    const shopifyCustomerId = stringParam(params, 'shopifyCustomerId');
    if (shopifyCustomerId) return this.prisma.db.customer.findFirst({ where: { shopifyCustomerId } });
    const email = stringParam(params, 'customerEmail') ?? stringParam(params, 'email');
    if (email) return this.prisma.db.customer.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    const phone = stringParam(params, 'customerPhone') ?? stringParam(params, 'phone') ?? stringParam(params, 'contactPhoneE164');
    if (phone) return this.prisma.db.customer.findFirst({ where: { phone: { contains: phone } } });
    return null;
  }

  private async resolveConditionValue(
    condition: WorkflowRuleCondition['condition'],
    state: Awaited<ReturnType<RulesService['resolveConditionState']>>,
    expected: string,
  ): Promise<{ value: unknown; source: string }> {
    const params = state.params;
    if (condition === 'call_intent') {
      return { value: stringParam(params, 'intent') ?? stringParam(params, 'callIntent') ?? state.resolverOutput.call_intent ?? null, source: 'event_or_resolver' };
    }
    if (condition === 'psych_tag_includes') {
      const eventTag = stringParam(params, 'tag');
      if (eventTag) return { value: [eventTag], source: 'event_param' };
      return { value: uniqueStrings([...(arrayParam(params, 'psychTags')), ...(arrayParam(state.resolverOutput, 'psych_tags'))]), source: 'event_or_resolver' };
    }
    if (condition === 'operational_intent') {
      const eventIntent = stringParam(params, 'operationalIntent') ?? stringParam(params, 'intent');
      if (eventIntent) return { value: eventIntent, source: 'event_param' };
      const resolverSignals = Array.isArray(state.resolverOutput.operational_signals)
        ? state.resolverOutput.operational_signals
        : [];
      return {
        value: uniqueStrings(resolverSignals.flatMap((signal) => {
          const row = asRecord(signal);
          const value = stringValue(row.intent);
          return value ? [value] : [];
        })),
        source: 'resolver_output',
      };
    }
    if (condition === 'product_mentioned') {
      return { value: productValues(params, state.resolverOutput), source: 'event_or_resolver' };
    }
    if (condition === 'previous_purchase_includes') {
      if (!state.customer) return { value: [], source: 'commerce_orders' };
      const orders = await this.prisma.db.commerceOrder.findMany({
        where: { customerId: state.customer.id },
        select: { lineItems: true, shopifyOrderNumber: true },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      });
      return { value: orders.flatMap((order) => productValues(asRecord({ lineItems: order.lineItems }), {})), source: 'commerce_orders' };
    }
    if (condition === 'segment_member') {
      if (!state.customer) return { value: false, source: 'segment_memberships' };
      const membership = await this.prisma.db.segmentCustomerMembership.findFirst({
        where: {
          customerId: state.customer.id,
          segment: { OR: [{ id: expected }, { name: { equals: expected, mode: 'insensitive' } }] },
        },
        include: { segment: true },
      });
      return { value: membership ? (membership.segment.name || membership.segmentId) : false, source: 'segment_memberships' };
    }
    if (condition === 'call_count_in_window') {
      const paramCount = numberParam(params, 'count') ?? numberParam(params, 'callCount');
      if (paramCount !== null) return { value: paramCount, source: 'event_params' };
      const days = windowDays(expected);
      const since = new Date(state.now.getTime() - days * 24 * 60 * 60 * 1000);
      const count = state.customer
        ? await this.prisma.db.call.count({ where: { customerId: state.customer.id, createdAt: { gte: since } } })
        : 0;
      return { value: count, source: 'calls' };
    }
    if (condition === 'is_first_call') {
      const param = booleanParam(params, 'isFirstCall');
      if (param !== null) return { value: param, source: 'event_params' };
      const count = state.customer ? await this.prisma.db.call.count({ where: { customerId: state.customer.id } }) : 0;
      return { value: count <= 1, source: 'calls' };
    }
    if (condition === 'customer_ltv_gte') {
      return { value: state.customer ? Number(state.customer.totalSpent) : null, source: 'customers.total_spent' };
    }
    if (condition === 'order_count_in_window') {
      const paramCount = numberParam(params, 'orderCount');
      if (paramCount !== null) return { value: paramCount, source: 'event_params' };
      if (!state.customer) return { value: 0, source: 'commerce_orders' };
      const days = windowDays(expected);
      const since = new Date(state.now.getTime() - days * 24 * 60 * 60 * 1000);
      const count = await this.prisma.db.commerceOrder.count({
        where: { customerId: state.customer.id, OR: [{ processedAt: { gte: since } }, { createdAt: { gte: since } }] },
      });
      return { value: count, source: 'commerce_orders' };
    }
    if (condition === 'last_order_age_lte') {
      if (!state.customer?.lastOrderAt) return { value: null, source: 'customers.last_order_at' };
      return { value: Math.floor((state.now.getTime() - state.customer.lastOrderAt.getTime()) / (24 * 60 * 60 * 1000)), source: 'customers.last_order_at' };
    }
    if (condition === 'open_task_exists_for_intent') {
      const intent = stringParam(params, 'intent') ?? stringParam(params, 'callIntent') ?? expected;
      const rows = await this.prisma.db.serviceRequest.findMany({
        where: {
          ...(state.customer ? { customerId: state.customer.id } : {}),
          status: { notIn: ['closed', 'resolved'] },
        },
        select: { metadata: true },
        take: 100,
      });
      return { value: rows.some((row) => JSON.stringify(row.metadata).includes(intent)), source: 'service_requests' };
    }
    if (condition === 'axis_primary_is') {
      return { value: stringParam(params, 'axisPrimary') ?? stringParam(params, 'assignedMemberId') ?? null, source: 'event_params' };
    }
    if (condition === 'time_of_day_in_range') {
      return { value: `${state.now.getHours().toString().padStart(2, '0')}:${state.now.getMinutes().toString().padStart(2, '0')}`, source: 'server_time' };
    }
    if (condition === 'day_of_week') {
      return { value: dayName(state.now), source: 'server_time' };
    }
    return { value: null, source: 'unknown' };
  }

  private async evaluateBackfillCandidate(
    rule: WorkflowRuleDto,
    candidate: BackfillCandidate,
  ): Promise<WorkflowRuleBackfillSample> {
    const state = await this.resolveConditionState({
      ...candidate.params,
      now: candidate.occurredAt.toISOString(),
    });
    const whenTrace = await this.resolveWhenGroups(conditionGroups(rule.definition), state);
    const conditionTrace = whenTrace.flatMap((group) => group.conditionTrace);
    const conditionsMatched = whenTrace.every((entry) => entry.matched);
    const cooldown = conditionsMatched ? await this.evaluateCooldown(rule, state) : undefined;
    const cooldownSuppressed = conditionsMatched && cooldown && !cooldown.allowed;
    const matched = conditionsMatched;
    return {
      eventId: candidate.eventId,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      occurredAt: candidate.occurredAt.toISOString(),
      customerId: state.customer?.id ?? null,
      matched,
      status: cooldownSuppressed ? 'cooldown_suppressed' : matched ? 'shadow_matched' : 'skipped',
      ...(cooldownSuppressed ? { reason: 'cooldown' as const } : {}),
      ...(!conditionsMatched ? { reason: 'conditions_not_matched' as const } : {}),
      wouldCreateTaskCount: matched && !cooldownSuppressed
        ? rule.definition.actions.filter((action) => action.action === 'create_task').length
        : 0,
      conditionTrace,
      whenTrace,
      ...(cooldown ? { cooldown: cooldown.trace } : {}),
    };
  }

  private async backfillCandidates(
    trigger: WorkflowTriggerFireInput['trigger'],
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    if (trigger === 'call.operational_signal.detected') {
      return this.operationalSignalBackfillCandidates(windowStart, windowEnd, limit);
    }
    if (trigger.includes('order')) {
      return this.orderBackfillCandidates(trigger, windowStart, windowEnd, limit);
    }
    if (trigger.startsWith('aircall.') || trigger.includes('call') || trigger.includes('transcript') || trigger.includes('psych') || trigger.includes('product.detected')) {
      return this.aircallBackfillCandidates(trigger, windowStart, windowEnd, limit);
    }
    if (trigger.startsWith('segment.')) {
      return this.segmentBackfillCandidates(trigger, windowStart, windowEnd, limit);
    }
    if (trigger.startsWith('support.') || trigger.startsWith('task.')) {
      return this.taskBackfillCandidates(trigger, windowStart, windowEnd, limit);
    }
    return this.customerBackfillCandidates(trigger, windowStart, windowEnd, limit);
  }

  private async orderBackfillCandidates(
    trigger: WorkflowTriggerFireInput['trigger'],
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    const orders = await this.prisma.db.commerceOrder.findMany({
      where: {
        tenantId: this.tenantId(),
        OR: [
          { processedAt: { gte: windowStart, lte: windowEnd } },
          { createdAt: { gte: windowStart, lte: windowEnd } },
        ],
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return orders.map((order) => {
      const occurredAt = order.processedAt ?? order.createdAt;
      return {
        eventId: `backfill:${trigger}:${order.id}:${occurredAt.getTime()}`,
        sourceType: 'commerce_order',
        sourceId: order.id,
        occurredAt,
        params: {
          orderId: order.id,
          shopifyOrderId: order.shopifyOrderId,
          shopifyOrderNumber: order.shopifyOrderNumber,
          shopifyCustomerId: order.shopifyCustomerId,
          customerId: order.customerId,
          customerEmail: order.email,
          customerPhone: order.phone,
          totalPrice: Number(order.totalPrice),
          lineItems: order.lineItems,
        },
      };
    });
  }

  private async aircallBackfillCandidates(
    trigger: WorkflowTriggerFireInput['trigger'],
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    const eventFilter = trigger.startsWith('aircall.call.')
      ? { eventType: { contains: trigger.split('.').at(-1) ?? '', mode: 'insensitive' as const } }
      : {};
    const events = await this.prisma.db.aircallCallEvent.findMany({
      where: {
        tenantId: this.tenantId(),
        eventTimestamp: { gte: windowStart, lte: windowEnd },
        ...eventFilter,
      },
      orderBy: { eventTimestamp: 'desc' },
      take: limit,
    });
    return events.map((event) => {
      const resolver = asRecord(event.resolverOutput);
      return {
        eventId: `backfill:${trigger}:${event.id}:${event.eventTimestamp.getTime()}`,
        sourceType: 'aircall_call_event',
        sourceId: event.id,
        occurredAt: event.eventTimestamp,
        params: {
          callEventId: event.id,
          aircallCallEventId: event.id,
          externalCallId: event.externalCallId,
          contactPhone: event.contactPhone,
          contactPhoneE164: event.contactPhoneE164,
          customerPhone: event.contactPhoneE164 ?? event.contactPhone,
          contactEmail: event.contactEmail,
          customerEmail: event.contactEmail,
          intent: stringValue(resolver.call_intent),
          callIntent: stringValue(resolver.call_intent),
          psychTags: stringArray(resolver.psych_tags),
          productMentions: valueArray(resolver.product_mentions),
          urgencyLevel: stringValue(resolver.urgency_level),
          durationSeconds: event.durationSeconds,
        },
      };
    });
  }

  private async operationalSignalBackfillCandidates(
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    const rows = await this.prisma.db.transcriptWorkflowEvaluation.findMany({
      where: {
        tenantId: this.tenantId(),
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => {
      const result = asRecord(row.result);
      const signal = asRecord(result.signal);
      return {
        eventId: `backfill:call.operational_signal.detected:${row.callEventId}:${row.signal}:${row.createdAt.getTime()}`,
        sourceType: 'transcript_workflow_evaluation',
        sourceId: row.id,
        occurredAt: row.createdAt,
        params: {
          callEventId: row.callEventId,
          aircallCallEventId: row.callEventId,
          externalCallId: row.externalCallId,
          operationalIntent: row.signal,
          operationalConfidence: numberValue(signal.confidence),
          actionRequired: row.actionRequired,
          recommendedAxis: row.recommendedAxis,
          suggestedTaskTitle: stringValue(signal.suggested_task_title),
          reason: row.reason,
        },
      };
    });
  }

  private async segmentBackfillCandidates(
    trigger: WorkflowTriggerFireInput['trigger'],
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    const memberships = await this.prisma.db.segmentCustomerMembership.findMany({
      where: {
        tenantId: this.tenantId(),
        matchedAt: { gte: windowStart, lte: windowEnd },
      },
      include: { segment: true },
      orderBy: { matchedAt: 'desc' },
      take: limit,
    });
    return memberships.map((membership) => ({
      eventId: `backfill:${trigger}:${membership.id}:${membership.matchedAt.getTime()}`,
      sourceType: 'segment_customer_membership',
      sourceId: membership.id,
      occurredAt: membership.matchedAt,
      params: {
        customerId: membership.customerId,
        segmentId: membership.segmentId,
        segmentName: membership.segment.name,
      },
    }));
  }

  private async taskBackfillCandidates(
    trigger: WorkflowTriggerFireInput['trigger'],
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    const tasks = await this.prisma.db.serviceRequest.findMany({
      where: {
        tenantId: this.tenantId(),
        OR: [
          { createdAt: { gte: windowStart, lte: windowEnd } },
          { updatedAt: { gte: windowStart, lte: windowEnd } },
          { closedAt: { gte: windowStart, lte: windowEnd } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return tasks.map((task) => ({
      eventId: `backfill:${trigger}:${task.id}:${task.updatedAt.getTime()}`,
      sourceType: 'service_request',
      sourceId: task.id,
      occurredAt: task.closedAt ?? task.updatedAt ?? task.createdAt,
      params: {
        taskId: task.id,
        serviceRequestId: task.id,
        customerId: task.customerId,
        assignedMemberId: task.assignedMemberId,
        intent: stringParam(asRecord(asRecord(task.metadata).workflow), 'trigger') ?? task.source,
      },
    }));
  }

  private async customerBackfillCandidates(
    trigger: WorkflowTriggerFireInput['trigger'],
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<BackfillCandidate[]> {
    const customers = await this.prisma.db.customer.findMany({
      where: {
        tenantId: this.tenantId(),
        OR: [
          { createdAt: { gte: windowStart, lte: windowEnd } },
          { updatedAt: { gte: windowStart, lte: windowEnd } },
          { lastOrderAt: { gte: windowStart, lte: windowEnd } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return customers.map((customer) => ({
      eventId: `backfill:${trigger}:${customer.id}:${customer.updatedAt.getTime()}`,
      sourceType: 'customer',
      sourceId: customer.id,
      occurredAt: customer.updatedAt,
      params: {
        customerId: customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        customerEmail: customer.email,
        email: customer.email,
        customerPhone: customer.phone,
        phone: customer.phone,
        totalSpent: Number(customer.totalSpent),
        orderCount: customer.ordersCount,
      },
    }));
  }

  private async applyAction(action: WorkflowRuleAction, context: {
    eventId: string;
    trigger: WorkflowTriggerFireInput['trigger'];
    source: string;
    occurredAt: string | null;
    params: Record<string, unknown>;
    rule: WorkflowRuleDto;
    state: Awaited<ReturnType<RulesService['resolveConditionState']>>;
    conditionTrace: WorkflowConditionTrace[];
    whenTrace: WorkflowWhenGroupTrace[];
    cooldown: WorkflowCooldownTrace;
    taskIds: string[];
  }): Promise<{ trace: WorkflowActionTrace; task?: { id: string; title: string } }> {
    this.executor.recognizeAction(action.action);
    let result: { trace: WorkflowActionTrace; task?: { id: string; title: string } };

    if (action.action === 'create_task') {
      const taskStateSnapshot = await this.fireTimeStateSnapshot(context.state);
      const assignment = await this.resolveTaskAssignment(context, action);
      const sourceCallId = this.workflowSourceCallId(context);
      const source = this.workflowTaskSource(context, sourceCallId);
      const task = await this.support.create({
        customerId: context.state.customer?.id,
        title: action.value?.trim() || `Workflow task: ${context.rule.name}`,
        description: `Created by workflow rule "${context.rule.name}" for trigger "${context.trigger}".`,
        source,
        surface: 'internal',
        priority: priorityForRule(context.rule.priority),
        axis: assignment.axis,
        assignedMemberId: assignment.assigneeMemberId,
        watcherMemberIds: assignment.watcherMemberIds,
        matchedRuleId: context.rule.id,
        sourceCallId: sourceCallId ?? undefined,
        conditionTrace: context.conditionTrace,
        metadata: this.workflowMetadata(action, context, taskStateSnapshot, assignment),
        taskStateSnapshot,
      });
      result = {
        task: { id: task.id, title: task.title },
        trace: {
          actionId: action.id,
          action: action.action,
          status: 'applied',
          targetType: 'service_request',
          targetId: task.id,
          message: 'Created workflow task from create_task action.',
          metadata: {
            axis: assignment.axis,
            eventType: context.trigger,
            assignedMemberId: assignment.assigneeMemberId,
            watcherMemberIds: assignment.watcherMemberIds,
            matchedRuleId: context.rule.id,
            sourceCallId,
            conditionTraceCount: context.conditionTrace.length,
          },
        },
      };
    } else if (action.action === 'pin_customer') {
      result = await this.pinCustomer(action, context);
    } else if (action.action === 'add_note') {
      result = await this.addCustomerNote(action, context);
    } else if (action.action === 'segment_add') {
      result = await this.addCustomerToSegment(action, context);
    } else if (action.action === 'segment_remove') {
      result = await this.removeCustomerFromSegment(action, context);
    } else if (action.action === 'route_member') {
      result = await this.routeTaskToMember(action, context);
    } else if (action.action === 'route_segment_owner') {
      result = await this.routeTaskToSegmentOwner(action, context);
    } else if (action.action === 'route_call_owner') {
      result = await this.routeTaskToCallOwner(action, context);
    } else if (action.action === 'add_watcher') {
      result = await this.addTaskWatcher(action, context);
    } else if (action.action === 'escalate') {
      result = await this.escalateTask(action, context);
    } else if (action.action === 'send_mail') {
      result = await this.sendMail(action, context);
    } else {
      result = {
        trace: {
          actionId: action.id,
          action: action.action,
          status: 'applied',
          targetType: 'audit',
          message: action.value?.trim() || 'No-op workflow action matched; no state mutation requested.',
        },
      };
    }

    this.logger.log(
      'rules',
      action.action === 'no-op' && result.trace.status === 'applied'
        ? 'workflow_no_op'
        : result.trace.status === 'applied'
          ? 'workflow_action_applied'
          : 'workflow_action_skipped',
      'Workflow action evaluated',
      {
        event_id: context.eventId,
        trigger: context.trigger,
        rule_id: context.rule.id,
        action_id: action.id,
        workflow_action: action.action,
        status: result.trace.status,
        target_type: result.trace.targetType,
        target_id: result.trace.targetId ?? null,
        message: result.trace.message,
      },
    );
    if (result.task) {
      this.logger.log('rules', 'workflow_task_created', 'Workflow rule created a task', {
        event_id: context.eventId,
        trigger: context.trigger,
        rule_id: context.rule.id,
        action_id: action.id,
        task_id: result.task.id,
        axis: result.trace.metadata && 'axis' in result.trace.metadata ? result.trace.metadata.axis : null,
      });
    }
    return result;
  }

  private async sendMail(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const customer = context.state.customer;
    const recipientEmail = stringParam(context.params, 'recipientEmail')
      ?? stringParam(context.params, 'to')
      ?? customer?.email
      ?? stringParam(context.params, 'customerEmail')
      ?? stringParam(context.params, 'email');
    if (!recipientEmail) {
      return skippedTrace(action, 'mail_delivery', 'Recipient email was not available for send_mail.');
    }
    const templateId = stringParam(context.params, 'templateId')
      ?? stringParam(context.params, 'template_id')
      ?? stringParam(context.params, 'mailTemplateId')
      ?? stringParam(context.params, 'mail_template_id')
      ?? action.value?.trim()
      ?? null;
    const delivery = await this.mail.sendWorkflowMail({
      eventKey: `workflow.${context.trigger}`,
      to: recipientEmail,
      templateId,
      customerId: customer?.id ?? null,
      variables: this.workflowMailVariables(context),
      metadata: {
        eventId: context.eventId,
        trigger: context.trigger,
        source: context.source,
        ruleId: context.rule.id,
        ruleName: context.rule.name,
        actionId: action.id,
        actionValue: action.value ?? null,
      },
    });
    this.logger.log('rules', 'workflow_send_mail_queued', 'Workflow send_mail queued a transactional delivery', {
      event_id: context.eventId,
      trigger: context.trigger,
      rule_id: context.rule.id,
      action_id: action.id,
      customer_id: customer?.id ?? null,
      template_id: templateId,
      mail_delivery_id: delivery.id,
    });
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'mail_delivery' as const,
        targetId: delivery.id,
        message: 'send_mail action queued a transactional mail delivery.',
        metadata: {
          sendingEnabled: true,
          providerMode: 'resend',
          customerId: customer?.id ?? null,
          recipientEmail,
          templateId,
        },
      },
    };
  }

  private workflowMailVariables(context: WorkflowActionContext): Record<string, unknown> {
    const customer = context.state.customer;
    return {
      customer: customer
        ? {
            id: customer.id,
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName,
            companyName: customer.companyName,
            totalSpent: Number(customer.totalSpent),
            ordersCount: customer.ordersCount,
            lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
            tags: customer.tags,
          }
        : null,
      workflow: {
        eventId: context.eventId,
        trigger: context.trigger,
        source: context.source,
        occurredAt: context.occurredAt,
        ruleId: context.rule.id,
        ruleName: context.rule.name,
      },
      resolverOutput: pickResolverOutput(context.state.resolverOutput),
    };
  }

  private async resolveTaskAssignment(context: WorkflowActionContext, action?: WorkflowRuleAction): Promise<TaskAssignment> {
    const axis = this.resolveTaskAxis(context, action);
    const explicitAssigneeId = stringParam(context.params, 'assignedMemberId')
      ?? stringParam(context.params, 'assigneeMemberId')
      ?? stringParam(context.params, 'memberId');
    const explicitAssignee = explicitAssigneeId ? await this.findMember(explicitAssigneeId) : null;
    const aircallOperator = !explicitAssignee
      ? await this.resolveAircallOperatorMember(context)
      : null;
    const customerPrimary = !explicitAssignee && !aircallOperator
      ? await this.customers.resolveAxisPrimaryMember(context.state.customer?.id, axis)
      : null;
    const candidates = await this.findAxisPrimaryMembers(axis);
    const candidateMembers = aircallOperator
      ? [aircallOperator, ...candidates.filter((member) => member.id !== aircallOperator.id)]
      : customerPrimary
      ? [customerPrimary.member, ...candidates.filter((member) => member.id !== customerPrimary.member.id)]
      : candidates;
    const assignee = explicitAssignee ?? aircallOperator ?? customerPrimary?.member ?? candidateMembers[0] ?? null;
    const watcherMemberIds = uniqueStrings(candidateMembers.map((member) => member.id))
      .filter((memberId) => memberId !== assignee?.id);
    const assignment: TaskAssignment = {
      axis,
      assigneeMemberId: assignee?.id ?? null,
      watcherMemberIds,
      candidateMemberIds: candidateMembers.map((member) => member.id),
      customerAssignmentId: customerPrimary?.assignmentId ?? null,
      resolutionSource: explicitAssignee ? 'explicit_param' : aircallOperator ? 'aircall_operator' : customerPrimary ? 'customer_axis_primary' : 'axis_primary_role',
    };
    this.logger.log('rules', 'task_assignment_resolved', 'Workflow task assignment resolved', {
      event_id: context.eventId,
      trigger: context.trigger,
      rule_id: context.rule.id,
      axis: assignment.axis,
      customer_id: context.state.customer?.id ?? null,
      assignee_member_id: assignment.assigneeMemberId,
      watcher_member_ids: assignment.watcherMemberIds,
      customer_assignment_id: assignment.customerAssignmentId,
      resolution_source: assignment.resolutionSource,
    });
    return assignment;
  }

  private async resolveAircallOperatorMember(context: WorkflowActionContext) {
    const sourceCallId = this.workflowSourceCallId(context);
    if (!sourceCallId) return null;
    const call = await this.prisma.db.aircallCallEvent.findFirst({
      where: { id: sourceCallId },
      select: { aircallUserId: true },
    });
    if (!call?.aircallUserId) return null;
    const tenantId = this.tenantId();
    const mapped = await this.prisma.db.aircallMemberMap.findFirst({
      where: { tenantId, aircallUserId: call.aircallUserId },
      include: { member: true },
    });
    if (mapped?.member?.status === 'active') return mapped.member;
    return this.prisma.db.member.findFirst({
      where: { tenantId, aircallUserId: call.aircallUserId, status: 'active' },
    });
  }

  private resolveTaskAxis(context: WorkflowActionContext, action?: WorkflowRuleAction): CreateTaskAxis {
    const explicitAxis = createTaskAxisValue(action?.axis);
    if (explicitAxis) return this.executor.requireCreateTaskAxis(explicitAxis);

    const paramAxis = createTaskAxisValue(stringParam(context.params, 'axis'))
      ?? createTaskAxisValue(stringParam(context.params, 'taskAxis'))
      ?? createTaskAxisValue(stringParam(context.params, 'recommendedAxis'));
    if (paramAxis) return this.executor.requireCreateTaskAxis(paramAxis);

    const operationalAxis = axisForActionableOperationalIntent(stringParam(context.params, 'operationalIntent'))
      ?? axisForActionableOperationalIntent(stringParam(context.params, 'intent'))
      ?? axisForActionableOperationalIntent(stringParam(context.params, 'taskIntent'));
    if (operationalAxis) return this.executor.requireCreateTaskAxis(operationalAxis);

    const valueAxis = normalizeTaskAxis(action?.value);
    if (valueAxis === 'support') return this.executor.requireCreateTaskAxis(valueAxis);

    const axis = valueAxis
      ?? normalizeTaskAxis(stringParam(context.params, 'callIntent'))
      ?? normalizeTaskAxis(stringValue(context.state.resolverOutput.call_intent))
      ?? normalizeTaskAxis(context.trigger)
      ?? 'sales';
    return this.executor.requireCreateTaskAxis(axis);
  }

  private async findAxisPrimaryMembers(axis: TaskAxis) {
    const members = await this.prisma.db.member.findMany({
      where: { status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
      orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
    });
    const scored = members
      .map((member) => ({
        member,
        score: axisMemberEmailScore(axis, member.email)
          + axisRoleScore(axis, member.roleAssignments.map((assignment) => assignment.role)),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.member.email.localeCompare(right.member.email));
    const primary = scored.map((entry) => entry.member);
    if (primary.length >= 2) return primary.slice(0, 6);

    const fallback = members.filter((member) => !primary.some((entry) => entry.id === member.id));
    return [...primary, ...fallback].slice(0, 6);
  }

  private async pinCustomer(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const customer = context.state.customer;
    if (!customer) return skippedTrace(action, 'customer', 'No customer was resolved for pin_customer.');
    const pinTag = action.value?.trim() ? `workflow:pin:${slug(action.value)}` : 'workflow:pinned';
    const tags = uniqueStrings([...customer.tags, 'workflow:pinned', pinTag]);
    await this.prisma.db.customer.updateMany({ where: { id: customer.id }, data: { tags: { set: tags } } });
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'customer' as const,
        targetId: customer.id,
        message: 'Pinned customer with workflow tag.',
        metadata: { tags },
      },
    };
  }

  private async addCustomerNote(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const customer = context.state.customer;
    if (!customer) return skippedTrace(action, 'customer', 'No customer was resolved for add_note.');
    const note = action.value?.trim() || `Workflow note from ${context.rule.name}`;
    const line = `[${new Date().toISOString()}] workflow ${context.eventId}: ${note}`;
    await this.prisma.db.customer.updateMany({
      where: { id: customer.id },
      data: { note: [customer.note?.trim(), line].filter(Boolean).join('\n') },
    });
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'customer' as const,
        targetId: customer.id,
        message: 'Added workflow note to customer.',
      },
    };
  }

  private async addCustomerToSegment(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const customer = context.state.customer;
    if (!customer) return skippedTrace(action, 'segment_membership', 'No customer was resolved for segment_add.');
    const segment = await this.findSegment(action.value || stringParam(context.params, 'segmentId') || stringParam(context.params, 'segmentName'));
    if (!segment) return skippedTrace(action, 'segment_membership', 'Segment target was not found.');
    const tenantId = this.tenantId();
    await this.prisma.db.segmentCustomerMembership.upsert({
      where: { tenantId_segmentId_customerId: { tenantId, segmentId: segment.id, customerId: customer.id } },
      create: { id: prefixedId('smem'), tenantId, segmentId: segment.id, customerId: customer.id, score: 1 },
      update: { matchedAt: new Date(), score: 1 },
    });
    await this.refreshSegmentCount(segment.id);
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'segment_membership' as const,
        targetId: segment.id,
        message: 'Added customer to segment.',
        metadata: { customerId: customer.id, segmentName: segment.name },
      },
    };
  }

  private async removeCustomerFromSegment(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const customer = context.state.customer;
    if (!customer) return skippedTrace(action, 'segment_membership', 'No customer was resolved for segment_remove.');
    const segment = await this.findSegment(action.value || stringParam(context.params, 'segmentId') || stringParam(context.params, 'segmentName'));
    if (!segment) return skippedTrace(action, 'segment_membership', 'Segment target was not found.');
    const deleted = await this.prisma.db.segmentCustomerMembership.deleteMany({
      where: { segmentId: segment.id, customerId: customer.id },
    });
    await this.refreshSegmentCount(segment.id);
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'segment_membership' as const,
        targetId: segment.id,
        message: 'Removed customer from segment.',
        metadata: { customerId: customer.id, deleted: deleted.count, segmentName: segment.name },
      },
    };
  }

  private async routeTaskToMember(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const taskId = this.targetTaskId(context);
    if (!taskId) return skippedTrace(action, 'service_request', 'No service request target was available for route_member.');
    const member = await this.findMember(action.value || stringParam(context.params, 'memberId') || stringParam(context.params, 'assignedMemberId'));
    if (!member) return skippedTrace(action, 'member', 'Member target was not found.');
    const updated = await this.prisma.db.serviceRequest.updateMany({ where: { id: taskId }, data: { assignedMemberId: member.id } });
    if (updated.count === 0) return skippedTrace(action, 'service_request', 'Service request target was not found for route_member.');
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'service_request' as const,
        targetId: taskId,
        message: 'Routed service request to member.',
        metadata: { memberId: member.id, email: member.email },
      },
    };
  }

  private async routeTaskToSegmentOwner(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const taskId = this.targetTaskId(context);
    if (!taskId) return skippedTrace(action, 'service_request', 'No service request target was available for route_segment_owner.');
    const customerId = context.state.customer?.id ?? null;
    if (!customerId) return skippedTrace(action, 'customer', 'Customer target was not resolved for segment owner routing.');
    const segmentNameOrId = action.value.trim();
    const membership = await this.prisma.db.segmentCustomerMembership.findFirst({
      where: {
        customerId,
        ...(segmentNameOrId
          ? {
              segment: {
                OR: [
                  { id: segmentNameOrId },
                  { name: { equals: segmentNameOrId, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        segment: {
          include: {
            ownerships: {
              include: { member: true },
              orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ score: 'desc' }, { matchedAt: 'desc' }],
    });
    const owner = membership?.segment.ownerships.find((row) => row.member.status === 'active') ?? null;
    if (!membership || !owner) return skippedTrace(action, 'member', 'No active segment owner was found for this customer.');
    const updated = await this.prisma.db.serviceRequest.updateMany({
      where: { id: taskId },
      data: { assignedMemberId: owner.memberId },
    });
    if (updated.count === 0) return skippedTrace(action, 'service_request', 'Service request target was not found for route_segment_owner.');
    await this.updateTaskWorkflow(taskId, (workflow) => ({
      ...workflow,
      assigneeResolution: {
        ...asRecord(workflow.assigneeResolution),
        source: 'segment_owner',
        segmentId: membership.segmentId,
        segmentName: membership.segment.name,
        assigneeMemberId: owner.memberId,
      },
      routeEvents: [
        ...recordArray(workflow.routeEvents),
        { memberId: owner.memberId, segmentId: membership.segmentId, eventId: context.eventId, at: new Date().toISOString(), source: 'segment_owner' },
      ],
    }));
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'service_request' as const,
        targetId: taskId,
        message: 'Routed service request to segment owner.',
        metadata: {
          memberId: owner.memberId,
          email: owner.member.email,
          segmentId: membership.segmentId,
          segmentName: membership.segment.name,
        },
      },
    };
  }

  private async routeTaskToCallOwner(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const taskId = this.targetTaskId(context);
    if (!taskId) return skippedTrace(action, 'service_request', 'No service request target was available for route_call_owner.');
    const member = await this.resolveAircallOperatorMember(context);
    if (!member) return skippedTrace(action, 'member', 'No active Aircall call owner was resolved for route_call_owner.');
    const updated = await this.prisma.db.serviceRequest.updateMany({
      where: { id: taskId },
      data: { assignedMemberId: member.id },
    });
    if (updated.count === 0) return skippedTrace(action, 'service_request', 'Service request target was not found for route_call_owner.');
    await this.updateTaskWorkflow(taskId, (workflow) => ({
      ...workflow,
      assigneeResolution: {
        ...asRecord(workflow.assigneeResolution),
        source: 'aircall_operator',
        assigneeMemberId: member.id,
      },
      routeEvents: [
        ...recordArray(workflow.routeEvents),
        { memberId: member.id, eventId: context.eventId, at: new Date().toISOString(), source: 'aircall_operator' },
      ],
    }));
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'service_request' as const,
        targetId: taskId,
        message: 'Routed service request to Aircall call owner.',
        metadata: { memberId: member.id, email: member.email },
      },
    };
  }

  private async addTaskWatcher(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const taskId = this.targetTaskId(context);
    if (!taskId) return skippedTrace(action, 'service_request', 'No service request target was available for add_watcher.');
    let member = await this.findMember(action.value || stringParam(context.params, 'watcherMemberId') || stringParam(context.params, 'memberId'));
    if (!member) {
      const axis = normalizeTaskAxis(action.value);
      member = axis ? (await this.findAxisPrimaryMembers(axis))[0] ?? null : null;
    }
    if (!member) return skippedTrace(action, 'member', 'Member target was not found.');
    const updated = await this.updateTaskWorkflow(taskId, (workflow) => ({
      ...workflow,
      watchers: uniqueStrings([...arrayParam(workflow, 'watchers'), member.id]),
      watcherEvents: [...recordArray(workflow.watcherEvents), { memberId: member.id, eventId: context.eventId, at: new Date().toISOString() }],
    }));
    if (!updated) return skippedTrace(action, 'service_request', 'Service request target was not found for add_watcher.');
    await this.support.addWatcher(taskId, member.id, 'workflow_action');
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'service_request' as const,
        targetId: taskId,
        message: 'Added member watcher to service request participant table.',
        metadata: { memberId: member.id, email: member.email },
      },
    };
  }

  private async escalateTask(action: WorkflowRuleAction, context: WorkflowActionContext) {
    const taskId = this.targetTaskId(context);
    if (!taskId) return skippedTrace(action, 'service_request', 'No service request target was available for escalate.');
    const updated = await this.updateTaskWorkflow(taskId, (workflow) => ({
      ...workflow,
      escalated: true,
      escalationReason: action.value?.trim() || 'Workflow escalation',
      escalationEvents: [...recordArray(workflow.escalationEvents), { eventId: context.eventId, at: new Date().toISOString() }],
    }), { priority: 'critical' });
    if (!updated) return skippedTrace(action, 'service_request', 'Service request target was not found for escalate.');
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'service_request' as const,
        targetId: taskId,
        message: 'Escalated service request priority and workflow metadata.',
      },
    };
  }

  private async fireTimeStateSnapshot(state: WorkflowActionContext['state']) {
    const base = fireTimeStateSnapshot(state);
    if (!state.customer) {
      return { ...base, segment: null, segments: [], recent_orders: [] };
    }

    const [memberships, recentOrders] = await Promise.all([
      this.prisma.db.segmentCustomerMembership.findMany({
        where: { customerId: state.customer.id },
        include: { segment: true },
        orderBy: [{ matchedAt: 'desc' }, { updatedAt: 'desc' }],
        take: 20,
      }),
      this.prisma.db.commerceOrder.findMany({
        where: { customerId: state.customer.id },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
    ]);

    const segments = memberships.map((membership) => ({
      id: membership.segment.id,
      name: membership.segment.name,
      color: membership.segment.color,
      priority: membership.segment.priority,
      priorityGlobal: membership.segment.priorityGlobal,
      score: membership.score === null ? null : Number(membership.score),
      matchedAt: membership.matchedAt.toISOString(),
      isActive: membership.segment.isActive,
    }));

    return {
      ...base,
      segment: segments[0] ?? null,
      segments,
      recent_orders: recentOrders.map((order) => ({
        id: order.id,
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderNumber: order.shopifyOrderNumber,
        totalPrice: Number(order.totalPrice),
        currency: order.currency,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        processedAt: order.processedAt?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        lineItems: order.lineItems,
      })),
    };
  }

  private workflowMetadata(
    action: WorkflowRuleAction,
    context: WorkflowActionContext,
    taskStateSnapshot: Record<string, unknown>,
    assignment: TaskAssignment,
  ) {
    const aiSource = this.workflowAiSource(context);
    const sourceCallId = this.workflowSourceCallId(context);
    return {
      category: 'workflow_rule',
      ...(aiSource ? { aiSource } : {}),
      workflow: {
        eventId: context.eventId,
        trigger: context.trigger,
        source: context.source,
        occurredAt: context.occurredAt,
        sourceCallId,
        params: context.params,
        ruleId: context.rule.id,
        matchedRuleId: context.rule.id,
        matched_rule_id: context.rule.id,
        ruleName: context.rule.name,
        actionId: action.id,
        action: action.action,
        rulePriority: context.rule.priority,
        axis: assignment.axis,
        assigneeResolution: {
          source: assignment.resolutionSource,
          assigneeMemberId: assignment.assigneeMemberId,
          watcherMemberIds: assignment.watcherMemberIds,
          candidateMemberIds: assignment.candidateMemberIds,
          customerAssignmentId: assignment.customerAssignmentId,
        },
        watchers: assignment.watcherMemberIds,
        conditionTrace: context.conditionTrace,
        whenTrace: context.whenTrace,
        cooldown: context.cooldown,
        stateSnapshot: taskStateSnapshot,
      },
    };
  }

  private workflowSourceCallId(context: WorkflowActionContext) {
    return stringParam(context.params, 'callId')
      ?? stringParam(context.params, 'callEventId')
      ?? stringParam(context.params, 'aircallCallEventId')
      ?? stringParam(context.params, 'externalCallId')
      ?? null;
  }

  private workflowTaskSource(context: WorkflowActionContext, sourceCallId: string | null): 'admin_created' {
    void context;
    void sourceCallId;
    return 'admin_created';
  }

  private workflowAiSource(context: WorkflowActionContext) {
    const trigger = context.trigger;
    if (trigger.startsWith('aircall.')
      || trigger.includes('transcript')
      || context.source.includes('aircall')
      || context.source.includes('transcript')
      || [
        'call_intent.classified',
        'psych.tag.detected',
        'product.detected_in_transcript',
        'customer.matched_from_transcript',
        'psych.analysis.completed',
        'call.operational_signal.detected',
        'customer.repeat_call.detected',
        'customer.first_call.detected',
      ].includes(trigger)) {
      return 'transcript';
    }
    if (trigger.startsWith('segment.')) return 'segment';
    return null;
  }

  private targetTaskId(context: WorkflowActionContext) {
    return context.taskIds.at(-1)
      ?? stringParam(context.params, 'taskId')
      ?? stringParam(context.params, 'serviceRequestId')
      ?? null;
  }

  private async findSegment(raw: string | null) {
    const target = raw?.trim();
    if (!target) return null;
    return this.prisma.db.segment.findFirst({
      where: {
        OR: [
          { id: target },
          { name: { equals: target, mode: 'insensitive' } },
        ],
      },
    });
  }

  private async findMember(raw: string | null) {
    const target = raw?.trim() || this.tenantContext.get()?.principalId || '';
    if (!target) return null;
    return this.prisma.db.member.findFirst({
      where: {
        status: 'active',
        OR: [
          { id: target },
          { email: { equals: target, mode: 'insensitive' } },
        ],
      },
    });
  }

  private async refreshSegmentCount(segmentId: string) {
    const count = await this.prisma.db.segmentCustomerMembership.count({ where: { segmentId } });
    await this.prisma.db.segment.updateMany({ where: { id: segmentId }, data: { customerCount: count, lastEvaluatedAt: new Date() } });
  }

  private async updateTaskWorkflow(
    taskId: string,
    update: (workflow: Record<string, unknown>) => Record<string, unknown>,
    data: Prisma.ServiceRequestUncheckedUpdateManyInput = {},
  ) {
    const task = await this.prisma.db.serviceRequest.findFirst({ where: { id: taskId }, select: { metadata: true } });
    if (!task) return false;
    const metadata = asRecord(task.metadata);
    const workflow = asRecord(metadata.workflow);
    await this.prisma.db.serviceRequest.updateMany({
      where: { id: taskId },
      data: {
        ...data,
        metadata: {
          ...metadata,
          workflow: update(workflow),
        } as Prisma.InputJsonValue,
      },
    });
    return true;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }

  async createRule(input: SaveWorkflowRuleInput): Promise<WorkflowRuleDto> {
    const parsed = saveWorkflowRuleSchema.parse(input);
    this.validateWorkflowTaskContract(parsed.definition);
    const rule = await this.repository.create(parsed, this.editedByMemberId());
    this.logger.log('rules', 'rule_saved', 'Workflow rule persisted with version audit', {
      rule_id: rule.id,
      status: rule.status,
      trigger: rule.trigger,
      priority: rule.priority,
      version_no: 1,
    });
    return toDto(rule);
  }

  async updateRule(id: string, input: SaveWorkflowRuleInput): Promise<WorkflowRuleDto> {
    const parsed = saveWorkflowRuleSchema.parse(input);
    this.validateWorkflowTaskContract(parsed.definition);
    const rule = await this.repository.update(id, parsed, this.editedByMemberId());
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    this.logger.log('rules', 'rule_saved', 'Workflow rule persisted with version audit', {
      rule_id: rule.id,
      status: rule.status,
      trigger: rule.trigger,
      priority: rule.priority,
    });
    return toDto(rule);
  }

  async rollbackRule(id: string, input: RollbackWorkflowRuleInput): Promise<WorkflowRuleDto> {
    const parsed = rollbackWorkflowRuleSchema.parse(input);
    const rule = await this.repository.rollback(id, parsed.versionNo, this.editedByMemberId(), parsed.comment);
    if (!rule) throw new NotFoundException('Workflow rule version was not found.');
    this.logger.log('rules', 'rule_rollback', 'Workflow rule rolled back to an audited version', {
      rule_id: rule.id,
      rollback_version_no: parsed.versionNo,
      status: rule.status,
      trigger: rule.trigger,
    });
    return toDto(rule);
  }

  catalog(): WorkflowEnumCatalogResponse {
    return {
      version: WORKFLOW_ENUM_CATALOG.version,
      generatedAt: new Date().toISOString(),
      psychTags: [...WORKFLOW_ENUM_CATALOG.psychTags],
      callIntents: [...WORKFLOW_ENUM_CATALOG.callIntents],
      operationalIntents: WORKFLOW_ENUM_CATALOG.operationalIntents.map((entry) => ({
        ...entry,
        keywords: [...entry.keywords],
        examples: [...entry.examples],
      })),
      urgencyLevels: [...WORKFLOW_ENUM_CATALOG.urgencyLevels],
      createTaskAxes: [...WORKFLOW_ENUM_CATALOG.createTaskAxes],
      serviceRequestSources: [...WORKFLOW_ENUM_CATALOG.serviceRequestSources],
      triggers: [...WORKFLOW_ENUM_CATALOG.triggers],
      triggerGroups: Object.fromEntries(
        Object.entries(WORKFLOW_ENUM_CATALOG.triggerGroups).map(([family, values]) => [family, [...values]]),
      ),
      conditions: [...WORKFLOW_ENUM_CATALOG.conditions],
      actions: [...WORKFLOW_ENUM_CATALOG.actions],
      counts: { ...WORKFLOW_ENUM_CATALOG.counts },
    };
  }

  async mcpCapabilities(): Promise<WorkflowMcpCapabilitiesResponse> {
    const productLanguage = await this.shopifyProductLanguage();
    return {
      catalogVersion: WORKFLOW_ENUM_CATALOG.version,
      tools: [
        { name: 'list_workflow_capabilities', description: 'List allowed triggers, conditions, actions, axes, and operational intents.', mutates: false, requiresPermission: 'settings.read' },
        { name: 'draft_workflow_rule', description: 'Compile a natural-language sales/personnel goal into a draft workflow rule.', mutates: false, requiresPermission: 'settings.read' },
        { name: 'validate_workflow_rule', description: 'Validate a workflow rule against the safe deterministic DSL.', mutates: false, requiresPermission: 'settings.read' },
        { name: 'simulate_workflow_rule', description: 'Dry-run a stored or draft workflow rule against recent operational signals.', mutates: false, requiresPermission: 'settings.read' },
        { name: 'create_workflow_rule_draft', description: 'Persist a validated rule as draft only.', mutates: true, requiresPermission: 'settings.write' },
        { name: 'publish_workflow_rule', description: 'Publish a stored rule only after an attached successful simulation report.', mutates: true, requiresPermission: 'settings.write' },
      ],
      safeguards: [
        'Claude never executes workflow actions directly; it only drafts the deterministic workflow DSL.',
        'MCP-authored rules are limited to call.operational_signal.detected and must include an operational_intent condition.',
        'Rule-created tasks can target only sales or account axes.',
        'Task routing, watcher, and escalation actions must follow create_task in the same rule.',
        'Create-task assignment resolves explicit member, Aircall call owner, customer axis primary, then axis primary role in that order.',
        'route_call_owner can explicitly bind a created task to the Aircall operator for the transcript event.',
        'Automatic customer request/support case creation is not a supported action.',
        'Publish requires a stored rule and a recent simulation/backfill report for that rule.',
        'Unsupported actions such as send_mail or segment removal are rejected for MCP-authored rules.',
      ],
      allowed: {
        triggers: MCP_ALLOWED_TRIGGERS,
        conditions: WORKFLOW_ENUM_CATALOG.conditions.map((entry) => entry.value),
        actions: MCP_ALLOWED_ACTIONS,
        createTaskAxes: WORKFLOW_ENUM_CATALOG.createTaskAxes.map((entry) => entry.value),
        operationalIntents: WORKFLOW_ENUM_CATALOG.operationalIntents.map((entry) => entry.value),
      },
      registry: {
        operationalIntents: OPERATIONAL_INTENT_REGISTRY.map((entry) => ({
          value: entry.value,
          label: entry.label,
          defaultAxis: entry.defaultAxis,
          expectedOutcome: entry.expectedOutcome,
          taskTitle: entry.taskTitle,
          keywords: [...entry.keywords],
          examples: [...entry.examples],
        })),
        conditions: WORKFLOW_ENUM_CATALOG.conditions.map((entry) => ({ ...entry })),
        actions: WORKFLOW_ENUM_CATALOG.actions.map((entry) => ({ ...entry })),
        productLanguage,
      },
      examples: [
        'Create a high-priority sales task when a fifth call in 30 days is angry and mentions a heat press product.',
        'Route DTF supply reorder signals to the segment owner only when the previous purchase includes the same Shopify product family.',
        'Create account follow-up tasks for financing questions and keep duplicate open-task guards on.',
      ],
    };
  }

  private async shopifyProductLanguage(): Promise<WorkflowMcpCapabilitiesResponse['registry']['productLanguage']> {
    const tenantId = this.tenantId();
    const products = await this.prisma.db.catalogProduct.findMany({
      where: { tenantId, status: { not: 'archived' } },
      select: {
        id: true,
        title: true,
        handle: true,
        vendor: true,
        productType: true,
        tags: true,
        variants: {
          select: { sku: true, title: true },
          orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
          take: 12,
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 80,
    });

    return products.map((product) => {
      const variantSkus = uniqueStrings(product.variants.map((variant) => variant.sku));
      const aliases = productLanguageAliases([
        product.title,
        product.handle,
        product.handle?.replace(/-/g, ' '),
        product.vendor,
        product.productType,
        ...product.tags,
        ...product.variants.flatMap((variant) => [
          variant.sku,
          variant.title,
          `${product.title} ${variant.title}`,
        ]),
      ]);
      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        productType: product.productType,
        vendor: product.vendor,
        tags: [...product.tags],
        variantSkus,
        aliases,
        source: 'shopify_catalog' as const,
      };
    });
  }

  async draftWorkflowRuleFromMcp(input: WorkflowMcpDraftRuleInput): Promise<WorkflowMcpDraftRuleResponse> {
    const parsed = workflowMcpDraftRuleSchema.parse(input);
    return this.compileNaturalLanguageRule(parsed.naturalLanguageGoal, parsed.preferredStatus);
  }

  validateWorkflowRuleFromMcp(input: WorkflowMcpValidateRuleInput): WorkflowMcpValidateRuleResponse {
    const parsed = workflowMcpValidateRuleSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, issues: parsed.error.issues.map((issue) => issue.message), normalizedRule: null };
    }
    const issues = this.mcpRuleIssues(parsed.data.rule);
    return { ok: issues.length === 0, issues, normalizedRule: issues.length === 0 ? parsed.data.rule : null };
  }

  async simulateWorkflowRuleFromMcp(input: WorkflowMcpSimulateRuleInput): Promise<WorkflowMcpSimulateRuleResponse> {
    const parsed = workflowMcpSimulateRuleSchema.parse(input);
    if (parsed.ruleId) {
      const report = await this.runBackfill(parsed.ruleId, { recentDays: parsed.recentDays, limit: parsed.limit });
      return {
        mode: 'stored_rule',
        ruleId: parsed.ruleId,
        reportId: report.report.id,
        recentDays: parsed.recentDays,
        evaluatedEvents: report.report.evaluatedEvents,
        matchedEvents: report.report.matchedEvents,
        wouldCreateTasks: report.report.wouldCreateTasks,
        samples: report.report.result.samples,
        warnings: report.report.actualTasksCreated > 0 ? ['Backfill attempted mutation; report is not publish-safe.'] : [],
      };
    }
    const rule = saveWorkflowRuleSchema.parse(parsed.rule);
    const issues = this.mcpRuleIssues(rule);
    if (issues.length > 0) throw new BadRequestException(`MCP rule is not valid: ${issues.join('; ')}`);
    const now = new Date();
    const windowStart = new Date(now.getTime() - parsed.recentDays * 24 * 60 * 60 * 1000);
    const dto = transientRuleDto(rule);
    const candidates = await this.backfillCandidates(dto.definition.trigger, windowStart, now, parsed.limit);
    const samples = await Promise.all(candidates.map((candidate) => this.evaluateBackfillCandidate(dto, candidate)));
    return {
      mode: 'draft_rule',
      ruleId: null,
      reportId: null,
      recentDays: parsed.recentDays,
      evaluatedEvents: samples.length,
      matchedEvents: samples.filter((sample) => sample.matched).length,
      wouldCreateTasks: samples.reduce((sum, sample) => sum + sample.wouldCreateTaskCount, 0),
      samples,
      warnings: ['Draft simulation is not publish proof. Persist the draft, then simulate the stored rule before publishing.'],
    };
  }

  async createWorkflowRuleDraftFromMcp(input: WorkflowMcpCreateDraftRuleInput): Promise<WorkflowMcpCreateDraftRuleResponse> {
    const parsed = workflowMcpCreateDraftRuleSchema.parse(input);
    const ruleInput: SaveWorkflowRuleInput = {
      ...parsed.rule,
      definition: {
        ...parsed.rule.definition,
        status: 'draft',
        metadata: {
          ...(parsed.rule.definition.metadata ?? {}),
          authoringSurface: 'mcp',
          ...(parsed.sourceGoal ? { sourceGoal: parsed.sourceGoal } : {}),
        },
      },
      comment: parsed.rule.comment ?? 'Created as MCP workflow draft',
    };
    const issues = this.mcpRuleIssues(ruleInput);
    if (issues.length > 0) throw new BadRequestException(`MCP rule is not valid: ${issues.join('; ')}`);
    const created = await this.repository.create(ruleInput, this.editedByMemberId());
    return { rule: toDto(created), warnings: ['Rule is stored as draft. Run simulate_workflow_rule before publishing.'] };
  }

  async publishWorkflowRuleFromMcp(input: WorkflowMcpPublishRuleInput): Promise<WorkflowMcpPublishRuleResponse> {
    const parsed = workflowMcpPublishRuleSchema.parse(input);
    const rule = await this.repository.findById(parsed.ruleId);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    const dto = toDto(rule);
    const issues = this.mcpRuleIssues({ name: dto.name, definition: dto.definition });
    if (issues.length > 0) throw new BadRequestException(`MCP rule cannot be published: ${issues.join('; ')}`);
    const report = await this.prisma.db.workflowRuleBackfillReport.findFirst({
      where: { id: parsed.backfillReportId, ruleId: parsed.ruleId, status: 'completed' },
    });
    if (!report) throw new BadRequestException('A completed simulation/backfill report is required before publishing.');
    const maxAgeMs = 24 * 60 * 60 * 1000;
    if (Date.now() - report.createdAt.getTime() > maxAgeMs) throw new BadRequestException('Simulation report is stale; run simulate_workflow_rule again.');
    if (report.actualTasksCreated !== 0) throw new BadRequestException('Simulation report is not publish-safe because it mutated live tasks.');
    const reportResult = backfillResult(report.result);
    if (!reportResult.ruleDefinitionHash || reportResult.ruleDefinitionHash !== ruleDefinitionHash(dto.definition)) {
      throw new BadRequestException('Simulation report does not match the current rule definition; run simulate_workflow_rule again.');
    }
    const updated = await this.repository.update(parsed.ruleId, {
      name: dto.name,
      definition: {
        ...dto.definition,
        status: 'active',
        metadata: {
          ...(dto.definition.metadata ?? {}),
          authoringSurface: 'mcp',
          publishedFromReportId: report.id,
        },
      },
      comment: parsed.comment ?? `Published from MCP after simulation ${report.id}`,
    }, this.editedByMemberId());
    if (!updated) throw new NotFoundException('Workflow rule was not found.');
    return { rule: toDto(updated), reportId: report.id, publishedAt: new Date().toISOString() };
  }

  private async compileNaturalLanguageRule(
    naturalLanguageGoal: string,
    preferredStatus: WorkflowRuleDefinition['status'],
  ): Promise<WorkflowMcpDraftRuleResponse> {
    const text = normalizeHumanText(naturalLanguageGoal);
    const detectedIntent = detectOperationalIntent(text);
    const unsupported = unsupportedMcpRequests(text);
    const productLanguage = await this.shopifyProductLanguage();
    const warnings: string[] = [];
    const assumptions: string[] = [];
    const requestedActive = preferredStatus === 'active';
    const status = requestedActive ? 'draft' : preferredStatus;
    if (requestedActive) warnings.push('Rules drafted through MCP are stored as draft first; publish requires simulation.');
    const conditionPlan = compileMcpConditions(text, detectedIntent, productLanguage);
    warnings.push(...conditionPlan.warnings);
    assumptions.push(...conditionPlan.assumptions);
    const axis = axisForOperationalIntent(detectedIntent);
    const priority = priorityFromGoal(text, conditionPlan);
    const actions: WorkflowRuleAction[] = detectedIntent === 'no_action'
      ? [mcpAction('audit_no_action', 'no-op', 'No actionable sales or personnel follow-up.')]
      : [mcpAction('create_task', 'create_task', taskTitleForMcpGoal(detectedIntent, text), axis)];

    const wantsCallOwner = mentionsCallOwner(text);
    const wantsSegmentOwner = mentionsSegmentOwner(text);
    const member = wantsCallOwner || wantsSegmentOwner ? null : await this.resolveMentionedMember(naturalLanguageGoal);
    if (wantsCallOwner) {
      if (detectedIntent !== 'no_action') actions.push(mcpAction('route_call_owner', 'route_call_owner', ''));
      assumptions.push('Assignee will resolve to the Aircall call owner for the transcript event.');
    } else if (wantsSegmentOwner) {
      actions.push(mcpAction('route_segment_owner', 'route_segment_owner', ''));
      assumptions.push('Assignee will be resolved from the customer segment owner at runtime.');
    } else if (member) {
      actions.push(mcpAction('route_named_member', 'route_member', member.email));
      assumptions.push(`Named assignee resolved to ${member.email}.`);
    } else {
      assumptions.push('Assignee will default to call owner, customer axis primary, or axis primary role at runtime.');
    }

    if (mentionsNote(text)) actions.push(mcpAction('add_customer_note', 'add_note', noteValueForGoal(naturalLanguageGoal)));
    if (mentionsPin(text)) actions.push(mcpAction('pin_customer', 'pin_customer', `Pinned by rule: ${labelFromIntent(detectedIntent)}`));
    if (shouldAddWatcher(text, conditionPlan) && detectedIntent !== 'no_action') {
      actions.push(mcpAction('add_axis_watcher', 'add_watcher', axis));
      assumptions.push(`A ${axis} axis watcher will be attached when the task is created.`);
    }
    if (shouldEscalate(text, conditionPlan) && detectedIntent !== 'no_action') {
      actions.push(mcpAction('escalate_repeat_signal', 'escalate', escalationReasonForMcpGoal(conditionPlan)));
      assumptions.push('Repeat-call or strong sentiment escalation will raise the created task priority to critical.');
    }

    const rule: SaveWorkflowRuleInput = {
      name: ruleNameFromGoal(detectedIntent, naturalLanguageGoal),
      definition: {
        status,
        priority,
        composable: false,
        trigger: 'call.operational_signal.detected',
        cooldown: cooldownForMcpGoal(text, conditionPlan),
        metadata: {
          authoringSurface: 'mcp',
          sourceGoal: naturalLanguageGoal,
          detectedIntent,
          compiledConditionSummary: conditionPlan.metadata,
        },
        when: conditionPlan.conditions,
        actions,
      },
      comment: 'Drafted from MCP natural-language goal',
    };
    const issues = this.mcpRuleIssues(rule);
    return {
      rule,
      confidence: confidenceForDraft(detectedIntent, unsupported, issues),
      detectedIntent,
      assumptions,
      warnings: [...warnings, ...issues],
      unsupported,
    };
  }

  private mcpRuleIssues(rule: SaveWorkflowRuleInput) {
    const parsed = saveWorkflowRuleSchema.safeParse(rule);
    if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
    const issues: string[] = [];
    try {
      this.validateWorkflowTaskContract(parsed.data.definition);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    issues.push(...mcpDefinitionIssues(parsed.data.definition));
    const sourceGoal = stringValue(asRecord(parsed.data.definition.metadata).sourceGoal);
    if (sourceGoal) issues.push(...unsupportedMcpRequests(normalizeHumanText(sourceGoal)));
    for (const action of parsed.data.definition.actions) {
      if (!MCP_ALLOWED_ACTIONS.includes(action.action)) {
        issues.push(`Action ${action.action} is not allowed for MCP-authored rules.`);
      }
      const actionText = normalizeHumanText(`${action.action} ${action.value}`);
      issues.push(...unsupportedMcpRequests(actionText).map((issue) => `MCP-authored rule action is not allowed: ${issue}`));
    }
    return [...new Set(issues)];
  }

  private async resolveMentionedMember(goal: string) {
    const text = normalizeHumanText(goal);
    const members = await this.prisma.db.member.findMany({
      where: { status: 'active' },
      orderBy: [{ createdAt: 'asc' }],
      take: 100,
    });
    return members.find((member) => {
      const candidates = [
        member.email,
        member.firstName,
        member.lastName,
        `${member.firstName ?? ''} ${member.lastName ?? ''}`,
      ].map(normalizeHumanText).filter(Boolean);
      return candidates.some((candidate) => candidate.length >= 3 && text.includes(candidate));
    }) ?? null;
  }

  private validateWorkflowTaskContract(definition: WorkflowRuleDefinition) {
    this.validateCreateTaskAxes(definition);
    this.validateCallDerivedTaskTrigger(definition);
  }

  private validateCallDerivedTaskTrigger(definition: WorkflowRuleDefinition) {
    if (definition.trigger === 'call.operational_signal.detected') return;
    if (!CALL_DERIVED_TASK_BYPASS_TRIGGERS.includes(definition.trigger)) return;
    if (!definition.actions.some((action) => action.action === 'create_task')) return;
    throw new BadRequestException('Call-derived task creation must go through call.operational_signal.detected after transcript operational intent normalization.');
  }

  private validateCreateTaskAxes(definition: WorkflowRuleDefinition) {
    const operationalAxis = operationalAxisFromDefinition(definition);
    for (const action of definition.actions) {
      if (action.action !== 'create_task') continue;
      const explicitAxis = createTaskAxisValue(action.axis);
      if (explicitAxis) {
        this.executor.requireCreateTaskAxis(explicitAxis);
        continue;
      }
      const valueAxis = normalizeTaskAxis(action.value);
      if (valueAxis === 'support' && !operationalAxis) this.executor.requireCreateTaskAxis(valueAxis);
      const axis = operationalAxis ?? valueAxis ?? 'sales';
      this.executor.requireCreateTaskAxis(axis);
    }
  }

  enumChainProbe(): WorkflowEnumChainProbeResponse {
    const probeValues = workflowEnumProbeValues();
    const prompt = this.prompt.preview();
    const executorCounts = this.executor.recognizedCounts();

    this.executor.recognizeTrigger(probeValues.trigger);
    this.executor.recognizeCondition(probeValues.condition);
    this.executor.recognizeAction(probeValues.action);

    const response: WorkflowEnumChainProbeResponse = {
      ok: prompt.includesAllPsychTags
        && prompt.includesAllCallIntents
        && prompt.includesAllOperationalIntents
        && prompt.includesAllUrgencyLevels
        && prompt.includesAllConditions,
      version: WORKFLOW_ENUM_VERSION,
      checkedAt: new Date().toISOString(),
      counts: WORKFLOW_ENUM_COUNTS,
      prompt: {
        promptKey: prompt.promptKey,
        promptVersion: prompt.promptVersion,
        includesAllPsychTags: prompt.includesAllPsychTags,
        includesAllCallIntents: prompt.includesAllCallIntents,
        includesAllOperationalIntents: prompt.includesAllOperationalIntents,
        includesAllUrgencyLevels: prompt.includesAllUrgencyLevels,
        includesAllConditions: prompt.includesAllConditions,
      },
      canvas: {
        source: 'GET /api/v1/rules/catalog',
        triggerOptions: WORKFLOW_ENUM_COUNTS.triggers,
        conditionOptions: WORKFLOW_ENUM_COUNTS.conditions,
        actionOptions: WORKFLOW_ENUM_COUNTS.actions,
      },
      executor: executorCounts,
      probeValues,
    };

    this.logger.log('rules', 'enum_chain_verified', 'Workflow enum chain verified', {
      catalog_version: response.version,
      counts: response.counts,
      prompt_key: response.prompt.promptKey,
      probe_values: response.probeValues,
      executor: response.executor,
    });

    return response;
  }

  async operationalContractProbe(): Promise<WorkflowOperationalContractProbeResponse> {
    const tenantId = this.tenantId();
    const activeRules = await this.prisma.db.workflowRule.findMany({
      where: { tenantId, trigger: 'call.operational_signal.detected', status: 'active' },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
    const activeCallDerivedTaskBypassRules = await this.prisma.db.workflowRule.findMany({
      where: {
        tenantId,
        status: 'active',
        trigger: { in: CALL_DERIVED_TASK_BYPASS_TRIGGERS },
      },
      orderBy: [{ trigger: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    }).then((rules) => rules.filter((rule) => {
      const parsed = workflowRuleDefinitionSchema.safeParse(rule.definition);
      return parsed.success && parsed.data.actions.some((action) => action.action === 'create_task');
    }));
    const activeLegacyTranscriptRules = await this.prisma.db.workflowRule.findMany({
      where: {
        tenantId,
        status: 'active',
        trigger: { in: LEGACY_TRANSCRIPT_WORKFLOW_TRIGGERS },
      },
      orderBy: [{ trigger: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
    const supportMatchedRuleCount = await this.prisma.db.serviceRequest.count({
      where: { tenantId, axis: 'support', matchedRuleId: { not: null } },
    });
    const transcriptAudit = await this.operationalTranscriptAudit(tenantId);

    const defaultRulesByIntent = workflowRulesByOperationalIntent(DEFAULT_WORKFLOW_RULES.map((rule) => ({
      id: defaultRuleKeyFromInput(rule),
      name: rule.name,
      definition: rule.definition,
    })));
    const activeRulesByIntent = workflowRulesByOperationalIntent(activeRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      definition: workflowRuleDefinitionSchema.parse(rule.definition),
    })));

    const intents = OPERATIONAL_INTENTS.map((intent) => {
      const expectedOutcome = expectedOperationalOutcome(intent);
      const defaultRules = defaultRulesByIntent.get(intent) ?? [];
      const liveRules = activeRulesByIntent.get(intent) ?? [];
      const issues: string[] = [];
      if (defaultRules.length === 0) issues.push('No default workflow rule covers this operational intent.');
      if (liveRules.length === 0) issues.push('No active workflow rule covers this operational intent in this tenant.');
      if (defaultRules.length > 0 && !defaultRules.some((rule) => operationalRuleMatchesExpectedOutcome(intent, expectedOutcome, rule.definition))) {
        issues.push(`Default workflow rules for this intent do not provide expected outcome ${expectedOutcome}.`);
      }
      if (liveRules.length > 0 && !liveRules.some((rule) => operationalRuleMatchesExpectedOutcome(intent, expectedOutcome, rule.definition))) {
        issues.push(`Active workflow rules for this intent do not provide expected outcome ${expectedOutcome}.`);
      }
      for (const rule of [...defaultRules, ...liveRules]) {
        issues.push(...unsafeOperationalRuleIssues(rule.definition));
      }
      return {
        intent,
        expectedOutcome,
        defaultRuleKeys: defaultRules.map((rule) => rule.id),
        liveRuleIds: liveRules.map((rule) => rule.id),
        liveRuleNames: liveRules.map((rule) => rule.name),
        issues: [...new Set(issues)],
      };
    });

    const supportAxisAllowed = WORKFLOW_ENUM_CATALOG.createTaskAxes.some((entry) => String(entry.value) === 'support');
    const workflowSourceAllowed = WORKFLOW_ENUM_CATALOG.serviceRequestSources.some((entry) => entry.value.includes('workflow') || entry.value.includes('ai'));
    const mcpCapabilities = await this.mcpCapabilities();
    const exposedMcpTools = mcpCapabilities.tools.map((tool) => tool.name);
    const missingMcpTools = MCP_REQUIRED_TOOLS.filter((tool) => !exposedMcpTools.includes(tool));
    const missingMcpActions = MCP_REQUIRED_ACTIONS.filter((action) => !MCP_ALLOWED_ACTIONS.includes(action));
    const simulateTool = mcpCapabilities.tools.find((tool) => tool.name === 'simulate_workflow_rule');
    const createDraftTool = mcpCapabilities.tools.find((tool) => tool.name === 'create_workflow_rule_draft');
    const publishTool = mcpCapabilities.tools.find((tool) => tool.name === 'publish_workflow_rule');
    const publishRequiresStoredSimulation = true;
    const mcpIssues: string[] = [];
    if (MCP_ALLOWED_TRIGGERS.some((trigger) => trigger !== 'call.operational_signal.detected')) {
      mcpIssues.push('MCP exposes non-operational triggers.');
    }
    if (MCP_ALLOWED_ACTIONS.some((action) => action === 'send_mail' || action === 'segment_add' || action === 'segment_remove')) {
      mcpIssues.push('MCP exposes unsupported mutation actions.');
    }
    if (missingMcpTools.length > 0) {
      mcpIssues.push(`MCP is missing required tool(s): ${missingMcpTools.join(', ')}.`);
    }
    if (missingMcpActions.length > 0) {
      mcpIssues.push(`MCP is missing required sales/personnel action(s): ${missingMcpActions.join(', ')}.`);
    }
    if (simulateTool?.mutates !== false || simulateTool.requiresPermission !== 'settings.read') {
      mcpIssues.push('simulate_workflow_rule must be read-only and require settings.read.');
    }
    if (createDraftTool?.mutates !== true || createDraftTool.requiresPermission !== 'settings.write') {
      mcpIssues.push('create_workflow_rule_draft must mutate only drafts and require settings.write.');
    }
    if (publishTool?.mutates !== true || publishTool.requiresPermission !== 'settings.write' || !publishRequiresStoredSimulation) {
      mcpIssues.push('publish_workflow_rule must require settings.write and a stored simulation report.');
    }

    const issueCount = intents.reduce((sum, row) => sum + row.issues.length, 0)
      + supportMatchedRuleCount
      + (supportAxisAllowed ? 1 : 0)
      + (workflowSourceAllowed ? 1 : 0)
      + activeLegacyTranscriptRules.length
      + activeCallDerivedTaskBypassRules.length
      + mcpIssues.length
      + transcriptAudit.issues.length;

    return {
      ok: issueCount === 0,
      checkedAt: new Date().toISOString(),
      expectedIntents: [...OPERATIONAL_INTENTS],
      totals: {
        expectedIntentCount: OPERATIONAL_INTENTS.length,
        coveredDefaultIntentCount: intents.filter((row) => row.defaultRuleKeys.length > 0).length,
        coveredLiveIntentCount: intents.filter((row) => row.liveRuleIds.length > 0).length,
        issueCount,
      },
      intents,
      support: {
        createTaskAxes: WORKFLOW_ENUM_CATALOG.createTaskAxes.map((entry) => entry.value),
        serviceRequestSources: WORKFLOW_ENUM_CATALOG.serviceRequestSources.map((entry) => entry.value),
        supportAxisAllowed,
        workflowSourceAllowed,
        supportMatchedRuleCount,
      },
      transcript: {
        ...transcriptAudit,
        taskCreationTrigger: 'call.operational_signal.detected',
        blockedTaskTriggers: CALL_DERIVED_TASK_BYPASS_TRIGGERS,
        activeLegacyTranscriptRuleCount: activeLegacyTranscriptRules.length,
        activeLegacyTranscriptRules: activeLegacyTranscriptRules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
        })),
        activeNonOperationalTaskRuleCount: activeCallDerivedTaskBypassRules.length,
        activeNonOperationalTaskRules: activeCallDerivedTaskBypassRules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
        })),
      },
      mcp: {
        allowedTriggers: MCP_ALLOWED_TRIGGERS,
        allowedActions: MCP_ALLOWED_ACTIONS,
        requiredTools: MCP_REQUIRED_TOOLS,
        exposedTools: exposedMcpTools,
        missingRequiredTools: missingMcpTools,
        requiredActions: MCP_REQUIRED_ACTIONS,
        missingRequiredActions: missingMcpActions,
        publishRequiresStoredSimulation,
        issues: mcpIssues,
      },
    };
  }

  private async operationalTranscriptAudit(tenantId: string) {
    const to = new Date();
    const transcriptRows = await this.prisma.db.aircallCallEvent.findMany({
      where: {
        tenantId,
        eventTimestamp: { lte: to },
        transcriptRaw: { not: null },
      },
      select: {
        id: true,
        externalCallId: true,
        contactPhoneE164: true,
        contactEmail: true,
        resolverStatus: true,
        resolvedAt: true,
        resolvedWithVersion: true,
        transcriptRaw: true,
        resolverOutput: true,
      },
    }).then((rows) => rows.filter((row) => Boolean(row.transcriptRaw?.trim())));
    const callEventIds = transcriptRows.map((row) => row.id);
    const evaluations = callEventIds.length === 0
      ? []
      : await this.prisma.db.transcriptWorkflowEvaluation.findMany({
          where: { tenantId, callEventId: { in: callEventIds }, status: { not: 'superseded' } },
          select: {
            callEventId: true,
            signal: true,
            status: true,
            reason: true,
          },
        });
    const evaluationsByCallEventId = new Map<string, typeof evaluations>();
    for (const evaluation of evaluations) {
      const rows = evaluationsByCallEventId.get(evaluation.callEventId) ?? [];
      rows.push(evaluation);
      evaluationsByCallEventId.set(evaluation.callEventId, rows);
    }

    let expectedSignalCount = 0;
    let evaluatedSignalCount = 0;
    let flowCompletedSignalCount = 0;
    let missingSignalEvaluationCount = 0;
    let missingSignalFlowOutcomeCount = 0;
    let extraSignalEvaluationCount = 0;
    let invalidResolverOutputCount = 0;
    const signalCoverageSamples: WorkflowOperationalContractProbeResponse['transcript']['signalCoverageSamples'] = [];

    for (const row of transcriptRows) {
      const rowEvaluations = evaluationsByCallEventId.get(row.id) ?? [];
      const evaluatedSignals = uniqueStrings(rowEvaluations.map((evaluation) => evaluation.signal));
      const statuses = rowEvaluations.map((evaluation) => ({
        signal: evaluation.signal,
        status: evaluation.status,
      }));
      const parsedOutput = transcriptResolverOutputSchema.safeParse(row.resolverOutput);
      if (!parsedOutput.success) {
        invalidResolverOutputCount += 1;
        if (signalCoverageSamples.length < 12) {
          signalCoverageSamples.push({
            callEventId: row.id,
            externalCallId: row.externalCallId,
            expectedSignals: [],
            evaluatedSignals,
            missingSignals: [],
            extraSignals: evaluatedSignals,
            statuses,
          });
        }
        continue;
      }

      const customerMatched = await this.auditCustomerMatched(tenantId, row, parsedOutput.data);
      const expectedSignals = transcriptOperationalSignals(parsedOutput.data, { customerMatched }).map((signal) => signal.intent);
      const expectedSet = new Set<string>(expectedSignals);
      const evaluatedExpectedSignals = expectedSignals.filter((signal) => evaluatedSignals.includes(signal));
      const completedSignals = uniqueStrings(rowEvaluations
        .filter((evaluation) => isCompletedTranscriptWorkflowStatus(evaluation.status))
        .map((evaluation) => evaluation.signal));
      const completedExpectedSignals = expectedSignals.filter((signal) => completedSignals.includes(signal));
      const missingSignals = expectedSignals.filter((signal) => !evaluatedSignals.includes(signal));
      const missingFlowSignals = expectedSignals.filter((signal) => !completedSignals.includes(signal));
      const extraSignals = evaluatedSignals.filter((signal) => !expectedSet.has(signal));

      expectedSignalCount += expectedSignals.length;
      evaluatedSignalCount += evaluatedExpectedSignals.length;
      flowCompletedSignalCount += completedExpectedSignals.length;
      missingSignalEvaluationCount += missingSignals.length;
      missingSignalFlowOutcomeCount += missingFlowSignals.length;
      extraSignalEvaluationCount += extraSignals.length;

      if ((missingSignals.length > 0 || missingFlowSignals.length > 0 || extraSignals.length > 0) && signalCoverageSamples.length < 12) {
        signalCoverageSamples.push({
          callEventId: row.id,
          externalCallId: row.externalCallId,
          expectedSignals,
          evaluatedSignals,
          missingSignals,
          extraSignals,
          statuses,
        });
      }
    }

    const evaluatedIds = new Set(evaluations.map((row) => row.callEventId));
    const flowCompletedIds = new Set(evaluations
      .filter((row) => isCompletedTranscriptWorkflowStatus(row.status))
      .map((row) => row.callEventId));
    const noActionRows = evaluations.filter((row) => isNoActionTranscriptWorkflowStatus(row.status));
    const noActionMissingReasonCount = noActionRows.filter((row) => !row.reason?.trim()).length;
    const staleResolverVersionCount = transcriptRows.filter((row) => (row.resolvedWithVersion ?? 0) > 0 && (row.resolvedWithVersion ?? 0) < TRANSCRIPT_RESOLVER_SCHEMA_VERSION).length;
    const resolverQueuedOrProcessingCount = transcriptRows.filter((row) => {
      const resolvedWithCurrentVersion = Boolean(row.resolvedAt) && (row.resolvedWithVersion ?? 0) >= TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
      return (row.resolverStatus === 'queued' || row.resolverStatus === 'processing') && !resolvedWithCurrentVersion;
    }).length;
    const resolverFailedCount = transcriptRows.filter((row) => row.resolverStatus === 'failed').length;
    const failedEvaluationCount = evaluations.filter((row) => row.status === 'failed').length;
    const unmatchedEvaluationCount = evaluations.filter((row) => isUnmatchedTranscriptWorkflowStatus(row.status)).length;
    const missingEvaluationCount = transcriptRows.length - evaluatedIds.size;
    const missingFlowOutcomeCount = transcriptRows.length - flowCompletedIds.size;
    const signalInvariantOk = invalidResolverOutputCount === 0
      && missingSignalEvaluationCount === 0
      && missingSignalFlowOutcomeCount === 0
      && extraSignalEvaluationCount === 0;
    const workflowInvariantOk = missingEvaluationCount === 0
      && missingFlowOutcomeCount === 0
      && signalInvariantOk
      && staleResolverVersionCount === 0
      && resolverQueuedOrProcessingCount === 0
      && resolverFailedCount === 0
      && failedEvaluationCount === 0
      && unmatchedEvaluationCount === 0
      && noActionMissingReasonCount === 0;
    const issues = [
      ...(missingEvaluationCount > 0 ? [`${missingEvaluationCount} transcript(s) have no workflow evaluation.`] : []),
      ...(missingFlowOutcomeCount > 0 ? [`${missingFlowOutcomeCount} transcript(s) have no completed workflow outcome.`] : []),
      ...(staleResolverVersionCount > 0 ? [`${staleResolverVersionCount} transcript(s) were resolved with an older resolver schema version.`] : []),
      ...(resolverQueuedOrProcessingCount > 0 ? [`${resolverQueuedOrProcessingCount} transcript resolver job(s) are still queued or processing.`] : []),
      ...(resolverFailedCount > 0 ? [`${resolverFailedCount} transcript resolver job(s) failed.`] : []),
      ...(failedEvaluationCount > 0 ? [`${failedEvaluationCount} workflow evaluation(s) failed.`] : []),
      ...(unmatchedEvaluationCount > 0 ? [`${unmatchedEvaluationCount} workflow evaluation(s) reached no matching rule.`] : []),
      ...(noActionMissingReasonCount > 0 ? [`${noActionMissingReasonCount} no_action evaluation(s) are missing an explicit reason.`] : []),
      ...(invalidResolverOutputCount > 0 ? [`${invalidResolverOutputCount} transcript resolver output(s) are missing or invalid.`] : []),
      ...(missingSignalEvaluationCount > 0 ? [`${missingSignalEvaluationCount} expected operational signal evaluation(s) are missing.`] : []),
      ...(missingSignalFlowOutcomeCount > 0 ? [`${missingSignalFlowOutcomeCount} expected operational signal(s) have no completed workflow outcome.`] : []),
      ...(extraSignalEvaluationCount > 0 ? [`${extraSignalEvaluationCount} active workflow evaluation signal(s) are not in the current resolver signal set.`] : []),
    ];
    return {
      coverageScope: 'all_time' as const,
      coverageWindowDays: null,
      transcriptEvents: transcriptRows.length,
      evaluatedEvents: evaluatedIds.size,
      flowCompletedEvents: flowCompletedIds.size,
      expectedSignalCount,
      evaluatedSignalCount,
      flowCompletedSignalCount,
      missingSignalEvaluationCount,
      missingSignalFlowOutcomeCount,
      extraSignalEvaluationCount,
      invalidResolverOutputCount,
      signalInvariantOk,
      workflowInvariantOk,
      missingEvaluationCount,
      missingFlowOutcomeCount,
      staleResolverVersionCount,
      resolverQueuedOrProcessingCount,
      resolverFailedCount,
      failedEvaluationCount,
      unmatchedEvaluationCount,
      noActionEvaluationCount: noActionRows.length,
      noActionWithReasonCount: noActionRows.length - noActionMissingReasonCount,
      noActionMissingReasonCount,
      signalCoverageSamples,
      issues,
    };
  }

  private async auditCustomerMatched(
    tenantId: string,
    callEvent: { contactPhoneE164?: string | null; contactEmail?: string | null },
    output: TranscriptResolverOutput,
  ) {
    if (output.customer_match.customer_id) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { tenantId, id: output.customer_match.customer_id },
        select: { id: true },
      });
      if (customer) return true;
    }

    const email = (callEvent.contactEmail ?? '').trim();
    if (email) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { tenantId, email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (customer) return true;
    }

    const phone = (callEvent.contactPhoneE164 ?? output.customer_match.phone ?? '').trim();
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    const phoneNeedles = uniqueStrings([phone, digits, digits.length > 10 ? digits.slice(-10) : digits]);
    for (const needle of phoneNeedles) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { tenantId, phone: { contains: needle } },
        select: { id: true },
      });
      if (customer) return true;
    }
    return false;
  }

  private editedByMemberId() {
    const context = this.tenantContext.get();
    return context?.principalType === 'member' ? context.principalId ?? null : null;
  }
}

type WorkflowActionContext = {
  eventId: string;
  trigger: WorkflowTriggerFireInput['trigger'];
  source: string;
  occurredAt: string | null;
  params: Record<string, unknown>;
  rule: WorkflowRuleDto;
  state: Awaited<ReturnType<RulesService['resolveConditionState']>>;
  conditionTrace: WorkflowConditionTrace[];
  whenTrace: WorkflowWhenGroupTrace[];
  cooldown: WorkflowCooldownTrace;
  taskIds: string[];
};

type TaskAssignment = {
  axis: CreateTaskAxis;
  assigneeMemberId: string | null;
  watcherMemberIds: string[];
  candidateMemberIds: string[];
  customerAssignmentId: string | null;
  resolutionSource: 'explicit_param' | 'aircall_operator' | 'customer_axis_primary' | 'axis_primary_role';
};

type BackfillCandidate = {
  eventId: string;
  sourceType: string;
  sourceId: string | null;
  occurredAt: Date;
  params: Record<string, unknown>;
};

type RuleCooldownConfig = {
  disabled: boolean;
  hours: number;
  limit: number;
};

type RuleCooldownRow = {
  windowStartedAt: Date;
  lastFiredAt: Date;
  fireCount: number;
};

type RuleCooldownDecision = {
  allowed: boolean;
  config: RuleCooldownConfig;
  customerId: string | null;
  existing: RuleCooldownRow | null;
  firedAt: Date;
  trace: WorkflowCooldownTrace;
};

function conditionGroups(definition: WorkflowRuleDefinition): WorkflowRuleWhenGroup[] {
  if (definition.whenGroups?.length) return definition.whenGroups;
  if (definition.when.length > 0) return [{ id: 'default', conditions: definition.when }];
  return [];
}

const MCP_ALLOWED_ACTIONS: WorkflowRuleAction['action'][] = [
  'create_task',
  'route_member',
  'route_segment_owner',
  'route_call_owner',
  'add_note',
  'pin_customer',
  'add_watcher',
  'escalate',
  'no-op',
];

const MCP_ALLOWED_TRIGGERS: WorkflowTrigger[] = [
  'call.operational_signal.detected',
];

const MCP_REQUIRED_TOOLS: WorkflowMcpCapabilitiesResponse['tools'][number]['name'][] = [
  'list_workflow_capabilities',
  'draft_workflow_rule',
  'validate_workflow_rule',
  'simulate_workflow_rule',
  'create_workflow_rule_draft',
  'publish_workflow_rule',
];

const MCP_REQUIRED_ACTIONS: WorkflowRuleAction['action'][] = [
  'create_task',
  'route_member',
  'route_segment_owner',
  'route_call_owner',
  'add_note',
  'pin_customer',
  'no-op',
];

const MCP_OUTCOME_ACTIONS: WorkflowRuleAction['action'][] = [
  'create_task',
  'add_note',
  'pin_customer',
  'no-op',
];

const MCP_TASK_TARGETED_ACTIONS: WorkflowRuleAction['action'][] = [
  'route_member',
  'route_segment_owner',
  'route_call_owner',
  'add_watcher',
  'escalate',
];

const LEGACY_TRANSCRIPT_WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
  'aircall.transcript.received',
  'call_intent.classified',
  'psych.tag.detected',
  'product.detected_in_transcript',
  'customer.matched_from_transcript',
  'psych.analysis.completed',
];

const CALL_DERIVED_TASK_BYPASS_TRIGGERS: WorkflowTrigger[] = [
  'aircall.call.created',
  'aircall.call.ended',
  'aircall.call.missed',
  'aircall.transcript.received',
  'call_intent.classified',
  'psych.tag.detected',
  'product.detected_in_transcript',
  'customer.matched_from_transcript',
  'psych.analysis.completed',
  'customer.repeat_call.detected',
  'customer.first_call.detected',
];

type McpProductLanguageEntry = WorkflowMcpCapabilitiesResponse['registry']['productLanguage'][number];

interface McpConditionPlan {
  conditions: WorkflowRuleCondition[];
  assumptions: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
  repeatCallThreshold: number | null;
  callWindowDays: number | null;
  firstCall: boolean;
  strongPsychSignal: boolean;
  psychTags: string[];
  matchedProductAliases: string[];
  previousPurchaseGuard: boolean;
  openTaskGuard: boolean;
}

function detectOperationalIntent(text: string): WorkflowMcpDraftRuleResponse['detectedIntent'] {
  return detectOperationalIntentFromText(text);
}

function axisForOperationalIntent(intent: WorkflowMcpDraftRuleResponse['detectedIntent']): CreateTaskAxis {
  return defaultAxisForOperationalIntent(intent) ?? 'sales';
}

function axisForActionableOperationalIntent(value: unknown): CreateTaskAxis | null {
  const parsed = operationalIntentSchema.safeParse(normalize(value));
  if (!parsed.success || parsed.data === 'no_action') return null;
  return axisForOperationalIntent(parsed.data);
}

function createTaskAxisValue(value: unknown): CreateTaskAxis | null {
  const parsed = createTaskAxisSchema.safeParse(normalize(value));
  return parsed.success ? parsed.data : null;
}

function operationalAxisFromDefinition(definition: WorkflowRuleDefinition): CreateTaskAxis | null {
  const axes = new Set<CreateTaskAxis>();
  for (const condition of workflowDefinitionConditions(definition)) {
    if (condition.condition !== 'operational_intent') continue;
    if (condition.operator !== '=' && condition.operator !== 'in') continue;
    for (const value of condition.value.split(',')) {
      const axis = axisForActionableOperationalIntent(value);
      if (axis) axes.add(axis);
    }
  }
  return axes.size === 1 ? [...axes][0] ?? null : null;
}

function workflowDefinitionConditions(definition: WorkflowRuleDefinition): WorkflowRuleCondition[] {
  return [
    ...definition.when,
    ...(definition.whenGroups ?? []).flatMap((group) => group.conditions),
  ];
}

function compileMcpConditions(
  text: string,
  detectedIntent: WorkflowMcpDraftRuleResponse['detectedIntent'],
  productLanguage: McpProductLanguageEntry[],
): McpConditionPlan {
  const conditions: WorkflowRuleCondition[] = [
    mcpCondition(`intent_${detectedIntent}`, 'operational_intent', '=', detectedIntent),
  ];
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const metadata: Record<string, unknown> = { intent: detectedIntent };

  const callSpec = detectCallSpec(text);
  if (callSpec.firstCall) {
    conditions.push(mcpCondition('first_call', 'is_first_call', '=', 'true'));
    assumptions.push('First-call prompts compile to is_first_call=true instead of a repeat-call window.');
    metadata.firstCall = true;
  } else if (callSpec.count !== null) {
    conditions.push(mcpCondition(
      `call_count_${callSpec.count}_${callSpec.windowDays}d`,
      'call_count_in_window',
      '>=',
      `${callSpec.count} calls / ${callSpec.windowDays} days`,
    ));
    assumptions.push(`Repeat-call prompt requires at least ${callSpec.count} calls in ${callSpec.windowDays} days.`);
    metadata.callCountThreshold = callSpec.count;
    metadata.callWindowDays = callSpec.windowDays;
  }

  const psych = detectPsychTags(text);
  if (psych.tags.length > 0) {
    conditions.push({
      ...mcpCondition('psych_tags', 'psych_tag_includes', psych.tags.length > 1 ? 'in' : '=', psych.tags.join(',')),
      ...(psych.strong ? { confidenceGte: 0.75 } : {}),
    });
    assumptions.push(`Transcript sentiment must include ${psych.tags.join(' or ')}.`);
    metadata.psychTags = psych.tags;
    if (psych.strong) metadata.strongPsychSignal = true;
  }

  const callIntent = detectCallIntentCondition(text);
  if (callIntent) {
    conditions.push(mcpCondition(`call_intent_${callIntent}`, 'call_intent', '=', callIntent));
    metadata.callIntent = callIntent;
  }

  const productMatches = matchMcpProductLanguage(text, productLanguage);
  const primaryProductMatch = productMatches[0] ?? null;
  if (primaryProductMatch) {
    conditions.push(mcpCondition('product_mentioned', 'product_mentioned', 'contains', primaryProductMatch.conditionValue));
    assumptions.push(`Product condition resolved from Shopify catalog: ${primaryProductMatch.title} via "${primaryProductMatch.conditionValue}".`);
    metadata.productAliases = productMatches.slice(0, 5).map((match) => match.conditionValue);
    metadata.productTitles = productMatches.slice(0, 5).map((match) => match.title);
  } else if (mentionsProductLanguage(text, detectedIntent)) {
    warnings.push(productLanguage.length === 0
      ? 'Shopify catalog product language is empty; product_mentioned condition was not added.'
      : 'No Shopify catalog alias matched the product wording; rule uses operational intent and other guards only.');
  }

  const previousPurchaseRequested = mentionsPreviousPurchase(text);
  if (previousPurchaseRequested && primaryProductMatch) {
    conditions.push(mcpCondition('previous_purchase_product', 'previous_purchase_includes', 'contains', primaryProductMatch.conditionValue));
    assumptions.push('Previous-purchase guard uses the same Shopify catalog product language as the transcript product mention.');
    metadata.previousPurchaseGuard = true;
  } else if (previousPurchaseRequested) {
    warnings.push('Previous-purchase wording was detected, but no Shopify catalog product alias matched; previous_purchase_includes was not added.');
  }

  const orderSpec = detectOrderCountSpec(text);
  if (orderSpec) {
    conditions.push(mcpCondition(
      `order_count_${orderSpec.count}_${orderSpec.windowDays}d`,
      'order_count_in_window',
      '>=',
      `${orderSpec.count} orders / ${orderSpec.windowDays} days`,
    ));
    assumptions.push(`Commerce guard requires at least ${orderSpec.count} orders in ${orderSpec.windowDays} days.`);
    metadata.orderCountThreshold = orderSpec.count;
    metadata.orderWindowDays = orderSpec.windowDays;
  }

  const lastOrderAge = detectLastOrderAgeDays(text);
  if (lastOrderAge !== null) {
    conditions.push(mcpCondition(`last_order_${lastOrderAge}d`, 'last_order_age_lte', '<=', `${lastOrderAge}`));
    assumptions.push(`Last-order guard requires a Shopify order within ${lastOrderAge} days.`);
    metadata.lastOrderAgeLteDays = lastOrderAge;
  }

  const ltvThreshold = detectLtvThreshold(text);
  if (ltvThreshold !== null) {
    conditions.push(mcpCondition(`ltv_${Math.round(ltvThreshold)}`, 'customer_ltv_gte', '>=', `${ltvThreshold}`));
    assumptions.push(`Customer spend guard requires LTV >= ${ltvThreshold}.`);
    metadata.customerLtvGte = ltvThreshold;
  }

  const openTaskGuard = shouldAddOpenTaskGuard(text, detectedIntent);
  if (openTaskGuard) {
    conditions.push(mcpCondition('no_open_task_for_intent', 'open_task_exists_for_intent', '=', 'false'));
    assumptions.push('Open-task guard prevents duplicate tasks for the same customer and operational intent.');
    metadata.openTaskGuard = true;
  }

  return {
    conditions: dedupeMcpConditions(conditions),
    assumptions,
    warnings,
    metadata,
    repeatCallThreshold: callSpec.firstCall ? null : callSpec.count,
    callWindowDays: callSpec.firstCall ? null : callSpec.windowDays,
    firstCall: callSpec.firstCall,
    strongPsychSignal: psych.strong,
    psychTags: psych.tags,
    matchedProductAliases: productMatches.map((match) => match.conditionValue),
    previousPurchaseGuard: Boolean(metadata.previousPurchaseGuard),
    openTaskGuard,
  };
}

function mcpDefinitionIssues(definition: WorkflowRuleDefinition) {
  const issues: string[] = [];
  if (!MCP_ALLOWED_TRIGGERS.includes(definition.trigger)) {
    issues.push(`MCP-authored rules must use one of these triggers: ${MCP_ALLOWED_TRIGGERS.join(', ')}.`);
  }

  const operationalIntents = operationalIntentsFromDefinition(definition);
  if (operationalIntents.length === 0) {
    issues.push('MCP-authored rules must include an operational_intent condition.');
  }

  const createTaskIndex = definition.actions.findIndex((action) => action.action === 'create_task');
  const hasCreateTask = createTaskIndex >= 0;
  const hasTaskTargetedAction = definition.actions.some((action) => MCP_TASK_TARGETED_ACTIONS.includes(action.action));
  const hasOperationalOutcome = definition.actions.some((action) => MCP_OUTCOME_ACTIONS.includes(action.action) && action.action !== 'no-op');
  const onlyNoAction = operationalIntents.length > 0 && operationalIntents.every((intent) => intent === 'no_action');

  if (hasTaskTargetedAction && !hasCreateTask) {
    issues.push('Task routing, watcher, or escalation actions require a create_task action earlier in the same MCP-authored rule.');
  }
  for (const [index, action] of definition.actions.entries()) {
    if (MCP_TASK_TARGETED_ACTIONS.includes(action.action) && createTaskIndex > index) {
      issues.push(`Action ${action.action} must come after create_task so it has a service request target.`);
    }
  }
  if (onlyNoAction) {
    if (hasCreateTask || hasTaskTargetedAction) {
      issues.push('no_action MCP rules cannot create or route tasks; use no-op, add_note, or pin_customer only.');
    }
    if (!definition.actions.some((action) => action.action === 'no-op')) {
      issues.push('no_action MCP rules must include an explicit no-op action with the audit reason.');
    }
  } else if (!hasOperationalOutcome) {
    issues.push('MCP-authored operational rules must create a task, add a customer note, or pin the customer.');
  }

  return [...new Set(issues)];
}

function operationalIntentsFromDefinition(definition: WorkflowRuleDefinition) {
  const intents: Array<WorkflowMcpDraftRuleResponse['detectedIntent']> = [];
  for (const condition of workflowDefinitionConditions(definition)) {
    if (condition.condition !== 'operational_intent') continue;
    if (condition.operator !== '=' && condition.operator !== 'in') continue;
    for (const value of condition.value.split(',')) {
      const parsed = operationalIntentSchema.safeParse(normalize(value));
      if (parsed.success) intents.push(parsed.data);
    }
  }
  return [...new Set(intents)];
}

function workflowRulesByOperationalIntent(
  rules: Array<{ id: string; name: string; definition: WorkflowRuleDefinition }>,
) {
  const byIntent = new Map<string, Array<{ id: string; name: string; definition: WorkflowRuleDefinition }>>();
  for (const rule of rules) {
    if (rule.definition.trigger !== 'call.operational_signal.detected') continue;
    for (const intent of operationalIntentsFromDefinition(rule.definition)) {
      const list = byIntent.get(intent) ?? [];
      list.push(rule);
      byIntent.set(intent, list);
    }
  }
  return byIntent;
}

function expectedOperationalOutcome(intent: (typeof OPERATIONAL_INTENTS)[number]): WorkflowOperationalContractProbeResponse['intents'][number]['expectedOutcome'] {
  return expectedOutcomeForOperationalIntent(intent);
}

function operationalRuleMatchesExpectedOutcome(
  intent: (typeof OPERATIONAL_INTENTS)[number],
  expectedOutcome: WorkflowOperationalContractProbeResponse['intents'][number]['expectedOutcome'],
  definition: WorkflowRuleDefinition,
) {
  if (definition.trigger !== 'call.operational_signal.detected') return false;
  if (!operationalIntentsFromDefinition(definition).includes(intent)) return false;
  if (expectedOutcome === 'no-op') {
    return definition.actions.some((action) => action.action === 'no-op')
      && !definition.actions.some((action) => action.action === 'create_task');
  }
  const expectedAxis = expectedOutcome.replace('task:', '') as CreateTaskAxis;
  return definition.actions.some((action) => {
    if (action.action !== 'create_task') return false;
    const explicitAxis = createTaskAxisValue(action.axis);
    const valueAxis = normalizeTaskAxis(action.value);
    const inferredAxis = explicitAxis ?? (valueAxis === 'support' ? null : valueAxis) ?? axisForActionableOperationalIntent(intent);
    return inferredAxis === expectedAxis;
  });
}

function unsafeOperationalRuleIssues(definition: WorkflowRuleDefinition) {
  const issues: string[] = [];
  if (definition.trigger !== 'call.operational_signal.detected') return issues;
  const intents = operationalIntentsFromDefinition(definition);
  for (const action of definition.actions) {
    if (action.action !== 'create_task') continue;
    if (intents.includes('no_action')) {
      issues.push('no_action operational workflow cannot create tasks.');
    }
    const axis = createTaskAxisValue(action.axis) ?? normalizeTaskAxis(action.value);
    if (axis === 'support') {
      issues.push('Operational workflow create_task action targets support, which is not allowed.');
    }
  }
  return issues;
}

function priorityFromGoal(text: string, plan?: Pick<McpConditionPlan, 'repeatCallThreshold' | 'strongPsychSignal'>) {
  if ((plan?.repeatCallThreshold ?? 0) >= 5 && plan?.strongPsychSignal) return 95;
  if ((plan?.repeatCallThreshold ?? 0) >= 5) return 90;
  if (plan?.strongPsychSignal) return 85;
  if (text.includes('critical') || text.includes('urgent') || text.includes('acil')) return 90;
  if (text.includes('high') || text.includes('important') || text.includes('yuksek')) return 80;
  if (text.includes('low') || text.includes('dusuk')) return 30;
  return 60;
}

function cooldownForMcpGoal(text: string, plan: Pick<McpConditionPlan, 'repeatCallThreshold' | 'strongPsychSignal'>): WorkflowRuleDefinition['cooldown'] {
  if (mentionsEveryOccurrence(text)) return { hours: 0, limit: 1 };
  if ((plan.repeatCallThreshold ?? 0) >= 5) return { hours: 6, limit: 1 };
  if (plan.strongPsychSignal) return { hours: 12, limit: 1 };
  return { hours: 24, limit: 1 };
}

function shouldAddWatcher(text: string, plan: Pick<McpConditionPlan, 'repeatCallThreshold' | 'strongPsychSignal'>) {
  return mentionsWatcher(text) || shouldEscalate(text, plan);
}

function shouldEscalate(text: string, plan: Pick<McpConditionPlan, 'repeatCallThreshold' | 'strongPsychSignal'>) {
  if (text.includes('escalate') || text.includes('manager') || text.includes('supervisor') || text.includes('yonetici')) return true;
  return (plan.repeatCallThreshold ?? 0) >= 5 && plan.strongPsychSignal;
}

function escalationReasonForMcpGoal(plan: Pick<McpConditionPlan, 'repeatCallThreshold' | 'strongPsychSignal'>) {
  if ((plan.repeatCallThreshold ?? 0) >= 5 && plan.strongPsychSignal) return 'Repeat angry call requires manager visibility.';
  if ((plan.repeatCallThreshold ?? 0) >= 5) return 'High repeat-call count requires manager visibility.';
  return 'Workflow escalation requested by rule.';
}

function taskTitleForMcpGoal(intent: WorkflowMcpDraftRuleResponse['detectedIntent'], text: string) {
  if (text.includes('callback') || text.includes('call back') || text.includes('tekrar ara')) return `${labelFromIntent(intent)} callback`;
  return registryTaskTitleForOperationalIntent(intent) ?? `${labelFromIntent(intent)} follow-up`;
}

function labelFromIntent(intent: WorkflowMcpDraftRuleResponse['detectedIntent']) {
  return intent.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function ruleNameFromGoal(intent: WorkflowMcpDraftRuleResponse['detectedIntent'], goal: string) {
  const compact = goal.trim().replace(/\s+/g, ' ').slice(0, 64);
  return compact.length >= 12 ? compact : `${labelFromIntent(intent)} rule`;
}

function mcpAction(
  id: string,
  action: WorkflowRuleAction['action'],
  value: string,
  axis?: WorkflowRuleAction['axis'],
): WorkflowRuleAction {
  return axis ? { id, action, value, axis } : { id, action, value };
}

function mcpCondition(
  id: string,
  condition: WorkflowRuleCondition['condition'],
  operator: WorkflowRuleCondition['operator'],
  value: string,
): WorkflowRuleCondition {
  return { id: slug(id), condition, operator, value };
}

function dedupeMcpConditions(conditions: WorkflowRuleCondition[]) {
  const seen = new Set<string>();
  return conditions.filter((condition) => {
    const key = `${condition.condition}:${condition.operator}:${condition.value}:${condition.confidenceGte ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectCallSpec(text: string) {
  const windowDaysValue = detectWindowDays(text) ?? 30;
  if ([
    'first call',
    '1st call',
    'ilk arama',
    'ilk cagri',
    'birinci arama',
    'birinci cagri',
    '1 arama',
    '1. arama',
    '1 cagri',
    '1. cagri',
  ].some((keyword) => text.includes(keyword))) {
    return { firstCall: true, count: 1, windowDays: windowDaysValue };
  }

  const ordinalCount = numericCallOrdinal(text) ?? wordCallOrdinal(text);
  if (ordinalCount !== null && ordinalCount <= 1) return { firstCall: true, count: 1, windowDays: windowDaysValue };
  if (ordinalCount !== null) return { firstCall: false, count: ordinalCount, windowDays: windowDaysValue };
  if (['repeat call', 'repeated call', 'tekrar aradi', 'tekrar arama', 'yeniden aradi', 'yeniden arama', 'ikinci kez'].some((keyword) => text.includes(keyword))) {
    return { firstCall: false, count: 2, windowDays: windowDaysValue };
  }
  return { firstCall: false, count: null as number | null, windowDays: windowDaysValue };
}

function numericCallOrdinal(text: string) {
  const patterns = [
    /(?:^|\s)(\d+)\.?\s*(?:arama\w*|cagri\w*|call)\b/,
    /(?:^|\s)(\d+)(?:st|nd|rd|th)\s+call\b/,
    /(?:^|\s)(\d+)\s*(?:kez|kere|defa)\s*(?:aradi\w*|arama\w*|cagri\w*|called|call)\b/,
    /(?:aradi|called|call)\s*(?:for\s*)?(?:the\s*)?(\d+)(?:st|nd|rd|th)?\s*(?:time|kez|kere|defa)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function wordCallOrdinal(text: string) {
  const candidates: Array<[number, string[]]> = [
    [1, ['birinci arama', 'birinci cagri', 'first call']],
    [2, ['ikinci arama', 'ikinci cagri', 'second call', 'second time']],
    [3, ['ucuncu arama', 'ucuncu cagri', 'third call', 'third time']],
    [4, ['dorduncu arama', 'dorduncu cagri', 'fourth call', 'fourth time']],
    [5, ['besinci arama', 'besinci cagri', 'fifth call', 'fifth time']],
    [6, ['altinci arama', 'altinci cagri', 'sixth call', 'sixth time']],
    [7, ['yedinci arama', 'yedinci cagri', 'seventh call', 'seventh time']],
  ];
  for (const [count, keywords] of candidates) {
    if (keywords.some((keyword) => text.includes(keyword))) return count;
  }
  return null;
}

function detectWindowDays(text: string) {
  const direct = text.match(/(?:son|last)\s+(\d+)\s*(gun|gunde|days?|hafta|weeks?|ay|months?)\b/);
  if (direct) return unitToDays(Number(direct[1]), direct[2]);
  const trailing = text.match(/\b(\d+)\s*(gun|days?|hafta|weeks?|ay|months?)\b/);
  if (trailing) return unitToDays(Number(trailing[1]), trailing[2]);
  if (text.includes('bu hafta') || text.includes('this week')) return 7;
  if (text.includes('bu ay') || text.includes('this month')) return 30;
  return null;
}

function unitToDays(count: number, unit: string) {
  if (!Number.isFinite(count) || count <= 0) return 30;
  if (unit.includes('hafta') || unit.includes('week')) return count * 7;
  if (unit.includes('ay') || unit.includes('month')) return count * 30;
  return count;
}

function detectPsychTags(text: string) {
  const tags: string[] = [];
  const strong = [
    'cok sinirli',
    'asiri sinirli',
    'very angry',
    'furious',
    'extremely upset',
    'ofkeli',
    'rage',
  ].some((keyword) => text.includes(keyword));
  if (['sinirli', 'kizgin', 'angry', 'upset', 'frustrated', 'ofkeli', 'mad'].some((keyword) => text.includes(keyword))) tags.push('angry');
  if (['sikayet', 'complaint', 'complain', 'complaining', 'memnun degil'].some((keyword) => text.includes(keyword))) tags.push('complaint');
  if (['satin alim niyeti', 'purchase intent', 'buying intent', 'almaya niyetli', 'satinalma niyeti'].some((keyword) => text.includes(keyword))) tags.push('purchase_intent');
  if (['refund intent', 'iade istiyor', 'refund istiyor', 'money back'].some((keyword) => text.includes(keyword))) tags.push('refund_intent');
  if (['shipping issue', 'kargo sorunu', 'shipment issue', 'delivery issue'].some((keyword) => text.includes(keyword))) tags.push('shipping_issue');
  if (['info request', 'bilgi istiyor', 'inquiry', 'soru soruyor'].some((keyword) => text.includes(keyword))) tags.push('info_request');
  if (['follow up tag', 'psych follow up', 'takip tag'].some((keyword) => text.includes(keyword))) tags.push('follow_up');
  if (['satisfied', 'memnun', 'happy'].some((keyword) => text.includes(keyword))) tags.push('satisfied');
  return { tags: uniqueStrings(tags), strong };
}

function detectCallIntentCondition(text: string) {
  if (['sales call', 'sale intent', 'satis', 'satin alma', 'purchase'].some((keyword) => text.includes(keyword))) return 'sale';
  if (['complaint call', 'sikayet aramasi'].some((keyword) => text.includes(keyword))) return 'complaint';
  if (['follow up call', 'takip aramasi'].some((keyword) => text.includes(keyword))) return 'follow_up';
  if (['inquiry', 'bilgi aramasi', 'soru'].some((keyword) => text.includes(keyword))) return 'inquiry';
  return null;
}

function matchMcpProductLanguage(text: string, productLanguage: McpProductLanguageEntry[]) {
  const matches: Array<{ title: string; conditionValue: string; score: number }> = [];
  for (const product of productLanguage) {
    for (const alias of product.aliases) {
      const normalizedAlias = normalizeHumanText(alias);
      if (!isUsefulProductAlias(normalizedAlias)) continue;
      if (!text.includes(normalizedAlias)) continue;
      const score = normalizedAlias.length
        + (product.title && normalizeHumanText(product.title) === normalizedAlias ? 20 : 0)
        + (product.variantSkus.some((sku) => normalizeHumanText(sku) === normalizedAlias) ? 30 : 0);
      matches.push({ title: product.title, conditionValue: alias, score });
    }
  }
  return matches
    .sort((a, b) => b.score - a.score || a.conditionValue.length - b.conditionValue.length)
    .filter((match, index, all) => all.findIndex((candidate) => normalizeHumanText(candidate.conditionValue) === normalizeHumanText(match.conditionValue)) === index);
}

function productLanguageAliases(candidates: Array<string | null | undefined>) {
  return uniqueStrings(candidates.flatMap((candidate) => expandProductLanguageAlias(candidate)))
    .filter((alias) => isUsefulProductAlias(normalizeHumanText(alias)))
    .slice(0, 24);
}

function expandProductLanguageAlias(value: string | null | undefined) {
  if (!value?.trim()) return [];
  const raw = value.trim();
  const normalized = normalizeHumanText(raw);
  const aliases = [raw];
  if (normalized.includes('heat press')) aliases.push('heat press');
  if (normalized.includes('hydraulic press')) aliases.push('hydraulic press');
  if (normalized.includes('swing away')) aliases.push('swing away');
  if (normalized.includes('clamshell')) aliases.push('clamshell');
  if (normalized.includes('dual station')) aliases.push('dual station');
  if (normalized.includes('mug press')) aliases.push('mug press');
  if (normalized.includes('cap press')) aliases.push('cap press');
  if (normalized.includes('dtf') && ['supply', 'supplies', 'ink', 'powder', 'film', 'transfer', 'gang sheet'].some((word) => normalized.includes(word))) {
    aliases.push('dtf supplies');
  }
  if (normalized.includes('white ink')) aliases.push('white ink');
  if (normalized.includes('ink')) aliases.push('ink');
  if (normalized.includes('powder')) aliases.push('powder', 'adhesive powder');
  if (normalized.includes('film')) aliases.push('film', 'transfer film', 'pet film');
  if (normalized.includes('gang sheet')) aliases.push('gang sheet');
  return aliases;
}

function isUsefulProductAlias(alias: string) {
  if (alias.length < 3) return false;
  if (/^\d+$/.test(alias)) return false;
  return !['active', 'default', 'new', 'sale', 'shopify', 'product', 'products', 'variant', 'dtf'].includes(alias);
}

function mentionsProductLanguage(text: string, intent: WorkflowMcpDraftRuleResponse['detectedIntent']) {
  if (intent === 'heat_press_purchase_intent' || intent === 'dtf_supply_reorder_signal' || intent === 'product_fit_question' || intent === 'machine_upgrade_interest') return true;
  return ['heat press', 'dtf', 'powder', 'film', 'ink', 'machine', 'press', 'sku', 'urun', 'product'].some((keyword) => text.includes(keyword));
}

function mentionsPreviousPurchase(text: string) {
  return [
    'previous purchase',
    'previously purchased',
    'bought before',
    'already bought',
    'daha once aldi',
    'daha once satin aldi',
    'onceki siparis',
    'gecmis siparis',
    'reorder',
    'tekrar siparis',
    'yeniden siparis',
  ].some((keyword) => text.includes(keyword));
}

function detectOrderCountSpec(text: string) {
  const patterns = [
    /(?:son|last)\s+(\d+)\s*(gun|days?|hafta|weeks?|ay|months?)\s*(?:icinde|within|in)?\s*(\d+)\s*(?:order|orders|siparis)\b/,
    /(\d+)\s*(?:order|orders|siparis)\s*(?:in|within|son|last)?\s*(\d+)\s*(gun|days?|hafta|weeks?|ay|months?)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (pattern === patterns[0]) {
      return { count: Number(match[3]), windowDays: unitToDays(Number(match[1]), match[2]) };
    }
    return { count: Number(match[1]), windowDays: unitToDays(Number(match[2]), match[3]) };
  }
  return null;
}

function detectLastOrderAgeDays(text: string) {
  const match = text.match(/(?:last order|son siparis)\s*(?:within|son|icinde)?\s*(\d+)\s*(gun|days?|hafta|weeks?|ay|months?)\b/);
  if (!match) return null;
  return unitToDays(Number(match[1]), match[2]);
}

function detectLtvThreshold(text: string) {
  const match = text.match(/(?:ltv|spent|harcama|total spent|toplam harcama|vip)\s*(?:>=|over|above|ustunde|en az)?\s*\$?\s*([\d,.]+)/)
    ?? text.match(/\$?\s*([\d,.]+)\+?\s*(?:ltv|spent|harcama|total spent|toplam harcama)/);
  if (!match) return null;
  const parsed = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function shouldAddOpenTaskGuard(text: string, intent: WorkflowMcpDraftRuleResponse['detectedIntent']) {
  if (intent === 'no_action') return false;
  return !mentionsEveryOccurrence(text);
}

function mentionsEveryOccurrence(text: string) {
  return ['every call', 'every time', 'always create', 'her arama', 'her sefer', 'her defa', 'daima'].some((keyword) => text.includes(keyword));
}

function mentionsWatcher(text: string) {
  return ['watcher', 'add watcher', 'izleyici', 'bilgilendir', 'haber ver', 'cc manager', 'manager visibility'].some((keyword) => text.includes(keyword));
}

function mentionsSegmentOwner(text: string) {
  return text.includes('segment owner') || text.includes('segment sahibi') || text.includes('segment sorumlusu');
}

function mentionsCallOwner(text: string) {
  return text.includes('call owner')
    || text.includes('aircall owner')
    || text.includes('aircall operator')
    || text.includes('agent who answered')
    || text.includes('answered the call')
    || text.includes('aramayi cevaplayan')
    || text.includes('cagriyi cevaplayan')
    || text.includes('cagriyi alan')
    || text.includes('konusmayi alan')
    || text.includes('arama sahibi');
}

function mentionsNote(text: string) {
  return text.includes('note') || text.includes('not ekle') || text.includes('customer note');
}

function mentionsPin(text: string) {
  return text.includes('pin') || text.includes('sabitle') || text.includes('vip');
}

function noteValueForGoal(goal: string) {
  return `Workflow note: ${goal.trim().replace(/\s+/g, ' ').slice(0, 220)}`;
}

const MCP_UNSUPPORTED_SUPPORT_REQUEST_KEYWORDS = [
  'support case',
  'customer request',
  'ticket',
  'open ticket',
  'create ticket',
  'destek talebi',
  'musteri talebi',
  'talep ac',
  'talep olustur',
  'ticket ac',
  'destek case',
  'servis kaydi',
] as const;

const MCP_UNSUPPORTED_MAIL_KEYWORDS = [
  'send email',
  'send mail',
  'direct email',
  'mail gonder',
  'mail gönder',
  'email gonder',
  'email gönder',
  'e-mail gonder',
  'e-mail gönder',
  'e posta gonder',
  'e posta gönder',
  'eposta gonder',
  'eposta gönder',
] as const;

const MCP_UNSUPPORTED_DESTRUCTIVE_KEYWORDS = [
  'delete',
  'delete customer',
  'remove segment',
  'segment remove',
  'segmentten cikar',
  'segmentten kaldir',
  'sil',
  'kaldir',
] as const;

function unsupportedMcpRequests(text: string) {
  const unsupported: string[] = [];
  if (hasAnyHumanKeyword(text, MCP_UNSUPPORTED_SUPPORT_REQUEST_KEYWORDS) && !isNegatedSupportCaseRequest(text)) {
    unsupported.push('Automatic support case/ticket/customer request creation is not supported.');
  }
  if (hasAnyHumanKeyword(text, MCP_UNSUPPORTED_MAIL_KEYWORDS) || mentionsMailSurface(text)) {
    unsupported.push('Sending mail directly from MCP-authored rules is not enabled in this MVP.');
  }
  if (hasAnyHumanKeyword(text, MCP_UNSUPPORTED_DESTRUCTIVE_KEYWORDS)) {
    unsupported.push('Destructive actions are not supported for MCP-authored rules.');
  }
  return [...new Set(unsupported)];
}

function isNegatedSupportCaseRequest(text: string) {
  if (!hasAnyHumanKeyword(text, MCP_UNSUPPORTED_SUPPORT_REQUEST_KEYWORDS)) return false;
  return [
    'do not create',
    'dont create',
    'do not open',
    'dont open',
    'not create',
    'not open',
    'without support case',
    'no support case',
    'support case yok',
    'support case acma',
    'support case olusturma',
    'ticket acma',
    'ticket olusturma',
    'talep acma',
    'talep olusturma',
    'destek talebi acma',
    'otomatik support yok',
  ].some((keyword) => text.includes(keyword));
}

function hasAnyHumanKeyword(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(normalizeHumanText(keyword)));
}

function mentionsMailSurface(text: string) {
  const normalized = normalizeHumanText(text);
  return ['email', 'mail', 'e posta', 'eposta'].some((keyword) => normalized.includes(keyword));
}

function confidenceForDraft(
  intent: WorkflowMcpDraftRuleResponse['detectedIntent'],
  unsupported: string[],
  issues: string[],
) {
  if (unsupported.length > 0 || issues.length > 0) return 0.35;
  if (intent === 'no_action') return 0.45;
  return 0.78;
}

function transientRuleDto(input: SaveWorkflowRuleInput): WorkflowRuleDto {
  const now = new Date().toISOString();
  return {
    id: `draft_${randomUUID()}`,
    name: input.name,
    status: input.definition.status,
    priority: input.definition.priority,
    composable: input.definition.composable,
    trigger: input.definition.trigger,
    definition: input.definition,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeHumanText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCompletedTranscriptWorkflowStatus(status: string) {
  return status === 'task_created'
    || status === 'matched_without_task'
    || status === 'cooldown_suppressed'
    || status === 'no_action'
    || status === 'no_action_unmatched';
}

function isNoActionTranscriptWorkflowStatus(status: string) {
  return status === 'no_action' || status === 'no_action_unmatched';
}

function isUnmatchedTranscriptWorkflowStatus(status: string) {
  return status === 'no_matching_rule' || status === 'no_action_unmatched';
}

function normalizeCooldown(definition: WorkflowRuleDefinition): RuleCooldownConfig {
  const raw = definition.cooldown;
  if (raw === undefined) return { disabled: false, hours: 24, limit: 1 };
  if (typeof raw === 'number') return { disabled: raw === 0, hours: raw, limit: 1 };
  return {
    disabled: raw.hours === 0,
    hours: raw.hours,
    limit: raw.limit,
  };
}

function cooldownTrace(
  config: RuleCooldownConfig,
  customerId: string | null,
  row: RuleCooldownRow | null,
  now: Date,
): WorkflowCooldownTrace {
  const expired = row ? cooldownExpired(row.windowStartedAt, now, config.hours) : false;
  const activeRow = row && !expired ? row : null;
  return {
    disabled: config.disabled,
    customerId,
    hours: config.hours,
    limit: config.limit,
    currentCount: activeRow?.fireCount ?? 0,
    windowStartedAt: activeRow?.windowStartedAt.toISOString() ?? null,
    lastFiredAt: activeRow?.lastFiredAt.toISOString() ?? null,
    nextEligibleAt: activeRow ? addHours(activeRow.windowStartedAt, config.hours).toISOString() : null,
  };
}

function cooldownExpired(windowStartedAt: Date, now: Date, hours: number) {
  if (hours <= 0) return true;
  return now.getTime() >= addHours(windowStartedAt, hours).getTime();
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function fireTimeStateSnapshot(state: WorkflowActionContext['state']) {
  return {
    resolvedAt: state.now.toISOString(),
    customer: state.customer
      ? {
          id: state.customer.id,
          shopifyCustomerId: state.customer.shopifyCustomerId,
          totalSpent: Number(state.customer.totalSpent),
          ordersCount: state.customer.ordersCount,
          lastOrderAt: state.customer.lastOrderAt?.toISOString() ?? null,
          tags: state.customer.tags,
        }
      : null,
    callEvent: state.callEvent ? { id: state.callEvent.id } : null,
    resolverOutput: pickResolverOutput(state.resolverOutput),
  };
}

function pickResolverOutput(output: Record<string, unknown>) {
  return Object.fromEntries(
    ['call_intent', 'psych_tags', 'product_mentions', 'operational_signals', 'urgency_signal', 'urgency_level', 'summary']
      .filter((key) => output[key] !== undefined)
      .map((key) => [key, output[key]]),
  );
}

function resultStatus(taskIds: string[], actionTrace: WorkflowActionTrace[]): WorkflowTriggerFireResponse['results'][number]['status'] {
  if (taskIds.length > 0) return 'task_created';
  const applied = actionTrace.filter((entry) => entry.status === 'applied');
  if (applied.length === 0) return 'skipped';
  if (applied.every((entry) => entry.action === 'no-op')) return 'no_op';
  return 'actions_applied';
}

function skippedTrace(
  action: WorkflowRuleAction,
  targetType: WorkflowActionTrace['targetType'],
  message: string,
): { trace: WorkflowActionTrace } {
  return {
    trace: {
      actionId: action.id,
      action: action.action,
      status: 'skipped',
      targetType,
      message,
    },
  };
}

function toDto(rule: {
  id: string;
  name: string;
  status: string;
  priority: number;
  composable: boolean;
  trigger: string;
  definition: unknown;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowRuleDto {
  const definition = workflowRuleDefinitionSchema.parse(rule.definition);
  return {
    id: rule.id,
    name: rule.name,
    status: definition.status,
    priority: rule.priority,
    composable: rule.composable,
    trigger: rule.trigger,
    definition,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function toVersionDto(version: {
  id: string;
  ruleId: string;
  versionNo: number;
  jsonSnapshot: Prisma.JsonValue;
  editedByMemberId: string | null;
  editedAt: Date;
  comment: string | null;
}) {
  return {
    id: version.id,
    ruleId: version.ruleId,
    versionNo: version.versionNo,
    jsonSnapshot: saveWorkflowRuleSchema.parse(version.jsonSnapshot),
    editedByMemberId: version.editedByMemberId,
    editedAt: version.editedAt.toISOString(),
    comment: version.comment,
  };
}

function toExecutionTaskDto(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  axis: string | null;
  customerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { companyName: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
  assignedMember: { firstName: string; lastName: string; email: string } | null;
}) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    source: task.source,
    axis: task.axis,
    customerId: task.customerId,
    customerName: task.customer ? customerName(task.customer) : null,
    assignedMemberName: task.assignedMember ? memberName(task.assignedMember) : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function callEventIdFromExecutionEvent(eventId: string) {
  const aircallMatch = eventId.match(/^aircall:([^:]+):/);
  if (aircallMatch?.[1]) return aircallMatch[1];
  const transcriptResolverMatch = eventId.match(/^(acev_[^:]+)/);
  return transcriptResolverMatch?.[1] ?? null;
}

function sourceFromExecution(eventId: string, result: Record<string, unknown>) {
  const explicit = stringValue(result.source);
  if (explicit) return explicit;
  if (eventId.startsWith('aircall:')) return 'aircall';
  if (eventId.startsWith('acev_')) return 'ai_transcript';
  if (eventId.startsWith('segment-')) return 'segments';
  if (eventId.startsWith('backfill:')) return 'backfill';
  return null;
}

function executionMode(result: Record<string, unknown>): 'active' | 'shadow' | 'unknown' {
  if (result.executionMode === 'active' || result.executionMode === 'shadow') return result.executionMode;
  return 'unknown';
}

function traceArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function snippet(value: string | null) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 260) : null;
}

function memberName(member: { firstName: string; lastName: string; email: string }) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ').trim() || member.email;
}

function customerName(customer: { companyName: string | null; firstName: string | null; lastName: string | null; email: string | null }) {
  const person = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  return customer.companyName || person || customer.email || null;
}

function defaultRule(
  key: string,
  name: string,
  trigger: WorkflowRuleDefinition['trigger'],
  when: WorkflowRuleCondition[],
  actions: WorkflowRuleAction[],
  priority = 50,
): SaveWorkflowRuleInput {
  return {
    name,
    definition: {
      status: 'active',
      priority,
      composable: false,
      trigger,
      cooldown: { hours: 24, limit: 1 },
      metadata: {
        defaultRuleKey: key,
        source: 'dtfbank_default_workflow_rules',
      },
      when,
      actions,
    },
    comment: 'Default workflow rule bootstrap',
  };
}

function defaultCondition(
  id: string,
  condition: WorkflowRuleCondition['condition'],
  operator: WorkflowRuleCondition['operator'],
  value: string,
): WorkflowRuleCondition {
  return { id, condition, operator, value };
}

function defaultAction(
  id: string,
  action: WorkflowRuleAction['action'],
  value: string,
  axis?: WorkflowRuleAction['axis'],
): WorkflowRuleAction {
  return axis ? { id, action, value, axis } : { id, action, value };
}

function defaultRuleKeyFromInput(input: SaveWorkflowRuleInput) {
  return String(input.definition.metadata?.defaultRuleKey ?? input.name).trim();
}

function defaultRuleKeyFromDefinition(value: Prisma.JsonValue) {
  const parsed = workflowRuleDefinitionSchema.safeParse(value);
  if (!parsed.success) return null;
  const key = parsed.data.metadata?.defaultRuleKey;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

function defaultRuleNeedsRefresh(current: Prisma.JsonValue, desired: WorkflowRuleDefinition) {
  const parsed = workflowRuleDefinitionSchema.safeParse(current);
  if (!parsed.success) return true;
  return JSON.stringify(canonicalDefaultRuleDefinition(parsed.data)) !== JSON.stringify(canonicalDefaultRuleDefinition(desired));
}

function canonicalDefaultRuleDefinition(definition: WorkflowRuleDefinition) {
  return {
    status: definition.status,
    priority: definition.priority,
    composable: definition.composable,
    trigger: definition.trigger,
    cooldown: definition.cooldown ?? null,
    metadata: definition.metadata ?? {},
    when: definition.when,
    whenGroups: definition.whenGroups ?? [],
    actions: definition.actions,
  };
}

function toBackfillReportDto(report: {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: string;
  recentDays: number;
  status: string;
  windowStart: Date;
  windowEnd: Date;
  evaluatedEvents: number;
  matchedEvents: number;
  skippedEvents: number;
  wouldCreateTasks: number;
  actualTasksCreated: number;
  createdByMemberId: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  result: Prisma.JsonValue;
}): WorkflowRuleBackfillReportDto {
  return {
    id: report.id,
    ruleId: report.ruleId,
    ruleName: report.ruleName,
    trigger: report.trigger,
    recentDays: report.recentDays,
    status: report.status === 'failed' ? 'failed' : 'completed',
    windowStart: report.windowStart.toISOString(),
    windowEnd: report.windowEnd.toISOString(),
    evaluatedEvents: report.evaluatedEvents,
    matchedEvents: report.matchedEvents,
    skippedEvents: report.skippedEvents,
    wouldCreateTasks: report.wouldCreateTasks,
    actualTasksCreated: report.actualTasksCreated,
    createdByMemberId: report.createdByMemberId,
    createdAt: report.createdAt.toISOString(),
    finishedAt: report.finishedAt?.toISOString() ?? null,
    result: backfillResult(report.result),
  };
}

function backfillResult(value: Prisma.JsonValue) {
  const record = asRecord(value);
  const rawSamples = Array.isArray(record.samples) ? record.samples : [];
  return {
    noMutation: record.noMutation === true,
    candidateSource: String(record.candidateSource ?? 'unknown'),
    sampleLimit: typeof record.sampleLimit === 'number' ? record.sampleLimit : rawSamples.length,
    ruleDefinitionHash: typeof record.ruleDefinitionHash === 'string' ? record.ruleDefinitionHash : null,
    samples: rawSamples.map((sample) => sample as WorkflowRuleBackfillSample),
  };
}

function ruleDefinitionHash(definition: WorkflowRuleDefinition) {
  return createHash('sha256')
    .update(stableJson(canonicalDefaultRuleDefinition(definition)))
    .digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function backfillCandidateSource(trigger: WorkflowTriggerFireInput['trigger']) {
  if (trigger.includes('order')) return 'commerce_orders';
  if (trigger.startsWith('aircall.') || trigger.includes('call') || trigger.includes('transcript') || trigger.includes('psych') || trigger.includes('product.detected')) {
    return 'aircall_call_events';
  }
  if (trigger.startsWith('segment.')) return 'segment_customer_memberships';
  if (trigger.startsWith('support.') || trigger.startsWith('task.')) return 'service_requests';
  return 'customers';
}

function priorityForRule(priority: number): 'critical' | 'high' | 'medium' | 'low' {
  if (priority >= 90) return 'critical';
  if (priority >= 70) return 'high';
  if (priority >= 30) return 'medium';
  return 'low';
}

function averageMs(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ruleHealth(fireCount: number, matchRate: number, avgLatencyMs: number | null): ActiveWorkflowRuleStatsResponse['rows'][number]['health'] {
  if (fireCount === 0) return 'dead';
  if (fireCount >= 5 && matchRate >= 80) return 'loose';
  if (avgLatencyMs !== null && avgLatencyMs > 5000) return 'loose';
  return 'healthy';
}

function compareCondition(actual: unknown, operator: string, expected: string, confidenceGte?: number) {
  if (confidenceGte !== undefined && hasConfidence(actual) && actual.confidence < confidenceGte) return false;
  if (operator === '=') return valueEquals(actual, expected);
  if (operator === '!=') return !valueEquals(actual, expected);
  if (operator === 'contains') return containsValue(actual, expected);
  if (operator === 'in') return inList(actual, expected);
  if (operator === 'not_in') return !inList(actual, expected);
  const actualNumber = numberValue(actual);
  const expectedNumber = numberFromExpected(expected);
  if (actualNumber === null || expectedNumber === null) return false;
  if (operator === '>=') return actualNumber >= expectedNumber;
  if (operator === '<=') return actualNumber <= expectedNumber;
  return false;
}

function valueEquals(actual: unknown, expected: string): boolean {
  if (Array.isArray(actual)) return actual.some((entry) => valueEquals(entry, expected));
  if (typeof actual === 'boolean') return actual === (expected === 'true');
  const actualNumber = numberValue(actual);
  const expectedNumber = numberFromExpected(expected);
  if (actualNumber !== null && expectedNumber !== null) return actualNumber === expectedNumber;
  return normalize(actual) === normalize(expected);
}

function containsValue(actual: unknown, expected: string): boolean {
  if (Array.isArray(actual)) return actual.some((entry) => containsValue(entry, expected));
  return normalize(actual).includes(normalize(expected));
}

function inList(actual: unknown, expected: string) {
  const expectedValues = expected.split(',').map((entry) => normalize(entry)).filter(Boolean);
  if (Array.isArray(actual)) return actual.some((entry) => expectedValues.includes(normalize(entry)));
  return expectedValues.includes(normalize(actual));
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeTaskAxis(value: unknown): TaskAxis | null {
  const raw = normalize(value);
  if (!raw) return null;
  if (['sales', 'sale', 'selling', 'revenue'].some((key) => raw === key || raw.includes(key))) return 'sales';
  if (['order', 'quote', 'invoice', 'discount', 'pricing', 'commission'].some((key) => raw.includes(key))) return 'sales';
  if (['support', 'service', 'complaint', 'refund', 'shipping', 'artwork', 'quality', 'ticket'].some((key) => raw.includes(key))) return 'support';
  if (['account', 'accounts', 'billing', 'b2b', 'access', 'subuser', 'login'].some((key) => raw.includes(key))) return 'account';
  return null;
}

function axisRoleScore(
  axis: TaskAxis,
  roles: Array<{ slug: string; name: string; permissions: unknown }>,
) {
  const keywords: Record<TaskAxis, string[]> = {
    sales: ['sales', 'sale', 'order', 'pricing', 'commission'],
    support: ['support', 'service', 'customer_service', 'aircall'],
    account: ['account', 'b2b', 'billing', 'access', 'subuser', 'customer'],
  };
  let score = 0;
  for (const role of roles) {
    const slug = normalize(role.slug);
    const name = normalize(role.name);
    const permissions = asRecord(role.permissions);
    const permissionKeys = Object.entries(permissions)
      .filter(([, enabled]) => enabled === true)
      .map(([permission]) => normalize(permission));
    const haystack = [slug, name, ...permissionKeys].join(' ');
    if (keywords[axis].some((keyword) => haystack.includes(keyword))) score = Math.max(score, 120);
    if (axis === 'sales' && permissionKeys.some((permission) => permission.includes('orders') || permission.includes('pricing'))) score = Math.max(score, 90);
    if (axis === 'support' && permissionKeys.some((permission) => permission.includes('support') || permission.includes('task.assign'))) score = Math.max(score, 90);
    if (axis === 'account' && permissionKeys.some((permission) => permission.includes('customers') || permission.includes('b2b_access') || permission.includes('identity'))) score = Math.max(score, 90);
    if (slug === 'admin') score = Math.max(score, 60);
    if (slug === 'owner') score = Math.max(score, 50);
  }
  return score;
}

function axisMemberEmailScore(axis: TaskAxis, email: string | null | undefined) {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail) return 0;
  const preferredEmails: Record<TaskAxis, string[]> = {
    sales: ['ihsan@dtfbank.com'],
    support: ['dtfbanktx@gmail.com', 'charlette@dtfbank.com'],
    account: ['info@dtfbank.com'],
  };
  const index = preferredEmails[axis].indexOf(normalizedEmail);
  return index === -1 ? 0 : 1_000 - index;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return numberFromExpected(value);
  return null;
}

function numberFromExpected(value: string) {
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasConfidence(value: unknown): value is { confidence: number } {
  return Boolean(value && typeof value === 'object' && typeof (value as { confidence?: unknown }).confidence === 'number');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return numberFromExpected(value);
  return null;
}

function booleanParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function dateParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function arrayParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function valueArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean)));
}

function slug(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pinned';
}

function productValues(params: Record<string, unknown>, resolverOutput: Record<string, unknown>) {
  const direct = [
    stringParam(params, 'product'),
    stringParam(params, 'productSku'),
    stringParam(params, 'sku'),
    stringParam(params, 'productName'),
  ];
  const productMentions = Array.isArray(params.productMentions) ? params.productMentions : params.products;
  const lineItems = Array.isArray(params.lineItems) ? params.lineItems : null;
  const resolverMentions = Array.isArray(resolverOutput.product_mentions) ? resolverOutput.product_mentions : [];
  return uniqueStrings([
    ...direct,
    ...extractProductValues(productMentions),
    ...extractProductValues(lineItems),
    ...extractProductValues(resolverMentions),
  ]);
}

function extractProductValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    const record = asRecord(entry);
    return [
      record.sku,
      record.name,
      record.title,
      record.name_hint,
      record.product_title,
      record.variant_title,
    ].map((item) => typeof item === 'string' ? item : null);
  }).filter((entry): entry is string => Boolean(entry));
}

function windowDays(value: string) {
  const numbers = String(value).match(/\d+(\.\d+)?/g);
  if (!numbers?.length) return 30;
  const last = Number(numbers[numbers.length - 1]);
  return Number.isFinite(last) && last > 0 ? last : 30;
}

function dayName(date: Date) {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
}
