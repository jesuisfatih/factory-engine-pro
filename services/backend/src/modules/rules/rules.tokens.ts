import type { WorkflowTriggerFireInput, WorkflowTriggerFireResponse } from '@factory-engine-pro/contracts';

export const RULES_RUNTIME = 'RULES_RUNTIME';

export interface RulesRuntime {
  fireTrigger(input: WorkflowTriggerFireInput): Promise<WorkflowTriggerFireResponse>;
}
