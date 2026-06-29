import { z } from 'zod';
import { createTaskAxisSchema } from './enums.js';
import { serviceRequestPrioritySchema } from './operations.js';

export const callCenterMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
});
export type CallCenterMember = z.infer<typeof callCenterMemberSchema>;

export const callCenterTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  customerPhone: z.string().nullable(),
  assignedMemberId: z.string().nullable(),
  assignedMemberName: z.string(),
  assignedMemberRole: z.string(),
  activeMemberId: z.string().nullable(),
  activeMemberName: z.string(),
  activeMemberRole: z.string(),
  axis: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  source: z.string(),
  segment: z.string(),
  callIntent: z.string().nullable().optional(),
  psychTags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CallCenterTask = z.infer<typeof callCenterTaskSchema>;

export const callCenterPriorityCustomerSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  ordersCount: z.number(),
  totalSpent: z.number(),
  lastOrderAt: z.string().nullable(),
  urgencyScore: z.number(),
  activeMemberId: z.string().nullable(),
  activeMemberName: z.string(),
  activeMemberRole: z.string(),
  notesCount: z.number(),
  openTasksCount: z.number(),
  openRequestsCount: z.number(),
  callsCount: z.number(),
  latestNote: z.object({
    id: z.string(),
    body: z.string(),
    authorName: z.string(),
    authorRole: z.string(),
    createdAt: z.string(),
  }).nullable(),
  latestOrder: z.object({
    id: z.string(),
    orderNumber: z.string().nullable(),
    totalPrice: z.number(),
    processedAt: z.string().nullable(),
  }).nullable(),
  latestCall: z.object({
    id: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    summary: z.string().nullable(),
    at: z.string(),
  }).nullable(),
  reason: z.string(),
});
export type CallCenterPriorityCustomer = z.infer<typeof callCenterPriorityCustomerSchema>;

export const callCenterPriorityGroupSchema = z.object({
  segmentId: z.string(),
  segmentName: z.string(),
  segmentColor: z.string(),
  ownerMemberId: z.string(),
  ownerName: z.string(),
  ownerRole: z.string(),
  customerCount: z.number(),
  customers: z.array(callCenterPriorityCustomerSchema),
});
export type CallCenterPriorityGroup = z.infer<typeof callCenterPriorityGroupSchema>;

export const callCenterPinSchema = z.object({
  id: z.string(),
  serviceRequestId: z.string().nullable(),
  customerId: z.string().nullable(),
  title: z.string(),
  ownerMemberId: z.string(),
  ownerName: z.string(),
  ownerRole: z.string(),
  activeMemberId: z.string().nullable(),
  activeMemberName: z.string(),
  activeMemberRole: z.string(),
  customerName: z.string().nullable(),
  kind: z.enum(['task', 'customer']),
  pinnedAt: z.string().nullable(),
});
export type CallCenterPin = z.infer<typeof callCenterPinSchema>;

export const callCenterCalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  customerName: z.string().nullable(),
  memberId: z.string().nullable(),
  memberName: z.string(),
  memberRole: z.string(),
  dayIso: z.string(),
  startHour: z.number(),
  durationMinutes: z.number(),
  kind: z.string(),
});
export type CallCenterCalendarEvent = z.infer<typeof callCenterCalendarEventSchema>;

export const callCenterNoteSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  authorId: z.string().nullable(),
  authorName: z.string(),
  authorRole: z.string(),
  body: z.string(),
  createdAt: z.string(),
  replyCount: z.number().default(0),
  latestReply: z.object({
    id: z.string(),
    authorName: z.string(),
    authorRole: z.string(),
    body: z.string(),
    createdAt: z.string(),
  }).nullable().default(null),
});
export type CallCenterNote = z.infer<typeof callCenterNoteSchema>;

export const callCenterMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  fromMemberId: z.string().nullable(),
  fromName: z.string(),
  fromRole: z.string(),
  toMemberId: z.string().nullable(),
  toName: z.string().nullable(),
  toRole: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
});
export type CallCenterMessage = z.infer<typeof callCenterMessageSchema>;

