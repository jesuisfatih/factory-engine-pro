import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  activeWorkflowRuleStatsQuerySchema,
  backfillWorkflowRuleSchema,
  fireWorkflowTriggerSchema,
  rollbackWorkflowRuleSchema,
  saveWorkflowRuleSchema,
  WORKFLOW_ENUM_CATALOG,
  WORKFLOW_ENUM_COUNTS,
  WORKFLOW_ENUM_VERSION,
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
  type WorkflowRuleDto,
  type WorkflowRuleBackfillReportDto,
  type WorkflowRuleBackfillReportsResponse,
  type WorkflowRuleBackfillRunResponse,
  type WorkflowRuleBackfillSample,
  type WorkflowRuleExecutionsResponse,
  type WorkflowRuleVersionsResponse,
  type WorkflowRulesResponse,
  type WorkflowTrigger,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { CustomersService } from '../customers/customers.service.js';
import { MailService } from '../mail/mail.service.js';
import { SupportService } from '../support/support.service.js';
import { RulesRepository } from './rules.repository.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

const DEFAULT_WORKFLOW_RULES: SaveWorkflowRuleInput[] = [
  defaultRule(
    'psych_angry_support_task',
    'Default: Angry customer support follow-up',
    'psych.tag.detected',
    [defaultCondition('tag_angry', 'psych_tag_includes', '=', 'angry')],
    [defaultAction('support_case_manual_only', 'no-op', 'Support intent detected; Support cases are created manually.')],
    70,
  ),
  defaultRule(
    'psych_purchase_intent_sales_task',
    'Default: Purchase intent sales follow-up',
    'psych.tag.detected',
    [defaultCondition('tag_purchase_intent', 'psych_tag_includes', '=', 'purchase_intent')],
    [defaultAction('create_sales_task', 'create_task', 'sales: Purchase intent follow-up')],
  ),
  defaultRule(
    'psych_shipping_issue_support_escalation',
    'Default: Shipping issue escalation',
    'psych.tag.detected',
    [defaultCondition('tag_shipping_issue', 'psych_tag_includes', '=', 'shipping_issue')],
    [
      defaultAction('support_case_manual_only', 'no-op', 'Shipping support intent detected; Support cases are created manually.'),
    ],
    70,
  ),
  defaultRule(
    'psych_refund_intent_support_account_watcher',
    'Default: Refund intent support task',
    'psych.tag.detected',
    [defaultCondition('tag_refund_intent', 'psych_tag_includes', '=', 'refund_intent')],
    [
      defaultAction('add_account_watcher', 'add_watcher', 'account'),
    ],
    70,
  ),
  defaultRule(
    'customer_first_call_account_onboarding',
    'Default: First call account onboarding',
    'customer.first_call.detected',
    [],
    [defaultAction('create_account_task', 'create_task', 'account: First call onboarding')],
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
    'aircall_missed_call_support_callback',
    'Default: Missed call callback',
    'aircall.call.missed',
    [],
    [defaultAction('missed_call_manual_review', 'no-op', 'Missed support callback requires manual staff review.')],
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
    const existingKeys = new Set(existing.map((rule) => defaultRuleKeyFromDefinition(rule.definition)).filter(Boolean));
    const existingNames = new Set(existing.map((rule) => rule.name.trim().toLowerCase()));
    const created: WorkflowRuleDto[] = [];
    const skippedKeys: string[] = [];

    for (const input of DEFAULT_WORKFLOW_RULES) {
      const key = defaultRuleKeyFromInput(input);
      if (existingKeys.has(key) || existingNames.has(input.name.trim().toLowerCase())) {
        skippedKeys.push(key);
        continue;
      }
      const rule = await this.repository.create(input, this.editedByMemberId());
      created.push(toDto(rule));
    }

    this.logger.log('rules', 'default_rules_bootstrap', 'Default workflow rules bootstrap completed', {
      created: created.length,
      skipped: skippedKeys.length,
      total_defaults: DEFAULT_WORKFLOW_RULES.length,
      skipped_keys: skippedKeys,
    });

    return {
      created: created.length,
      skipped: skippedKeys.length,
      totalDefaults: DEFAULT_WORKFLOW_RULES.length,
      rules: created,
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

      const execution = await this.repository.claimExecution({
        eventId,
        ruleId: rule.id,
        trigger: parsed.trigger,
      });
      if (!execution) {
        this.logger.log('rules', 'event_duplicate_skipped', 'Duplicate workflow event/rule execution skipped', {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          execution_mode: rule.status === 'shadow' ? 'shadow' : 'active',
          short_circuited: rule.status === 'active' && !rule.composable,
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

      const cooldown = await this.evaluateCooldown(rule, state);
      if (!cooldown.allowed) {
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
          status: 'skipped',
          reason: 'cooldown',
          executionMode: 'active',
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
        continue;
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
      await this.recordCooldownFire(rule, cooldown, actionStatus);

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
    const matched = conditionsMatched && (cooldown?.allowed ?? true);
    return {
      eventId: candidate.eventId,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      occurredAt: candidate.occurredAt.toISOString(),
      customerId: state.customer?.id ?? null,
      matched,
      status: matched ? 'shadow_matched' : 'skipped',
      ...(conditionsMatched && cooldown && !cooldown.allowed ? { reason: 'cooldown' as const } : {}),
      ...(!conditionsMatched ? { reason: 'conditions_not_matched' as const } : {}),
      wouldCreateTaskCount: matched
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
    } else if (action.action === 'add_watcher') {
      result = await this.addTaskWatcher(action, context);
    } else if (action.action === 'escalate') {
      result = await this.escalateTask(action, context);
    } else if (action.action === 'send_mail') {
      result = await this.sendMailDisabled(action, context);
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

  private async sendMailDisabled(action: WorkflowRuleAction, context: WorkflowActionContext) {
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
    const delivery = await this.mail.queueDisabledWorkflowMail({
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
    this.logger.warn('rules', 'workflow_send_mail_disabled', 'Workflow send_mail queued with provider disabled', {
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
        message: 'send_mail action queued a disabled mail delivery row; provider sending is off in Phase 1.',
        metadata: {
          sendingEnabled: false,
          providerMode: 'disabled',
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
    const customerPrimary = !explicitAssignee
      ? await this.customers.resolveAxisPrimaryMember(context.state.customer?.id, axis)
      : null;
    const candidates = await this.findAxisPrimaryMembers(axis);
    const candidateMembers = customerPrimary
      ? [customerPrimary.member, ...candidates.filter((member) => member.id !== customerPrimary.member.id)]
      : candidates;
    const assignee = explicitAssignee ?? customerPrimary?.member ?? candidateMembers[0] ?? null;
    const watcherMemberIds = uniqueStrings(candidateMembers.map((member) => member.id))
      .filter((memberId) => memberId !== assignee?.id);
    const assignment: TaskAssignment = {
      axis,
      assigneeMemberId: assignee?.id ?? null,
      watcherMemberIds,
      candidateMemberIds: candidateMembers.map((member) => member.id),
      customerAssignmentId: customerPrimary?.assignmentId ?? null,
      resolutionSource: explicitAssignee ? 'explicit_param' : customerPrimary ? 'customer_axis_primary' : 'axis_primary_role',
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

  private resolveTaskAxis(context: WorkflowActionContext, action?: WorkflowRuleAction): CreateTaskAxis {
    const valueAxis = normalizeTaskAxis(action?.value);
    if (valueAxis === 'support') return this.executor.requireCreateTaskAxis(valueAxis);
    const axis = action?.axis
      ?? valueAxis
      ?? normalizeTaskAxis(stringParam(context.params, 'axis'))
      ?? normalizeTaskAxis(stringParam(context.params, 'taskAxis'))
      ?? normalizeTaskAxis(stringParam(context.params, 'intent'))
      ?? normalizeTaskAxis(stringParam(context.params, 'callIntent'))
      ?? normalizeTaskAxis(stringParam(context.params, 'taskIntent'))
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
    this.validateCreateTaskAxes(parsed.definition);
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
    this.validateCreateTaskAxes(parsed.definition);
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

  private validateCreateTaskAxes(definition: WorkflowRuleDefinition) {
    for (const action of definition.actions) {
      if (action.action !== 'create_task') continue;
      const valueAxis = normalizeTaskAxis(action.value);
      if (valueAxis === 'support') this.executor.requireCreateTaskAxis(valueAxis);
      const axis = action.axis ?? valueAxis ?? 'sales';
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
  resolutionSource: 'explicit_param' | 'customer_axis_primary' | 'axis_primary_role';
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
    ['call_intent', 'psych_tags', 'product_mentions', 'urgency_level', 'summary']
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
): WorkflowRuleAction {
  return { id, action, value };
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
    samples: rawSamples.map((sample) => sample as WorkflowRuleBackfillSample),
  };
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
