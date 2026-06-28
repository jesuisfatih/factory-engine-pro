import type {
  WorkflowAction,
  WorkflowCondition,
  WorkflowEnumCatalogResponse,
  WorkflowEnumChainProbeResponse,
  WorkflowTrigger,
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

export interface RuleDraft {
  name: string;
  status: RuleLifecycle;
  priority: number;
  composable: boolean;
  trigger: WorkflowTrigger;
  when: RuleDraftCondition[];
  actions: RuleDraftAction[];
}

export function fetchWorkflowCatalog(): Promise<WorkflowEnumCatalogResponse> {
  return adminApi.workflowEnumCatalog();
}

export function verifyWorkflowEnumChain(): Promise<WorkflowEnumChainProbeResponse> {
  return adminApi.workflowEnumChainProbe();
}

export function makeRuleDraft(catalog: WorkflowEnumCatalogResponse): RuleDraft {
  return {
    name: 'Enum chain smoke rule',
    status: 'draft',
    priority: 50,
    composable: false,
    trigger: catalog.triggers[0]?.value ?? 'manual.trigger',
    when: [makeCondition(catalog)],
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
