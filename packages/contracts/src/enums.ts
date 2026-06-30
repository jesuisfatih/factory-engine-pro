import { z } from 'zod';

export const WORKFLOW_ENUM_VERSION = '2026-06-30.2';

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

export const OPERATIONAL_INTENTS = [
  'heat_press_purchase_intent',
  'dtf_supply_reorder_signal',
  'quote_request',
  'callback_requested',
  'refund_requested',
  'shipping_status_question',
  'financing_question',
  'price_objection',
  'product_fit_question',
  'sample_request',
  'machine_upgrade_interest',
  'training_installation_need',
  'existing_customer_expansion_signal',
  'no_action',
] as const;

export const CREATE_TASK_AXIS = [
  'sales',
  'account',
] as const;

export const SERVICE_REQUEST_SOURCES = [
  'manual',
  'customer_self_service',
  'admin_created',
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
  'schedule.daily',
  'manual.trigger',
  'psych.tag.detected',
  'product.detected_in_transcript',
  'customer.matched_from_transcript',
  'call_intent.classified',
  'psych.analysis.completed',
  'call.operational_signal.detected',
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
  'operational_intent',
] as const;

export const WORKFLOW_ACTIONS = [
  'create_task',
  'pin_customer',
  'add_note',
  'segment_add',
  'segment_remove',
  'route_member',
  'route_segment_owner',
  'add_watcher',
  'escalate',
  'send_mail',
  'no-op',
] as const;

export const psychTagSchema = z.enum(PSYCH_TAGS);
export const callIntentSchema = z.enum(CALL_INTENTS);
export const urgencyLevelSchema = z.enum(URGENCY_LEVELS);
export const operationalIntentSchema = z.enum(OPERATIONAL_INTENTS);
export const createTaskAxisSchema = z.enum(CREATE_TASK_AXIS);
export const serviceRequestSourceSchema = z.enum(SERVICE_REQUEST_SOURCES);
export const workflowTriggerSchema = z.enum(WORKFLOW_TRIGGERS);
export const workflowConditionSchema = z.enum(WORKFLOW_CONDITIONS);
export const workflowActionSchema = z.enum(WORKFLOW_ACTIONS);

export type PsychTag = z.infer<typeof psychTagSchema>;
export type CallIntent = z.infer<typeof callIntentSchema>;
export type UrgencyLevel = z.infer<typeof urgencyLevelSchema>;
export type OperationalIntent = z.infer<typeof operationalIntentSchema>;
export type CreateTaskAxis = z.infer<typeof createTaskAxisSchema>;
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;
export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export function assertCreateTaskAxisContract(axis: CreateTaskAxis) {
  switch (axis) {
    case 'sales':
    case 'account':
      return axis;
    default:
      return exhaustiveEnum(axis);
  }
}

export function assertServiceRequestSourceContract(source: z.infer<typeof serviceRequestSourceSchema>) {
  switch (source) {
    case 'manual':
    case 'customer_self_service':
    case 'admin_created':
      return source;
    default:
      return exhaustiveEnum(source);
  }
}

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
  optionSource: 'call_intents' | 'psych_tags' | 'operational_intents' | 'segments' | 'products' | 'members' | 'none';
}

export interface WorkflowActionOption extends WorkflowEnumOption<WorkflowAction> {
  createsTask: boolean;
  mutatesCustomer: boolean;
  auditOnly: boolean;
}

export type WorkflowOperationalIntentExpectedOutcome = `task:${CreateTaskAxis}` | 'no-op';

export interface WorkflowOperationalIntentRegistryEntry extends WorkflowEnumOption<OperationalIntent> {
  defaultAxis: CreateTaskAxis | null;
  expectedOutcome: WorkflowOperationalIntentExpectedOutcome;
  taskTitle: string | null;
  keywords: readonly string[];
  examples: readonly string[];
}

