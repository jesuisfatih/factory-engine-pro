import { z } from 'zod';
import { emailSchema } from './common.js';
import { serviceRequestPrioritySchema } from './operations.js';
import { customerAssignmentAxisSchema } from './commerce.js';
import { createTaskAxisSchema } from './enums.js';
import {
  algorithmSurfaceIdSchema,
  frontendCustomizationDefinitionSchema,
  frontendMcpSurfaceIdSchema,
  workflowConditionTraceSchema,
  workflowWhenGroupTraceSchema,
} from './rules.js';

export const personQueueColumnSchema = z.enum(['unassigned', 'in_progress', 'positive', 'closed']);
export type PersonQueueColumn = z.infer<typeof personQueueColumnSchema>;

export const personTaskSourceSchema = z.enum(['manual', 'call_analysis', 'segment_priority', 'stale_follow_up', 'admin_transfer']);
export type PersonTaskSource = z.infer<typeof personTaskSourceSchema>;

export const personOperationItemKindSchema = z.enum(['task', 'customer']);
export type PersonOperationItemKind = z.infer<typeof personOperationItemKindSchema>;

export const DEFAULT_URGENCY_SCORING_CONFIG = {
  segmentWeight: 1.5,
  repeatCountWeight: 1,
  intentWeight: 1,
  aiUrgencyWeight: 2,
  waitingHoursWeight: 0.25,
  intentScores: {
    complaint: 20,
    escalation: 18,
    reorder: 14,
    sales: 12,
    support: 8,
    follow_up: 8,
  },
  aiUrgencyScores: {
    critical: 30,
    high: 20,
    medium: 10,
    low: 3,
  },
} as const;

export const urgencyScoringConfigSchema = z.object({
  segmentWeight: z.coerce.number().min(0).max(100).default(DEFAULT_URGENCY_SCORING_CONFIG.segmentWeight),
  repeatCountWeight: z.coerce.number().min(0).max(100).default(DEFAULT_URGENCY_SCORING_CONFIG.repeatCountWeight),
  intentWeight: z.coerce.number().min(0).max(100).default(DEFAULT_URGENCY_SCORING_CONFIG.intentWeight),
  aiUrgencyWeight: z.coerce.number().min(0).max(100).default(DEFAULT_URGENCY_SCORING_CONFIG.aiUrgencyWeight),
  waitingHoursWeight: z.coerce.number().min(0).max(100).default(DEFAULT_URGENCY_SCORING_CONFIG.waitingHoursWeight),
  intentScores: z.record(z.string(), z.coerce.number().min(0).max(100)).default(DEFAULT_URGENCY_SCORING_CONFIG.intentScores),
  aiUrgencyScores: z.record(z.string(), z.coerce.number().min(0).max(100)).default(DEFAULT_URGENCY_SCORING_CONFIG.aiUrgencyScores),
});
export type UrgencyScoringConfig = z.infer<typeof urgencyScoringConfigSchema>;

export const personUrgencyBreakdownSchema = z.object({
  score: z.number(),
  segmentScore: z.number(),
  repeatCount: z.number(),
  intent: z.string().nullable(),
  intentScore: z.number(),
  aiUrgency: z.string().nullable(),
  aiUrgencyScore: z.number(),
  waitingHours: z.number(),
  weights: urgencyScoringConfigSchema,
});
export type PersonUrgencyBreakdown = z.infer<typeof personUrgencyBreakdownSchema>;

export const personTaskWorkflowTraceSchema = z.object({
  ruleId: z.string().nullable(),
  matchedRuleId: z.string().nullable(),
  ruleName: z.string().nullable(),
  trigger: z.string().nullable(),
  source: z.string().nullable(),
  eventId: z.string().nullable(),
  action: z.string().nullable(),
  actionId: z.string().nullable(),
  conditionTrace: z.array(workflowConditionTraceSchema).default([]),
  whenTrace: z.array(workflowWhenGroupTraceSchema).default([]),
});
export type PersonTaskWorkflowTrace = z.infer<typeof personTaskWorkflowTraceSchema>;

