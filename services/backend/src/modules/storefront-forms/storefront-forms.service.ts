import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { B2BAccessService } from '../b2b-access/b2b-access.service.js';
import { MailService } from '../mail/mail.service.js';
import type { StorefrontQuery } from '../storefront/storefront.controller.js';
import { StorefrontService } from '../storefront/storefront.service.js';
import { SupportService } from '../support/support.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export type StorefrontFormMode = 'support' | 'b2b_request';
export type StorefrontFieldType = 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select' | 'file' | 'password';

export interface StorefrontUploadFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

export interface StorefrontFormField {
  id: string;
  key: string;
  label: string;
  type: StorefrontFieldType;
  required: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  options?: string[];
  accept?: string | null;
  sortOrder: number;
  layout: {
    desktopSpan: 1 | 2;
    startNewRow: boolean;
  };
}

export interface StorefrontFormConfig {
  id: string;
  name: string;
  handle: string;
  description: string;
  mode: StorefrontFormMode;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  layout: {
    desktopColumns: 1 | 2;
  };
  routing: {
    subjectPrefix?: string;
    category?: string;
    priority?: 'critical' | 'urgent' | 'high' | 'medium' | 'low';
    orderFieldKey?: string;
    flowIntent?: 'apply' | 'request-invitation';
    sourceSurface?: string;
    sourcePath?: string | null;
  };
  fields: StorefrontFormField[];
}

@Injectable()
export class StorefrontFormsService {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly support: SupportService,
    private readonly b2bAccess: B2BAccessService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async getPublicForm(handle: string, query: StorefrontQuery) {
    await this.resolveTenant(query);
    const form = this.findDefaultForm(handle);
    return this.publicForm(form);
  }

  async submitPublicForm(
    handle: string,
    query: StorefrontQuery,
    rawBody: Record<string, unknown>,
    files: StorefrontUploadFile[],
  ) {
    const body = normalizeBody(rawBody);
    await this.resolveTenant({ ...query, shop: query.shop || body.shop });
    const form = this.findDefaultForm(handle);
    const filesByField = groupFilesByField(files);
    this.validateRequiredFields(form, body, filesByField);

    if (form.mode === 'b2b_request') {
      return this.submitB2BForm(form, body, filesByField);
    }
    return this.submitSupportForm(form, body, filesByField);
  }

  private async submitSupportForm(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    const tenant = this.tenantContext.require();
    const submitterName = valueOf(body.contactName) || valueOf(body.name) || valueOf(body.email) || 'Storefront Customer';
    const submitterEmail = valueOf(body.email);
    const submitterPhone = valueOf(body.phone);
    const orderNumber = valueOf(body[form.routing.orderFieldKey || 'orderNumber']);
    const subjectSuffix = orderNumber || submitterName || submitterEmail || 'Storefront submission';
    const customer = await this.findCustomer(submitterEmail, submitterPhone);
    const sourceSurface = form.routing.sourceSurface || 'storefront-form';
    const sourcePath = valueOf(body.sourcePath) || form.routing.sourcePath || '';
    const sourceUrl = valueOf(body.sourceUrl);
    const requestSummary = this.buildFormRequestSummary(form, body, filesByField);
    const request = await this.support.create({
      title: `${form.routing.subjectPrefix || form.name} - ${subjectSuffix}`.trim(),
      description: this.formatSupportDescription(form, body, filesByField),
      source: 'customer_self_service',
      surface: 'customer_facing',
      axis: 'support',
      priority: form.routing.priority || 'medium',
      customerId: customer?.id,
      sourceFormId: form.id,
      metadata: cleanMetadata({
        category: form.routing.category || 'other',
        formHandle: form.handle,
        formName: form.name,
        sourceSurface,
        sourcePath,
        sourceUrl,
        shop: body.shop,
        submitterName,
        submitterEmail,
        submitterPhone,
        orderNumber,
        fieldValues: safeFieldValues(form, body),
        files: summarizeFiles(filesByField),
      }),
    });

    await this.sendFormSubmittedEmails(form, {
      form_name: form.name,
      form_handle: form.handle,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      customer_name: submitterName,
      customer_email: submitterEmail,
      order_number: orderNumber,
      request_summary: requestSummary,
      field_summary_html: this.buildFormFieldSummaryHtml(form, body, filesByField),
      source_surface: sourceSurface,
      source_path: sourcePath,
      source_url: sourceUrl,
      ticket_number: String((request as { ticketNumber?: string }).ticketNumber || (request as { number?: string }).number || request.id),
      admin_url: this.adminUrl('/support'),
      action_url: this.adminUrl(`/support?id=${encodeURIComponent(request.id)}`),
    });

    this.logger.log('storefront_forms', 'support_form_submitted', 'Storefront support form submitted', {
      tenant_id: tenant.tenantId,
      form_handle: form.handle,
      service_request_id: request.id,
    });

    return {
      success: true,
      title: form.successTitle,
      message: form.successMessage,
      requestId: request.id,
    };
  }

