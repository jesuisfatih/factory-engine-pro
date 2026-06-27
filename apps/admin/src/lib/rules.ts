/**
 * ─── Task Generation Rules Engine — UI JSON contract ────────────────────────
 *
 * NOTE: This is the JSON contract shape that the admin UI authors.
 * The execution engine that consumes these rules DOES NOT EXIST YET.
 * Anything saved here is metadata only; nothing fires in production.
 *
 * Schema is intentionally designed to carry, *day one*, the seven gaps we
 * identified so the engine can plug in later without a migration:
 *
 *   1. temporal     → fields like `call.count_in_last_7d`
 *   2. confidence   → `Condition.confidence_gte` for AI-extracted fields
 *   3. telemetry    → `Rule.fires_count_7d / avg_resolution_hours / ...`
 *   4. lifecycle    → `Rule.lifecycle: 'draft' | 'shadow' | 'active' | 'archived'`
 *   5. axis         → `CreateTaskActionConfig.assignee_axis`
 *   6. multi-action → `Rule.actions: RuleAction[]` (array even though MVP uses 1)
 *   7. no-op        → action type `'skip'` with a `reason`
 *
 * Adding a new condition field == widen `ConditionField` union.
 * Adding a new action type == add to `RuleAction` discriminated union.
 * Everything else stays.
 */

/* ─── Identity ──────────────────────────────────────────── */
export type RuleLifecycle = 'draft' | 'shadow' | 'active' | 'archived';

/* ─── Triggers (only one MVP; union is open for the engine) ── */
export type RuleTrigger =
  | { type: 'transcript_received' }
  | { type: 'stale_detected' }
  | { type: 'order_placed' };

/* ─── Conditions (whitelist of fields admin can use) ─── */
export type ConditionField =
  // AI extraction (each may carry confidence)
  | 'intent'
  | 'product_sku'
  | 'transcript_keywords'
  // Customer state
  | 'customer.lifecycle'
  | 'customer.segments'
  | 'customer.lifetime_value_usd'
  | 'customer.last_contact_days_ago'
  // Temporal — call frequency
  | 'call.count_in_last_7d'
  | 'call.count_in_last_30d'
  | 'call.same_intent_count_last_30d'
  | 'call.is_repeat'
  // State — existing task linkage
  | 'existing_open_task_for_intent_id'
  // Time-of-day / day-of-week (tenant-local)
  | 'time.hour_local'
  | 'time.day_of_week';

export type ConditionOperator =
  | '=' | '!=' | '>=' | '<=' | '>' | '<'
  | 'in' | 'not_in'
  | 'contains' | 'starts_with';

export interface RuleCondition {
  id: string;
  field: ConditionField;
  op: ConditionOperator;
  value: unknown;
  /** Only valid for AI-derived fields. Engine validates upstream. */
  confidence_gte?: number;
}

/* ─── Actions (discriminated union, multi-action via array) ─── */
export type AssigneeAxis = 'sales' | 'customer_service' | 'support_lead' | 'accounting' | 'admin';
export type TaskTemplate = 'default' | 'discount_approval' | 'shipping_claim' | 'vip_outreach';

export interface CreateTaskActionConfig {
  assignee_axis: AssigneeAxis;
  template: TaskTemplate;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}
export interface AppendExistingActionConfig {
  /** Where to find the open task: from context field. */
  source: 'existing_open_task_for_intent';
}
export interface SkipActionConfig {
  reason: string;
}
export interface EscalateActionConfig {
  to: AssigneeAxis;
  reason: string;
}
export interface AddWatcherActionConfig {
  axis: AssigneeAxis;
}
export interface NotifyActionConfig {
  channel: 'slack' | 'email';
  audience: AssigneeAxis;
  message_template: string;
}

export type RuleAction =
  | { id: string; type: 'create_task'; config: CreateTaskActionConfig }
  | { id: string; type: 'append_existing'; config: AppendExistingActionConfig }
  | { id: string; type: 'skip'; config: SkipActionConfig }
  | { id: string; type: 'escalate'; config: EscalateActionConfig }
  | { id: string; type: 'add_watcher'; config: AddWatcherActionConfig }
  | { id: string; type: 'notify'; config: NotifyActionConfig };

/* ─── Telemetry slots (engine fills, UI displays) ─── */
export interface RuleTelemetry {
  fires_total: number;
  fires_count_7d: number;
  avg_resolution_hours: number | null;
  last_fired_at: string | null;
  /** ratio of created tasks that get reassigned within 2h — early miscalibration signal */
  reassignment_rate_7d: number | null;
}

/* ─── Rule (the unit admin authors) ─── */
export interface Rule {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  priority: number;
  /** First-match-wins by default. Setting false allows compose / overlay. */
  terminating: boolean;
  lifecycle: RuleLifecycle;

  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];

  telemetry: RuleTelemetry;
  created_at: string;
  updated_at: string;
  created_by: string;
}

