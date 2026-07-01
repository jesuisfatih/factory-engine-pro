import { z } from 'zod';
import { emailSchema, pageQuerySchema, passwordSchema } from './common.js';
import { urgencyScoringConfigSchema } from './person.js';

export const permissionRecordSchema = z.record(z.string(), z.boolean());
export type PermissionRecord = z.infer<typeof permissionRecordSchema>;

export const createMemberRoleSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:_[a-z0-9]+|-?[a-z0-9]+)*$/),
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  permissions: permissionRecordSchema,
});
export type CreateMemberRoleInput = z.infer<typeof createMemberRoleSchema>;

export const updateMemberRoleSchema = createMemberRoleSchema.partial().omit({ slug: true });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const createMemberSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  roleIds: z.array(z.string()).min(1),
  password: passwordSchema.optional(),
  sendInvite: z.boolean().default(false),
  aircallUserId: z.string().trim().optional(),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().nullable().optional(),
  roleIds: z.array(z.string()).optional(),
  status: z.enum(['invited', 'active', 'disabled', 'archived']).optional(),
  aircallUserId: z.string().trim().nullable().optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const createCustomerUserSchema = z.object({
  customerId: z.string().optional(),
  companyName: z.string().trim().min(1),
  email: emailSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  roleIds: z.array(z.string()).default([]),
  password: passwordSchema.optional(),
  sendInvite: z.boolean().default(false),
  spendingLimitCents: z.number().int().min(0).optional(),
});
export type CreateCustomerUserInput = z.infer<typeof createCustomerUserSchema>;

export const createSubUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  roleIds: z.array(z.string()).default([]),
  password: passwordSchema.optional(),
  sendInvite: z.boolean().default(false),
  spendingLimitCents: z.number().int().min(0).optional(),
});
export type CreateSubUserInput = z.infer<typeof createSubUserSchema>;

export const tenantConfigSchema = z.object({
  workspaceName: z.string().trim().min(1).optional(),
  brandBadge: z.string().trim().min(1).max(6).optional(),
  brandLogo: z.string().trim().url().optional(),
  urgencyScoringConfig: urgencyScoringConfigSchema.optional(),
  shopifyDomain: z.string().trim().optional(),
  shopifyAdminToken: z.string().optional(),
  shopifyApiKey: z.string().optional(),
  shopifyApiSecret: z.string().optional(),
  webhookHmacKey: z.string().optional(),
  aircallApiId: z.string().optional(),
  aircallApiToken: z.string().optional(),
  aircallWebhookSecret: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  resendApiKey: z.string().optional(),
});
export type TenantConfigInput = z.infer<typeof tenantConfigSchema>;

export const createMcpTokenSchema = z.object({
  label: z.string().trim().min(2, 'Token label is required').max(80),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  canPublish: z.boolean().default(false),
  canReadAircallTranscripts: z.boolean().default(true),
});
export type CreateMcpTokenInput = z.infer<typeof createMcpTokenSchema>;

export interface McpTokenDto {
  id: string;
  label: string;
  permissions: string[];
  canPublish: boolean;
  canReadAircallTranscripts: boolean;
  status: 'active' | 'expired' | 'revoked';
  lastFour: string | null;
  createdById: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface McpTokensResponse {
  tenantId: string;
  tokens: McpTokenDto[];
}

export interface CreateMcpTokenResponse extends McpTokenDto {
  tenantId: string;
  token: string;
}

export const identityListQuerySchema = pageQuerySchema.extend({
  status: z.string().optional(),
});
export type IdentityListQuery = z.infer<typeof identityListQuerySchema>;
