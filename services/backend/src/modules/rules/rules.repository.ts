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

  findRunnableByTrigger(trigger: WorkflowTrigger) {
    return this.prisma.db.workflowRule.findMany({
      where: { trigger, status: { in: ['active', 'shadow'] } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async claimExecution(input: {
    eventId: string;
    ruleId: string;
    trigger: WorkflowTrigger;
  }) {
    try {
      return await this.prisma.db.workflowRuleExecution.create({
        data: {
          id: prefixedId('wrex'),
          tenantId: this.tenantId(),
          eventId: input.eventId,
          ruleId: input.ruleId,
          trigger: input.trigger,
          status: 'started',
          result: {},
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    }
  }

  completeExecution(id: string, data: {
    status: string;
    taskIds: string[];
    result: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.workflowRuleExecution.update({
      where: { id },
      data,
    });
  }

  findCooldown(ruleId: string, customerId: string) {
    return this.prisma.db.workflowRuleCooldown.findFirst({
      where: {
        ruleId,
        customerId,
      },
    });
  }

  upsertCooldown(input: {
    ruleId: string;
    customerId: string;
    windowStartedAt: Date;
    lastFiredAt: Date;
    fireCount: number;
  }) {
    return this.prisma.db.workflowRuleCooldown.upsert({
      where: {
        tenantId_ruleId_customerId: {
          tenantId: this.tenantId(),
          ruleId: input.ruleId,
          customerId: input.customerId,
        },
      },
      create: {
        id: prefixedId('wrcd'),
        tenantId: this.tenantId(),
        ruleId: input.ruleId,
        customerId: input.customerId,
        windowStartedAt: input.windowStartedAt,
        lastFiredAt: input.lastFiredAt,
        fireCount: input.fireCount,
      },
      update: {
        windowStartedAt: input.windowStartedAt,
        lastFiredAt: input.lastFiredAt,
        fireCount: input.fireCount,
      },
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

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}
