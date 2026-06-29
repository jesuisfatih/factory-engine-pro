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
  metadata: z.record(z.string(), z.unknown()).optional(),
  when: z.array(workflowRuleConditionSchema),
  whenGroups: z.array(workflowRuleWhenGroupSchema).optional(),
  actions: z.array(workflowRuleActionSchema).min(1),
});
export type WorkflowRuleDefinition = z.infer<typeof workflowRuleDefinitionSchema>;

export const saveWorkflowRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  definition: workflowRuleDefinitionSchema,
  comment: z.string().trim().max(500).optional(),
});
export type SaveWorkflowRuleInput = z.infer<typeof saveWorkflowRuleSchema>;

export const bootstrapWorkflowDefaultsSchema = z.object({});
export type BootstrapWorkflowDefaultsInput = z.infer<typeof bootstrapWorkflowDefaultsSchema>;

export interface BootstrapWorkflowDefaultsResponse {
  created: number;
  skipped: number;
  totalDefaults: number;
  rules: WorkflowRuleDto[];
  skippedKeys: string[];
}

export const rollbackWorkflowRuleSchema = z.object({
  versionNo: z.coerce.number().int().min(1),
  comment: z.string().trim().max(500).optional(),
});
export type RollbackWorkflowRuleInput = z.infer<typeof rollbackWorkflowRuleSchema>;

export const backfillWorkflowRuleSchema = z.object({
  recentDays: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type BackfillWorkflowRuleInput = z.infer<typeof backfillWorkflowRuleSchema>;

export const activeWorkflowRuleStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});
export type ActiveWorkflowRuleStatsQuery = z.infer<typeof activeWorkflowRuleStatsQuerySchema>;

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

export interface WorkflowRuleVersionDto {
  id: string;
  ruleId: string;
  versionNo: number;
  jsonSnapshot: SaveWorkflowRuleInput;
  editedByMemberId: string | null;
  editedAt: string;
  comment: string | null;
}

export interface WorkflowRuleVersionsResponse {
  ruleId: string;
  versions: WorkflowRuleVersionDto[];
}

export interface WorkflowRuleBackfillSample {
  eventId: string;
  sourceType: string;
  sourceId: string | null;
  occurredAt: string;
  customerId: string | null;
  matched: boolean;
  status: 'shadow_matched' | 'skipped';
  reason?: 'conditions_not_matched' | 'cooldown';
  wouldCreateTaskCount: number;
  conditionTrace: WorkflowConditionTrace[];
  whenTrace: WorkflowWhenGroupTrace[];
  cooldown?: WorkflowCooldownTrace;
}

export interface WorkflowRuleBackfillResult {
  noMutation: boolean;
  candidateSource: string;
  sampleLimit: number;
  samples: WorkflowRuleBackfillSample[];
}

export interface WorkflowRuleBackfillReportDto {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: string;
  recentDays: number;
  status: 'completed' | 'failed';
  windowStart: string;
  windowEnd: string;
  evaluatedEvents: number;
  matchedEvents: number;
  skippedEvents: number;
  wouldCreateTasks: number;
  actualTasksCreated: number;
  createdByMemberId: string | null;
  createdAt: string;
  finishedAt: string | null;
  result: WorkflowRuleBackfillResult;
}

export interface WorkflowRuleBackfillRunResponse {
  report: WorkflowRuleBackfillReportDto;
}

export interface WorkflowRuleBackfillReportsResponse {
  ruleId: string;
  reports: WorkflowRuleBackfillReportDto[];
}

export interface WorkflowRuleExecutionTaskDto {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  axis: string | null;
  customerId: string | null;
  customerName: string | null;
  assignedMemberName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRuleExecutionTranscriptDto {
  callEventId: string;
  externalCallId: string;
  contactPhone: string | null;
  contactEmail: string | null;
  resolvedAt: string | null;
  resolverStatus: string | null;
  transcriptSnippet: string | null;
}

export interface WorkflowRuleExecutionDto {
  id: string;
  ruleId: string;
  eventId: string;
  trigger: WorkflowTrigger;
  status: string;
  executionMode: 'active' | 'shadow' | 'unknown';
  source: string | null;
  taskIds: string[];
  tasks: WorkflowRuleExecutionTaskDto[];
  conditionTrace: WorkflowConditionTrace[];
  whenTrace: WorkflowWhenGroupTrace[];
  actionTrace: WorkflowActionTrace[];
  transcript: WorkflowRuleExecutionTranscriptDto | null;
  firstSeenAt: string;
  updatedAt: string;
}

export interface WorkflowRuleExecutionsResponse {
  ruleId: string;
  executions: WorkflowRuleExecutionDto[];
}

export interface ActiveWorkflowRuleStatsRow {
  ruleId: string;
  ruleName: string;
  trigger: string;
  priority: number;
  fireCount: number;
  matchCount: number;
  matchRate: number;
  taskCreatedCount: number;
  avgLatencyMs: number | null;
  lastFiredAt: string | null;
  health: 'dead' | 'loose' | 'healthy';
}

export interface ActiveWorkflowRuleStatsResponse {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  totals: {
    activeRules: number;
    fireCount: number;
    matchCount: number;
    taskCreatedCount: number;
    avgLatencyMs: number | null;
  };
  rows: ActiveWorkflowRuleStatsRow[];
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
  targetType: 'service_request' | 'support_case' | 'customer' | 'segment_membership' | 'member' | 'mail_delivery' | 'audit';
  targetId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export const workflowConditionTraceSchema = z.object({
  id: z.string(),
  condition: z.string(),
  operator: z.string(),
  expected: z.unknown(),
  actual: z.unknown(),
  matched: z.boolean(),
  source: z.string(),
});
export type WorkflowConditionTrace = z.infer<typeof workflowConditionTraceSchema>;

export const workflowWhenGroupTraceSchema = z.object({
  id: z.string(),
  matched: z.boolean(),
  conditionTrace: z.array(workflowConditionTraceSchema),
});
export type WorkflowWhenGroupTrace = z.infer<typeof workflowWhenGroupTraceSchema>;

export const workflowCooldownTraceSchema = z.object({
  disabled: z.boolean(),
  customerId: z.string().nullable(),
  hours: z.number(),
  limit: z.number(),
  currentCount: z.number(),
  windowStartedAt: z.string().nullable(),
  lastFiredAt: z.string().nullable(),
  nextEligibleAt: z.string().nullable(),
});
export type WorkflowCooldownTrace = z.infer<typeof workflowCooldownTraceSchema>;

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
