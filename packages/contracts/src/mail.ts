import { z } from 'zod';
import { emailSchema } from './common.js';

export const mailDeliveryStatusSchema = z.enum(['queued', 'sending', 'sent', 'failed', 'skipped']);

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
