import type {
  CallCenterCreateCustomerTaskInput,
  CallCenterOverview,
  CallCenterSaveCustomerNoteInput,
  CallCenterTransferTaskInput,
  CustomerDetailPanelDto,
  CreatePricingRuleInput,
  CreateSegmentInput,
  DiscountType,
  PreviewSegmentInput,
  ScopeType,
  SegmentConditionInput,
  SegmentField,
  SegmentOperator,
  TargetType,
  UpdatePricingRuleInput,
} from '@factory-engine-pro/contracts';
import { adminApi } from './api';

export type TaskSurface = 'customer' | 'sales' | 'messages' | 'calendar' | 'email';

export interface TaskRow {
  id: string;
  surface: TaskSurface;
  title: string;
  customer: string;
  assignee: string;
  priority: string;
  dueAt: string;
  status: string;
  source: string;
}

export type EventSource = 'manual' | 'ai_transcript' | 'ai_segment' | 'ai_stale';

export interface CalendarEvent {
  id: string;
  title: string;
  customer?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  dayIso: string;
  startHour: number;
  durationMinutes: number;
  kind: string;
  source: EventSource;
  assignee?: string | null;
  aiBrief?: {
    whyCalling: string;
    painPoints: string[];
    callGoal: string;
    promptKey: string;
    promptVersion: string;
    modelUsed: string;
    confidence: number;
    transcriptSnippet?: string;
    suggestedActions: string[];
  };
}

export type PresenceStatus = 'online' | 'busy' | 'away' | 'offline';

export interface PresenceRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: PresenceStatus;
  lastSeen: string;
  unread: number;
  lastMessagePreview: string;
  lastMessageAt: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  fromMe: boolean;
  author: string;
  text: string;
  at: string;
}

export interface ServiceRequestRow {
  id: string;
  number: string;
  title: string;
  customer: string;
  status: string;
  priority: string;
  slaBreachAt?: string | null;
}

export interface SrTimelineEntry {
  id: string;
  kind: string;
  actor: string;
  at: string;
  body: string;
}

export type FieldGroup = 'company' | 'company_user' | 'shopify' | 'behavior';
export type RuleOperator = SegmentOperator;
export type LifecycleStage = 'lead' | 'engaged' | 'active' | 'at_risk' | 'churned';

type FieldType = 'string' | 'number' | 'boolean' | 'array';

export interface SegmentRule {
  id: string;
  group: FieldGroup;
  field: SegmentField;
  operator: RuleOperator;
  value: string;
}

export const FIELD_GROUPS: Array<{ id: FieldGroup; fields: Array<{ id: SegmentField; label: string; type: FieldType }> }> = [
  {
    id: 'company',
    fields: [
      { id: 'companyStatus', label: 'Customer status', type: 'string' },
      { id: 'companyGroup', label: 'Company group', type: 'string' },
      { id: 'companyEmail', label: 'Company email', type: 'string' },
      { id: 'companyPhone', label: 'Company phone', type: 'string' },
      { id: 'companyTaxId', label: 'Tax ID', type: 'string' },
      { id: 'currentLifecycleStage', label: 'Lifecycle stage', type: 'string' },
      { id: 'teamCount', label: 'Team count', type: 'number' },
    ],
  },
  {
    id: 'company_user',
    fields: [
      { id: 'companyUserRole', label: 'Customer user role', type: 'array' },
      { id: 'companyUserIsActive', label: 'Customer user active', type: 'boolean' },
    ],
  },
  {
    id: 'shopify',
    fields: [
      { id: 'shopifyCustomerTags', label: 'Shopify tags', type: 'array' },
      { id: 'shopifyCustomerSegmentIds', label: 'Shopify segment', type: 'array' },
      { id: 'shopifyCustomerAcceptsMarketing', label: 'Accepts marketing', type: 'boolean' },
      { id: 'shopifyCustomerState', label: 'Shopify state', type: 'string' },
      { id: 'shopifyCustomerLocale', label: 'Shopify locale', type: 'string' },
      { id: 'shopifyCustomerOrdersCount', label: 'Shopify orders', type: 'number' },
      { id: 'shopifyCustomerTotalSpent', label: 'Shopify total spent', type: 'number' },
      { id: 'totalRevenue', label: 'Total revenue', type: 'number' },
      { id: 'totalOrders', label: 'Total orders', type: 'number' },
      { id: 'avgOrderValue', label: 'Average order value', type: 'number' },
      { id: 'periodRevenue', label: 'Period revenue', type: 'number' },
      { id: 'periodOrders', label: 'Period orders', type: 'number' },
      { id: 'periodQuantity', label: 'Period quantity', type: 'number' },
    ],
  },
  {
    id: 'behavior',
    fields: [
      { id: 'daysSinceLastOrder', label: 'Days since last order', type: 'number' },
      { id: 'churnRisk', label: 'Churn risk', type: 'number' },
      { id: 'buyerIntent', label: 'Buyer intent', type: 'string' },
      { id: 'segment', label: 'Behavior segment', type: 'string' },
      { id: 'engagementScore', label: 'Engagement score', type: 'number' },
      { id: 'upsellPotential', label: 'Upsell potential', type: 'number' },
      { id: 'totalSessions', label: 'Total sessions', type: 'number' },
      { id: 'totalProductViews', label: 'Product views', type: 'number' },
      { id: 'totalAddToCarts', label: 'Add to carts', type: 'number' },
    ],
  },
];

