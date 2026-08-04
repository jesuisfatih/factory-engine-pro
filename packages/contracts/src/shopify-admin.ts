import { z } from 'zod';
import { personContactStateSchema } from './person.js';

export const shopifyAbandonedCheckoutContextInputSchema = z.object({
  checkoutId: z.string().trim().max(200).optional(),
  shopifyCustomerId: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
  alternatePhones: z.array(z.string().trim().max(40)).max(8).default([]),
}).refine(
  (value) => Boolean(value.checkoutId || value.shopifyCustomerId || value.email || value.phone || value.alternatePhones.length),
  { message: 'Checkout, customer, email, or phone context is required' },
);
export type ShopifyAbandonedCheckoutContextInput = z.infer<typeof shopifyAbandonedCheckoutContextInputSchema>;

export const shopifyAbandonedCheckoutContextSchema = z.object({
  matched: z.boolean(),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }).nullable(),
  contactState: personContactStateSchema.nullable(),
  latestNote: z.object({
    id: z.string(),
    body: z.string(),
    authorName: z.string(),
    createdAt: z.string(),
  }).nullable(),
  staffMessage: z.string(),
  checkedAt: z.string(),
});
export type ShopifyAbandonedCheckoutContext = z.infer<typeof shopifyAbandonedCheckoutContextSchema>;