export const personTaskStateSnapshotSchema = z.record(z.string(), z.unknown());
export type PersonTaskStateSnapshot = z.infer<typeof personTaskStateSnapshotSchema>;

export const personStrategyRuntimeProofSchema = z.object({
  surfaceId: algorithmSurfaceIdSchema,
  score: z.number(),
  bandId: z.string().nullable(),
  bandLabel: z.string().nullable(),
  tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger']).nullable(),
  ctaPriority: z.array(z.string()).default([]),
  modalActionOrder: z.array(z.string()).default([]),
});
export type PersonStrategyRuntimeProof = z.infer<typeof personStrategyRuntimeProofSchema>;

export const personCardStrategyProofSchema = z.object({
  nextAction: personStrategyRuntimeProofSchema.optional(),
  callBrief: personStrategyRuntimeProofSchema.optional(),
});
export type PersonCardStrategyProof = z.infer<typeof personCardStrategyProofSchema>;

export const personTaskBriefSchema = z.object({
  whyCalling: z.string(),
  upsetAbout: z.string(),
  callGoal: z.string(),
  suggestedActions: z.array(z.string()),
  promptKey: z.string(),
  promptVersion: z.string(),
  modelUsed: z.string(),
  confidence: z.number(),
  transcriptSnippet: z.string().optional(),
  ctaPriority: z.array(z.string()).optional(),
  modalActionOrder: z.array(z.string()).optional(),
  strategyProof: personCardStrategyProofSchema.optional(),
});
export type PersonTaskBrief = z.infer<typeof personTaskBriefSchema>;

export const personMiniOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string().nullable(),
  totalPrice: z.number(),
  currency: z.string(),
  financialStatus: z.string().nullable(),
  fulfillmentStatus: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PersonMiniOrder = z.infer<typeof personMiniOrderSchema>;

export const personPerformance30dSchema = z.object({
  orders: z.number(),
  revenue: z.number(),
  calls: z.number(),
  callMinutes: z.number(),
  serviceRequests: z.number(),
});
export type PersonPerformance30d = z.infer<typeof personPerformance30dSchema>;

export const personQueueCardSchema = z.object({
  kind: personOperationItemKindSchema.default('task'),
  id: z.string(),
  customerId: z.string().nullable().optional(),
  assignedMemberId: z.string().nullable().optional(),
  assignedMemberName: z.string().nullable().optional(),
  axis: customerAssignmentAxisSchema.nullable().optional(),
  title: z.string(),
  summary: z.string(),
  segment: z.string(),
  segmentColor: z.string(),
  segmentId: z.string().nullable().optional(),
  segmentName: z.string().nullable().optional(),
  segmentPriority: z.number().nullable().optional(),
  segmentOwnershipPriority: z.number().nullable().optional(),
  priority: z.number(),
  urgencyScore: z.number(),
  urgencyBreakdown: personUrgencyBreakdownSchema,
  columnId: personQueueColumnSchema,
  pinned: z.boolean(),
  pinnedAt: z.number().nullable(),
  source: personTaskSourceSchema,
  phone: z.string().optional(),
  email: z.string().optional(),
  ordersCount: z.number().optional(),
  totalSpent: z.number().optional(),
  aiBrief: personTaskBriefSchema.optional(),
  workflowTrace: personTaskWorkflowTraceSchema.optional(),
  taskStateSnapshot: personTaskStateSnapshotSchema.optional(),
  matchedRuleId: z.string().nullable().optional(),
  miniOrder: personMiniOrderSchema.optional(),
  performance30d: personPerformance30dSchema.optional(),
  createdAt: z.string().optional(),
  callIntent: z.string().nullable().optional(),
  psychTags: z.array(z.string()).optional(),
  ctaPriority: z.array(z.string()).optional(),
  modalActionOrder: z.array(z.string()).optional(),
  strategyProof: personCardStrategyProofSchema.optional(),
});
export type PersonQueueCardDto = z.infer<typeof personQueueCardSchema>;

