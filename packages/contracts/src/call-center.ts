import { z } from 'zod';

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
  axis: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  source: z.string(),
  segment: z.string(),
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
  title: z.string(),
  ownerMemberId: z.string(),
  ownerName: z.string(),
  ownerRole: z.string(),
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
});
export type CallCenterNote = z.infer<typeof callCenterNoteSchema>;

export const callCenterMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  fromMemberId: z.string().nullable(),
  fromName: z.string(),
  fromRole: z.string(),
  toName: z.string().nullable(),
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
