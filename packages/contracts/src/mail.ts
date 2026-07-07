import { z } from 'zod';
import { emailSchema } from './common.js';

const mailReferenceIdSchema = z.string().trim().min(1).max(160);

export const mailDeliveryStatusSchema = z.enum(['draft', 'queued', 'queued_disabled', 'sending', 'sent', 'failed', 'skipped']);

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
  disabledReason: z.string().nullable().optional(),
  queueCounts: z.object({
    waiting: z.number().int().min(0),
    active: z.number().int().min(0),
    completed: z.number().int().min(0),
    failed: z.number().int().min(0),
    delayed: z.number().int().min(0),
    paused: z.number().int().min(0),
  }).optional(),
  dlq: z.object({
    pending: z.number().int().min(0),
    retrying: z.number().int().min(0),
    resolved: z.number().int().min(0),
    discarded: z.number().int().min(0),
  }).optional(),
  deliveryWindow: z.object({
    hours: z.number().int().min(1),
    byStatus: z.record(z.string(), z.number().int().min(0)),
    byCategory: z.record(z.string(), z.number().int().min(0)),
  }).optional(),
});
export type MailProviderHealthResponse = z.infer<typeof mailProviderHealthResponseSchema>;

export const mailListQuerySchema = z.object({
  status: mailDeliveryStatusSchema.optional(),
  eventKey: z.string().trim().optional(),
  recipient: z.string().trim().optional(),
  category: z.string().trim().optional(),
  templateId: z.string().trim().optional(),
  templateVersionId: z.string().trim().optional(),
  source: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailListQuery = z.infer<typeof mailListQuerySchema>;

export const mailDeliveryLogQuerySchema = mailListQuerySchema.extend({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(150).default(10),
  cursor: z.string().trim().optional(),
});
export type MailDeliveryLogQuery = z.infer<typeof mailDeliveryLogQuerySchema>;

export interface MailDeliveryLogResponse<TDelivery = unknown> {
  data: TDelivery[];
  meta: {
    count: number;
    pageCount: number;
    limit: number;
    nextCursor: string | null;
  };
}

export const mailProviderEventQuerySchema = z.object({
  eventType: z.string().trim().min(1).max(120).optional(),
  recipient: z.string().trim().optional(),
  deliveryId: mailReferenceIdSchema.optional(),
  providerMessageId: z.string().trim().min(1).max(240).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(150).default(10),
  cursor: z.string().trim().optional(),
});
export type MailProviderEventQuery = z.infer<typeof mailProviderEventQuerySchema>;

export interface MailProviderEventDto {
  id: string;
  provider: string;
  providerEventId: string;
  providerMessageId: string | null;
  deliveryId: string | null;
  eventType: string;
  recipientEmail: string | null;
  subject: string | null;
  occurredAt: string | null;
  receivedAt: string;
  processedAt: string | null;
  ignoredReason: string | null;
  delivery: {
    id: string;
    status: string;
    eventKey: string;
    category: string;
    recipientEmail: string;
    subject: string;
    providerMessageId: string | null;
  } | null;
  proof: {
    matchedDelivery: boolean;
    storedPayloadKeys: string[];
    storedHeaderKeys: string[];
  };
}

export type MailProviderEventLogResponse = MailDeliveryLogResponse<MailProviderEventDto>;

export const sendTestMailSchema = z.object({
  to: emailSchema,
  subject: z.string().trim().min(1).max(160).default('Factory Engine Pro test email'),
});
export type SendTestMailInput = z.infer<typeof sendTestMailSchema>;

export const mailSuppressionListQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  scope: z.enum(['global', 'category', 'campaign', 'flow', 'template']).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  campaignId: mailReferenceIdSchema.optional(),
  flowId: mailReferenceIdSchema.optional(),
  templateId: mailReferenceIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type MailSuppressionListQuery = z.infer<typeof mailSuppressionListQuerySchema>;

export const mailSuppressionScopeSchema = z.enum(['global', 'category', 'campaign', 'flow', 'template']);
export type MailSuppressionScope = z.infer<typeof mailSuppressionScopeSchema>;

export const addMailSuppressionSchema = z.object({
  email: emailSchema,
  scope: mailSuppressionScopeSchema.default('global'),
  category: z.string().trim().min(1).max(80).optional().nullable(),
  campaignId: mailReferenceIdSchema.optional().nullable(),
  flowId: mailReferenceIdSchema.optional().nullable(),
  templateId: mailReferenceIdSchema.optional().nullable(),
  reason: z.string().trim().min(1).max(120).default('manual'),
  notes: z.string().trim().max(1000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});
export type AddMailSuppressionInput = z.infer<typeof addMailSuppressionSchema>;

export const mailDlqStatusSchema = z.enum(['all', 'pending', 'retrying', 'resolved', 'discarded']);
export type MailDlqStatus = z.infer<typeof mailDlqStatusSchema>;

export const mailDlqListQuerySchema = z.object({
  status: mailDlqStatusSchema.default('pending'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type MailDlqListQuery = z.infer<typeof mailDlqListQuerySchema>;

export const mailProviderModeSchema = z.enum(['disabled', 'test', 'live']);
export type MailProviderMode = z.infer<typeof mailProviderModeSchema>;

const mailStringBoolMapSchema = z.record(z.string(), z.boolean());
const DEFAULT_SYSTEM_MAIL_SUBCATEGORIES = {
  'identity.member_invitation': true,
  'identity.customer_invitation': true,
  'identity.password_reset': true,
  'b2b_access.approved': true,
  'orders.order_confirmation.user': true,
  'orders.order_shipped.user': true,
};
const DEFAULT_B2B_MAIL_SUBCATEGORIES = {
  'b2b.application_received.internal': true,
  'b2b.application_received.user': true,
  'b2b.application_approved.user': true,
  'b2b.application_rejected.user': true,
  'b2b.invoice_delivered.user': true,
  'b2b.custom_pricing_changed.user': true,
};
const DEFAULT_MARKETING_MAIL_TYPES = {
  campaigns: true,
  flows: true,
  drips: true,
  transactionalMarketing: true,
};

export const mailCenterSystemSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  subcategories: mailStringBoolMapSchema.default(DEFAULT_SYSTEM_MAIL_SUBCATEGORIES),
  branding: z.object({
    fromName: z.string().trim().max(120).optional(),
    fromEmail: emailSchema.optional(),
    replyTo: emailSchema.optional(),
  }).default({}),
  retry: z.object({
    attempts: z.coerce.number().int().min(1).max(10).default(3),
    backoffStrategy: z.enum(['exponential', 'linear']).default('exponential'),
  }).default({ attempts: 3, backoffStrategy: 'exponential' }),
  logRetentionDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(365)]).default(90),
  slaPriority: z.enum(['normal', 'high']).default('normal'),
  locale: z.string().trim().max(20).default('en'),
});
export type MailCenterSystemSettings = z.infer<typeof mailCenterSystemSettingsSchema>;

export const mailCenterB2bSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  subcategories: mailStringBoolMapSchema.default(DEFAULT_B2B_MAIL_SUBCATEGORIES),
  internalRecipients: z.array(emailSchema).default([]),
  escalation: z.object({
    hoursBeforeEscalate: z.coerce.number().int().min(1).max(720).default(24),
    escalateTo: z.array(emailSchema).default([]),
  }).optional(),
});
export type MailCenterB2bSettings = z.infer<typeof mailCenterB2bSettingsSchema>;

