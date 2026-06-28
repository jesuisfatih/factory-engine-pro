import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  fireWorkflowTriggerSchema,
  saveWorkflowRuleSchema,
  WORKFLOW_ENUM_CATALOG,
  WORKFLOW_ENUM_COUNTS,
  WORKFLOW_ENUM_VERSION,
  workflowRuleDefinitionSchema,
  workflowEnumProbeValues,
  type SaveWorkflowRuleInput,
  type WorkflowConditionTrace,
  type WorkflowEnumCatalogResponse,
  type WorkflowEnumChainProbeResponse,
  type WorkflowRuleCondition,
  type WorkflowTriggerFireInput,
  type WorkflowTriggerFireResponse,
  type WorkflowRuleDto,
  type WorkflowRulesResponse,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { SupportService } from '../support/support.service.js';
import { RulesRepository } from './rules.repository.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Injectable()
export class RulesService {
  constructor(
    private readonly repository: RulesRepository,
    private readonly prisma: PrismaService,
    private readonly support: SupportService,
    private readonly executor: WorkflowExecutorService,
    private readonly prompt: WorkflowPromptService,
    private readonly logger: AppLogger,
  ) {}

  async listRules(): Promise<WorkflowRulesResponse> {
    const rules = await this.repository.list();
    return { rules: rules.map(toDto) };
  }

  async getRule(id: string): Promise<WorkflowRuleDto> {
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    return toDto(rule);
  }

  async fireTrigger(input: WorkflowTriggerFireInput): Promise<WorkflowTriggerFireResponse> {
    const parsed = fireWorkflowTriggerSchema.parse(input);
    this.executor.recognizeTrigger(parsed.trigger);

    const eventId = parsed.eventId ?? `wevt_${randomUUID()}`;
    const rules = await this.repository.findActiveByTrigger(parsed.trigger);
    const tasks: WorkflowTriggerFireResponse['tasks'] = [];
    const results: WorkflowTriggerFireResponse['results'] = [];

    for (const row of rules) {
      const rule = toDto(row);
      const conditionTrace = await this.resolveConditions(rule.definition.when, parsed.params);
      const conditionsMatched = conditionTrace.every((entry) => entry.matched);
      this.logger.log(
        'rules',
        conditionsMatched ? 'conditions_matched' : 'conditions_not_matched',
        'Workflow rule condition trace evaluated',
        {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          matched: conditionsMatched,
          condition_trace: conditionTrace,
        },
      );
      if (!conditionsMatched) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'skipped',
          reason: 'conditions_not_matched',
          taskIds: [],
          conditionTrace,
        });
        continue;
      }

      const taskIds: string[] = [];
      let unsupportedAction = false;
      for (const action of rule.definition.actions) {
        if (action.action !== 'create_task') {
          unsupportedAction = true;
          continue;
        }
        const task = await this.support.create({
          title: action.value?.trim() || `Workflow task: ${rule.name}`,
          description: `Created by workflow rule "${rule.name}" for trigger "${parsed.trigger}".`,
          source: 'manual',
          surface: 'internal',
          priority: priorityForRule(rule.priority),
          metadata: {
            category: 'workflow_rule',
            workflow: {
              eventId,
              trigger: parsed.trigger,
              source: parsed.source,
              occurredAt: parsed.occurredAt ?? null,
              params: parsed.params,
              ruleId: rule.id,
              ruleName: rule.name,
              actionId: action.id,
              action: action.action,
              rulePriority: rule.priority,
              conditionTrace,
            },
          },
        });
        taskIds.push(task.id);
        tasks.push({
          ruleId: rule.id,
          ruleName: rule.name,
          actionId: action.id,
          action: action.action,
          taskId: task.id,
          title: task.title,
        });
        this.logger.log('rules', 'workflow_task_created', 'Workflow rule created a task', {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          action_id: action.id,
          task_id: task.id,
        });
      }

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: taskIds.length > 0 ? 'task_created' : 'skipped',
        ...(taskIds.length === 0 && unsupportedAction ? { reason: 'unsupported_action' as const } : {}),
        taskIds,
        conditionTrace,
      });
    }

    const response: WorkflowTriggerFireResponse = {
      eventId,
      trigger: parsed.trigger,
      source: parsed.source,
      matchedRules: rules.length,
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
      matched_rules: response.matchedRules,
      tasks_created: response.tasksCreated,
    });
    return response;
  }

  private async resolveConditions(
    conditions: WorkflowRuleCondition[],
    params: Record<string, unknown>,
  ): Promise<WorkflowConditionTrace[]> {
    if (conditions.length === 0) return [];
    const state = await this.resolveConditionState(params);
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
      return { value: uniqueStrings([...(arrayParam(params, 'psychTags')), stringParam(params, 'tag'), ...(arrayParam(state.resolverOutput, 'psych_tags'))]), source: 'event_or_resolver' };
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

  async createRule(input: SaveWorkflowRuleInput): Promise<WorkflowRuleDto> {
    const parsed = saveWorkflowRuleSchema.parse(input);
    const rule = await this.repository.create(parsed);
    this.logger.log('rules', 'rule_saved', 'Workflow rule persisted', {
      rule_id: rule.id,
      status: rule.status,
      trigger: rule.trigger,
      priority: rule.priority,
    });
    return toDto(rule);
  }

  async updateRule(id: string, input: SaveWorkflowRuleInput): Promise<WorkflowRuleDto> {
    const parsed = saveWorkflowRuleSchema.parse(input);
    const result = await this.repository.update(id, parsed);
    if (result.count === 0) throw new NotFoundException('Workflow rule was not found.');
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Workflow rule was not found.');
    this.logger.log('rules', 'rule_saved', 'Workflow rule persisted', {
      rule_id: rule.id,
      status: rule.status,
      trigger: rule.trigger,
      priority: rule.priority,
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
      triggers: [...WORKFLOW_ENUM_CATALOG.triggers],
      triggerGroups: Object.fromEntries(
        Object.entries(WORKFLOW_ENUM_CATALOG.triggerGroups).map(([family, values]) => [family, [...values]]),
      ),
      conditions: [...WORKFLOW_ENUM_CATALOG.conditions],
      actions: [...WORKFLOW_ENUM_CATALOG.actions],
      counts: { ...WORKFLOW_ENUM_CATALOG.counts },
    };
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

function priorityForRule(priority: number): 'critical' | 'high' | 'medium' | 'low' {
  if (priority >= 90) return 'critical';
  if (priority >= 70) return 'high';
  if (priority >= 30) return 'medium';
  return 'low';
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean)));
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