  private async submitB2BForm(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    const password = required(body.password, 'Password is required');
    const confirmPassword = required(body.confirmPassword, 'Confirm password is required');
    if (password !== confirmPassword) throw new BadRequestException('Passwords do not match.');

    const result = await this.b2bAccess.create({
      email: required(body.email, 'Email is required'),
      firstName: required(body.firstName, 'First name is required'),
      lastName: required(body.lastName, 'Last name is required'),
      companyName: required(body.companyName, 'Company name is required'),
      legalName: required(body.legalName, 'Legal name is required'),
      password,
      phone: optional(body.phone),
      website: optional(body.website),
      industry: optional(body.industry),
      estimatedMonthlyVolume: optional(body.estimatedMonthlyVolume),
      message: optional(this.buildB2BMessage(form, body, filesByField)),
      flowIntent: form.routing.flowIntent || 'apply',
      sourceSurface: form.routing.sourceSurface || 'storefront-form',
      sourcePath: optional(body.sourcePath || form.routing.sourcePath || ''),
      sourceUrl: optional(body.sourceUrl),
      formHandle: form.handle,
      formName: form.name,
      shop: optional(body.shop),
      shopifyCustomerId: optional(body.shopifyCustomerId),
    }, firstFile(filesByField.taxCertificate));

    await this.sendFormSubmittedEmails(form, {
      form_name: form.name,
      form_handle: form.handle,
      submitter_name: `${body.firstName || ''} ${body.lastName || ''}`.trim(),
      submitter_email: body.email,
      customer_name: `${body.firstName || ''} ${body.lastName || ''}`.trim(),
      customer_email: body.email,
      company_name: body.companyName,
      request_summary: this.buildFormRequestSummary(form, body, filesByField),
      field_summary_html: this.buildFormFieldSummaryHtml(form, body, filesByField),
      source_surface: form.routing.sourceSurface || 'storefront-form',
      source_path: body.sourcePath || '',
      source_url: body.sourceUrl || '',
      admin_url: this.adminUrl('/b2b-applications'),
      action_url: this.adminUrl('/b2b-applications'),
    });

    return {
      success: true,
      title: form.successTitle,
      message: form.successMessage,
      requestId: result.requestId,
    };
  }

  private async resolveTenant(query: StorefrontQuery) {
    const tenant = await this.storefront.resolveTenant(query);
    if (!tenant.tenantId) {
      throw new BadRequestException('This storefront is not connected to a workspace yet.');
    }
    this.tenantContext.set({ tenantId: tenant.tenantId });
    return tenant;
  }

  private findDefaultForm(handle: string) {
    const normalized = slugify(handle);
    const form = DEFAULT_FORMS.find((item) => item.handle === normalized);
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  private publicForm(form: StorefrontFormConfig) {
    return {
      id: form.id,
      name: form.name,
      handle: form.handle,
      description: form.description,
      mode: form.mode,
      submitLabel: form.submitLabel,
      successTitle: form.successTitle,
      successMessage: form.successMessage,
      layout: form.layout,
      fields: [...form.fields].sort((left, right) => left.sortOrder - right.sortOrder),
    };
  }

  private validateRequiredFields(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    for (const field of form.fields) {
      if (!field.required) continue;
      if (field.type === 'file') {
        if (!filesByField[field.key]?.length) throw new BadRequestException(`${field.label} is required.`);
        continue;
      }
      if (!valueOf(body[field.key])) throw new BadRequestException(`${field.label} is required.`);
    }
  }

  private async findCustomer(email: string, phone: string) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
    if (phone) or.push({ phone });
    if (!or.length) return null;
    return this.prisma.db.customer.findFirst({ where: { OR: or } });
  }

  private formatSupportDescription(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    const lines = [
      `${form.name} submitted from storefront.`,
      '',
      ...this.summaryEntries(form, body, filesByField).map((entry) => `${entry.label}: ${entry.value}`),
    ];
    const sourceUrl = valueOf(body.sourceUrl);
    if (sourceUrl) lines.push('', `Source URL: ${sourceUrl}`);
    return lines.join('\n').trim();
  }

  private buildFormRequestSummary(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    return this.summaryEntries(form, body, filesByField)
      .map((entry) => `${entry.label}: ${entry.value}`)
      .join('\n');
  }

  private buildFormFieldSummaryHtml(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    return this.summaryEntries(form, body, filesByField)
      .map((entry) => `<li><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</li>`)
      .join('');
  }