export const mailCenterMarketingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  types: mailStringBoolMapSchema.default(DEFAULT_MARKETING_MAIL_TYPES),
  quietHours: z.object({
    startHHMM: z.string().trim().regex(/^\d{2}:\d{2}$/).default('22:00'),
    endHHMM: z.string().trim().regex(/^\d{2}:\d{2}$/).default('08:00'),
    timezone: z.string().trim().max(80).default('America/Chicago'),
  }).default({ startHHMM: '22:00', endHHMM: '08:00', timezone: 'America/Chicago' }),
  frequencyCaps: z.object({
    perDay: z.coerce.number().int().min(0).max(100).default(2),
    perWeek: z.coerce.number().int().min(0).max(500).default(7),
    per30Days: z.coerce.number().int().min(0).max(2000).default(20),
  }).default({ perDay: 2, perWeek: 7, per30Days: 20 }),
  consentMode: z.enum(['single', 'double']).default('double'),
  compliance: z.object({
    unsubscribeFooter: z.literal(true).default(true),
    physicalAddressFooter: z.literal(true).default(true),
    preferenceCenterUrl: z.string().trim().url().optional(),
  }).default({ unsubscribeFooter: true, physicalAddressFooter: true }),
  suppressionRules: z.object({
    bounceThreshold: z.coerce.number().int().min(1).max(20).default(2),
    complaintAction: z.literal('instant-suppress').default('instant-suppress'),
    hardBounceAction: z.literal('instant-suppress').default('instant-suppress'),
  }).default({ bounceThreshold: 2, complaintAction: 'instant-suppress', hardBounceAction: 'instant-suppress' }),
  senderDomain: z.string().trim().max(120).optional(),
  analytics: z.object({
    openTracking: z.boolean().default(false),
    clickTracking: z.boolean().default(false),
    utmAutoTagging: z.boolean().default(false),
  }).default({ openTracking: false, clickTracking: false, utmAutoTagging: false }),
});
export type MailCenterMarketingSettings = z.infer<typeof mailCenterMarketingSettingsSchema>;

export const DEFAULT_MAIL_CENTER_SYSTEM_SETTINGS: MailCenterSystemSettings = {
  enabled: true,
  subcategories: DEFAULT_SYSTEM_MAIL_SUBCATEGORIES,
  branding: {},
  retry: { attempts: 3, backoffStrategy: 'exponential' },
  logRetentionDays: 90,
  slaPriority: 'normal',
  locale: 'en',
};

export const DEFAULT_MAIL_CENTER_B2B_SETTINGS: MailCenterB2bSettings = {
  enabled: true,
  subcategories: DEFAULT_B2B_MAIL_SUBCATEGORIES,
  internalRecipients: [],
};