/* ─── Field metadata for the condition UI ─── */
export interface ConditionFieldDef {
  id: ConditionField;
  label: string;
  category: 'ai' | 'customer' | 'temporal' | 'state' | 'time';
  value_type: 'string' | 'number' | 'enum' | 'multi' | 'boolean';
  ai_derived: boolean;
  options?: string[];
}

export const CONDITION_FIELDS: ConditionFieldDef[] = [
  { id: 'intent',                                label: 'Call intent',                       category: 'ai',       value_type: 'enum',    ai_derived: true,  options: ['sales', 'support', 'shipping', 'billing', 'product_question', 'cancel'] },
  { id: 'product_sku',                           label: 'Product SKU',                       category: 'ai',       value_type: 'string',  ai_derived: true },
  { id: 'transcript_keywords',                   label: 'Transcript keywords',               category: 'ai',       value_type: 'multi',   ai_derived: true },
  { id: 'customer.lifecycle',                    label: 'Customer lifecycle',                category: 'customer', value_type: 'enum',    ai_derived: false, options: ['lead', 'engaged', 'active', 'at_risk', 'churned'] },
  { id: 'customer.segments',                     label: 'Customer in segment',               category: 'customer', value_type: 'multi',   ai_derived: false },
  { id: 'customer.lifetime_value_usd',           label: 'Lifetime value (USD)',              category: 'customer', value_type: 'number',  ai_derived: false },
  { id: 'customer.last_contact_days_ago',        label: 'Days since last contact',           category: 'temporal', value_type: 'number',  ai_derived: false },
  { id: 'call.count_in_last_7d',                 label: 'Calls in last 7 days',              category: 'temporal', value_type: 'number',  ai_derived: false },
  { id: 'call.count_in_last_30d',                label: 'Calls in last 30 days',             category: 'temporal', value_type: 'number',  ai_derived: false },
  { id: 'call.same_intent_count_last_30d',       label: 'Same-intent calls last 30 days',    category: 'temporal', value_type: 'number',  ai_derived: false },
  { id: 'call.is_repeat',                        label: 'Is repeat caller',                  category: 'temporal', value_type: 'boolean', ai_derived: false },
  { id: 'existing_open_task_for_intent_id',      label: 'Open task already exists for intent', category: 'state',  value_type: 'boolean', ai_derived: false },
  { id: 'time.hour_local',                       label: 'Hour of day (tenant local)',        category: 'time',     value_type: 'number',  ai_derived: false },
  { id: 'time.day_of_week',                      label: 'Day of week (0=Sun)',               category: 'time',     value_type: 'number',  ai_derived: false },
];

/* ─── Mock storage (UI prototype only) ─── */
const delay = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms));

const NOW_ISO = '2026-06-27 14:21';

const RULES: Rule[] = [
  {
    id: 'rl1',
    tenant_id: 'dtfbank',
    name: 'Hydro-1620 sales — high priority to Ahmet',
    description: 'When a sales-intent call mentions hydro-1620, route to the named rep at urgent priority.',
    priority: 10,
    terminating: true,
    lifecycle: 'draft',
    trigger: { type: 'transcript_received' },
    conditions: [
      { id: 'c1', field: 'intent', op: '=', value: 'sales', confidence_gte: 0.8 },
      { id: 'c2', field: 'product_sku', op: '=', value: 'hydro-1620', confidence_gte: 0.7 },
    ],
    actions: [
      { id: 'a1', type: 'create_task', config: { assignee_axis: 'sales', template: 'default', priority: 'urgent' } },
    ],
    telemetry: { fires_total: 0, fires_count_7d: 0, avg_resolution_hours: null, last_fired_at: null, reassignment_rate_7d: null },
    created_at: NOW_ISO, updated_at: NOW_ISO, created_by: 'owner@dtfbank.com',
  },
  {
    id: 'rl2',
    tenant_id: 'dtfbank',
    name: 'Repeat caller — escalate after 3 in a week',
    description: 'Third call in 7 days fires an escalation to support lead and adds them as watcher.',
    priority: 20,
    terminating: false,
    lifecycle: 'shadow',
    trigger: { type: 'transcript_received' },
    conditions: [
      { id: 'c3', field: 'call.count_in_last_7d', op: '>=', value: 3 },
    ],
    actions: [
      { id: 'a2', type: 'escalate', config: { to: 'support_lead', reason: 'Repeat caller threshold reached.' } },
      { id: 'a3', type: 'add_watcher', config: { axis: 'support_lead' } },
    ],
    telemetry: { fires_total: 14, fires_count_7d: 2, avg_resolution_hours: 6.2, last_fired_at: '2026-06-26 11:42', reassignment_rate_7d: 0.12 },
    created_at: NOW_ISO, updated_at: NOW_ISO, created_by: 'owner@dtfbank.com',
  },
  {
    id: 'rl3',
    tenant_id: 'dtfbank',
    name: 'Skip pure "thank you" calls',
    description: 'Calls whose transcript boils down to a thank-you message do not need a task.',
    priority: 5,
    terminating: true,
    lifecycle: 'active',
    trigger: { type: 'transcript_received' },
    conditions: [
      { id: 'c4', field: 'transcript_keywords', op: 'contains', value: 'thank you', confidence_gte: 0.85 },
    ],
    actions: [
      { id: 'a4', type: 'skip', config: { reason: 'Customer just wanted to express thanks — no follow-up needed.' } },
    ],
    telemetry: { fires_total: 42, fires_count_7d: 6, avg_resolution_hours: null, last_fired_at: '2026-06-26 18:11', reassignment_rate_7d: null },
    created_at: NOW_ISO, updated_at: NOW_ISO, created_by: 'owner@dtfbank.com',
  },
  {
    id: 'rl4',
    tenant_id: 'dtfbank',
    name: 'VIP customer outreach — stale 30 days',
    description: 'High-LTV customers untouched for 30+ days get a proactive outreach task to their assigned rep.',
    priority: 30,
    terminating: true,
    lifecycle: 'active',
    trigger: { type: 'stale_detected' },
    conditions: [
      { id: 'c5', field: 'customer.lifetime_value_usd', op: '>=', value: 25000 },
      { id: 'c6', field: 'customer.last_contact_days_ago', op: '>=', value: 30 },
    ],
    actions: [
      { id: 'a5', type: 'create_task', config: { assignee_axis: 'sales', template: 'vip_outreach', priority: 'normal' } },
    ],
    telemetry: { fires_total: 8, fires_count_7d: 3, avg_resolution_hours: 12.4, last_fired_at: '2026-06-25 09:14', reassignment_rate_7d: 0 },
    created_at: NOW_ISO, updated_at: NOW_ISO, created_by: 'owner@dtfbank.com',
  },
];

