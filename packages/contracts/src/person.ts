import { z } from 'zod';
import { serviceRequestPrioritySchema } from './operations.js';
import { workflowConditionTraceSchema, workflowWhenGroupTraceSchema } from './rules.js';

export const personQueueColumnSchema = z.enum(['unassigned', 'in_progress', 'positive', 'closed']);
export type PersonQueueColumn = z.infer<typeof personQueueColumnSchema>;

export const personTaskSourceSchema = z.enum(['manual', 'ai_transcript', 'ai_segment', 'ai_stale']);
export type PersonTaskSource = z.infer<typeof personTaskSourceSchema>;

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
});
export type PersonTaskBrief = z.infer<typeof personTaskBriefSchema>;

export const personQueueCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  segment: z.string(),
  segmentColor: z.string(),
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
});
export type PersonQueueCardDto = z.infer<typeof personQueueCardSchema>;

export const movePersonQueueCardSchema = z.object({
  columnId: personQueueColumnSchema,
  index: z.coerce.number().int().min(0).default(0),
});
export type MovePersonQueueCardInput = z.infer<typeof movePersonQueueCardSchema>;

export const togglePersonQueuePinSchema = z.object({
  pinned: z.boolean().optional(),
});
export type TogglePersonQueuePinInput = z.infer<typeof togglePersonQueuePinSchema>;

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

export const createPersonRequestSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(8000),
  category: z.enum(['pto', 'equipment', 'exception', 'access', 'other']).default('other'),
  priority: serviceRequestPrioritySchema.default('medium'),
});
export type CreatePersonRequestInput = z.infer<typeof createPersonRequestSchema>;