export const DEFAULT_MAIL_CENTER_MARKETING_SETTINGS: MailCenterMarketingSettings = {
  enabled: true,
  types: DEFAULT_MARKETING_MAIL_TYPES,
  quietHours: { startHHMM: '22:00', endHHMM: '08:00', timezone: 'America/Chicago' },
  frequencyCaps: { perDay: 2, perWeek: 7, per30Days: 20 },
  consentMode: 'double',
  compliance: { unsubscribeFooter: true, physicalAddressFooter: true },
  suppressionRules: { bounceThreshold: 2, complaintAction: 'instant-suppress', hardBounceAction: 'instant-suppress' },
  analytics: { openTracking: false, clickTracking: false, utmAutoTagging: false },
};

export const mailCenterSettingsSchema = z.object({
  providerMode: mailProviderModeSchema.default('disabled'),
  categorySystem: mailCenterSystemSettingsSchema.default(DEFAULT_MAIL_CENTER_SYSTEM_SETTINGS),
  categoryB2b: mailCenterB2bSettingsSchema.default(DEFAULT_MAIL_CENTER_B2B_SETTINGS),
  categoryMarketing: mailCenterMarketingSettingsSchema.default(DEFAULT_MAIL_CENTER_MARKETING_SETTINGS),
});
export type MailCenterSettings = z.infer<typeof mailCenterSettingsSchema>;

export const patchMailCenterSettingsSchema = z.object({
  providerMode: mailProviderModeSchema.optional(),
  categorySystem: mailCenterSystemSettingsSchema.partial().optional(),
  categoryB2b: mailCenterB2bSettingsSchema.partial().optional(),
  categoryMarketing: mailCenterMarketingSettingsSchema.partial().optional(),
});
export type PatchMailCenterSettingsInput = z.infer<typeof patchMailCenterSettingsSchema>;

export const resetMailCenterSettingsSchema = z.object({
  confirm: z.literal('RESET'),
});
export type ResetMailCenterSettingsInput = z.infer<typeof resetMailCenterSettingsSchema>;

export const mailSettingsAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailSettingsAuditQuery = z.infer<typeof mailSettingsAuditQuerySchema>;

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

export const mailConsentStateSchema = z.enum(['subscribed', 'unsubscribed', 'unknown']);
export type MailConsentState = z.infer<typeof mailConsentStateSchema>;