  private summaryEntries(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    return form.fields
      .map((field) => {
        if (field.type === 'password') return null;
        if (field.type === 'file') {
          const files = filesByField[field.key] ?? [];
          if (!files.length) return null;
          return { label: field.label, value: files.map((file) => `${file.originalname} (${file.mimetype})`).join(', ') };
        }
        const value = valueOf(body[field.key]);
        return value ? { label: field.label, value } : null;
      })
      .filter((entry): entry is { label: string; value: string } => Boolean(entry));
  }

  private buildB2BMessage(
    form: StorefrontFormConfig,
    body: Record<string, string>,
    filesByField: Record<string, StorefrontUploadFile[]>,
  ) {
    const excluded = new Set([
      'firstName',
      'lastName',
      'email',
      'phone',
      'companyName',
      'legalName',
      'website',
      'industry',
      'estimatedMonthlyVolume',
      'password',
      'confirmPassword',
    ].map(canonicalKey));
    const extraLines = this.summaryEntries(form, body, filesByField)
      .filter((entry) => !excluded.has(canonicalKey(entry.label)) && !excluded.has(canonicalKey(entry.value)))
      .map((entry) => `${entry.label}: ${entry.value}`);
    return [body.message, ...extraLines].filter(Boolean).join('\n');
  }

  private async sendFormSubmittedEmails(form: StorefrontFormConfig, variables: Record<string, string>) {
    const eventBase = `forms.${form.handle}.submitted`;
    const recipientEmail = valueOf(variables.submitter_email);
    const jobs: Array<Promise<unknown>> = [];
    if (recipientEmail) {
      jobs.push(this.mail.sendWorkflowMail({
        eventKey: `${eventBase}.user`,
        to: recipientEmail,
        variables,
        metadata: { source: 'storefront_form', formHandle: form.handle },
      }).catch((error) => this.logMailWarning(`${eventBase}.user`, error)));
    }
    const internalRecipients = await this.listInternalRecipients();
    for (const recipient of internalRecipients) {
      jobs.push(this.mail.sendWorkflowMail({
        eventKey: `${eventBase}.internal`,
        to: recipient.email,
        variables: {
          ...variables,
          recipient_name: `${recipient.firstName} ${recipient.lastName}`.trim() || recipient.email,
          recipient_email: recipient.email,
        },
        metadata: { source: 'storefront_form', formHandle: form.handle, internalRecipientId: recipient.id },
      }).catch((error) => this.logMailWarning(`${eventBase}.internal`, error)));
    }
    await Promise.all(jobs);
  }

