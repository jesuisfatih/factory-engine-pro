import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateB2BAccessRequestInput, RejectB2BAccessInput } from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { PasswordService } from '../../shared/password.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService } from '../mail/mail.service.js';
import { B2BAccessRepository } from './b2b-access.repository.js';

interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

@Injectable()
export class B2BAccessService {
  constructor(
    private readonly repository: B2BAccessRepository,
    private readonly password: PasswordService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly mail: MailService,
  ) {}

  async create(input: CreateB2BAccessRequestInput, file?: UploadFile) {
    await this.ensureTenantForPublicCreate(input);
    const shopifyCustomerId = cleanOptionalString(input.shopifyCustomerId);
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
    const existingUser = await this.repository.findCustomerUserByEmail(request.email);
    const shopifyCustomerId = cleanOptionalString(request.shopifyCustomerId ?? undefined);
    const customer = await this.repository.findCustomerByIdentity(request.email, shopifyCustomerId)
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
    const delivery = await this.mail.sendB2BApplicationApproved({
      to: user.email,
      recipientName: `${user.firstName} ${user.lastName}`.trim(),
      companyName: request.companyName,
      requestId: request.id,
      customerId: customer.id,
      customerUserId: user.id,
      existingPortalAccount: Boolean(existingUser),
    });
    await this.repository.update(id, {
      status: 'approved',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
      resolvedCustomerId: customer.id,
      resolvedCustomerUserId: user.id,
    });
    this.logger.log('b2b_access', 'approve', 'B2B access request approved', {
      b2b_request_id: id,
      customer_id: customer.id,
      customer_user_id: user.id,
    });
    return {
      success: true,
      customerId: customer.id,
      customerUserId: user.id,
      invitation: null,
      decisionDelivery: this.presentDecisionDelivery(delivery),
    };
  }

  async reject(id: string, input: RejectB2BAccessInput) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('B2B access request not found');
    if (request.status !== 'pending') throw new BadRequestException(`Request is already ${request.status}`);
    const decisionDelivery = await this.mail.sendB2BApplicationRejected({
      to: request.email,
      recipientName: `${request.firstName} ${request.lastName}`.trim(),
      companyName: request.companyName,
      reviewNotes: input.reviewNotes,
      requestId: request.id,
    });
    await this.repository.update(id, {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
      reviewNotes: input.reviewNotes ?? null,
    });
    this.logger.log('b2b_access', 'reject', 'B2B access request rejected', {
      b2b_request_id: id,
      mail_delivery_id: decisionDelivery.id,
      mail_delivery_status: decisionDelivery.status,
    });
    return { success: true, decisionDelivery: this.presentDecisionDelivery(decisionDelivery) };
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
  }) {
    const applicantName = `${input.firstName} ${input.lastName}`.trim() || input.email;
    try {
      await this.mail.sendB2BApplicationReceived({
        to: input.email,
        recipientName: applicantName,
        companyName: input.companyName,
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        sourcePath: input.sourcePath,
        sourceUrl: input.sourceUrl,
      });
      const recipients = await this.repository.listInternalReviewRecipients();
      await Promise.all(recipients.map((recipient) => this.mail.sendB2BApplicationReceivedInternal({
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
      })));
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

function cleanOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanShopDomain(value: string | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
