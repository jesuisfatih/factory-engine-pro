import type {
  WorkflowAction,
  WorkflowCondition,
  WorkflowEnumCatalogResponse,
  WorkflowEnumChainProbeResponse,
  WorkflowRuleDto,
  WorkflowRuleBackfillReportsResponse,
  WorkflowRuleExecutionsResponse,
  WorkflowRuleVersionsResponse,
  WorkflowTrigger,
  SaveWorkflowRuleInput,
  SweepOverdueServiceRequestsResponse,
  WorkflowTriggerFireInput,
  ActiveWorkflowRuleStatsResponse,
} from '@factory-engine-pro/contracts';
import { adminApi } from './api';

export type RuleLifecycle = 'draft' | 'shadow' | 'active' | 'archived';
export type ConditionOperator = '=' | '!=' | '>=' | '<=' | 'contains' | 'in' | 'not_in';

export interface RuleDraftCondition {
  id: string;
  condition: WorkflowCondition;
  operator: ConditionOperator;
  value: string;
  confidenceGte?: number;
}

export interface RuleDraftAction {
  id: string;
  action: WorkflowAction;
  value: string;
}

export interface RuleDraftWhenGroup {
  id: string;
  conditions: RuleDraftCondition[];
}

export interface RuleDraft {
  name: string;
  status: RuleLifecycle;
  priority: number;
  composable: boolean;
  cooldownHours: number;
  cooldownLimit: number;
  trigger: WorkflowTrigger;
  when: RuleDraftCondition[];
  whenGroups: RuleDraftWhenGroup[];
  actions: RuleDraftAction[];
}

export function fetchWorkflowCatalog(): Promise<WorkflowEnumCatalogResponse> {
  return adminApi.workflowEnumCatalog();
}

export function verifyWorkflowEnumChain(): Promise<WorkflowEnumChainProbeResponse> {
  return adminApi.workflowEnumChainProbe();
}

export function fetchWorkflowRules() {
  return adminApi.workflowRules();
}

export function fetchWorkflowRuleActiveStats(days = 30): Promise<ActiveWorkflowRuleStatsResponse> {
  return adminApi.workflowRuleActiveStats(`?days=${encodeURIComponent(String(days))}`);
}

export function saveWorkflowRule(draft: RuleDraft, id?: string) {
  const input: SaveWorkflowRuleInput = {
    name: draft.name,
    comment: id ? 'Edited from rules canvas' : 'Created from rules canvas',
    definition: {
      status: draft.status,
      priority: draft.priority,
      composable: draft.composable,
      cooldown: draft.cooldownHours === 0
        ? 0
        : { hours: draft.cooldownHours, limit: draft.cooldownLimit },
      trigger: draft.trigger,
      when: draft.when,
      whenGroups: draft.whenGroups.length > 0 ? draft.whenGroups : undefined,
      actions: draft.actions,
    },
  };
  return id ? adminApi.updateWorkflowRule(id, input) : adminApi.createWorkflowRule(input);
}

export function fireWorkflowTrigger(input: WorkflowTriggerFireInput) {
  return adminApi.fireWorkflowTrigger(input);
}

export function fetchWorkflowRuleVersions(id: string): Promise<WorkflowRuleVersionsResponse> {
  return adminApi.workflowRuleVersions(id);
}

export function rollbackWorkflowRule(id: string, versionNo: number) {
  return adminApi.rollbackWorkflowRule(id, {
    versionNo,
    comment: `Rollback from rules canvas to v${versionNo}`,
  });
}

export function runWorkflowRuleBackfill(id: string, recentDays = 7) {
  return adminApi.backfillWorkflowRule(id, { recentDays, limit: 100 });
}

export function runOverdueTaskSweep(): Promise<SweepOverdueServiceRequestsResponse> {
  return adminApi.sweepOverdueSupportRequests({ limit: 100 });
}

export function fetchWorkflowRuleBackfills(id: string): Promise<WorkflowRuleBackfillReportsResponse> {
  return adminApi.workflowRuleBackfills(id);
}

export function fetchWorkflowRuleExecutions(id: string): Promise<WorkflowRuleExecutionsResponse> {
  return adminApi.workflowRuleExecutions(id);
}

export function draftFromWorkflowRule(rule: WorkflowRuleDto): RuleDraft {
  const cooldown = cooldownFromDefinition(rule.definition.cooldown);
  return {
    name: rule.name,
    status: rule.definition.status,
    priority: rule.definition.priority,
    composable: rule.definition.composable,
    cooldownHours: cooldown.hours,
    cooldownLimit: cooldown.limit,
    trigger: rule.definition.trigger,
    when: rule.definition.when,
    whenGroups: rule.definition.whenGroups ?? [],
    actions: rule.definition.actions,
  };
}

export function makeRuleDraft(catalog: WorkflowEnumCatalogResponse): RuleDraft {
  return {
    name: 'New workflow rule',
    status: 'draft',
    priority: 50,
    composable: false,
    cooldownHours: 24,
    cooldownLimit: 1,
    trigger: catalog.triggers[0]?.value ?? 'manual.trigger',
    when: [makeCondition(catalog)],
    whenGroups: [],
    actions: [makeAction(catalog)],
  };
}

export function makeCondition(catalog: WorkflowEnumCatalogResponse): RuleDraftCondition {
  const condition = catalog.conditions[0];
  return {
    id: `cond-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    condition: condition?.value ?? 'call_intent',
    operator: defaultOperator(condition?.valueType ?? 'enum'),
    value: defaultValue(condition?.optionSource ?? 'call_intents', catalog),
    confidenceGte: condition?.aiDerived ? 0.8 : undefined,
  };
}

export function makeAction(catalog: WorkflowEnumCatalogResponse): RuleDraftAction {
  return {
    id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    action: catalog.actions[0]?.value ?? 'create_task',
    value: '',
  };
}

export function defaultOperator(valueType: WorkflowEnumCatalogResponse['conditions'][number]['valueType']): ConditionOperator {
  if (valueType === 'number' || valueType === 'window') return '>=';
  if (valueType === 'boolean') return '=';
  if (valueType === 'range') return 'in';
  return '=';
}

export function defaultValue(
  optionSource: WorkflowEnumCatalogResponse['conditions'][number]['optionSource'],
  catalog: WorkflowEnumCatalogResponse,
) {
  if (optionSource === 'call_intents') return catalog.callIntents[0]?.value ?? '';
  if (optionSource === 'psych_tags') return catalog.psychTags[0]?.value ?? '';
  return '';
}

export function cooldownFromDefinition(cooldown: WorkflowRuleDto['definition']['cooldown']): { hours: number; limit: number } {
  if (cooldown === undefined) return { hours: 24, limit: 1 };
  if (typeof cooldown === 'number') return { hours: cooldown, limit: 1 };
  return { hours: cooldown.hours, limit: cooldown.limit };
}

export function cooldownLabel(cooldown: WorkflowRuleDto['definition']['cooldown']) {
  const normalized = cooldownFromDefinition(cooldown);
  if (normalized.hours === 0) return 'cooldown off';
  return `${normalized.limit}/${normalized.hours}h cooldown`;
}

export const LIFECYCLE_TONE: Record<RuleLifecycle, string> = {
  draft: '',
  shadow: 'warn',
  active: 'success',
  archived: 'danger',
};
