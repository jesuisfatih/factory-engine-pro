import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export const pricingRuleInclude = {
  targetCustomer: true,
  targetCustomerUser: true,
} satisfies Prisma.PricingRuleInclude;

export type PricingRuleWithRelations = Prisma.PricingRuleGetPayload<{ include: typeof pricingRuleInclude }>;

@Injectable()
export class PricingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list(where: Prisma.PricingRuleWhereInput, take: number) {
    return this.prisma.db.pricingRule.findMany({
      where,
      include: pricingRuleInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  findById(id: string) {
    return this.prisma.db.pricingRule.findFirst({
      where: { id },
      include: pricingRuleInclude,
    });
  }

  async getRequired(id: string) {
    const rule = await this.findById(id);
    if (!rule) throw new NotFoundException('Pricing rule not found');
    return rule;
  }

  create(data: Omit<Prisma.PricingRuleUncheckedCreateInput, 'id' | 'tenantId'>) {
    return this.prisma.db.pricingRule.create({
      data: {
        ...data,
        id: prefixedId('prule'),
        tenantId: this.tenantId(),
      },
      include: pricingRuleInclude,
    });
  }

  async update(id: string, data: Prisma.PricingRuleUpdateManyMutationInput) {
    await this.prisma.db.pricingRule.updateMany({ where: { id }, data });
    return this.getRequired(id);
  }

  delete(id: string) {
    return this.prisma.db.pricingRule.deleteMany({ where: { id } });
  }

  setSyncState(id: string, data: Prisma.PricingRuleUpdateManyMutationInput) {
    return this.prisma.db.pricingRule.updateMany({ where: { id }, data });
  }

  activeRules() {
    const now = new Date();
    return this.prisma.db.pricingRule.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      include: pricingRuleInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