export const upsertMailContactConsentSchema = z.object({
  state: mailConsentStateSchema,
  channel: z.string().trim().min(1).max(40).default('email'),
  category: z.string().trim().min(1).max(80).default('marketing'),
  source: z.string().trim().min(1).max(120).default('admin-ui'),
  sourceDetail: z.string().trim().max(240).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type UpsertMailContactConsentInput = z.infer<typeof upsertMailContactConsentSchema>;

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
  description: z.string().trim().max(500).optional().nullable(),
  eventKey: z.string().trim().min(2).max(160),
  templateType: mailTemplateTypeSchema.default('transactional'),
  folderKey: z.string().trim().max(80).default('general'),
  subject: z.string().trim().min(1).max(240),
  previewText: z.string().trim().max(240).optional().nullable(),
  html: z.string().min(1),
  css: z.string().optional().nullable(),
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

export const updateEmailTemplateRevisionSourceSchema = z.object({
  subject: z.string().trim().min(1).max(240).optional(),
  previewText: z.string().trim().max(240).optional().nullable(),
  html: z.string().min(1).optional(),
  css: z.string().optional().nullable(),
  text: z.string().trim().optional().nullable(),
  variables: z.array(z.string().trim().min(1).max(80)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateEmailTemplateRevisionSourceInput = z.infer<typeof updateEmailTemplateRevisionSourceSchema>;

export const emailTemplateAiEditModeSchema = z.enum([
  'rewrite_all',
  'html_css_only',
  'subject_variants',
  'template_critique',
]);
export type EmailTemplateAiEditMode = z.infer<typeof emailTemplateAiEditModeSchema>;

export const proposeEmailTemplateAiEditSchema = z.object({
  mode: emailTemplateAiEditModeSchema.default('rewrite_all'),
  instruction: z.string().trim().min(8).max(4000),
  audience: z.string().trim().max(500).optional().nullable(),
  brandVoice: z.string().trim().max(500).optional().nullable(),
});
export type ProposeEmailTemplateAiEditInput = z.infer<typeof proposeEmailTemplateAiEditSchema>;

export const activateEmailTemplateSchema = z.object({
  variantId: z.string().trim().min(1),
  revisionId: z.string().trim().min(1).optional(),
});
export type ActivateEmailTemplateInput = z.infer<typeof activateEmailTemplateSchema>;

export const approveEmailTemplateRevisionSchema = z.object({
  comment: z.string().trim().max(1000).optional().nullable(),
});
export type ApproveEmailTemplateRevisionInput = z.infer<typeof approveEmailTemplateRevisionSchema>;

export const testEmailTemplateRevisionSchema = z.object({
  to: emailSchema,
  variables: z.record(z.string(), z.unknown()).default({}),
});
export type TestEmailTemplateRevisionInput = z.infer<typeof testEmailTemplateRevisionSchema>;

export const mailTemplatePreviewProfileQuerySchema = z.object({
  templateId: z.string().trim().min(1).optional(),
  eventKey: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailTemplatePreviewProfileQuery = z.infer<typeof mailTemplatePreviewProfileQuerySchema>;

const mailTemplatePreviewProfileBaseSchema = z.object({
  templateId: z.string().trim().min(1).optional().nullable(),
  eventKey: z.string().trim().min(1).max(160).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  variables: z.record(z.string(), z.unknown()).default({}),
  isDefault: z.boolean().default(false),
});

export const saveMailTemplatePreviewProfileSchema = mailTemplatePreviewProfileBaseSchema.refine((value) => Boolean(value.templateId || value.eventKey), {
  message: 'templateId or eventKey is required',
  path: ['templateId'],
});
export type SaveMailTemplatePreviewProfileInput = z.infer<typeof saveMailTemplatePreviewProfileSchema>;

export const patchMailTemplatePreviewProfileSchema = mailTemplatePreviewProfileBaseSchema.partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })
  .refine((value) => value.templateId !== null || value.eventKey !== null, {
    message: 'templateId and eventKey cannot both be null',
    path: ['templateId'],
  });
export type PatchMailTemplatePreviewProfileInput = z.infer<typeof patchMailTemplatePreviewProfileSchema>;

export const mailTemplateSnippetQuerySchema = z.object({
  templateType: z.string().trim().min(1).optional(),
  includeArchived: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailTemplateSnippetQuery = z.infer<typeof mailTemplateSnippetQuerySchema>;

const mailTemplateSnippetBaseSchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9_.-]+$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  templateType: z.string().trim().min(1).max(80).optional().nullable(),
  subject: z.string().trim().max(240).optional().nullable(),
  html: z.string().max(20000).optional().nullable(),
  css: z.string().max(20000).optional().nullable(),
  text: z.string().max(20000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  isArchived: z.boolean().default(false),
});

export const saveMailTemplateSnippetSchema = mailTemplateSnippetBaseSchema.refine((value) => Boolean(value.subject || value.html || value.text), {
  message: 'subject, html, or text content is required',
  path: ['html'],
});
export type SaveMailTemplateSnippetInput = z.infer<typeof saveMailTemplateSnippetSchema>;

export const patchMailTemplateSnippetSchema = mailTemplateSnippetBaseSchema.partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type PatchMailTemplateSnippetInput = z.infer<typeof patchMailTemplateSnippetSchema>;

export const mailTemplateBlockQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  includeArchived: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailTemplateBlockQuery = z.infer<typeof mailTemplateBlockQuerySchema>;

const mailTemplateBlockBaseSchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9_.-]+$/),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(1).max(80).default('general'),
  description: z.string().trim().max(500).optional().nullable(),
  html: z.string().min(1).max(20000),
  css: z.string().max(20000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  isArchived: z.boolean().default(false),
});

export const saveMailTemplateBlockSchema = mailTemplateBlockBaseSchema;
export type SaveMailTemplateBlockInput = z.infer<typeof saveMailTemplateBlockSchema>;

export const patchMailTemplateBlockSchema = mailTemplateBlockBaseSchema.partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type PatchMailTemplateBlockInput = z.infer<typeof patchMailTemplateBlockSchema>;

const mailAudienceStringArraySchema = z.array(z.string().trim().min(1).max(180)).default([]);

export const mailAudienceFilterSchema = z.object({
  matchMode: z.enum(['all', 'any']).default('all'),
  conditions: z.array(z.object({
    field: z.string().trim().min(1).max(80),
    operator: z.enum(['eq', 'neq', 'contains', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte']),
    value: z.unknown(),
  })).default([]),
  segmentIds: mailAudienceStringArraySchema,
  localSegmentIds: mailAudienceStringArraySchema,
  shopifySegmentIds: mailAudienceStringArraySchema,
  manualListIds: mailAudienceStringArraySchema,
  emails: z.array(z.string().trim().email().max(254)).default([]),
  tags: mailAudienceStringArraySchema,
  lifecycleStages: mailAudienceStringArraySchema,
  customerOwnerMemberIds: mailAudienceStringArraySchema,
  assignmentAxes: mailAudienceStringArraySchema,
  productSkus: mailAudienceStringArraySchema,
  productNames: mailAudienceStringArraySchema,
  productFamilies: mailAudienceStringArraySchema,
  productQuery: z.string().trim().max(180).optional().nullable(),
  orderCountMin: z.coerce.number().int().min(0).optional().nullable(),
  orderCountMax: z.coerce.number().int().min(0).optional().nullable(),
  totalSpentMin: z.coerce.number().min(0).optional().nullable(),
  totalSpentMax: z.coerce.number().min(0).optional().nullable(),
  lastOrderAfter: z.string().datetime().optional().nullable(),
  lastOrderBefore: z.string().datetime().optional().nullable(),
  includeSuppressed: z.boolean().default(false),
  includeUnknownConsent: z.boolean().default(true),
});
export type MailAudienceFilterInput = z.infer<typeof mailAudienceFilterSchema>;

export const saveMailAudienceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  filters: mailAudienceFilterSchema.default(() => mailAudienceFilterSchema.parse({})),
  isArchived: z.boolean().default(false),
});
export type SaveMailAudienceInput = z.infer<typeof saveMailAudienceSchema>;

export const patchMailAudienceSchema = saveMailAudienceSchema.partial();
export type PatchMailAudienceInput = z.infer<typeof patchMailAudienceSchema>;

export const createMailAudienceSnapshotSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
});
export type CreateMailAudienceSnapshotInput = z.infer<typeof createMailAudienceSnapshotSchema>;

