import type { Card, ColumnId, CustomerRow } from '../types';

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const SEG = {
  over20: { name: 'Over 20 Orders', color: '#1d4ed8' },
  vip: { name: 'VIP Watchlist', color: '#7c3aed' },
  high: { name: 'High Value', color: '#047857' },
  risk: { name: 'At Risk', color: '#b91c1c' },
};

/**
 * Each queue card carries:
 *   - `source`: where the task came from. Manual entries are admin/operator created.
 *     `ai_*` entries are AI-generated and surface an AI Task Brief modal on click.
 *   - `aiBrief` (optional): only present for AI sources. Drives the modal content.
 * The card UI shows a small source badge for AI-sourced rows so the operator
 * can pick what to handle first.
 */
const BRIEF_META = { promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001' };

let store: Card[] = [
  {
    id: '1', title: 'Cynthia Hagan', summary: '30 orders · $5,378 · 19h overdue', segment: SEG.over20.name, segmentColor: SEG.over20.color, priority: 9, columnId: 'unassigned', pinned: false, pinnedAt: null,
    source: 'ai_transcript', phone: '+1 859-338-1905', email: 'chag133@aol.com', ordersCount: 30, totalSpent: 5378,
    aiBrief: {
      whyCalling: 'On the 14:32 call she mentioned a bulk DTF order for 200pcs. We promised to send a written quote within the day.',
      upsetAbout: 'Her last shipment (8/15) had wash durability issues. She wants the new order to include the upgraded specs.',
      callGoal: 'Confirm the quote shape, lock in delivery within 10 days, send written PDF before EOD.',
      suggestedActions: ['Draft quote PDF (200pcs / 12% off)', 'Attach wash test data sheet', 'Schedule follow-up in 48h if no reply'],
      ...BRIEF_META, confidence: 0.81,
      transcriptSnippet: '… honestly the last batch I got had some peeling after 3 washes. If you can guarantee the new spec we can talk numbers …',
    },
  },
  {
    id: '2', title: 'Kelly Smith', summary: '87 orders · $24,962 · VIP push', segment: SEG.vip.name, segmentColor: SEG.vip.color, priority: 9, columnId: 'unassigned', pinned: true, pinnedAt: Date.now() - 5_000,
    source: 'ai_transcript', phone: '+1 800-742-5877', email: 'sscustomdesignsu272@gmail.com', ordersCount: 87, totalSpent: 24962,
    aiBrief: {
      whyCalling: 'Asked about tiered VIP pricing twice on the last call but did not commit. Mentioned competing supplier quote at 11% off.',
      upsetAbout: 'Lack of tier transparency. Felt the price kept changing per conversation.',
      callGoal: 'Confirm VIP tier 2 (12% off) verbally, send written proposal within 24h, lock 6-month rate.',
      suggestedActions: ['Open quote draft (200pcs/month / 12% off)', 'Send VIP pricing PDF', 'Schedule 1 week follow-up'],
      ...BRIEF_META, confidence: 0.86,
      transcriptSnippet: '… so what would you do if I committed to about 200 pieces a month? Last quote I had from another supplier was 11% off …',
    },
  },
  {
    id: '3', title: 'Robert Hopkins', summary: '30 orders · $4,412 · cart abandoned', segment: SEG.over20.name, segmentColor: SEG.over20.color, priority: 7, columnId: 'unassigned', pinned: false, pinnedAt: null,
    source: 'ai_segment', phone: '+1 910-297-4827', email: 'hopkinsdesignsdelrio@gmail.com', ordersCount: 30, totalSpent: 4412,
    aiBrief: {
      whyCalling: 'Matched "Over 20 Orders" segment with abandoned cart ($312) in last 24h. No prior contact in 14 days.',
      upsetAbout: 'No friction mentioned — cart was simply abandoned at checkout. May be price-shopping.',
      callGoal: 'Recover the cart. Offer FREESHIP code valid for today only.',
      suggestedActions: ['Send recovery email with FREESHIP code', 'Schedule reminder in 24h if no action', 'Note any pricing pushback'],
      ...BRIEF_META, confidence: 0.65,
    },
  },
  { id: '4', title: 'Melanie Coger', summary: '21 orders · $4,124 · ready for upsell', segment: SEG.over20.name, segmentColor: SEG.over20.color, priority: 7, columnId: 'in_progress', pinned: false, pinnedAt: null, source: 'manual', phone: '+1 512-555-0184', email: 'trendmonkey.tx@gmail.com', ordersCount: 21, totalSpent: 4124 },
  { id: '5', title: 'Ashley Fairchild', summary: '33 orders · $11,796 · pricing question', segment: SEG.over20.name, segmentColor: SEG.over20.color, priority: 5, columnId: 'in_progress', pinned: true, pinnedAt: Date.now() - 2_000, source: 'manual', phone: '+1 214-555-0192', email: 'afairchild2024@gmail.com', ordersCount: 33, totalSpent: 11796 },
  {
    id: '6', title: 'Corry Bailey', summary: '22 orders · $30,088 · awaiting quote', segment: SEG.high.name, segmentColor: SEG.high.color, priority: 9, columnId: 'in_progress', pinned: false, pinnedAt: null,
    source: 'ai_transcript', phone: '+1 832-555-0143', email: 'corry@future1s.com', ordersCount: 22, totalSpent: 30088,
    aiBrief: {
      whyCalling: 'Requested 12% volume discount on the call — exceeds rep cap (8%). Wants final answer today.',
      upsetAbout: 'Feels strung along — second time pricing has been pushed up the chain without a yes/no.',
      callGoal: 'Get approval, deliver answer, lock pricing on SR-4424.',
      suggestedActions: ['Slack #pricing for approval', 'Reply on case SR-4424 with locked rate', 'Confirm timeline (today)'],
      ...BRIEF_META, confidence: 0.92,
    },
  },
  { id: '7', title: 'Cleo Harris', summary: '36 orders · $12,740 · sample sent', segment: SEG.over20.name, segmentColor: SEG.over20.color, priority: 5, columnId: 'positive', pinned: false, pinnedAt: null, source: 'manual', phone: '+1 918-555-0167', email: 'bwsteestulsa@gmail.com', ordersCount: 36, totalSpent: 12740 },
  {
    id: '8', title: 'Joseph Mcgranahan', summary: '21 orders · $25,630 · re-engaged', segment: SEG.high.name, segmentColor: SEG.high.color, priority: 5, columnId: 'positive', pinned: false, pinnedAt: null,
    source: 'ai_stale', phone: '+1 405-555-0118', email: 'admin@epicmarks.com', ordersCount: 21, totalSpent: 25630,
    aiBrief: {
      whyCalling: 'Last contact Dec 11 2025. Stale detection flagged risk of churn. Previously high LTV.',
      upsetAbout: 'No active complaint. The risk is silent — he may have already moved to a competitor.',
      callGoal: 'Re-engage. Find out if a competitor took the account. Offer loyalty discount if needed.',
      suggestedActions: ['Phone outreach with re-engagement script', 'Offer loyalty 5% credit', 'Update CRM with current status'],
      ...BRIEF_META, confidence: 0.71,
    },
  },
  { id: '9', title: 'Tish Harjo', summary: '31 orders · $18,119 · confirmed deal', segment: SEG.high.name, segmentColor: SEG.high.color, priority: 3, columnId: 'positive', pinned: false, pinnedAt: null, source: 'manual', phone: '+1 918-555-0139', email: 'okmulgee101@gmail.com', ordersCount: 31, totalSpent: 18119 },
  { id: '10', title: 'Christian Page', summary: '51 orders · $44,889 · closed/won', segment: SEG.vip.name, segmentColor: SEG.vip.color, priority: 3, columnId: 'closed', pinned: false, pinnedAt: null, source: 'manual', phone: '+1 469-555-0175', email: 'ccp1212@gmail.com', ordersCount: 51, totalSpent: 44889 },
  {
    id: '11', title: 'Rod Rinehart', summary: '44 orders · $27,325 · churn risk', segment: SEG.risk.name, segmentColor: SEG.risk.color, priority: 9, columnId: 'unassigned', pinned: false, pinnedAt: null,
    source: 'ai_segment', phone: '+1 314-555-0163', email: 'rodr@gcsportswear.com', ordersCount: 44, totalSpent: 27325,
    aiBrief: {
      whyCalling: 'Matched "At Risk" segment. Long-time customer ($27k LTV) with 60+ days of silence.',
      upsetAbout: 'Last support ticket (SR-3812) had slow resolution. Customer flagged delivery time as the dealbreaker.',
      callGoal: 'Rebuild trust with a quick win — proactive shipping update, no upsell.',
      suggestedActions: ['Pull latest order ETA from carrier', 'Offer expedited shipping credit on next order', 'Skip the pitch'],
      ...BRIEF_META, confidence: 0.74,
    },
  },
  {
    id: '12', title: 'Evon watson', summary: '50 orders · $13,217 · payment delay', segment: SEG.risk.name, segmentColor: SEG.risk.color, priority: 7, columnId: 'unassigned', pinned: false, pinnedAt: null,
    source: 'ai_segment', phone: '+1 832-555-0102', email: 'aafashionexpresspress@gmail.com', ordersCount: 50, totalSpent: 13217,
    aiBrief: {
      whyCalling: 'At-risk segment + invoice 18 days overdue.',
      upsetAbout: 'Cash-flow tight per their last reply — not a satisfaction issue.',
      callGoal: 'Negotiate payment plan, retain account. Avoid pushing for full payment in one shot.',
      suggestedActions: ['Propose 3-instalment plan', 'Pause new orders only if payment plan fails', 'Loop in accounting if needed'],
      ...BRIEF_META, confidence: 0.79,
    },
  },
];

export async function fetchCards(): Promise<Card[]> {
  await delay();
  return store.map((c) => ({ ...c }));
}

export async function moveCard(input: { id: string; columnId: ColumnId; index: number }): Promise<void> {
  await delay(120);
  const item = store.find((c) => c.id === input.id);
  if (!item) return;
  const without = store.filter((c) => c.id !== input.id);
  const sameColumn = without.filter((c) => c.columnId === input.columnId);
  const others = without.filter((c) => c.columnId !== input.columnId);
  const next = { ...item, columnId: input.columnId };
  const insertAt = Math.max(0, Math.min(input.index, sameColumn.length));
  sameColumn.splice(insertAt, 0, next);
  store = others.concat(sameColumn);
}

export async function togglePin(id: string): Promise<void> {
  await delay(80);
  store = store.map((c) =>
    c.id === id ? { ...c, pinned: !c.pinned, pinnedAt: !c.pinned ? Date.now() : null } : c,
  );
}

const customers: CustomerRow[] = [
  { id: 'c1', name: 'Cynthia Hagan', email: 'chag133@aol.com', phone: '+1 859-338-1905', ordersCount: 30, totalSpent: 5378, lastContact: '2026-06-18', lifecycle: 'lead', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
  { id: 'c2', name: 'Kelly Smith', email: 'sscustomdesignsu272@gmail.com', phone: '+1 800-742-5877', ordersCount: 87, totalSpent: 24962, lastContact: '2026-06-25', lifecycle: 'active', segment: { id: 's2', name: 'VIP Watchlist', color: '#7c3aed' } },
  { id: 'c3', name: 'Robert Hopkins', email: 'hopkinsdesignsdelrio@gmail.com', phone: '+1 910-297-4827', ordersCount: 30, totalSpent: 4412, lastContact: '2026-06-03', lifecycle: 'engaged', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
  { id: 'c4', name: 'Melanie Coger', email: 'trendmonkey.tx@gmail.com', phone: '+1 512-555-0184', ordersCount: 21, totalSpent: 4124, lastContact: '2026-06-25', lifecycle: 'engaged', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
  { id: 'c5', name: 'Ashley Fairchild', email: 'afairchild2024@gmail.com', phone: '+1 214-555-0192', ordersCount: 33, totalSpent: 11796, lastContact: '2026-04-25', lifecycle: 'engaged', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
  { id: 'c6', name: 'Corry Bailey', email: 'corry@future1s.com', phone: '+1 832-555-0143', ordersCount: 22, totalSpent: 30088, lastContact: '2026-06-22', lifecycle: 'active', segment: { id: 's3', name: 'High Value', color: '#047857' } },
  { id: 'c7', name: 'Cleo Harris', email: 'bwsteestulsa@gmail.com', phone: '+1 918-555-0167', ordersCount: 36, totalSpent: 12740, lastContact: '2026-06-24', lifecycle: 'active', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
  { id: 'c8', name: 'Joseph Mcgranahan', email: 'admin@epicmarks.com', phone: '+1 405-555-0118', ordersCount: 21, totalSpent: 25630, lastContact: '2025-12-11', lifecycle: 'at_risk', segment: { id: 's3', name: 'High Value', color: '#047857' } },
  { id: 'c9', name: 'Tish Harjo', email: 'okmulgee101@gmail.com', phone: '+1 918-555-0139', ordersCount: 31, totalSpent: 18119, lastContact: '2026-06-08', lifecycle: 'engaged', segment: { id: 's3', name: 'High Value', color: '#047857' } },
  { id: 'c10', name: 'Christian Page', email: 'ccp1212@gmail.com', phone: '+1 469-555-0175', ordersCount: 51, totalSpent: 44889, lastContact: '2026-06-26', lifecycle: 'active', segment: { id: 's2', name: 'VIP Watchlist', color: '#7c3aed' } },
  { id: 'c11', name: 'Rod Rinehart', email: 'rodr@gcsportswear.com', phone: '+1 314-555-0163', ordersCount: 44, totalSpent: 27325, lastContact: '2025-11-26', lifecycle: 'at_risk', segment: { id: 's4', name: 'At Risk', color: '#b91c1c' } },
  { id: 'c12', name: 'Evon watson', email: 'aafashionexpresspress@gmail.com', phone: '+1 832-555-0102', ordersCount: 50, totalSpent: 13217, lastContact: '2026-05-12', lifecycle: 'at_risk', segment: { id: 's4', name: 'At Risk', color: '#b91c1c' } },
  { id: 'c13', name: 'Tom Holland', email: 'tholland@example.com', phone: '+1 512-555-0123', ordersCount: 26, totalSpent: 6541, lastContact: '2026-04-08', lifecycle: 'lead', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
  { id: 'c14', name: 'Sara Connor', email: 'sara@skynet.example', phone: '+1 408-555-0134', ordersCount: 23, totalSpent: 7820, lastContact: '2026-06-12', lifecycle: 'engaged', segment: { id: 's1', name: 'Over 20 Orders', color: '#1d4ed8' } },
];

export async function fetchCustomers(): Promise<CustomerRow[]> {
  await delay(180);
  return customers.map((c) => ({ ...c }));
}

/* ─── Messages ────────────────────────────────────────────── */
export type PresenceStatus = 'online' | 'busy' | 'away' | 'offline';
export interface Teammate {
  id: string; name: string; email: string; role: string;
  status: PresenceStatus; lastSeen: string;
  unread: number; preview: string; lastAt: string;
}
export interface ChatMessage { id: string; threadId: string; fromMe: boolean; author: string; text: string; at: string; }

const TEAMMATES: Teammate[] = [
  { id: 'u1', name: 'Charlette Lee', email: 'charlette@dtfbank.com', role: 'Customer Service', status: 'busy', lastSeen: 'on call', unread: 0, preview: 'On the line with Robert Hopkins.', lastAt: '8m' },
  { id: 'u2', name: 'Sam Reyes', email: 'sam@dtfbank.com', role: 'Sales Service', status: 'online', lastSeen: 'just now', unread: 3, preview: 'Sent the Kelly Smith VIP proposal — review when you get a sec.', lastAt: '14m' },
  { id: 'u3', name: 'Olivia Park', email: 'olivia@dtfbank.com', role: 'Sales Service', status: 'online', lastSeen: '2 min ago', unread: 0, preview: 'Discount approval on Corry Bailey — needs your sign-off.', lastAt: '32m' },
  { id: 'u4', name: 'Aisha Khan', email: 'aisha@dtfbank.com', role: 'Support Lead', status: 'away', lastSeen: 'lunch · back in 20m', unread: 1, preview: 'SR #4421 (At Risk segment) — heads up.', lastAt: '1h' },
  { id: 'u5', name: 'Marcus Bell', email: 'marcus@dtfbank.com', role: 'Accounting', status: 'offline', lastSeen: 'yesterday', unread: 0, preview: 'Commission report attached.', lastAt: '1d' },
  { id: 'u6', name: 'Owner (Admin)', email: 'owner@dtfbank.com', role: 'Admin', status: 'online', lastSeen: '5 min ago', unread: 0, preview: 'Friday standup at 9 — bring last week\'s pin board.', lastAt: '2h' },
];
const THREADS: Record<string, ChatMessage[]> = {
  u2: [
    { id: 'm1', threadId: 'u2', fromMe: false, author: 'Sam Reyes', text: 'Sent the Kelly Smith VIP proposal — review when you get a sec.', at: 'Today · 13:55' },
    { id: 'm2', threadId: 'u2', fromMe: false, author: 'Sam Reyes', text: 'Tier 1 = 8% off / Tier 2 = 12% off. Need price approval for Tier 2.', at: 'Today · 13:56' },
    { id: 'm3', threadId: 'u2', fromMe: false, author: 'Sam Reyes', text: 'She mentioned a competing quote from another supplier.', at: 'Today · 13:58' },
    { id: 'm4', threadId: 'u2', fromMe: true, author: 'You', text: 'On it after my next call. I will ping pricing too.', at: 'Today · 14:02' },
  ],
  u4: [
    { id: 'm5', threadId: 'u4', fromMe: false, author: 'Aisha Khan', text: 'SR #4421 (Joseph Mcgranahan) — At Risk segment. 90+ days quiet. He pushed back on shipping fees on the call.', at: 'Today · 13:10' },
  ],
  u6: [
    { id: 'm6', threadId: 'u6', fromMe: false, author: 'Owner', text: 'Friday standup at 9 — bring last week\'s pin board.', at: 'Today · 12:00' },
    { id: 'm7', threadId: 'u6', fromMe: true, author: 'You', text: 'Will do.', at: 'Today · 12:01' },
  ],
};
export async function fetchTeammates(): Promise<Teammate[]> { await delay(120); return TEAMMATES.map((t) => ({ ...t })); }
export async function fetchThread(id: string): Promise<ChatMessage[]> { await delay(120); return (THREADS[id] ?? []).map((m) => ({ ...m })); }
export async function sendChatMessage(input: { threadId: string; text: string }): Promise<ChatMessage> {
  await delay(120);
  const msg: ChatMessage = { id: `m${Date.now()}`, threadId: input.threadId, fromMe: true, author: 'You', text: input.text.trim(), at: 'Now' };
  if (!THREADS[input.threadId]) THREADS[input.threadId] = [];
  THREADS[input.threadId].push(msg);
  return msg;
}

/* ─── Calendar (operator perspective) ────────────────────── */
export type EventSource = 'manual' | 'ai_transcript' | 'ai_segment' | 'ai_stale';
export type EventKind = 'call' | 'callback' | 'meeting' | 'reminder' | 'task';

export interface CalEvent {
  id: string; title: string; customer: string | null; customerEmail: string | null; customerPhone: string | null;
  dayIso: string; startHour: number; durationMinutes: number;
  kind: EventKind; source: EventSource;
  aiBrief?: {
    whyCalling: string; painPoints: string[]; callGoal: string;
    promptKey: string; promptVersion: string; modelUsed: string; confidence: number;
    transcriptSnippet?: string; suggestedActions: string[];
  };
}

const CAL_EVENTS: CalEvent[] = [
  {
    id: 'e1', title: 'Callback — Kelly Smith VIP pricing',
    customer: 'Kelly Smith', customerEmail: 'sscustomdesignsu272@gmail.com', customerPhone: '+1 800-742-5877',
    dayIso: '2026-06-23', startHour: 10, durationMinutes: 30, kind: 'callback', source: 'ai_transcript',
    aiBrief: {
      whyCalling: 'Customer asked about tiered VIP pricing twice on the 14:32 call but did not commit. She mentioned a competing supplier quote.',
      painPoints: ['Pricing transparency for >50pcs orders', 'Competitor offering 11% off, our cap is 8%', 'Wants clarity on tier thresholds'],
      callGoal: 'Confirm VIP tier 2 (12% off) verbally, then send a written proposal within 24h.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.86,
      transcriptSnippet: '… so what would you do if I committed to about 200 pieces a month? Last quote I had from another supplier was 11% off …',
      suggestedActions: ['Open quote draft (200pcs / 12% off)', 'Send VIP pricing PDF', 'Schedule 1 week follow-up'],
    },
  },
  {
    id: 'e2', title: 'Send follow-up quote — Cynthia Hagan',
    customer: 'Cynthia Hagan', customerEmail: 'chag133@aol.com', customerPhone: '+1 859-338-1905',
    dayIso: '2026-06-22', startHour: 11, durationMinutes: 15, kind: 'task', source: 'ai_transcript',
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
    dayIso: '2026-06-24', startHour: 14, durationMinutes: 20, kind: 'call', source: 'ai_segment',
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
    dayIso: '2026-06-25', startHour: 13, durationMinutes: 20, kind: 'reminder', source: 'ai_stale',
    aiBrief: {
      whyCalling: 'Last contact on Dec 11 2025. Risk of churn flagged by stale detection.',
      painPoints: ['No order activity in 90+ days', 'Previously high LTV ($25,630)'],
      callGoal: 'Re-engage. Find out if competitor took the account.',
      promptKey: 'sales.task-brief', promptVersion: 'v3', modelUsed: 'haiku-4-5-20251001', confidence: 0.71,
      suggestedActions: ['Phone outreach with re-engagement script', 'Offer loyalty discount'],
    },
  },
  {
    id: 'e5', title: 'Quarterly review — Christian Page',
    customer: 'Christian Page', customerEmail: 'ccp1212@gmail.com', customerPhone: '+1 469-555-0175',
    dayIso: '2026-06-22', startHour: 15, durationMinutes: 60, kind: 'meeting', source: 'manual',
  },
  {
    id: 'e6', title: 'Discount approval — Corry Bailey',
    customer: 'Corry Bailey', customerEmail: 'corry@future1s.com', customerPhone: '+1 832-555-0143',
    dayIso: '2026-06-23', startHour: 16, durationMinutes: 15, kind: 'task', source: 'ai_transcript',
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
    dayIso: '2026-06-24', startHour: 11, durationMinutes: 15, kind: 'reminder', source: 'manual',
  },
];
export async function fetchCalEvents(): Promise<CalEvent[]> { await delay(140); return CAL_EVENTS.map((event) => ({ ...event, aiBrief: event.aiBrief ? { ...event.aiBrief, painPoints: [...event.aiBrief.painPoints], suggestedActions: [...event.aiBrief.suggestedActions] } : undefined })); }

/* ─── Notes ───────────────────────────────────────────────── */
export interface NoteRow { id: string; kind: 'scratch' | 'queue'; title: string; body: string; linkedCustomer?: string; linkedQueueId?: string; createdAt: string; updatedAt: string; }
const NOTES: NoteRow[] = [
  { id: 'n1', kind: 'scratch', title: 'Pricing playbook draft', body: 'Tier 1 (>10pcs/mo): 5% / Tier 2 (>50pcs/mo): 8% / VIP (>200pcs/mo): 12%. Always frame as "we already pre-approved you" — feels exclusive.', createdAt: 'Today · 09:14', updatedAt: 'Today · 11:50' },
  { id: 'n2', kind: 'queue', title: 'Cynthia Hagan — VIP customer call notes', body: 'Wash durability is her #1 concern. She runs a uniform shop, 200pcs/mo recurring. Offered FREESHIP for first reorder.', linkedCustomer: 'Cynthia Hagan', linkedQueueId: 'q-1', createdAt: 'Today · 14:25', updatedAt: 'Today · 14:25' },
  { id: 'n3', kind: 'queue', title: 'Kelly Smith VIP pricing follow-up', body: 'Pricing approval coming Friday. She is open to closing if we beat 11%. Backup plan: tier 2 + 6mo lock.', linkedCustomer: 'Kelly Smith', linkedQueueId: 'q-2', createdAt: 'Today · 14:02', updatedAt: 'Today · 14:10' },
  { id: 'n4', kind: 'scratch', title: 'My script tweaks', body: 'Open with: "I am calling because we noticed…" — works better than "do you have time?" Drops the no-answer rate.', createdAt: 'Yesterday', updatedAt: 'Yesterday' },
];
export async function fetchNotes(): Promise<NoteRow[]> { await delay(120); return NOTES.map((note) => ({ ...note })); }
export async function saveNote(input: { id?: string; kind: 'scratch' | 'queue'; title: string; body: string; linkedCustomer?: string }): Promise<NoteRow> {
  await delay(150);
  if (input.id) {
    const idx = NOTES.findIndex((row) => row.id === input.id);
    if (idx >= 0) { NOTES[idx] = { ...NOTES[idx], title: input.title, body: input.body, updatedAt: 'Just now' }; return { ...NOTES[idx] }; }
  }
  const next: NoteRow = { id: `n${Date.now()}`, kind: input.kind, title: input.title, body: input.body, linkedCustomer: input.linkedCustomer, createdAt: 'Just now', updatedAt: 'Just now' };
  NOTES.unshift(next);
  return next;
}

/* ─── Email threads (operator) ───────────────────────────── */
export interface EmailRow { id: string; from: string; fromEmail: string; subject: string; preview: string; unread: boolean; at: string; }
const EMAILS: EmailRow[] = [
  { id: 'em1', from: 'Cynthia Hagan', fromEmail: 'chag133@aol.com', subject: 'Re: Bulk DTF order — quote please', preview: 'Hi! Following up on our call earlier. Could you confirm pricing on 200 pieces …', unread: true, at: '14:32' },
  { id: 'em2', from: 'Kelly Smith', fromEmail: 'sscustomdesignsu272@gmail.com', subject: 'VIP pricing tiers', preview: 'Could we get an updated tier sheet? Last one we have is from January …', unread: true, at: '13:18' },
  { id: 'em3', from: 'Robert Hopkins', fromEmail: 'hopkinsdesignsdelrio@gmail.com', subject: 'My cart — any chance to extend FREESHIP?', preview: 'Hey there, I left a few items in my cart yesterday and was wondering …', unread: false, at: '11:48' },
  { id: 'em4', from: 'Aisha Khan', fromEmail: 'aisha@dtfbank.com', subject: '[INTERNAL] SR-4421 customer reply notification', preview: 'Customer accepted replacement order. SLA satisfied. Closing case shortly.', unread: false, at: '10:02' },
  { id: 'em5', from: 'Christian Page', fromEmail: 'ccp1212@gmail.com', subject: 'Quarterly review attendee list', preview: 'Confirmed: 3 from our side. Will send agenda by Wednesday.', unread: false, at: 'Yesterday' },
];
export async function fetchEmails(): Promise<EmailRow[]> { await delay(140); return EMAILS.map((email) => ({ ...email })); }

/* ─── Announcements ───────────────────────────────────────── */
export interface Announcement { id: string; title: string; body: string; from: string; severity: 'info' | 'success' | 'warn' | 'critical'; at: string; read: boolean; }
const ANNOUNCEMENTS: Announcement[] = [
  { id: 'a1', title: 'Wave 5 cutover Friday', body: 'AI task-proposal agent goes default-ON for dtfbank canary at 18:00. Old transcript→task rules archived. Use /admin/ai/usage-log to monitor.', from: 'Engineering', severity: 'warn', at: 'Today · 10:30', read: false },
  { id: 'a2', title: 'New segment ownership rules live', body: 'Segments now invalidate the daily queue cache on save — assignments propagate within 30s. No manual refresh needed.', from: 'Engineering', severity: 'info', at: 'Yesterday', read: false },
  { id: 'a3', title: 'Linda hit 100% SLA last week', body: 'Outstanding work on the At-Risk recovery flow. Replication script attached for the team — try it on Joseph Mcgranahan today.', from: 'Owner', severity: 'success', at: '2 days ago', read: true },
  { id: 'a4', title: 'Aircall webhook auto re-enable update', body: 'When Aircall auto-disables our webhook, system now re-registers within 60s and posts to #ops-alerts. Avg downtime <2 min.', from: 'Engineering', severity: 'info', at: '3 days ago', read: true },
];
export async function fetchAnnouncements(): Promise<Announcement[]> { await delay(140); return ANNOUNCEMENTS.map((announcement) => ({ ...announcement })); }

/* ─── Notifications feed ──────────────────────────────────── */
export interface NotificationRow { id: string; kind: 'mention' | 'assigned' | 'sla' | 'pin' | 'system'; title: string; body: string; at: string; read: boolean; }
const NOTIFS: NotificationRow[] = [
  { id: 'nf1', kind: 'mention', title: '@Linda from Sam', body: 'Sent the Kelly Smith VIP proposal — review when you get a sec.', at: '14m ago', read: false },
  { id: 'nf2', kind: 'sla', title: 'SR-4421 SLA in 1h', body: 'Damaged shipment — Cynthia Hagan. Reply or escalate.', at: '38m ago', read: false },
  { id: 'nf3', kind: 'assigned', title: 'New AI task assigned', body: 'Discount approval — Corry Bailey (12% volume).', at: '1h ago', read: false },
  { id: 'nf4', kind: 'pin', title: 'Pinned to your board', body: 'Ashley Fairchild pinned by Owner.', at: '2h ago', read: true },
  { id: 'nf5', kind: 'system', title: 'Aircall reconnected', body: 'Webhook factoryengine-dtf-bank back to Active.', at: '4h ago', read: true },
];
export async function fetchNotifications(): Promise<NotificationRow[]> { await delay(120); return NOTIFS.map((notification) => ({ ...notification })); }
