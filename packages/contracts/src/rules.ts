import { z } from 'zod';
import { emailSchema } from './common.js';
import { createTaskAxisSchema, operationalIntentSchema, workflowActionSchema, workflowConditionSchema, workflowTriggerSchema, type CreateTaskAxis, type WorkflowTrigger } from './enums.js';

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

export const workflowActionTimingSchema = z.object({
  mode: z.enum(['immediate', 'deferred_materialization']).default('immediate'),
  delayDays: z.coerce.number().int().min(0).max(365).optional(),
  delayHours: z.coerce.number().int().min(0).max(8760).optional(),
  runAt: z.string().datetime().optional(),
  base: z.enum(['source_event_time', 'source_call_time', 'now']).default('source_event_time'),
}).superRefine((timing, ctx) => {
  if (timing.mode !== 'deferred_materialization') return;
  const hasDelay = (timing.delayDays ?? 0) > 0 || (timing.delayHours ?? 0) > 0;
  if (!hasDelay && !timing.runAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Deferred task materialization requires delayDays, delayHours, or runAt.',
    });
  }
  if (timing.runAt && new Date(timing.runAt).getTime() <= Date.now()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['runAt'],
      message: 'Deferred task materialization runAt must be in the future.',
    });
  }
});
export type WorkflowActionTiming = z.infer<typeof workflowActionTimingSchema>;

export const workflowActionRevalidateSchema = z.object({
  skipIfOpenTaskExistsForIntent: z.boolean().optional(),
  skipIfCustomerPurchasedSinceSourceCall: z.boolean().optional(),
  skipIfCustomerCalledSinceSourceCall: z.boolean().optional(),
  skipIfNoCustomerMatch: z.boolean().optional(),
});
export type WorkflowActionRevalidate = z.infer<typeof workflowActionRevalidateSchema>;

export const workflowRuleActionSchema = z.object({
  id: z.string().trim().min(1),
  action: workflowActionSchema,
  value: z.string(),
  axis: createTaskAxisSchema.optional(),
  timing: workflowActionTimingSchema.optional(),
  revalidate: workflowActionRevalidateSchema.optional(),
}).superRefine((action, ctx) => {
  if (action.timing?.mode === 'deferred_materialization' && action.action !== 'create_task') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timing', 'mode'],
      message: 'Deferred task materialization is only supported on create_task actions.',
    });
  }
  if (action.revalidate && action.action !== 'create_task') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['revalidate'],
      message: 'Revalidation policy is only supported on create_task actions.',
    });
  }
  if (action.action === 'create_task') {
    if (/^\s*support\s*:/i.test(action.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Rule-created tasks cannot target customer requests. Customer service must open customer requests manually.',
      });
    }
  }
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
  updated: number;
  skipped: number;
  totalDefaults: number;
  rules: WorkflowRuleDto[];
  updatedKeys: string[];
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

export const workflowMcpDraftRuleSchema = z.object({
  naturalLanguageGoal: z.string().trim().min(8).max(1200),
  preferredStatus: workflowRuleStatusSchema.default('draft'),
});
export type WorkflowMcpDraftRuleInput = z.infer<typeof workflowMcpDraftRuleSchema>;

const workflowMcpRuleJsonSchema = z.string().trim().min(2).max(250_000);
const workflowMcpDraftIdSchema = z.string().trim().min(1).max(80);
const workflowMcpRuleReferenceFields = {
  draftId: workflowMcpDraftIdSchema.optional(),
  rule: z.union([saveWorkflowRuleSchema, workflowMcpRuleJsonSchema]).optional(),
  ruleJson: workflowMcpRuleJsonSchema.optional(),
};
const workflowMcpRuleReferenceSchema = z.object(workflowMcpRuleReferenceFields).superRefine((value, ctx) => {
  const provided = [value.draftId, value.rule, value.ruleJson].filter((entry) => entry !== undefined && entry !== null).length;
  if (provided !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of draftId, rule, or ruleJson.',
    });
  }
});

export const workflowMcpValidateRuleSchema = workflowMcpRuleReferenceSchema;
export type WorkflowMcpValidateRuleInput = z.infer<typeof workflowMcpValidateRuleSchema>;

export const workflowMcpSimulateRuleSchema = z.object({
  ruleId: z.string().trim().min(1).optional(),
  draftId: workflowMcpDraftIdSchema.optional(),
  rule: z.union([saveWorkflowRuleSchema, workflowMcpRuleJsonSchema]).optional(),
  ruleJson: workflowMcpRuleJsonSchema.optional(),
  recentDays: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(500).default(100),
}).superRefine((value, ctx) => {
  const provided = [value.ruleId, value.draftId, value.rule, value.ruleJson].filter((entry) => entry !== undefined && entry !== null).length;
  if (provided !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of ruleId, draftId, rule, or ruleJson.',
    });
  }
});
export type WorkflowMcpSimulateRuleInput = z.infer<typeof workflowMcpSimulateRuleSchema>;

export const workflowMcpCreateDraftRuleSchema = z.object({
  ...workflowMcpRuleReferenceFields,
  sourceGoal: z.string().trim().max(1200).optional(),
}).superRefine((value, ctx) => {
  const provided = [value.draftId, value.rule, value.ruleJson].filter((entry) => entry !== undefined && entry !== null).length;
  if (provided !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of draftId, rule, or ruleJson.',
    });
  }
});
export type WorkflowMcpCreateDraftRuleInput = z.infer<typeof workflowMcpCreateDraftRuleSchema>;

export const workflowMcpPublishRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  backfillReportId: z.string().trim().min(1),
  comment: z.string().trim().max(500).optional(),
});
export type WorkflowMcpPublishRuleInput = z.infer<typeof workflowMcpPublishRuleSchema>;

export const workflowScheduledActionStatusSchema = z.enum(['pending', 'executing', 'executed', 'skipped', 'cancelled', 'failed']);
export type WorkflowScheduledActionStatus = z.infer<typeof workflowScheduledActionStatusSchema>;

