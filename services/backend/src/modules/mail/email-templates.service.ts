import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  activateEmailTemplateSchema,
  approveEmailTemplateRevisionSchema,
  mailTemplateBlockQuerySchema,
  mailTemplateQuerySchema,
  mailTemplatePreviewProfileQuerySchema,
  mailTemplateSnippetQuerySchema,
  patchMailTemplateBlockSchema,
  patchMailTemplatePreviewProfileSchema,
  patchEmailTemplateSchema,
  patchMailTemplateSnippetSchema,
  previewEmailTemplateSchema,
  proposeEmailTemplateAiEditSchema,
  saveMailTemplateBlockSchema,
  saveEmailTemplateSchema,
  saveMailTemplatePreviewProfileSchema,
  saveMailTemplateSnippetSchema,
  testEmailTemplateRevisionSchema,
  updateEmailTemplateRevisionSourceSchema,
  type ActivateEmailTemplateInput,
  type ApproveEmailTemplateRevisionInput,
  type EmailTemplateWorkspaceResponse,
  type EmailTemplateAiEditMode,
  type MailTemplateBlockQuery,
  type MailTemplateQuery,
  type MailTemplatePreviewProfileQuery,
  type MailTemplateSnippetQuery,
  type MailProviderMode,
  type PatchMailTemplateBlockInput,
  type PatchMailTemplatePreviewProfileInput,
  type PatchEmailTemplateInput,
  type PatchMailTemplateSnippetInput,
  type PreviewEmailTemplateInput,
  type ProposeEmailTemplateAiEditInput,
  type SaveMailTemplateBlockInput,
  type SaveEmailTemplateInput,
  type SaveMailTemplatePreviewProfileInput,
  type SaveMailTemplateSnippetInput,
  type TestEmailTemplateRevisionInput,
  type UpdateEmailTemplateRevisionSourceInput,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';
import { MailService } from './mail.service.js';
import {
  ensureApiV1BaseUrl,
  marketingComplianceLinks,
  resolveMailPreferenceSecret,
  resolveMailPreferenceTtlSeconds,
  type MarketingComplianceContext,
} from './mail-compliance.js';

interface CoreTransactionalTemplateDefinition {
  eventKey: string;
  title: string;
  description: string;
  folderKey: string;
  subject: string;
  previewText: string;
  html: string;
  css: string;
  text: string;
  variables: string[];
  sampleVariables: Record<string, unknown>;
}

interface EmailTemplateWorkspaceEvent {
  eventKey: string;
  templateCount: number;
  publishedCount: number;
  title?: string;
  description?: string;
  folderKey?: string;
  variables?: string[];
  sampleVariables?: Record<string, unknown>;
}

const CORE_TRANSACTIONAL_TEMPLATE_EVENTS: CoreTransactionalTemplateDefinition[] = [
  {
    eventKey: 'identity.member_invitation',
    title: 'Member invitation',
    description: 'Sent when an admin invites an internal member to the back panel or staff workspace.',
    folderKey: 'identity',
    subject: '{{brand_name}} invitation',
    previewText: 'Accept your workspace invitation and set your password.',
    html: transactionalShell({
      eyebrow: 'Workspace invitation',
      title: 'You have been invited to {{brand_name}}',
      body: 'Hi {{recipient_name}}, use the secure button below to accept your invitation and set your password.',
      ctaLabel: 'Accept invitation',
      ctaUrl: '{{action_url}}',
      secondary: 'This invitation expires in {{expires_in_days}} days.',
    }),
    css: transactionalCss('#1d4ed8'),
    text: 'Hi {{recipient_name}}, accept your {{brand_name}} invitation: {{action_url}}',
    variables: ['brand_name', 'recipient_name', 'action_url', 'invitation_url', 'expires_in_days'],
    sampleVariables: {
      brand_name: 'DTF Bank',
      recipient_name: 'Jane Doe',
      action_url: 'https://app.example.com/reset-password?flow=invitation&token=preview',
      invitation_url: 'https://app.example.com/reset-password?flow=invitation&token=preview',
      expires_in_days: 7,
    },
  },
  {
    eventKey: 'identity.customer_invitation',
    title: 'Customer portal invitation',
    description: 'Sent when a customer or sub-user is invited into the accounts portal.',
    folderKey: 'identity',
    subject: '{{brand_name}} account invitation',
    previewText: 'Create your buyer portal password and access your account.',
    html: transactionalShell({
      eyebrow: 'Buyer portal invitation',
      title: 'Your {{brand_name}} account is ready',
      body: 'Hi {{recipient_name}}, accept this invitation to access orders, invoices, reorder tools, and team purchasing controls.',
      ctaLabel: 'Create password',
      ctaUrl: '{{action_url}}',
      secondary: 'This invitation expires in {{expires_in_days}} days.',
    }),
    css: transactionalCss('#1d4ed8'),
    text: 'Hi {{recipient_name}}, create your {{brand_name}} account password: {{action_url}}',
    variables: ['brand_name', 'recipient_name', 'action_url', 'invitation_url', 'expires_in_days'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      action_url: 'https://accounts.example.com/reset-password?flow=invitation&token=preview',
      invitation_url: 'https://accounts.example.com/reset-password?flow=invitation&token=preview',
      expires_in_days: 7,
    },
  },
  {
    eventKey: 'identity.password_reset',
    title: 'Password reset',
    description: 'Sent when a member, staff user, customer user, or sub-user requests a password reset.',
    folderKey: 'identity',
    subject: '{{brand_name}} password reset',
    previewText: 'Use the secure link to reset your password.',
    html: transactionalShell({
      eyebrow: 'Password reset',
      title: 'Reset your {{brand_name}} password',
      body: 'Hi {{recipient_name}}, use the secure button below to reset your password.',
      ctaLabel: 'Reset password',
      ctaUrl: '{{action_url}}',
      secondary: 'This link expires in {{expires_in_minutes}} minutes.',
    }),
    css: transactionalCss('#334155'),
    text: 'Hi {{recipient_name}}, reset your {{brand_name}} password: {{action_url}}',
    variables: ['brand_name', 'recipient_name', 'action_url', 'reset_url', 'expires_in_minutes', 'surface'],
    sampleVariables: {
      brand_name: 'DTF Bank',
      recipient_name: 'Jane Doe',
      action_url: 'https://accounts.example.com/reset-password?token=preview',
      reset_url: 'https://accounts.example.com/reset-password?token=preview',
      expires_in_minutes: 30,
      surface: 'accounts',
    },
  },
  {
    eventKey: 'b2b_access.approved',
    title: 'B2B access invitation approved',
    description: 'Legacy-compatible B2B access approval invite event for customer portal onboarding.',
    folderKey: 'b2b',
    subject: '{{brand_name}} B2B access is ready',
    previewText: 'Your B2B buyer workspace is ready.',
    html: transactionalShell({
      eyebrow: 'B2B access',
      title: 'Your B2B access is ready',
      body: 'Hi {{recipient_name}}, your buyer workspace is ready. Use the secure button to finish setup.',
      ctaLabel: 'Open account',
      ctaUrl: '{{action_url}}',
      secondary: 'You can review orders, invoices, reorder options, and team users from the portal.',
    }),
    css: transactionalCss('#1d4ed8'),
    text: 'Hi {{recipient_name}}, your {{brand_name}} B2B access is ready: {{action_url}}',
    variables: ['brand_name', 'recipient_name', 'action_url', 'invitation_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      action_url: 'https://accounts.example.com/reset-password?flow=invitation&token=preview',
      invitation_url: 'https://accounts.example.com/reset-password?flow=invitation&token=preview',
    },
  },
  {
    eventKey: 'b2b.application_received.user',
    title: 'B2B application received',
    description: 'Confirms to the applicant that the B2B request was received.',
    folderKey: 'b2b',
    subject: 'We received your {{brand_name}} B2B application',
    previewText: 'Your B2B request is queued for review.',
    html: transactionalShell({
      eyebrow: 'Application received',
      title: 'We received your B2B application',
      body: 'Hi {{recipient_name}}, your request for {{company_name}} is now in review.',
      ctaLabel: 'Open portal',
      ctaUrl: '{{portal_url}}',
      secondary: 'Reference: {{request_id}}',
    }),
    css: transactionalCss('#0f766e'),
    text: 'Hi {{recipient_name}}, we received your B2B application for {{company_name}}. Reference: {{request_id}}',
    variables: ['brand_name', 'recipient_name', 'company_name', 'request_id', 'portal_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      request_id: 'REQ-1001',
      portal_url: 'https://accounts.example.com',
    },
  },
  {
    eventKey: 'b2b.application_received.internal',
    title: 'B2B application internal alert',
    description: 'Notifies admins that a new B2B request needs review.',
    folderKey: 'b2b',
    subject: 'New B2B application: {{company_name}}',
    previewText: 'A new B2B request needs review.',
    html: transactionalShell({
      eyebrow: 'Internal alert',
      title: 'New B2B application',
      body: '{{company_name}} submitted a B2B request. Review the request and approve or reject it from the admin panel.',
      ctaLabel: 'Review request',
      ctaUrl: '{{admin_url}}',
      secondary: 'Reference: {{request_id}}',
    }),
    css: transactionalCss('#0f766e'),
    text: 'New B2B application from {{company_name}}. Review: {{admin_url}}',
    variables: ['company_name', 'request_id', 'admin_url'],
    sampleVariables: {
      company_name: 'Acme Prints',
      request_id: 'REQ-1001',
      admin_url: 'https://app.example.com/b2b-requests',
    },
  },
  {
    eventKey: 'b2b.application_approved.user',
    title: 'B2B application approved',
    description: 'Sent when a B2B application is approved and portal access is available.',
    folderKey: 'b2b',
    subject: '{{brand_name}} B2B access approved',
    previewText: 'Your B2B account is approved.',
    html: transactionalShell({
      eyebrow: 'Approved',
      title: 'Your B2B account is approved',
      body: 'Hi {{recipient_name}}, your B2B access application for {{company_name}} has been approved. {{account_text}}',
      ctaLabel: 'Open account portal',
      ctaUrl: '{{action_url}}',
      secondary: 'You can now review orders, invoices, reorder options, team users, and account pricing.',
    }),
    css: transactionalCss('#1d4ed8'),
    text: 'Hi {{recipient_name}}, your B2B access application for {{company_name}} has been approved. Open: {{action_url}}',
    variables: ['brand_name', 'recipient_name', 'company_name', 'account_text', 'login_url', 'portal_url', 'action_url', 'request_id'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      account_text: 'Your portal account is ready with B2B access.',
      login_url: 'https://accounts.example.com/login',
      portal_url: 'https://accounts.example.com/login',
      action_url: 'https://accounts.example.com/login',
      request_id: 'REQ-1001',
    },
  },
  {
    eventKey: 'b2b.application_rejected.user',
    title: 'B2B application rejected',
    description: 'Sent when a B2B application is reviewed but cannot be approved.',
    folderKey: 'b2b',
    subject: '{{brand_name}} B2B application update',
    previewText: 'Your B2B application has an update.',
    html: transactionalShell({
      eyebrow: 'Application update',
      title: 'We reviewed your B2B application',
      body: 'Hi {{recipient_name}}, we could not approve the application for {{company_name}} at this time.',
      ctaLabel: 'Open portal',
      ctaUrl: '{{portal_url}}',
      secondary: 'Review note: {{review_note}}',
    }),
    css: transactionalCss('#b45309'),
    text: 'Hi {{recipient_name}}, we could not approve the B2B application for {{company_name}}. Review note: {{review_note}}',
    variables: ['brand_name', 'recipient_name', 'company_name', 'review_note', 'request_id', 'portal_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      review_note: 'Please update the company details and submit again.',
      request_id: 'REQ-1001',
      portal_url: 'https://accounts.example.com/request-invitation',
    },
  },
  {
    eventKey: 'b2b.invoice_delivered.user',
    title: 'Invoice delivered',
    description: 'Sent when an invoice is delivered to a buyer portal user.',
    folderKey: 'b2b',
    subject: '{{brand_name}} invoice {{invoice_number}}',
    previewText: 'Your invoice is ready in the account portal.',
    html: transactionalShell({
      eyebrow: 'Invoice',
      title: 'Invoice {{invoice_number}} is ready',
      body: 'Hi {{recipient_name}}, your invoice is ready. Amount due: {{amount_due}}.',
      ctaLabel: 'Review invoice',
      ctaUrl: '{{action_url}}',
      secondary: 'Due date: {{due_date}}. {{billing_note}}',
    }),
    css: transactionalCss('#0f766e'),
    text: 'Hi {{recipient_name}}, invoice {{invoice_number}} is ready. Amount due: {{amount_due}}. Open: {{action_url}}',
    variables: ['brand_name', 'recipient_name', 'invoice_number', 'amount_due', 'currency', 'due_date', 'invoice_url', 'payment_url', 'portal_url', 'action_url', 'billing_note'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      invoice_number: 'INV-1001',
      amount_due: '$482.00',
      currency: 'USD',
      due_date: 'Jul 30, 2026',
      invoice_url: 'https://accounts.example.com/invoices/INV-1001',
      payment_url: 'https://pay.example.com/invoice/INV-1001',
      portal_url: 'https://accounts.example.com/invoices',
      action_url: 'https://accounts.example.com/invoices',
      billing_note: 'Please pay by the due date.',
    },
  },
  {
    eventKey: 'b2b.custom_pricing_changed.user',
    title: 'Custom pricing changed',
    description: 'Sent when a buyer account pricing configuration changes.',
    folderKey: 'b2b',
    subject: '{{brand_name}} pricing update',
    previewText: 'Your account pricing has been updated.',
    html: transactionalShell({
      eyebrow: 'Pricing update',
      title: 'Your account pricing was updated',
      body: 'Hi {{recipient_name}}, your B2B pricing terms were updated for {{company_name}}.',
      ctaLabel: 'Review pricing',
      ctaUrl: '{{portal_url}}',
      secondary: 'Pricing tier: {{pricing_tier}}',
    }),
    css: transactionalCss('#1d4ed8'),
    text: 'Hi {{recipient_name}}, your {{brand_name}} B2B pricing was updated. Review: {{portal_url}}',
    variables: ['brand_name', 'recipient_name', 'company_name', 'pricing_tier', 'portal_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      pricing_tier: 'Wholesale',
      portal_url: 'https://accounts.example.com/pricing',
    },
  },
  {
    eventKey: 'orders.order_confirmation.user',
    title: 'Order confirmation',
    description: 'Sent after an order is confirmed.',
    folderKey: 'orders',
    subject: '{{brand_name}} order {{order_number}} confirmed',
    previewText: 'Your order has been confirmed.',
    html: transactionalShell({
      eyebrow: 'Order confirmation',
      title: 'Order {{order_number}} is confirmed',
      body: 'Hi {{recipient_name}}, we confirmed your order for {{order_total}}.',
      ctaLabel: 'View order',
      ctaUrl: '{{order_url}}',
      secondary: 'Status: {{order_status}}',
    }),
    css: transactionalCss('#0f766e'),
    text: 'Hi {{recipient_name}}, order {{order_number}} is confirmed. View: {{order_url}}',
    variables: ['brand_name', 'recipient_name', 'order_number', 'order_total', 'order_status', 'order_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      order_number: '1001',
      order_total: '$482.00',
      order_status: 'confirmed',
      order_url: 'https://accounts.example.com/orders/1001',
    },
  },
  {
    eventKey: 'orders.order_shipped.user',
    title: 'Order shipped',
    description: 'Sent when an order shipment is available.',
    folderKey: 'orders',
    subject: '{{brand_name}} order {{order_number}} shipped',
    previewText: 'Tracking is available for your order.',
    html: transactionalShell({
      eyebrow: 'Shipping update',
      title: 'Order {{order_number}} shipped',
      body: 'Hi {{recipient_name}}, your order has shipped.',
      ctaLabel: 'Track order',
      ctaUrl: '{{tracking_url}}',
      secondary: 'Carrier: {{carrier}}. Tracking: {{tracking_number}}.',
    }),
    css: transactionalCss('#0f766e'),
    text: 'Hi {{recipient_name}}, order {{order_number}} shipped. Track: {{tracking_url}}',
    variables: ['brand_name', 'recipient_name', 'order_number', 'tracking_url', 'carrier', 'tracking_number'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      order_number: '1001',
      tracking_url: 'https://carrier.example.com/TK1001',
      carrier: 'UPS',
      tracking_number: 'TK1001',
    },
  },
];

