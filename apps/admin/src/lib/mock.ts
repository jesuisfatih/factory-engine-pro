import type { RoleId } from './permissions';

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

/* ─── Dashboard ─────────────────────────────────────────── */
export interface KpiSnapshot { sales24h: number; ordersToday: number; openTasks: number; aiTasksPending: number; callsAnswered: number; }
export interface RecentTask { id: string; title: string; assignee: string; priority: 'low'|'normal'|'high'|'critical'; createdAt: string; source: 'transcript'|'segment'|'manual'|'stale'; }
export interface RecentCall { id: string; customer: string; phone: string; durationSec: number; outcome: 'answered'|'missed'|'voicemail'; agent: string; at: string; }
export interface SalesPoint { date: string; revenue: number; orders: number; }

export async function fetchKpis(): Promise<KpiSnapshot> {
  await delay();
  return { sales24h: 18420, ordersToday: 41, openTasks: 156, aiTasksPending: 18, callsAnswered: 67 };
}

export async function fetchRecentTasks(): Promise<RecentTask[]> {
  await delay(150);
  return [
    { id: 't1', title: 'Send follow-up quote — Cynthia Hagan', assignee: 'Linda Anderson', priority: 'high', createdAt: '2 min ago', source: 'transcript' },
    { id: 't2', title: 'Schedule callback — Kelly Smith VIP pricing', assignee: 'Linda Anderson', priority: 'critical', createdAt: '12 min ago', source: 'transcript' },
    { id: 't3', title: 'Cart recovery — Robert Hopkins ($312)', assignee: 'Charlette Lee', priority: 'normal', createdAt: '42 min ago', source: 'segment' },
    { id: 't4', title: '90 days quiet check-in — Joseph Mcgranahan', assignee: 'Charlette Lee', priority: 'normal', createdAt: '1h ago', source: 'stale' },
    { id: 't5', title: 'Discount approval — Corry Bailey 12%', assignee: 'Sam Reyes', priority: 'high', createdAt: '4h ago', source: 'transcript' },
  ];
}

export async function fetchRecentCalls(): Promise<RecentCall[]> {
  await delay(150);
  return [
    { id: 'c1', customer: 'Cynthia Hagan', phone: '+1 859-338-1905', durationSec: 318, outcome: 'answered', agent: 'Linda Anderson', at: '14:32' },
    { id: 'c2', customer: 'Unknown', phone: '+1 800-742-5877', durationSec: 0, outcome: 'missed', agent: '—', at: '13:18' },
    { id: 'c3', customer: 'Kelly Smith', phone: '+1 800-742-5878', durationSec: 612, outcome: 'answered', agent: 'Linda Anderson', at: '11:02' },
    { id: 'c4', customer: 'Robert Hopkins', phone: '+1 910-297-4827', durationSec: 0, outcome: 'voicemail', agent: 'Charlette Lee', at: '10:48' },
    { id: 'c5', customer: 'Joseph Mcgranahan', phone: '+1 405-555-0118', durationSec: 240, outcome: 'answered', agent: 'Sam Reyes', at: '09:54' },
  ];
}

export async function fetchShopifyTrend(): Promise<SalesPoint[]> {
  await delay(180);
  const out: SalesPoint[] = [];
  const today = new Date('2026-06-26');
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, revenue: Math.round(8000 + Math.random() * 14000), orders: Math.round(18 + Math.random() * 38) });
  }
  return out;
}

/* ─── Team ──────────────────────────────────────────────── */
export interface TeamRoleRow { id: string; key: RoleId; label: string; system: boolean; members: number; permissionsCount: number; }
export interface TeamUserRow { id: string; firstName: string; lastName: string; email: string; phone: string; role: RoleId; status: 'active'|'invited'|'inactive'; lastActive: string; }

export interface PermissionLeaf { id: string; label: string; description: string; }
export interface PermissionGroupDef { id: string; label: string; permissions: PermissionLeaf[]; }

export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  {
    id: 'sellerusers', label: 'Sellerusers',
    permissions: [
      { id: 'sellerusers.view', label: 'View team', description: 'Read the team roster, presence and basic profile fields.' },
      { id: 'sellerusers.write', label: 'Invite / edit', description: 'Send invitations, update names, phone numbers, deactivate accounts.' },
      { id: 'sellerusers.assign_role', label: 'Assign roles', description: 'Change a teammate’s role and propagate the resulting permission set.' },
    ],
  },
  {
    id: 'sales', label: 'Sales',
    permissions: [
      { id: 'sales.tasks.view.self', label: 'View own tasks', description: 'See tasks assigned to the current operator.' },
      { id: 'sales.tasks.view.team', label: 'View team tasks', description: 'See tasks across the team for visibility / coverage.' },
      { id: 'sales.tasks.write', label: 'Write tasks', description: 'Create, edit and close tasks regardless of assignee.' },
      { id: 'sales.commissions.view.all', label: 'See all commissions', description: 'Audit commission ledgers across all reps and teams.' },
    ],
  },
  {
    id: 'communications', label: 'Communications',
    permissions: [
      { id: 'communications.messages.send', label: 'Send messages', description: 'Use internal chat with teammates and customers.' },
      { id: 'communications.email.send', label: 'Send email', description: 'Compose and send transactional or follow-up emails.' },
      { id: 'communications.calendar.write', label: 'Edit calendar', description: 'Schedule / reschedule events on the shared calendar.' },
    ],
  },
  {
    id: 'aircall', label: 'Aircall',
    permissions: [
      { id: 'aircall.dial', label: 'Dial out', description: 'Place outbound calls via Aircall.' },
      { id: 'aircall.recordings.read', label: 'Listen to recordings', description: 'Access transcripts and audio of past calls.' },
      { id: 'aircall.settings.write', label: 'Edit integration', description: 'Change webhooks, numbers and routing for the workspace.' },
    ],
  },
  {
    id: 'truth', label: 'Truth',
    permissions: [
      { id: 'truth.audit.read', label: 'Read audit log', description: 'Inspect immutable history of writes for compliance.' },
      { id: 'truth.export', label: 'Export data', description: 'Pull CSV / JSON exports of customer + sales data.' },
    ],
  },
  {
    id: 'general', label: 'General',
    permissions: [
      { id: 'general.dashboard.view', label: 'View dashboard', description: 'Open the overview surface and read KPIs.' },
      { id: 'general.support.write', label: 'Open tickets', description: 'File support requests against engineering.' },
    ],
  },
];

export interface RoleDetail {
  id: string;
  key: string;
  label: string;
  description: string;
  color: string;
  system: boolean;
  members: number;
  permissions: string[];
  updatedAt: string;
}

const ROLE_DETAILS: RoleDetail[] = [
  { id: 'r1', key: 'admin', label: 'Admin', description: 'Full access to everything. Reserved.', color: '#1d4ed8', system: true, members: 2, permissions: PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => p.id)), updatedAt: '01.05.2026 09:00' },
  { id: 'r2', key: 'customer_service', label: 'Customer Service', description: 'Operators who answer inbound, resolve service requests and dispatch follow-ups.', color: '#0ea5e9', system: true, members: 5, permissions: ['general.dashboard.view', 'sellerusers.view', 'sales.tasks.view.self', 'sales.tasks.view.team', 'communications.messages.send', 'communications.calendar.write', 'aircall.dial'], updatedAt: '12.06.2026 18:21' },
  { id: 'r3', key: 'sales_service', label: 'Sales Service', description: 'Reps who own outbound calls, quotes and pricing approvals.', color: '#7c3aed', system: true, members: 6, permissions: ['general.dashboard.view', 'sellerusers.view', 'sales.tasks.view.self', 'sales.tasks.write', 'communications.messages.send', 'communications.email.send', 'communications.calendar.write', 'aircall.dial'], updatedAt: '18.06.2026 11:42' },
  { id: 'r4', key: 'accounting', label: 'Accounting', description: 'Read-only finance view, commission audits, AR reconciliation.', color: '#059669', system: true, members: 1, permissions: ['general.dashboard.view', 'sales.commissions.view.all', 'truth.export'], updatedAt: '06.05.2026 14:11' },
  { id: 'r5', key: 'support_lead', label: 'Support Lead', description: 'Team lead with assign + escalate. Reads all queues.', color: '#b45309', system: false, members: 1, permissions: ['general.dashboard.view', 'sellerusers.view', 'sellerusers.assign_role', 'sales.tasks.view.team', 'sales.tasks.write', 'communications.messages.send', 'communications.calendar.write', 'aircall.recordings.read'], updatedAt: '20.06.2026 09:58' },
  { id: 'r6', key: 'viewer', label: 'Viewer', description: 'Read-only access for auditors / observers.', color: '#6b7280', system: true, members: 3, permissions: ['general.dashboard.view'], updatedAt: '01.05.2026 09:00' },
];

export async function fetchRoleDetails(): Promise<RoleDetail[]> {
  await delay(120);
  return ROLE_DETAILS.map((role) => ({ ...role, permissions: [...role.permissions] }));
}

export async function saveRole(input: RoleDetail): Promise<RoleDetail> {
  await delay(180);
  const idx = ROLE_DETAILS.findIndex((role) => role.id === input.id);
  const next: RoleDetail = { ...input, updatedAt: 'just now', permissions: [...input.permissions] };
  if (idx >= 0) ROLE_DETAILS[idx] = next;
  else ROLE_DETAILS.push(next);
  return { ...next, permissions: [...next.permissions] };
}

export async function deleteRole(id: string): Promise<void> {
  await delay(140);
  const idx = ROLE_DETAILS.findIndex((role) => role.id === id);
  if (idx >= 0) ROLE_DETAILS.splice(idx, 1);
}

