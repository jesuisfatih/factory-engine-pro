import { z } from 'zod';
import { emailSchema } from './common.js';

export const mailDeliveryStatusSchema = z.enum(['queued', 'queued_disabled', 'sending', 'sent', 'failed', 'skipped']);

export const mailProviderHealthResponseSchema = z.object({
  provider: z.literal('resend'),
  credentialRequired: z.boolean(),
  configured: z.boolean(),
  reachable: z.boolean(),
  status: z.enum(['ok', 'missing_credentials', 'invalid_credentials', 'provider_error', 'network_error']),
  source: z.enum(['tenant_config', 'env', 'none']),
  latencyMs: z.number().int().min(0).nullable(),
  checkedAt: z.string(),
  providerStatus: z.number().int().min(100).max(599).nullable(),
  domainCount: z.number().int().min(0).nullable(),
  error: z.string().nullable(),
});
export type MailProviderHealthResponse = z.infer<typeof mailProviderHealthResponseSchema>;

export const mailListQuerySchema = z.object({
  status: mailDeliveryStatusSchema.optional(),
  eventKey: z.string().trim().optional(),
  recipient: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailListQuery = z.infer<typeof mailListQuerySchema>;

export const sendTestMailSchema = z.object({
  to: emailSchema,
  subject: z.string().trim().min(1).max(160).default('Factory Engine Pro test email'),
});
export type SendTestMailInput = z.infer<typeof sendTestMailSchema>;

export const emailTemplateStatusSchema = z.enum(['draft', 'approved', 'published', 'archived']);
export type EmailTemplateStatus = z.infer<typeof emailTemplateStatusSchema>;

export const mailTemplateTypeSchema = z.enum(['transactional', 'marketing']);
export type MailTemplateType = z.infer<typeof mailTemplateTypeSchema>;

export const mailMarketingFlowStatusSchema = z.enum(['draft', 'published', 'paused', 'archived']);
export type MailMarketingFlowStatus = z.infer<typeof mailMarketingFlowStatusSchema>;

export const mailMarketingContactQuerySchema = z.object({
  search: z.string().trim().optional(),
  sendable: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailMarketingContactQuery = z.infer<typeof mailMarketingContactQuerySchema>;

export const mailTemplateQuerySchema = z.object({
  type: mailTemplateTypeSchema.optional(),
  status: emailTemplateStatusSchema.optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type MailTemplateQuery = z.infer<typeof mailTemplateQuerySchema>;

export const saveEmailTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(120).optional(),
  eventKey: z.string().trim().min(2).max(160),
  templateType: mailTemplateTypeSchema.default('transactional'),
  folderKey: z.string().trim().max(80).default('general'),
  subject: z.string().trim().min(1).max(240),
  html: z.string().min(1),
  text: z.string().trim().optional().nullable(),
  variables: z.array(z.string().trim().min(1).max(80)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SaveEmailTemplateInput = z.infer<typeof saveEmailTemplateSchema>;

export const patchEmailTemplateSchema = saveEmailTemplateSchema.partial().extend({
  status: emailTemplateStatusSchema.optional(),
});
export type PatchEmailTemplateInput = z.infer<typeof patchEmailTemplateSchema>;

export const previewEmailTemplateSchema = z.object({
  variables: z.record(z.string(), z.unknown()).default({}),
});
export type PreviewEmailTemplateInput = z.infer<typeof previewEmailTemplateSchema>;

export const mailAudienceFilterSchema = z.object({
  matchMode: z.enum(['all', 'any']).default('all'),
  conditions: z.array(z.object({
    field: z.string().trim().min(1).max(80),
    operator: z.enum(['eq', 'neq', 'contains', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte']),
    value: z.unknown(),
  })).default([]),
  segmentIds: z.array(z.string().trim().min(1)).default([]),
});
export type MailAudienceFilterInput = z.infer<typeof mailAudienceFilterSchema>;

export const saveMailAudienceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  filters: mailAudienceFilterSchema.default({ matchMode: 'all', conditions: [], segmentIds: [] }),
  isArchived: z.boolean().default(false),
});
export type SaveMailAudienceInput = z.infer<typeof saveMailAudienceSchema>;

export const patchMailAudienceSchema = saveMailAudienceSchema.partial();
export type PatchMailAudienceInput = z.infer<typeof patchMailAudienceSchema>;

export const saveMailFlowSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(120).optional(),
  triggerType: z.string().trim().min(2).max(120),
  status: mailMarketingFlowStatusSchema.default('draft'),
  graph: z.object({
    nodes: z.array(z.record(z.string(), z.unknown())).default([]),
    edges: z.array(z.record(z.string(), z.unknown())).default([]),
  }).default({ nodes: [], edges: [] }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SaveMailFlowInput = z.infer<typeof saveMailFlowSchema>;

export const patchMailFlowSchema = saveMailFlowSchema.partial();
export type PatchMailFlowInput = z.infer<typeof patchMailFlowSchema>;

export const mailMarketingSettingsSchema = z.object({
  sendingEnabled: z.literal(false).default(false),
  providerMode: z.enum(['disabled', 'resend', 'smtp']).default('disabled'),
  defaultSenderName: z.string().trim().max(120).default('Factory Engine Pro'),
  defaultSenderEmail: emailSchema.optional().nullable(),
  quietHours: z.object({
    enabled: z.boolean().default(false),
    start: z.string().trim().max(8).default('21:00'),
    end: z.string().trim().max(8).default('08:00'),
    timezone: z.string().trim().max(80).default('America/Chicago'),
  }).default({ enabled: false, start: '21:00', end: '08:00', timezone: 'America/Chicago' }),
  dailySendCap: z.coerce.number().int().min(0).max(100000).default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type MailMarketingSettingsInput = z.infer<typeof mailMarketingSettingsSchema>;

export interface EmailTemplateDto {
  id: string;
  slug: string;
  name: string;
  eventKey: string;
  templateType: MailTemplateType;
  folderKey: string;
  subject: string;
  html: string;
  text: string | null;
  status: EmailTemplateStatus;
  approvalState: string;
  variables: string[];
  metadata: Record<string, unknown>;
  versionCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateWorkspaceResponse {
  sendingEnabled: false;
  templates: EmailTemplateDto[];
  events: Array<{ eventKey: string; templateCount: number; publishedCount: number }>;
  provider: { mode: 'disabled'; message: string };
}

export interface MailMarketingOverviewResponse {
  sendingEnabled: false;
  counts: {
    contacts: number;
    sendableContacts: number;
    audiences: number;
    templates: number;
    flows: number;
    publishedFlows: number;
  };
  provider: { mode: 'disabled'; message: string };
  recentEvents: Array<{ id: string; eventType: string; status: string; createdAt: string; metadata: Record<string, unknown> }>;
}
