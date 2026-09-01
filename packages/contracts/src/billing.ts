import { z } from 'zod';

export const billingSubscriptionStatusSchema = z.enum([
  'unconfigured',
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);

export type BillingSubscriptionStatus = z.infer<typeof billingSubscriptionStatusSchema>;

export const billingPlanSchema = z.object({
  code: z.string(),
  name: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.literal('usd'),
  interval: z.literal('month'),
  taxIncluded: z.literal(true),
});

export const billingSummarySchema = z.object({
  tenantId: z.string(),
  tenantSlug: z.string(),
  plan: billingPlanSchema,
  status: billingSubscriptionStatusSchema,
  configured: z.boolean(),
  checkoutAvailable: z.boolean(),
  portalAvailable: z.boolean(),
  enforcement: z.object({
    prepared: z.literal(true),
    globallyEnabled: z.boolean(),
    tenantEnabled: z.boolean(),
    effective: z.boolean(),
    gracePeriodDays: z.literal(7),
    accessAllowed: z.boolean(),
    reason: z.string(),
  }),
  subscription: z.object({
    currentPeriodStart: z.string().datetime().nullable(),
    currentPeriodEnd: z.string().datetime().nullable(),
    graceEndsAt: z.string().datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    lastInvoiceStatus: z.string().nullable(),
  }),
  setup: z.object({
    secretKeyPresent: z.boolean(),
    webhookSecretPresent: z.boolean(),
    priceIdPresent: z.boolean(),
    webhookUrl: z.string().url(),
  }),
});

export type BillingSummary = z.infer<typeof billingSummarySchema>;

export const billingSessionSchema = z.object({ url: z.string().url() });
export type BillingSession = z.infer<typeof billingSessionSchema>;
