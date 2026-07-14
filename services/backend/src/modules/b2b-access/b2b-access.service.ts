import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  accountPortalExperienceSchema,
  type AccountPortalRequestField,
  type CreateB2BAccessRequestInput,
  type RejectB2BAccessInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { formatDateOnly, parseDateOnlyAtEndOfDay } from '../../shared/date-only.js';
import { PasswordService } from '../../shared/password.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService } from '../mail/mail.service.js';
import { B2BAccessRepository } from './b2b-access.repository.js';
import { TaxExemptionLifecycleService } from './tax-exemption-lifecycle.service.js';

interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

type B2BAccessRequestWithFiles = Prisma.B2BAccessRequestGetPayload<{ include: { files: true } }>;

@Injectable()
export class B2BAccessService {
  constructor(
    private readonly repository: B2BAccessRepository,
    private readonly password: PasswordService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly mail: MailService,
    private readonly taxExemptionLifecycle: TaxExemptionLifecycleService,
  ) {}

  async create(input: CreateB2BAccessRequestInput, file?: UploadFile) {
    await this.ensureTenantForPublicCreate(input);
    const portalExperience = await this.portalExperience();
    this.validateConfiguredRequestFields(input, file, portalExperience.requestAccess.formFields);
    const taxCertificateExpiresAt = parseCertificateExpiration(input.taxCertificateExpiresAt);
    const submittedShopifyCustomerId = cleanOptionalString(input.shopifyCustomerId);
    const matchedCustomer = await this.repository.findCustomerByIdentity(input.email, submittedShopifyCustomerId);
    const shopifyCustomerId = submittedShopifyCustomerId ?? cleanOptionalString(matchedCustomer?.shopifyCustomerId ?? undefined);
    const existing = await this.repository.findPendingByIdentity(input.email, shopifyCustomerId);
    if (existing) {
      throw new ConflictException('You already have a pending B2B access request for this account.');
    }
    const passwordHash = await this.password.hash(input.password);
    const metadata = cleanMetadata({
      flowIntent: input.flowIntent ?? 'request-invitation',
      sourceSurface: input.sourceSurface ?? 'accounts-request-invitation',
      sourcePath: input.sourcePath ?? null,
      sourceUrl: input.sourceUrl ?? null,
      formHandle: input.formHandle ?? null,
      formName: input.formName ?? null,
      shop: input.shop ?? null,
      shopifyCustomerId,
      matchedCustomerId: matchedCustomer?.id ?? null,
      merchantContext: input.merchantContext ?? null,
    });
    const request = await this.repository.create({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      companyName: input.companyName,
      legalName: input.legalName,
      website: input.website ?? null,
      industry: input.industry ?? null,
      estimatedMonthlyVolume: input.estimatedMonthlyVolume ?? null,
      taxCertificateExpiresAt,
      message: input.message ?? null,
      passwordHash,
      shopifyCustomerId,
      metadata,
    });
    if (file) {
      await this.repository.createFile({
        requestId: request.id,
        storageKey: `b2b-certificates/${request.id}/${file.originalname}`,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        contentBase64: file.buffer?.toString('base64') ?? null,
      });
    }
    this.logger.log('b2b_access', 'create', 'B2B access request received', {
      request_id: request.id,
      applicant_email: input.email,
      company_name: input.companyName,
      matched_customer_id: matchedCustomer?.id ?? null,
      shopify_customer_id: shopifyCustomerId,
    });
    await this.sendReceivedNotifications({
      requestId: request.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      companyName: input.companyName,
      sourceSurface: input.sourceSurface ?? 'accounts-request-invitation',
      sourcePath: input.sourcePath ?? null,
      sourceUrl: input.sourceUrl ?? null,
      formHandle: input.formHandle ?? null,
      taxCertificateExpiresAt: input.taxCertificateExpiresAt ?? null,
    });
    return {
      success: true,
      message: 'Your application has been received. Our team will review it and contact you within 1-2 business days.',
      requestId: request.id,
    };
  }

  async list(status?: string) {
    const requests = await this.repository.list(status);
    return Promise.all(requests.map((request) => this.present(request)));
  }

