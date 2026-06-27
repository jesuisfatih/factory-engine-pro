import { z } from 'zod';
import { emailSchema } from './common.js';

export const mailDeliveryStatusSchema = z.enum(['queued', 'sending', 'sent', 'failed', 'skipped']);

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