const LEGACY_TRANSACTIONAL_TEMPLATE_EVENTS: CoreTransactionalTemplateDefinition[] = [
  legacyTransactionalEvent({
    eventKey: 'auth.password_reset_requested.user',
    title: 'Password reset requested',
    description: 'Legacy storefront/account password reset request event.',
    folderKey: 'auth',
    subject: '{{brand_name}} password reset',
    previewText: 'Use the secure link to reset your password.',
    variables: ['brand_name', 'recipient_name', 'action_url', 'reset_url', 'expires_in_minutes'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      action_url: 'https://accounts.example.com/reset-password?token=preview',
      reset_url: 'https://accounts.example.com/reset-password?token=preview',
      expires_in_minutes: 30,
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'auth.password_reset_completed.user',
    title: 'Password reset completed',
    description: 'Legacy account security confirmation after a password reset is completed.',
    folderKey: 'auth',
    subject: '{{brand_name}} password updated',
    previewText: 'Your account password was changed.',
    variables: ['brand_name', 'recipient_name', 'login_url', 'support_email'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      login_url: 'https://accounts.example.com/login',
      support_email: 'support@example.com',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'users.invitation_sent.user',
    title: 'User invitation sent',
    description: 'Legacy company user invitation event.',
    folderKey: 'users',
    subject: 'You have been invited to {{brand_name}}',
    previewText: 'Finish your account setup from the secure invite link.',
    variables: ['brand_name', 'recipient_name', 'action_url', 'invitation_url', 'inviter_name'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      action_url: 'https://accounts.example.com/invite',
      invitation_url: 'https://accounts.example.com/invite',
      inviter_name: 'Account Team',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'users.invitation_reminder.user',
    title: 'User invitation reminder',
    description: 'Legacy company user invitation reminder event.',
    folderKey: 'users',
    subject: 'Reminder: complete your {{brand_name}} invitation',
    previewText: 'Your invite is still waiting to be accepted.',
    variables: ['brand_name', 'recipient_name', 'action_url', 'invitation_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      action_url: 'https://accounts.example.com/invite',
      invitation_url: 'https://accounts.example.com/invite',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'users.email_verification_requested.user',
    title: 'Email verification requested',
    description: 'Legacy email verification code event.',
    folderKey: 'users',
    subject: 'Verify your {{brand_name}} email address',
    previewText: 'Confirm the email address on your account.',
    variables: ['brand_name', 'recipient_name', 'verification_code', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      verification_code: '481926',
      action_url: 'https://accounts.example.com/verify-email',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'users.account_activated.user',
    title: 'Account activated',
    description: 'Legacy customer account activation confirmation.',
    folderKey: 'users',
    subject: 'Your {{brand_name}} account is active',
    previewText: 'You can sign in and start using your account.',
    variables: ['brand_name', 'recipient_name', 'login_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      login_url: 'https://accounts.example.com/login',
      action_url: 'https://accounts.example.com/login',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'b2b.invitation_sent.user',
    title: 'B2B invitation sent',
    description: 'Legacy B2B customer invitation event.',
    folderKey: 'b2b',
    subject: 'Your {{brand_name}} B2B invitation is ready',
    previewText: 'Accept the invite to join the account.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'action_url', 'discount_code', 'inviter_name'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      action_url: 'https://accounts.example.com/invite',
      discount_code: 'B2B-ACME',
      inviter_name: 'Sales Team',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'b2b.invitation_reminder.user',
    title: 'B2B invitation reminder',
    description: 'Legacy B2B invitation reminder event.',
    folderKey: 'b2b',
    subject: 'Reminder: your {{brand_name}} B2B invite is waiting',
    previewText: 'You can still complete the invitation securely.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'action_url', 'discount_code'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      action_url: 'https://accounts.example.com/invite',
      discount_code: 'B2B-ACME',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'b2b.invitation_accepted.internal',
    title: 'B2B invitation accepted internal',
    description: 'Legacy internal notification when a B2B invitation is accepted.',
    folderKey: 'b2b',
    subject: 'B2B invitation accepted: {{company_name}}',
    previewText: 'The invited user completed onboarding.',
    variables: ['brand_name', 'recipient_name', 'recipient_email', 'company_name', 'accepted_at', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      recipient_email: 'jane@example.com',
      company_name: 'Acme Prints',
      accepted_at: '2026-07-07T12:00:00Z',
      admin_url: 'https://app.example.com/b2b-access',
      action_url: 'https://app.example.com/b2b-access',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'tax_exempt.request_received.user',
    title: 'Tax exemption request received',
    description: 'Legacy tax exemption request acknowledgement.',
    folderKey: 'tax_exempt',
    subject: 'We received your {{brand_name}} tax exemption request',
    previewText: 'Your request is in review.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'request_id', 'review_timeline'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      request_id: 'REQ-1001',
      review_timeline: '1-2 business days',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'tax_exempt.request_received.internal',
    title: 'Tax exemption request internal alert',
    description: 'Legacy internal tax exemption request notification.',
    folderKey: 'tax_exempt',
    subject: 'New tax exemption request: {{company_name}}',
    previewText: 'A tax exemption request needs review.',
    variables: ['brand_name', 'company_name', 'applicant_name', 'applicant_email', 'request_id', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      company_name: 'Acme Prints',
      applicant_name: 'Jane Doe',
      applicant_email: 'jane@example.com',
      request_id: 'REQ-1001',
      admin_url: 'https://app.example.com/b2b-access',
      action_url: 'https://app.example.com/b2b-access',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'tax_exempt.request_approved.user',
    title: 'Tax exemption request approved',
    description: 'Legacy tax exemption approval event.',
    folderKey: 'tax_exempt',
    subject: 'Your {{brand_name}} tax exemption request was approved',
    previewText: 'Your tax status has been updated.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'login_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      login_url: 'https://accounts.example.com/login',
      action_url: 'https://accounts.example.com/login',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'tax_exempt.request_rejected.user',
    title: 'Tax exemption request rejected',
    description: 'Legacy tax exemption rejection event.',
    folderKey: 'tax_exempt',
    subject: 'Update on your {{brand_name}} tax exemption request',
    previewText: 'The team reviewed your request.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'review_notes', 'support_email'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      review_notes: 'Please upload a valid resale certificate.',
      support_email: 'support@example.com',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'tax_exempt.certificate_expiring.user',
    title: 'Tax exemption certificate expiring',
    description: 'Customer warning sent before a tax exemption certificate expires.',
    folderKey: 'tax_exempt',
    subject: 'Your {{brand_name}} tax exemption certificate expires soon',
    previewText: 'Please replace your certificate before it expires.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'expires_at', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      expires_at: '2026-10-01',
      action_url: 'https://accounts.example.com/profile',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'tax_exempt.certificate_expired.user',
    title: 'Tax exemption certificate expired',
    description: 'Customer notice after tax-exempt purchasing is suspended.',
    folderKey: 'tax_exempt',
    subject: 'Your {{brand_name}} tax exemption certificate has expired',
    previewText: 'Tax will be charged until a valid certificate is approved.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'expires_at', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      expires_at: '2026-07-01',
      action_url: 'https://accounts.example.com/profile',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'support.ticket_created.user',
    title: 'Support ticket created',
    description: 'Legacy customer support request acknowledgement.',
    folderKey: 'support',
    subject: 'We received your support request {{ticket_number}}',
    previewText: 'Your ticket number is ready for follow-up.',
    variables: ['brand_name', 'recipient_name', 'ticket_number', 'ticket_subject', 'ticket_message', 'support_email'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      ticket_number: 'TKT-1001',
      ticket_subject: 'Order tracking request',
      ticket_message: 'My order has not moved in transit.',
      support_email: 'support@example.com',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'support.ticket_created.internal',
    title: 'Support ticket created internal',
    description: 'Legacy internal support ticket alert.',
    folderKey: 'support',
    subject: 'New support ticket {{ticket_number}}',
    previewText: 'A new customer request needs attention.',
    variables: ['brand_name', 'ticket_number', 'ticket_subject', 'ticket_message', 'customer_name', 'customer_email', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      ticket_number: 'TKT-1001',
      ticket_subject: 'Order tracking request',
      ticket_message: 'My shipment has not moved.',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      admin_url: 'https://app.example.com/support',
      action_url: 'https://app.example.com/support',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'support.reply_added.user',
    title: 'Support reply added',
    description: 'Legacy support reply notification.',
    folderKey: 'support',
    subject: 'There is a reply on {{ticket_number}}',
    previewText: 'Open the thread to read the latest update.',
    variables: ['brand_name', 'recipient_name', 'ticket_number', 'ticket_subject', 'reply_message', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      ticket_number: 'TKT-1001',
      ticket_subject: 'Order tracking request',
      reply_message: 'Your shipment is out for delivery.',
      action_url: 'https://accounts.example.com/requests/TKT-1001',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'support.reply_added.internal',
    title: 'Support reply added internal',
    description: 'Legacy internal alert when a customer replies to support.',
    folderKey: 'support',
    subject: 'Customer replied to {{ticket_number}}',
    previewText: 'Keep the thread moving for the customer.',
    variables: ['brand_name', 'ticket_number', 'ticket_subject', 'reply_message', 'customer_name', 'customer_email', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      ticket_number: 'TKT-1001',
      ticket_subject: 'Order tracking request',
      reply_message: 'Can you send a tracking update?',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      admin_url: 'https://app.example.com/support',
      action_url: 'https://app.example.com/support',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'support.ticket_closed.user',
    title: 'Support ticket closed',
    description: 'Legacy customer support ticket closure confirmation.',
    folderKey: 'support',
    subject: 'Your support ticket {{ticket_number}} was closed',
    previewText: 'Reply if you need anything else.',
    variables: ['brand_name', 'recipient_name', 'ticket_number', 'ticket_subject', 'support_email'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      ticket_number: 'TKT-1001',
      ticket_subject: 'Order tracking request',
      support_email: 'support@example.com',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'forms.artwork-updates-request.submitted.user',
    title: 'Artwork updates request submitted',
    description: 'Legacy storefront artwork update form acknowledgement.',
    folderKey: 'forms',
    subject: 'We received your {{form_name}}',
    previewText: 'Our team will review the attached details.',
    variables: ['brand_name', 'recipient_name', 'form_name', 'form_handle', 'request_summary', 'source_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      form_name: 'Artwork Updates Request',
      form_handle: 'artwork-updates-request',
      request_summary: 'Please update the chest logo.',
      source_url: 'https://store.example.com/pages/artwork-updates',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'forms.artwork-updates-request.submitted.internal',
    title: 'Artwork updates request internal alert',
    description: 'Legacy internal artwork update form notification.',
    folderKey: 'forms',
    subject: 'New {{form_name}} submission',
    previewText: 'Review the submitted file and notes.',
    variables: ['brand_name', 'form_name', 'form_handle', 'submitter_name', 'submitter_email', 'request_summary', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      form_name: 'Artwork Updates Request',
      form_handle: 'artwork-updates-request',
      submitter_name: 'Jane Doe',
      submitter_email: 'jane@example.com',
      request_summary: 'Please update the chest logo.',
      admin_url: 'https://app.example.com/support',
      action_url: 'https://app.example.com/support',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'forms.order-tracking-request.submitted.user',
    title: 'Order tracking request submitted',
    description: 'Legacy storefront order tracking form acknowledgement.',
    folderKey: 'forms',
    subject: 'We received your tracking request',
    previewText: 'We are checking the latest status now.',
    variables: ['brand_name', 'recipient_name', 'form_name', 'order_number', 'request_summary'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      form_name: 'Order Tracking Request',
      order_number: '#1001',
      request_summary: 'My shipment has not moved.',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'forms.order-tracking-request.submitted.internal',
    title: 'Order tracking request internal alert',
    description: 'Legacy internal order tracking form notification.',
    folderKey: 'forms',
    subject: 'New order tracking request {{order_number}}',
    previewText: 'A customer needs a tracking update.',
    variables: ['brand_name', 'order_number', 'submitter_name', 'submitter_email', 'request_summary', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      order_number: '#1001',
      submitter_name: 'Jane Doe',
      submitter_email: 'jane@example.com',
      request_summary: 'My shipment has not moved.',
      admin_url: 'https://app.example.com/support',
      action_url: 'https://app.example.com/support',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'forms.tax-exempt-for-businesses.submitted.user',
    title: 'Tax exempt form submitted',
    description: 'Legacy storefront tax exempt form acknowledgement.',
    folderKey: 'forms',
    subject: 'We received your tax exemption request',
    previewText: 'We will review the form and follow up.',
    variables: ['brand_name', 'recipient_name', 'form_name', 'company_name', 'request_summary'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      form_name: 'Tax Exempt for Businesses',
      company_name: 'Acme Prints',
      request_summary: 'Please review our resale certificate.',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'forms.tax-exempt-for-businesses.submitted.internal',
    title: 'Tax exempt form internal alert',
    description: 'Legacy internal tax exempt form notification.',
    folderKey: 'forms',
    subject: 'New tax exempt form submission: {{company_name}}',
    previewText: 'The review queue has a new tax exemption request.',
    variables: ['brand_name', 'form_name', 'company_name', 'submitter_name', 'submitter_email', 'request_summary', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      form_name: 'Tax Exempt for Businesses',
      company_name: 'Acme Prints',
      submitter_name: 'Jane Doe',
      submitter_email: 'jane@example.com',
      request_summary: 'Please review our resale certificate.',
      admin_url: 'https://app.example.com/b2b-access',
      action_url: 'https://app.example.com/b2b-access',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'discount.invitation_sent.user',
    title: 'Discount invitation sent',
    description: 'Legacy discount-backed account invitation.',
    folderKey: 'discount',
    subject: 'Your {{brand_name}} discount access is ready',
    previewText: 'Use the invite to finish setting up access.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'discount_code', 'temporary_password', 'login_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      discount_code: 'B2B-ACME-9F21',
      temporary_password: 'TempPass123!',
      login_url: 'https://accounts.example.com/login',
      action_url: 'https://accounts.example.com/login',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'discount.invitation_reminder.user',
    title: 'Discount invitation reminder',
    description: 'Legacy discount-backed invitation reminder.',
    folderKey: 'discount',
    subject: 'Reminder: your {{brand_name}} discount is waiting',
    previewText: 'Your invite is still active.',
    variables: ['brand_name', 'recipient_name', 'company_name', 'discount_code', 'login_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      recipient_name: 'Jane Doe',
      company_name: 'Acme Prints',
      discount_code: 'B2B-ACME-9F21',
      login_url: 'https://accounts.example.com/login',
      action_url: 'https://accounts.example.com/login',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'b2b.quote_requested.internal',
    title: 'B2B quote requested internal',
    description: 'Legacy internal notification when a B2B customer requests a quote.',
    folderKey: 'b2b',
    subject: 'New B2B quote request {{quote_number}}',
    previewText: 'A customer requested a quote.',
    variables: ['brand_name', 'quote_id', 'quote_number', 'company_name', 'customer_name', 'customer_email', 'request_summary', 'item_count', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      quote_id: 'quo_1001',
      quote_number: 'Q-1001',
      company_name: 'Acme Prints',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      request_summary: 'Needs pricing for 12 reorder items.',
      item_count: 12,
      admin_url: 'https://app.example.com/b2b-quotes',
      action_url: 'https://app.example.com/b2b-quotes',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'b2b.quote_approved.internal',
    title: 'B2B quote approved internal',
    description: 'Legacy internal notification when a customer accepts a quote.',
    folderKey: 'b2b',
    subject: 'B2B quote accepted {{quote_number}}',
    previewText: 'Sales and fulfillment can proceed.',
    variables: ['brand_name', 'quote_id', 'quote_number', 'company_name', 'customer_name', 'customer_email', 'total', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      quote_id: 'quo_1001',
      quote_number: 'Q-1001',
      company_name: 'Acme Prints',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      total: '$482.00',
      admin_url: 'https://app.example.com/b2b-quotes',
      action_url: 'https://app.example.com/b2b-quotes',
    },
  }),
  legacyTransactionalEvent({
    eventKey: 'b2b.quote_rejected.internal',
    title: 'B2B quote rejected internal',
    description: 'Legacy internal notification when a customer declines a quote.',
    folderKey: 'b2b',
    subject: 'B2B quote declined {{quote_number}}',
    previewText: 'The customer declined the quote.',
    variables: ['brand_name', 'quote_id', 'quote_number', 'company_name', 'customer_name', 'customer_email', 'admin_url', 'action_url'],
    sampleVariables: {
      brand_name: 'Eagle DTF Print',
      quote_id: 'quo_1001',
      quote_number: 'Q-1001',
      company_name: 'Acme Prints',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      admin_url: 'https://app.example.com/b2b-quotes',
      action_url: 'https://app.example.com/b2b-quotes',
    },
  }),
];

const TRANSACTIONAL_TEMPLATE_EVENTS = dedupeTemplateDefinitions([
  ...CORE_TRANSACTIONAL_TEMPLATE_EVENTS,
  ...LEGACY_TRANSACTIONAL_TEMPLATE_EVENTS,
]);

function transactionalShell(input: {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  secondary: string;
}) {
  return [
    '<!doctype html><html><body class="mail-body">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mail-canvas"><tr><td align="center">',
    '<table role="presentation" width="680" cellpadding="0" cellspacing="0" class="mail-card">',
    `<tr><td class="mail-header"><div class="mail-eyebrow">${input.eyebrow}</div><h1>${input.title}</h1></td></tr>`,
    `<tr><td class="mail-copy"><p>${input.body}</p><p class="mail-secondary">${input.secondary}</p></td></tr>`,
    `<tr><td class="mail-action"><a href="${input.ctaUrl}">${input.ctaLabel}</a></td></tr>`,
    '<tr><td class="mail-footer">This message was sent from {{brand_name}}.</td></tr>',
    '</table></td></tr></table>',
    '</body></html>',
  ].join('');
}

function transactionalCss(accent: string) {
  return [
    '.mail-body{margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;}',
    '.mail-canvas{padding:32px 16px;background:#eef2f7;}',
    '.mail-card{max-width:680px;background:#ffffff;border:1px solid #dbe4ef;border-radius:24px;overflow:hidden;}',
    `.mail-header{padding:30px 32px 14px;border-top:6px solid ${accent};}`,
    `.mail-eyebrow{display:inline-block;padding:6px 10px;border-radius:999px;background:#eff6ff;color:${accent};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}`,
    '.mail-header h1{margin:16px 0 0;font-size:30px;line-height:1.15;color:#111827;}',
    '.mail-copy{padding:4px 32px 10px;color:#334155;font-size:15px;line-height:1.7;}',
    '.mail-copy p{margin:0 0 14px;}',
    '.mail-secondary{color:#64748b;}',
    '.mail-action{padding:0 32px 30px;}',
    `.mail-action a{display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700;}`,
    '.mail-footer{padding:18px 32px 28px;color:#64748b;font-size:12px;line-height:1.5;border-top:1px solid #e5eaf2;}',
  ].join('\n');
}

function legacyTransactionalEvent(input: {
  eventKey: string;
  title: string;
  description: string;
  folderKey: string;
  subject: string;
  previewText: string;
  variables: string[];
  sampleVariables: Record<string, unknown>;
}): CoreTransactionalTemplateDefinition {
  return {
    eventKey: input.eventKey,
    title: input.title,
    description: input.description,
    folderKey: input.folderKey,
    subject: input.subject,
    previewText: input.previewText,
    html: transactionalShell({
      eyebrow: input.folderKey.replace(/[_-]+/g, ' '),
      title: input.title,
      body: 'Hi {{recipient_name}}, this message was generated for {{brand_name}} from the {{event_key}} event.',
      ctaLabel: 'Open details',
      ctaUrl: '{{action_url}}',
      secondary: '{{request_summary}}{{review_notes}}{{ticket_message}}{{reply_message}}',
    }),
    css: transactionalCss(legacyAccent(input.folderKey)),
    text: `${input.title}: {{action_url}}`,
    variables: [...new Set(['brand_name', 'recipient_name', 'event_key', 'action_url', ...input.variables])],
    sampleVariables: {
      event_key: input.eventKey,
      action_url: input.sampleVariables.action_url ?? input.sampleVariables.login_url ?? input.sampleVariables.admin_url ?? 'https://example.com',
      recipient_name: input.sampleVariables.recipient_name ?? 'Jane Doe',
      request_summary: '',
      review_notes: '',
      ticket_message: '',
      reply_message: '',
      ...input.sampleVariables,
    },
  };
}

function legacyAccent(folderKey: string) {
  if (folderKey === 'b2b' || folderKey === 'users') return '#1d4ed8';
  if (folderKey === 'tax_exempt' || folderKey === 'discount') return '#b45309';
  if (folderKey === 'support') return '#334155';
  if (folderKey === 'forms') return '#0f766e';
  return '#334155';
}

function dedupeTemplateDefinitions(definitions: CoreTransactionalTemplateDefinition[]) {
  const seen = new Set<string>();
  const output: CoreTransactionalTemplateDefinition[] = [];
  for (const definition of definitions) {
    if (seen.has(definition.eventKey)) continue;
    seen.add(definition.eventKey);
    output.push(definition);
  }
  return output;
}

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly repository: EmailTemplatesRepository,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async workspace(): Promise<EmailTemplateWorkspaceResponse> {
    await this.ensureCoreTransactionalTemplates();
    const [templates, provider] = await Promise.all([
      this.repository.list({ limit: 200 }),
      this.providerSummary(),
    ]);
    const events = new Map<string, EmailTemplateWorkspaceEvent>();
    for (const definition of TRANSACTIONAL_TEMPLATE_EVENTS) {
      events.set(definition.eventKey, {
        eventKey: definition.eventKey,
        templateCount: 0,
        publishedCount: 0,
        title: definition.title,
        description: definition.description,
        folderKey: definition.folderKey,
        variables: definition.variables,
        sampleVariables: definition.sampleVariables,
      });
    }
    for (const row of templates) {
      const current = events.get(row.eventKey) ?? { eventKey: row.eventKey, templateCount: 0, publishedCount: 0 };
      current.templateCount += 1;
      if (row.status === 'published') current.publishedCount += 1;
      events.set(row.eventKey, current);
    }
    return {
      sendingEnabled: provider.mode === 'live',
      templates: templates.map(toTemplateDto),
      events: [...events.values()].sort((left, right) => left.eventKey.localeCompare(right.eventKey)),
      provider,
    };
  }

  private async ensureCoreTransactionalTemplates() {
    for (const definition of TRANSACTIONAL_TEMPLATE_EVENTS) {
      const existing = await this.repository.findByEventKey(definition.eventKey);
      if (existing.length > 0) continue;
      const created = await this.repository.create({
        name: definition.title,
        slug: slug(definition.eventKey),
        description: definition.description,
        eventKey: definition.eventKey,
        templateType: 'transactional',
        folderKey: definition.folderKey,
        subject: definition.subject,
        previewText: definition.previewText,
        html: definition.html,
        css: definition.css,
        text: definition.text,
        variables: definition.variables,
        metadata: {
          source: 'system_default',
          editable: true,
          eventTitle: definition.title,
          sampleVariables: definition.sampleVariables,
        } as unknown as Prisma.InputJsonValue,
      });
      const revision = created.versions[0];
      if (!revision) continue;
      const published = await this.repository.publishRevision(revision.id, {
        lintSummary: { source: 'system_default', generatedAt: new Date().toISOString() },
        spamScore: 0,
      });
      if (published.publishedVersionId) {
        await this.repository.activateVariant(definition.eventKey, published.id, published.publishedVersionId);
      }
      this.logger.log('mail_template', 'ensure_system_default', 'Transactional email template default created', {
        template_id: published.id,
        event_key: definition.eventKey,
      });
    }
  }

  async list(query: MailTemplateQuery) {
    const parsed = mailTemplateQuerySchema.parse(query);
    const rows = await this.repository.list(parsed);
    return rows.map(toTemplateDto);
  }

  async get(id: string) {
    const template = await this.repository.findById(id);
    if (!template) throw new NotFoundException('Email template not found');
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async getEvent(eventKey: string) {
    const [rows, provider] = await Promise.all([
      this.repository.findByEventKey(eventKey),
      this.providerSummary(),
    ]);
    return {
      eventKey,
      templates: rows.map((template) => ({ ...toTemplateDto(template), versions: template.versions.map(toVersionDto) })),
      sendingEnabled: provider.mode === 'live',
      provider,
    };
  }

  async create(input: SaveEmailTemplateInput) {
    const parsed = saveEmailTemplateSchema.parse(input);
    assertSafeEmailSource(parsed.html, parsed.css ?? '');
    const created = await this.toConflictOnDuplicateSlug(() => this.repository.create({
      ...parsed,
      slug: parsed.slug ?? slug(parsed.name),
      description: parsed.description ?? null,
      previewText: parsed.previewText ?? null,
      css: parsed.css ?? null,
      text: parsed.text ?? null,
      variables: parsed.variables as Prisma.InputJsonValue,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    }));
    this.logger.log('mail_template', 'create', 'Email template created', { template_id: created.id, event_key: created.eventKey });
    return { ...toTemplateDto(created), versions: created.versions.map(toVersionDto) };
  }

  async update(id: string, input: PatchEmailTemplateInput) {
    const parsed = patchEmailTemplateSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const updated = await this.toConflictOnDuplicateSlug(() => this.repository.update(id, {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.slug !== undefined && { slug: parsed.slug || undefined }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.eventKey !== undefined && { eventKey: parsed.eventKey }),
      ...(parsed.templateType !== undefined && { templateType: parsed.templateType }),
      ...(parsed.folderKey !== undefined && { folderKey: parsed.folderKey }),
      ...(parsed.subject !== undefined && { subject: parsed.subject }),
      ...(parsed.previewText !== undefined && { previewText: parsed.previewText ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    }));
    this.logger.log('mail_template', 'update', 'Email template updated', { template_id: id, event_key: updated.eventKey });
    return { ...toTemplateDto(updated), versions: updated.versions.map(toVersionDto) };
  }

  async duplicateVariant(variantId: string) {
    const template = await this.repository.duplicateVariant(variantId);
    this.logger.log('mail_template', 'duplicate_variant', 'Email template variant duplicated', { template_id: template.id, source_template_id: variantId });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async duplicateRevision(revisionId: string) {
    const template = await this.repository.duplicateRevision(revisionId);
    this.logger.log('mail_template', 'duplicate_revision', 'Email template revision duplicated', { template_id: template.id, revision_id: revisionId });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async updateRevisionSource(revisionId: string, input: UpdateEmailTemplateRevisionSourceInput) {
    const parsed = updateEmailTemplateRevisionSourceSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const template = await this.repository.updateRevisionSource(revisionId, {
      ...(parsed.subject !== undefined && { subject: parsed.subject }),
      ...(parsed.previewText !== undefined && { previewText: parsed.previewText ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    });
    this.logger.log('mail_template', 'update_revision_source', 'Email template revision source updated', {
      template_id: template.id,
      revision_id: revisionId,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async proposeAiEdit(revisionId: string, input: ProposeEmailTemplateAiEditInput) {
    const parsed = proposeEmailTemplateAiEditSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const declaredVariables = declaredTemplateVariables(revision.variables);
    const response = await this.generateTemplateAssistantJson({
      service: 'mail-template',
      promptKey: 'mail.template.proposal',
      system: templateAssistantSystemPrompt(),
      user: {
        task: 'Return a proposal for the saved email template revision. Do not claim it was saved.',
        mode: parsed.mode,
        instruction: parsed.instruction,
        audience: parsed.audience ?? '',
        brandVoice: parsed.brandVoice ?? '',
        template: {
          id: revision.templateId,
          revisionId: revision.id,
          type: revision.template.templateType,
          eventKey: revision.template.eventKey,
        },
        allowedVariables: declaredVariables.map((key) => `{{${key}}}`),
        currentDraft: {
          subject: revision.subject,
          previewText: revision.previewText ?? '',
          html: revision.html,
          css: revision.css ?? '',
          text: revision.text ?? '',
          variables: declaredVariables,
        },
        releaseRules: {
          marketingTemplatesNeedUnsubscribeToken: revision.template.templateType !== 'transactional',
          forbiddenHtml: ['script tags', 'form tags', 'inline event handlers', 'javascript: URLs'],
          outputMustBeJsonOnly: true,
          proposalOnly: true,
        },
      },
      metadata: { revision_id: revision.id, template_id: revision.templateId, mode: parsed.mode },
    });
    const proposal = normalizeTemplateAiProposal(response.output, revision, parsed.mode, declaredVariables);
    const validation = validatePublishableRevision({
      subject: proposal.subject,
      previewText: proposal.previewText ?? '',
      html: proposal.html,
      css: proposal.css ?? '',
      text: proposal.text ?? '',
      variables: proposal.variables,
      templateType: revision.template.templateType,
    });
    const changedFields = changedTemplateFields(revision, proposal);
    this.logger.log('mail_template', 'ai_proposal', 'Email template assistant proposal generated', {
      template_id: revision.templateId,
      revision_id: revision.id,
      mode: parsed.mode,
      changed_fields: changedFields.join(','),
      blocking_issues: validation.blockingIssues.length,
    });
    return {
      revisionId: revision.id,
      templateId: revision.templateId,
      mode: parsed.mode,
      provider: response.provider,
      model: response.model,
      promptKey: 'mail.template.proposal' as const,
      applied: false as const,
      generatedAt: new Date().toISOString(),
      draft: proposal,
      summary: proposal.summary,
      warnings: [...proposal.warnings, ...validation.warnings],
      changedFields,
      validation,
    };
  }

  async approveRevision(revisionId: string, input: ApproveEmailTemplateRevisionInput) {
    const parsed = approveEmailTemplateRevisionSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const validation = validatePublishableRevision(toReleaseInput(revision));
    if (validation.blockingIssues.length > 0) {
      throw new BadRequestException(validation.blockingIssues.join(', '));
    }
    await this.requireFreshReleaseProof(revision, 'approval');
    const template = await this.repository.approveRevision(revisionId, { comment: parsed.comment ?? null });
    this.logger.log('mail_template', 'approve_revision', 'Email template revision approved', { template_id: template.id, revision_id: revisionId });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async publishRevision(revisionId: string) {
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    if (revision.status !== 'approved' || revision.approvalState !== 'approved') {
      throw new BadRequestException('Revision must be approved before publish');
    }
    const validation = validatePublishableRevision(toReleaseInput(revision));
    if (validation.blockingIssues.length > 0) {
      throw new BadRequestException(validation.blockingIssues.join(', '));
    }
    await this.requireFreshReleaseProof(revision, 'publish');
    const template = await this.repository.publishRevision(revisionId, {
      lintSummary: validation as Prisma.InputJsonValue,
      spamScore: calculateSpamScore(revision.subject, revision.html),
    });
    this.logger.log('mail_template', 'publish', 'Email template revision published', {
      template_id: template.id,
      revision_id: revisionId,
      event_key: template.eventKey,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async activateVariant(eventKey: string, input: ActivateEmailTemplateInput) {
    const parsed = activateEmailTemplateSchema.parse(input);
    const template = await this.repository.activateVariant(eventKey, parsed.variantId, parsed.revisionId);
    this.logger.log('mail_template', 'activate', 'Email template activated for event', {
      template_id: template.id,
      event_key: eventKey,
      revision_id: parsed.revisionId ?? template.publishedVersionId,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async previewRevision(revisionId: string, input: PreviewEmailTemplateInput) {
    const parsed = previewEmailTemplateSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const variables = revision.template.templateType === 'transactional'
      ? parsed.variables
      : await this.withMarketingComplianceVariables(parsed.variables, {
        email: previewEmailFromVariables(parsed.variables),
        source: `template-preview:${revision.id}`,
      });
    const renderedCss = revision.css ? renderTemplate(revision.css, variables) : null;
    const unresolvedVariables = findUnresolvedVariables([revision.subject, revision.previewText ?? '', revision.html, revision.css ?? '', revision.text ?? ''], variables);
    const rendered = revision.template.templateType === 'transactional'
      ? { html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss), text: revision.text ? renderTemplate(revision.text, variables) : null }
      : appendMarketingComplianceFooter({
        html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss),
        text: revision.text ? renderTemplate(revision.text, variables) : null,
        compliance: await this.marketingComplianceContext(),
        urls: asRecord(variables.urls),
      });
    return {
      subject: renderTemplate(revision.subject, variables),
      previewText: revision.previewText ? renderTemplate(revision.previewText, variables) : null,
      html: rendered.html,
      text: rendered.text,
      unresolvedVariables,
    };
  }

  async testSend(revisionId: string, input: TestEmailTemplateRevisionInput) {
    const parsed = testEmailTemplateRevisionSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const validation = validatePublishableRevision(toReleaseInput(revision));
    if (validation.blockingIssues.length > 0) {
      throw new BadRequestException(validation.blockingIssues.join(', '));
    }
    const variables = revision.template.templateType === 'transactional'
      ? parsed.variables
      : await this.withMarketingComplianceVariables(parsed.variables, {
        email: parsed.to,
        source: `template-test:${revision.id}`,
      });
    const unresolvedVariables = findUnresolvedVariables([revision.subject, revision.previewText ?? '', revision.html, revision.css ?? '', revision.text ?? ''], variables);
    if (unresolvedVariables.length > 0) {
      throw new BadRequestException(`Resolve missing preview values before test proof: ${unresolvedVariables.join(', ')}`);
    }
    const renderedCss = revision.css ? renderTemplate(revision.css, variables) : null;
    const rendered = revision.template.templateType === 'transactional'
      ? { html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss), text: revision.text ? renderTemplate(revision.text, variables) : null, footerInjected: false }
      : appendMarketingComplianceFooter({
        html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss),
        text: revision.text ? renderTemplate(revision.text, variables) : null,
        compliance: await this.marketingComplianceContext(),
        urls: asRecord(variables.urls),
      });
    const releaseProof = buildReleaseProof(revision, variables, validation.warnings);
    const provider = await this.providerSummary();
    const deliveryInput = {
      eventKey: revision.template.eventKey,
      category: revision.template.templateType === 'marketing' ? 'marketing' : 'system',
      to: parsed.to,
      templateId: revision.templateId,
      templateVersionId: revision.id,
      subject: renderTemplate(revision.subject, variables),
      html: rendered.html,
      text: rendered.text,
      metadata: {
        source: 'email_template_test_send',
        explicitTest: true,
        templateId: revision.templateId,
        revisionId: revision.id,
        revisionNumber: revision.versionNumber,
        releaseProof,
        compliance: revision.template.templateType === 'transactional' ? null : {
          unsubscribeUrl: asRecord(variables.urls).unsubscribe ?? null,
          preferenceCenterUrl: asRecord(variables.urls).preferenceCenter ?? null,
          footerInjected: rendered.footerInjected,
        },
      },
    };
    const delivery = provider.mode === 'disabled'
      ? await this.mail.recordDisabledDelivery(deliveryInput)
      : await this.mail.sendTransactional(deliveryInput);
    this.logger.log('mail_template', 'test_send_queued', 'Email template test delivery queued', {
      revision_id: revisionId,
      mail_delivery_id: delivery.id,
      provider_mode: provider.mode,
    });
    return {
      sendingEnabled: provider.mode === 'live',
      status: delivery.status,
      revisionId,
      deliveryId: delivery.id,
      message: provider.mode === 'disabled'
        ? 'Mail provider is disabled for this tenant; a queued_disabled delivery record was created and no email was sent.'
        : provider.mode === 'test'
          ? 'Template test delivery was queued in test-only mode for the explicit recipient.'
          : 'Template test delivery was queued for the explicit recipient.',
    };
  }

  async testSendTemplate(templateId: string, input: TestEmailTemplateRevisionInput) {
    const template = await this.repository.findById(templateId);
    if (!template) throw new NotFoundException('Email template not found');
    const revision = template.publishedVersion ?? template.versions[0];
    if (!revision) throw new NotFoundException('Email template revision not found');
    return this.testSend(revision.id, input);
  }

  async deleteRevision(revisionId: string) {
    const template = await this.repository.deleteRevision(revisionId);
    this.logger.log('mail_template', 'delete_revision', 'Email template draft revision deleted', {
      template_id: template.id,
      revision_id: revisionId,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  private async generateTemplateAssistantJson(input: {
    service: string;
    promptKey: string;
    system: string;
    user: unknown;
    metadata: Record<string, unknown>;
  }) {
    if (this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_ENABLED')?.trim().toLowerCase() === 'false') {
      throw new BadRequestException({
        message: 'Anthropic template assistant is disabled by budget control.',
        code: 'anthropic_template_assist_disabled',
      });
    }
    const credentials = await this.resolveTemplateAssistantKey();
    if (!credentials.key) throw new BadRequestException('Anthropic API key is not configured for this tenant.');
    const model = await this.resolveTemplateAssistantModel(credentials.key);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': credentials.key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(this.anthropicTemplateTimeoutMs()),
        body: JSON.stringify({
          model,
          max_tokens: this.anthropicTemplateMaxTokens(),
          temperature: 0.2,
          system: input.system,
          messages: [{ role: 'user', content: JSON.stringify(input.user) }],
        }),
      });
    } catch (error) {
      const message = isTimeoutError(error)
        ? `Anthropic template assistant timed out after ${this.anthropicTemplateTimeoutMs()}ms.`
        : `Anthropic template assistant could not reach provider: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('mail_template', 'ai_proposal_network_failed', message, {
        key_source: credentials.source,
        model,
        prompt_key: input.promptKey,
        latency_ms: Date.now() - startedAt,
        ...input.metadata,
      });
      throw new BadRequestException({ message, code: 'anthropic_template_assist_network_error' });
    }
    const text = await response.text();
    const body = parseJsonObjectOrNull(text);
    if (!response.ok) {
      const message = providerErrorMessage(body, text) ?? `Anthropic template assistant failed with HTTP ${response.status}.`;
      this.logger.error('mail_template', 'ai_proposal_failed', message, {
        key_source: credentials.source,
        model,
        status_code: response.status,
        prompt_key: input.promptKey,
        latency_ms: Date.now() - startedAt,
        ...input.metadata,
      });
      throw new BadRequestException({ message, code: 'anthropic_template_assist_failed', status: response.status });
    }
    this.logger.log('mail_template', 'ai_proposal_provider_completed', 'Anthropic template assistant returned structured proposal text', {
      key_source: credentials.source,
      model,
      prompt_key: input.promptKey,
      latency_ms: Date.now() - startedAt,
      ...input.metadata,
    });
    return {
      provider: 'anthropic' as const,
      model,
      output: extractJsonObjectFromAnthropic(body),
    };
  }

  private async resolveTemplateAssistantKey(): Promise<{ key: string | null; source: 'tenant_config' | 'env' | 'none' }> {
    const config = await this.prisma.db.tenantConfig.findFirst({ select: { anthropicApiKeyEncrypted: true } });
    const tenantKey = this.crypto.decrypt(config?.anthropicApiKeyEncrypted)?.trim();
    if (tenantKey) return { key: tenantKey, source: 'tenant_config' };
    const envKey = this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
    if (envKey) return { key: envKey, source: 'env' };
    return { key: null, source: 'none' };
  }

  private async resolveTemplateAssistantModel(key: string) {
    const configured = this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_MODEL')?.trim()
      || this.config.get<string>('ANTHROPIC_MODEL')?.trim();
    if (configured) return configured;
    const fallback = 'claude-haiku-4-5-20251001';
    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=20', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(this.anthropicTemplateTimeoutMs()),
      });
      const body = parseJsonObjectOrNull(await response.text()) as { data?: Array<{ id?: string }> } | null;
      const ids = Array.isArray(body?.data) ? body.data.map((item) => item.id).filter((id): id is string => Boolean(id)) : [];
      return ids.find((id) => id === fallback)
        ?? ids.find((id) => id.includes('haiku-4-5'))
        ?? ids.find((id) => id.includes('haiku'))
        ?? ids[0]
        ?? fallback;
    } catch {
      return fallback;
    }
  }

  private anthropicTemplateTimeoutMs() {
    const configured = Number(this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_TIMEOUT_MS') ?? this.config.get<string>('ANTHROPIC_TIMEOUT_MS') ?? '15000');
    return Number.isFinite(configured) && configured >= 1000 && configured <= 120000 ? configured : 15000;
  }

  private anthropicTemplateMaxTokens() {
    const configured = Number(this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_MAX_TOKENS') ?? '1200');
    if (!Number.isInteger(configured)) return 1200;
    return Math.min(4000, Math.max(300, configured));
  }

  private async requireFreshReleaseProof(
    revision: NonNullable<Awaited<ReturnType<EmailTemplatesRepository['findRevisionById']>>>,
    action: 'approval' | 'publish',
  ) {
    const expectedSourceHash = releaseSourceHash(revision);
    const proofs = await this.mail.listTemplateRevisionTestProofs(revision.id);
    const proof = proofs.find((row) => {
      const metadata = asRecord(row.metadata);
      const releaseProof = asRecord(metadata.releaseProof);
      return metadata.source === 'email_template_test_send'
        && releaseProof.sourceHash === expectedSourceHash
        && releaseProof.unresolvedCount === 0;
    });
    if (!proof) {
      throw new BadRequestException(`Record a fresh rendered test proof before ${action}.`);
    }
    return proof;
  }

  private async withMarketingComplianceVariables(
    variables: Record<string, unknown>,
    input: { email: string; source: string },
  ) {
    const compliance = await this.marketingComplianceContext();
    const urls = marketingComplianceLinks(compliance, input);
    return {
      ...variables,
      urls: {
        ...asRecord(variables.urls),
        unsubscribe: textValue(asRecord(variables.urls).unsubscribe) || urls.unsubscribe,
        preferenceCenter: textValue(asRecord(variables.urls).preferenceCenter) || urls.preferenceCenter,
        preference_center: textValue(asRecord(variables.urls).preference_center) || urls.preference_center,
      },
    };
  }

  private async marketingComplianceContext(): Promise<MarketingComplianceContext> {
    const { settings } = await this.mail.mailCenterSettings();
    const compliance = settings.categoryMarketing.compliance;
    const configuredPreferenceUrl = textValue(compliance.preferenceCenterUrl);
    const apiBaseUrl = ensureApiV1BaseUrl(firstConfiguredUrl([
      this.config.get<string>('PUBLIC_API_URL'),
      this.config.get<string>('API_PUBLIC_BASE_URL'),
      this.config.get<string>('API_URL'),
      this.config.get<string>('ADMIN_APP_URL'),
      this.config.get<string>('ADMIN_URL'),
      this.config.get<string>('ACCOUNTS_APP_URL'),
      this.config.get<string>('ACCOUNTS_URL'),
    ]));
    const publicPreferenceUrl = joinUrl(apiBaseUrl, '/mail-marketing/preferences');
    const preferenceCenterUrl = publicPreferenceUrl || configuredPreferenceUrl;
    return {
      brandName: textValue(this.config.get<string>('MAIL_BRAND_NAME')) || textValue(this.config.get<string>('BRAND_NAME')) || 'Factory Engine Pro',
      physicalAddress: textValue(this.config.get<string>('MAIL_PHYSICAL_ADDRESS')) || textValue(this.config.get<string>('COMPANY_PHYSICAL_ADDRESS')) || '',
      preferenceCenterUrl,
      unsubscribeBaseUrl: joinUrl(apiBaseUrl, '/mail-marketing/preferences/unsubscribe') || preferenceCenterUrl,
      tenantId: this.repository.currentTenantId(),
      tokenSecret: resolveMailPreferenceSecret(this.config),
      tokenTtlSeconds: resolveMailPreferenceTtlSeconds(this.config),
    };
  }

  private async providerSummary() {
    const { settings } = await this.mail.mailCenterSettings();
    return providerSummary(settings.providerMode);
  }

  async previewProfiles(query: MailTemplatePreviewProfileQuery) {
    const parsed = mailTemplatePreviewProfileQuerySchema.parse(query);
    const rows = await this.repository.listPreviewProfiles(parsed);
    return rows.map(toPreviewProfileDto);
  }

  async createPreviewProfile(input: SaveMailTemplatePreviewProfileInput) {
    const parsed = saveMailTemplatePreviewProfileSchema.parse(input);
    const profile = await this.repository.createPreviewProfile({
      templateId: parsed.templateId ?? null,
      eventKey: parsed.eventKey ?? null,
      name: parsed.name,
      description: parsed.description ?? null,
      variables: parsed.variables as Prisma.InputJsonValue,
      isDefault: parsed.isDefault,
    });
    this.logger.log('mail_template', 'preview_profile_create', 'Mail template preview profile created', { profile_id: profile.id });
    return toPreviewProfileDto(profile);
  }

  async updatePreviewProfile(id: string, input: PatchMailTemplatePreviewProfileInput) {
    const parsed = patchMailTemplatePreviewProfileSchema.parse(input);
    const profile = await this.repository.updatePreviewProfile(id, {
      ...(parsed.templateId !== undefined && { templateId: parsed.templateId ?? null }),
      ...(parsed.eventKey !== undefined && { eventKey: parsed.eventKey ?? null }),
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.isDefault !== undefined && { isDefault: parsed.isDefault }),
    });
    this.logger.log('mail_template', 'preview_profile_update', 'Mail template preview profile updated', { profile_id: profile.id });
    return toPreviewProfileDto(profile);
  }

  async deletePreviewProfile(id: string) {
    const result = await this.repository.deletePreviewProfile(id);
    this.logger.log('mail_template', 'preview_profile_delete', 'Mail template preview profile deleted', { profile_id: id });
    return result;
  }

  async snippets(query: MailTemplateSnippetQuery) {
    const parsed = mailTemplateSnippetQuerySchema.parse(query);
    const rows = await this.repository.listSnippets(parsed);
    return rows.map(toSnippetDto);
  }

  async createSnippet(input: SaveMailTemplateSnippetInput) {
    const parsed = saveMailTemplateSnippetSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const snippet = await this.repository.createSnippet({
      key: parsed.key,
      name: parsed.name,
      description: parsed.description ?? null,
      templateType: parsed.templateType ?? null,
      subject: parsed.subject ?? null,
      html: parsed.html ?? null,
      css: parsed.css ?? null,
      text: parsed.text ?? null,
      metadata: parsed.metadata as Prisma.InputJsonValue,
      isArchived: parsed.isArchived,
    });
    this.logger.log('mail_template', 'snippet_create', 'Mail template snippet created', { snippet_id: snippet.id, key: snippet.key });
    return toSnippetDto(snippet);
  }

  async updateSnippet(id: string, input: PatchMailTemplateSnippetInput) {
    const parsed = patchMailTemplateSnippetSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const snippet = await this.repository.updateSnippet(id, {
      ...(parsed.key !== undefined && { key: parsed.key }),
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.templateType !== undefined && { templateType: parsed.templateType ?? null }),
      ...(parsed.subject !== undefined && { subject: parsed.subject ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html ?? null }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
      ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
    });
    this.logger.log('mail_template', 'snippet_update', 'Mail template snippet updated', { snippet_id: snippet.id, key: snippet.key });
    return toSnippetDto(snippet);
  }

  async deleteSnippet(id: string) {
    const result = await this.repository.deleteSnippet(id);
    this.logger.log('mail_template', 'snippet_archive', 'Mail template snippet archived', { snippet_id: id });
    return result;
  }

  async blocks(query: MailTemplateBlockQuery) {
    const parsed = mailTemplateBlockQuerySchema.parse(query);
    const rows = await this.repository.listBlocks(parsed);
    return rows.map(toBlockDto);
  }

  async createBlock(input: SaveMailTemplateBlockInput) {
    const parsed = saveMailTemplateBlockSchema.parse(input);
    assertSafeEmailSource(parsed.html, parsed.css ?? '');
    const block = await this.repository.createBlock({
      key: parsed.key,
      name: parsed.name,
      category: parsed.category,
      description: parsed.description ?? null,
      html: parsed.html,
      css: parsed.css ?? null,
      metadata: parsed.metadata as Prisma.InputJsonValue,
      isArchived: parsed.isArchived,
    });
    this.logger.log('mail_template', 'block_create', 'Mail template block created', { block_id: block.id, key: block.key });
    return toBlockDto(block);
  }

  async updateBlock(id: string, input: PatchMailTemplateBlockInput) {
    const parsed = patchMailTemplateBlockSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const block = await this.repository.updateBlock(id, {
      ...(parsed.key !== undefined && { key: parsed.key }),
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.category !== undefined && { category: parsed.category }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
      ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
    });
    this.logger.log('mail_template', 'block_update', 'Mail template block updated', { block_id: block.id, key: block.key });
    return toBlockDto(block);
  }

  async deleteBlock(id: string) {
    const result = await this.repository.deleteBlock(id);
    this.logger.log('mail_template', 'block_archive', 'Mail template block archived', { block_id: id });
    return result;
  }

  private async toConflictOnDuplicateSlug<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new ConflictException('An email template with this slug already exists.');
      }
      throw error;
    }
  }
}

function toTemplateDto(template: {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  eventKey: string;
  templateType: string;
  folderKey: string;
  subject: string;
  html: string;
  text: string | null;
  status: string;
  approvalState: string;
  variables: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  isArchived?: boolean;
  publishedVersionId?: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { versions: number };
  versions?: Array<{
    id: string;
    previewText: string | null;
    css: string | null;
    status: string;
  }>;
  publishedVersion?: {
    id: string;
    previewText: string | null;
    css: string | null;
  } | null;
  bindings?: Array<{
    id: string;
    eventKey: string;
    templateVersionId: string;
    isEnabled: boolean;
  }>;
}) {
  const sourceVersion = template.publishedVersion ?? template.versions?.[0] ?? null;
  const activeBinding = template.bindings?.find((binding) => binding.isEnabled) ?? null;
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description ?? null,
    eventKey: template.eventKey,
    templateType: template.templateType as 'transactional' | 'marketing',
    folderKey: template.folderKey,
    subject: template.subject,
    previewText: sourceVersion?.previewText ?? null,
    html: template.html,
    css: sourceVersion?.css ?? null,
    text: template.text,
    status: template.status as 'draft' | 'approved' | 'published' | 'archived',
    approvalState: template.approvalState,
    variables: Array.isArray(template.variables) ? template.variables.map(String) : [],
    metadata: asRecord(template.metadata),
    isArchived: template.isArchived ?? false,
    publishedVersionId: template.publishedVersionId ?? null,
    versionCount: template._count?.versions ?? 0,
    activeBinding: activeBinding ? {
      id: activeBinding.id,
      eventKey: activeBinding.eventKey,
      templateVersionId: activeBinding.templateVersionId,
      isEnabled: activeBinding.isEnabled,
    } : null,
    publishedAt: template.publishedAt?.toISOString() ?? null,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

function toVersionDto(version: {
  id: string;
  templateId: string;
  versionNumber: number;
  subject: string;
  previewText?: string | null;
  html: string;
  css?: string | null;
  text: string | null;
  status: string;
  approvalState: string;
  variables: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt?: Date;
  publishedAt: Date | null;
}) {
  return {
    id: version.id,
    templateId: version.templateId,
    versionNumber: version.versionNumber,
    subject: version.subject,
    previewText: version.previewText ?? null,
    html: version.html,
    css: version.css ?? null,
    text: version.text,
    status: version.status,
    approvalState: version.approvalState,
    variables: Array.isArray(version.variables) ? version.variables.map(String) : [],
    metadata: asRecord(version.metadata),
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt?.toISOString() ?? version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toPreviewProfileDto(profile: {
  id: string;
  templateId: string | null;
  eventKey: string | null;
  name: string;
  description: string | null;
  variables: Prisma.JsonValue;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    templateId: profile.templateId,
    eventKey: profile.eventKey,
    name: profile.name,
    description: profile.description,
    variables: asRecord(profile.variables),
    isDefault: profile.isDefault,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function toSnippetDto(snippet: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  templateType: string | null;
  subject: string | null;
  html: string | null;
  css: string | null;
  text: string | null;
  metadata: Prisma.JsonValue;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: snippet.id,
    key: snippet.key,
    name: snippet.name,
    description: snippet.description,
    templateType: snippet.templateType,
    subject: snippet.subject,
    html: snippet.html,
    css: snippet.css,
    text: snippet.text,
    metadata: asRecord(snippet.metadata),
    isSystem: snippet.isSystem,
    isArchived: snippet.isArchived,
    createdAt: snippet.createdAt.toISOString(),
    updatedAt: snippet.updatedAt.toISOString(),
  };
}

function toBlockDto(block: {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  html: string;
  css: string | null;
  metadata: Prisma.JsonValue;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: block.id,
    key: block.key,
    name: block.name,
    category: block.category,
    description: block.description,
    html: block.html,
    css: block.css,
    metadata: asRecord(block.metadata),
    isSystem: block.isSystem,
    isArchived: block.isArchived,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

type ReleaseRevision = {
  id: string;
  templateId: string;
  versionNumber: number;
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: Prisma.JsonValue;
  template: { templateType: string };
};

function toReleaseInput(revision: ReleaseRevision) {
  return {
    subject: revision.subject,
    previewText: revision.previewText ?? '',
    html: revision.html,
    css: revision.css ?? '',
    text: revision.text ?? '',
    variables: declaredTemplateVariables(revision.variables),
    templateType: revision.template.templateType,
  };
}

function buildReleaseProof(revision: ReleaseRevision, variables: Record<string, unknown>, warnings: string[]) {
  return {
    schemaVersion: 1,
    sourceHash: releaseSourceHash(revision),
    variablesHash: stableHash(variables),
    unresolvedCount: 0,
    warningCount: warnings.length,
    warnings,
    recordedAt: new Date().toISOString(),
  };
}

function releaseSourceHash(revision: ReleaseRevision) {
  return stableHash({
    subject: revision.subject,
    previewText: revision.previewText ?? '',
    html: revision.html,
    css: revision.css ?? '',
    text: revision.text ?? '',
    variables: declaredTemplateVariables(revision.variables),
    templateType: revision.template.templateType,
  });
}

function declaredTemplateVariables(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function stableHash(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function renderTemplate(source: string, variables: Record<string, unknown>, options: { escapeHtml?: boolean } = {}) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, variables);
    if (value === undefined || value === null) return '';
    const rendered = String(value);
    return options.escapeHtml ? escapeHtml(rendered) : rendered;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailHtml(html: string, css: string | null) {
  return css?.trim() ? `<style>${css}</style>${html}` : html;
}

function previewEmailFromVariables(variables: Record<string, unknown>) {
  const recipient = asRecord(variables.recipient);
  const contact = asRecord(variables.contact);
  const customer = asRecord(variables.customer);
  return textValue(variables.email)
    || textValue(variables.recipient_email)
    || textValue(recipient.email)
    || textValue(contact.email)
    || textValue(customer.email)
    || 'preview@example.com';
}

function appendMarketingComplianceFooter(input: {
  html: string;
  text: string | null;
  compliance: MarketingComplianceContext;
  urls: Record<string, unknown>;
}) {
  if (input.html.includes('data-mail-compliance-footer')) {
    return { html: input.html, text: input.text, footerInjected: false };
  }
  const unsubscribeUrl = textValue(input.urls.unsubscribe) || input.compliance.preferenceCenterUrl;
  const preferenceUrl = textValue(input.urls.preferenceCenter) || textValue(input.urls.preference_center) || input.compliance.preferenceCenterUrl;
  const physicalAddress = input.compliance.physicalAddress;
  const html = [
    '<div data-mail-compliance-footer="1" style="margin-top:32px;padding:16px 24px;border-top:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#64748b;text-align:center">',
    `<div style="margin-bottom:6px">${escapeHtml(input.compliance.brandName)}${physicalAddress ? ` · ${escapeHtml(physicalAddress)}` : ''}</div>`,
    `<div><a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b">Unsubscribe</a> &middot; <a href="${escapeHtml(preferenceUrl)}" style="color:#64748b">Email preferences</a></div>`,
    '</div>',
  ].join('');
  const nextHtml = /<\/body>/i.test(input.html)
    ? input.html.replace(/<\/body>/i, `${html}</body>`)
    : `${input.html}${html}`;
  const textParts = [input.text ?? '', '', input.compliance.brandName];
  if (physicalAddress) textParts.push(physicalAddress);
  textParts.push(`Unsubscribe: ${unsubscribeUrl}`, `Email preferences: ${preferenceUrl}`);
  return { html: nextHtml, text: textParts.join('\n').trim(), footerInjected: true };
}

function findUnresolvedVariables(sources: string[], variables: Record<string, unknown>) {
  const unresolved = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      const key = match[1];
      const value = key.split('.').reduce<unknown>((current, part) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[part];
      }, variables);
      if (value === undefined || value === null) unresolved.add(key);
    }
  }
  return [...unresolved].sort();
}

function validatePublishableRevision(input: {
  subject: string;
  previewText: string;
  html: string;
  css: string;
  text: string;
  variables: string[];
  templateType: string;
}) {
  const sources = [input.subject, input.previewText, input.html, input.css, input.text];
  const tokenKeys = [...new Set(sources.flatMap((source) => [...source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]).filter(Boolean)))].sort();
  const declared = new Set(input.variables);
  const unknownTokens = declared.size > 0 ? tokenKeys.filter((token) => !declared.has(token)) : [];
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!input.subject.trim()) blockingIssues.push('Subject is required');
  if (!input.html.trim()) blockingIssues.push('HTML body is required');
  blockingIssues.push(...unsafeEmailMarkupIssues(input.html, input.css));
  if (input.templateType !== 'transactional' && !input.html.includes('{{urls.unsubscribe}}')) {
    blockingIssues.push('Marketing and flow templates must include {{urls.unsubscribe}}');
  }
  if (unknownTokens.length > 0) blockingIssues.push(`Unknown template variables: ${unknownTokens.join(', ')}`);
  if (input.subject.length > 70) warnings.push('Subject is longer than 70 characters');
  if (input.previewText.length > 120) warnings.push('Preview text is longer than 120 characters');

  return {
    tokenKeys,
    unknownTokens,
    warnings,
    blockingIssues,
  };
}

function assertSafeEmailSource(html: string, css: string) {
  const issues = unsafeEmailMarkupIssues(html, css);
  if (issues.length > 0) {
    throw new BadRequestException(issues.join(', '));
  }
}

function unsafeEmailMarkupIssues(html: string, css: string) {
  const issues: string[] = [];
  const checks: Array<[boolean, string]> = [
    [/<script[\s>]/i.test(html), 'Script tags are not allowed'],
    [/<form[\s>]/i.test(html), 'Form tags are not allowed'],
    [/<iframe[\s>]/i.test(html), 'Iframe tags are not allowed'],
    [/<(?:object|embed)[\s>]/i.test(html), 'Object and embed tags are not allowed'],
    [/<link[\s>]/i.test(html), 'Link tags are not allowed in email body HTML'],
    [/\son[a-z]+\s*=/i.test(html), 'Inline JavaScript handlers are not allowed'],
    [/javascript:/i.test(html), 'javascript: URLs are not allowed'],
    [/data\s*:\s*text\/html/i.test(html), 'HTML data URLs are not allowed'],
    [/<img\b[^>]*(?:width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?[^>]*width\s*=\s*["']?1["']?)/i.test(html), 'Tracking-pixel sized images are not allowed'],
    [/<img\b[^>]*display\s*:\s*none/i.test(html), 'Hidden tracking images are not allowed'],
    [/<\/style\s*>/i.test(css), 'CSS cannot close the style tag'],
    [/<script[\s>]/i.test(css), 'CSS cannot include script tags'],
    [/@import\b/i.test(css), 'CSS @import is not allowed'],
    [/javascript:/i.test(css), 'CSS javascript: URLs are not allowed'],
    [/\bexpression\s*\(/i.test(css), 'CSS expression() is not allowed'],
    [/\bbehavior\s*:/i.test(css), 'CSS behavior is not allowed'],
  ];
  for (const [blocked, message] of checks) {
    if (blocked && !issues.includes(message)) issues.push(message);
  }
  return issues;
}

function calculateSpamScore(subject: string, html: string) {
  let score = 0;
  const uppercaseRatio = subject ? subject.replace(/[^A-Z]/g, '').length / Math.max(subject.length, 1) : 0;
  if (uppercaseRatio > 0.5) score += 2;
  if ((subject.match(/!/g) || []).length >= 3) score += 2;
  if (/(free|winner|urgent|act now|limited time)/i.test(`${subject} ${html}`)) score += 3;
  if (html.length > 120000) score += 1;
  return Math.min(score, 10);
}

type TemplateAiRevision = {
  id: string;
  templateId: string;
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: Prisma.JsonValue;
};

type TemplateAiDraft = {
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: string[];
};

function normalizeTemplateAiProposal(
  output: unknown,
  revision: TemplateAiRevision,
  mode: EmailTemplateAiEditMode,
  declaredVariables: string[],
): TemplateAiDraft & { summary: string; warnings: string[] } {
  const record = asRecord(output);
  const draft = asRecord(record.draft);
  const source = Object.keys(draft).length > 0 ? draft : record;
  const outputSubject = textValue(source.subject);
  const outputPreview = nullableText(source.previewText ?? source.preview_text);
  const outputHtml = textValue(source.html);
  const outputCss = nullableText(source.css);
  const outputText = nullableText(source.text);
  const outputVariables = Array.isArray(source.variables)
    ? source.variables.map(String).map((item) => item.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim()).filter(Boolean)
    : declaredVariables;

  const base: TemplateAiDraft = {
    subject: revision.subject,
    previewText: revision.previewText ?? null,
    html: revision.html,
    css: revision.css ?? null,
    text: revision.text ?? null,
    variables: declaredVariables,
  };
  const next: TemplateAiDraft = mode === 'template_critique'
    ? base
    : mode === 'html_css_only'
      ? {
          ...base,
          html: outputHtml || base.html,
          css: outputCss ?? base.css,
        }
      : mode === 'subject_variants'
        ? {
            ...base,
            subject: outputSubject || base.subject,
            previewText: outputPreview ?? base.previewText,
          }
        : {
            subject: outputSubject || base.subject,
            previewText: outputPreview ?? base.previewText,
            html: outputHtml || base.html,
            css: outputCss ?? base.css,
            text: outputText ?? base.text,
            variables: outputVariables.length > 0 ? [...new Set(outputVariables)] : base.variables,
          };

  return {
    ...next,
    summary: textValue(record.summary) || textValue(record.explanation) || 'Template proposal generated. Review, save, render, test, approve, and publish through the normal release lane.',
    warnings: Array.isArray(record.warnings) ? record.warnings.map((item) => textValue(item)).filter(Boolean) : [],
  };
}

function changedTemplateFields(revision: TemplateAiRevision, proposal: TemplateAiDraft) {
  const changed: string[] = [];
  if (revision.subject !== proposal.subject) changed.push('subject');
  if ((revision.previewText ?? null) !== (proposal.previewText ?? null)) changed.push('previewText');
  if (revision.html !== proposal.html) changed.push('html');
  if ((revision.css ?? null) !== (proposal.css ?? null)) changed.push('css');
  if ((revision.text ?? null) !== (proposal.text ?? null)) changed.push('text');
  const currentVariables = declaredTemplateVariables(revision.variables).join('\n');
  if (currentVariables !== proposal.variables.slice().sort().join('\n')) changed.push('variables');
  return changed;
}

function templateAssistantSystemPrompt() {
  return `You are the Factory Engine Pro mail template assistant for an admin release lane.
Return STRICT JSON only. Do not include markdown fences.
The JSON shape must be:
{
  "draft": {
    "subject": string,
    "previewText": string|null,
    "html": string,
    "css": string|null,
    "text": string|null,
    "variables": string[]
  },
  "summary": string,
  "warnings": string[]
}

Rules:
- This is a proposal only. Never say it was saved, approved, published, activated, or sent.
- Preserve every required template variable unless the user explicitly asks to remove it.
- Use only variables listed in allowedVariables.
- Use customer-readable business language, not internal system wording.
- For marketing templates, keep an unsubscribe link token in the HTML: {{urls.unsubscribe}}.
- Never use script tags, form tags, inline event handlers, javascript: URLs, iframes, external scripts, or tracking pixels.
- Keep subject lines concise and preview text useful.
- If the instruction is unsafe or under-specified, return the current draft and explain the blocker in warnings.
- For html_css_only, change only html/css.
- For subject_variants, change only subject/previewText.
- For template_critique, leave draft unchanged and put findings in summary/warnings.`;
}

function providerSummary(mode: MailProviderMode) {
  if (mode === 'live') {
    return {
      mode,
      message: 'Mail Center is in live delivery mode. Template test and runtime sends still pass category, approval, compliance, and suppression gates.',
    };
  }
  if (mode === 'test') {
    return {
      mode,
      message: 'Mail Center is in test-only mode. Explicit System Mail tests can contact recipients; other template/runtime deliveries are recorded as proof.',
    };
  }
  return {
    mode,
    message: 'Mail sending is intentionally disabled; template actions record delivery evidence without contacting customers.',
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'template';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function nullableText(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function parseJsonObjectOrNull(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractJsonObjectFromAnthropic(body: Record<string, unknown> | null) {
  const content = Array.isArray(body?.content) ? body.content as Array<Record<string, unknown>> : [];
  const text = content
    .map((item) => item.type === 'text' && typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new BadRequestException('Anthropic template assistant returned an empty response.');
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new BadRequestException('Anthropic template assistant did not return JSON.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    throw new BadRequestException('Anthropic template assistant returned invalid JSON.');
  }
}

function providerErrorMessage(body: Record<string, unknown> | null, fallback: string) {
  const error = asRecord(body?.error);
  return textValue(error.message).slice(0, 300) || fallback.trim().slice(0, 300) || null;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function firstConfiguredUrl(values: Array<string | undefined>) {
  for (const value of values) {
    const url = textValue(value);
    if (/^https?:\/\//i.test(url)) return url.replace(/\/+$/, '');
  }
  return '';
}

function joinUrl(baseUrl: string, path: string) {
  if (!baseUrl) return '';
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}