  async findOne(id: string) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('B2B access request not found');
    return this.present(request);
  }

  async approve(id: string) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('B2B access request not found');
    if (request.status !== 'pending') throw new BadRequestException(`Request is already ${request.status}`);
    if (isTaxExemptionRenewal(request)) return this.approveTaxExemptionRenewal(request);
    const existingUser = await this.repository.findCustomerUserByEmail(request.email);
    const requestShopifyCustomerId = cleanOptionalString(request.shopifyCustomerId ?? undefined);
    const matchedCustomer = await this.repository.findCustomerByIdentity(request.email, requestShopifyCustomerId);
    const shopifyCustomerId = requestShopifyCustomerId ?? cleanOptionalString(matchedCustomer?.shopifyCustomerId ?? undefined);
    const customer = matchedCustomer
      ?? await this.repository.createCustomer({
        companyName: request.companyName,
        legalName: request.legalName,
        email: request.email,
        phone: request.phone,
        status: 'active',
        shopifyCustomerId,
      });
    if (shopifyCustomerId && customer.shopifyCustomerId && customer.shopifyCustomerId !== shopifyCustomerId) {
      throw new ConflictException('This application belongs to a different Shopify customer record.');
    }
    if (existingUser && existingUser.customerId !== customer.id) {
      throw new ConflictException('This email is already linked to another portal customer.');
    }
    await this.repository.updateCustomerFromB2BRequest(customer.id, {
      email: request.email,
      phone: request.phone,
      companyName: request.companyName,
      legalName: request.legalName,
      shopifyCustomerId,
    });
    const user = existingUser ?? await this.repository.createCustomerUser({
      customerId: customer.id,
      email: request.email,
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone,
      passwordHash: request.passwordHash,
    });
    if (existingUser) {
      await this.repository.activateCustomerUserForB2B(user.id, user.passwordHash ? null : request.passwordHash);
    }
    const adminRole = await this.repository.findCustomerRoleBySlug('b2b_admin');
    if (!adminRole) throw new BadRequestException('Default b2b_admin role is missing');
    await this.repository.assignCustomerRole(user.id, adminRole.id);
    const ownershipBackfill = await this.repository.backfillApprovedCustomerOwnership({
      customerId: customer.id,
      customerUserId: user.id,
      email: request.email,
      shopifyCustomerId,
    });
    await this.repository.update(id, {
      status: 'approved',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
      resolvedCustomerId: customer.id,
      resolvedCustomerUserId: user.id,
      ...(shopifyCustomerId ? { shopifyCustomerId } : {}),
    });
    if (request.taxCertificateExpiresAt) {
      await this.taxExemptionLifecycle.activateForApprovedRequest({
        customerId: customer.id,
        requestId: request.id,
        expiresAt: request.taxCertificateExpiresAt,
        certificateFileId: request.files[0]?.id ?? null,
      });
    }
    const delivery = await this.mail.sendB2BApplicationApproved({
      to: user.email,
      recipientName: `${user.firstName} ${user.lastName}`.trim(),
      companyName: request.companyName,
      requestId: request.id,
      customerId: customer.id,
      customerUserId: user.id,
      existingPortalAccount: Boolean(existingUser),
    });
    const taxDecisionDelivery = isTaxExemptRequest(request)
      ? await this.mail.sendTaxExemptEvent({
        eventKey: 'tax_exempt.request_approved.user',
        eventId: request.id,
        to: user.email,
        recipientName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        companyName: request.companyName,
        requestId: request.id,
        applicantEmail: request.email,
        expiresAt: request.taxCertificateExpiresAt ? formatDateOnly(request.taxCertificateExpiresAt) : null,
        actionUrl: `${(process.env.ACCOUNTS_URL ?? '').replace(/\/+$/, '')}/login`,
      })
      : null;
    this.logger.log('b2b_access', 'approve', 'B2B access request approved', {
      b2b_request_id: id,
      customer_id: customer.id,
      customer_user_id: user.id,
      shopify_customer_id: shopifyCustomerId,
      ownership_backfill: ownershipBackfill,
    });
    return {
      success: true,
      customerId: customer.id,
      customerUserId: user.id,
      ownershipBackfill,
      invitation: null,
      decisionDelivery: this.presentDecisionDelivery(delivery),
      taxDecisionDelivery: taxDecisionDelivery ? this.presentDecisionDelivery(taxDecisionDelivery) : null,
    };
  }

  async reject(id: string, input: RejectB2BAccessInput) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('B2B access request not found');
    if (request.status !== 'pending') throw new BadRequestException(`Request is already ${request.status}`);
    if (isTaxExemptionRenewal(request)) return this.rejectTaxExemptionRenewal(request, input);
    await this.repository.update(id, {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
      reviewNotes: input.reviewNotes ?? null,
    });
    const decisionDelivery = await this.mail.sendB2BApplicationRejected({
      to: request.email,
      recipientName: `${request.firstName} ${request.lastName}`.trim(),
      companyName: request.companyName,
      reviewNotes: input.reviewNotes,
      requestId: request.id,
    });
    const taxDecisionDelivery = isTaxExemptRequest(request)
      ? await this.mail.sendTaxExemptEvent({
        eventKey: 'tax_exempt.request_rejected.user',
        eventId: request.id,
        to: request.email,
        recipientName: `${request.firstName} ${request.lastName}`.trim() || request.email,
        companyName: request.companyName,
        requestId: request.id,
        applicantEmail: request.email,
        reviewNotes: input.reviewNotes,
        expiresAt: request.taxCertificateExpiresAt ? formatDateOnly(request.taxCertificateExpiresAt) : null,
        actionUrl: `${(process.env.ACCOUNTS_URL ?? '').replace(/\/+$/, '')}/request-invitation`,
      })
      : null;
    this.logger.log('b2b_access', 'reject', 'B2B access request rejected', {
      b2b_request_id: id,
      mail_delivery_id: decisionDelivery.id,
      mail_delivery_status: decisionDelivery.status,
    });
    return {
      success: true,
      decisionDelivery: this.presentDecisionDelivery(decisionDelivery),
      taxDecisionDelivery: taxDecisionDelivery ? this.presentDecisionDelivery(taxDecisionDelivery) : null,
    };
  }

  async certificate(id: string) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('B2B access request not found');
    const file = request.files[0];
    if (!file || !file.contentBase64) throw new NotFoundException('Certificate file not found');
    return {
      filename: file.originalFilename,
      mimeType: file.mimeType,
      buffer: Buffer.from(file.contentBase64, 'base64'),
    };
  }

  private async present(request: any) {
    const { passwordHash: _passwordHash, ...safe } = request;
    const decisionDelivery = await this.repository.findLatestDecisionDelivery(request.id);
    return {
      ...safe,
      decisionDelivery: decisionDelivery ? this.presentDecisionDelivery(decisionDelivery) : null,
    };
  }

  private presentDecisionDelivery(delivery: {
    id: string;
    eventKey: string;
    status: string;
    recipientEmail: string;
    createdAt: Date;
    sentAt: Date | null;
    errorMessage: string | null;
  }) {
    return {
      id: delivery.id,
      eventKey: delivery.eventKey,
      status: delivery.status,
      recipientEmail: delivery.recipientEmail,
      createdAt: delivery.createdAt.toISOString(),
      sentAt: delivery.sentAt?.toISOString() ?? null,
      errorMessage: delivery.errorMessage,
    };
  }

  private async ensureTenantForPublicCreate(input: CreateB2BAccessRequestInput) {
    if (this.tenantContext.get()?.tenantId) return;
    const shop = cleanShopDomain(input.shop);
    if (!shop) {
      throw new BadRequestException('Store context is required for B2B access requests.');
    }
    const config = await this.prisma.tenantConfig.findFirst({
      where: {
        OR: [
          { shopifyDomain: { equals: shop, mode: 'insensitive' } },
          { shopifyDomain: { equals: `https://${shop}`, mode: 'insensitive' } },
          { shopifyDomain: { equals: `http://${shop}`, mode: 'insensitive' } },
        ],
      },
      select: { tenantId: true },
    });
    if (!config?.tenantId) {
      throw new BadRequestException('This storefront is not connected to a B2B workspace yet.');
    }
    this.tenantContext.set({ tenantId: config.tenantId });
  }

  private async approveTaxExemptionRenewal(request: B2BAccessRequestWithFiles) {
    if (!request.resolvedCustomerId || !request.taxCertificateExpiresAt || !request.files[0]) {
      throw new BadRequestException('This certificate renewal is missing its customer, expiration date, or file.');
    }
    const customer = await this.prisma.db.customer.findFirst({ where: { id: request.resolvedCustomerId } });
    if (!customer) throw new NotFoundException('Certificate renewal customer was not found');

    await this.taxExemptionLifecycle.activateForApprovedRequest({
      customerId: customer.id,
      requestId: request.id,
      expiresAt: request.taxCertificateExpiresAt,
      certificateFileId: request.files[0].id,
    });
    await this.repository.update(request.id, {
      status: 'approved',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
    });
    const delivery = await this.mail.sendTaxExemptEvent({
      eventKey: 'tax_exempt.request_approved.user',
      eventId: request.id,
      to: request.email,
      recipientName: `${request.firstName} ${request.lastName}`.trim() || request.email,
      companyName: customer.companyName,
      requestId: request.id,
      applicantEmail: request.email,
      expiresAt: formatDateOnly(request.taxCertificateExpiresAt),
      actionUrl: `${(process.env.ACCOUNTS_URL ?? '').replace(/\/+$/, '')}/profile`,
    });
    this.logger.log('b2b_access', 'tax_exemption_renewal.approve', 'Tax exemption renewal approved', {
      request_id: request.id,
      customer_id: customer.id,
    });
    return {
      success: true,
      customerId: customer.id,
      customerUserId: request.resolvedCustomerUserId,
      ownershipBackfill: null,
      invitation: null,
      decisionDelivery: this.presentDecisionDelivery(delivery),
      taxDecisionDelivery: this.presentDecisionDelivery(delivery),
    };
  }

  private async rejectTaxExemptionRenewal(request: B2BAccessRequestWithFiles, input: RejectB2BAccessInput) {
    await this.repository.update(request.id, {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
      reviewNotes: input.reviewNotes ?? null,
    });
    const delivery = await this.mail.sendTaxExemptEvent({
      eventKey: 'tax_exempt.request_rejected.user',
      eventId: request.id,
      to: request.email,
      recipientName: `${request.firstName} ${request.lastName}`.trim() || request.email,
      companyName: request.companyName,
      requestId: request.id,
      applicantEmail: request.email,
      reviewNotes: input.reviewNotes,
      expiresAt: request.taxCertificateExpiresAt ? formatDateOnly(request.taxCertificateExpiresAt) : null,
      actionUrl: `${(process.env.ACCOUNTS_URL ?? '').replace(/\/+$/, '')}/profile`,
    });
    this.logger.log('b2b_access', 'tax_exemption_renewal.reject', 'Tax exemption renewal rejected', {
      request_id: request.id,
      customer_id: request.resolvedCustomerId,
    });
    return {
      success: true,
      decisionDelivery: this.presentDecisionDelivery(delivery),
      taxDecisionDelivery: this.presentDecisionDelivery(delivery),
    };
  }

  private async portalExperience() {
    const config = await this.prisma.db.tenantConfig.findFirst({
      where: {},
      select: { accountPortalExperience: true },
    });
    const parsed = accountPortalExperienceSchema.safeParse(config?.accountPortalExperience ?? {});
    return parsed.success ? parsed.data : accountPortalExperienceSchema.parse({});
  }

  private validateConfiguredRequestFields(
    input: CreateB2BAccessRequestInput,
    file: UploadFile | undefined,
    fields: AccountPortalRequestField[],
  ) {
    for (const field of fields.filter((item) => item.required)) {
      if (field.type === 'file') {
        if (field.key === 'taxCertificate' && !file) {
          throw new BadRequestException(`${field.label} is required.`);
        }
        continue;
      }
      const value = configuredFieldValue(input, field.key);
      if (!value) throw new BadRequestException(`${field.label} is required.`);
    }
    if (input.taxCertificateExpiresAt) parseCertificateExpiration(input.taxCertificateExpiresAt);
  }

  private async sendReceivedNotifications(input: {
    requestId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    companyName: string;
    sourceSurface?: string | null;
    sourcePath?: string | null;
    sourceUrl?: string | null;
    formHandle?: string | null;
    taxCertificateExpiresAt?: string | null;
  }) {
    const applicantName = `${input.firstName} ${input.lastName}`.trim() || input.email;
    try {
      const recipients = await this.repository.listInternalReviewRecipients();
      const deliveries: Array<Promise<unknown>> = [
        this.mail.sendB2BApplicationReceived({
          to: input.email,
          recipientName: applicantName,
          companyName: input.companyName,
          requestId: input.requestId,
          sourceSurface: input.sourceSurface,
          sourcePath: input.sourcePath,
          sourceUrl: input.sourceUrl,
        }),
        ...recipients.map((recipient) => this.mail.sendB2BApplicationReceivedInternal({
          to: recipient.email,
          recipientName: `${recipient.firstName} ${recipient.lastName}`.trim() || recipient.email,
          applicantName,
          applicantEmail: input.email,
          applicantPhone: input.phone,
          companyName: input.companyName,
          requestId: input.requestId,
          sourceSurface: input.sourceSurface,
          sourcePath: input.sourcePath,
          sourceUrl: input.sourceUrl,
        })),
      ];
      if (input.formHandle === 'tax-exempt-for-businesses' || input.taxCertificateExpiresAt) {
        deliveries.push(this.mail.sendTaxExemptEvent({
          eventKey: 'tax_exempt.request_received.user',
          eventId: input.requestId,
          to: input.email,
          recipientName: applicantName,
          companyName: input.companyName,
          requestId: input.requestId,
          applicantEmail: input.email,
          expiresAt: input.taxCertificateExpiresAt,
        }));
        deliveries.push(...recipients.map((recipient) => this.mail.sendTaxExemptEvent({
          eventKey: 'tax_exempt.request_received.internal',
          eventId: input.requestId,
          to: recipient.email,
          recipientName: `${recipient.firstName} ${recipient.lastName}`.trim() || recipient.email,
          companyName: input.companyName,
          requestId: input.requestId,
          applicantEmail: input.email,
          expiresAt: input.taxCertificateExpiresAt,
          actionUrl: `${(process.env.ADMIN_URL ?? process.env.ADMIN_APP_URL ?? '').replace(/\/+$/, '')}/b2b-access`,
        })));
      }
      await Promise.all(deliveries);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('b2b_access', 'received_mail_failed', message, {
        request_id: input.requestId,
        applicant_email: input.email,
      });
    }
  }
}