export async function fetchRoles(): Promise<TeamRoleRow[]> {
  await delay(120);
  return [
    { id: 'r1', key: 'admin', label: 'Admin', system: true, members: 2, permissionsCount: 42 },
    { id: 'r2', key: 'customer_service', label: 'Customer Service', system: true, members: 5, permissionsCount: 14 },
    { id: 'r3', key: 'sales_service', label: 'Sales Service', system: true, members: 6, permissionsCount: 16 },
    { id: 'r4', key: 'accounting', label: 'Accounting', system: true, members: 1, permissionsCount: 9 },
    { id: 'r5', key: 'support_lead', label: 'Support Lead', system: false, members: 1, permissionsCount: 18 },
    { id: 'r6', key: 'viewer', label: 'Viewer', system: true, members: 3, permissionsCount: 2 },
  ];
}

/* ─── Commission profiles ─────────────────────────────── */
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

const COMMISSION_PROFILES: CommissionProfile[] = [
  {
    id: 'cp1',
    name: 'Sales Service · base',
    assignType: 'team',
    assigneeId: 'sales_service',
    active: true,
    updatedAt: '26.06.2026 09:14',
    rules: [
      { id: 'cr1', type: 'flat', target: '', ratePct: 5, period: 'monthly', priority: 1, thresholdUsd: null, capUsd: null },
      { id: 'cr2', type: 'tiered', target: 'monthly_revenue', ratePct: 1, period: 'monthly', priority: 2, thresholdUsd: 5000, capUsd: null },
      { id: 'cr3', type: 'tiered', target: 'monthly_revenue', ratePct: 2, period: 'monthly', priority: 3, thresholdUsd: 15000, capUsd: null },
    ],
  },
  {
    id: 'cp2',
    name: 'Linda · VIP segment override',
    assignType: 'rep',
    assigneeId: 'su1',
    active: true,
    updatedAt: '24.06.2026 16:42',
    rules: [
      { id: 'cr4', type: 'segment', target: 'VIP Watchlist', ratePct: 4, period: 'monthly', priority: 1, thresholdUsd: null, capUsd: 2000 },
    ],
  },
];

export async function fetchCommissionProfiles(): Promise<CommissionProfile[]> {
  await delay(140);
  return COMMISSION_PROFILES.map((profile) => ({ ...profile, rules: profile.rules.map((rule) => ({ ...rule })) }));
}

export async function saveCommissionProfile(input: CommissionProfile): Promise<CommissionProfile> {
  await delay(180);
  const idx = COMMISSION_PROFILES.findIndex((profile) => profile.id === input.id);
  const next: CommissionProfile = { ...input, updatedAt: 'just now', rules: input.rules.map((rule) => ({ ...rule })) };
  if (idx >= 0) COMMISSION_PROFILES[idx] = next;
  else COMMISSION_PROFILES.push(next);
  return { ...next, rules: next.rules.map((rule) => ({ ...rule })) };
}

export async function deleteCommissionProfile(id: string): Promise<void> {
  await delay(140);
  const idx = COMMISSION_PROFILES.findIndex((profile) => profile.id === id);
  if (idx >= 0) COMMISSION_PROFILES.splice(idx, 1);
}

/* ─── Team users ──────────────────────────────────────── */
export async function fetchUsers(): Promise<TeamUserRow[]> {
  await delay(150);
  return [
    { id: 'u1', firstName: 'Linda', lastName: 'Anderson', email: 'linda@dtfbank.com', phone: '+1 469-555-0142', role: 'customer_service', status: 'active', lastActive: '2 min ago' },
    { id: 'u2', firstName: 'Charlette', lastName: 'Lee', email: 'charlette@dtfbank.com', phone: '+1 469-555-0184', role: 'customer_service', status: 'active', lastActive: '14 min ago' },
    { id: 'u3', firstName: 'Sam', lastName: 'Reyes', email: 'sam@dtfbank.com', phone: '+1 469-555-0119', role: 'sales_service', status: 'active', lastActive: '1h ago' },
    { id: 'u4', firstName: 'Olivia', lastName: 'Park', email: 'olivia@dtfbank.com', phone: '+1 469-555-0166', role: 'sales_service', status: 'active', lastActive: 'today' },
    { id: 'u5', firstName: 'Marcus', lastName: 'Bell', email: 'marcus@dtfbank.com', phone: '+1 469-555-0177', role: 'accounting', status: 'active', lastActive: 'yesterday' },
    { id: 'u6', firstName: 'Aisha', lastName: 'Khan', email: 'aisha@dtfbank.com', phone: '+1 469-555-0103', role: 'support_lead', status: 'active', lastActive: '4h ago' },
    { id: 'u7', firstName: 'Test', lastName: 'Account', email: 'test.viewer@dtfbank.com', phone: '+1 469-555-0124', role: 'viewer', status: 'invited', lastActive: '—' },
  ];
}

/* ─── Segments ──────────────────────────────────────────── */
export type SegmentImportance = 'critical' | 'high' | 'normal' | 'low';
export type LifecycleStage = 'lead' | 'engaged' | 'active' | 'at_risk' | 'churned';
export type RuleOperator = 'in' | 'not_in' | 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'between' | 'true' | 'false';
export type FieldGroup = 'company' | 'company_user' | 'shopify' | 'behavior';

export interface SegmentRule {
  id: string;
  group: FieldGroup;
  field: string;
  operator: RuleOperator;
  value: string;
}
export interface SegmentOwnerAssignment {
  id: string;
  selleruserId: string;
  selleruserEmail: string;
  selleruserName: string;
  importance: SegmentImportance;
  priority: number;
  dailyCap: number | null;
}
export interface ShopifyCustomerSignal {
  id: string;
  name: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
  linkedCompanyId: string | null;
}
export interface SegmentDetail {
  id: string;
  name: string;
  description: string;
  active: boolean;
  color: string;
  priority: number;
  lifecycleStage: LifecycleStage | 'any';
  matchMode: 'all' | 'any';
  matchedCompanies: number;
  shopifyCustomers: number;
  unlinkedShopifyCustomers: number;
  totalRevenue: number;
  companyPool: number;
  lastEvaluatedAt: string;
  rules: SegmentRule[];
  owners: SegmentOwnerAssignment[];
  shopifySignal: ShopifyCustomerSignal[];
}

export interface SelleruserOption { id: string; email: string; name: string; }
export const SELLERUSERS: SelleruserOption[] = [
  { id: 'su1', email: 'linda@dtfbank.com', name: 'Linda Anderson' },
  { id: 'su2', email: 'charlette@dtfbank.com', name: 'Charlette Lee' },
  { id: 'su3', email: 'sam@dtfbank.com', name: 'Sam Reyes' },
  { id: 'su4', email: 'olivia@dtfbank.com', name: 'Olivia Park' },
  { id: 'su5', email: 'aisha@dtfbank.com', name: 'Aisha Khan' },
];

export interface FieldDef { id: string; label: string; type: 'string' | 'number' | 'enum' | 'multi' | 'boolean' | 'date'; options?: string[]; }
export interface FieldGroupDef { id: FieldGroup; label: string; fields: FieldDef[]; }

/** Source of truth for the rule-builder field picker (mirrors the live admin). */
export const FIELD_GROUPS: FieldGroupDef[] = [
  {
    id: 'company', label: 'Company Group', fields: [
      { id: 'company_email', label: 'Company Email', type: 'string' },
      { id: 'company_phone', label: 'Company Phone', type: 'string' },
      { id: 'tax_id', label: 'Tax ID', type: 'string' },
      { id: 'lifecycle_stage', label: 'Lifecycle Stage', type: 'enum', options: ['lead', 'engaged', 'active', 'at_risk', 'churned'] },
    ],
  },
  {
    id: 'company_user', label: 'Company User', fields: [
      { id: 'team_member_count', label: 'Team Member Count', type: 'number' },
      { id: 'user_role', label: 'User Role', type: 'enum', options: ['admin', 'buyer', 'staff', 'viewer'] },
      { id: 'user_active', label: 'User Active', type: 'boolean' },
    ],
  },
  {
    id: 'shopify', label: 'Shopify Customer', fields: [
      { id: 'shopify_tags', label: 'Shopify Tags', type: 'multi' },
      { id: 'shopify_segments', label: 'Shopify Segments', type: 'multi' },
      { id: 'marketing_consent', label: 'Marketing Consent', type: 'enum', options: ['opted_in', 'opted_out', 'unknown'] },
      { id: 'shopify_account_state', label: 'Shopify Account State', type: 'enum', options: ['enabled', 'disabled', 'invited'] },
      { id: 'language_region', label: 'Language / Region', type: 'string' },
      { id: 'order_count', label: 'Order Count', type: 'number' },
      { id: 'total_spent', label: 'Total Spent', type: 'number' },
    ],
  },
  {
    id: 'behavior', label: 'Existing Metrics/Behavior', fields: [
      { id: 'buyer_intent', label: 'Buyer Intent', type: 'enum', options: ['high', 'medium', 'low'] },
      { id: 'behavior_segment', label: 'Behavior Segment', type: 'enum', options: ['vip', 'standard', 'churn_risk'] },
      { id: 'total_revenue', label: 'Total Revenue', type: 'number' },
    ],
  },
];

export const RULE_OPERATORS: Record<FieldDef['type'], RuleOperator[]> = {
  string: ['eq', 'neq', 'contains'],
  number: ['gte', 'lte', 'eq', 'between'],
  enum: ['eq', 'neq', 'in', 'not_in'],
  multi: ['in', 'not_in'],
  boolean: ['true', 'false'],
  date: ['gte', 'lte', 'between'],
};

