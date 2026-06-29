import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  commissionProfileSchema,
  commissionRuleSchema,
  type CommissionProfileDto,
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

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}