function cleanMetadata(metadata: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== '')) as unknown as Prisma.InputJsonValue;
}

function isTaxExemptRequest(request: { metadata: unknown; taxCertificateExpiresAt?: Date | null; files?: unknown[] }) {
  const metadata = request.metadata && typeof request.metadata === 'object' && !Array.isArray(request.metadata)
    ? request.metadata as Record<string, unknown>
    : {};
  return metadata.formHandle === 'tax-exempt-for-businesses'
    || Boolean(request.taxCertificateExpiresAt)
    || Boolean(request.files?.length);
}

function isTaxExemptionRenewal(request: { metadata: unknown }) {
  const metadata = request.metadata && typeof request.metadata === 'object' && !Array.isArray(request.metadata)
    ? request.metadata as Record<string, unknown>
    : {};
  return metadata.formHandle === 'tax-exempt-renewal';
}

function configuredFieldValue(input: CreateB2BAccessRequestInput, key: string) {
  if (key === 'confirmPassword') return input.password;
  const values: Record<string, string | undefined> = {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    companyName: input.companyName,
    legalName: input.legalName,
    website: input.website,
    industry: input.industry,
    estimatedMonthlyVolume: input.estimatedMonthlyVolume,
    taxCertificateExpiresAt: input.taxCertificateExpiresAt,
    message: input.message,
    password: input.password,
  };
  return values[key]?.trim() ?? '';
}

function parseCertificateExpiration(value: string | undefined) {
  if (!value) return null;
  const expiresAt = parseDateOnlyAtEndOfDay(value);
  if (!expiresAt) {
    throw new BadRequestException('Certificate Expiration Date is invalid.');
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new BadRequestException('Tax exemption certificate must be valid beyond today.');
  }
  return expiresAt;
}

function cleanOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanShopDomain(value: string | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