export const OPERATIONAL_INTENT_REGISTRY = [
  operationalIntentEntry('heat_press_purchase_intent', 'sales', 'Heat press purchase follow-up', [
    'heat press',
    'hydro',
    'hydraulic press',
    'press machine',
    'machine purchase',
    'dual station',
    'auto open',
    'clamshell',
    'swing away',
    'pneumatic',
    '16x20',
    '15x15',
    'heat platen',
    'sublimation press',
    'mug press',
    'cap press',
    'rhinestone press',
  ], [
    "Heat press fiyati soranlari Linda'ya high priority callback task yap.",
    'Create a sales follow-up when a caller asks which heat press to buy.',
  ]),
  operationalIntentEntry('dtf_supply_reorder_signal', 'sales', 'DTF supply reorder follow-up', [
    'dtf supply',
    'dtf supplies',
    'supplies',
    'ink',
    'white ink',
    'cmyk',
    'powder',
    'adhesive powder',
    'hot melt',
    'film',
    'pet film',
    'roll film',
    'transfer film',
    'transfer',
    'gang sheet',
    'dtf transfers',
    'consumable',
    'cleaning solution',
    'printhead',
    'maintenance',
    'reorder',
    'restock',
    'running low',
    'out of ink',
    'out of film',
    'out of powder',
    'need more',
    'again',
  ], [
    'Route DTF supply reorder signals to the segment owner.',
    'Create a sales task when an existing customer is running low on film or powder.',
  ]),
  operationalIntentEntry('quote_request', 'sales', 'Quote request follow-up', [
    'quote',
    'estimate',
    'proposal',
    'invoice',
    'pricing send',
    'send pricing',
    'send me price',
    'purchase order',
    'po',
    'bulk pricing',
    'volume pricing',
    'wholesale',
    'reseller',
    'net terms',
  ], [
    'Create a quote follow-up task for bulk pricing requests.',
  ]),
  operationalIntentEntry('callback_requested', 'sales', 'Callback requested follow-up', [
    'call back',
    'callback',
    'call me',
    'call me back',
    'can someone call',
    'ring me',
    'missed call',
    'voicemail',
    'left a message',
    'reach out',
    'follow up',
    'schedule a call',
    'tekrar ara',
  ], [
    'Create a same-day callback task when the caller asks to be called back.',
  ]),
  operationalIntentEntry('refund_requested', 'account', 'Refund review follow-up', [
    'refund',
    'return',
    'chargeback',
    'cancel order',
    'cancel my order',
    'money back',
    'dispute',
    'exchange',
    'return label',
    'replacement',
    'iade',
  ], [
    'Create an account follow-up task for refund or return requests.',
  ]),
  operationalIntentEntry('shipping_status_question', 'account', 'Shipping status follow-up', [
    'shipping',
    'delivery',
    'tracking',
    'freight',
    'liftgate',
    'address',
    'where is my order',
    'eta',
    'lost package',
    'damaged shipment',
    'dock',
    'kargo',
  ], [
    'Create an account follow-up task when a customer asks about freight or tracking.',
  ]),
  operationalIntentEntry('financing_question', 'account', 'Financing question follow-up', [
    'financing',
    'finance',
    'lease',
    'leasing',
    'timepayment',
    'monthly payment',
    'payment plan',
    'installments',
    'shop pay',
    'affirm',
    'down payment',
    'credit application',
    'finans',
  ], [
    'Create an account follow-up task for heat press financing questions.',
  ]),
  operationalIntentEntry('price_objection', 'sales', 'Price objection follow-up', [
    'price',
    'discount',
    'expensive',
    'too much',
    'cheaper',
    'price match',
    'match price',
    'competitor cheaper',
    'coupon',
    'promo',
    'deal',
    'budget',
    'can you do better',
    'fiyat',
    'indirim',
  ], [
    'Create a sales save task when the customer objects to heat press pricing.',
  ]),
  operationalIntentEntry('product_fit_question', 'sales', 'Product fit consultation follow-up', [
    'which machine',
    'which one',
    'right machine',
    'what size',
    'what do i need',
    'compare',
    'recommend',
    'recommendation',
    'fit my',
    'beginner',
    'startup',
    'starter',
    'best for shirts',
    'best for hats',
    'compatibility',
    'compatible',
    'works with',
    'production volume',
    'uygun',
  ], [
    'Create a product-fit consultation task for callers comparing machines.',
  ]),
  operationalIntentEntry('sample_request', 'sales', 'Sample request follow-up', [
    'sample',
    'samples',
    'test print',
    'demo print',
    'sample pack',
    'proof',
    'see quality',
    'numune',
  ], [
    'Create a sales task when the caller asks for a sample pack.',
  ]),
  operationalIntentEntry('machine_upgrade_interest', 'sales', 'Machine upgrade follow-up', [
    'upgrade',
    'bigger machine',
    'larger machine',
    'second machine',
    'another machine',
    'replace my machine',
    'faster machine',
    'higher volume',
    'more production',
    'add station',
    'dual station upgrade',
    'new location',
  ], [
    'Create an upgrade task when an existing customer wants a larger or second press.',
  ]),
  operationalIntentEntry('training_installation_need', 'account', 'Training or installation follow-up', [
    'training',
    'installation',
    'install',
    'setup',
    'assembly',
    'how to use',
    'onboarding',
    'calibration',
    'pressure setting',
    'temperature setting',
    'time setting',
    'not heating',
    'wont heat',
    "won't heat",
    'uneven pressure',
    'peeling',
    'curing',
    'error code',
    'not working',
    'troubleshoot',
    'kurulum',
    'egitim',
  ], [
    'Create an account follow-up task for installation, setup, or training needs.',
  ]),
  operationalIntentEntry('existing_customer_expansion_signal', 'sales', 'Existing customer expansion follow-up', [
    'existing customer',
    'buy more',
    'add another',
    'new product',
    'also need',
    'upsell',
    'more locations',
    'new location',
    'expanding',
    'new employee',
    'new line',
    'more volume',
    'second unit',
  ], [
    'Create an expansion task when an existing customer is adding capacity.',
  ]),
  operationalIntentEntry('no_action', null, null, [
    'no action',
    'not actionable',
    'wrong number',
    'spam',
    'silent call',
  ], [
    'Audit a transcript as no_action with an explicit reason when no sales or account follow-up exists.',
  ]),
] as const satisfies readonly WorkflowOperationalIntentRegistryEntry[];

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
    'schedule.daily',
    'manual.trigger',
  ],
  ai_derived: [
    'psych.tag.detected',
    'product.detected_in_transcript',
    'customer.matched_from_transcript',
    'call_intent.classified',
    'psych.analysis.completed',
    'call.operational_signal.detected',
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
  { value: 'operational_intent', label: 'Operational intent', category: 'ai', valueType: 'enum', aiDerived: true, optionSource: 'operational_intents' },
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
  { value: 'route_segment_owner', label: 'Route segment owner', createsTask: false, mutatesCustomer: false, auditOnly: false },
  { value: 'add_watcher', label: 'Add watcher', createsTask: false, mutatesCustomer: false, auditOnly: false },
  { value: 'escalate', label: 'Escalate', createsTask: false, mutatesCustomer: false, auditOnly: false },
  { value: 'send_mail', label: 'Send mail', createsTask: false, mutatesCustomer: false, auditOnly: true },
  { value: 'no-op', label: 'No-op', createsTask: false, mutatesCustomer: false, auditOnly: true },
] as const;

