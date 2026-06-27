import { z } from 'zod';
import { serviceRequestPrioritySchema } from './operations.js';

export const personQueueColumnSchema = z.enum(['unassigned', 'in_progress', 'positive', 'closed']);
export type PersonQueueColumn = z.infer<typeof personQueueColumnSchema>;

export const personTaskSourceSchema = z.enum(['manual', 'ai_transcript', 'ai_segment', 'ai_stale']);
export type PersonTaskSource = z.infer<typeof personTaskSourceSchema>;

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
