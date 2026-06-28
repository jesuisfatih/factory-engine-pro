import type {
  WorkflowAction,
  WorkflowCondition,
  WorkflowEnumCatalogResponse,
  WorkflowEnumChainProbeResponse,
  WorkflowRuleDto,
  WorkflowTrigger,
  SaveWorkflowRuleInput,
  WorkflowTriggerFireInput,
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

export function saveWorkflowRule(draft: RuleDraft, id?: string) {
  const input: SaveWorkflowRuleInput = {
    name: draft.name,
    definition: {
      status: draft.status,
      priority: draft.priority,
      composable: draft.composable,
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

export function draftFromWorkflowRule(rule: WorkflowRuleDto): RuleDraft {
  return {
    name: rule.name,
    status: rule.definition.status,
    priority: rule.definition.priority,
    composable: rule.definition.composable,
    trigger: rule.definition.trigger,
    when: rule.definition.when,
    whenGroups: rule.definition.whenGroups ?? [],
    actions: rule.definition.actions,
  };
}

export function makeRuleDraft(catalog: WorkflowEnumCatalogResponse): RuleDraft {
  return {
    name: 'Enum chain smoke rule',
    status: 'draft',
    priority: 50,
    composable: false,
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

export const LIFECYCLE_TONE: Record<RuleLifecycle, string> = {
  draft: '',
  shadow: 'warn',
  active: 'success',
  archived: 'danger',
};
