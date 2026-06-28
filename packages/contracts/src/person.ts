import { z } from 'zod';
import { serviceRequestPrioritySchema } from './operations.js';
import { workflowConditionTraceSchema, workflowWhenGroupTraceSchema } from './rules.js';

export const personQueueColumnSchema = z.enum(['unassigned', 'in_progress', 'positive', 'closed']);
export type PersonQueueColumn = z.infer<typeof personQueueColumnSchema>;

export const personTaskSourceSchema = z.enum(['manual', 'ai_transcript', 'ai_segment', 'ai_stale']);
export type PersonTaskSource = z.infer<typeof personTaskSourceSchema>;

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
