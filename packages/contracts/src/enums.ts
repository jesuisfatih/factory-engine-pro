import { z } from 'zod';

export const WORKFLOW_ENUM_VERSION = '2026-06-29.1';

export const PSYCH_TAGS = [
  'angry',
  'purchase_intent',
  'shipping_issue',
  'refund_intent',
  'complaint',
  'info_request',
  'follow_up',
  'satisfied',
] as const;

export const CALL_INTENTS = [
  'sale',
  'support',
  'inquiry',
  'complaint',
  'follow_up',
] as const;

export const URGENCY_LEVELS = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export const WORKFLOW_TRIGGERS = [
  'aircall.call.created',
  'aircall.call.ended',
  'aircall.call.missed',
  'aircall.transcript.received',
  'shopify.order.created',
  'shopify.order.cancelled',
  'shopify.order.refunded',
  'shopify.customer.created',
  'shopify.customer.updated',
  'segment.member_added',
  'segment.member_removed',
  'b2b_access.request.created',
  'support.request.created',
  'support.case.created',
  'schedule.daily',
  'manual.trigger',
  'psych.tag.detected',
  'product.detected_in_transcript',
  'customer.matched_from_transcript',
  'call_intent.classified',
  'psych.analysis.completed',
  'customer.repeat_call.detected',
  'customer.first_call.detected',
  'customer.ltv.crossed_threshold',
  'customer.tagged_in_admin',
  'segment.weight_changed',
  'customer.order_created',
  'subuser.added',
  'task.completed',
  'task.overdue',
] as const;

export const WORKFLOW_CONDITIONS = [
  'call_intent',
  'psych_tag_includes',
  'product_mentioned',
  'previous_purchase_includes',
  'segment_member',
  'call_count_in_window',
  'is_first_call',
  'customer_ltv_gte',
  'order_count_in_window',
  'last_order_age_lte',
  'open_task_exists_for_intent',
  'axis_primary_is',
  'time_of_day_in_range',
  'day_of_week',
] as const;

export const WORKFLOW_ACTIONS = [
  'create_task',
  'pin_customer',
  'add_note',
  'segment_add',
  'segment_remove',
  'route_member',
  'add_watcher',
  'escalate',
  'send_mail',
  'no-op',
] as const;

export const psychTagSchema = z.enum(PSYCH_TAGS);
export const callIntentSchema = z.enum(CALL_INTENTS);
export const urgencyLevelSchema = z.enum(URGENCY_LEVELS);
export const workflowTriggerSchema = z.enum(WORKFLOW_TRIGGERS);
export const workflowConditionSchema = z.enum(WORKFLOW_CONDITIONS);
export const workflowActionSchema = z.enum(WORKFLOW_ACTIONS);

export type PsychTag = z.infer<typeof psychTagSchema>;
export type CallIntent = z.infer<typeof callIntentSchema>;
export type UrgencyLevel = z.infer<typeof urgencyLevelSchema>;
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;
export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export type WorkflowTriggerFamily = 'system' | 'ai_derived' | 'aggregate' | 'accounts' | 'chaining_prep';
export type WorkflowConditionCategory = 'ai' | 'commerce' | 'segment' | 'call_history' | 'task_state' | 'ownership' | 'time';
export type WorkflowValueType = 'string' | 'number' | 'boolean' | 'enum' | 'range' | 'window';

export interface WorkflowEnumOption<T extends string = string> {
  value: T;
  label: string;
}

export interface WorkflowTriggerOption extends WorkflowEnumOption<WorkflowTrigger> {
  family: WorkflowTriggerFamily;
  systemDefined: true;
}

export interface WorkflowConditionOption extends WorkflowEnumOption<WorkflowCondition> {
  category: WorkflowConditionCategory;
  valueType: WorkflowValueType;
  aiDerived: boolean;
  optionSource: 'call_intents' | 'psych_tags' | 'segments' | 'products' | 'members' | 'none';
}

export interface WorkflowActionOption extends WorkflowEnumOption<WorkflowAction> {
  createsTask: boolean;
  mutatesCustomer: boolean;
  auditOnly: boolean;
}

export const WORKFLOW_TRIGGER_GROUPS: Record<WorkflowTriggerFamily, readonly WorkflowTrigger[]> = {
  system: [
    'aircall.call.created',
    'aircall.call.ended',
    'aircall.call.missed',
    'aircall.transcript.received',
    'shopify.order.created',
    'shopify.order.cancelled',
    'shopify.order.refunded',
    'shopify.customer.created',
    'shopify.customer.updated',
    'segment.member_added',
    'segment.member_removed',
    'b2b_access.request.created',
    'support.request.created',
    'support.case.created',
    'schedule.daily',
    'manual.trigger',
  ],
  ai_derived: [
    'psych.tag.detected',
    'product.detected_in_transcript',
    'customer.matched_from_transcript',
    'call_intent.classified',
    'psych.analysis.completed',
  ],
  aggregate: [
    'customer.repeat_call.detected',
    'customer.first_call.detected',
    'customer.ltv.crossed_threshold',
    'customer.tagged_in_admin',
    'segment.weight_changed',
  ],
  accounts: [
    'customer.order_created',
    'subuser.added',
  ],
  chaining_prep: [
    'task.completed',
    'task.overdue',
  ],
};