export async function fetchRules(): Promise<Rule[]> {
  await delay();
  return RULES.map((rule) => ({
    ...rule,
    conditions: rule.conditions.map((condition) => ({ ...condition })),
    actions: rule.actions.map((action) => ({ ...action, config: { ...action.config } })) as RuleAction[],
    telemetry: { ...rule.telemetry },
  }));
}

export async function saveRule(input: Rule): Promise<Rule> {
  await delay(180);
  const idx = RULES.findIndex((rule) => rule.id === input.id);
  const next: Rule = { ...input, updated_at: 'just now' };
  if (idx >= 0) RULES[idx] = next;
  else RULES.push(next);
  return next;
}

export async function deleteRule(id: string): Promise<void> {
  await delay(120);
  const idx = RULES.findIndex((rule) => rule.id === id);
  if (idx >= 0) RULES.splice(idx, 1);
}

/* ─── Helpers ─────────────────────────────────────────────── */
export function makeDraftRule(): Rule {
  const id = `rl-draft-${Date.now()}`;
  return {
    id,
    tenant_id: 'dtfbank',
    name: 'New rule',
    description: '',
    priority: 50,
    terminating: true,
    lifecycle: 'draft',
    trigger: { type: 'transcript_received' },
    conditions: [],
    actions: [],
    telemetry: { fires_total: 0, fires_count_7d: 0, avg_resolution_hours: null, last_fired_at: null, reassignment_rate_7d: null },
    created_at: 'just now', updated_at: 'just now', created_by: 'owner@dtfbank.com',
  };
}

export function makeCondition(field: ConditionField = 'intent'): RuleCondition {
  const def = CONDITION_FIELDS.find((entry) => entry.id === field)!;
  return {
    id: `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    field,
    op: def.value_type === 'boolean' ? '=' : def.value_type === 'number' ? '>=' : '=',
    value: def.value_type === 'boolean' ? true : def.value_type === 'number' ? 0 : '',
    confidence_gte: def.ai_derived ? 0.8 : undefined,
  };
}

export function makeAction(type: RuleAction['type'] = 'create_task'): RuleAction {
  const id = `a-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  switch (type) {
    case 'create_task':     return { id, type, config: { assignee_axis: 'sales', template: 'default', priority: 'normal' } };
    case 'append_existing': return { id, type, config: { source: 'existing_open_task_for_intent' } };
    case 'skip':            return { id, type, config: { reason: '' } };
    case 'escalate':        return { id, type, config: { to: 'support_lead', reason: '' } };
    case 'add_watcher':     return { id, type, config: { axis: 'support_lead' } };
    case 'notify':          return { id, type, config: { channel: 'slack', audience: 'sales', message_template: '' } };
  }
}

export const LIFECYCLE_TONE: Record<RuleLifecycle, string> = {
  draft: '', shadow: 'warn', active: 'success', archived: 'danger',
};

export const ACTION_LABEL: Record<RuleAction['type'], string> = {
  create_task: 'Create task',
  append_existing: 'Append to existing task',
  skip: 'Skip / no-op',
  escalate: 'Escalate',
  add_watcher: 'Add watcher',
  notify: 'Send notification',
};

export const TRIGGER_LABEL: Record<RuleTrigger['type'], string> = {
  transcript_received: 'Transcript received',
  stale_detected: 'Stale customer detected',
  order_placed: 'Order placed',
};