export const personTaskTimelineKindSchema = z.enum(['order', 'aircall', 'note', 'task', 'activity']);
export type PersonTaskTimelineKind = z.infer<typeof personTaskTimelineKindSchema>;

export const personTaskTimelineEntrySchema = z.object({
  id: z.string(),
  kind: personTaskTimelineKindSchema,
  title: z.string(),
  summary: z.string().nullable(),
  at: z.string(),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type PersonTaskTimelineEntry = z.infer<typeof personTaskTimelineEntrySchema>;

export const personTaskNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  actorType: z.string().nullable(),
  createdAt: z.string(),
});
export type PersonTaskNote = z.infer<typeof personTaskNoteSchema>;

export const personTaskRuleLinkSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  trigger: z.string(),
  canvasUrl: z.string(),
});
export type PersonTaskRuleLink = z.infer<typeof personTaskRuleLinkSchema>;

export const personTaskShopifyCustomerSchema = z.object({
  customerId: z.string().nullable(),
  shopifyCustomerId: z.string().nullable(),
  phoneMatched: z.boolean(),
  emailMatched: z.boolean(),
});
export type PersonTaskShopifyCustomer = z.infer<typeof personTaskShopifyCustomerSchema>;

export const personAiPsychAnalysisSchema = z.object({
  communicationStyle: z.string().nullable(),
  decisionMakingStyle: z.string().nullable(),
  trustLevel: z.number().nullable(),
  engagementLevel: z.number().nullable(),
  winProbability: z.number().nullable(),
  motivators: z.array(z.string()),
  objections: z.array(z.string()),
  buyingSignals: z.array(z.string()),
  hesitationSignals: z.array(z.string()),
  talkTrack: z.string().nullable(),
  generatedAt: z.string().nullable(),
});
export type PersonAiPsychAnalysis = z.infer<typeof personAiPsychAnalysisSchema>;

export const personTaskBriefDetailSchema = z.object({
  card: personQueueCardSchema,
  shopifyCustomer: personTaskShopifyCustomerSchema,
  recentOrders: z.array(personMiniOrderSchema),
  timeline: z.array(personTaskTimelineEntrySchema),
  performance30d: personPerformance30dSchema,
  notes: z.array(personTaskNoteSchema),
  aiPsychAnalysis: personAiPsychAnalysisSchema.nullable(),
  rule: personTaskRuleLinkSchema.nullable(),
  customerDetailUrl: z.string().nullable(),
});
export type PersonTaskBriefDetail = z.infer<typeof personTaskBriefDetailSchema>;

export const personDailyCallItemSchema = z.object({
  kind: z.literal('customer').default('customer'),
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  ordersCount: z.number(),
  totalSpent: z.number(),
  lastContact: z.string(),
  assignedAxis: z.string(),
  segment: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    priority: z.number(),
    dailyCap: z.number().nullable(),
  }),
  urgencyScore: z.number(),
  urgencyBreakdown: personUrgencyBreakdownSchema,
  repeatCount: z.number(),
  customOrder: z.number().nullable(),
  pinned: z.boolean(),
  pinId: z.string().nullable(),
  notesCount: z.number().default(0),
  openTasksCount: z.number().default(0),
  openRequestsCount: z.number().default(0),
  callsCount: z.number().default(0),
  latestNote: z.object({
    id: z.string(),
    body: z.string(),
    authorName: z.string(),
    createdAt: z.string(),
  }).nullable().default(null),
  latestOrder: z.object({
    id: z.string(),
    orderNumber: z.string().nullable(),
    totalPrice: z.number(),
    currency: z.string(),
    processedAt: z.string().nullable(),
  }).nullable().default(null),
  latestCall: z.object({
    id: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    summary: z.string().nullable(),
    at: z.string(),
  }).nullable().default(null),
  reason: z.string(),
});
export type PersonDailyCallItem = z.infer<typeof personDailyCallItemSchema>;

export const personSegmentDailyGroupSchema = z.object({
  segmentId: z.string(),
  segmentName: z.string(),
  segmentColor: z.string(),
  priority: z.number(),
  dailyCap: z.number().nullable(),
  totalCustomers: z.number(),
  items: z.array(personDailyCallItemSchema),
});
export type PersonSegmentDailyGroup = z.infer<typeof personSegmentDailyGroupSchema>;

