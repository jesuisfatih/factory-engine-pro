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

const optionalProfileText = (max: number) => z.string().trim().max(max).nullable().optional();

export const updateCurrentMemberSchema = z.object({
  email: emailSchema.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: optionalProfileText(40),
  jobTitle: optionalProfileText(120),
  avatarUrl: z.string().trim().url().max(2048).nullable().optional(),
  timezone: optionalProfileText(80),
}).strict();
export type UpdateCurrentMemberInput = z.infer<typeof updateCurrentMemberSchema>;

export const currentMemberProfileSchema = z.object({
  id: z.string(),
  email: emailSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  timezone: z.string().nullable(),
});
export type CurrentMemberProfile = z.infer<typeof currentMemberProfileSchema>;

export const companyProfileSchema = z.object({
  legalName: z.string().trim().max(160).default(''),
  displayName: z.string().trim().max(120).default(''),
  email: z.union([emailSchema, z.literal('')]).default(''),
  phone: z.string().trim().max(40).default(''),
  website: z.union([z.string().trim().url().max(2048), z.literal('')]).default(''),
  taxId: z.string().trim().max(80).default(''),
  addressLine1: z.string().trim().max(180).default(''),
  addressLine2: z.string().trim().max(180).default(''),
  city: z.string().trim().max(100).default(''),
  state: z.string().trim().max(100).default(''),
  postalCode: z.string().trim().max(30).default(''),
  country: z.string().trim().max(100).default(''),
  timezone: z.string().trim().max(80).default('America/New_York'),
}).strict();
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export const DEFAULT_COMPANY_PROFILE: CompanyProfile = companyProfileSchema.parse({});

const brandAssetReferenceSchema = z.string().trim().max(450_000).refine(
  (value) => value === '' || /^https?:\/\//i.test(value) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(value),
  'Use an HTTPS image URL or upload a PNG, JPEG, or WebP image',
);