export const callCenterPreviewSchema = z.object({
  latestMessages: z.array(callCenterMessageSchema),
  sentMail: z.object({
    today: z.number(),
    week: z.number(),
    lastSentAt: z.string().nullable(),
  }),
  recentCalls: z.array(z.object({
    id: z.string(),
    customer: z.string(),
    phone: z.string().nullable(),
    memberName: z.string(),
    memberRole: z.string(),
    at: z.string(),
  })),
  callStats: z.object({
    todayTotal: z.number(),
    answeredRate: z.number(),
    byMember: z.array(z.object({
      memberId: z.string(),
      memberName: z.string(),
      count: z.number(),
    })),
  }),
  taskActivity: z.array(z.object({
    id: z.string(),
    title: z.string(),
    memberName: z.string(),
    memberRole: z.string(),
    status: z.string(),
    updatedAt: z.string(),
  })),
  activeRuleFire: z.array(z.object({
    ruleId: z.string(),
    ruleName: z.string(),
    fires: z.number(),
    matches: z.number(),
    lastFiredAt: z.string().nullable(),
  })),
});
export type CallCenterPreview = z.infer<typeof callCenterPreviewSchema>;

export const callCenterOverviewSchema = z.object({
  generatedAt: z.string(),
  members: z.array(callCenterMemberSchema),
  preview: callCenterPreviewSchema,
  kanban: z.object({
    dailyCallList: z.array(callCenterTaskSchema),
    priorityGroups: z.array(callCenterPriorityGroupSchema),
    pinBoard: z.array(callCenterPinSchema),
  }),
  calendar: z.array(callCenterCalendarEventSchema),
  notes: z.array(callCenterNoteSchema),
  messages: z.array(callCenterMessageSchema),
});
export type CallCenterOverview = z.infer<typeof callCenterOverviewSchema>;

export const callCenterSaveCustomerNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CallCenterSaveCustomerNoteInput = z.infer<typeof callCenterSaveCustomerNoteSchema>;

export const callCenterReplyNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CallCenterReplyNoteInput = z.infer<typeof callCenterReplyNoteSchema>;

export const callCenterSendMessageSchema = z.object({
  toMemberId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(5000),
});
export type CallCenterSendMessageInput = z.infer<typeof callCenterSendMessageSchema>;

export const callCenterTransferTaskSchema = z.object({
  targetMemberId: z.string().min(1),
  targetAxis: createTaskAxisSchema.optional(),
  reason: z.string().trim().min(1).max(1000),
});
export type CallCenterTransferTaskInput = z.infer<typeof callCenterTransferTaskSchema>;

export const callCenterCreateCustomerTaskSchema = z.object({
  targetMemberId: z.string().min(1),
  targetAxis: createTaskAxisSchema.default('sales'),
  note: z.string().trim().min(1).max(1000),
  priority: serviceRequestPrioritySchema.default('medium'),
  dueAt: z.string().datetime().optional(),
});
export type CallCenterCreateCustomerTaskInput = z.infer<typeof callCenterCreateCustomerTaskSchema>;

export const callCenterActionResultSchema = z.object({
  ok: z.boolean(),
  serviceRequestId: z.string().nullable(),
  customerId: z.string().nullable(),
  assignedMemberId: z.string().nullable(),
  assignedMemberName: z.string().nullable(),
  axis: z.string().nullable(),
});
export type CallCenterActionResult = z.infer<typeof callCenterActionResultSchema>;

export const callCenterSyncResultSchema = z.object({
  ok: z.literal(true),
  backfill: z.object({
    recentDays: z.number(),
    fetched: z.number(),
    ingested: z.number(),
    resolverQueued: z.number(),
    transcriptsFound: z.number(),
    errors: z.number(),
  }),
  resolver: z.object({
    scanned: z.number(),
    queued: z.number(),
    skipped: z.number(),
    targetVersion: z.number(),
  }),
  syncedAt: z.string(),
});
export type CallCenterSyncResult = z.infer<typeof callCenterSyncResultSchema>;
