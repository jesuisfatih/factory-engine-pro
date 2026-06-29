import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export interface SegmentMembershipMetadata {
  source?: string;
  shopifySegmentRef?: string | null;
  score?: number | null;
}

@Injectable()
export class SegmentsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list() {
    return this.prisma.db.segment.findMany({
      include: { ownerships: { include: { member: true } } },
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findById(id: string) {
    return this.prisma.db.segment.findFirst({
      where: { id },
      include: { ownerships: { include: { member: true } } },
    });
  }

  create(data: {
    name: string;
    description?: string | null;
    color: string;
    priority: number;
    priorityGlobal: number;
    audienceType: string;
    lifecycleStage?: string | null;
    matchMode: string;
    conditions: Prisma.InputJsonValue;
    rules: Prisma.InputJsonValue;
    rulesHash: string;
    isActive: boolean;
  }) {
    return this.prisma.db.segment.create({
      data: {
        id: prefixedId('seg'),
        tenantId: this.tenantId(),
        ...data,
      },
    });
  }

  async update(id: string, data: Prisma.SegmentUpdateManyMutationInput) {
    await this.prisma.db.segment.updateMany({ where: { id }, data });
    return this.findById(id);
  }

  delete(id: string) {
    return this.prisma.db.segment.deleteMany({ where: { id } });
  }

  listCustomers() {
    return this.prisma.db.customer.findMany({
      include: {
        insight: true,
        customerUsers: {
          include: { roleAssignments: { include: { role: true } } },
        },
      },
      orderBy: [{ totalSpent: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findCustomerById(customerId: string) {
    return this.prisma.db.customer.findFirst({
      where: { id: customerId },
      include: {
        insight: true,
        customerUsers: {
          include: { roleAssignments: { include: { role: true } } },
        },
      },
    });
  }

  listOrdersSince(since: Date | null) {
    return this.prisma.db.commerceOrder.findMany({
      where: since ? { OR: [{ processedAt: { gte: since } }, { createdAt: { gte: since } }] } : {},
      select: {
        id: true,
        customerId: true,
        shopifyCustomerId: true,
        totalPrice: true,
        lineItems: true,
        processedAt: true,
        createdAt: true,
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listProducts() {
    return this.prisma.db.catalogProduct.findMany({
      select: {
        shopifyProductId: true,
        tags: true,
        collections: true,
      },
    });
  }

  listActiveSegments() {
    return this.prisma.db.segment.findMany({
      where: { isActive: true },
      include: { ownerships: { include: { member: true } } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  listMembershipsForCustomer(customerId: string) {
    return this.prisma.db.segmentCustomerMembership.findMany({
      where: { customerId },
      include: { segment: true },
    });
  }

  listMemberships(segmentId: string) {
    return this.prisma.db.segmentCustomerMembership.findMany({
      where: { segmentId },
      include: { customer: { include: { insight: true } } },
      orderBy: { matchedAt: 'desc' },
      take: 100,
    });
  }

  listMembershipCustomerIds(segmentId: string) {
    return this.prisma.db.segmentCustomerMembership.findMany({
      where: { segmentId },
      select: { customerId: true },
    });
  }

  async replaceMemberships(
    segmentId: string,
    customerIds: string[],
    metadataByCustomer: Map<string, SegmentMembershipMetadata> = new Map(),
  ) {
    await this.prisma.db.segmentCustomerMembership.deleteMany({ where: { segmentId } });
    if (customerIds.length > 0) {
      await this.prisma.db.segmentCustomerMembership.createMany({
        data: customerIds.map((customerId) => {
          const metadata = metadataByCustomer.get(customerId);
          return {
            id: prefixedId('smem'),
            tenantId: this.tenantId(),
            segmentId,
            customerId,
            source: metadata?.source ?? 'auto',
            shopifySegmentRef: metadata?.shopifySegmentRef ?? null,
            score: metadata?.score ?? 1,
          };
        }),
        skipDuplicates: true,
      });
    }
    await this.prisma.db.segment.updateMany({
      where: { id: segmentId },
      data: { customerCount: customerIds.length, lastEvaluatedAt: new Date() },
    });
  }

  async syncAssignmentHistory(segment: {
    id: string;
    name: string;
    lifecycleStage: string | null;
  }, matchedCustomerIds: string[], metricsByCustomer: Map<string, Record<string, unknown>>) {
    await this.withSegmentAssignmentWriteLock(async (db, tenantId) => {
      const now = new Date();
      const uniqueMatched = Array.from(new Set(matchedCustomerIds));
      await db.segmentCustomerAssignment.updateMany({
        where: { tenantId, segmentId: segment.id, customerId: { notIn: uniqueMatched } },
        data: {
          isMatched: false,
          isCurrent: false,
          lastEvaluatedAt: now,
        },
      });
      for (const customerId of uniqueMatched) {
        await db.segmentCustomerAssignment.upsert({
          where: { tenantId_customerId_segmentId: { tenantId, customerId, segmentId: segment.id } },
          create: {
            id: prefixedId('sasg'),
            tenantId,
            customerId,
            segmentId: segment.id,
            segmentName: segment.name,
            lifecycleStage: segment.lifecycleStage,
            isMatched: true,
            isCurrent: false,
            firstMatchedAt: now,
            lastMatchedAt: now,
            lastEvaluatedAt: now,
            matchCount: 1,
            metricsSnapshot: (metricsByCustomer.get(customerId) ?? {}) as Prisma.InputJsonValue,
          },
          update: {
            segmentName: segment.name,
            lifecycleStage: segment.lifecycleStage,
            isMatched: true,
            lastMatchedAt: now,
            lastEvaluatedAt: now,
            matchCount: { increment: 1 },
            metricsSnapshot: (metricsByCustomer.get(customerId) ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
      await this.refreshCurrentAssignments(db, tenantId);
    });
  }

  async syncSalesAssignmentsFromCurrentSegments(customerIds: string[]) {
    return this.withSegmentAssignmentWriteLock(async (db, tenantId) => {
      const uniqueCustomerIds = Array.from(new Set(customerIds.filter(Boolean)));
      if (uniqueCustomerIds.length === 0) return { assigned: 0, skipped: 0, cleared: 0 };

      const [currentAssignments, existingSalesAssignments] = await Promise.all([
        db.segmentCustomerAssignment.findMany({
          where: {
            tenantId,
            customerId: { in: uniqueCustomerIds },
            isCurrent: true,
            isMatched: true,
          },
          include: {
            segment: {
              include: {
                ownerships: {
                  where: {
                    tenantId,
                    autoAssignNew: true,
                    member: { status: 'active' },
                  },
                  include: { member: true },
                  orderBy: [{ priority: 'desc' }, { updatedAt: 'asc' }],
                },
              },
            },
          },
        }),
        db.customerAssignment.findMany({
          where: { tenantId, customerId: { in: uniqueCustomerIds }, axis: 'sales' },
          include: customerAssignmentMemberInclude,
        }),
      ]);

      const currentByCustomer = new Map(currentAssignments.map((assignment) => [assignment.customerId, assignment]));
      const existingByCustomer = new Map(existingSalesAssignments.map((assignment) => [assignment.customerId, assignment]));
      let assigned = 0;
      let skipped = 0;
      let cleared = 0;

      for (const customerId of uniqueCustomerIds) {
        const current = currentByCustomer.get(customerId);
        const owner = current?.segment.ownerships[0] ?? null;
        const existing = existingByCustomer.get(customerId);

        if (!current || !owner) {
          if (existing && isSegmentOwnershipSource(existing.source)) {
            await db.customerAssignment.deleteMany({ where: { tenantId, id: existing.id } });
            await this.createCustomerAssignmentAudit(db, tenantId, {
              customerId,
              action: 'primary_cleared',
              previousMemberId: existing.memberId,
              newMemberId: null,
              source: SEGMENT_ASSIGNMENT_SOURCE,
              reason: 'Customer no longer has a current segment owner.',
              metadata: {
                previousAssignmentId: existing.id,
                previousSource: existing.source,
              },
            });
            cleared += 1;
          }
          continue;
        }

        if (existing && existing.memberId !== owner.memberId && !isSegmentOwnershipSource(existing.source)) {
          await this.createCustomerAssignmentAudit(db, tenantId, {
            customerId,
            action: 'auto_reassign_skipped',
            previousMemberId: existing.memberId,
            newMemberId: owner.memberId,
            source: SEGMENT_ASSIGNMENT_SOURCE,
            reason: `Manual sales owner preserved while segment ${current.segment.name} requested auto assignment.`,
            metadata: {
              segmentId: current.segmentId,
              segmentName: current.segment.name,
              preservedAssignmentId: existing.id,
              preservedSource: existing.source,
              attemptedMemberId: owner.memberId,
            },
          });
          skipped += 1;
          continue;
        }

        await db.customerAssignment.upsert({
          where: {
            tenantId_customerId_axis: {
              tenantId,
              customerId,
              axis: 'sales',
            },
          },
          create: {
            id: prefixedId('casn'),
            tenantId,
            customerId,
            axis: 'sales',
            memberId: owner.memberId,
            source: SEGMENT_ASSIGNMENT_SOURCE,
            reason: `Segment ownership: ${current.segment.name}`,
            approvedByMemberId: null,
            approvedAt: new Date(),
          },
          update: {
            memberId: owner.memberId,
            source: SEGMENT_ASSIGNMENT_SOURCE,
            reason: `Segment ownership: ${current.segment.name}`,
            approvedByMemberId: null,
            approvedAt: new Date(),
            isPrimary: true,
          },
        });
        await this.createCustomerAssignmentAudit(db, tenantId, {
          customerId,
          action: 'primary_assigned',
          previousMemberId: existing?.memberId ?? null,
          newMemberId: owner.memberId,
          source: SEGMENT_ASSIGNMENT_SOURCE,
          reason: `Segment ownership: ${current.segment.name}`,
          metadata: {
            segmentId: current.segmentId,
            segmentName: current.segment.name,
            currentSegmentAssignmentId: current.id,
            unchanged: existing?.memberId === owner.memberId,
          },
        });
        assigned += 1;
      }

      return { assigned, skipped, cleared };
    });
  }

  private async refreshCurrentAssignments(db: Prisma.TransactionClient, tenantId: string) {
    const rows = await db.segmentCustomerAssignment.findMany({
      where: {
        tenantId,
        isMatched: true,
      },
      include: { segment: { select: { priorityGlobal: true, priority: true } } },
      orderBy: [{ lastMatchedAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const currentByCustomer = new Map<string, string>();
    for (const row of rows) {
      const existingId = currentByCustomer.get(row.customerId);
      if (!existingId) {
        currentByCustomer.set(row.customerId, row.id);
        continue;
      }
      const existing = rows.find((candidate) => candidate.id === existingId);
      const existingPriority = (existing?.segment.priorityGlobal ?? existing?.segment.priority ?? 0);
      const nextPriority = row.segment.priorityGlobal ?? row.segment.priority ?? 0;
      if (nextPriority > existingPriority) currentByCustomer.set(row.customerId, row.id);
    }
    const currentIds = Array.from(currentByCustomer.values());
    await db.segmentCustomerAssignment.updateMany({
      where: currentIds.length ? { tenantId, id: { notIn: currentIds } } : { tenantId },
      data: { isCurrent: false },
    });
    if (currentIds.length > 0) {
      await db.segmentCustomerAssignment.updateMany({
        where: { tenantId, id: { in: currentIds } },
        data: { isCurrent: true },
      });
    }
  }

  async upsertMembership(segmentId: string, customerId: string, metadata: SegmentMembershipMetadata = {}) {
    const tenantId = this.tenantId();
    await this.prisma.db.segmentCustomerMembership.upsert({
      where: { tenantId_segmentId_customerId: { tenantId, segmentId, customerId } },
      create: {
        id: prefixedId('smem'),
        tenantId,
        segmentId,
        customerId,
        source: metadata.source ?? 'auto',
        shopifySegmentRef: metadata.shopifySegmentRef ?? null,
        score: metadata.score ?? 1,
      },
      update: {
        matchedAt: new Date(),
        source: metadata.source ?? 'auto',
        shopifySegmentRef: metadata.shopifySegmentRef ?? null,
        score: metadata.score ?? 1,
      },
    });
    return this.refreshSegmentCount(segmentId);
  }

  async deleteMembership(segmentId: string, customerId: string) {
    await this.prisma.db.segmentCustomerMembership.deleteMany({ where: { segmentId, customerId } });
    return this.refreshSegmentCount(segmentId);
  }

  async refreshSegmentCount(segmentId: string) {
    const count = await this.prisma.db.segmentCustomerMembership.count({ where: { segmentId } });
    await this.prisma.db.segment.updateMany({
      where: { id: segmentId },
      data: { customerCount: count, lastEvaluatedAt: new Date() },
    });
    return count;
  }

  async upsertOwnership(segmentId: string, input: {
    memberId: string;
    teamId?: string | null;
    priority: number;
    importance: string;
    dailyCap?: number | null;
    autoAssignNew: boolean;
    notes?: string | null;
    visualToken?: string | null;
  }) {
    const existing = await this.prisma.db.segmentOwnership.findFirst({
      where: { segmentId, memberId: input.memberId },
    });
    const data = {
      memberId: input.memberId,
      teamId: input.teamId ?? null,
      priority: input.priority,
      importance: input.importance,
      dailyCap: input.dailyCap ?? null,
      autoAssignNew: input.autoAssignNew,
      notes: input.notes ?? null,
      visualToken: input.visualToken ?? null,
    };
    if (existing) {
      await this.prisma.db.segmentOwnership.updateMany({ where: { id: existing.id }, data });
      return this.prisma.db.segmentOwnership.findFirst({ where: { id: existing.id }, include: { member: true } });
    }
    return this.prisma.db.segmentOwnership.create({
      data: {
        id: prefixedId('sown'),
        tenantId: this.tenantId(),
        segmentId,
        ...data,
      },
      include: { member: true },
    });
  }

  removeOwnership(segmentId: string, ownershipId?: string) {
    return this.prisma.db.segmentOwnership.deleteMany({
      where: ownershipId ? { id: ownershipId, segmentId } : { segmentId },
    });
  }

  findActiveMember(id: string) {
    return this.prisma.db.member.findFirst({ where: { id, status: 'active' } });
  }

  private async withSegmentAssignmentWriteLock<T>(
    operation: (db: Prisma.TransactionClient, tenantId: string) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantId();
    const lockKey = `factory-engine-pro:segment-assignment:${tenantId}`;
    return retryTransientSegmentWrite(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)`;
        return operation(tx, tenantId);
      }, { maxWait: 30_000, timeout: 180_000 }),
    );
  }

  private createCustomerAssignmentAudit(db: Prisma.TransactionClient, tenantId: string, input: {
    customerId: string;
    action: string;
    previousMemberId?: string | null;
    newMemberId?: string | null;
    source: string;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return db.customerAssignmentAudit.create({
      data: {
        id: prefixedId('caud'),
        tenantId,
        customerId: input.customerId,
        axis: 'sales',
        action: input.action,
        previousMemberId: input.previousMemberId ?? null,
        newMemberId: input.newMemberId ?? null,
        actorMemberId: null,
        source: input.source,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}

const SEGMENT_ASSIGNMENT_SOURCE = 'segment_ownership';

const customerAssignmentMemberInclude = {
  member: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
} satisfies Prisma.CustomerAssignmentInclude;

function isSegmentOwnershipSource(source: string | null | undefined) {
  return source === SEGMENT_ASSIGNMENT_SOURCE || source?.startsWith(`${SEGMENT_ASSIGNMENT_SOURCE}:`) === true;
}

async function retryTransientSegmentWrite<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 5;
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts || !isTransientSegmentWriteError(error)) break;
      await sleep(Math.min(5_000, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function isTransientSegmentWriteError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P2034'
    || message.includes('40P01')
    || message.includes('deadlock detected')
    || message.includes('could not serialize access');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