export const RULE_OPERATORS: Record<FieldType, RuleOperator[]> = {
  string: ['eq', 'neq', 'contains', 'in', 'notIn'],
  number: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
  boolean: ['eq', 'neq'],
  array: ['contains', 'in', 'notIn'],
};

export type PricingTargetType = 'customer' | 'segment' | 'tag' | 'role';
export type PricingScopeType = 'all' | 'collection' | 'product';
export type PricingDiscountType = 'percentage' | 'fixed' | 'qty_break';

export interface PricingQtyBreak {
  id: string;
  minQty: number;
  discountPct: number;
}

export interface PricingRule {
  id: string;
  name: string;
  targetType: PricingTargetType;
  targetValue: string;
  scopeType: PricingScopeType;
  scopeValue: string;
  discountType: PricingDiscountType;
  amount: number;
  qtyBreaks: PricingQtyBreak[];
  combineWithOthers: boolean;
  combineWithCoupons: boolean;
  excludeOnSale: boolean;
  minCartUsd: number | null;
  priority: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export type CommissionAssignType = 'rep' | 'team';
export type CommissionRuleType = 'flat' | 'tiered' | 'segment' | 'product';
export type CommissionPeriod = 'monthly' | 'quarterly' | 'lifetime';

export interface CommissionRule {
  id: string;
  type: CommissionRuleType;
  target: string;
  ratePct: number;
  period: CommissionPeriod;
  priority: number;
  thresholdUsd: number | null;
  capUsd: number | null;
}

export interface CommissionProfile {
  id: string;
  name: string;
  assignType: CommissionAssignType;
  assigneeId: string | null;
  active: boolean;
  rules: CommissionRule[];
  updatedAt: string;
}

export interface SelleruserOption {
  id: string;
  email: string;
  name: string;
}

export const SELLERUSERS: SelleruserOption[] = [];

export async function fetchCallCenterOverview(): Promise<CallCenterOverview> {
  return adminApi.callCenterOverview();
}

export async function fetchCallCenterCustomerDetail(customerId: string): Promise<CustomerDetailPanelDto> {
  return adminApi.callCenterCustomerDetail(customerId);
}

export async function saveCallCenterCustomerNote(customerId: string, input: CallCenterSaveCustomerNoteInput): Promise<CustomerDetailPanelDto> {
  return adminApi.callCenterSaveCustomerNote(customerId, input);
}

export async function transferCallCenterTask(id: string, input: CallCenterTransferTaskInput) {
  return adminApi.callCenterTransferTask(id, input);
}

export async function createCallCenterCustomerTask(customerId: string, input: CallCenterCreateCustomerTaskInput) {
  return adminApi.callCenterCreateCustomerTask(customerId, input);
}

export async function fetchTasks(surface: TaskSurface): Promise<TaskRow[]> {
  const response = await adminApi.supportRequests('?limit=100&surface=all') as { items?: unknown[] };
  const rows = Array.isArray(response.items) ? response.items.map(asRecord) : [];
  return rows.map(toTaskRow).filter((task) => task.surface === surface);
}

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const rows = await adminApi.personCalendarEvents() as unknown[];
  return Array.isArray(rows) ? rows.map((row) => normalizeCalendarEvent(asRecord(row))) : [];
}

