import { z } from 'zod';

export const accountAddressTypeSchema = z.enum(['shipping', 'billing']);
export type AccountAddressType = z.infer<typeof accountAddressTypeSchema>;

export const accountAddressSchema = z.object({
  id: z.string().trim().min(1),
  type: accountAddressTypeSchema,
  firstName: z.string().trim().optional().default(''),
  lastName: z.string().trim().optional().default(''),
  company: z.string().trim().optional().default(''),
  address1: z.string().trim().min(1),
  address2: z.string().trim().optional().default(''),
  city: z.string().trim().optional().default(''),
  province: z.string().trim().optional().default(''),
  zip: z.string().trim().optional().default(''),
  country: z.string().trim().optional().default('US'),
  phone: z.string().trim().optional().default(''),
  isDefault: z.boolean().default(true),
});
export type AccountAddressInput = z.infer<typeof accountAddressSchema>;

export const updateAccountProfileSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
});
export type UpdateAccountProfileInput = z.infer<typeof updateAccountProfileSchema>;

export const updateAccountPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
export type UpdateAccountPasswordInput = z.infer<typeof updateAccountPasswordSchema>;

export const createAccountSupportTicketSchema = z.object({
  subject: z.string().trim().min(2).max(240),
  description: z.string().trim().min(1).max(8000),
  category: z.enum(['billing', 'shipping', 'product', 'account', 'other']).default('other'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  relatedTo: z.string().trim().max(240).optional(),
});
export type CreateAccountSupportTicketInput = z.infer<typeof createAccountSupportTicketSchema>;
