import { z } from 'zod';
import { pageQuerySchema } from './common.js';

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

export const accountSupportReplySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type AccountSupportReplyInput = z.infer<typeof accountSupportReplySchema>;

export const accountSupportCloseSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type AccountSupportCloseInput = z.infer<typeof accountSupportCloseSchema>;

export const accountSupportReopenSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type AccountSupportReopenInput = z.infer<typeof accountSupportReopenSchema>;

export const accountReorderSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(999).optional(),
});
export type AccountReorderInput = z.infer<typeof accountReorderSchema>;

export const accountCartCreateSchema = z.object({
  originOrderId: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type AccountCartCreateInput = z.infer<typeof accountCartCreateSchema>;

export const accountCartAddItemSchema = z.object({
  catalogVariantId: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
}).refine((input) => Boolean(input.catalogVariantId || input.sku), {
  message: 'A catalog variant or SKU is required',
});
export type AccountCartAddItemInput = z.infer<typeof accountCartAddItemSchema>;

export const accountCartUpdateItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(999),
});
export type AccountCartUpdateItemInput = z.infer<typeof accountCartUpdateItemSchema>;

export const accountCartCheckoutSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type AccountCartCheckoutInput = z.infer<typeof accountCartCheckoutSchema>;

export const accountInvoiceDownloadActionSchema = z.object({
  action: z.literal('download'),
  invoiceId: z.string().trim().min(1),
  invoiceNumber: z.string().trim().min(1),
  url: z.string().trim().min(1),
  label: z.string().trim().min(1),
  message: z.string().trim().min(1),
});
export type AccountInvoiceDownloadAction = z.infer<typeof accountInvoiceDownloadActionSchema>;

export const accountInvoicePayActionSchema = z.object({
  action: z.enum(['paid', 'payment_link', 'contact_billing']),
  invoiceId: z.string().trim().min(1),
  invoiceNumber: z.string().trim().min(1),
  status: z.string().trim().min(1),
  currency: z.string().trim().min(1),
  totalUsd: z.number(),
  paidUsd: z.number(),
  balanceUsd: z.number(),
  amountDueUsd: z.number(),
  url: z.string().trim().min(1).nullable(),
  label: z.string().trim().min(1),
  message: z.string().trim().min(1),
  downloadAvailable: z.boolean(),
});
export type AccountInvoicePayAction = z.infer<typeof accountInvoicePayActionSchema>;

export const accountOrderListStatusSchema = z.enum(['all', 'pending', 'paid', 'fulfilled', 'cancelled']);
export type AccountOrderListStatus = z.infer<typeof accountOrderListStatusSchema>;

export const accountOrderListQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(150).default(10),
  status: accountOrderListStatusSchema.default('all'),
  pickupOnly: z.coerce.boolean().optional(),
  hasDesignFiles: z.coerce.boolean().optional(),
});
export type AccountOrderListQuery = z.infer<typeof accountOrderListQuerySchema>;

export const accountInvoiceListStatusSchema = z.enum(['all', 'paid', 'unpaid', 'overdue', 'partial']);
export type AccountInvoiceListStatus = z.infer<typeof accountInvoiceListStatusSchema>;

export const accountInvoiceListQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(150).default(10),
  status: accountInvoiceListStatusSchema.default('all'),
});
export type AccountInvoiceListQuery = z.infer<typeof accountInvoiceListQuerySchema>;

export const accountDocumentCategorySchema = z.enum(['invoice', 'design', 'contract', 'certificate', 'tax', 'license', 'other']);
export type AccountDocumentCategory = z.infer<typeof accountDocumentCategorySchema>;

export const accountDocumentListCategorySchema = z.enum(['all', 'invoice', 'design', 'contract', 'certificate', 'tax', 'license', 'other']);
export type AccountDocumentListCategory = z.infer<typeof accountDocumentListCategorySchema>;

export const accountDocumentListQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(150).default(10),
  category: accountDocumentListCategorySchema.default('all'),
});
export type AccountDocumentListQuery = z.infer<typeof accountDocumentListQuerySchema>;