export async function fetchCalendarEventById(id: string): Promise<CalendarEvent | null> {
  return (await fetchCalendarEvents()).find((event) => event.id === id) ?? null;
}

export async function fetchPersonnelPresence(): Promise<PresenceRow[]> {
  const rows = await adminApi.personTeammates() as unknown[];
  return Array.isArray(rows) ? rows.map((row) => {
    const item = asRecord(row);
    return {
      id: stringValue(item.id),
      name: stringValue(item.name),
      email: stringValue(item.email),
      role: stringValue(item.role || 'Member'),
      status: presenceStatus(item.status),
      lastSeen: stringValue(item.lastSeen || 'not logged in'),
      unread: numberValue(item.unread),
      lastMessagePreview: stringValue(item.preview || item.lastMessagePreview || 'No internal messages yet.'),
      lastMessageAt: stringValue(item.lastAt || item.lastMessageAt || ''),
    };
  }) : [];
}

export async function fetchThread(threadId: string): Promise<ThreadMessage[]> {
  const rows = await adminApi.personThread(threadId) as unknown[];
  return Array.isArray(rows) ? rows.map((row) => {
    const item = asRecord(row);
    return {
      id: stringValue(item.id),
      threadId: stringValue(item.threadId || threadId),
      fromMe: Boolean(item.fromMe),
      author: stringValue(item.author || (item.fromMe ? 'You' : 'Teammate')),
      text: stringValue(item.text),
      at: stringValue(item.at),
    };
  }) : [];
}

export async function sendMessage(input: { threadId: string; text: string }): Promise<ThreadMessage> {
  const item = asRecord(await adminApi.sendPersonMessage(input));
  return {
    id: stringValue(item.id),
    threadId: stringValue(item.threadId || input.threadId),
    fromMe: Boolean(item.fromMe),
    author: stringValue(item.author || 'You'),
    text: stringValue(item.text || input.text),
    at: stringValue(item.at || 'Now'),
  };
}

export async function fetchServiceRequestTimeline(id: string): Promise<SrTimelineEntry[]> {
  const request = asRecord(await adminApi.supportRequest(id));
  const comments = Array.isArray(request.comments) ? request.comments.map(asRecord) : [];
  return comments.map((comment) => toTimelineEntry(comment)).sort((a, b) => a.at.localeCompare(b.at));
}

export async function replyServiceRequest(input: { srId: string; body: string }): Promise<SrTimelineEntry> {
  const comment = asRecord(await adminApi.addSupportComment(input.srId, { body: input.body, internal: false }));
  return toTimelineEntry(comment);
}

export async function previewSegment(input: { rules: SegmentRule[]; matchMode: 'all' | 'any' }) {
  const payload: PreviewSegmentInput = { matchMode: input.matchMode, conditions: input.rules.map(toSegmentCondition) };
  const preview = asRecord(await adminApi.previewSegment(payload));
  const summary = asRecord(preview.summary);
  const breakdown = asRecord(preview.breakdown);
  const matches = Array.isArray(preview.matches) ? preview.matches.map(asRecord) : [];
  return {
    matchedCompanies: numberValue(summary.matchedCustomers ?? summary.matchCount),
    shopifyCustomers: numberValue(breakdown.shopifyCustomers ?? summary.matchedShopifyCustomers ?? summary.totalShopifyCustomers),
    unlinkedShopifyCustomers: numberValue(breakdown.unlinkedShopifyCustomers ?? summary.unlinkedShopifyCustomers),
    sampleNames: matches.slice(0, 8).map((row) => stringValue(row.companyName || row.name || row.email)).filter(Boolean),
  };
}