const SEGMENT_STORE: SegmentDetail[] = [
  {
    id: 's1',
    name: 'Over 20 Orders',
    description: 'This segment is for the customer who made purchases over 20 times for in DTF Bank. Mostly VIP customers. Action: Needs to be called regularly.',
    active: true,
    color: '#1d4ed8',
    priority: 9,
    lifecycleStage: 'any',
    matchMode: 'all',
    matchedCompanies: 0,
    shopifyCustomers: 17,
    unlinkedShopifyCustomers: 17,
    totalRevenue: 0,
    companyPool: 8,
    lastEvaluatedAt: '26.06.2026 18:31:02',
    rules: [
      { id: 'r1', group: 'shopify', field: 'shopify_segments', operator: 'in', value: 'gid://shopify/Segment/656206889236' },
    ],
    owners: [
      { id: 'o1', selleruserId: 'su1', selleruserEmail: 'linda@dtfbank.com', selleruserName: 'Linda Anderson', importance: 'normal', priority: 0, dailyCap: null },
    ],
    shopifySignal: [
      { id: 'c1', name: 'Cynthia Hagan', email: 'chag133@aol.com', ordersCount: 30, totalSpent: 5378, linkedCompanyId: null },
      { id: 'c2', name: 'Kelly Smith', email: 'sscustomdesignsu272@gmail.com', ordersCount: 87, totalSpent: 24962, linkedCompanyId: null },
      { id: 'c3', name: 'Robert Hopkins', email: 'hopkinsdesignsdelrio@gmail.com', ordersCount: 30, totalSpent: 4412, linkedCompanyId: null },
      { id: 'c4', name: 'Melanie Coger', email: 'trendmonkey.tx@gmail.com', ordersCount: 21, totalSpent: 4124, linkedCompanyId: null },
      { id: 'c5', name: 'Ashley Fairchild', email: 'afairchild2024@gmail.com', ordersCount: 33, totalSpent: 11796, linkedCompanyId: null },
      { id: 'c6', name: 'Corry Bailey', email: 'corry@future1s.com', ordersCount: 22, totalSpent: 30088, linkedCompanyId: null },
      { id: 'c7', name: 'Cleo Harris', email: 'bwsteestulsa@gmail.com', ordersCount: 36, totalSpent: 12740, linkedCompanyId: null },
      { id: 'c8', name: 'Joseph Mcgranahan', email: 'admin@epicmarks.com', ordersCount: 21, totalSpent: 25630, linkedCompanyId: null },
      { id: 'c9', name: 'Tish Harjo', email: 'okmulgee101@gmail.com', ordersCount: 31, totalSpent: 18119, linkedCompanyId: null },
      { id: 'c10', name: 'Christian Page', email: 'ccp1212@gmail.com', ordersCount: 51, totalSpent: 44889, linkedCompanyId: null },
    ],
  },
];

export async function fetchSegments(): Promise<SegmentDetail[]> {
  await delay(160);
  return SEGMENT_STORE.map((s) => ({ ...s, owners: s.owners.map((o) => ({ ...o })), rules: s.rules.map((r) => ({ ...r })), shopifySignal: s.shopifySignal.map((c) => ({ ...c })) }));
}

export interface PreviewResult { matchedCompanies: number; shopifyCustomers: number; unlinkedShopifyCustomers: number; sampleNames: string[]; }

export async function previewSegment(input: { rules: SegmentRule[]; matchMode: 'all' | 'any' }): Promise<PreviewResult> {
  await delay(420);
  const usableRules = input.rules.filter((r) => r.field && (r.value || r.operator === 'true' || r.operator === 'false'));
  if (usableRules.length === 0) {
    return { matchedCompanies: 0, shopifyCustomers: 0, unlinkedShopifyCustomers: 0, sampleNames: [] };
  }
  // Deterministic-ish mock: rule count × matchMode multiplier.
  const base = 12 + usableRules.length * 5;
  const matched = input.matchMode === 'all' ? Math.max(1, Math.floor(base * 0.4)) : Math.floor(base * 1.2);
  const unlinked = Math.floor(matched * 0.7);
  return {
    matchedCompanies: Math.max(0, matched - unlinked),
    shopifyCustomers: matched,
    unlinkedShopifyCustomers: unlinked,
    sampleNames: ['Cynthia Hagan', 'Kelly Smith', 'Robert Hopkins', 'Ashley Fairchild', 'Corry Bailey'].slice(0, Math.min(5, matched)),
  };
}

export async function saveSegment(_input: Partial<SegmentDetail> & { rules: SegmentRule[] }): Promise<{ id: string }> {
  await delay(220);
  return { id: `s${SEGMENT_STORE.length + Math.floor(Math.random() * 1000)}` };
}

export async function assignOwnership(input: { segmentId: string; selleruserId: string; importance: SegmentImportance; priority: number; dailyCap: number | null }): Promise<{ ownerId: string }> {
  await delay(180);
  const su = SELLERUSERS.find((u) => u.id === input.selleruserId);
  if (!su) throw new Error('Selleruser not found');
  return { ownerId: `o${Math.floor(Math.random() * 10000)}` };
}

/* ─── AI Hub ───────────────────────────────────────────── */
export type AiServiceId = 'analytics' | 'partners' | 'aircall' | 'sales' | 'email_template';
export type AiServiceRisk = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiServiceMeta {
  id: AiServiceId;
  label: string;
  subtitle: string;
  color: string;
  risk: AiServiceRisk;
}

export const AI_SERVICES: AiServiceMeta[] = [
  { id: 'analytics', label: 'Analytics', subtitle: 'Daily executive insights, segment + customer + financial reports', color: '#1d4ed8', risk: 'MEDIUM' },
  { id: 'partners', label: 'Partners', subtitle: 'Partner email parse + shipping label vision extraction', color: '#ea580c', risk: 'MEDIUM' },
  { id: 'aircall', label: 'Aircall', subtitle: 'Call transcript summary + psychoanalysis', color: '#7c3aed', risk: 'HIGH' },
  { id: 'sales', label: 'Sales', subtitle: 'Per-call intelligence, company brief, daily digest', color: '#059669', risk: 'HIGH' },
  { id: 'email_template', label: 'Email Template AI', subtitle: 'AI-assisted email template editing', color: '#db2777', risk: 'LOW' },
];

export interface AiServiceStats { id: AiServiceId; calls: number; cost: number; avgMs: number; errorPct: number; tokensIn: number; tokensOut: number; }
export async function fetchAiServiceStats(): Promise<AiServiceStats[]> {
  await delay(140);
  return [
    { id: 'analytics', calls: 2, cost: 0.04, avgMs: 35777, errorPct: 0, tokensIn: 7568, tokensOut: 5606 },
    { id: 'partners', calls: 0, cost: 0, avgMs: 0, errorPct: 0, tokensIn: 0, tokensOut: 0 },
    { id: 'aircall', calls: 6, cost: 0.01, avgMs: 1894, errorPct: 0, tokensIn: 4091, tokensOut: 874 },
    { id: 'sales', calls: 23, cost: 0.08, avgMs: 4684, errorPct: 0, tokensIn: 19102, tokensOut: 5941 },
    { id: 'email_template', calls: 0, cost: 0, avgMs: 0, errorPct: 0, tokensIn: 0, tokensOut: 0 },
  ];
}

export interface AiCallRow { id: string; timestamp: string; service: AiServiceId; model: string; promptKey: string; tokensIn: number; tokensOut: number; cacheHits: number | null; costMillicents: number; latencyMs: number; status: 'success' | 'fail'; }
export async function fetchAiCalls(): Promise<AiCallRow[]> {
  await delay(180);
  const rows: AiCallRow[] = [];
  const baseTime = new Date('2026-06-15T21:54:21').getTime();
  const services: Array<{ s: AiServiceId; key: string; model: string }> = [
    { s: 'aircall', key: 'aircall.transcript-summary v1', model: 'haiku-4-5-20251001' },
    { s: 'aircall', key: 'aircall.transcript-summary v1', model: 'haiku-4-5-20251001' },
    { s: 'aircall', key: 'aircall.transcript-summary v1', model: 'haiku-4-5-20251001' },
    { s: 'aircall', key: 'aircall.transcript-summary v1', model: 'haiku-4-5-20251001' },
    { s: 'aircall', key: 'aircall.transcript-summary v1', model: 'sonnet-4-6' },
    { s: 'aircall', key: 'aircall.transcript-summary v1', model: 'haiku-4-5-20251001' },
    { s: 'sales', key: 'sales.call-intelligence v1', model: 'haiku-4-5-20251001' },
    { s: 'sales', key: 'sales.daily-digest v1', model: 'sonnet-4-6' },
    { s: 'analytics', key: 'analytics.combined v1', model: 'haiku-4-5-20251001' },
    { s: 'sales', key: 'sales.task-brief v1', model: 'haiku-4-5-20251001' },
  ];
  for (let i = 0; i < 24; i += 1) {
    const ref = services[i % services.length];
    rows.push({
      id: `c${i + 1}`,
      timestamp: new Date(baseTime - i * 28 * 60 * 1000).toLocaleString('en-US'),
      service: ref.s,
      model: ref.model,
      promptKey: ref.key,
      tokensIn: 0,
      tokensOut: 0,
      cacheHits: null,
      costMillicents: 0,
      latencyMs: 196 + Math.floor(Math.random() * 90),
      status: i % 7 === 0 ? 'fail' : 'fail',
    });
  }
  return rows;
}