export const WORKFLOW_TRIGGER_OPTIONS: readonly WorkflowTriggerOption[] = Object.entries(WORKFLOW_TRIGGER_GROUPS)
  .flatMap(([family, values]) => values.map((value) => ({
    value,
    label: labelFromEnum(value),
    family: family as WorkflowTriggerFamily,
    systemDefined: true as const,
  })));

export const WORKFLOW_CONDITION_OPTIONS: readonly WorkflowConditionOption[] = [
  { value: 'call_intent', label: 'Call intent', category: 'ai', valueType: 'enum', aiDerived: true, optionSource: 'call_intents' },
  { value: 'psych_tag_includes', label: 'Psych tag includes', category: 'ai', valueType: 'enum', aiDerived: true, optionSource: 'psych_tags' },
  { value: 'product_mentioned', label: 'Product mentioned', category: 'ai', valueType: 'string', aiDerived: true, optionSource: 'products' },
  { value: 'previous_purchase_includes', label: 'Previous purchase includes', category: 'commerce', valueType: 'string', aiDerived: false, optionSource: 'products' },
  { value: 'segment_member', label: 'Segment member', category: 'segment', valueType: 'string', aiDerived: false, optionSource: 'segments' },
  { value: 'call_count_in_window', label: 'Call count in window', category: 'call_history', valueType: 'window', aiDerived: false, optionSource: 'none' },
  { value: 'is_first_call', label: 'Is first call', category: 'call_history', valueType: 'boolean', aiDerived: false, optionSource: 'none' },
  { value: 'customer_ltv_gte', label: 'Customer LTV greater than or equal', category: 'commerce', valueType: 'number', aiDerived: false, optionSource: 'none' },
  { value: 'order_count_in_window', label: 'Order count in window', category: 'commerce', valueType: 'window', aiDerived: false, optionSource: 'none' },
  { value: 'last_order_age_lte', label: 'Last order age less than or equal', category: 'commerce', valueType: 'number', aiDerived: false, optionSource: 'none' },
  { value: 'open_task_exists_for_intent', label: 'Open task exists for intent', category: 'task_state', valueType: 'boolean', aiDerived: false, optionSource: 'none' },
  { value: 'axis_primary_is', label: 'Axis primary is', category: 'ownership', valueType: 'string', aiDerived: false, optionSource: 'members' },
  { value: 'time_of_day_in_range', label: 'Time of day in range', category: 'time', valueType: 'range', aiDerived: false, optionSource: 'none' },
  { value: 'day_of_week', label: 'Day of week', category: 'time', valueType: 'enum', aiDerived: false, optionSource: 'none' },
] as const;

export const WORKFLOW_ACTION_OPTIONS: readonly WorkflowActionOption[] = [
  { value: 'create_task', label: 'Create task', createsTask: true, mutatesCustomer: false, auditOnly: false },
  { value: 'pin_customer', label: 'Pin customer', createsTask: false, mutatesCustomer: true, auditOnly: false },
  { value: 'add_note', label: 'Add note', createsTask: false, mutatesCustomer: true, auditOnly: false },
  { value: 'segment_add', label: 'Add to segment', createsTask: false, mutatesCustomer: true, auditOnly: false },
  { value: 'segment_remove', label: 'Remove from segment', createsTask: false, mutatesCustomer: true, auditOnly: false },
  { value: 'route_member', label: 'Route member', createsTask: false, mutatesCustomer: false, auditOnly: false },
  { value: 'add_watcher', label: 'Add watcher', createsTask: false, mutatesCustomer: false, auditOnly: false },
  { value: 'escalate', label: 'Escalate', createsTask: false, mutatesCustomer: false, auditOnly: false },
  { value: 'send_mail', label: 'Send mail (disabled)', createsTask: false, mutatesCustomer: false, auditOnly: true },
  { value: 'no-op', label: 'No-op', createsTask: false, mutatesCustomer: false, auditOnly: true },
] as const;

export const WORKFLOW_ENUM_COUNTS = {
  psychTags: PSYCH_TAGS.length,
  callIntents: CALL_INTENTS.length,
  urgencyLevels: URGENCY_LEVELS.length,
  triggers: WORKFLOW_TRIGGERS.length,
  conditions: WORKFLOW_CONDITIONS.length,
  actions: WORKFLOW_ACTIONS.length,
} as const;