export const personFrontendCustomizationRuntimeSchema = z.object({
  surfaceId: frontendMcpSurfaceIdSchema,
  customizationId: z.string().nullable(),
  name: z.string().nullable(),
  definition: frontendCustomizationDefinitionSchema,
  warnings: z.array(z.string()).default([]),
  checkedAt: z.string(),
});
export type PersonFrontendCustomizationRuntime = z.infer<typeof personFrontendCustomizationRuntimeSchema>;

export const personDailyOperationsSchema = z.object({
  summary: z.object({
    viewer: z.object({
      id: z.string(),
      email: z.string().nullable(),
      name: z.string(),
      roleNames: z.array(z.string()),
    }),
    dailyCount: z.number(),
    priorityCount: z.number(),
    pinnedCount: z.number(),
    highUrgencyCount: z.number(),
    visibleAxes: z.array(z.string()),
    segmentGroupCount: z.number(),
  }),
  dailyCallList: z.array(personQueueCardSchema),
  priorityKanban: z.array(personQueueCardSchema),
  pinBoard: z.array(personQueueCardSchema),
  segmentGroups: z.array(personSegmentDailyGroupSchema),
  frontendCustomization: personFrontendCustomizationRuntimeSchema,
});
export type PersonDailyOperationsDto = z.infer<typeof personDailyOperationsSchema>;

export const personDailyOperationRangeSchema = z.enum(['last7d', 'today', 'archive']).default('last7d');
export type PersonDailyOperationRange = z.infer<typeof personDailyOperationRangeSchema>;

export const personDailyOperationsQuerySchema = z.object({
  range: personDailyOperationRangeSchema.optional().default('last7d'),
});
export type PersonDailyOperationsQuery = z.infer<typeof personDailyOperationsQuerySchema>;

export const personCustomerArchiveQuerySchema = z.object({
  limit: z.coerce.number().int().min(10).max(150).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(120).optional().transform((value) => value || undefined),
});
export type PersonCustomerArchiveQuery = z.infer<typeof personCustomerArchiveQuerySchema>;

export const movePersonQueueCardSchema = z.object({
  columnId: personQueueColumnSchema,
  index: z.coerce.number().int().min(0).default(0),
});
export type MovePersonQueueCardInput = z.infer<typeof movePersonQueueCardSchema>;

export const reorderPersonDailyCallSchema = z.object({
  segmentId: z.string().trim().min(1).optional(),
  range: personDailyOperationRangeSchema.optional().default('last7d'),
  orderedItemIds: z.array(z.string().trim().min(1)).min(1).max(500),
});
export type ReorderPersonDailyCallInput = z.infer<typeof reorderPersonDailyCallSchema>;

export const reorderPersonDailyCallResultSchema = z.object({
  ok: z.literal(true),
  segmentId: z.string().nullable(),
  orderedItemIds: z.array(z.string()),
});
export type ReorderPersonDailyCallResult = z.infer<typeof reorderPersonDailyCallResultSchema>;

export const archivePersonDailyCallResultSchema = z.object({
  ok: z.literal(true),
  taskId: z.string(),
  archived: z.literal(true),
  archivedAt: z.string(),
});
export type ArchivePersonDailyCallResult = z.infer<typeof archivePersonDailyCallResultSchema>;

export const togglePersonQueuePinSchema = z.object({
  pinned: z.boolean().optional(),
});
export type TogglePersonQueuePinInput = z.infer<typeof togglePersonQueuePinSchema>;

export const transferPersonTaskSchema = z.object({
  targetMemberId: z.string().trim().min(1),
  targetAxis: createTaskAxisSchema.optional(),
  reason: z.string().trim().max(500).optional(),
});
export type TransferPersonTaskInput = z.infer<typeof transferPersonTaskSchema>;

export const personTransferTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  roleNames: z.array(z.string()),
  axes: z.array(createTaskAxisSchema),
});
export type PersonTransferTarget = z.infer<typeof personTransferTargetSchema>;