export const mailAudienceSnapshotQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
});
export type MailAudienceSnapshotQuery = z.infer<typeof mailAudienceSnapshotQuerySchema>;

export const mailAudienceSnapshotMemberQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailAudienceSnapshotMemberQuery = z.infer<typeof mailAudienceSnapshotMemberQuerySchema>;

export const mailCampaignStatusSchema = z.enum([
  'draft',
  'needs_approval',
  'approved',
  'scheduled',
  'sending',
  'queued_disabled',
  'sent',
  'completed',
  'paused',
  'canceled',
  'archived',
]);
export type MailCampaignStatus = z.infer<typeof mailCampaignStatusSchema>;

export const saveMailCampaignSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  audienceId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  templateVersionId: z.string().trim().min(1).optional().nullable(),
  subjectOverride: z.string().trim().min(1).max(200).optional().nullable(),
  senderName: z.string().trim().min(1).max(120).optional().nullable(),
  replyTo: emailSchema.optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SaveMailCampaignInput = z.infer<typeof saveMailCampaignSchema>;

export const mailCampaignQuerySchema = z.object({
  status: mailCampaignStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailCampaignQuery = z.infer<typeof mailCampaignQuerySchema>;

export interface MailMemberPreviewDto {
  id: string;
  name: string;
  email: string;
}

export interface MailCampaignDto {
  id: string;
  name: string;
  description: string | null;
  status: MailCampaignStatus;
  audienceId: string | null;
  snapshotId: string | null;
  templateId: string | null;
  templateVersionId: string | null;
  subjectOverride: string | null;
  senderName: string | null;
  replyTo: string | null;
  scheduledAt: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  pausedAt: string | null;
  approvedAt: string | null;
  createdByMemberId: string | null;
  approvedByMemberId: string | null;
  createdByMember: MailMemberPreviewDto | null;
  approvedByMember: MailMemberPreviewDto | null;
  completedAt: string | null;
  recipientCount: number;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  suppressedCount: number;
  metadata: Record<string, unknown>;
  audience: { id: string; name: string } | null;
  snapshot: { id: string; name: string; memberCount: number; reachableCount: number; sourceSummary?: Record<string, unknown> } | null;
  template: { id: string; name: string; subject: string } | null;
  templateVersion: { id: string; versionNumber: number; subject: string; status: string; approvalState: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const mailMarketingAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  campaignId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  audienceId: z.string().trim().min(1).optional(),
  flowId: z.string().trim().min(1).optional(),
});
export type MailMarketingAnalyticsQuery = z.infer<typeof mailMarketingAnalyticsQuerySchema>;

export interface MailMarketingAnalyticsBreakdownRow {
  key: string;
  label: string;
  count: number;
}

export interface MailMarketingAnalyticsSeriesRow {
  date: string;
  queuedDisabled: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  providerEvents: number;
  deliveredEvents: number;
  openedEvents: number;
  clickedEvents: number;
  bouncedEvents: number;
  complainedEvents: number;
  activeSuppressions: number;
  conservativeOrders: number;
  conservativeRevenue: number;
}

export interface MailMarketingAnalyticsDimensionRow {
  id: string;
  name: string;
  status?: string | null;
  type?: string | null;
  deliveryCount: number;
  queuedDisabled: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  suppressedCount: number;
  snapshotCount?: number;
  reachableCount?: number;
  flowActionCount?: number;
  conservativeOrders: number;
  conservativeRevenue: number;
  lastActivityAt: string | null;
  notes: string[];
}

export interface MailMarketingAnalyticsDimensionResponse {
  range: { start: string; end: string; days: number };
  total: number;
  rows: MailMarketingAnalyticsDimensionRow[];
  proofNotes: string[];
}

export interface MailMarketingAnalyticsFunnelStage {
  key: string;
  label: string;
  count: number;
  previousCount: number | null;
  conversionRate: number | null;
  blockerCount: number;
  note: string;
}

export interface MailMarketingAnalyticsFunnelResponse {
  range: { start: string; end: string; days: number };
  attributionMode: 'customer_id_only_order_after_delivery';
  stages: MailMarketingAnalyticsFunnelStage[];
  proofNotes: string[];
}

export interface MailMarketingAnalyticsCohortRow {
  cohortKey: string;
  label: string;
  customerCount: number;
  orderCount: number;
  revenue: number;
  deliveryProofCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  notes: string[];
}

export interface MailMarketingAnalyticsCohortResponse {
  range: { start: string; end: string; days: number };
  attributionMode: 'customer_id_only_order_after_delivery';
  total: number;
  rows: MailMarketingAnalyticsCohortRow[];
  proofNotes: string[];
}

export interface MailMarketingAnalyticsOverviewResponse extends MailMarketingAnalyticsDimensionResponse {
  providerMode: MailProviderMode;
  attributionMode: 'customer_id_only_order_after_delivery';
  totals: {
    deliveries: number;
    queuedDisabled: number;
    queued: number;
    sent: number;
    failed: number;
    skipped: number;
    activeSuppressions: number;
    campaigns: number;
    audiences: number;
    snapshots: number;
    flows: number;
    flowActions: number;
    providerEvents: number;
    deliveredEvents: number;
    openedEvents: number;
    clickedEvents: number;
    bouncedEvents: number;
    complainedEvents: number;
    conservativeOrders: number;
    conservativeRevenue: number;
  };
  statusBreakdown: MailMarketingAnalyticsBreakdownRow[];
  categoryBreakdown: MailMarketingAnalyticsBreakdownRow[];
  daily: MailMarketingAnalyticsSeriesRow[];
  topCampaigns: MailMarketingAnalyticsDimensionRow[];
  topTemplates: MailMarketingAnalyticsDimensionRow[];
  topAudiences: MailMarketingAnalyticsDimensionRow[];
  topFlows: MailMarketingAnalyticsDimensionRow[];
}

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

export const triggerMailFlowEventSchema = z.object({
  triggerType: z.string().trim().min(2).max(120),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type TriggerMailFlowEventInput = z.infer<typeof triggerMailFlowEventSchema>;

export const mailFlowVersionSelectorSchema = z.enum(['latest', 'active']);
export type MailFlowVersionSelector = z.infer<typeof mailFlowVersionSelectorSchema>;

export const validateMailFlowSchema = z.object({
  version: mailFlowVersionSelectorSchema.default('latest'),
}).default({ version: 'latest' });
export type ValidateMailFlowInput = z.infer<typeof validateMailFlowSchema>;

export const simulateMailFlowSchema = z.object({
  version: mailFlowVersionSelectorSchema.default('latest'),
  triggerType: z.string().trim().min(2).max(120).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  target: z.object({
    contactId: z.string().trim().min(1).optional().nullable(),
    customerId: z.string().trim().min(1).optional().nullable(),
    email: emailSchema.optional().nullable(),
  }).default({}),
}).default({ version: 'latest', payload: {}, target: {} });
export type SimulateMailFlowInput = z.infer<typeof simulateMailFlowSchema>;

export const mailFlowWebhookDestinationStatusSchema = z.enum(['disabled', 'active']);
export type MailFlowWebhookDestinationStatus = z.infer<typeof mailFlowWebhookDestinationStatusSchema>;

export const mailFlowWebhookAuthTypeSchema = z.enum(['none', 'header']);
export type MailFlowWebhookAuthType = z.infer<typeof mailFlowWebhookAuthTypeSchema>;

export const mailFlowWebhookExecutionModeSchema = z.enum(['proof_only', 'live_requested']);
export type MailFlowWebhookExecutionMode = z.infer<typeof mailFlowWebhookExecutionModeSchema>;

export const saveMailFlowWebhookDestinationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(120).optional(),
  url: z.string().trim().url().max(2000),
  status: mailFlowWebhookDestinationStatusSchema.default('disabled'),
  authType: mailFlowWebhookAuthTypeSchema.default('none'),
  executionMode: mailFlowWebhookExecutionModeSchema.default('proof_only'),
  secretHeaderName: z.string().trim().min(2).max(120).optional().nullable(),
  secretValue: z.string().trim().min(1).max(4000).optional().nullable(),
  clearSecret: z.boolean().default(false),
  timeoutMs: z.coerce.number().int().min(1000).max(10000).default(5000),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SaveMailFlowWebhookDestinationInput = z.infer<typeof saveMailFlowWebhookDestinationSchema>;

export const patchMailFlowWebhookDestinationSchema = saveMailFlowWebhookDestinationSchema.partial();
export type PatchMailFlowWebhookDestinationInput = z.infer<typeof patchMailFlowWebhookDestinationSchema>;

export const approveMailFlowWebhookDestinationSchema = z.object({
  allowlistedUrl: z.string().trim().url().max(2000),
});
export type ApproveMailFlowWebhookDestinationInput = z.infer<typeof approveMailFlowWebhookDestinationSchema>;

export interface MailFlowWebhookDestinationDto {
  id: string;
  name: string;
  slug: string;
  url: string;
  status: MailFlowWebhookDestinationStatus;
  authType: MailFlowWebhookAuthType;
  executionMode: MailFlowWebhookExecutionMode;
  secretHeaderName: string | null;
  hasSecret: boolean;
  timeoutMs: number;
  liveApproved: boolean;
  liveApprovedAt: string | null;
  liveApprovedByMemberId: string | null;
  liveAllowlistedUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const mailMarketingSettingsSchema = z.object({
  sendingEnabled: z.literal(false).default(false),
  providerMode: mailProviderModeSchema.default('disabled'),
  defaultSenderName: z.string().trim().max(120).default('Factory Engine Pro'),
  defaultSenderEmail: emailSchema.optional().nullable(),
  quietHours: z.object({
    enabled: z.boolean().default(false),
    start: z.string().trim().max(8).default('21:00'),
    end: z.string().trim().max(8).default('08:00'),
    timezone: z.string().trim().max(80).default('America/Chicago'),
  }).default({ enabled: false, start: '21:00', end: '08:00', timezone: 'America/Chicago' }),
  dailySendCap: z.coerce.number().int().min(0).max(100000).default(0),
  approvalPolicy: z.object({
    maxReachableRecipients: z.coerce.number().int().min(1).max(100000).default(1000),
    maxSnapshotMembers: z.coerce.number().int().min(1).max(100000).default(1500),
    maxEstimatedAudienceSpendUsd: z.coerce.number().min(0).max(100000000).default(0),
  }).default({
    maxReachableRecipients: 1000,
    maxSnapshotMembers: 1500,
    maxEstimatedAudienceSpendUsd: 0,
  }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type MailMarketingSettingsInput = z.infer<typeof mailMarketingSettingsSchema>;

export interface EmailTemplateDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  eventKey: string;
  templateType: MailTemplateType;
  folderKey: string;
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  status: EmailTemplateStatus;
  approvalState: string;
  variables: string[];
  metadata: Record<string, unknown>;
  isArchived: boolean;
  publishedVersionId: string | null;
  versionCount: number;
  activeBinding: {
    id: string;
    eventKey: string;
    templateVersionId: string;
    isEnabled: boolean;
  } | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateWorkspaceResponse {
  sendingEnabled: false;
  templates: EmailTemplateDto[];
  events: Array<{
    eventKey: string;
    templateCount: number;
    publishedCount: number;
    title?: string;
    description?: string;
    folderKey?: string;
    variables?: string[];
    sampleVariables?: Record<string, unknown>;
  }>;
  provider: { mode: MailProviderMode; message: string };
}

export interface EmailTemplateAiEditProposalResponse {
  revisionId: string;
  templateId: string;
  mode: EmailTemplateAiEditMode;
  provider: 'anthropic';
  model: string;
  promptKey: 'mail.template.proposal';
  applied: false;
  generatedAt: string;
  draft: {
    subject: string;
    previewText: string | null;
    html: string;
    css: string | null;
    text: string | null;
    variables: string[];
  };
  summary: string;
  warnings: string[];
  changedFields: string[];
  validation: {
    tokenKeys: string[];
    unknownTokens: string[];
    warnings: string[];
    blockingIssues: string[];
  };
}

export interface MailTemplatePreviewProfileDto {
  id: string;
  templateId: string | null;
  eventKey: string | null;
  name: string;
  description: string | null;
  variables: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailTemplateSnippetDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  templateType: string | null;
  subject: string | null;
  html: string | null;
  css: string | null;
  text: string | null;
  metadata: Record<string, unknown>;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailTemplateBlockDto {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  html: string;
  css: string | null;
  metadata: Record<string, unknown>;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailMarketingOverviewResponse {
  sendingEnabled: false;
  counts: {
    contacts: number;
    sendableContacts: number;
    audiences: number;
    campaigns: number;
    templates: number;
    flows: number;
    publishedFlows: number;
  };
  provider: { mode: MailProviderMode; message: string };
  recentEvents: Array<{ id: string; eventType: string; status: string; createdAt: string; metadata: Record<string, unknown> }>;
}

export interface MailAudienceDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  contactCount: number;
  isArchived: boolean;
  lastCalculatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailContactDto {
  id: string;
  customerId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  tags: string[];
  buyerIntent: string | null;
  lifecycleStage: string | null;
  isSendable: boolean;
  consentState: string;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailContactIdentityDto {
  type: 'mail_contact' | 'customer' | 'customer_user' | 'shopify_customer' | 'email' | 'phone';
  label: string;
  value: string;
  source: string;
}

export interface MailContactConsentHistoryDto {
  id: string;
  channel: string;
  category: string;
  state: string;
  source: string;
  sourceDetail: string | null;
  capturedAt: string;
  updatedAt: string;
}

export interface MailContactSuppressionHistoryDto {
  id: string;
  channel: string;
  scope: MailSuppressionScope;
  category: string | null;
  campaignId: string | null;
  flowId: string | null;
  templateId: string | null;
  isActive: boolean;
  reason: string;
  source: string;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailContactAudienceMembershipDto {
  id: string;
  snapshotId: string;
  snapshotName: string;
  audienceId: string | null;
  audienceName: string | null;
  consentState: string;
  suppressionReason: string | null;
  isSendable: boolean;
  createdAt: string;
}

export interface MailContactRecentDeliveryDto {
  id: string;
  eventKey: string;
  category: string;
  templateId: string | null;
  templateVersionId: string | null;
  recipientEmail: string;
  subject: string;
  status: string;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface MailContactRecentEventDto {
  id: string;
  eventType: string;
  status: string;
  source: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface MailContactFlowActivityDto {
  id: string;
  flowId: string;
  flowName: string;
  status: string;
  nodeKey: string | null;
  message: string | null;
  createdAt: string;
}

export interface MailContactCustomerSummaryDto {
  id: string;
  shopifyCustomerId: string | null;
  companyName: string;
  email: string | null;
  phone: string | null;
  totalSpent: string;
  ordersCount: number;
  lastOrderAt: string | null;
}

export interface MailContactDetailDto {
  contact: MailContactDto;
  customer: MailContactCustomerSummaryDto | null;
  identities: MailContactIdentityDto[];
  consentHistory: MailContactConsentHistoryDto[];
  suppressionHistory: MailContactSuppressionHistoryDto[];
  audienceMemberships: MailContactAudienceMembershipDto[];
  recentDeliveries: MailContactRecentDeliveryDto[];
  recentEvents: MailContactRecentEventDto[];
  flowActivity: MailContactFlowActivityDto[];
}

export interface MailAudiencePreviewResponse {
  matchedContacts: number;
  sample: MailContactDto[];
  sourceSummary?: Record<string, unknown>;
  sendingEnabled: false;
}

export interface MailAudienceSnapshotDto {
  id: string;
  audienceId: string | null;
  name: string;
  summary: Record<string, unknown>;
  sourceSummary: Record<string, unknown>;
  memberCount: number;
  reachableCount: number;
  createdAt: string;
  updatedAt: string;
  storedMembers: number;
}

export interface MailAudienceSnapshotMemberDto {
  id: string;
  snapshotId: string;
  contactId: string;
  customerId: string | null;
  email: string;
  consentState: string;
  suppressionReason: string | null;
  isSendable: boolean;
  buyerIntent: string | null;
  lastActivityAt: string | null;
  name: string | null;
  contactDetailAvailable: boolean;
  contactDetailPath: string | null;
}

export interface MailAudienceSnapshotMembersResponse {
  snapshot: MailAudienceSnapshotDto;
  members: MailAudienceSnapshotMemberDto[];
  totalReturned: number;
  sendingEnabled: false;
}

export interface MailAudienceSnapshotDiffResponse {
  snapshot: MailAudienceSnapshotDto;
  current: {
    matchedContacts: number;
    reachableCount: number;
  };
  diff: {
    added: number;
    removed: number;
    stayed: number;
    driftDetected: boolean;
  };
  samples: {
    added: MailContactDto[];
    removed: MailAudienceSnapshotMemberDto[];
  };
  sendingEnabled: false;
}

export interface MailFlowNodeDto {
  id: string;
  nodeKey: string;
  nodeType: string;
  label: string;
  description: string | null;
  nextNodeKey: string | null;
  routes: unknown[];
  config: Record<string, unknown>;
  sortOrder: number;
  positionX: number;
  positionY: number;
}

export interface MailFlowVersionDto {
  id: string;
  versionNumber: number;
  status: string;
  triggerType: string;
  summary: Record<string, unknown>;
  nodeCount: number;
  nodes: MailFlowNodeDto[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailFlowRunSummaryDto {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
  enrollments: number;
  completedEnrollments: number;
  failedEnrollments: number;
}

export interface MailMarketingFlowDto {
  id: string;
  slug: string;
  name: string;
  triggerType: string;
  status: string;
  graph: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sendingEnabled: false;
  activeVersion: MailFlowVersionDto | null;
  latestVersion: MailFlowVersionDto | null;
  nodeCount: number;
  versionCount: number;
  runCount: number;
  eventCount: number;
  runSummary: MailFlowRunSummaryDto;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailFlowRunDto {
  id: string;
  status: string;
  triggerType: string;
  triggerEventType: string | null;
  enrollmentCount: number;
  completedCount: number;
  failedCount: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  enrollments: Array<{
    id: string;
    status: string;
    email: string | null;
    currentNodeKey: string | null;
    lastError: string | null;
    nextRunAt: string | null;
    createdAt: string;
  }>;
}

export interface MailFlowRunsResponse {
  flowId: string;
  total: number;
  sendingEnabled: false;
  runs: MailFlowRunDto[];
}

export interface MailFlowEventDto {
  id: string;
  actionType: string;
  status: string;
  nodeKey: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  enrollmentId: string | null;
  runId: string | null;
}

export interface MailFlowEventsResponse {
  flowId: string;
  total: number;
  sendingEnabled: false;
  events: MailFlowEventDto[];
}

export interface MailFlowValidationResponse {
  flowId: string;
  flowName: string;
  versionSelector: MailFlowVersionSelector;
  versionId: string | null;
  versionNumber: number | null;
  triggerType: string;
  providerMode: MailProviderMode;
  sendingEnabled: false;
  valid: boolean;
  publishable: boolean;
  issues: string[];
  warnings: string[];
  summary: {
    nodeCount: number;
    actionCount: number;
    triggerCount: number;
    sendEmailNodes: number;
    delayNodes: number;
    conditionNodes: number;
  };
  checkedAt: string;
}

export interface MailFlowSimulationStepDto {
  nodeKey: string;
  nodeType: string;
  label: string;
  outcome: string;
  message: string;
}

export interface MailFlowSimulationResponse {
  flowId: string;
  flowName: string;
  versionSelector: MailFlowVersionSelector;
  versionId: string | null;
  versionNumber: number | null;
  triggerType: string;
  providerMode: MailProviderMode;
  sendingEnabled: false;
  mode: 'proof_only';
  valid: boolean;
  blocked: boolean;
  target: {
    contactId: string | null;
    customerId: string | null;
    email: string | null;
  };
  payloadKeys: string[];
  issues: string[];
  warnings: string[];
  steps: MailFlowSimulationStepDto[];
  checkedAt: string;
}
