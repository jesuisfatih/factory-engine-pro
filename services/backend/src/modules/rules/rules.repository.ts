import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SaveWorkflowRuleInput, WorkflowTrigger } from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class RulesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list() {
    return this.prisma.db.workflowRule.findMany({
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  findById(id: string) {
    return this.prisma.db.workflowRule.findFirst({ where: { id } });
  }

  findActiveByTrigger(trigger: WorkflowTrigger) {
    return this.prisma.db.workflowRule.findMany({
      where: { trigger, status: 'active' },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  create(input: SaveWorkflowRuleInput) {
    return this.prisma.db.workflowRule.create({
      data: {
        id: prefixedId('wrule'),
        tenantId: this.tenantId(),
        name: input.name,
        status: input.definition.status,
        priority: input.definition.priority,
        composable: input.definition.composable,
        trigger: input.definition.trigger,
        definition: input.definition as Prisma.InputJsonValue,
      },
    });
  }

  update(id: string, input: SaveWorkflowRuleInput) {
    return this.prisma.db.workflowRule.updateMany({
      where: { id },
      data: {
        name: input.name,
        status: input.definition.status,
        priority: input.definition.priority,
        composable: input.definition.composable,
        trigger: input.definition.trigger,
        definition: input.definition as Prisma.InputJsonValue,
      },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
