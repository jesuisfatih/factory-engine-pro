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

  listVersions(ruleId: string) {
    return this.prisma.db.workflowRuleVersion.findMany({
      where: { ruleId },
      orderBy: { versionNo: 'desc' },
    });
  }

  listBackfillReports(ruleId: string) {
    return this.prisma.db.workflowRuleBackfillReport.findMany({
      where: { ruleId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
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

  async activeStatsRows(since: Date) {
    const tenantId = this.tenantId();
    const rules = await this.prisma.db.workflowRule.findMany({
      where: { tenantId, status: 'active' },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
    const executions = rules.length === 0
      ? []
      : await this.prisma.db.workflowRuleExecution.findMany({
          where: {
            tenantId,
            ruleId: { in: rules.map((rule) => rule.id) },
            firstSeenAt: { gte: since },
          },
          orderBy: { firstSeenAt: 'desc' },
        });
    return { rules, executions };
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
    return this.prisma.db.workflowRuleExecution.updateMany({
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

  create(input: SaveWorkflowRuleInput, editedByMemberId: string | null) {
    const tenantId = this.tenantId();
    return this.prisma.db.$transaction(async (tx) => {
      const rule = await tx.workflowRule.create({
        data: {
          id: prefixedId('wrule'),
          tenantId,
          name: input.name,
          status: input.definition.status,
          priority: input.definition.priority,
          composable: input.definition.composable,
          trigger: input.definition.trigger,
          definition: input.definition as Prisma.InputJsonValue,
        },
      });
      await createVersion(tx, tenantId, rule.id, 1, input, editedByMemberId, input.comment ?? 'Rule created');
      return rule;
    });
  }

  update(id: string, input: SaveWorkflowRuleInput, editedByMemberId: string | null) {
    const tenantId = this.tenantId();
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.workflowRule.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      await tx.workflowRule.updateMany({
        where: { id, tenantId },
        data: {
          name: input.name,
          status: input.definition.status,
          priority: input.definition.priority,
          composable: input.definition.composable,
          trigger: input.definition.trigger,
          definition: input.definition as Prisma.InputJsonValue,
        },
      });
      const rule = await tx.workflowRule.findFirst({ where: { id, tenantId } });
      if (!rule) return null;
      await createVersion(tx, tenantId, rule.id, await nextVersionNo(tx, tenantId, rule.id), input, editedByMemberId, input.comment ?? 'Rule edited');
      return rule;
    });
  }

  rollback(id: string, versionNo: number, editedByMemberId: string | null, comment?: string) {
    const tenantId = this.tenantId();
    return this.prisma.db.$transaction(async (tx) => {
      const version = await tx.workflowRuleVersion.findFirst({ where: { ruleId: id, tenantId, versionNo } });
      if (!version) return null;
      const snapshot = inputFromSnapshot(version.jsonSnapshot);
      await tx.workflowRule.updateMany({
        where: { id, tenantId },
        data: {
          name: snapshot.name,
          status: snapshot.definition.status,
          priority: snapshot.definition.priority,
          composable: snapshot.definition.composable,
          trigger: snapshot.definition.trigger,
          definition: snapshot.definition as Prisma.InputJsonValue,
        },
      });
      const rule = await tx.workflowRule.findFirst({ where: { id, tenantId } });
      if (!rule) return null;
      await createVersion(
        tx,
        tenantId,
        rule.id,
        await nextVersionNo(tx, tenantId, rule.id),
        { ...snapshot, comment: comment ?? `Rollback to version ${versionNo}` },
        editedByMemberId,
        comment ?? `Rollback to version ${versionNo}`,
      );
      return rule;
    });
  }

  createBackfillReport(input: {
    ruleId: string;
    ruleName: string;
    trigger: string;
    recentDays: number;
    status: string;
    windowStart: Date;
    windowEnd: Date;
    evaluatedEvents: number;
    matchedEvents: number;
    skippedEvents: number;
    wouldCreateTasks: number;
    actualTasksCreated: number;
    result: Prisma.InputJsonValue;
    createdByMemberId: string | null;
    finishedAt: Date;
  }) {
    return this.prisma.db.workflowRuleBackfillReport.create({
      data: {
        id: prefixedId('wrbf'),
        tenantId: this.tenantId(),
        ruleId: input.ruleId,
        ruleName: input.ruleName,
        trigger: input.trigger,
        recentDays: input.recentDays,
        status: input.status,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        evaluatedEvents: input.evaluatedEvents,
        matchedEvents: input.matchedEvents,
        skippedEvents: input.skippedEvents,
        wouldCreateTasks: input.wouldCreateTasks,
        actualTasksCreated: input.actualTasksCreated,
        result: input.result,
        createdByMemberId: input.createdByMemberId,
        finishedAt: input.finishedAt,
      },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}

async function nextVersionNo(tx: Prisma.TransactionClient, tenantId: string, ruleId: string) {
  const aggregate = await tx.workflowRuleVersion.aggregate({
    where: { tenantId, ruleId },
    _max: { versionNo: true },
  });
  return (aggregate._max.versionNo ?? 0) + 1;
}

function createVersion(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ruleId: string,
  versionNo: number,
  input: SaveWorkflowRuleInput,
  editedByMemberId: string | null,
  comment: string | null,
) {
  return tx.workflowRuleVersion.create({
    data: {
      id: prefixedId('wrv'),
      tenantId,
      ruleId,
      versionNo,
      jsonSnapshot: snapshotFor(input) as Prisma.InputJsonValue,
      editedByMemberId,
      comment,
    },
  });
}

function snapshotFor(input: SaveWorkflowRuleInput) {
  return {
    name: input.name,
    definition: input.definition,
  };
}

function inputFromSnapshot(snapshot: Prisma.JsonValue): SaveWorkflowRuleInput {
  const value = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown>
    : {};
  return {
    name: String(value.name ?? 'Restored workflow rule'),
    definition: value.definition as SaveWorkflowRuleInput['definition'],
  };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}
