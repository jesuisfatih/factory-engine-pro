import { z } from 'zod';

export const commissionAssignTypeSchema = z.enum(['rep', 'team']);
export const commissionRuleTypeSchema = z.enum(['flat', 'tiered', 'segment', 'product']);
export const commissionPeriodSchema = z.enum(['monthly', 'quarterly', 'lifetime']);
export const commissionRequestStatusSchema = z.enum(['pending_admin_approval', 'approved', 'rejected']);

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

export const submitCommissionRequestSchema = z.object({
  customerId: z.string().trim().min(1),
  orderId: z.string().trim().min(1).optional(),
  productReference: z.string().trim().min(1).max(240),
  saleReference: z.string().trim().min(1).max(240),
  percent: z.coerce.number().min(0).max(100),
  note: z.string().trim().max(2000).optional(),
});
export type SubmitCommissionRequestInput = z.infer<typeof submitCommissionRequestSchema>;

export const reviewCommissionRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(2000).optional(),
});
export type ReviewCommissionRequestInput = z.infer<typeof reviewCommissionRequestSchema>;

export const commissionRequestSchema = z.object({
  id: z.string(),
  requesterMemberId: z.string(),
  requesterName: z.string(),
  requesterEmail: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  customerEmail: z.string().nullable(),
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  orderTotal: z.number().nullable(),
  productReference: z.string(),
  saleReference: z.string(),
  percent: z.number(),
  note: z.string().nullable(),
  status: commissionRequestStatusSchema,
  reviewedByMemberId: z.string().nullable(),
  reviewerName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CommissionRequestDto = z.infer<typeof commissionRequestSchema>;