export const workflowMcpListScheduledWorkflowActionsSchema = z.object({
  status: workflowScheduledActionStatusSchema.optional(),
  ruleId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type WorkflowMcpListScheduledWorkflowActionsInput = z.infer<typeof workflowMcpListScheduledWorkflowActionsSchema>;

export const workflowMcpScheduledWorkflowActionIdSchema = z.object({
  scheduledActionId: z.string().trim().min(1),
});
export type WorkflowMcpScheduledWorkflowActionIdInput = z.infer<typeof workflowMcpScheduledWorkflowActionIdSchema>;

export const workflowMcpSimulateDeferredWorkflowRuleSchema = z.object({
  ruleId: z.string().trim().min(1).optional(),
  draftId: workflowMcpDraftIdSchema.optional(),
  rule: z.union([saveWorkflowRuleSchema, workflowMcpRuleJsonSchema]).optional(),
  ruleJson: workflowMcpRuleJsonSchema.optional(),
  recentDays: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  now: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  const provided = [value.ruleId, value.draftId, value.rule, value.ruleJson].filter((entry) => entry !== undefined && entry !== null).length;
  if (provided !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of ruleId, draftId, rule, or ruleJson.',
    });
  }
});
export type WorkflowMcpSimulateDeferredWorkflowRuleInput = z.infer<typeof workflowMcpSimulateDeferredWorkflowRuleSchema>;

export const frontendMcpSurfaceIdSchema = z.enum(['staff.queue']);
export type FrontendMcpSurfaceId = z.infer<typeof frontendMcpSurfaceIdSchema>;

export const frontendCustomizationStatusSchema = z.enum(['draft', 'active', 'archived']);
export type FrontendCustomizationStatus = z.infer<typeof frontendCustomizationStatusSchema>;

export const frontendCustomizationSlotSchema = z.enum([
  'kpi.before',
  'kpi.after',
  'focus.before',
  'focus.after',
  'daily.header',
  'daily.before_list',
  'daily.card.after_brief',
  'daily.card.footer',
  'priority.header',
  'priority.group.header',
  'priority.card.after_summary',
  'priority.card.footer',
  'modal.hero',
  'modal.after_steps',
  'modal.customer_context',
]);
export type FrontendCustomizationSlot = z.infer<typeof frontendCustomizationSlotSchema>;

export const frontendCustomizationDataSourceSchema = z.enum([
  'summary',
  'dailyCall',
  'priorityCustomer',
  'taskBrief',
  'customerDetail',
]);
export type FrontendCustomizationDataSource = z.infer<typeof frontendCustomizationDataSourceSchema>;

export const frontendCustomizationDataPathSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Data path may contain only letters, numbers, underscores, and dots.');

export const frontendCustomizationBindingSchema = z.object({
  source: frontendCustomizationDataSourceSchema,
  path: frontendCustomizationDataPathSchema,
  fallback: z.string().trim().max(160).optional(),
  format: z.enum(['text', 'number', 'currency', 'relative_time', 'count']).default('text'),
});
export type FrontendCustomizationBinding = z.infer<typeof frontendCustomizationBindingSchema>;

export const frontendCustomizationConditionSchema = z.object({
  source: frontendCustomizationDataSourceSchema,
  path: frontendCustomizationDataPathSchema,
  operator: z.enum(['exists', 'not_exists', 'eq', 'neq', 'gte', 'lte', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]).optional(),
});
export type FrontendCustomizationCondition = z.infer<typeof frontendCustomizationConditionSchema>;

export const frontendCustomizationVisibilitySchema = z.object({
  all: z.array(frontendCustomizationConditionSchema).max(12).default([]),
  any: z.array(frontendCustomizationConditionSchema).max(12).default([]),
});
export type FrontendCustomizationVisibility = z.infer<typeof frontendCustomizationVisibilitySchema>;

export const frontendCustomizationToneSchema = z.enum(['neutral', 'info', 'success', 'warning', 'danger', 'accent']);
export type FrontendCustomizationTone = z.infer<typeof frontendCustomizationToneSchema>;

export const frontendNavigationNavIdSchema = z.enum([
  'queue',
  'daily-archive',
  'customers',
  'customer-archive',
  'email',
  'calendar',
  'notes',
  'training',
  'announcements',
  'messaging',
  'requests',
  'notifications',
]);
export type FrontendNavigationNavId = z.infer<typeof frontendNavigationNavIdSchema>;

export const frontendNavigationBadgeModeSchema = z.enum(['count', 'dot', 'none']);
export type FrontendNavigationBadgeMode = z.infer<typeof frontendNavigationBadgeModeSchema>;

export const frontendCustomizationAllowedClassSchema = z.enum([
  'callout',
  'metric',
  'checklist',
  'muted',
  'strong',
  'compact',
  'stack',
  'inline',
  'two-column',
  'accent-border',
]);
export type FrontendCustomizationAllowedClass = z.infer<typeof frontendCustomizationAllowedClassSchema>;

