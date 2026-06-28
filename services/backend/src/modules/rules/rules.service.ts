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
  type WorkflowEnumCatalogResponse,
  type WorkflowEnumChainProbeResponse,
  type WorkflowTriggerFireInput,
  type WorkflowTriggerFireResponse,
  type WorkflowRuleDto,
  type WorkflowRulesResponse,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { SupportService } from '../support/support.service.js';
import { RulesRepository } from './rules.repository.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Injectable()
export class RulesService {
  constructor(
    private readonly repository: RulesRepository,
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
      if (rule.definition.when.length > 0) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'skipped',
          reason: 'conditions_pending_resolver',
          taskIds: [],
        });
        this.logger.log('rules', 'trigger_rule_skipped', 'Workflow rule skipped until condition resolver is enabled', {
          event_id: eventId,
          trigger: parsed.trigger,
          rule_id: rule.id,
          reason: 'conditions_pending_resolver',
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