export const safeSystemSvgSchema = z.string().trim().max(50_000).refine((value) => {
  if (value === '') return true;
  if (!/^<svg[\s>]/i.test(value) || !/<\/svg>$/i.test(value)) return false;
  return !/(?:<script|<foreignObject|<image|<use|\son[a-z]+\s*=|javascript:|data:text\/html|<iframe|<object|<embed|@import|url\s*\(|(?:xlink:)?href\s*=)/i.test(value);
}, 'SVG must be self-contained and cannot include scripts, event handlers, embedded pages, or external styles');

export const brandAssetsSchema = z.object({
  primaryLogoUrl: brandAssetReferenceSchema.default(''),
  darkLogoUrl: brandAssetReferenceSchema.default(''),
  squareLogoUrl: brandAssetReferenceSchema.default(''),
  faviconUrl: brandAssetReferenceSchema.default(''),
  logoAltText: z.string().trim().max(140).default(''),
  logoWidth: z.number().int().min(16).max(2400).default(352),
  logoHeight: z.number().int().min(16).max(2400).default(120),
  systemIconSvg: safeSystemSvgSchema.default(''),
}).strict();
export type BrandAssets = z.infer<typeof brandAssetsSchema>;
export const DEFAULT_BRAND_ASSETS: BrandAssets = brandAssetsSchema.parse({});

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
  'badge-dollar-sign',
  'calendar-clock',
  'circle-check',
  'clock-3',
  'credit-card',
  'file-check-2',
  'headphones',
  'heart-handshake',
  'landmark',
  'mail',
  'package-check',
  'palette',
  'phone-call',
  'rocket',
  'shopping-bag',
  'shield-check',
  'sparkles',
  'truck',
  'users',
  'wallet-cards',
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

export type AccountPortalRequestFieldType = 'text' | 'email' | 'tel' | 'url' | 'select' | 'textarea' | 'file' | 'password' | 'date';

export interface AccountPortalRequestField {
  key: string;
  label: string;
  type: AccountPortalRequestFieldType;
  placeholder: string;
  required?: boolean;
  half?: boolean;
  visible?: boolean;
  helpText?: string;
  selectPlaceholder?: string;
}

export const ACCOUNT_PORTAL_REQUEST_FIELDS = [
  { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'John', required: true, half: true, visible: true },
  { key: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Doe', required: true, half: true, visible: true },
  { key: 'email', label: 'Email Address', type: 'email', placeholder: 'you@company.com', required: true, half: true, visible: true },
  { key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '(555) 123-4567', half: true, visible: true },
  { key: 'companyName', label: 'Company Name', type: 'text', placeholder: 'Your company name', required: true, half: true, visible: true },
  { key: 'legalName', label: 'Legal Name', type: 'text', placeholder: 'Registered legal name', required: true, half: true, visible: true },
  { key: 'website', label: 'Website', type: 'url', placeholder: 'https://yourcompany.com', half: true, visible: true },
  { key: 'industry', label: 'Industry', type: 'select', placeholder: 'Select industry', half: true, visible: true },
  { key: 'estimatedMonthlyVolume', label: 'Estimated Monthly Volume', type: 'select', placeholder: 'Select estimated monthly volume', visible: true },
  { key: 'taxCertificate', label: 'Tax Exemption Certificate', type: 'file', placeholder: 'Choose file', visible: true, helpText: 'PDF, JPEG, PNG or WebP (max 10MB)' },
  { key: 'taxCertificateExpiresAt', label: 'Certificate Expiration Date', type: 'date', placeholder: 'Select expiration date', visible: true },
  { key: 'password', label: 'Password', type: 'password', placeholder: 'Minimum 6 characters', required: true, half: true, visible: true },
  { key: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: 'Repeat your password', required: true, half: true, visible: true },
  { key: 'message', label: 'Additional Information', type: 'textarea', placeholder: 'Tell us about your business and how we can help...', visible: true },
] satisfies readonly AccountPortalRequestField[];

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
  heroBrandTitle: '',
  heroBrandSubtitle: 'Company Portal',
  showHeroLogo: true,
  showHeroBadge: true,
  showHeroBrandText: true,
  showEyebrow: true,
  showHeroHeadline: true,
  showHeroDescription: true,
  heroBrandAlignment: 'left' as const,
  heroLogoSize: 'standard' as const,
  heroBrandSize: 'standard' as const,
  benefitsPlacement: 'flow' as const,
  heroPanelWidth: 'balanced' as const,
  heroPattern: 'grid' as const,
  heroPatternOpacity: 13,
  showFooter: true,
  footerText: 'All rights reserved.',
  footerShowYear: true,
  primaryButtonStyle: 'solid' as const,
  formBrandMode: 'full' as const,
  showFormDescription: true,
  panelGradientEnabled: false,
  panelGradientFrom: '#081F6F',
  panelGradientTo: '#081F6F',
  panelGradientAngle: 160,
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
  heroBrandTitle: '',
  heroBrandSubtitle: 'Company Portal',
  showHeroLogo: true,
  showHeroBadge: true,
  showHeroBrandText: true,
  showEyebrow: true,
  showHeroHeadline: true,
  showHeroDescription: true,
  heroBrandAlignment: 'left' as const,
  heroLogoSize: 'standard' as const,
  heroBrandSize: 'standard' as const,
  benefitsPlacement: 'flow' as const,
  heroPanelWidth: 'balanced' as const,
  heroPattern: 'grid' as const,
  heroPatternOpacity: 13,
  showFooter: true,
  footerText: 'All rights reserved.',
  footerShowYear: true,
  primaryButtonStyle: 'solid' as const,
  formBrandMode: 'full' as const,
  showFormDescription: true,
  panelGradientEnabled: false,
  panelGradientFrom: '#081F6F',
  panelGradientTo: '#081F6F',
  panelGradientAngle: 160,
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
  heroBrandTitle: '',
  heroBrandSubtitle: 'B2B Portal',
  showHeroLogo: true,
  showHeroBadge: true,
  showHeroBrandText: true,
  showEyebrow: true,
  showHeroHeadline: true,
  showHeroDescription: true,
  heroBrandAlignment: 'left' as const,
  heroLogoSize: 'standard' as const,
  heroBrandSize: 'standard' as const,
  benefitsPlacement: 'flow' as const,
  heroPanelWidth: 'balanced' as const,
  heroPattern: 'grid' as const,
  heroPatternOpacity: 13,
  showFooter: false,
  footerText: 'All rights reserved.',
  footerShowYear: true,
  primaryButtonStyle: 'solid' as const,
  formBrandMode: 'hidden' as const,
  showFormDescription: true,
  panelGradientEnabled: false,
  panelGradientFrom: '#081F6F',
  panelGradientTo: '#081F6F',
  panelGradientAngle: 160,
  benefits: [
    { icon: 'package-check' as const, title: 'Wholesale Pricing', body: 'Up to 40% off retail prices', tone: 'green' as const },
    { icon: 'calendar-clock' as const, title: 'Net 30 Terms', body: 'Flexible payment options', tone: 'amber' as const },
    { icon: 'users' as const, title: 'Team Management', body: 'Add unlimited team members', tone: 'blue' as const },
    { icon: 'headphones' as const, title: 'Priority Support', body: 'Dedicated account manager', tone: 'neutral' as const },
    { icon: 'truck' as const, title: 'Free Shipping', body: 'On orders over $500', tone: 'blue' as const },
  ],
  trustItems: loginExperienceDefault.trustItems,
};

const hexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.');

const accountPortalRequestFieldSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['text', 'email', 'tel', 'url', 'select', 'textarea', 'file', 'password', 'date']),
  placeholder: z.string().trim().max(160).default(''),
  required: z.boolean().optional(),
  half: z.boolean().optional(),
  visible: z.boolean().default(true),
  helpText: z.string().trim().max(240).optional(),
  selectPlaceholder: z.string().trim().max(160).optional(),
}).strict();

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
  heroBrandTitle: z.string().trim().max(64).default(''),
  heroBrandSubtitle: z.string().trim().max(48).default('Company Portal'),
  showHeroLogo: z.boolean().default(true),
  showHeroBadge: z.boolean().default(true),
  showHeroBrandText: z.boolean().default(true),
  showEyebrow: z.boolean().default(true),
  showHeroHeadline: z.boolean().default(true),
  showHeroDescription: z.boolean().default(true),
  heroBrandAlignment: z.enum(['left', 'center']).default('left'),
  heroLogoSize: z.enum(['standard', 'large']).default('standard'),
  heroBrandSize: z.enum(['standard', 'large']).default('standard'),
  benefitsPlacement: z.enum(['flow', 'lower']).default('flow'),
  heroPanelWidth: z.enum(['narrow', 'balanced', 'wide']).default('balanced'),
  heroPattern: z.enum(['grid', 'none']).default('grid'),
  heroPatternOpacity: z.number().int().min(0).max(30).default(13),
  showFooter: z.boolean().default(true),
  footerText: z.string().trim().max(120).default('All rights reserved.'),
  footerShowYear: z.boolean().default(true),
  primaryButtonStyle: z.enum(['solid', 'gradient']).default('solid'),
  formBrandMode: z.enum(['full', 'logo', 'hidden']).default('full'),
  showFormDescription: z.boolean().default(true),
  panelGradientEnabled: z.boolean().default(false),
  panelGradientFrom: hexColorSchema.default('#081F6F'),
  panelGradientTo: hexColorSchema.default('#081F6F'),
  panelGradientAngle: z.number().int().min(0).max(360).default(160),
  showBenefits: z.boolean().default(true),
  showTrustItems: z.boolean().default(true),
  benefits: z.array(accountPortalBenefitSchema).max(8),
  trustItems: z.array(accountPortalTrustItemSchema).max(6),
}).strict();
export type AccountPortalPage = z.infer<typeof accountPortalPageSchema>;

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
    successIcon: accountPortalIconSchema.default('circle-check'),
    showSuccessEmailHint: z.boolean().default(true),
    successEmailHintPrefix: z.string().trim().min(1).max(140).default('Check your inbox for updates at'),
    successBackActionLabel: z.string().trim().min(1).max(40).default('Back to Login'),
    submittingActionLabel: z.string().trim().min(1).max(60).default('Submitting application...'),
    existingAccountPrompt: z.string().trim().min(1).max(140).default('Already have an account?'),
    lockedEmailHint: z.string().trim().min(1).max(180).default('Email linked from your storefront session.'),
    errorDismissLabel: z.string().trim().min(1).max(40).default('Dismiss'),
    certificateExpiringMessage: z.string().trim().min(1).max(300).default('Your tax exemption certificate will expire soon. Please update it as soon as possible.'),
    notice: z.object({
      enabled: z.boolean().default(true),
      text: z.string().trim().min(1).max(300).default('If you already have a storefront account, use the same email address here.'),
      backgroundColor: hexColorSchema.default('#EEF4FF'),
      borderColor: hexColorSchema.default('#AFC6F8'),
      textColor: hexColorSchema.default('#344054'),
    }).strict().default({
      enabled: true,
      text: 'If you already have a storefront account, use the same email address here.',
      backgroundColor: '#EEF4FF',
      borderColor: '#AFC6F8',
      textColor: '#344054',
    }),
    industries: z.array(z.string().trim().min(1).max(80)).min(1).max(30).default([
      'Apparel & Fashion',
      'Promotional Products',
      'Sports & Athletics',
      'Corporate Branding',
      'Screen Printing Shop',
      'Embroidery Business',
      'Sign & Banner Shop',
      'Reseller/Distributor',
      'Other',
    ]),
    volumeOptions: z.array(z.string().trim().min(1).max(80)).min(1).max(20).default([
      'Just starting out',
      '100-500 transfers/month',
      '500-1000 transfers/month',
      '1000-5000 transfers/month',
      '5000+ transfers/month',
    ]),
    formFields: z.array(accountPortalRequestFieldSchema).min(1).max(24).default(
      ACCOUNT_PORTAL_REQUEST_FIELDS.map((field) => ({ ...field })),
    ),
  }).strict().default({
    ...requestAccessExperienceDefault,
    successTitle: 'Application Submitted!',
    successMessage: 'Thank you. The team will review your application and contact you with the next step.',
    successIcon: 'circle-check',
    showSuccessEmailHint: true,
    successEmailHintPrefix: 'Check your inbox for updates at',
    successBackActionLabel: 'Back to Login',
    submittingActionLabel: 'Submitting application...',
    existingAccountPrompt: 'Already have an account?',
    lockedEmailHint: 'Email linked from your storefront session.',
    errorDismissLabel: 'Dismiss',
    certificateExpiringMessage: 'Your tax exemption certificate will expire soon. Please update it as soon as possible.',
    notice: {
      enabled: true,
      text: 'If you already have a storefront account, use the same email address here.',
      backgroundColor: '#EEF4FF',
      borderColor: '#AFC6F8',
      textColor: '#344054',
    },
    industries: [
      'Apparel & Fashion',
      'Promotional Products',
      'Sports & Athletics',
      'Corporate Branding',
      'Screen Printing Shop',
      'Embroidery Business',
      'Sign & Banner Shop',
      'Reseller/Distributor',
      'Other',
    ],
    volumeOptions: [
      'Just starting out',
      '100-500 transfers/month',
      '500-1000 transfers/month',
      '1000-5000 transfers/month',
      '5000+ transfers/month',
    ],
    formFields: ACCOUNT_PORTAL_REQUEST_FIELDS.map((field) => ({ ...field })),
  }),
}).strict();
export type AccountPortalExperience = z.infer<typeof accountPortalExperienceSchema>;

export const DEFAULT_ACCOUNT_PORTAL_EXPERIENCE: AccountPortalExperience = accountPortalExperienceSchema.parse({});

export const tenantConfigSchema = z.object({
  workspaceName: z.string().trim().min(1).optional(),
  brandBadge: z.string().trim().min(1).max(6).optional(),
  brandLogo: z.string().trim().url().optional(),
  companyProfile: companyProfileSchema.optional(),
  brandAssets: brandAssetsSchema.optional(),
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