export const frontendCustomizationThemeOverridesSchema = z.object({
  accent: frontendCustomizationToneSchema.optional(),
  cardTone: frontendCustomizationToneSchema.optional(),
  spacing: z.enum(['compact', 'normal', 'roomy']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  fontWeight: z.enum(['normal', 'medium', 'semibold']).optional(),
  radius: z.enum(['tight', 'standard', 'soft']).optional(),
}).default({});
export type FrontendCustomizationThemeOverrides = z.infer<typeof frontendCustomizationThemeOverridesSchema>;

export const frontendCustomizationElementIdSchema = z.enum([
  'kpi.row',
  'daily.card',
  'priority.card',
  'task.modal',
  'customer.detail.popup',
]);
export type FrontendCustomizationElementId = z.infer<typeof frontendCustomizationElementIdSchema>;

export const frontendCustomizationElementFieldSchema = z.enum([
  'title',
  'phone',
  'email',
  'actionBadge',
  'requiredAction',
  'assignee',
  'focus',
  'segmentPriority',
  'latestOrder',
  'performance30d',
  'segmentChip',
  'callButton',
  'pinButton',
  'archiveButton',
  'transferButton',
  'customerName',
  'actionButtons',
  'urgencyScore',
  'priorityBrief',
  'reason',
  'latestCall',
  'openFollowUp',
  'latestNote',
  'orderSummary',
  'hero',
  'steps',
  'snapshotGrid',
  'reasonField',
  'moodField',
  'outcomeField',
  'extraChecks',
  'callExcerpt',
  'purchaseHistory',
  'callSummary',
  'timeline',
  'noteForm',
  'scheduleForm',
  'customerSidePanel',
  'footer',
]);
export type FrontendCustomizationElementField = z.infer<typeof frontendCustomizationElementFieldSchema>;

export const frontendCustomizationModalSectionSchema = z.enum([
  'loadingState',
  'errorState',
  'emptyState',
  'hero',
  'customHero',
  'snapshotGrid',
  'customAfterSteps',
  'reasonField',
  'moodField',
  'outcomeField',
  'extraChecks',
  'callExcerpt',
  'purchaseHistory',
  'callSummary',
  'customCustomerContext',
  'timeline',
  'noteForm',
  'scheduleForm',
  'customerSidePanel',
  'footer',
]);
export type FrontendCustomizationModalSection = z.infer<typeof frontendCustomizationModalSectionSchema>;

export const frontendCustomizationAudienceSchema = z.object({
  memberIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  memberEmails: z.array(z.string().trim().email().max(160)).max(20).optional(),
  roleNames: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).default({});
export type FrontendCustomizationAudience = z.infer<typeof frontendCustomizationAudienceSchema>;

export const frontendCustomizationElementOverrideSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  elementId: frontendCustomizationElementIdSchema,
  audience: frontendCustomizationAudienceSchema,
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  density: z.enum(['comfortable', 'compact']).optional(),
  emphasis: z.enum(['normal', 'high', 'quiet']).optional(),
  toneRule: z.enum(['none', 'urgency', 'static']).default('none'),
  tone: frontendCustomizationToneSchema.optional(),
  visibleFields: z.array(frontendCustomizationElementFieldSchema).max(40).optional(),
  hiddenFields: z.array(frontendCustomizationElementFieldSchema).max(40).optional(),
  copyOverrides: z.record(
    z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    z.string().trim().min(1).max(140),
  ).default({}),
  sectionOrder: z.array(frontendCustomizationModalSectionSchema).max(20).optional(),
  requireScreenshotProof: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const visible = new Set(value.visibleFields ?? []);
  for (const hidden of value.hiddenFields ?? []) {
    if (visible.has(hidden)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hiddenFields'],
        message: `Element field cannot be both visible and hidden: ${hidden}`,
      });
    }
  }
  if (value.sectionOrder?.length && value.elementId !== 'task.modal') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sectionOrder'],
      message: 'Section ordering is only supported for task.modal.',
    });
  }
});
export type FrontendCustomizationElementOverride = z.infer<typeof frontendCustomizationElementOverrideSchema>;

export const frontendCustomizationBlockSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  slot: frontendCustomizationSlotSchema,
  type: z.enum(['stat_tile', 'message', 'field', 'badge', 'checklist', 'section']),
  label: z.string().trim().min(1).max(80),
  title: z.string().trim().max(140).optional(),
  text: z.string().trim().max(500).optional(),
  template: z.string().trim().max(800).optional(),
  value: frontendCustomizationBindingSchema.optional(),
  items: z.array(z.string().trim().min(1).max(180)).max(8).default([]),
  visibility: frontendCustomizationVisibilitySchema.default({ all: [], any: [] }),
  tone: frontendCustomizationToneSchema.default('neutral'),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  compact: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (!value.text && !value.template && !value.value && value.items.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A frontend block must provide text, template, value, or checklist items.',
    });
  }
});
export type FrontendCustomizationBlock = z.infer<typeof frontendCustomizationBlockSchema>;

export const frontendCustomizationContentBlockSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  slot: frontendCustomizationSlotSchema,
  format: z.enum(['markdown', 'html']).default('markdown'),
  label: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2400),
  allowedClasses: z.array(frontendCustomizationAllowedClassSchema).max(10).default([]),
  visibility: frontendCustomizationVisibilitySchema.default({ all: [], any: [] }),
  tone: frontendCustomizationToneSchema.default('neutral'),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  compact: z.boolean().default(false),
});
export type FrontendCustomizationContentBlock = z.infer<typeof frontendCustomizationContentBlockSchema>;

export const frontendNavigationGroupOverrideSchema = z.object({
  id: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(1).max(36),
  order: z.coerce.number().int().min(0).max(1000),
});
export type FrontendNavigationGroupOverride = z.infer<typeof frontendNavigationGroupOverrideSchema>;

export const frontendNavigationItemOverrideSchema = z.object({
  navId: frontendNavigationNavIdSchema,
  label: z.string().trim().min(1).max(36).optional(),
  group: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
  hidden: z.boolean().default(false),
  badgeMode: frontendNavigationBadgeModeSchema.optional(),
  emphasis: z.enum(['high', 'normal', 'quiet']).optional(),
  required: z.boolean().default(false),
});
export type FrontendNavigationItemOverride = z.infer<typeof frontendNavigationItemOverrideSchema>;

export const frontendNavigationOverrideSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  target: z.literal('sidebar'),
  audience: frontendCustomizationAudienceSchema,
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  defaultNavId: frontendNavigationNavIdSchema.optional(),
  groups: z.array(frontendNavigationGroupOverrideSchema).max(12).default([]),
  items: z.array(frontendNavigationItemOverrideSchema).min(1).max(24),
  requireScreenshotProof: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const groupIds = new Set<string>();
  for (const group of value.groups) {
    if (groupIds.has(group.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['groups'], message: `Duplicate navigation group id: ${group.id}` });
    }
    groupIds.add(group.id);
  }
  const itemIds = new Set<string>();
  for (const item of value.items) {
    if (itemIds.has(item.navId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: `Duplicate navigation item override: ${item.navId}` });
    }
    if (item.group && !groupIds.has(item.group)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: `Navigation item ${item.navId} references unknown group id: ${item.group}` });
    }
    itemIds.add(item.navId);
  }
  if (value.defaultNavId) {
    const defaultItem = value.items.find((item) => item.navId === value.defaultNavId);
    if (defaultItem?.hidden) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultNavId'], message: 'Default navigation item cannot be hidden.' });
    }
  }
});
export type FrontendNavigationOverride = z.infer<typeof frontendNavigationOverrideSchema>;