export const WORKFLOW_ENUM_COUNTS = {
  psychTags: PSYCH_TAGS.length,
  callIntents: CALL_INTENTS.length,
  operationalIntents: OPERATIONAL_INTENTS.length,
  urgencyLevels: URGENCY_LEVELS.length,
  createTaskAxes: CREATE_TASK_AXIS.length,
  serviceRequestSources: SERVICE_REQUEST_SOURCES.length,
  triggers: WORKFLOW_TRIGGERS.length,
  conditions: WORKFLOW_CONDITIONS.length,
  actions: WORKFLOW_ACTIONS.length,
} as const;

export const WORKFLOW_ENUM_CATALOG = {
  version: WORKFLOW_ENUM_VERSION,
  psychTags: PSYCH_TAGS.map(option),
  callIntents: CALL_INTENTS.map(option),
  operationalIntents: OPERATIONAL_INTENT_REGISTRY,
  urgencyLevels: URGENCY_LEVELS.map(option),
  createTaskAxes: CREATE_TASK_AXIS.map(option),
  serviceRequestSources: SERVICE_REQUEST_SOURCES.map(option),
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
  operationalIntents: z.array(z.object({
    value: operationalIntentSchema,
    label: z.string(),
    defaultAxis: createTaskAxisSchema.nullable(),
    expectedOutcome: z.union([z.literal('task:sales'), z.literal('task:account'), z.literal('no-op')]),
    taskTitle: z.string().nullable(),
    keywords: z.array(z.string()),
    examples: z.array(z.string()),
  })),
  urgencyLevels: z.array(z.object({ value: urgencyLevelSchema, label: z.string() })),
  createTaskAxes: z.array(z.object({ value: createTaskAxisSchema, label: z.string() })),
  serviceRequestSources: z.array(z.object({ value: serviceRequestSourceSchema, label: z.string() })),
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
    optionSource: z.enum(['call_intents', 'psych_tags', 'operational_intents', 'segments', 'products', 'members', 'none']),
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
    operationalIntents: z.number(),
    urgencyLevels: z.number(),
    createTaskAxes: z.number(),
    serviceRequestSources: z.number(),
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
    includesAllOperationalIntents: z.boolean(),
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
    operationalIntent: operationalIntentSchema,
    urgencyLevel: urgencyLevelSchema,
  }),
});
export type WorkflowEnumChainProbeResponse = z.infer<typeof workflowEnumChainProbeResponseSchema>;