export async function saveSegment(input: {
  name: string;
  description?: string;
  color: string;
  priority: number;
  lifecycleStage: LifecycleStage | 'any';
  matchMode: 'all' | 'any';
  rules: SegmentRule[];
}) {
  const payload: CreateSegmentInput = {
    name: input.name,
    description: input.description,
    color: input.color,
    priority: input.priority,
    priorityGlobal: input.priority,
    audienceType: 'accountscompany',
    lifecycleStage: input.lifecycleStage === 'any' ? undefined : input.lifecycleStage,
    matchMode: input.matchMode,
    conditions: input.rules.map(toSegmentCondition),
    isActive: true,
  };
  return adminApi.createSegment(payload);
}

export async function savePricingRule(input: PricingRule) {
  if (input.id.startsWith('pr-draft')) {
    return adminApi.createPricingRule(toPricingCreateInput(input));
  }
  return adminApi.updatePricingRule(input.id, toPricingUpdateInput(input));
}

export async function fetchCommissionProfiles(): Promise<CommissionProfile[]> {
  await adminApi.members();
  return [];
}

export async function saveCommissionProfile(_input: CommissionProfile): Promise<CommissionProfile> {
  throw new Error('Commission profile API is not available in the current backend.');
}

export async function deleteCommissionProfile(_id: string): Promise<void> {
  throw new Error('Commission profile API is not available in the current backend.');
}

function toTaskRow(row: Record<string, unknown>): TaskRow {
  const status = stringValue(row.status || 'open');
  const dueAtRaw = row.dueAt || asRecord(row.sla).resolutionTargetAt || null;
  const surface = taskSurface(row);
  return {
    id: stringValue(row.id),
    surface,
    title: stringValue(row.title || row.subject),
    customer: stringValue(asRecord(row.customer).companyName || asRecord(row.customer).name || asRecord(row.companyUser).email || '-'),
    assignee: stringValue(asRecord(row.assignedTo).name || 'Unassigned'),
    priority: stringValue(row.priority || 'medium'),
    dueAt: dueAtRaw ? relativeDate(String(dueAtRaw)) : 'No due date',
    status: isOverdue(status, dueAtRaw) ? 'overdue' : normalizeTaskStatus(status),
    source: stringValue(row.source || 'manual'),
  };
}

function taskSurface(row: Record<string, unknown>): TaskSurface {
  const axis = String(row.axis ?? '').toLowerCase();
  const source = String(row.source ?? '').toLowerCase();
  const title = String(row.title ?? '').toLowerCase();
  if (axis === 'sales' || ['sales', 'order', 'pricing', 'commission'].some((key) => title.includes(key))) return 'sales';
  if (source === 'email' || title.includes('email')) return 'email';
  if (source === 'workflow' && title.includes('message')) return 'messages';
  if (row.dueAt || title.includes('callback') || title.includes('schedule')) return 'calendar';
  return 'customer';
}

function normalizeCalendarEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    customer: nullableString(row.customer),
    customerEmail: nullableString(row.customerEmail),
    customerPhone: nullableString(row.customerPhone),
    dayIso: stringValue(row.dayIso || new Date().toISOString().slice(0, 10)),
    startHour: numberValue(row.startHour),
    durationMinutes: numberValue(row.durationMinutes) || 20,
    kind: stringValue(row.kind || 'task'),
    source: eventSource(row.source),
    assignee: nullableString(row.assignee),
    aiBrief: row.aiBrief && typeof row.aiBrief === 'object' ? asRecord(row.aiBrief) as CalendarEvent['aiBrief'] : undefined,
  };
}

function toTimelineEntry(row: Record<string, unknown>): SrTimelineEntry {
  return {
    id: stringValue(row.id),
    kind: row.internal ? 'note' : 'reply_staff',
    actor: stringValue(row.actorType || 'member'),
    at: row.createdAt ? relativeDate(String(row.createdAt)) : 'Now',
    body: stringValue(row.body || row.message),
  };
}