export const frontendCustomizationDefinitionSchema = z.object({
  surfaceId: frontendMcpSurfaceIdSchema,
  schemaVersion: z.literal(1).default(1),
  description: z.string().trim().max(500).optional(),
  blocks: z.array(frontendCustomizationBlockSchema).max(60),
  contentBlocks: z.array(frontendCustomizationContentBlockSchema).max(30).default([]),
  elementOverrides: z.array(frontendCustomizationElementOverrideSchema).max(30).default([]),
  navigationOverrides: z.array(frontendNavigationOverrideSchema).max(10).default([]),
  theme: z.object({
    density: z.enum(['comfortable', 'compact']).default('comfortable'),
    accent: frontendCustomizationToneSchema.default('accent'),
  }).default({ density: 'comfortable', accent: 'accent' }),
  themeOverrides: frontendCustomizationThemeOverridesSchema,
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const item of [
    ...value.blocks.map((block) => ({ id: block.id, kind: 'block' })),
    ...value.contentBlocks.map((block) => ({ id: block.id, kind: 'content block' })),
    ...value.elementOverrides.map((override) => ({ id: override.id, kind: 'element override' })),
    ...value.navigationOverrides.map((override) => ({ id: override.id, kind: 'navigation override' })),
  ]) {
    if (ids.has(item.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate frontend ${item.kind} id: ${item.id}`,
      });
    }
    ids.add(item.id);
  }
});
export type FrontendCustomizationDefinition = z.infer<typeof frontendCustomizationDefinitionSchema>;

export const frontendMcpPreviewCustomizationSchema = z.object({
  surfaceId: frontendMcpSurfaceIdSchema,
  name: z.string().trim().min(2).max(120),
  definition: frontendCustomizationDefinitionSchema,
  reason: z.string().trim().max(800).optional(),
});
export type FrontendMcpPreviewCustomizationInput = z.infer<typeof frontendMcpPreviewCustomizationSchema>;

export const frontendMcpApplyCustomizationSchema = frontendMcpPreviewCustomizationSchema.extend({
  status: frontendCustomizationStatusSchema.default('active'),
});
export type FrontendMcpApplyCustomizationInput = z.infer<typeof frontendMcpApplyCustomizationSchema>;

export const frontendMcpListCustomizationsSchema = z.object({
  surfaceId: frontendMcpSurfaceIdSchema.optional(),
  status: frontendCustomizationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type FrontendMcpListCustomizationsInput = z.infer<typeof frontendMcpListCustomizationsSchema>;

export const frontendMcpCustomizationIdSchema = z.object({
  customizationId: z.string().trim().min(1),
});
export type FrontendMcpCustomizationIdInput = z.infer<typeof frontendMcpCustomizationIdSchema>;

export const frontendMcpRollbackCustomizationSchema = z.object({
  surfaceId: frontendMcpSurfaceIdSchema,
  targetCustomizationId: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(800).optional(),
});
export type FrontendMcpRollbackCustomizationInput = z.infer<typeof frontendMcpRollbackCustomizationSchema>;

export const frontendSourcePatchFileSchema = z.object({
  path: z.string().trim().min(1).max(220).regex(/^[a-zA-Z0-9_./-]+$/, 'Patch path may contain only safe repo path characters.'),
  purpose: z.string().trim().min(1).max(240),
  patch: z.string().trim().min(1).max(16000),
});
export type FrontendSourcePatchFile = z.infer<typeof frontendSourcePatchFileSchema>;

export const frontendSourcePatchScreenshotSchema = z.object({
  viewport: z.enum(['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark']),
  path: z.string().trim().min(1).max(260),
});
export type FrontendSourcePatchScreenshot = z.infer<typeof frontendSourcePatchScreenshotSchema>;

export const frontendMcpPreviewSourcePatchSchema = z.object({
  surfaceId: frontendMcpSurfaceIdSchema,
  name: z.string().trim().min(2).max(120),
  files: z.array(frontendSourcePatchFileSchema).min(1).max(12),
  reason: z.string().trim().min(1).max(800),
});
export type FrontendMcpPreviewSourcePatchInput = z.infer<typeof frontendMcpPreviewSourcePatchSchema>;

export const frontendMcpValidateSourcePatchProofSchema = frontendMcpPreviewSourcePatchSchema.extend({
  typecheckCommand: z.string().trim().min(1).max(220),
  typecheckPassed: z.boolean(),
  buildCommand: z.string().trim().min(1).max(220),
  buildPassed: z.boolean(),
  screenshots: z.array(frontendSourcePatchScreenshotSchema).min(3).max(8),
  humanApproval: z.boolean().default(false),
});
export type FrontendMcpValidateSourcePatchProofInput = z.infer<typeof frontendMcpValidateSourcePatchProofSchema>;

export interface FrontendMcpSourcePatchPreviewResponse {
  ok: boolean;
  appliesPatch: false;
  deploysCode: false;
  maintainerMustApplyPatch: true;
  humanApprovalRequired: true;
  warnings: string[];
  files: Array<{
    path: string;
    allowed: boolean;
    reason: string;
  }>;
  requiredProof: string[];
  allowedPaths: string[];
  deniedPatterns: string[];
}

export interface FrontendMcpSourcePatchProofResponse extends FrontendMcpSourcePatchPreviewResponse {
  proofOk: boolean;
  proofWarnings: string[];
  deployAllowed: boolean;
}

export const algorithmSurfaceIdSchema = z.enum([
  'staff.daily_call_list.ranking',
  'staff.priority_kanban.customer_score',
  'staff.task_visibility',
  'staff.customer_next_action',
  'staff.call_brief_generation',
  'customer_portal.reorder_eligibility',
  'mail_marketing.audience_eligibility',
  'mail_marketing.send_safety',
]);
export type AlgorithmSurfaceId = z.infer<typeof algorithmSurfaceIdSchema>;

export const algorithmStrategyStatusSchema = z.enum(['draft', 'shadow', 'active', 'archived']);
export type AlgorithmStrategyStatus = z.infer<typeof algorithmStrategyStatusSchema>;

export const algorithmConditionOperatorSchema = z.enum(['=', '!=', '>', '>=', '<', '<=', 'contains', 'in', 'not_in', 'exists', 'not_exists']);
export type AlgorithmConditionOperator = z.infer<typeof algorithmConditionOperatorSchema>;

export const algorithmConditionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  field: z.string().trim().min(1).max(120),
  operator: algorithmConditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]).optional(),
  weight: z.coerce.number().min(-100).max(100).optional(),
  reason: z.string().trim().max(240).optional(),
});
export type AlgorithmCondition = z.infer<typeof algorithmConditionSchema>;

export const algorithmSortRuleSchema = z.object({
  field: z.string().trim().min(1).max(120),
  direction: z.enum(['asc', 'desc']),
  nulls: z.enum(['first', 'last']).default('last'),
});
export type AlgorithmSortRule = z.infer<typeof algorithmSortRuleSchema>;

export const algorithmScoreBandSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  min: z.coerce.number().min(-10000).max(10000),
  max: z.coerce.number().min(-10000).max(10000),
  tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger']).default('neutral'),
  cta: z.string().trim().min(1).max(80).optional(),
}).superRefine((value, ctx) => {
  if (value.max < value.min) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['max'], message: 'Score band max must be greater than or equal to min.' });
  }
});
export type AlgorithmScoreBand = z.infer<typeof algorithmScoreBandSchema>;

export const algorithmCooldownSchema = z.object({
  reappearAfterHours: z.coerce.number().int().min(0).max(8760).optional(),
  hideIfOpenTaskExists: z.boolean().default(true),
  archiveAfterDays: z.coerce.number().int().min(1).max(365).optional(),
  duplicateWindowHours: z.coerce.number().int().min(0).max(8760).optional(),
}).default({ hideIfOpenTaskExists: true });
export type AlgorithmCooldown = z.infer<typeof algorithmCooldownSchema>;

export const algorithmVisibilitySchema = z.object({
  mode: z.enum(['show_by_default', 'hide_by_default']).default('show_by_default'),
  showWhen: z.array(algorithmConditionSchema).max(30).default([]),
  hideWhen: z.array(algorithmConditionSchema).max(30).default([]),
}).default({ mode: 'show_by_default', showWhen: [], hideWhen: [] });
export type AlgorithmVisibility = z.infer<typeof algorithmVisibilitySchema>;

export const algorithmStrategyDefinitionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  surfaceId: algorithmSurfaceIdSchema,
  description: z.string().trim().max(700).optional(),
  weights: z.record(z.string().trim().min(1).max(80), z.coerce.number().min(-100).max(100)).default({}),
  conditions: z.array(algorithmConditionSchema).max(60).default([]),
  visibility: algorithmVisibilitySchema,
  sort: z.array(algorithmSortRuleSchema).max(12).default([]),
  cooldown: algorithmCooldownSchema,
  scoreBands: z.array(algorithmScoreBandSchema).max(20).default([]),
  ctaPriority: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  modalActionOrder: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  explanationTemplate: z.string().trim().max(800).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
  const scoreBandIds = new Set<string>();
  for (const band of value.scoreBands) {
    if (scoreBandIds.has(band.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scoreBands'], message: `Duplicate score band id: ${band.id}` });
    }
    scoreBandIds.add(band.id);
  }
});
export type AlgorithmStrategyDefinition = z.infer<typeof algorithmStrategyDefinitionSchema>;

export const saveAlgorithmStrategySchema = z.object({
  surfaceId: algorithmSurfaceIdSchema,
  name: z.string().trim().min(2).max(140),
  definition: algorithmStrategyDefinitionSchema,
  status: algorithmStrategyStatusSchema.default('draft'),
  reason: z.string().trim().max(1000).optional(),
});
export type SaveAlgorithmStrategyInput = z.infer<typeof saveAlgorithmStrategySchema>;

const algorithmStrategyJsonSchema = z.string().trim().min(2).max(250_000);
const algorithmStrategyIdSchema = z.string().trim().min(1).max(100);

export const algorithmMcpDraftChangeSchema = z.object({
  surfaceId: algorithmSurfaceIdSchema,
  naturalLanguageGoal: z.string().trim().min(8).max(1600),
  preferredStatus: algorithmStrategyStatusSchema.default('draft'),
});
export type AlgorithmMcpDraftChangeInput = z.infer<typeof algorithmMcpDraftChangeSchema>;

const algorithmStrategyReferenceFields = {
  strategyId: algorithmStrategyIdSchema.optional(),
  strategy: z.union([saveAlgorithmStrategySchema, algorithmStrategyJsonSchema]).optional(),
  strategyJson: algorithmStrategyJsonSchema.optional(),
};

export const algorithmMcpValidateChangeSchema = z.object(algorithmStrategyReferenceFields).superRefine((value, ctx) => {
  const provided = [value.strategyId, value.strategy, value.strategyJson].filter((entry) => entry !== undefined && entry !== null).length;
  if (provided !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide exactly one of strategyId, strategy, or strategyJson.' });
  }
});
export type AlgorithmMcpValidateChangeInput = z.infer<typeof algorithmMcpValidateChangeSchema>;

export const algorithmMcpSimulateChangeSchema = z.object({
  surfaceId: algorithmSurfaceIdSchema,
  ...algorithmStrategyReferenceFields,
  memberEmail: emailSchema.optional(),
  recentDays: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AlgorithmMcpSimulateChangeInput = z.infer<typeof algorithmMcpSimulateChangeSchema>;

export const algorithmMcpCompareVersionsSchema = z.object({
  surfaceId: algorithmSurfaceIdSchema,
  baseStrategyId: algorithmStrategyIdSchema.optional(),
  candidateStrategyId: algorithmStrategyIdSchema.optional(),
  candidateStrategy: z.union([saveAlgorithmStrategySchema, algorithmStrategyJsonSchema]).optional(),
  candidateStrategyJson: algorithmStrategyJsonSchema.optional(),
  memberEmail: emailSchema.optional(),
  recentDays: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AlgorithmMcpCompareVersionsInput = z.infer<typeof algorithmMcpCompareVersionsSchema>;

export const algorithmMcpPublishVersionSchema = z.object({
  strategyId: algorithmStrategyIdSchema,
  simulationId: algorithmStrategyIdSchema,
  comment: z.string().trim().max(800).optional(),
});
export type AlgorithmMcpPublishVersionInput = z.infer<typeof algorithmMcpPublishVersionSchema>;

export const algorithmMcpRollbackVersionSchema = z.object({
  surfaceId: algorithmSurfaceIdSchema,
  targetStrategyId: algorithmStrategyIdSchema.optional(),
  versionNo: z.coerce.number().int().min(1).optional(),
  comment: z.string().trim().max(800).optional(),
}).superRefine((value, ctx) => {
  const provided = [value.targetStrategyId, value.versionNo].filter((entry) => entry !== undefined && entry !== null).length;
  if (provided > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide either targetStrategyId or versionNo, not both.' });
  }
});
export type AlgorithmMcpRollbackVersionInput = z.infer<typeof algorithmMcpRollbackVersionSchema>;

export const algorithmMcpExplainCustomerRankingSchema = z.object({
  surfaceId: algorithmSurfaceIdSchema.default('staff.priority_kanban.customer_score'),
  customerId: z.string().trim().min(1),
  strategyId: algorithmStrategyIdSchema.optional(),
});
export type AlgorithmMcpExplainCustomerRankingInput = z.infer<typeof algorithmMcpExplainCustomerRankingSchema>;

export const algorithmMcpExplainTaskVisibilitySchema = z.object({
  surfaceId: algorithmSurfaceIdSchema.default('staff.task_visibility'),
  serviceRequestId: z.string().trim().min(1),
  strategyId: algorithmStrategyIdSchema.optional(),
});
export type AlgorithmMcpExplainTaskVisibilityInput = z.infer<typeof algorithmMcpExplainTaskVisibilitySchema>;

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
  status: 'shadow_matched' | 'cooldown_suppressed' | 'skipped';
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
  ruleDefinitionHash: string | null;
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

export interface AlgorithmSurfaceContract {
  id: AlgorithmSurfaceId;
  label: string;
  purpose: string;
  ownerSurface: 'staff' | 'customer_portal' | 'mail_marketing';
  allowedFields: string[];
  allowedWeights: string[];
  allowedSortFields: string[];
  allowedCtas: string[];
  allowedModalActions: string[];
  simulationEvidence: string[];
  redLines: string[];
}

export interface AlgorithmStrategyDto {
  id: string;
  surfaceId: AlgorithmSurfaceId;
  name: string;
  status: AlgorithmStrategyStatus;
  definition: AlgorithmStrategyDefinition;
  reason: string | null;
  warnings: string[];
  createdByMemberId: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlgorithmStrategyVersionDto {
  id: string;
  strategyId: string;
  surfaceId: AlgorithmSurfaceId;
  versionNo: number;
  jsonSnapshot: SaveAlgorithmStrategyInput;
  editedByMemberId: string | null;
  editedAt: string;
  comment: string | null;
}

export interface AlgorithmStrategySimulationDto {
  id: string;
  strategyId: string | null;
  surfaceId: AlgorithmSurfaceId;
  status: 'passed' | 'failed' | 'limited';
  windowStart: string | null;
  windowEnd: string | null;
  sampleSize: number;
  result: AlgorithmSimulationResult;
  createdByMemberId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AlgorithmSimulationRankedItem {
  id: string;
  label: string;
  beforeRank: number | null;
  afterRank: number | null;
  beforeScore: number | null;
  afterScore: number | null;
  delta: number;
  visibleBefore: boolean;
  visibleAfter: boolean;
  reasons: string[];
}

export interface AlgorithmSimulationResult {
  noMutation: boolean;
  baselineStrategyId: string | null;
  candidateHash: string;
  changedTopItems: AlgorithmSimulationRankedItem[];
  hiddenCount: number;
  surfacedCount: number;
  unchangedCount: number;
  warnings: string[];
  evidence: string[];
}

export interface AlgorithmMcpSurfacesResponse {
  surfaces: AlgorithmSurfaceContract[];
}

export interface AlgorithmMcpSurfaceContractResponse {
  surface: AlgorithmSurfaceContract;
  activeStrategy: AlgorithmStrategyDto | null;
}

export interface AlgorithmMcpDraftChangeResponse {
  draftId: string;
  strategy: SaveAlgorithmStrategyInput;
  confidence: number;
  assumptions: string[];
  warnings: string[];
}

export interface AlgorithmMcpValidateChangeResponse {
  ok: boolean;
  issues: string[];
  warnings: string[];
  normalizedStrategy: SaveAlgorithmStrategyInput | null;
}

export interface AlgorithmMcpSimulateChangeResponse {
  simulation: AlgorithmStrategySimulationDto;
  strategy: AlgorithmStrategyDto | null;
  candidate: SaveAlgorithmStrategyInput;
}

export interface AlgorithmMcpCompareVersionsResponse {
  base: AlgorithmMcpSimulateChangeResponse;
  candidate: AlgorithmMcpSimulateChangeResponse;
  diff: {
    topItemChanges: AlgorithmSimulationRankedItem[];
    hiddenDelta: number;
    surfacedDelta: number;
    summary: string[];
  };
}

export interface AlgorithmMcpPublishVersionResponse {
  strategy: AlgorithmStrategyDto;
  version: AlgorithmStrategyVersionDto;
  simulation: AlgorithmStrategySimulationDto;
  publishedAt: string;
  deactivatedStrategyIds: string[];
}

export interface AlgorithmMcpRollbackVersionResponse {
  strategy: AlgorithmStrategyDto;
  version: AlgorithmStrategyVersionDto | null;
  archivedStrategyIds: string[];
}

export interface AlgorithmMcpExplainCustomerRankingResponse {
  surfaceId: AlgorithmSurfaceId;
  customerId: string;
  strategyId: string | null;
  score: number;
  band: AlgorithmScoreBand | null;
  reasons: string[];
  rawSignals: Record<string, unknown>;
}

export interface AlgorithmMcpExplainTaskVisibilityResponse {
  surfaceId: AlgorithmSurfaceId;
  serviceRequestId: string;
  strategyId: string | null;
  visible: boolean;
  reasons: string[];
  rawSignals: Record<string, unknown>;
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

export interface WorkflowMcpCapabilityTool {
  name:
    | 'list_workflow_capabilities'
    | 'read_workflow_agent_guide'
    | 'list_workflow_rules'
    | 'get_workflow_rule'
    | 'archive_workflow_rule'
    | 'restore_workflow_rule'
    | 'draft_workflow_rule'
    | 'validate_workflow_rule'
    | 'simulate_workflow_rule'
    | 'create_workflow_rule_draft'
    | 'publish_workflow_rule'
    | 'list_aircall_transcripts'
    | 'download_aircall_transcript'
    | 'export_aircall_transcripts'
    | 'list_scheduled_workflow_actions'
    | 'get_scheduled_workflow_action'
    | 'cancel_scheduled_workflow_action'
    | 'simulate_deferred_workflow_rule'
    | 'explain_scheduled_workflow_action'
    | 'read_frontend_agent_guide'
    | 'list_frontend_surfaces'
    | 'get_frontend_surface_contract'
    | 'preview_frontend_customization'
    | 'apply_frontend_customization'
    | 'list_frontend_customizations'
    | 'get_frontend_customization'
    | 'rollback_frontend_customization'
    | 'preview_frontend_source_patch'
    | 'validate_frontend_source_patch_proof'
    | 'list_algorithm_surfaces'
    | 'get_algorithm_contract'
    | 'draft_algorithm_change'
    | 'validate_algorithm_change'
    | 'simulate_algorithm_change'
    | 'compare_algorithm_versions'
    | 'publish_algorithm_version'
    | 'rollback_algorithm_version'
    | 'explain_customer_ranking'
    | 'explain_task_visibility';
  description: string;
  mutates: boolean;
  requiresPermission: string;
}

export interface WorkflowMcpAgentGuideMetadata {
  version: string;
  title: string;
  path: string;
  endpoint: '/api/v1/rules/mcp/agent-guide';
  contentType: 'text/markdown';
  summary: string[];
}

export interface WorkflowMcpAgentGuideResponse extends Omit<WorkflowMcpAgentGuideMetadata, 'endpoint'> {
  sha256: string;
  lineCount: number;
  updatedAt: string | null;
  markdown: string;
}

export interface WorkflowMcpProductLanguageEntry {
  id: string;
  title: string;
  handle: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  variantSkus: string[];
  family: string | null;
  role: 'machine' | 'spare_part' | 'consumable' | 'accessory' | 'service' | 'unknown';
  category: 'heat_press' | 'dtf_supply' | 'printer_part' | 'transfer' | 'unknown';
  collections: string[];
  aliases: string[];
  source: 'shopify_catalog';
}

export interface WorkflowMcpCapabilitiesResponse {
  catalogVersion: string;
  agentGuide: WorkflowMcpAgentGuideMetadata;
  tools: WorkflowMcpCapabilityTool[];
  safeguards: string[];
  allowed: {
    triggers: string[];
    conditions: string[];
    actions: string[];
    createTaskAxes: string[];
    operationalIntents: string[];
  };
  registry: {
    operationalIntents: Array<{
      value: string;
      label: string;
      defaultAxis: string | null;
      expectedOutcome: 'task:sales' | 'task:account' | 'no-op';
      taskTitle: string | null;
      keywords: readonly string[];
      examples: readonly string[];
    }>;
    conditions: Array<{
      value: string;
      label: string;
      category: string;
      valueType: string;
      aiDerived: boolean;
      optionSource: string;
    }>;
    actions: Array<{
      value: string;
      label: string;
      createsTask: boolean;
      mutatesCustomer: boolean;
      auditOnly: boolean;
    }>;
    productLanguage: WorkflowMcpProductLanguageEntry[];
  };
  examples: string[];
}

export interface WorkflowMcpDraftRuleResponse {
  draftId: string;
  rule: SaveWorkflowRuleInput;
  confidence: number;
  detectedIntent: z.infer<typeof operationalIntentSchema>;
  guardSummary: string[];
  assumptions: string[];
  warnings: string[];
  unsupported: string[];
}

export interface WorkflowMcpValidateRuleResponse {
  ok: boolean;
  issues: string[];
  normalizedRule: SaveWorkflowRuleInput | null;
}

export interface WorkflowMcpSimulateRuleResponse {
  mode: 'stored_rule' | 'draft_rule';
  ruleId: string | null;
  reportId: string | null;
  recentDays: number;
  evaluatedEvents: number;
  matchedEvents: number;
  wouldCreateTasks: number;
  samples: WorkflowRuleBackfillSample[];
  warnings: string[];
}

export interface WorkflowMcpCreateDraftRuleResponse {
  rule: WorkflowRuleDto;
  warnings: string[];
}

export interface WorkflowMcpPublishRuleResponse {
  rule: WorkflowRuleDto;
  reportId: string;
  publishedAt: string;
}

export interface WorkflowScheduledActionDto {
  id: string;
  ruleId: string;
  ruleName: string | null;
  sourceEventId: string | null;
  sourceCallId: string | null;
  customerId: string | null;
  customerName: string | null;
  assignedMemberId: string | null;
  assignedMemberName: string | null;
  axis: CreateTaskAxis;
  title: string;
  description: string | null;
  actionPayload: unknown;
  briefPayload: unknown;
  revalidationPolicy: unknown;
  runAt: string;
  status: WorkflowScheduledActionStatus;
  idempotencyKey: string;
  skipReason: string | null;
  errorMessage: string | null;
  executedServiceRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowMcpListScheduledWorkflowActionsResponse {
  items: WorkflowScheduledActionDto[];
  total: number;
  limit: number;
  status: WorkflowScheduledActionStatus | null;
  checkedAt: string;
}

export interface WorkflowMcpScheduledWorkflowActionResponse {
  item: WorkflowScheduledActionDto;
}

export interface WorkflowMcpCancelScheduledWorkflowActionResponse {
  item: WorkflowScheduledActionDto;
  cancelled: boolean;
}

export interface WorkflowMcpExplainScheduledWorkflowActionResponse {
  item: WorkflowScheduledActionDto;
  explanation: {
    visibleNow: boolean;
    runAt: string;
    status: WorkflowScheduledActionStatus;
    revalidation: string[];
    nextOutcome: string;
  };
}

export interface WorkflowMcpSimulateDeferredWorkflowRuleResponse extends WorkflowMcpSimulateRuleResponse {
  deferredActions: Array<{
    actionId: string;
    title: string;
    axis: CreateTaskAxis;
    runAtPreview: string | null;
    revalidationPolicy: WorkflowActionRevalidate;
  }>;
}

export interface FrontendMcpAgentGuideResponse {
  version: string;
  title: string;
  path: string;
  sha256: string;
  lineCount: number;
  updatedAt: string | null;
  markdown: string;
}

export interface FrontendMcpSurfaceSummary {
  id: string;
  label: string;
  route: string;
  purpose: string;
  allowedPaths: string[];
}

export interface FrontendMcpSurfaceContract extends FrontendMcpSurfaceSummary {
  sourceFiles: string[];
  apiEndpoints: string[];
  requiredStates: string[];
  forbiddenTerms: string[];
  preferredTerms: string[];
  customizationSlots: FrontendCustomizationSlot[];
  elementMap: Array<{
    elementId: string;
    label: string;
    slots: FrontendCustomizationSlot[];
    fields: FrontendCustomizationElementField[];
    requiredFields: FrontendCustomizationElementField[];
    currentSupport: string;
    nextSafeSupport: string;
  }>;
  extensionRoadmap: string[];
  themeChecklist: string[];
  smokeChecklist: string[];
}

export interface FrontendMcpSurfacesResponse {
  surfaces: FrontendMcpSurfaceSummary[];
}

export interface FrontendMcpSurfaceContractResponse {
  surface: FrontendMcpSurfaceContract;
}

export interface FrontendCustomizationDto {
  id: string;
  surfaceId: FrontendMcpSurfaceId;
  name: string;
  status: FrontendCustomizationStatus;
  definition: FrontendCustomizationDefinition;
  reason: string | null;
  warnings: string[];
  createdByMemberId: string | null;
  createdByMemberName: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FrontendCustomizationRuntimeDto {
  surfaceId: FrontendMcpSurfaceId;
  customizationId: string | null;
  name: string | null;
  definition: FrontendCustomizationDefinition;
  warnings: string[];
  checkedAt: string;
}

export interface FrontendMcpPreviewCustomizationResponse {
  ok: boolean;
  surface: FrontendMcpSurfaceContract;
  preview: FrontendCustomizationRuntimeDto;
  warnings: string[];
}

export interface FrontendMcpApplyCustomizationResponse {
  customization: FrontendCustomizationDto;
  activeRuntime: FrontendCustomizationRuntimeDto;
  deactivatedIds: string[];
}

export interface FrontendMcpListCustomizationsResponse {
  items: FrontendCustomizationDto[];
  total: number;
  limit: number;
}

export interface FrontendMcpCustomizationResponse {
  customization: FrontendCustomizationDto;
}

export interface FrontendMcpRollbackCustomizationResponse {
  activeRuntime: FrontendCustomizationRuntimeDto;
  activatedCustomization: FrontendCustomizationDto | null;
  archivedCustomizationIds: string[];
}

export interface WorkflowOperationalContractProbeResponse {
  ok: boolean;
  checkedAt: string;
  expectedIntents: string[];
  totals: {
    expectedIntentCount: number;
    coveredDefaultIntentCount: number;
    coveredLiveIntentCount: number;
    issueCount: number;
  };
  intents: Array<{
    intent: string;
    expectedOutcome: 'task:sales' | 'task:account' | 'no-op';
    defaultRuleKeys: string[];
    liveRuleIds: string[];
    liveRuleNames: string[];
    issues: string[];
  }>;
  support: {
    createTaskAxes: string[];
    serviceRequestSources: string[];
    supportAxisAllowed: boolean;
    workflowSourceAllowed: boolean;
    supportMatchedRuleCount: number;
  };
  transcript: {
    coverageScope: 'all_time';
    coverageWindowDays: number | null;
    transcriptEvents: number;
    evaluatedEvents: number;
    flowCompletedEvents: number;
    expectedSignalCount: number;
    evaluatedSignalCount: number;
    flowCompletedSignalCount: number;
    missingSignalEvaluationCount: number;
    missingSignalFlowOutcomeCount: number;
    extraSignalEvaluationCount: number;
    invalidResolverOutputCount: number;
    signalInvariantOk: boolean;
    workflowInvariantOk: boolean;
    missingEvaluationCount: number;
    missingFlowOutcomeCount: number;
    staleResolverVersionCount: number;
    resolverQueuedOrProcessingCount: number;
    resolverFailedCount: number;
    failedEvaluationCount: number;
    unmatchedEvaluationCount: number;
    noActionEvaluationCount: number;
    noActionWithReasonCount: number;
    noActionMissingReasonCount: number;
    signalCoverageSamples: Array<{
      callEventId: string;
      externalCallId: string | null;
      expectedSignals: string[];
      evaluatedSignals: string[];
      missingSignals: string[];
      extraSignals: string[];
      statuses: Array<{
        signal: string;
        status: string;
      }>;
    }>;
    issues: string[];
    taskCreationTrigger: 'call.operational_signal.detected';
    blockedTaskTriggers: string[];
    activeLegacyTranscriptRuleCount: number;
    activeLegacyTranscriptRules: Array<{
      id: string;
      name: string;
      trigger: string;
    }>;
    activeNonOperationalTaskRuleCount: number;
    activeNonOperationalTaskRules: Array<{
      id: string;
      name: string;
      trigger: string;
    }>;
  };
  mcp: {
    allowedTriggers: string[];
    allowedActions: string[];
    requiredTools: WorkflowMcpCapabilityTool['name'][];
    exposedTools: WorkflowMcpCapabilityTool['name'][];
    missingRequiredTools: WorkflowMcpCapabilityTool['name'][];
    requiredActions: string[];
    missingRequiredActions: string[];
    publishRequiresStoredSimulation: boolean;
    issues: string[];
  };
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
  targetType: 'service_request' | 'scheduled_action' | 'customer' | 'segment_membership' | 'member' | 'mail_delivery' | 'audit';
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
  status: 'task_created' | 'actions_applied' | 'no_op' | 'shadow_matched' | 'cooldown_suppressed' | 'existing_task' | 'skipped';
  reason?: 'conditions_not_matched' | 'actions_skipped' | 'duplicate_event' | 'existing_task' | 'cooldown' | 'unsupported_action';
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