export interface AiPromptRow { id: string; service: AiServiceId | 'other' | 'partners' | 'email_template'; key: string; activeVersion: string; model: string; charCount: number; tokenEstimate: number; calls7d: number; successPct: number | null; avgInOut: string | null; lastUsedAt: string | null; }
export async function fetchAiPrompts(): Promise<AiPromptRow[]> {
  await delay(160);
  return [
    { id: 'p1', service: 'aircall', key: 'aircall.psychoanalysis', activeVersion: 'v1', model: 'sonnet-4-6', charCount: 2589, tokenEstimate: 648, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
    { id: 'p2', service: 'aircall', key: 'aircall.transcript-summary', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 440, tokenEstimate: 110, calls7d: 81, successPct: 100, avgInOut: '564/142', lastUsedAt: '6/26/2026, 12:26:02 AM' },
    { id: 'p3', service: 'analytics', key: 'analytics.combined', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 1075, tokenEstimate: 269, calls7d: 12, successPct: 100, avgInOut: '3785/3306', lastUsedAt: '6/26/2026, 11:00:43 AM' },
    { id: 'p4', service: 'other', key: 'customer-context.recent-outline', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 416, tokenEstimate: 104, calls7d: 1, successPct: 100, avgInOut: '216/33', lastUsedAt: '6/26/2026, 6:35:42 PM' },
    { id: 'p5', service: 'email_template', key: 'email-template.ai-edit', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 681, tokenEstimate: 171, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
    { id: 'p6', service: 'partners', key: 'partners.email-extraction', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 3202, tokenEstimate: 801, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
    { id: 'p7', service: 'partners', key: 'partners.vision-extraction', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 3202, tokenEstimate: 801, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
    { id: 'p8', service: 'sales', key: 'sales.call-intelligence', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 345, tokenEstimate: 87, calls7d: 79, successPct: 100, avgInOut: '1658/485', lastUsedAt: '6/26/2026, 12:26:08 AM' },
    { id: 'p9', service: 'sales', key: 'sales.communication-insight', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 191, tokenEstimate: 48, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
    { id: 'p10', service: 'sales', key: 'sales.company-brief', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 185, tokenEstimate: 47, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
    { id: 'p11', service: 'sales', key: 'sales.daily-digest', activeVersion: 'v1', model: 'sonnet-4-6', charCount: 145, tokenEstimate: 37, calls7d: 18, successPct: 100, avgInOut: '905/463', lastUsedAt: '6/26/2026, 11:00:16 AM' },
    { id: 'p12', service: 'sales', key: 'sales.task-brief', activeVersion: 'v1', model: 'haiku-4-5-20251001', charCount: 1063, tokenEstimate: 266, calls7d: 9, successPct: 100, avgInOut: '336/85', lastUsedAt: '6/26/2026, 6:35:43 PM' },
    { id: 'p13', service: 'sales', key: 'sales.task-proposal-agent', activeVersion: 'v1', model: 'sonnet-4-6', charCount: 719, tokenEstimate: 180, calls7d: 0, successPct: null, avgInOut: null, lastUsedAt: null },
  ];
}

export interface AiBudgetSnapshot { spend: number; cap: number; remaining: number; resetAt: string; alertThresholdPct: number; pct: number; callCount: number; tokensIn: number; tokensOut: number; testSendSpent: number; testSendCap: number; stopAtCap: boolean; testSendSubLimitPct: number; }
export async function fetchAiBudget(): Promise<AiBudgetSnapshot> {
  await delay(120);
  return { spend: 2.74, cap: 50, remaining: 47.26, resetAt: '6/1/2026', alertThresholdPct: 80, pct: 5, callCount: 685, tokensIn: 762189, tokensOut: 310358, testSendSpent: 0, testSendCap: 2.5, stopAtCap: false, testSendSubLimitPct: 5 };
}

export interface ServiceToggleState {
  id: AiServiceId;
  enabled: boolean;
  modelOverride: 'default' | string;
  config: Record<string, boolean | number>;
  impactDescriptions: string[];
}

/* ─── Aircall ───────────────────────────────────────────── */
export interface AircallWebhookStatus {
  name: string;
  url: string;
  active: boolean;
  lastEventAt: string;
  lastPingAt: string;
  failureCount: number;
  eventsSubscribed: number;
  lastFailureReason: string | null;
  lastFailureAt: string | null;
}
export async function fetchAircallWebhookStatus(): Promise<AircallWebhookStatus> {
  await delay(140);
  return {
    name: 'factoryengine-dtf-bank',
    url: 'https://api.dtfbank.com/api/v1/webhooks/aircall/dtf-bank',
    active: true,
    lastEventAt: '26.06.2026 20:55:29',
    lastPingAt: '10.06.2026 20:15:52',
    failureCount: 5,
    eventsSubscribed: 28,
    lastFailureReason: 'auto_reenabled_after_aircall_disable',
    lastFailureAt: '09.06.2026 22:35:03',
  };
}

export interface AircallUserRow { id: string; firstName: string; email: string; extension: string; status: 'Available' | 'Offline' | 'Busy'; linkedMember: string | null; linkedMemberName: string | null; }
export async function fetchAircallUsers(): Promise<AircallUserRow[]> {
  await delay(140);
  return [
    { id: 'au1', firstName: 'C', email: 'charlette@dtfbank.com', extension: '004', status: 'Available', linkedMember: 'su2', linkedMemberName: 'Charlette Boatman' },
    { id: 'au2', firstName: 'D', email: 'dtfbanktx@gmail.com', extension: '003', status: 'Available', linkedMember: 'su1', linkedMemberName: 'Linda Anderson' },
    { id: 'au3', firstName: 'I', email: 'ibaysal@dtfbank.com', extension: '001', status: 'Available', linkedMember: 'unknown', linkedMemberName: 'ibaysal@dtfbank.com' },
    { id: 'au4', firstName: 'I', email: 'ihsan@dtfbank.com', extension: '002', status: 'Available', linkedMember: null, linkedMemberName: null },
  ];
}

export interface AircallNumberRow { id: string; name: string; digits: string; country: string; type: 'Direct' | 'IVR'; tenantSlug: string; lastSyncedAt: string; }
export async function fetchAircallNumbers(): Promise<AircallNumberRow[]> {
  await delay(140);
  return [
    { id: 'an1', name: 'DTF BANK', digits: '+1 346-479-9224', country: 'US', type: 'Direct', tenantSlug: 'dtf-bank', lastSyncedAt: '10.06.2026 20:15:53' },
    { id: 'an2', name: 'DTF BANK Printers and Equipments', digits: '+1 832-899-4008', country: 'US', type: 'Direct', tenantSlug: 'dtf-bank', lastSyncedAt: '10.06.2026 20:15:53' },
  ];
}

export interface AircallSyncSnapshot {
  inbox24h: { total: number; received: number; verified: number; processed: number; rejected: number; duplicate: number; rejectionReasons: string[]; p50ProcessingMs: number; p95ProcessingMs: number };
  queue: { name: string; waiting: number; active: number; delayed: number };
}
/* ─── Messages ─────────────────────────────────────────── */
export type PresenceStatus = 'online' | 'busy' | 'away' | 'offline';
export interface PersonnelPresence {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'customer_service' | 'sales_service' | 'accounting' | 'support_lead' | 'viewer';
  status: PresenceStatus;
  lastSeen: string;
  unread: number;
  lastMessagePreview: string;
  lastMessageAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  fromMe: boolean;
  authorName: string;
  text: string;
  at: string;
  ts: number;
}

const NOW = Date.now();
const minutes = (ago: number) => NOW - ago * 60_000;

const PEOPLE: PersonnelPresence[] = [
  { id: 'su1', name: 'Linda Anderson', email: 'linda@dtfbank.com', role: 'customer_service', status: 'online', lastSeen: '2 min ago', unread: 2, lastMessagePreview: 'Can you take Cynthia\'s callback?', lastMessageAt: 'now' },
  { id: 'su2', name: 'Charlette Lee', email: 'charlette@dtfbank.com', role: 'customer_service', status: 'busy', lastSeen: 'on call', unread: 0, lastMessagePreview: 'On the line with Robert Hopkins.', lastMessageAt: '8m' },
  { id: 'su3', name: 'Sam Reyes', email: 'sam@dtfbank.com', role: 'sales_service', status: 'online', lastSeen: 'just now', unread: 5, lastMessagePreview: 'Sent the Kelly Smith VIP proposal — review when you get a sec.', lastMessageAt: '14m' },
  { id: 'su4', name: 'Olivia Park', email: 'olivia@dtfbank.com', role: 'sales_service', status: 'online', lastSeen: '5 min ago', unread: 0, lastMessagePreview: 'Discount approval on Corry Bailey — needs your sign-off.', lastMessageAt: '32m' },
  { id: 'su5', name: 'Aisha Khan', email: 'aisha@dtfbank.com', role: 'support_lead', status: 'away', lastSeen: 'lunch · back in 20m', unread: 1, lastMessagePreview: 'SR #4421 (At Risk segment) — heads up.', lastMessageAt: '1h' },
  { id: 'su6', name: 'Marcus Bell', email: 'marcus@dtfbank.com', role: 'accounting', status: 'offline', lastSeen: 'yesterday', unread: 0, lastMessagePreview: 'Commission report attached.', lastMessageAt: '1d' },
];
export async function fetchPersonnelPresence(): Promise<PersonnelPresence[]> {
  await delay(140);
  return PEOPLE.map((p) => ({ ...p }));
}

const THREAD_DB: Record<string, ChatMessage[]> = {
  su1: [
    { id: 'm1', threadId: 'su1', fromMe: false, authorName: 'Linda Anderson', text: 'Quick one — can you take Cynthia Hagan\'s callback at 4pm? I\'m double-booked.', at: 'Today · 14:18', ts: minutes(45) },
    { id: 'm2', threadId: 'su1', fromMe: true, authorName: 'You', text: 'Yes, no problem. Brief?', at: 'Today · 14:19', ts: minutes(43) },
    { id: 'm3', threadId: 'su1', fromMe: false, authorName: 'Linda Anderson', text: '30 orders / $5,378 LTV. Looking for VIP pricing. Calmer tone — friendly script works.', at: 'Today · 14:19', ts: minutes(42) },
    { id: 'm4', threadId: 'su1', fromMe: true, authorName: 'You', text: 'Got it. Will send recap after.', at: 'Today · 14:20', ts: minutes(40) },
    { id: 'm5', threadId: 'su1', fromMe: false, authorName: 'Linda Anderson', text: 'Thanks. Will close my window in 5.', at: 'Today · 14:20', ts: minutes(39) },
  ],
  su3: [
    { id: 'm6', threadId: 'su3', fromMe: false, authorName: 'Sam Reyes', text: 'Sent the Kelly Smith VIP proposal — review when you get a sec.', at: 'Today · 13:55', ts: minutes(70) },
    { id: 'm7', threadId: 'su3', fromMe: false, authorName: 'Sam Reyes', text: 'Tier 1 = 8% off / Tier 2 = 12% off. Need price approval for Tier 2.', at: 'Today · 13:56', ts: minutes(69) },
    { id: 'm8', threadId: 'su3', fromMe: false, authorName: 'Sam Reyes', text: 'She mentioned a competing quote from another supplier.', at: 'Today · 13:58', ts: minutes(67) },
    { id: 'm9', threadId: 'su3', fromMe: false, authorName: 'Sam Reyes', text: 'Aiming to close by Friday.', at: 'Today · 14:00', ts: minutes(65) },
    { id: 'm10', threadId: 'su3', fromMe: false, authorName: 'Sam Reyes', text: 'Ping back when you can — even a thumbs up to push.', at: 'Today · 14:05', ts: minutes(60) },
  ],
  su5: [
    { id: 'm11', threadId: 'su5', fromMe: false, authorName: 'Aisha Khan', text: 'SR #4421 (Joseph Mcgranahan) — At Risk segment. 90+ days quiet. He pushed back on shipping fees on the call.', at: 'Today · 13:10', ts: minutes(110) },
  ],
};
export async function fetchThread(threadId: string): Promise<ChatMessage[]> {
  await delay(140);
  return (THREAD_DB[threadId] ?? []).map((m) => ({ ...m }));
}
export async function sendMessage(input: { threadId: string; text: string }): Promise<ChatMessage> {
  await delay(140);
  const msg: ChatMessage = {
    id: `m${Date.now()}`,
    threadId: input.threadId,
    fromMe: true,
    authorName: 'You',
    text: input.text.trim(),
    at: 'Now',
    ts: Date.now(),
  };
  if (!THREAD_DB[input.threadId]) THREAD_DB[input.threadId] = [];
  THREAD_DB[input.threadId].push(msg);
  return msg;
}

/* ─── Support / Service Requests ──────────────────────── */
export type SrStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type SrPriority = 'low' | 'medium' | 'high' | 'critical';
export type SrSurface = 'internal' | 'customer_facing';

export interface ServiceRequestRow {
  id: string;
  number: string;
  title: string;
  customer: string;
  status: SrStatus;
  priority: SrPriority;
  assignee: string | null;
  surface: SrSurface;
  category: string;
  createdAt: string;
  slaBreachAt: string | null;
  lastMessageAt: string;
  unread: number;
}

const SR_ROWS: ServiceRequestRow[] = [
  { id: 'sr1', number: 'SR-4421', title: 'Damaged shipment — 12pcs', customer: 'Cynthia Hagan', status: 'in_progress', priority: 'high', assignee: 'Linda Anderson', surface: 'internal', category: 'damaged_shipment', createdAt: 'Today · 09:14', slaBreachAt: 'Today · 17:14', lastMessageAt: '12m ago', unread: 1 },
  { id: 'sr2', number: 'SR-4422', title: 'Refund request — order #18742', customer: 'Robert Hopkins', status: 'open', priority: 'medium', assignee: 'Charlette Lee', surface: 'customer_facing', category: 'refund', createdAt: 'Today · 10:02', slaBreachAt: 'Today · 22:02', lastMessageAt: '38m ago', unread: 0 },
  { id: 'sr3', number: 'SR-4423', title: 'Address change before ship', customer: 'Ashley Fairchild', status: 'waiting_customer', priority: 'low', assignee: 'Charlette Lee', surface: 'customer_facing', category: 'address_change', createdAt: 'Today · 11:24', slaBreachAt: null, lastMessageAt: '1h ago', unread: 0 },
  { id: 'sr4', number: 'SR-4424', title: 'Discount approval — 12% volume', customer: 'Corry Bailey', status: 'in_progress', priority: 'high', assignee: 'Olivia Park', surface: 'internal', category: 'discount_approval', createdAt: 'Today · 11:48', slaBreachAt: 'Today · 19:48', lastMessageAt: '2h ago', unread: 2 },
  { id: 'sr5', number: 'SR-4425', title: 'Late delivery follow-up', customer: 'Joseph Mcgranahan', status: 'open', priority: 'critical', assignee: null, surface: 'customer_facing', category: 'late_delivery', createdAt: 'Today · 12:09', slaBreachAt: 'Today · 16:09', lastMessageAt: '4h ago', unread: 0 },
  { id: 'sr6', number: 'SR-4426', title: 'Print quality complaint (artwork mismatch)', customer: 'Kelly Smith', status: 'resolved', priority: 'medium', assignee: 'Linda Anderson', surface: 'customer_facing', category: 'quality_complaint', createdAt: 'Yesterday', slaBreachAt: null, lastMessageAt: 'Yesterday', unread: 0 },
  { id: 'sr7', number: 'SR-4427', title: 'Internal: payment delay escalation', customer: 'Evon watson', status: 'in_progress', priority: 'critical', assignee: 'Aisha Khan', surface: 'internal', category: 'payment_escalation', createdAt: 'Yesterday', slaBreachAt: 'Today · 20:00', lastMessageAt: '6h ago', unread: 1 },
  { id: 'sr8', number: 'SR-4428', title: 'Lost tracking — missed pickup', customer: 'Christian Page', status: 'closed', priority: 'low', assignee: 'Charlette Lee', surface: 'customer_facing', category: 'lost_tracking', createdAt: '2 days ago', slaBreachAt: null, lastMessageAt: '2 days ago', unread: 0 },
];

export interface SrTimelineEntry { id: string; kind: 'reply_customer' | 'reply_staff' | 'status_changed' | 'assigned' | 'note' | 'sla_warning'; at: string; actor: string; body: string; }
const SR_TIMELINE: Record<string, SrTimelineEntry[]> = {
  sr1: [
    { id: 't1', kind: 'reply_customer', at: 'Today · 09:14', actor: 'Cynthia Hagan', body: 'Received 12 shirts and 4 of them are crushed in transit. Photos attached.' },
    { id: 't2', kind: 'assigned', at: 'Today · 09:18', actor: 'System', body: 'Assigned to Linda Anderson (Customer Service) via segment routing.' },
    { id: 't3', kind: 'reply_staff', at: 'Today · 09:22', actor: 'Linda Anderson', body: 'I am sorry to hear that. We will send replacements out today and refund shipping. Could you confirm the address is unchanged?' },
    { id: 't4', kind: 'reply_customer', at: 'Today · 13:50', actor: 'Cynthia Hagan', body: 'Address is the same. Thank you for the quick response.' },
    { id: 't5', kind: 'status_changed', at: 'Today · 13:55', actor: 'Linda Anderson', body: 'Status → in_progress' },
    { id: 't6', kind: 'sla_warning', at: 'Today · 16:14', actor: 'System', body: 'SLA breach in 1 hour — close or escalate.' },
  ],
};

export async function fetchServiceRequests(): Promise<ServiceRequestRow[]> {
  await delay(140);
  return SR_ROWS.map((sr) => ({ ...sr }));
}
export async function fetchServiceRequestTimeline(id: string): Promise<SrTimelineEntry[]> {
  await delay(180);
  return (SR_TIMELINE[id] ?? SR_TIMELINE.sr1).map((t) => ({ ...t }));
}
export async function replyServiceRequest(input: { srId: string; body: string }): Promise<SrTimelineEntry> {
  await delay(180);
  const entry: SrTimelineEntry = { id: `t${Date.now()}`, kind: 'reply_staff', at: 'Now', actor: 'You', body: input.body.trim() };
  if (!SR_TIMELINE[input.srId]) SR_TIMELINE[input.srId] = [];
  SR_TIMELINE[input.srId].push(entry);
  return entry;
}

/* ─── Calendar ─────────────────────────────────────────── */
export type EventSource = 'manual' | 'ai_transcript' | 'ai_segment' | 'ai_stale';
export type EventKind = 'call' | 'callback' | 'meeting' | 'reminder' | 'task';

export interface CalendarEvent {
  id: string;
  title: string;
  customer: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  dayIso: string;           // '2026-06-22'
  startHour: number;        // 0-23
  durationMinutes: number;  // 15-120
  kind: EventKind;
  source: EventSource;
  assignee: string;
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

const CAL_EVENTS: CalendarEvent[] = [
  {
    id: 'e1', title: 'Callback — Kelly Smith VIP pricing',
    customer: 'Kelly Smith', customerEmail: 'sscustomdesignsu272@gmail.com', customerPhone: '+1 800-742-5877',
    dayIso: '2026-06-23', startHour: 10, durationMinutes: 30,
    kind: 'callback', source: 'ai_transcript', assignee: 'Linda Anderson',
    aiBrief: {
      whyCalling: 'Customer asked about tiered VIP pricing twice on the 14:32 call but did not commit. She mentioned a competing supplier quote.',
      painPoints: ['Pricing transparency for >50pcs orders', 'Competitor offering 11% off, our cap is 8%', 'Wants clarity on tier thresholds'],
      callGoal: 'Confirm VIP tier 2 (12% off) verbally, then send a written proposal within 24h.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.86,
      transcriptSnippet: '… so what would you do if I committed to about 200 pieces a month? Last quote I had from another supplier was 11% off and I am trying to decide …',
      suggestedActions: ['Open quote draft (200pcs / 12% off)', 'Send VIP pricing PDF', 'Schedule 1 week follow-up'],
    },
  },
  {
    id: 'e2', title: 'Send follow-up quote — Cynthia Hagan',
    customer: 'Cynthia Hagan', customerEmail: 'chag133@aol.com', customerPhone: '+1 859-338-1905',
    dayIso: '2026-06-22', startHour: 11, durationMinutes: 15,
    kind: 'task', source: 'ai_transcript', assignee: 'Linda Anderson',
    aiBrief: {
      whyCalling: 'Mentioned a bulk DTF order for 200pcs during the 14:32 call, implied she wants a quote.',
      painPoints: ['Needs delivery within 10 days', 'Concerned about wash durability'],
      callGoal: 'Send written quote within the day, include wash test specs.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.78,
      suggestedActions: ['Draft quote PDF', 'Attach wash test data sheet'],
    },
  },
  {
    id: 'e3', title: 'Cart recovery — Robert Hopkins',
    customer: 'Robert Hopkins', customerEmail: 'hopkinsdesignsdelrio@gmail.com', customerPhone: '+1 910-297-4827',
    dayIso: '2026-06-24', startHour: 14, durationMinutes: 20,
    kind: 'call', source: 'ai_segment', assignee: 'Charlette Lee',
    aiBrief: {
      whyCalling: 'Matched "Over 20 Orders" segment with abandoned cart $312 in last 24h.',
      painPoints: ['Cart abandoned at checkout', 'No prior contact in 14 days'],
      callGoal: 'Recover the cart, offer free shipping for today only.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.65,
      suggestedActions: ['Send recovery email with FREESHIP code', 'Schedule reminder in 24h if no action'],
    },
  },
  {
    id: 'e4', title: '90 days quiet — Joseph Mcgranahan',
    customer: 'Joseph Mcgranahan', customerEmail: 'admin@epicmarks.com', customerPhone: '+1 405-555-0118',
    dayIso: '2026-06-25', startHour: 13, durationMinutes: 20,
    kind: 'reminder', source: 'ai_stale', assignee: 'Aisha Khan',
    aiBrief: {
      whyCalling: 'Last contact on Dec 11 2025. Risk of churn flagged by stale detection.',
      painPoints: ['No order activity in 90+ days', 'Previously high LTV ($25,630)'],
      callGoal: 'Re-engage. Find out if competitor took the account.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.71,
      suggestedActions: ['Phone outreach with re-engagement script', 'Offer loyalty discount'],
    },
  },
  {
    id: 'e5', title: 'Quarterly review meeting — Christian Page',
    customer: 'Christian Page', customerEmail: 'ccp1212@gmail.com', customerPhone: '+1 469-555-0175',
    dayIso: '2026-06-22', startHour: 15, durationMinutes: 60,
    kind: 'meeting', source: 'manual', assignee: 'Sam Reyes',
  },
  {
    id: 'e6', title: 'Discount approval — Corry Bailey',
    customer: 'Corry Bailey', customerEmail: 'corry@future1s.com', customerPhone: '+1 832-555-0143',
    dayIso: '2026-06-23', startHour: 16, durationMinutes: 15,
    kind: 'task', source: 'ai_transcript', assignee: 'Olivia Park',
    aiBrief: {
      whyCalling: 'Requested 12% volume discount on the call — exceeds rep cap (8%).',
      painPoints: ['Manager approval required for >8%', 'Customer wants final answer today'],
      callGoal: 'Get approval, deliver answer, lock pricing.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.92,
      suggestedActions: ['Slack #pricing for approval', 'Reply on case SR-4424 with locked rate'],
    },
  },
  {
    id: 'e7', title: 'Sample sent follow-up — Cleo Harris',
    customer: 'Cleo Harris', customerEmail: 'bwsteestulsa@gmail.com', customerPhone: '+1 918-555-0167',
    dayIso: '2026-06-24', startHour: 11, durationMinutes: 15,
    kind: 'reminder', source: 'manual', assignee: 'Linda Anderson',
  },
];
export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  await delay(150);
  return CAL_EVENTS.map((event) => ({ ...event, aiBrief: event.aiBrief ? { ...event.aiBrief, painPoints: [...event.aiBrief.painPoints], suggestedActions: [...event.aiBrief.suggestedActions] } : undefined }));
}
export async function fetchCalendarEventById(id: string): Promise<CalendarEvent | null> {
  await delay(120);
  const row = CAL_EVENTS.find((event) => event.id === id);
  return row ? { ...row, aiBrief: row.aiBrief ? { ...row.aiBrief, painPoints: [...row.aiBrief.painPoints], suggestedActions: [...row.aiBrief.suggestedActions] } : undefined } : null;
}

export async function fetchAircallSyncLogs(): Promise<AircallSyncSnapshot> {
  await delay(140);
  return {
    inbox24h: { total: 200, received: 0, verified: 134, processed: 66, rejected: 0, duplicate: 0, rejectionReasons: [], p50ProcessingMs: 72, p95ProcessingMs: 23254 },
    queue: { name: 'aircall-ingest', waiting: 478, active: 1, delayed: 194 },
  };
}

export async function fetchServiceToggles(): Promise<{ masterEnabled: boolean; services: ServiceToggleState[]; quietHours: boolean }> {
  await delay(140);
  return {
    masterEnabled: true,
    quietHours: false,
    services: [
      { id: 'analytics', enabled: true, modelOverride: 'default', config: {}, impactDescriptions: ['Daily executive insights stop', 'Customer reports stop', 'Financial reports stop'] },
      { id: 'partners', enabled: true, modelOverride: 'default', config: { textFirstAttempt: true, visionCacheTtlHours: 1 }, impactDescriptions: ['Partner email parsing stops', 'Vision extraction stops', 'Shipping label OCR stops'] },
      { id: 'aircall', enabled: true, modelOverride: 'default', config: { psychoanalysisEnabled: false }, impactDescriptions: ['Call transcript summaries stop', 'Psychoanalysis stops', 'Call intelligence stops'] },
      { id: 'sales', enabled: true, modelOverride: 'default', config: { perCallIntelligenceEnabled: true, dailyDigestEnabled: true }, impactDescriptions: ['Per-call intelligence stops', 'Company brief generation stops', 'Daily digest stops', 'Task brief stops'] },
      { id: 'email_template', enabled: true, modelOverride: 'default', config: { maxOutputTokensCap: 4000 }, impactDescriptions: ['AI-assisted email editing stops', 'Template generation stops'] },
    ],
  };
}

/* ─── Tasks ─────────────────────────────────────────────── */
export type TaskSurface = 'customer' | 'sales' | 'messages' | 'calendar' | 'email';
export interface TaskRow { id: string; surface: TaskSurface; title: string; customer: string; assignee: string; priority: 'low'|'normal'|'high'|'critical'; dueAt: string; status: 'open'|'in_progress'|'completed'|'overdue'; source: 'manual'|'ai'|'segment'|'transcript'; }

const TASKS: TaskRow[] = [
  { id: 'tk1', surface: 'customer', title: 'Resolve damaged shipment claim', customer: 'Cynthia Hagan', assignee: 'Linda Anderson', priority: 'high', dueAt: 'Today 4pm', status: 'in_progress', source: 'manual' },
  { id: 'tk2', surface: 'customer', title: 'Confirm replacement address', customer: 'Ashley Fairchild', assignee: 'Charlette Lee', priority: 'normal', dueAt: 'Tomorrow', status: 'open', source: 'transcript' },
  { id: 'tk3', surface: 'sales', title: 'Send quote — 200pcs DTF order', customer: 'Cynthia Hagan', assignee: 'Sam Reyes', priority: 'high', dueAt: 'Today', status: 'open', source: 'transcript' },
  { id: 'tk4', surface: 'sales', title: 'Reach out — VIP pricing proposal', customer: 'Kelly Smith', assignee: 'Sam Reyes', priority: 'critical', dueAt: 'Today', status: 'in_progress', source: 'ai' },
  { id: 'tk5', surface: 'sales', title: 'Discount approval needed (12%)', customer: 'Corry Bailey', assignee: 'Olivia Park', priority: 'high', dueAt: 'This week', status: 'open', source: 'transcript' },
  { id: 'tk6', surface: 'messages', title: 'Reply to Slack mention — billing dispute', customer: 'Joseph Mcgranahan', assignee: 'Aisha Khan', priority: 'normal', dueAt: 'Today', status: 'open', source: 'manual' },
  { id: 'tk7', surface: 'messages', title: 'Internal — review weekly digest', customer: '—', assignee: 'Marcus Bell', priority: 'low', dueAt: 'Friday', status: 'open', source: 'manual' },
  { id: 'tk8', surface: 'calendar', title: 'Callback — Kelly Smith VIP follow-up', customer: 'Kelly Smith', assignee: 'Linda Anderson', priority: 'high', dueAt: 'Tomorrow 10am', status: 'open', source: 'ai' },
  { id: 'tk9', surface: 'calendar', title: 'Quarterly review meeting', customer: 'Christian Page', assignee: 'Sam Reyes', priority: 'normal', dueAt: 'Mon 2pm', status: 'open', source: 'manual' },
  { id: 'tk10', surface: 'email', title: 'Respond to refund inquiry', customer: 'Robert Hopkins', assignee: 'Charlette Lee', priority: 'normal', dueAt: 'Today', status: 'open', source: 'manual' },
  { id: 'tk11', surface: 'email', title: 'Onboarding follow-up email', customer: 'Sara Connor', assignee: 'Olivia Park', priority: 'low', dueAt: 'This week', status: 'open', source: 'segment' },
  { id: 'tk12', surface: 'customer', title: 'Schedule annual training refresher', customer: 'Tish Harjo', assignee: 'Aisha Khan', priority: 'low', dueAt: 'Next week', status: 'open', source: 'segment' },
];

export async function fetchTasks(surface: TaskSurface): Promise<TaskRow[]> {
  await delay(140);
  return TASKS.filter((t) => t.surface === surface);
}

/* ─── B2B pricing rules ───────────────────────────────── */
export type PricingTargetType = 'customer' | 'segment' | 'tag' | 'role';
export type PricingScopeType = 'all' | 'collection' | 'product';
export type PricingDiscountType = 'percentage' | 'fixed' | 'qty_break';

export interface PricingQtyBreak { id: string; minQty: number; discountPct: number; }
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
  minCartUsd: number | null;
  priority: number;
  active: boolean;
  combineWithOthers: boolean;
  combineWithCoupons: boolean;
  excludeOnSale: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}

const PRICING_RULES: PricingRule[] = [
  {
    id: 'pr1', name: 'VIP segment — 12% off catalog',
    targetType: 'segment', targetValue: 'VIP Watchlist',
    scopeType: 'all', scopeValue: '',
    discountType: 'percentage', amount: 12, qtyBreaks: [],
    minCartUsd: 250, priority: 10, active: true,
    combineWithOthers: false, combineWithCoupons: false, excludeOnSale: true,
    startsAt: '2026-01-01', endsAt: null, updatedAt: '20.06.2026 09:14',
  },
  {
    id: 'pr2', name: 'Wholesale qty breaks — DTF Film',
    targetType: 'tag', targetValue: 'wholesale',
    scopeType: 'collection', scopeValue: 'dtf-film',
    discountType: 'qty_break', amount: 0,
    qtyBreaks: [
      { id: 'qb1', minQty: 50, discountPct: 5 },
      { id: 'qb2', minQty: 200, discountPct: 10 },
      { id: 'qb3', minQty: 500, discountPct: 15 },
    ],
    minCartUsd: null, priority: 5, active: true,
    combineWithOthers: true, combineWithCoupons: false, excludeOnSale: false,
    startsAt: null, endsAt: null, updatedAt: '24.06.2026 16:42',
  },
  {
    id: 'pr3', name: 'Reseller fixed-amount on Powders',
    targetType: 'role', targetValue: 'reseller',
    scopeType: 'product', scopeValue: 'tpu-powder-1kg',
    discountType: 'fixed', amount: 3.5, qtyBreaks: [],
    minCartUsd: 100, priority: 8, active: false,
    combineWithOthers: false, combineWithCoupons: true, excludeOnSale: false,
    startsAt: null, endsAt: '2026-12-31', updatedAt: '11.06.2026 11:05',
  },
];

export async function fetchPricingRules(): Promise<PricingRule[]> {
  await delay(160);
  return PRICING_RULES.map((rule) => ({ ...rule, qtyBreaks: rule.qtyBreaks.map((qb) => ({ ...qb })) }));
}

export async function savePricingRule(input: PricingRule): Promise<PricingRule> {
  await delay(180);
  const idx = PRICING_RULES.findIndex((rule) => rule.id === input.id);
  const next: PricingRule = { ...input, updatedAt: 'just now', qtyBreaks: input.qtyBreaks.map((qb) => ({ ...qb })) };
  if (idx >= 0) PRICING_RULES[idx] = next;
  else PRICING_RULES.push(next);
  return { ...next, qtyBreaks: next.qtyBreaks.map((qb) => ({ ...qb })) };
}

export async function deletePricingRule(id: string): Promise<void> {
  await delay(140);
  const idx = PRICING_RULES.findIndex((rule) => rule.id === id);
  if (idx >= 0) PRICING_RULES.splice(idx, 1);
}

/* ─── Shopify orders ──────────────────────────────────── */
export type OrderPaymentStatus = 'paid' | 'pending' | 'refunded' | 'failed';
export type OrderFulfillmentStatus = 'fulfilled' | 'partial' | 'unfulfilled' | 'cancelled';
export type OrderSurface = 'all' | 'pickup' | 'design_files' | 'partner';

export interface OrderRow {
  id: string;
  orderNumber: string;
  shopifyOrderId: string | null;
  customerName: string;
  customerEmail: string;
  companyName: string | null;
  date: string;
  total: number;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  isPickup: boolean;
  isLocalDelivery: boolean;
  designFilesCount: number;
  partnerName: string | null;
  productName: string | null;
}

const ORDER_STORE: OrderRow[] = [
  { id: 'o1001', orderNumber: '#48201', shopifyOrderId: '5520000001001', customerName: 'Cynthia Hagan', customerEmail: 'chag133@aol.com', companyName: 'Hagan Uniforms', date: '2026-06-26 14:32', total: 1824.50, paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 2, partnerName: null, productName: null },
  { id: 'o1002', orderNumber: '#48199', shopifyOrderId: '5520000001002', customerName: 'Kelly Smith', customerEmail: 'sscustomdesignsu272@gmail.com', companyName: 'SS Custom Designs', date: '2026-06-26 11:18', total: 4980.00, paymentStatus: 'paid', fulfillmentStatus: 'partial', isPickup: false, isLocalDelivery: true, designFilesCount: 12, partnerName: null, productName: null },
  { id: 'o1003', orderNumber: '#48195', shopifyOrderId: '5520000001003', customerName: 'Robert Hopkins', customerEmail: 'hopkinsdesignsdelrio@gmail.com', companyName: 'Hopkins Designs', date: '2026-06-25 17:42', total: 312.00, paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', isPickup: true, isLocalDelivery: false, designFilesCount: 0, partnerName: null, productName: null },
  { id: 'o1004', orderNumber: '#48190', shopifyOrderId: '5520000001004', customerName: 'Ashley Fairchild', customerEmail: 'afairchild2024@gmail.com', companyName: null, date: '2026-06-25 09:55', total: 612.20, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 3, partnerName: null, productName: null },
  { id: 'o1005', orderNumber: '#48186', shopifyOrderId: '5520000001005', customerName: 'Corry Bailey', customerEmail: 'corry@future1s.com', companyName: 'Future 1s', date: '2026-06-24 14:01', total: 8842.10, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 1, partnerName: null, productName: null },
  { id: 'o1006', orderNumber: '#48184', shopifyOrderId: '5520000001006', customerName: 'Cleo Harris', customerEmail: 'bwsteestulsa@gmail.com', companyName: 'BW Stees Tulsa', date: '2026-06-24 10:12', total: 274.50, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: true, isLocalDelivery: false, designFilesCount: 0, partnerName: null, productName: null },
  { id: 'o1007', orderNumber: '#48181', shopifyOrderId: '5520000001007', customerName: 'Joseph Mcgranahan', customerEmail: 'admin@epicmarks.com', companyName: 'Epic Marks', date: '2026-06-23 18:30', total: 1098.00, paymentStatus: 'refunded', fulfillmentStatus: 'cancelled', isPickup: false, isLocalDelivery: false, designFilesCount: 0, partnerName: null, productName: null },
  { id: 'o1008', orderNumber: '#48178', shopifyOrderId: '5520000001008', customerName: 'Tish Harjo', customerEmail: 'okmulgee101@gmail.com', companyName: 'Okmulgee 101', date: '2026-06-22 13:44', total: 2204.00, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 5, partnerName: null, productName: null },
  { id: 'o1009', orderNumber: '#48174', shopifyOrderId: '5520000001009', customerName: 'Christian Page', customerEmail: 'ccp1212@gmail.com', companyName: 'CCP Group', date: '2026-06-22 09:30', total: 14820.00, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 28, partnerName: null, productName: null },
  { id: 'o1010', orderNumber: '#48169', shopifyOrderId: '5520000001010', customerName: 'Rod Rinehart', customerEmail: 'rodr@gcsportswear.com', companyName: 'GC Sportswear', date: '2026-06-21 16:05', total: 3812.40, paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 7, partnerName: null, productName: null },
  { id: 'o1011', orderNumber: '#48165', shopifyOrderId: '5520000001011', customerName: 'Evon Watson', customerEmail: 'aafashionexpresspress@gmail.com', companyName: 'AA Fashion Express', date: '2026-06-20 10:14', total: 942.00, paymentStatus: 'paid', fulfillmentStatus: 'partial', isPickup: false, isLocalDelivery: false, designFilesCount: 2, partnerName: null, productName: null },
  { id: 'o1012', orderNumber: '#48162', shopifyOrderId: '5520000001012', customerName: 'Melanie Coger', customerEmail: 'trendmonkey.tx@gmail.com', companyName: 'TrendMonkey TX', date: '2026-06-19 11:24', total: 558.00, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 4, partnerName: null, productName: null },
  { id: 'o1013', orderNumber: '#48160', shopifyOrderId: null, customerName: 'Tom Holland', customerEmail: 'tholland@example.com', companyName: null, date: '2026-06-19 09:01', total: 322.50, paymentStatus: 'failed', fulfillmentStatus: 'unfulfilled', isPickup: true, isLocalDelivery: false, designFilesCount: 0, partnerName: null, productName: null },
  { id: 'o1014', orderNumber: '#48156', shopifyOrderId: '5520000001014', customerName: 'Sara Connor', customerEmail: 'sara@skynet.example', companyName: 'Skynet Athletics', date: '2026-06-18 14:42', total: 1862.00, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 6, partnerName: null, productName: null },
  { id: 'o1015', orderNumber: 'PO-2401', shopifyOrderId: null, customerName: 'B2B Express Print Partner', customerEmail: 'orders@expressprint.partner', companyName: 'Express Print Partner', date: '2026-06-26 09:00', total: 6280.00, paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', isPickup: false, isLocalDelivery: false, designFilesCount: 12, partnerName: 'Express Print', productName: 'Bulk DTF Film' },
  { id: 'o1016', orderNumber: 'PO-2400', shopifyOrderId: null, customerName: 'Crystal Stores Partner', customerEmail: 'support@crystalstores.partner', companyName: 'Crystal Stores Partner', date: '2026-06-24 12:00', total: 9410.00, paymentStatus: 'paid', fulfillmentStatus: 'partial', isPickup: false, isLocalDelivery: false, designFilesCount: 18, partnerName: 'Crystal Stores', productName: 'TPU Powder + Film Combo' },
];

export interface OrderKpiSnapshot { count: number; revenue: number; paid: number; pending: number; fulfilled: number; }

export async function fetchOrders(surface: OrderSurface): Promise<OrderRow[]> {
  await delay(180);
  let rows = ORDER_STORE.slice();
  if (surface === 'pickup') rows = rows.filter((order) => order.isPickup);
  else if (surface === 'design_files') rows = rows.filter((order) => order.designFilesCount > 0);
  else if (surface === 'partner') rows = rows.filter((order) => order.partnerName !== null);
  return rows.map((order) => ({ ...order }));
}

export async function fetchOrderKpis(surface: OrderSurface): Promise<OrderKpiSnapshot> {
  await delay(120);
  const rows = await fetchOrders(surface);
  return {
    count: rows.length,
    revenue: rows.reduce((sum, row) => sum + row.total, 0),
    paid: rows.filter((row) => row.paymentStatus === 'paid').length,
    pending: rows.filter((row) => row.paymentStatus === 'pending').length,
    fulfilled: rows.filter((row) => row.fulfillmentStatus === 'fulfilled').length,
  };
}

/* ─── Shopify customers (sales-rep view) ──────────────── */
export type CustomerLifecycle = 'lead' | 'engaged' | 'active' | 'at_risk' | 'churned';
export type CustomerStatus = 'active' | 'archived';
export type CustomerLastContactWindow = 'any' | '7d' | '30d' | '90d' | 'never';

export interface ShopifyCustomerSegmentChip { id: string; name: string; color: string; }
export interface ShopifyCustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  lifecycle: CustomerLifecycle;
  segments: ShopifyCustomerSegmentChip[];
  assignedToName: string | null;
  assignedAt: string | null;
  lastContactAt: string | null;
  openServiceRequests: number;
  openQuotes: number;
  openAiTasks: number;
  ordersCount: number;
  totalSpent: number;
  pipelineValue: number | null;
  commissionAmount: number | null;
  markupPercent: number | null;
}

const SEGMENT_CHIPS: Record<string, ShopifyCustomerSegmentChip> = {
  vip: { id: 's-vip', name: 'VIP Watchlist', color: '#7c3aed' },
  over20: { id: 's-over20', name: 'Over 20 Orders', color: '#1d4ed8' },
  high: { id: 's-high', name: 'High Value', color: '#047857' },
  risk: { id: 's-risk', name: 'At Risk', color: '#b91c1c' },
  wholesale: { id: 's-wholesale', name: 'Wholesale', color: '#0ea5e9' },
};

const SHOPIFY_CUSTOMERS: ShopifyCustomerRow[] = [
  { id: 'sc1', name: 'Cynthia Hagan', email: 'chag133@aol.com', phone: '+1 859-338-1905', status: 'active', lifecycle: 'lead', segments: [SEGMENT_CHIPS.over20], assignedToName: 'Linda Anderson', assignedAt: '2026-06-18', lastContactAt: '2026-06-18', openServiceRequests: 1, openQuotes: 1, openAiTasks: 1, ordersCount: 30, totalSpent: 5378, pipelineValue: 4200, commissionAmount: 210, markupPercent: 22 },
  { id: 'sc2', name: 'Kelly Smith', email: 'sscustomdesignsu272@gmail.com', phone: '+1 800-742-5877', status: 'active', lifecycle: 'active', segments: [SEGMENT_CHIPS.vip, SEGMENT_CHIPS.high], assignedToName: 'Sam Reyes', assignedAt: '2026-05-02', lastContactAt: '2026-06-25', openServiceRequests: 0, openQuotes: 2, openAiTasks: 1, ordersCount: 87, totalSpent: 24962, pipelineValue: 14800, commissionAmount: 1182, markupPercent: 18 },
  { id: 'sc3', name: 'Robert Hopkins', email: 'hopkinsdesignsdelrio@gmail.com', phone: '+1 910-297-4827', status: 'active', lifecycle: 'engaged', segments: [SEGMENT_CHIPS.over20], assignedToName: 'Linda Anderson', assignedAt: '2026-04-12', lastContactAt: '2026-06-03', openServiceRequests: 0, openQuotes: 1, openAiTasks: 1, ordersCount: 30, totalSpent: 4412, pipelineValue: 980, commissionAmount: 49, markupPercent: 20 },
  { id: 'sc4', name: 'Melanie Coger', email: 'trendmonkey.tx@gmail.com', phone: '+1 512-555-0184', status: 'active', lifecycle: 'engaged', segments: [SEGMENT_CHIPS.over20], assignedToName: 'Charlette Lee', assignedAt: '2026-05-14', lastContactAt: '2026-06-25', openServiceRequests: 0, openQuotes: 0, openAiTasks: 0, ordersCount: 21, totalSpent: 4124, pipelineValue: 2200, commissionAmount: 132, markupPercent: 24 },
  { id: 'sc5', name: 'Ashley Fairchild', email: 'afairchild2024@gmail.com', phone: '+1 214-555-0192', status: 'active', lifecycle: 'engaged', segments: [SEGMENT_CHIPS.over20], assignedToName: 'Charlette Lee', assignedAt: '2026-03-21', lastContactAt: '2026-04-25', openServiceRequests: 2, openQuotes: 1, openAiTasks: 0, ordersCount: 33, totalSpent: 11796, pipelineValue: 3400, commissionAmount: 188, markupPercent: 19 },
  { id: 'sc6', name: 'Corry Bailey', email: 'corry@future1s.com', phone: '+1 832-555-0143', status: 'active', lifecycle: 'active', segments: [SEGMENT_CHIPS.high], assignedToName: 'Olivia Park', assignedAt: '2026-04-02', lastContactAt: '2026-06-22', openServiceRequests: 1, openQuotes: 3, openAiTasks: 1, ordersCount: 22, totalSpent: 30088, pipelineValue: 22000, commissionAmount: 1804, markupPercent: 16 },
  { id: 'sc7', name: 'Cleo Harris', email: 'bwsteestulsa@gmail.com', phone: '+1 918-555-0167', status: 'active', lifecycle: 'active', segments: [SEGMENT_CHIPS.over20], assignedToName: 'Linda Anderson', assignedAt: '2026-05-11', lastContactAt: '2026-06-24', openServiceRequests: 0, openQuotes: 0, openAiTasks: 0, ordersCount: 36, totalSpent: 12740, pipelineValue: 1850, commissionAmount: 92, markupPercent: 22 },
  { id: 'sc8', name: 'Joseph Mcgranahan', email: 'admin@epicmarks.com', phone: '+1 405-555-0118', status: 'active', lifecycle: 'at_risk', segments: [SEGMENT_CHIPS.high, SEGMENT_CHIPS.risk], assignedToName: 'Sam Reyes', assignedAt: '2025-09-09', lastContactAt: '2025-12-11', openServiceRequests: 1, openQuotes: 0, openAiTasks: 1, ordersCount: 21, totalSpent: 25630, pipelineValue: 0, commissionAmount: null, markupPercent: 18 },
  { id: 'sc9', name: 'Tish Harjo', email: 'okmulgee101@gmail.com', phone: '+1 918-555-0139', status: 'active', lifecycle: 'engaged', segments: [SEGMENT_CHIPS.high], assignedToName: 'Aisha Khan', assignedAt: '2026-02-22', lastContactAt: '2026-06-08', openServiceRequests: 0, openQuotes: 1, openAiTasks: 0, ordersCount: 31, totalSpent: 18119, pipelineValue: 5200, commissionAmount: 312, markupPercent: 20 },
  { id: 'sc10', name: 'Christian Page', email: 'ccp1212@gmail.com', phone: '+1 469-555-0175', status: 'active', lifecycle: 'active', segments: [SEGMENT_CHIPS.vip], assignedToName: 'Sam Reyes', assignedAt: '2025-08-30', lastContactAt: '2026-06-26', openServiceRequests: 0, openQuotes: 2, openAiTasks: 0, ordersCount: 51, totalSpent: 44889, pipelineValue: 18900, commissionAmount: 1512, markupPercent: 17 },
  { id: 'sc11', name: 'Rod Rinehart', email: 'rodr@gcsportswear.com', phone: '+1 314-555-0163', status: 'active', lifecycle: 'at_risk', segments: [SEGMENT_CHIPS.risk, SEGMENT_CHIPS.wholesale], assignedToName: 'Olivia Park', assignedAt: '2025-10-12', lastContactAt: '2025-11-26', openServiceRequests: 1, openQuotes: 0, openAiTasks: 1, ordersCount: 44, totalSpent: 27325, pipelineValue: 0, commissionAmount: null, markupPercent: 19 },
  { id: 'sc12', name: 'Evon Watson', email: 'aafashionexpresspress@gmail.com', phone: '+1 832-555-0102', status: 'active', lifecycle: 'at_risk', segments: [SEGMENT_CHIPS.risk], assignedToName: 'Aisha Khan', assignedAt: '2025-12-04', lastContactAt: '2026-05-12', openServiceRequests: 0, openQuotes: 0, openAiTasks: 1, ordersCount: 50, totalSpent: 13217, pipelineValue: 0, commissionAmount: null, markupPercent: 22 },
  { id: 'sc13', name: 'Tom Holland', email: 'tholland@example.com', phone: '+1 512-555-0123', status: 'active', lifecycle: 'lead', segments: [SEGMENT_CHIPS.over20], assignedToName: null, assignedAt: null, lastContactAt: '2026-04-08', openServiceRequests: 0, openQuotes: 0, openAiTasks: 0, ordersCount: 26, totalSpent: 6541, pipelineValue: null, commissionAmount: null, markupPercent: null },
  { id: 'sc14', name: 'Sara Connor', email: 'sara@skynet.example', phone: '+1 408-555-0134', status: 'active', lifecycle: 'engaged', segments: [SEGMENT_CHIPS.over20, SEGMENT_CHIPS.wholesale], assignedToName: 'Linda Anderson', assignedAt: '2026-01-08', lastContactAt: '2026-06-12', openServiceRequests: 0, openQuotes: 1, openAiTasks: 0, ordersCount: 23, totalSpent: 7820, pipelineValue: 1200, commissionAmount: 60, markupPercent: 22 },
  { id: 'sc15', name: 'Brian Castaneda', email: 'castaneda@brimfield.example', phone: '+1 415-555-0166', status: 'archived', lifecycle: 'churned', segments: [SEGMENT_CHIPS.risk], assignedToName: null, assignedAt: null, lastContactAt: '2025-03-12', openServiceRequests: 0, openQuotes: 0, openAiTasks: 0, ordersCount: 12, totalSpent: 4280, pipelineValue: 0, commissionAmount: null, markupPercent: null },
];

export async function fetchShopifyCustomers(): Promise<ShopifyCustomerRow[]> {
  await delay(180);
  return SHOPIFY_CUSTOMERS.map((customer) => ({ ...customer, segments: customer.segments.map((segment) => ({ ...segment })) }));
}

export function uniqueSegmentChips(rows: ShopifyCustomerRow[]): ShopifyCustomerSegmentChip[] {
  const seen = new Map<string, ShopifyCustomerSegmentChip>();
  for (const row of rows) {
    for (const segment of row.segments) {
      if (!seen.has(segment.id)) seen.set(segment.id, segment);
    }
  }
  return Array.from(seen.values());
}
