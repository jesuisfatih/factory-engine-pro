import type {
  PersonDailyCallItem,
  PersonDailyOperationRange,
  PersonDailyOperationsDto,
  PersonSegmentDailyGroup,
  PersonMiniOrder,
  PersonPerformance30d,
  PersonTaskTransferResult,
  PersonTransferTarget,
  PersonTaskBriefDetail,
  PersonTaskStateSnapshot,
  PersonTaskWorkflowTrace,
  PersonUrgencyBreakdown,
  TransferPersonTaskInput,
} from '@factory-engine-pro/contracts';

export type ColumnId = 'unassigned' | 'in_progress' | 'positive' | 'closed';

export type TaskSource = 'manual' | 'call_analysis' | 'segment_priority' | 'stale_follow_up' | 'admin_transfer';
export interface TaskBrief {
  whyCalling: string;
  upsetAbout: string;
  callGoal: string;
  suggestedActions: string[];
  promptKey: string;
  promptVersion: string;
  modelUsed: string;
  confidence: number;
  transcriptSnippet?: string;
}
export interface Card {
  kind: 'task' | 'customer';
  id: string;
  customerId?: string | null;
  assignedMemberId?: string | null;
  assignedMemberName?: string | null;
  axis?: 'sales' | 'support' | 'account' | null;
  title: string;
  summary: string;
  segment: string;
  segmentColor: string;
  segmentId?: string | null;
  segmentName?: string | null;
  segmentPriority?: number | null;
  segmentOwnershipPriority?: number | null;
  priority: number;
  urgencyScore: number;
  urgencyBreakdown: PersonUrgencyBreakdown;
  columnId: ColumnId;
  pinned: boolean;
  pinnedAt: number | null;
  /** Where the task came from. Generated sources get a small badge + open the live brief modal. */
  source: TaskSource;
  /** Created timestamp used for Daily call list date grouping. */
  createdAt?: string;
  /** Resolver call intent badge shown on Daily call list cards. */
  callIntent?: string | null;
  /** Resolver psych tag badges shown on Daily call list cards. */
  psychTags?: string[];
  /** Phone + email surface for the customer card panel. */
  phone?: string;
  email?: string;
  ordersCount?: number;
  totalSpent?: number;
  /** Present only when source !== 'manual'. */
  aiBrief?: TaskBrief;
  /** Workflow decision context saved when rules created or routed the task. */
  workflowTrace?: PersonTaskWorkflowTrace;
  /** Fire-time customer, segment, and recent order state copied onto the task. */
  taskStateSnapshot?: PersonTaskStateSnapshot;
  /** Persisted workflow rule id used by the rule canvas link. */
  matchedRuleId?: string | null;
  /** Latest Shopify order, projected onto the card for fast scanning. */
  miniOrder?: PersonMiniOrder;
  /** Rolling 30-day customer signal summary. */
  performance30d?: PersonPerformance30d;
}

export type DailyCallItem = PersonDailyCallItem;
export type SegmentDailyGroup = PersonSegmentDailyGroup;
export type DailyOperations = PersonDailyOperationsDto;
export type DailyOperationRange = PersonDailyOperationRange;
export type TaskBriefDetail = PersonTaskBriefDetail;
export type TransferTarget = PersonTransferTarget;
export type TransferTaskInput = TransferPersonTaskInput;
export type TransferTaskResult = PersonTaskTransferResult;

export interface Column {
  id: ColumnId;
  title: string;
}

export const COLUMNS: Column[] = [
  { id: 'unassigned', title: 'Unassigned' },
  { id: 'in_progress', title: 'In progress' },
  { id: 'positive', title: 'Positive' },
  { id: 'closed', title: 'Closed' },
];

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
  lastContact: string;
  lifecycle: 'lead' | 'engaged' | 'active' | 'at_risk' | 'churned';
  segment: { id: string; name: string; color: string };
  urgencyScore?: number;
  urgencyBreakdown?: PersonUrgencyBreakdown;
}

export type NavId =
  | 'queue'
  | 'daily-archive'
  | 'customers'
  | 'customer-archive'
  | 'email'
  | 'training'
  | 'calendar'
  | 'notes'
  | 'announcements'
  | 'messaging'
  | 'requests'
  | 'notifications';

export interface NavItem {
  id: NavId;
  label: string;
  badge?: number;
  group?: string;
}

export const NAV: NavItem[] = [
  { id: 'queue', label: 'Call Queue', group: 'Workspace' },
  { id: 'daily-archive', label: 'Daily Archive', group: 'Workspace' },
  { id: 'customers', label: 'Customers', group: 'Workspace' },
  { id: 'customer-archive', label: 'Customer Archive', group: 'Workspace' },
  { id: 'email', label: 'E-mail', group: 'Workspace' },
  { id: 'calendar', label: 'Calendar', group: 'Workspace' },
  { id: 'notes', label: 'Notes', group: 'Workspace' },
  { id: 'training', label: 'Training', group: 'Knowledge' },
  { id: 'announcements', label: 'Announcements', group: 'Knowledge' },
  { id: 'messaging', label: 'Messaging', group: 'Knowledge' },
  { id: 'requests', label: 'Submit Request', group: 'Account' },
  { id: 'notifications', label: 'Notifications', group: 'Account' },
];