export function buildTranscriptResolverPromptFromEnums() {
  return [
    'You are FactoryEngine transcript resolver.',
    `Use only these psych_tags: ${PSYCH_TAGS.join(', ')}`,
    `Use only these call_intents: ${CALL_INTENTS.join(', ')}`,
    `Use only these operational_intents: ${OPERATIONAL_INTENTS.join(', ')}`,
    `Operational intent registry: ${OPERATIONAL_INTENT_REGISTRY.map((entry) => `${entry.value}=>${entry.expectedOutcome}`).join('; ')}`,
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
    operationalIntent: OPERATIONAL_INTENTS[OPERATIONAL_INTENTS.length - 1],
    urgencyLevel: URGENCY_LEVELS[URGENCY_LEVELS.length - 1],
  };
}

function option<T extends string>(value: T): WorkflowEnumOption<T> {
  return { value, label: labelFromEnum(value) };
}

function operationalIntentEntry(
  value: OperationalIntent,
  defaultAxis: CreateTaskAxis | null,
  taskTitle: string | null,
  keywords: readonly string[],
  examples: readonly string[],
): WorkflowOperationalIntentRegistryEntry {
  return {
    value,
    label: labelFromEnum(value),
    defaultAxis,
    expectedOutcome: defaultAxis ? `task:${defaultAxis}` : 'no-op',
    taskTitle,
    keywords,
    examples,
  };
}

export function operationalIntentRegistryEntry(intent: OperationalIntent) {
  const entry = OPERATIONAL_INTENT_REGISTRY.find((candidate) => candidate.value === intent);
  if (!entry) throw new Error(`Operational intent is not registered: ${intent}`);
  return entry;
}

export function defaultAxisForOperationalIntent(intent: OperationalIntent) {
  return operationalIntentRegistryEntry(intent).defaultAxis;
}

export function expectedOutcomeForOperationalIntent(intent: OperationalIntent) {
  return operationalIntentRegistryEntry(intent).expectedOutcome;
}

export function taskTitleForOperationalIntent(intent: OperationalIntent) {
  return operationalIntentRegistryEntry(intent).taskTitle;
}

export function detectOperationalIntentFromText(value: unknown): OperationalIntent {
  const text = normalizeWorkflowHumanText(value);
  const matched = OPERATIONAL_INTENT_REGISTRY.find((entry) => {
    if (entry.value === 'no_action') return false;
    return entry.keywords.some((keyword) => workflowHumanTextHasKeyword(text, keyword));
  });
  return matched?.value ?? 'no_action';
}

export function normalizeWorkflowHumanText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function workflowHumanTextHasKeyword(text: string, keyword: string) {
  const normalizedKeyword = normalizeWorkflowHumanText(keyword);
  if (!normalizedKeyword) return false;
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function labelFromEnum(value: string) {
  return value
    .replace(/[-_.]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function exhaustiveEnum(value: never): never {
  throw new Error(`Unhandled workflow enum value: ${String(value)}`);
}
