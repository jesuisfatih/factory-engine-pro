import { z } from 'zod';
import { workflowActionSchema, workflowConditionSchema, workflowTriggerSchema, type WorkflowTrigger } from './enums.js';

export const workflowRuleStatusSchema = z.enum(['draft', 'shadow', 'active', 'archived']);
export type WorkflowRuleStatus = z.infer<typeof workflowRuleStatusSchema>;

export const workflowRuleConditionOperatorSchema = z.enum(['=', '!=', '>=', '<=', 'contains', 'in', 'not_in']);
export type WorkflowRuleConditionOperator = z.infer<typeof workflowRuleConditionOperatorSchema>;

export const workflowRuleConditionSchema = z.object({
  id: z.string().trim().min(1),
  condition: workflowConditionSchema,
  operator: workflowRuleConditionOperatorSchema,
  value: z.string(),
  confidenceGte: z.number().min(0).max(1).optional(),
});
export type WorkflowRuleCondition = z.infer<typeof workflowRuleConditionSchema>;

export const workflowRuleWhenGroupSchema = z.object({
  id: z.string().trim().min(1),
  conditions: z.array(workflowRuleConditionSchema).min(1),
});
export type WorkflowRuleWhenGroup = z.infer<typeof workflowRuleWhenGroupSchema>;

export const workflowRuleActionSchema = z.object({
  id: z.string().trim().min(1),
  action: workflowActionSchema,
  value: z.string(),
});
export type WorkflowRuleAction = z.infer<typeof workflowRuleActionSchema>;

export const workflowRuleCooldownSchema = z.union([
  z.coerce.number().min(0).max(8760),
  z.object({
    hours: z.coerce.number().min(0).max(8760),
    limit: z.coerce.number().int().min(1).max(100).default(1),
  }),
]);
export type WorkflowRuleCooldown = z.infer<typeof workflowRuleCooldownSchema>;

export const workflowRuleDefinitionSchema = z.object({
  status: workflowRuleStatusSchema,
  priority: z.coerce.number().int().min(0).max(1000),
  composable: z.boolean(),
  trigger: workflowTriggerSchema,
  cooldown: workflowRuleCooldownSchema.optional(),
  when: z.array(workflowRuleConditionSchema),
  whenGroups: z.array(workflowRuleWhenGroupSchema).optional(),
  actions: z.array(workflowRuleActionSchema).min(1),
});
export type WorkflowRuleDefinition = z.infer<typeof workflowRuleDefinitionSchema>;

export const saveWorkflowRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  definition: workflowRuleDefinitionSchema,
});
export type SaveWorkflowRuleInput = z.infer<typeof saveWorkflowRuleSchema>;

export interface WorkflowRuleDto {
  id: string;
  name: string;
  status: WorkflowRuleStatus;
  priority: number;
  composable: boolean;
  trigger: string;
  definition: WorkflowRuleDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRulesResponse {
  rules: WorkflowRuleDto[];
}

export const fireWorkflowTriggerSchema = z.object({
  trigger: workflowTriggerSchema,
  eventId: z.string().trim().min(1).max(180).optional(),
  source: z.string().trim().min(1).max(80).default('manual'),
  occurredAt: z.string().datetime().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowTriggerFireInput = z.infer<typeof fireWorkflowTriggerSchema>;

export interface WorkflowTriggerFireTask {
  ruleId: string;
  ruleName: string;
  actionId: string;
  action: string;
  taskId: string;
  title: string;
}

export interface WorkflowActionTrace {
  actionId: string;
  action: string;
  status: 'applied' | 'skipped';
  targetType: 'service_request' | 'customer' | 'segment_membership' | 'member' | 'audit';
  targetId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTriggerFireResult {
  ruleId: string;
  ruleName: string;
  status: 'task_created' | 'actions_applied' | 'no_op' | 'shadow_matched' | 'skipped';
  reason?: 'conditions_not_matched' | 'actions_skipped' | 'duplicate_event' | 'cooldown' | 'unsupported_action';
  executionMode?: 'active' | 'shadow';
  shortCircuited?: boolean;
  taskIds: string[];
  conditionTrace?: WorkflowConditionTrace[];
  whenTrace?: WorkflowWhenGroupTrace[];
  cooldown?: WorkflowCooldownTrace;
  actionTrace?: WorkflowActionTrace[];
}

export interface WorkflowConditionTrace {
  id: string;
  condition: string;
  operator: string;
  expected: unknown;
  actual: unknown;
  matched: boolean;
  source: string;
}

export interface WorkflowWhenGroupTrace {
  id: string;
  matched: boolean;
  conditionTrace: WorkflowConditionTrace[];
}

export interface WorkflowCooldownTrace {
  disabled: boolean;
  customerId: string | null;
  hours: number;
  limit: number;
  currentCount: number;
  windowStartedAt: string | null;
  lastFiredAt: string | null;
  nextEligibleAt: string | null;
}

export interface WorkflowTriggerFireResponse {
  eventId: string;
  trigger: WorkflowTrigger;
  source: string;
  matchedRules: number;
  evaluatedRules: number;
  tasksCreated: number;
  tasks: WorkflowTriggerFireTask[];
  results: WorkflowTriggerFireResult[];
  checkedAt: string;
}
