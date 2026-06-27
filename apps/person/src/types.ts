export type ColumnId = 'unassigned' | 'in_progress' | 'positive' | 'closed';

export type TaskSource = 'manual' | 'ai_transcript' | 'ai_segment' | 'ai_stale';
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
  id: string;
  title: string;
  summary: string;
  segment: string;
  segmentColor: string;
  priority: number;
  columnId: ColumnId;
  pinned: boolean;
  pinnedAt: number | null;
  /** Where the task came from. AI sources get a small badge + open the AI brief modal. */
  source: TaskSource;
  /** Phone + email surface for the customer card panel. */
  phone?: string;
  email?: string;
  ordersCount?: number;
  totalSpent?: number;
  /** Present only when source !== 'manual'. */
  aiBrief?: TaskBrief;
}

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
}

export type NavId =
  | 'queue'
  | 'customers'
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
  { id: 'customers', label: 'Customers', group: 'Workspace' },
  { id: 'email', label: 'E-mail', group: 'Workspace' },
  { id: 'calendar', label: 'Calendar', group: 'Workspace' },
  { id: 'notes', label: 'Notes', group: 'Workspace' },
  { id: 'training', label: 'Training', group: 'Knowledge' },
  { id: 'announcements', label: 'Announcements', group: 'Knowledge' },
  { id: 'messaging', label: 'Messaging', group: 'Knowledge' },
  { id: 'requests', label: 'Submit Request', group: 'Account' },
  { id: 'notifications', label: 'Notifications', group: 'Account' },
];