  private listInternalRecipients() {
    return this.prisma.db.member.findMany({
      where: {
        status: 'active',
        roleAssignments: { some: { role: { slug: { in: ['owner', 'admin'] } } } },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 25,
    });
  }

  private logMailWarning(eventKey: string, error: unknown) {
    this.logger.warn('storefront_forms', 'mail_event_failed', error instanceof Error ? error.message : String(error), {
      event_key: eventKey,
    });
  }

  private adminUrl(path: string) {
    const base = (this.config.get<string>('ADMIN_APP_URL') || this.config.get<string>('ADMIN_URL') || '').replace(/\/+$/, '');
    return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
  }
}

const DEFAULT_FORMS: StorefrontFormConfig[] = [
  {
    id: 'artwork-updates-request',
    name: 'Artwork Updates Request',
    handle: 'artwork-updates-request',
    description: 'Collect artwork revision requests and route them into customer support.',
    mode: 'support',
    submitLabel: 'Send Artwork Request',
    successTitle: 'Artwork Request Sent',
    successMessage: 'Your artwork update request has been added to the support queue.',
    layout: { desktopColumns: 2 },
    routing: {
      subjectPrefix: 'Artwork Updates Request',
      category: 'order',
      priority: 'medium',
      orderFieldKey: 'orderNumber',
      sourceSurface: 'storefront-form',
    },
    fields: [
      field('contactName', 'Contact Name', 'text', true, 0, 1, 'Jane Doe'),
      field('email', 'Email Address', 'email', true, 1, 1, 'jane@company.com'),
      field('orderNumber', 'Order Number', 'text', true, 2, 1, '#1001'),
      field('artworkChangeDetails', 'Artwork Change Details', 'textarea', true, 3, 2, 'Explain the change you need on the print file.'),
      field('notes', 'Additional Notes', 'textarea', false, 4, 2, 'Anything else the support team should know.'),
    ],
  },
  {
    id: 'order-tracking-request',
    name: 'Order Tracking Request',
    handle: 'order-tracking-request',
    description: 'Collect order status questions and route them into customer support.',
    mode: 'support',
    submitLabel: 'Send Tracking Request',
    successTitle: 'Tracking Request Sent',
    successMessage: 'Your tracking request has been added to the support queue.',
    layout: { desktopColumns: 2 },
    routing: {
      subjectPrefix: 'Order Tracking Request',
      category: 'order',
      priority: 'medium',
      orderFieldKey: 'orderNumber',
      sourceSurface: 'storefront-form',
    },
    fields: [
      field('contactName', 'Contact Name', 'text', true, 0, 1, 'Jane Doe'),
      field('email', 'Email Address', 'email', true, 1, 1, 'jane@company.com'),
      field('orderNumber', 'Order Number', 'text', true, 2, 1, '#1001'),
      field('shippingZip', 'Shipping ZIP / Postal Code', 'text', false, 3, 1, '90210'),
      field('trackingQuestion', 'Tracking Question', 'textarea', true, 4, 2, 'Tell us what you need to know about this shipment.'),
    ],
  },
  {
    id: 'tax-exempt-for-businesses',
    name: 'Tax Exempt for Businesses',
    handle: 'tax-exempt-for-businesses',
    description: 'Collect B2B tax exemption requests and route them into the B2B request queue.',
    mode: 'b2b_request',
    submitLabel: 'Send Tax Exempt Request',
    successTitle: 'Application Submitted',
    successMessage: 'Your tax exempt application has been received. Our team will review it shortly.',
    layout: { desktopColumns: 2 },
    routing: {
      flowIntent: 'apply',
      sourceSurface: 'storefront-form',
    },
    fields: [
      field('firstName', 'First Name', 'text', true, 0, 1, 'Jane'),
      field('lastName', 'Last Name', 'text', true, 1, 1, 'Doe'),
      field('email', 'Email Address', 'email', true, 2, 1, 'jane@company.com'),
      field('phone', 'Phone Number', 'tel', false, 3, 1, '+1 555 555 5555'),
      field('companyName', 'Company Name', 'text', true, 4, 1, 'Acme Prints'),
      field('legalName', 'Legal Name', 'text', true, 5, 1, 'Acme Prints LLC'),
      field('website', 'Website', 'url', false, 6, 1, 'https://example.com'),
      field('industry', 'Industry', 'text', false, 7, 1, 'Apparel & Fashion'),
      field('password', 'Password', 'password', true, 8, 1, 'Minimum 6 characters'),
      field('confirmPassword', 'Confirm Password', 'password', true, 9, 1, 'Repeat your password'),
      field('estimatedMonthlyVolume', 'Estimated Monthly Volume', 'text', false, 10, 1, '100-500 transfers/month'),
      field('taxCertificate', 'Tax Exemption Certificate', 'file', false, 11, 1, null, '.pdf,.jpg,.jpeg,.png,.webp'),
      field('message', 'Additional Information', 'textarea', false, 12, 2, 'Tell us about your business or tax exemption setup.'),
    ],
  },
];

function field(
  key: string,
  label: string,
  type: StorefrontFieldType,
  required: boolean,
  sortOrder: number,
  desktopSpan: 1 | 2,
  placeholder?: string | null,
  accept?: string | null,
): StorefrontFormField {
  return {
    id: key,
    key,
    label,
    type,
    required,
    placeholder,
    accept,
    sortOrder,
    layout: { desktopSpan, startNewRow: false },
  };
}

function normalizeBody(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, valueOf(value)]));
}

function groupFilesByField(files: StorefrontUploadFile[]) {
  const grouped: Record<string, StorefrontUploadFile[]> = {};
  for (const file of files) {
    if (!file.fieldname) continue;
    grouped[file.fieldname] = [...(grouped[file.fieldname] ?? []), file];
  }
  return grouped;
}

function safeFieldValues(form: StorefrontFormConfig, body: Record<string, string>) {
  return Object.fromEntries(
    form.fields
      .filter((field) => field.type !== 'password' && field.type !== 'file')
      .map((field) => [field.key, body[field.key] || null]),
  );
}

function summarizeFiles(filesByField: Record<string, StorefrontUploadFile[]>) {
  return Object.fromEntries(Object.entries(filesByField).map(([key, files]) => [
    key,
    files.map((file) => ({ originalname: file.originalname, mimetype: file.mimetype, size: file.size })),
  ]));
}

function firstFile(files?: StorefrontUploadFile[]) {
  return files?.[0];
}

function required(value: unknown, message: string) {
  const text = valueOf(value);
  if (!text) throw new BadRequestException(message);
  return text;
}

function optional(value: unknown) {
  const text = valueOf(value);
  return text || undefined;
}

function valueOf(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function cleanMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonicalKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
