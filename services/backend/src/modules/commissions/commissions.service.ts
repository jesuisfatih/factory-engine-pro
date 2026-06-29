import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  commissionRequestSchema,
  commissionProfileSchema,
  commissionRuleSchema,
  submitCommissionRequestSchema,
  type CommissionProfileDto,
  type CommissionRequestDto,
  type ReviewCommissionRequestInput,
  type SubmitCommissionRequestInput,
  type UpsertCommissionProfileInput,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async listProfiles(): Promise<CommissionProfileDto[]> {
    const rows = await this.prisma.db.commissionProfile.findMany({
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }, { name: 'asc' }],
      take: 200,
    });
    return rows.map((row) => this.mapProfile(row));
  }

  async listRequests(scope: 'all' | 'mine' = 'all'): Promise<CommissionRequestDto[]> {
    const actor = await this.currentMember();
    const rows = await this.prisma.db.commissionRequest.findMany({
      where: scope === 'mine' ? { requesterMemberId: actor.id } : {},
      include: commissionRequestInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: scope === 'mine' ? 100 : 250,
    });
    return rows.map((row) => this.mapRequest(row));
  }

  async submitRequest(input: SubmitCommissionRequestInput): Promise<CommissionRequestDto> {
    const actor = await this.currentMember();
    const parsed = submitCommissionRequestSchema.parse(input);
    const tenantId = this.tenantId();
    const customer = await this.prisma.db.customer.findFirst({
      where: { id: parsed.customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const order = parsed.orderId
      ? await this.prisma.db.commerceOrder.findFirst({
          where: { id: parsed.orderId, customerId: parsed.customerId },
          select: { id: true },
        })
      : null;
    if (parsed.orderId && !order) throw new BadRequestException('Order does not belong to this customer');
    const created = await this.prisma.db.commissionRequest.create({
      data: {
        id: prefixedId('creq'),
        tenantId,
        requesterMemberId: actor.id,
        customerId: parsed.customerId,
        orderId: parsed.orderId ?? null,
        productReference: parsed.productReference,
        saleReference: parsed.saleReference,
        percent: parsed.percent,
        note: parsed.note ?? null,
        status: 'pending_admin_approval',
      },
      include: commissionRequestInclude,
    });
    this.logger.log('commissions', 'request.submit', 'Commission request submitted', {
      commission_request_id: created.id,
      requester_member_id: actor.id,
      customer_id: parsed.customerId,
      order_id: parsed.orderId ?? null,
    });
    return this.mapRequest(created);
  }

  async reviewRequest(id: string, input: ReviewCommissionRequestInput): Promise<CommissionRequestDto> {
    const actor = await this.currentMember();
    const existing = await this.prisma.db.commissionRequest.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Commission request not found');
    if (existing.status !== 'pending_admin_approval') {
      throw new BadRequestException('Only pending commission requests can be reviewed');
    }
    const updated = await this.prisma.db.commissionRequest.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        reviewedByMemberId: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
      },
      include: commissionRequestInclude,
    });
    this.logger.log('commissions', 'request.review', 'Commission request reviewed by admin', {
      commission_request_id: id,
      status: input.status,
      reviewer_member_id: actor.id,
    });
    return this.mapRequest(updated);
  }

  async upsertProfile(id: string, input: UpsertCommissionProfileInput): Promise<CommissionProfileDto> {
    const profileId = id.startsWith('cp-') ? prefixedId('cprof') : id;
    const tenantId = this.tenantId();
    const rules = commissionRuleSchema.array().parse(input.rules);
    const existing = await this.prisma.db.commissionProfile.findFirst({ where: { id, tenantId } });
    const saved = existing
      ? await this.prisma.db.commissionProfile.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            assignType: input.assignType,
            assigneeId: input.assigneeId ?? null,
            active: input.active,
            rules: rules as Prisma.InputJsonValue,
          },
        })
      : await this.prisma.db.commissionProfile.create({
          data: {
            id: profileId,
            tenantId,
            name: input.name,
            assignType: input.assignType,
            assigneeId: input.assigneeId ?? null,
            active: input.active,
            rules: rules as Prisma.InputJsonValue,
          },
        });

    this.logger.log('commissions', existing ? 'profile.update' : 'profile.create', 'Commission profile saved', {
      commission_profile_id: saved.id,
      assign_type: saved.assignType,
      assignee_id: saved.assigneeId,
    });
    return this.mapProfile(saved);
  }

  async deleteProfile(id: string) {
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.commissionProfile.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Commission profile not found');
    await this.prisma.db.commissionProfile.delete({ where: { id } });
    this.logger.log('commissions', 'profile.delete', 'Commission profile deleted', { commission_profile_id: id });
    return { ok: true };
  }

  private mapProfile(row: {
    id: string;
    name: string;
    assignType: string;
    assigneeId: string | null;
    active: boolean;
    rules: Prisma.JsonValue;
    updatedAt: Date;
  }): CommissionProfileDto {
    const parsedRules = commissionRuleSchema.array().safeParse(row.rules);
    return commissionProfileSchema.parse({
      id: row.id,
      name: row.name,
      assignType: row.assignType,
      assigneeId: row.assigneeId,
      active: row.active,
      rules: parsedRules.success ? parsedRules.data : [],
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private mapRequest(row: CommissionRequestRow): CommissionRequestDto {
    return commissionRequestSchema.parse({
      id: row.id,
      requesterMemberId: row.requesterMemberId,
      requesterName: memberName(row.requester),
      requesterEmail: row.requester.email,
      customerId: row.customerId,
      customerName: customerName(row.customer),
      customerEmail: row.customer.email,
      orderId: row.orderId,
      orderNumber: row.order?.shopifyOrderNumber ?? null,
      orderTotal: row.order ? Number(row.order.totalPrice ?? 0) : null,
      productReference: row.productReference,
      saleReference: row.saleReference,
      percent: Number(row.percent),
      note: row.note,
      status: row.status,
      reviewedByMemberId: row.reviewedByMemberId,
      reviewerName: row.reviewer ? memberName(row.reviewer) : null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async currentMember() {
    const context = this.tenantContext.require();
    if (context.principalType !== 'member' || !context.principalId) {
      throw new BadRequestException('Commission requests require a member session');
    }
    const member = await this.prisma.db.member.findFirst({ where: { id: context.principalId, status: 'active' } });
    if (!member) throw new BadRequestException('Member session is no longer active');
    return member;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}

const commissionRequestInclude = {
  requester: true,
  customer: true,
  order: true,
  reviewer: true,
} satisfies Prisma.CommissionRequestInclude;

type CommissionRequestRow = Prisma.CommissionRequestGetPayload<{
  include: typeof commissionRequestInclude;
}>;

function memberName(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName} ${member.lastName}`.trim() || member.email;
}

function customerName(customer: { companyName: string; firstName?: string | null; lastName?: string | null; email?: string | null; id: string }) {
  return customer.companyName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.email || customer.id;
}