function toSegmentCondition(rule: SegmentRule): SegmentConditionInput {
  return {
    id: rule.id,
    field: rule.field,
    operator: rule.operator,
    value: conditionValue(rule),
    scopeType: 'all',
    scopeValues: [],
  };
}

function conditionValue(rule: SegmentRule) {
  const fieldType = FIELD_GROUPS.flatMap((group) => group.fields).find((field) => field.id === rule.field)?.type;
  if (fieldType === 'number') return Number(rule.value || 0);
  if (fieldType === 'boolean') return rule.value === 'true';
  if (['in', 'notIn'].includes(rule.operator)) return rule.value.split(',').map((item) => item.trim()).filter(Boolean);
  return rule.value;
}

function toPricingCreateInput(rule: PricingRule): CreatePricingRuleInput {
  return toPricingPayload(rule) as CreatePricingRuleInput;
}

function toPricingUpdateInput(rule: PricingRule): UpdatePricingRuleInput {
  return toPricingPayload(rule) as UpdatePricingRuleInput;
}

function toPricingPayload(rule: PricingRule) {
  const discountType = pricingDiscountType(rule.discountType);
  return {
    name: rule.name,
    targetType: pricingTargetType(rule.targetType),
    targetTags: rule.targetType === 'tag' && rule.targetValue ? [rule.targetValue] : [],
    targetCustomerId: rule.targetType === 'customer' ? rule.targetValue || undefined : undefined,
    targetCustomerGroup: rule.targetType === 'role' ? rule.targetValue || undefined : undefined,
    scopeType: pricingScopeType(rule.scopeType),
    scopeCollectionIds: rule.scopeType === 'collection' && rule.scopeValue ? [rule.scopeValue] : [],
    scopeProductIds: rule.scopeType === 'product' && rule.scopeValue ? [rule.scopeValue] : [],
    discountType,
    discountPercentage: discountType === 'percentage' ? rule.amount : undefined,
    discountValue: discountType === 'fixed_amount' ? rule.amount : undefined,
    qtyBreaks: discountType === 'qty_break'
      ? rule.qtyBreaks.map((entry) => ({ minQty: entry.minQty, value: entry.discountPct, type: 'percentage' as const }))
      : [],
    minCartAmount: rule.minCartUsd ?? undefined,
    discountPolicy: rule.combineWithOthers || rule.combineWithCoupons ? 'stack' : 'best',
    priority: rule.priority,
    isActive: rule.active,
    validFrom: dateInput(rule.startsAt),
    validUntil: dateInput(rule.endsAt),
    executionMode: 'draft_order',
  };
}

function pricingTargetType(value: PricingTargetType): TargetType {
  if (value === 'tag') return 'customer_tag';
  if (value === 'role') return 'customer_group';
  return value;
}

function pricingScopeType(value: PricingScopeType): ScopeType {
  if (value === 'collection') return 'collections';
  if (value === 'product') return 'products';
  return 'all';
}

function pricingDiscountType(value: PricingDiscountType): DiscountType {
  if (value === 'fixed') return 'fixed_amount';
  return value;
}

function normalizeTaskStatus(value: string) {
  if (['resolved', 'closed'].includes(value)) return 'completed';
  if (value === 'waiting_on_customer') return 'waiting';
  return value;
}

function isOverdue(status: string, dueAt: unknown) {
  if (!dueAt || ['resolved', 'closed'].includes(status)) return false;
  const date = new Date(String(dueAt));
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function presenceStatus(value: unknown): PresenceStatus {
  return ['online', 'busy', 'away', 'offline'].includes(String(value)) ? String(value) as PresenceStatus : 'offline';
}

function eventSource(value: unknown): EventSource {
  return ['manual', 'ai_transcript', 'ai_segment', 'ai_stale'].includes(String(value)) ? String(value) as EventSource : 'manual';
}

function dateInput(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : String(value ?? '');
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
