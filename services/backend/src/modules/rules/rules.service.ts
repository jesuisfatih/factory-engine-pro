import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  fireWorkflowTriggerSchema,
  saveWorkflowRuleSchema,
  WORKFLOW_ENUM_CATALOG,
  WORKFLOW_ENUM_COUNTS,
  WORKFLOW_ENUM_VERSION,
  workflowRuleDefinitionSchema,
  workflowEnumProbeValues,
  type WorkflowActionTrace,
  type SaveWorkflowRuleInput,
  type WorkflowConditionTrace,
  type WorkflowEnumCatalogResponse,
  type WorkflowEnumChainProbeResponse,
  type WorkflowRuleAction,
  type WorkflowRuleCondition,
  type WorkflowTriggerFireInput,
  type WorkflowTriggerFireResponse,
  type WorkflowRuleDto,
  type WorkflowRulesResponse,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { SupportService } from '../support/support.service.js';
import { RulesRepository } from './rules.repository.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Injectable()
export class RulesService {
  constructor(
    private readonly repository: RulesRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
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
      const state = await this.resolveConditionState(parsed.params);
      const conditionTrace = await this.resolveConditions(rule.definition.when, state);
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
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: actionStatus,
        ...(actionStatus === 'skipped' ? { reason: 'actions_skipped' as const } : {}),
        taskIds,
        conditionTrace,
        actionTrace,
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

  private async applyAction(action: WorkflowRuleAction, context: {
    eventId: string;
    trigger: WorkflowTriggerFireInput['trigger'];
    source: string;
    occurredAt: string | null;
    params: Record<string, unknown>;
    rule: WorkflowRuleDto;
    state: Awaited<ReturnType<RulesService['resolveConditionState']>>;
    conditionTrace: WorkflowConditionTrace[];
    taskIds: string[];
  }): Promise<{ trace: WorkflowActionTrace; task?: { id: string; title: string } }> {
    this.executor.recognizeAction(action.action);
    let result: { trace: WorkflowActionTrace; task?: { id: string; title: string } };

    if (action.action === 'create_task') {
      const task = await this.support.create({
        customerId: context.state.customer?.id,
        title: action.value?.trim() || `Workflow task: ${context.rule.name}`,
        description: `Created by workflow rule "${context.rule.name}" for trigger "${context.trigger}".`,
        source: 'manual',
        surface: 'internal',
        priority: priorityForRule(context.rule.priority),
        metadata: this.workflowMetadata(action, context),
      });
      result = {
        task: { id: task.id, title: task.title },
        trace: {
          actionId: action.id,
          action: action.action,
          status: 'applied',
          targetType: 'service_request',
          targetId: task.id,
          message: 'Created service request from workflow action.',
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
      });
    }
    return result;
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
    const member = await this.findMember(action.value || stringParam(context.params, 'watcherMemberId') || stringParam(context.params, 'memberId'));
    if (!member) return skippedTrace(action, 'member', 'Member target was not found.');
    const updated = await this.updateTaskWorkflow(taskId, (workflow) => ({
      ...workflow,
      watchers: uniqueStrings([...arrayParam(workflow, 'watchers'), member.id]),
      watcherEvents: [...recordArray(workflow.watcherEvents), { memberId: member.id, eventId: context.eventId, at: new Date().toISOString() }],
    }));
    if (!updated) return skippedTrace(action, 'service_request', 'Service request target was not found for add_watcher.');
    return {
      trace: {
        actionId: action.id,
        action: action.action,
        status: 'applied' as const,
        targetType: 'service_request' as const,
        targetId: taskId,
        message: 'Added member watcher to service request metadata.',
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

  private workflowMetadata(action: WorkflowRuleAction, context: WorkflowActionContext) {
    return {
      category: 'workflow_rule',
      workflow: {
        eventId: context.eventId,
        trigger: context.trigger,
        source: context.source,
        occurredAt: context.occurredAt,
        params: context.params,
        ruleId: context.rule.id,
        ruleName: context.rule.name,
        actionId: action.id,
        action: action.action,
        rulePriority: context.rule.priority,
        conditionTrace: context.conditionTrace,
      },
    };
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

type WorkflowActionContext = {
  eventId: string;
  trigger: WorkflowTriggerFireInput['trigger'];
  source: string;
  occurredAt: string | null;
  params: Record<string, unknown>;
  rule: WorkflowRuleDto;
  state: Awaited<ReturnType<RulesService['resolveConditionState']>>;
  conditionTrace: WorkflowConditionTrace[];
  taskIds: string[];
};

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
