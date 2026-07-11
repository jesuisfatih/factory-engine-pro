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

export const accountPortalIconSchema = z.enum([
  'badge-check',
  'calendar-clock',
  'headphones',
  'package-check',
  'shield-check',
  'truck',
  'users',
]);
export type AccountPortalIcon = z.infer<typeof accountPortalIconSchema>;

export const accountPortalBenefitSchema = z.object({
  icon: accountPortalIconSchema,
  title: z.string().trim().min(1).max(48),
  body: z.string().trim().min(1).max(140),
  tone: z.enum(['blue', 'green', 'amber', 'neutral']).default('blue'),
}).strict();
export type AccountPortalBenefit = z.infer<typeof accountPortalBenefitSchema>;

export const accountPortalTrustItemSchema = z.object({
  icon: accountPortalIconSchema,
  label: z.string().trim().min(1).max(40),
}).strict();
export type AccountPortalTrustItem = z.infer<typeof accountPortalTrustItemSchema>;

const loginExperienceDefault = {
  enabled: true,
  layout: 'split' as const,
  eyebrow: 'B2B account workspace',
  headline: 'Order and track every DTF job from one place.',
  description: 'Wholesale ordering, payment terms, team access, and support are kept together for repeat purchasing.',
  formTitle: 'Welcome back',
  formDescription: 'Sign in to your account.',
  primaryActionLabel: 'Sign In',
  secondaryActionLabel: 'Create Account',
  tertiaryActionLabel: 'Request B2B Access',
  showBenefits: true,
  showTrustItems: true,
  benefits: [
    { icon: 'package-check' as const, title: 'Wholesale pricing', body: 'Contract rates and volume breaks stay visible before checkout.', tone: 'green' as const },
    { icon: 'badge-check' as const, title: 'Net terms', body: 'Approved buyers can manage invoices, balances, and payment timing.', tone: 'amber' as const },
    { icon: 'users' as const, title: 'Team purchasing', body: 'Buyers, managers, and admins work from one controlled account.', tone: 'blue' as const },
  ],
  trustItems: [
    { icon: 'shield-check' as const, label: 'Secure checkout' },
    { icon: 'truck' as const, label: 'Order tracking' },
    { icon: 'badge-check' as const, label: 'Priority support' },
  ],
};

const registerExperienceDefault = {
  enabled: true,
  layout: 'split' as const,
  eyebrow: 'Company account setup',
  headline: 'Build your buying workspace in a few guided steps.',
  description: 'Create the company profile, addresses, and credentials your team will use for repeat purchasing.',
  formTitle: 'Create your B2B account',
  formDescription: 'Company, billing, shipping, and portal access are created securely.',
  primaryActionLabel: 'Create account',
  secondaryActionLabel: 'Back to sign in',
  tertiaryActionLabel: 'Request B2B Access',
  showBenefits: true,
  showTrustItems: true,
  benefits: loginExperienceDefault.benefits,
  trustItems: loginExperienceDefault.trustItems,
};

const requestAccessExperienceDefault = {
  enabled: true,
  layout: 'split' as const,
  eyebrow: 'B2B partner program',
  headline: 'Partner Program',
  description: 'Join our exclusive B2B network and unlock premium wholesale benefits.',
  formTitle: 'Request B2B Access',
  formDescription: 'Tell us about your business to get started.',
  primaryActionLabel: 'Submit Application',
  secondaryActionLabel: 'Sign in',
  tertiaryActionLabel: 'Create Account',
  showBenefits: true,
  showTrustItems: false,
  benefits: [
    { icon: 'package-check' as const, title: 'Wholesale Pricing', body: 'Up to 40% off retail prices', tone: 'green' as const },
    { icon: 'calendar-clock' as const, title: 'Net 30 Terms', body: 'Flexible payment options', tone: 'amber' as const },
    { icon: 'users' as const, title: 'Team Management', body: 'Add unlimited team members', tone: 'blue' as const },
    { icon: 'headphones' as const, title: 'Priority Support', body: 'Dedicated account manager', tone: 'neutral' as const },
    { icon: 'truck' as const, title: 'Free Shipping', body: 'On orders over $500', tone: 'blue' as const },
  ],
  trustItems: loginExperienceDefault.trustItems,
};

const accountPortalPageSchema = z.object({
  enabled: z.boolean().default(true),
  layout: z.enum(['split', 'centered']).default('split'),
  eyebrow: z.string().trim().max(48).default(''),
  headline: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(260),
  formTitle: z.string().trim().min(1).max(64),
  formDescription: z.string().trim().min(1).max(180),
  primaryActionLabel: z.string().trim().min(1).max(40),
  secondaryActionLabel: z.string().trim().min(1).max(40),
  tertiaryActionLabel: z.string().trim().min(1).max(40),
  showBenefits: z.boolean().default(true),
  showTrustItems: z.boolean().default(true),
  benefits: z.array(accountPortalBenefitSchema).max(5),
  trustItems: z.array(accountPortalTrustItemSchema).max(4),
}).strict();
export type AccountPortalPage = z.infer<typeof accountPortalPageSchema>;

const hexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.');

export const accountPortalExperienceSchema = z.object({
  version: z.literal(1).default(1),
  theme: z.object({
    primaryColor: hexColorSchema.default('#081F6F'),
    accentColor: hexColorSchema.default('#2C63E8'),
    pageBackground: hexColorSchema.default('#F4F7FB'),
    panelBackground: hexColorSchema.default('#FFFFFF'),
    textColor: hexColorSchema.default('#172033'),
    mutedTextColor: hexColorSchema.default('#667085'),
    radius: z.enum(['compact', 'standard', 'soft']).default('standard'),
    density: z.enum(['compact', 'comfortable']).default('comfortable'),
  }).strict().default({
    primaryColor: '#081F6F',
    accentColor: '#2C63E8',
    pageBackground: '#F4F7FB',
    panelBackground: '#FFFFFF',
    textColor: '#172033',
    mutedTextColor: '#667085',
    radius: 'standard',
    density: 'comfortable',
  }),
  login: accountPortalPageSchema.default(loginExperienceDefault),
  register: accountPortalPageSchema.default(registerExperienceDefault),
  requestAccess: accountPortalPageSchema.extend({
    successTitle: z.string().trim().min(1).max(80).default('Application Submitted!'),
    successMessage: z.string().trim().min(1).max(260).default('Thank you. The team will review your application and contact you with the next step.'),
  }).strict().default({
    ...requestAccessExperienceDefault,
    successTitle: 'Application Submitted!',
    successMessage: 'Thank you. The team will review your application and contact you with the next step.',
  }),
}).strict();
export type AccountPortalExperience = z.infer<typeof accountPortalExperienceSchema>;

export const DEFAULT_ACCOUNT_PORTAL_EXPERIENCE: AccountPortalExperience = accountPortalExperienceSchema.parse({});

export const tenantConfigSchema = z.object({
  workspaceName: z.string().trim().min(1).optional(),
  brandBadge: z.string().trim().min(1).max(6).optional(),
  brandLogo: z.string().trim().url().optional(),
  accountPortalExperience: accountPortalExperienceSchema.optional(),
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
  resendWebhookSecret: z.string().optional(),
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
