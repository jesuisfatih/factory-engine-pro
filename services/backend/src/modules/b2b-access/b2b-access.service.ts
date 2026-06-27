import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateB2BAccessRequestInput, RejectB2BAccessInput } from '@factory-engine-pro/contracts';
import { AuthTokenService } from '../../shared/auth-token.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PasswordService } from '../../shared/password.service.js';
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
    private readonly authTokens: AuthTokenService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly mail: MailService,
  ) {}

  async create(input: CreateB2BAccessRequestInput, file?: UploadFile) {
    const existing = await this.repository.findPendingByEmail(input.email);
    if (existing) {
      throw new ConflictException('You already have a pending application with this email address.');
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
    return {
      success: true,
      message: 'Your application has been received. Our team will review it and contact you within 1-2 business days.',
      requestId: request.id,
    };
  }

  async list(status?: string) {
    return (await this.repository.list(status)).map((request) => this.present(request));
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
    if (existingUser) throw new ConflictException('A customer user with this email already exists');

    const customer = await this.repository.findCustomerByEmail(request.email)
      ?? await this.repository.createCustomer({
        companyName: request.companyName,
        legalName: request.legalName,
        email: request.email,
        phone: request.phone,
        status: 'active',
      });
    const user = await this.repository.createCustomerUser({
      customerId: customer.id,
      email: request.email,
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone,
      passwordHash: request.passwordHash,
    });
    const adminRole = await this.repository.findCustomerRoleBySlug('b2b_admin');
    if (!adminRole) throw new BadRequestException('Default b2b_admin role is missing');
    await this.repository.assignCustomerRole(user.id, adminRole.id);
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const invitationToken = await this.authTokens.create({
      tenantId,
      kind: 'invitation',
      principalType: 'customer_user',
      principalId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { source: 'b2b_access_approval', requestId: request.id },
      createdById: this.tenantContext.get()?.principalId,
    });
    const delivery = await this.mail.sendInvitation({
      to: user.email,
      recipientName: `${user.firstName} ${user.lastName}`.trim(),
      token: invitationToken,
      surface: 'accounts',
      eventKey: 'b2b_access.approved',
      metadata: { requestId: request.id, customerId: customer.id, customerUserId: user.id },
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
      invitation: {
        token: invitationToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        delivery: delivery.status,
        deliveryId: delivery.id,
      },
    };
  }

  async reject(id: string, input: RejectB2BAccessInput) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('B2B access request not found');
    if (request.status !== 'pending') throw new BadRequestException(`Request is already ${request.status}`);
    await this.repository.update(id, {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedByMemberId: this.tenantContext.get()?.principalId ?? null,
      reviewNotes: input.reviewNotes ?? null,
    });
    this.logger.log('b2b_access', 'reject', 'B2B access request rejected', { b2b_request_id: id });
    return { success: true };
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

  private present(request: any) {
    const { passwordHash: _passwordHash, ...safe } = request;
    return safe;
  }
}

function cleanMetadata(metadata: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== '')) as unknown as Prisma.InputJsonValue;
}