export const WORKFLOW_ENUM_CATALOG = {
  version: WORKFLOW_ENUM_VERSION,
  psychTags: PSYCH_TAGS.map(option),
  callIntents: CALL_INTENTS.map(option),
  urgencyLevels: URGENCY_LEVELS.map(option),
  triggers: WORKFLOW_TRIGGER_OPTIONS,
  triggerGroups: WORKFLOW_TRIGGER_GROUPS,
  conditions: WORKFLOW_CONDITION_OPTIONS,
  actions: WORKFLOW_ACTION_OPTIONS,
  counts: WORKFLOW_ENUM_COUNTS,
} as const;

export const workflowEnumCatalogResponseSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  psychTags: z.array(z.object({ value: psychTagSchema, label: z.string() })),
  callIntents: z.array(z.object({ value: callIntentSchema, label: z.string() })),
  urgencyLevels: z.array(z.object({ value: urgencyLevelSchema, label: z.string() })),
  triggers: z.array(z.object({
    value: workflowTriggerSchema,
    label: z.string(),
    family: z.enum(['system', 'ai_derived', 'aggregate', 'accounts', 'chaining_prep']),
    systemDefined: z.literal(true),
  })),
  triggerGroups: z.record(z.string(), z.array(workflowTriggerSchema)),
  conditions: z.array(z.object({
    value: workflowConditionSchema,
    label: z.string(),
    category: z.enum(['ai', 'commerce', 'segment', 'call_history', 'task_state', 'ownership', 'time']),
    valueType: z.enum(['string', 'number', 'boolean', 'enum', 'range', 'window']),
    aiDerived: z.boolean(),
    optionSource: z.enum(['call_intents', 'psych_tags', 'segments', 'products', 'members', 'none']),
  })),
  actions: z.array(z.object({
    value: workflowActionSchema,
    label: z.string(),
    createsTask: z.boolean(),
    mutatesCustomer: z.boolean(),
    auditOnly: z.boolean(),
  })),
  counts: z.object({
    psychTags: z.number(),
    callIntents: z.number(),
    urgencyLevels: z.number(),
    triggers: z.number(),
    conditions: z.number(),
    actions: z.number(),
  }),
});
export type WorkflowEnumCatalogResponse = z.infer<typeof workflowEnumCatalogResponseSchema>;

export const workflowEnumChainProbeResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  checkedAt: z.string(),
  counts: workflowEnumCatalogResponseSchema.shape.counts,
  prompt: z.object({
    promptKey: z.string(),
    promptVersion: z.string(),
    includesAllPsychTags: z.boolean(),
    includesAllCallIntents: z.boolean(),
    includesAllUrgencyLevels: z.boolean(),
    includesAllConditions: z.boolean(),
  }),
  canvas: z.object({
    source: z.string(),
    triggerOptions: z.number(),
    conditionOptions: z.number(),
    actionOptions: z.number(),
  }),
  executor: z.object({
    recognizedTriggers: z.number(),
    recognizedConditions: z.number(),
    recognizedActions: z.number(),
  }),
  probeValues: z.object({
    trigger: workflowTriggerSchema,
    condition: workflowConditionSchema,
    action: workflowActionSchema,
    psychTag: psychTagSchema,
    callIntent: callIntentSchema,
    urgencyLevel: urgencyLevelSchema,
  }),
});
export type WorkflowEnumChainProbeResponse = z.infer<typeof workflowEnumChainProbeResponseSchema>;

export function buildTranscriptResolverPromptFromEnums() {
  return [
    'You are FactoryEngine transcript resolver.',
    `Use only these psych_tags: ${PSYCH_TAGS.join(', ')}`,
    `Use only these call_intents: ${CALL_INTENTS.join(', ')}`,
    `Use only these urgency_levels: ${URGENCY_LEVELS.join(', ')}`,
    `Resolver-backed conditions: ${WORKFLOW_CONDITIONS.join(', ')}`,
    'Return JSON only. Do not invent enum values.',
  ].join('\n');
}

export function workflowEnumProbeValues() {
  return {
    trigger: WORKFLOW_TRIGGERS[WORKFLOW_TRIGGERS.length - 1],
    condition: WORKFLOW_CONDITIONS[WORKFLOW_CONDITIONS.length - 1],
    action: WORKFLOW_ACTIONS[WORKFLOW_ACTIONS.length - 1],
    psychTag: PSYCH_TAGS[PSYCH_TAGS.length - 1],
    callIntent: CALL_INTENTS[CALL_INTENTS.length - 1],
    urgencyLevel: URGENCY_LEVELS[URGENCY_LEVELS.length - 1],
  };
}

function option<T extends string>(value: T): WorkflowEnumOption<T> {
  return { value, label: labelFromEnum(value) };
}

function labelFromEnum(value: string) {
  return value
    .replace(/[-_.]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