export const personTaskTransferResultSchema = z.object({
  ok: z.literal(true),
  taskId: z.string(),
  customerId: z.string().nullable(),
  fromMemberId: z.string().nullable(),
  fromMemberName: z.string().nullable(),
  toMemberId: z.string(),
  toMemberName: z.string(),
  fromAxis: customerAssignmentAxisSchema.nullable(),
  toAxis: customerAssignmentAxisSchema,
  sourceListRemoved: z.boolean(),
  targetListEntered: z.boolean(),
});
export type PersonTaskTransferResult = z.infer<typeof personTaskTransferResultSchema>;

export const savePersonTaskNoteSchema = z.object({
  body: z.string().trim().min(1).max(12000),
});
export type SavePersonTaskNoteInput = z.infer<typeof savePersonTaskNoteSchema>;

export const savePersonCustomerNoteSchema = z.object({
  body: z.string().trim().min(1).max(12000),
});
export type SavePersonCustomerNoteInput = z.infer<typeof savePersonCustomerNoteSchema>;

export const schedulePersonTaskFollowUpSchema = z.object({
  scheduledAt: z.string().datetime(),
  note: z.string().trim().max(1200).optional(),
});
export type SchedulePersonTaskFollowUpInput = z.infer<typeof schedulePersonTaskFollowUpSchema>;

export const sendPersonMessageSchema = z.object({
  threadId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(4000),
});
export type SendPersonMessageInput = z.infer<typeof sendPersonMessageSchema>;

export const personNoteKindSchema = z.enum(['scratch', 'queue']);
export type PersonNoteKind = z.infer<typeof personNoteKindSchema>;

export const savePersonNoteSchema = z.object({
  id: z.string().trim().optional(),
  kind: personNoteKindSchema.default('scratch'),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(12000).default(''),
  linkedCustomer: z.string().trim().max(200).optional(),
  linkedQueueId: z.string().trim().max(80).optional(),
});
export type SavePersonNoteInput = z.infer<typeof savePersonNoteSchema>;

export const replyPersonNoteSchema = z.object({
  body: z.string().trim().min(1).max(12000),
});
export type ReplyPersonNoteInput = z.infer<typeof replyPersonNoteSchema>;

export const personNoteReplySchema = z.object({
  id: z.string(),
  body: z.string(),
  authorName: z.string(),
  authorRole: z.string(),
  createdAt: z.string(),
});
export type PersonNoteReply = z.infer<typeof personNoteReplySchema>;

export const personNoteRowSchema = z.object({
  id: z.string(),
  kind: personNoteKindSchema,
  title: z.string(),
  body: z.string(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  authorRole: z.string().optional(),
  linkedCustomer: z.string().optional(),
  linkedCustomerName: z.string().optional(),
  linkedQueueId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  replies: z.array(personNoteReplySchema).default([]),
});
export type PersonNoteRow = z.infer<typeof personNoteRowSchema>;

export const savePersonEmailDraftSchema = z.object({
  to: emailSchema,
  subject: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(12000),
});
export type SavePersonEmailDraftInput = z.infer<typeof savePersonEmailDraftSchema>;

export const sendPersonEmailSchema = savePersonEmailDraftSchema;
export type SendPersonEmailInput = z.infer<typeof sendPersonEmailSchema>;

export const personEmailContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: emailSchema,
  phone: z.string().nullable(),
  source: z.enum(['customer', 'mail_delivery']),
  lastContactAt: z.string().nullable(),
});
export type PersonEmailContact = z.infer<typeof personEmailContactSchema>;

export const personTaskSyncResultSchema = z.object({
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
export type PersonTaskSyncResult = z.infer<typeof personTaskSyncResultSchema>;

export const createPersonRequestSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(8000),
  category: z.enum(['pto', 'equipment', 'exception', 'access', 'other']).default('other'),
  priority: serviceRequestPrioritySchema.default('medium'),
});
export type CreatePersonRequestInput = z.infer<typeof createPersonRequestSchema>;
