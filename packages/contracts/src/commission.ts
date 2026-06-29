import { z } from 'zod';

export const commissionAssignTypeSchema = z.enum(['rep', 'team']);
export const commissionRuleTypeSchema = z.enum(['flat', 'tiered', 'segment', 'product']);
export const commissionPeriodSchema = z.enum(['monthly', 'quarterly', 'lifetime']);

export const commissionRuleSchema = z.object({
  id: z.string().min(1),
  type: commissionRuleTypeSchema,
  target: z.string().trim().default(''),
  ratePct: z.number().min(0).max(100),
  period: commissionPeriodSchema,
  priority: z.number().int().min(0),
  thresholdUsd: z.number().min(0).nullable(),
  capUsd: z.number().min(0).nullable(),
});
export type CommissionRuleDto = z.infer<typeof commissionRuleSchema>;

export const commissionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  assignType: commissionAssignTypeSchema,
  assigneeId: z.string().nullable(),
  active: z.boolean(),
  rules: z.array(commissionRuleSchema),
  updatedAt: z.string(),
});
export type CommissionProfileDto = z.infer<typeof commissionProfileSchema>;

export const upsertCommissionProfileSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(160),
  assignType: commissionAssignTypeSchema,
  assigneeId: z.string().trim().nullable().optional(),
  active: z.boolean().default(true),
  rules: z.array(commissionRuleSchema).min(1),
});
export type UpsertCommissionProfileInput = z.infer<typeof upsertCommissionProfileSchema>;
