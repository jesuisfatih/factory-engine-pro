import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createTaskAxisSchema,
  type CreateTaskAxis,
  type OperationalIntent,
  type PersonCallDisposition,
  type PersonTaskOutcome,
  type RecordPersonTaskOutcomeInput,
} from '@factory-engine-pro/contracts';
import { BusinessClockService } from '../../shared/business-clock.service.js';
import {
  normalizePhoneE164,
  provisionalCustomerIdentityKeys,
} from '../../shared/customer-contact-resolver.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { StaffWorkRepository } from './staff-work.repository.js';

export interface CreateStaffWorkItemInput {
  customerId?: string;
  assignedMemberId?: string;
  watcherMemberIds?: string[];
  axis: CreateTaskAxis;
  matchedRuleId?: string;
  source: string;
  sourceCallId?: string;
  sourceEmailId?: string;
  sourceEventId?: string;
  sourceOccurredAt?: Date | string | null;
  operationalIntent?: OperationalIntent | null;
  contactIdentityKey?: string | null;
  occurrenceCount?: number;
  firstSignalAt?: Date | string | null;
  lastSignalAt?: Date | string | null;
  title: string;
  description?: string | null;
  priority?: string;
  dueAt?: Date | string | null;
  visibleAfter?: Date | string | null;
  metadata?: Record<string, unknown>;
  conditionTrace?: unknown[];
  taskStateSnapshot?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ContinueStaffWorkItemInput extends CreateStaffWorkItemInput {
  sourceEventId: string;
  operationalIntent: OperationalIntent;
  contactIdentityKeys?: string[];
  occurrenceMetadata?: Record<string, unknown>;
}

export type ContinueStaffWorkItemOutcome = 'created' | 'continued' | 'replayed';

export interface ProactiveContactDecision {
  allowed: boolean;
  reason: string | null;
  nextAllowedAt: Date | null;
  callsInWindow: number;
  maxCalls: number;
  windowDays: number;
}

@Injectable()
export class StaffWorkService {
  constructor(
    private readonly repository: StaffWorkRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly businessClock: BusinessClockService,
  ) {}

  async create(input: CreateStaffWorkItemInput) {
    const axis = createTaskAxisSchema.safeParse(input.axis);
    if (!axis.success) throw new BadRequestException('Staff work axis must be sales or account.');
    if (input.customerId) await this.requireCustomer(input.customerId);
    if (input.assignedMemberId) await this.requireMember(input.assignedMemberId);
    const watcherMemberIds = uniqueStrings(input.watcherMemberIds ?? []).filter((id) => id !== input.assignedMemberId);
    for (const memberId of watcherMemberIds) await this.requireMember(memberId);

    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const dueAt = asDate(input.dueAt);
    const visibleAfter = asDate(input.visibleAfter) ?? (dueAt && dueAt.getTime() > Date.now() ? dueAt : null);
    const queueLocation = visibleAfter && visibleAfter.getTime() > Date.now() ? 'scheduled' : 'follow_up';
    const data: Prisma.StaffWorkItemUncheckedCreateInput = {
      id: prefixedId('swi'),
      tenantId: this.tenantId(),
      customerId: input.customerId ?? null,
      assignedMemberId: input.assignedMemberId ?? null,
      axis: axis.data,
      matchedRuleId: input.matchedRuleId ?? null,
      source: input.source,
      surface: 'staff',
      sourceCallId: input.sourceCallId ?? null,
      sourceEmailId: input.sourceEmailId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      sourceOccurredAt: asDate(input.sourceOccurredAt),
      operationalIntent: input.operationalIntent ?? null,
      contactIdentityKey: cleanString(input.contactIdentityKey),
      occurrenceCount: Math.max(0, Math.trunc(input.occurrenceCount ?? 0)),
      firstSignalAt: asDate(input.firstSignalAt),
      lastSignalAt: asDate(input.lastSignalAt),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: 'open',
      priority: input.priority ?? 'medium',
      createdByActorId: this.tenantContext.get()?.principalId ?? null,
      dueAt,
      visibleAfter,
      queueLocation,
      currentDisposition: queueLocation === 'follow_up' ? 'not_selected' : null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      conditionTrace: (input.conditionTrace ?? []) as Prisma.InputJsonValue,
      taskStateSnapshot: (input.taskStateSnapshot ?? {}) as Prisma.InputJsonValue,
      idempotencyKey,
    };

    let created;
    try {
      created = await this.repository.create(data);
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
    if (watcherMemberIds.length > 0) {
      await this.repository.upsertParticipants(created.id, watcherMemberIds, 'watcher', 'workflow_assignment');
    }
    this.logger.log('staff_work', 'create', 'Staff work item created', {
      staff_work_item_id: created.id,
      axis: created.axis,
      matched_rule_id: created.matchedRuleId,
      source_call_id: created.sourceCallId,
    });
    return this.require(created.id);
  }

  async continueOrCreate(input: ContinueStaffWorkItemInput): Promise<{
    item: Awaited<ReturnType<StaffWorkService['require']>>;
    outcome: ContinueStaffWorkItemOutcome;
  }> {
    const axis = createTaskAxisSchema.safeParse(input.axis);
    if (!axis.success) throw new BadRequestException('Staff work axis must be sales or account.');
    const customer = input.customerId ? await this.requireCustomer(input.customerId) : null;
    if (input.assignedMemberId) await this.requireMember(input.assignedMemberId);
    const watcherMemberIds = uniqueStrings(input.watcherMemberIds ?? []).filter((id) => id !== input.assignedMemberId);
    for (const memberId of watcherMemberIds) await this.requireMember(memberId);

    const tenantId = this.tenantId();
    const sourceEventId = input.sourceEventId.trim();
    if (!sourceEventId) throw new BadRequestException('Workflow lifecycle requires a source event id.');
    const contactIdentityKeys = uniqueStrings([
      cleanString(input.contactIdentityKey),
      ...(input.contactIdentityKeys ?? []).map((value) => cleanString(value)),
      ...provisionalCustomerIdentityKeys({ phone: customer?.phone, email: customer?.email }),
    ]);
    const contactIdentityKey = cleanString(input.contactIdentityKey) ?? contactIdentityKeys[0] ?? null;
    if (!input.customerId && contactIdentityKeys.length === 0) {
      throw new BadRequestException('Workflow lifecycle requires a customer or provisional contact identity.');
    }
    const occurredAt = asDate(input.sourceOccurredAt) ?? new Date();
    const dueAt = asDate(input.dueAt);
    const visibleAfter = asDate(input.visibleAfter) ?? (dueAt && dueAt.getTime() > Date.now() ? dueAt : null);
    const queueLocation = visibleAfter && visibleAfter.getTime() > Date.now() ? 'scheduled' : 'follow_up';
    const lockKeys = uniqueStrings([
      input.customerId ? `${tenantId}:customer:${input.customerId}:${input.operationalIntent}` : null,
      ...contactIdentityKeys.map((identityKey) => `${tenantId}:contact:${identityKey}:${input.operationalIntent}`),
    ]).sort();

    const transactionResult = await this.prisma.db.$transaction(async (tx) => {
      for (const lockKey of lockKeys) {
        await tx.$queryRaw<Array<{ lockAcquired: string | null }>>`
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lockAcquired"
        `;
      }

      const replay = await tx.staffWorkOccurrence.findFirst({
        where: { tenantId, sourceEventId },
        select: { staffWorkItemId: true },
      });
      if (replay) return { id: replay.staffWorkItemId, outcome: 'replayed' as const };

      const activeWhere: Prisma.StaffWorkItemWhereInput = {
        status: { notIn: ['closed', 'resolved', 'transferred'] },
      };
      const customerItem = input.customerId
        ? await tx.staffWorkItem.findFirst({
            where: { customerId: input.customerId, operationalIntent: input.operationalIntent, ...activeWhere },
            orderBy: [{ lastSignalAt: 'desc' }, { updatedAt: 'desc' }],
          })
        : null;
      const contactItems = contactIdentityKeys.length > 0
        ? await tx.staffWorkItem.findMany({
            where: {
              customerId: null,
              operationalIntent: input.operationalIntent,
              ...activeWhere,
              OR: [
                { contactIdentityKey: { in: contactIdentityKeys } },
                { contactIdentityAliases: { hasSome: contactIdentityKeys } },
              ],
            },
            orderBy: [{ lastSignalAt: 'desc' }, { updatedAt: 'desc' }],
          })
        : [];
      const existing = customerItem ?? contactItems[0] ?? null;
      const mergeItems = existing
        ? contactItems.filter((item) => item.id !== existing.id)
        : [];
      let mergedOccurrenceCount = 0;
      let mergedFirstSignalAt: Date | null = null;
      let mergedLastSignalAt: Date | null = null;
      let mergedAssignedMemberId: string | null = null;
      let mergedMetadata: Record<string, unknown> | null = null;
      let mergedMetadataAt = dateTime(existing?.lastSignalAt);
      const mergedIdentityAliases = uniqueStrings([
        ...contactIdentityKeys,
        ...(existing?.contactIdentityAliases ?? []),
      ]);

      for (const contactItem of mergeItems) {
        if (!existing) throw new Error('Lifecycle merge target is missing.');
        const contactParticipants = await tx.staffWorkParticipant.findMany({
          where: { staffWorkItemId: contactItem.id },
          select: { memberId: true, role: true, source: true },
        });
        for (const participant of contactParticipants) {
          await tx.staffWorkParticipant.upsert({
            where: {
              tenantId_staffWorkItemId_memberId_role: {
                tenantId,
                staffWorkItemId: existing.id,
                memberId: participant.memberId,
                role: participant.role,
              },
            },
            create: {
              id: prefixedId('swp'),
              tenantId,
              staffWorkItemId: existing.id,
              memberId: participant.memberId,
              role: participant.role,
              source: participant.source,
            },
            update: { source: participant.source },
          });
        }

        await tx.staffWorkOccurrence.updateMany({
          where: { staffWorkItemId: contactItem.id },
          data: { staffWorkItemId: existing.id, customerId: input.customerId ?? existing.customerId },
        });
        await tx.staffWorkComment.updateMany({
          where: { staffWorkItemId: contactItem.id },
          data: { staffWorkItemId: existing.id },
        });
        await tx.customerCallOutcome.updateMany({
          where: { staffWorkItemId: contactItem.id },
          data: { staffWorkItemId: existing.id, customerId: input.customerId ?? existing.customerId },
        });
        await tx.workItemStateTransition.updateMany({
          where: { staffWorkItemId: contactItem.id },
          data: { staffWorkItemId: existing.id, customerId: input.customerId ?? existing.customerId },
        });
        await tx.personWorkspaceNote.updateMany({
          where: { linkedStaffWorkItemId: contactItem.id },
          data: { linkedStaffWorkItemId: existing.id, linkedCustomerId: input.customerId ?? existing.customerId },
        });
        await tx.workflowScheduledAction.updateMany({
          where: { executedStaffWorkItemId: contactItem.id },
          data: { executedStaffWorkItemId: existing.id, customerId: input.customerId ?? existing.customerId },
        });
        const pins = await tx.personWorkspacePin.findMany({
          where: { targetKind: 'staff_work_item', targetId: contactItem.id },
        });
        for (const pin of pins) {
          await tx.personWorkspacePin.upsert({
            where: {
              tenantId_memberId_targetKind_targetId: {
                tenantId,
                memberId: pin.memberId,
                targetKind: 'staff_work_item',
                targetId: existing.id,
              },
            },
            create: {
              id: prefixedId('pwp'),
              tenantId,
              memberId: pin.memberId,
              targetKind: 'staff_work_item',
              targetId: existing.id,
              createdAt: pin.createdAt,
            },
            update: {},
          });
        }
        await tx.personWorkspacePin.deleteMany({
          where: { targetKind: 'staff_work_item', targetId: contactItem.id },
        });
        await tx.personDailyTaskOrder.deleteMany({ where: { staffWorkItemId: contactItem.id } });
        const closedMergeItem = await tx.staffWorkItem.updateMany({
          where: { id: contactItem.id },
          data: {
            status: 'closed',
            workState: 'completed',
            queueLocation: 'archive',
            closedAt: new Date(),
            archivedAt: new Date(),
            archiveReason: 'provisional_identity_merged',
            resolutionCode: 'provisional_identity_merged',
            resolutionNote: `Merged into ${existing.id} after the customer identity was resolved.`,
            metadata: {
              ...asRecord(contactItem.metadata),
              lifecycleMergedInto: existing.id,
              lifecycleMergeReason: 'provisional_identity_resolved',
            } as Prisma.InputJsonValue,
          },
        });
        if (closedMergeItem.count !== 1) {
          throw new Error(`Lifecycle merge source ${contactItem.id} could not be closed.`);
        }

        mergedOccurrenceCount += Math.max(0, contactItem.occurrenceCount);
        mergedFirstSignalAt = earliestDate(mergedFirstSignalAt, contactItem.firstSignalAt);
        mergedLastSignalAt = latestDate(mergedLastSignalAt, contactItem.lastSignalAt);
        mergedAssignedMemberId ??= contactItem.assignedMemberId;
        mergedIdentityAliases.push(...contactItem.contactIdentityAliases);
        if (dateTime(contactItem.lastSignalAt) > mergedMetadataAt) {
          mergedMetadata = asRecord(contactItem.metadata);
          mergedMetadataAt = dateTime(contactItem.lastSignalAt);
        }
      }

      if (existing) {
        const firstSignalAt = earliestDate(existing.firstSignalAt, mergedFirstSignalAt, occurredAt) ?? occurredAt;
        const priorLastSignalAt = latestDate(existing.lastSignalAt, mergedLastSignalAt);
        const lastSignalAt = latestDate(priorLastSignalAt, occurredAt) ?? occurredAt;
        const latest = !priorLastSignalAt || occurredAt.getTime() >= priorLastSignalAt.getTime();
        const occurrenceCount = Math.max(0, existing.occurrenceCount) + mergedOccurrenceCount + 1;
        const existingMetadata = mergedMetadata ?? asRecord(existing.metadata);
        const currentMetadata = latest ? { ...existingMetadata, ...(input.metadata ?? {}) } : existingMetadata;
        const lifecycleMetadata = {
          ...asRecord(currentMetadata.lifecycle),
          operationalIntent: input.operationalIntent,
          contactIdentityKey,
          contactIdentityAliases: uniqueStrings(mergedIdentityAliases),
          occurrenceCount,
          firstSignalAt: firstSignalAt.toISOString(),
          lastSignalAt: lastSignalAt.toISOString(),
          latestSourceEventId: latest ? sourceEventId : asRecord(currentMetadata.lifecycle).latestSourceEventId ?? existing.sourceEventId,
          latestSourceCallId: latest ? input.sourceCallId ?? null : asRecord(currentMetadata.lifecycle).latestSourceCallId ?? existing.sourceCallId,
        };
        const currentAssigneeMemberId = existing.assignedMemberId ?? mergedAssignedMemberId ?? null;
        const assignedMemberId = latest
          ? input.assignedMemberId ?? currentAssigneeMemberId
          : currentAssigneeMemberId;
        const continuationWatcherMemberIds = uniqueStrings([
          ...watcherMemberIds,
          ...(currentAssigneeMemberId && assignedMemberId !== currentAssigneeMemberId ? [currentAssigneeMemberId] : []),
        ]).filter((memberId) => memberId !== assignedMemberId);

        await tx.staffWorkOccurrence.create({
          data: {
            id: prefixedId('swo'),
            tenantId,
            staffWorkItemId: existing.id,
            customerId: input.customerId ?? existing.customerId,
            operationalIntent: input.operationalIntent,
            contactIdentityKey,
            sourceCallId: input.sourceCallId ?? null,
            sourceEventId,
            occurredAt,
            metadata: (input.occurrenceMetadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        const continuedItem = await tx.staffWorkItem.updateMany({
          where: { id: existing.id },
          data: {
            customerId: input.customerId ?? existing.customerId,
            contactIdentityKey: contactIdentityKey ?? existing.contactIdentityKey,
            contactIdentityAliases: uniqueStrings(mergedIdentityAliases),
            occurrenceCount,
            firstSignalAt,
            lastSignalAt,
            assignedMemberId,
            ...(latest ? {
              matchedRuleId: input.matchedRuleId ?? existing.matchedRuleId,
              source: input.source,
              sourceCallId: input.sourceCallId ?? null,
              sourceEmailId: input.sourceEmailId ?? null,
              sourceEventId,
              sourceOccurredAt: occurredAt,
              title: input.title.trim(),
              description: input.description?.trim() || null,
              priority: input.priority ?? existing.priority,
              status: 'open',
              workState: 'open',
              queueLocation: 'follow_up',
              visibleAfter: null,
              dueAt: null,
              archivedAt: null,
              archiveReason: null,
              closedAt: null,
              resolutionCode: null,
              resolutionNote: null,
              currentDisposition: 'not_selected',
              conditionTrace: (input.conditionTrace ?? []) as Prisma.InputJsonValue,
              taskStateSnapshot: (input.taskStateSnapshot ?? {}) as Prisma.InputJsonValue,
            } : {}),
            metadata: { ...currentMetadata, lifecycle: lifecycleMetadata } as Prisma.InputJsonValue,
          },
        });
        if (continuedItem.count !== 1) {
          throw new Error(`Lifecycle item ${existing.id} could not be continued.`);
        }
        if (latest) {
          await tx.personDailyTaskOrder.deleteMany({ where: { staffWorkItemId: existing.id } });
        }
        await tx.workItemStateTransition.create({
          data: {
            id: prefixedId('wst'),
            tenantId,
            staffWorkItemId: existing.id,
            customerId: input.customerId ?? existing.customerId,
            memberId: assignedMemberId,
            fromWorkState: existing.workState,
            toWorkState: latest ? 'open' : existing.workState,
            fromQueue: existing.queueLocation,
            toQueue: latest ? 'follow_up' : existing.queueLocation,
            reason: 'workflow_signal_continued',
            metadata: {
              operationalIntent: input.operationalIntent,
              sourceEventId,
              sourceCallId: input.sourceCallId ?? null,
              occurredAt: occurredAt.toISOString(),
              occurrenceCount,
              latest,
            } as Prisma.InputJsonValue,
          },
        });
        await upsertParticipantsTx(tx, tenantId, existing.id, continuationWatcherMemberIds, 'watcher', 'workflow_continuation');
        return { id: existing.id, outcome: 'continued' as const };
      }

      const id = prefixedId('swi');
      const metadata = {
        ...(input.metadata ?? {}),
        lifecycle: {
          ...asRecord(asRecord(input.metadata).lifecycle),
          operationalIntent: input.operationalIntent,
          contactIdentityKey,
          contactIdentityAliases: contactIdentityKeys,
          occurrenceCount: 1,
          firstSignalAt: occurredAt.toISOString(),
          lastSignalAt: occurredAt.toISOString(),
          latestSourceEventId: sourceEventId,
          latestSourceCallId: input.sourceCallId ?? null,
        },
      };
      await tx.staffWorkItem.create({
        data: {
          id,
          tenantId,
          customerId: input.customerId ?? null,
          assignedMemberId: input.assignedMemberId ?? null,
          axis: axis.data,
          matchedRuleId: input.matchedRuleId ?? null,
          source: input.source,
          surface: 'staff',
          sourceCallId: input.sourceCallId ?? null,
          sourceEmailId: input.sourceEmailId ?? null,
          sourceEventId,
          sourceOccurredAt: occurredAt,
          operationalIntent: input.operationalIntent,
          contactIdentityKey,
          contactIdentityAliases: contactIdentityKeys,
          occurrenceCount: 1,
          firstSignalAt: occurredAt,
          lastSignalAt: occurredAt,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          status: 'open',
          priority: input.priority ?? 'medium',
          createdByActorId: this.tenantContext.get()?.principalId ?? null,
          dueAt,
          visibleAfter,
          queueLocation,
          currentDisposition: queueLocation === 'follow_up' ? 'not_selected' : null,
          metadata: metadata as Prisma.InputJsonValue,
          conditionTrace: (input.conditionTrace ?? []) as Prisma.InputJsonValue,
          taskStateSnapshot: (input.taskStateSnapshot ?? {}) as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey?.trim() || null,
        },
      });
      await tx.staffWorkOccurrence.create({
        data: {
          id: prefixedId('swo'),
          tenantId,
          staffWorkItemId: id,
          customerId: input.customerId ?? null,
          operationalIntent: input.operationalIntent,
          contactIdentityKey,
          sourceCallId: input.sourceCallId ?? null,
          sourceEventId,
          occurredAt,
          metadata: (input.occurrenceMetadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await upsertParticipantsTx(tx, tenantId, id, watcherMemberIds, 'watcher', 'workflow_assignment');
      return { id, outcome: 'created' as const };
    });

    const item = await this.require(transactionResult.id);
    this.logger.log('staff_work', `lifecycle.${transactionResult.outcome}`, 'Staff work lifecycle applied', {
      staff_work_item_id: item.id,
      customer_id: item.customerId,
      operational_intent: input.operationalIntent,
      contact_identity_key: contactIdentityKey,
      source_event_id: sourceEventId,
      occurrence_count: item.occurrenceCount,
    });
    return { item, outcome: transactionResult.outcome };
  }

  async require(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Staff follow-up not found.');
    return row;
  }

  async proactiveContactDecision(customerId: string): Promise<ProactiveContactDecision> {
    await this.requireCustomer(customerId);
    const now = new Date();
    const calendar = await this.businessClock.calendar();
    const policy = await this.prisma.db.customerContactPolicy.findFirst({
      where: { customerId },
      select: { doNotCall: true, reason: true },
    });
    if (policy?.doNotCall) {
      return {
        allowed: false,
        reason: policy.reason?.trim() || 'This customer asked not to receive calls.',
        nextAllowedAt: null,
        callsInWindow: 0,
        maxCalls: calendar.repeatPolicy.maxCalls,
        windowDays: calendar.repeatPolicy.windowDays,
      };
    }

    const cutoff = await this.businessClock.addCalendarDays(now, -calendar.repeatPolicy.windowDays);
    const acceptedCalls = await this.prisma.db.customerContactActivity.findMany({
      where: {
        customerId,
        source: 'aircall_dial',
        status: { in: ['calling', 'connected', 'no_answer', 'voicemail', 'completed'] },
        startedAt: { gte: cutoff },
      },
      select: { startedAt: true },
      orderBy: { startedAt: 'asc' },
      take: calendar.repeatPolicy.maxCalls,
    });
    if (acceptedCalls.length < calendar.repeatPolicy.maxCalls) {
      return {
        allowed: true,
        reason: null,
        nextAllowedAt: null,
        callsInWindow: acceptedCalls.length,
        maxCalls: calendar.repeatPolicy.maxCalls,
        windowDays: calendar.repeatPolicy.windowDays,
      };
    }
    const nextAllowedAt = await this.businessClock.addCalendarDays(
      acceptedCalls[0]!.startedAt,
      calendar.repeatPolicy.windowDays,
    );
    return {
      allowed: false,
      reason: `This customer has already received ${calendar.repeatPolicy.maxCalls} calls in ${calendar.repeatPolicy.windowDays} days.`,
      nextAllowedAt,
      callsInWindow: acceptedCalls.length,
      maxCalls: calendar.repeatPolicy.maxCalls,
      windowDays: calendar.repeatPolicy.windowDays,
    };
  }

  async assertProactiveDialAllowed(customerId: string) {
    const decision = await this.proactiveContactDecision(customerId);
    if (!decision.allowed) {
      const retry = decision.nextAllowedAt ? ` Try again after ${decision.nextAllowedAt.toISOString()}.` : '';
      throw new BadRequestException(`${decision.reason}${retry}`);
    }
    return decision;
  }

  async assign(id: string, memberId: string) {
    await this.requireMember(memberId);
    const updated = await this.repository.update(id, { assignedMemberId: memberId });
    if (updated.count === 0) throw new NotFoundException('Staff follow-up not found.');
    return this.require(id);
  }

  async addWatcher(id: string, memberId: string, source = 'workflow_action') {
    await this.require(id);
    await this.requireMember(memberId);
    await this.repository.upsertParticipants(id, [memberId], 'watcher', source);
    return this.require(id);
  }

  async updateWorkflow(
    id: string,
    update: (workflow: Record<string, unknown>) => Record<string, unknown>,
    data: Prisma.StaffWorkItemUncheckedUpdateManyInput = {},
  ) {
    const row = await this.require(id);
    const metadata = asRecord(row.metadata);
    const workflow = asRecord(metadata.workflow);
    await this.repository.update(id, {
      ...data,
      metadata: { ...metadata, workflow: update(workflow) } as Prisma.InputJsonValue,
    });
    return this.require(id);
  }

  async transition(id: string, input: {
    memberId?: string | null;
    toWorkState: string;
    toQueue: string;
    reason: string;
    outcomeId?: string | null;
    data?: Prisma.StaffWorkItemUncheckedUpdateManyInput;
  }) {
    const row = await this.require(id);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.staffWorkItem.updateMany({
        where: { id },
        data: {
          workState: input.toWorkState,
          queueLocation: input.toQueue,
          ...(input.data ?? {}),
        },
      });
      await tx.workItemStateTransition.create({
        data: {
          id: prefixedId('wst'),
          tenantId: this.tenantId(),
          staffWorkItemId: id,
          customerId: row.customerId,
          memberId: input.memberId ?? null,
          fromWorkState: row.workState,
          toWorkState: input.toWorkState,
          fromQueue: row.queueLocation,
          toQueue: input.toQueue,
          reason: input.reason,
          outcomeId: input.outcomeId ?? null,
        },
      });
    });
    return this.require(id);
  }

  async recordOutcome(id: string, memberId: string, input: RecordPersonTaskOutcomeInput): Promise<PersonTaskOutcome> {
    const tenantId = this.tenantId();
    const row = await this.require(id);
    if (input.idempotencyKey) {
      const existing = await this.prisma.db.customerCallOutcome.findFirst({
        where: { memberId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return outcomeDto(existing, row.visibleAfter);
    }

    const now = new Date();
    const plan = await this.outcomePlan(input.disposition, input.scheduledAt, now);
    const completionVisibleAfter = input.disposition === 'completed'
      ? await this.completionReappearanceAt(now)
      : null;
    const normalizedPhone = normalizePhoneE164(input.phone);
    const contactPoint = row.customerId && normalizedPhone
      ? await this.prisma.db.customerContactPoint.findFirst({
          where: { customerId: row.customerId, type: 'phone', normalizedValue: normalizedPhone, isValid: true },
          orderBy: [{ isPrimary: 'desc' }, { priority: 'desc' }],
        })
      : null;
    const outcomeId = prefixedId('cco');
    const createOutcome = async () => this.prisma.db.$transaction(async (tx) => {
      const outcome = await tx.customerCallOutcome.create({
        data: {
          id: outcomeId,
          tenantId,
          idempotencyKey: input.idempotencyKey ?? null,
          staffWorkItemId: row.id,
          customerId: row.customerId,
          memberId,
          contactPointId: contactPoint?.id ?? null,
          externalCallId: input.externalCallId ?? null,
          providerResult: input.providerResult ?? null,
          resolverSuggestion: input.resolverSuggestion ?? null,
          disposition: input.disposition,
          note: input.note?.trim() || null,
          resultingWorkState: plan.workState,
          resultingQueue: plan.queueLocation,
          metadata: {
            phone: normalizedPhone,
            scheduledAt: plan.visibleAfter?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.staffWorkItem.updateMany({
        where: { id: row.id },
        data: {
          workState: plan.workState,
          queueLocation: plan.queueLocation,
          status: plan.status,
          currentDisposition: input.disposition,
          currentOutcomeId: outcome.id,
          visibleAfter: plan.visibleAfter,
          dueAt: plan.visibleAfter,
          archivedAt: plan.archivedAt,
          archiveReason: plan.archiveReason,
          closedAt: plan.closedAt,
          resolutionCode: plan.resolutionCode,
          resolutionNote: input.note?.trim() || null,
        },
      });
      await tx.workItemStateTransition.create({
        data: {
          id: prefixedId('wst'),
          tenantId,
          staffWorkItemId: row.id,
          customerId: row.customerId,
          memberId,
          fromWorkState: row.workState,
          toWorkState: plan.workState,
          fromQueue: row.queueLocation,
          toQueue: plan.queueLocation,
          reason: `call_outcome:${input.disposition}`,
          outcomeId: outcome.id,
          metadata: {
            phone: normalizedPhone,
            externalCallId: input.externalCallId ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      if (input.note?.trim()) {
        await tx.staffWorkComment.create({
          data: {
            id: prefixedId('swc'),
            tenantId,
            staffWorkItemId: row.id,
            actorId: memberId,
            actorType: 'member',
            body: input.note.trim(),
            internal: true,
            attachmentsJson: [{
              kind: 'call_outcome',
              outcomeId: outcome.id,
              disposition: input.disposition,
            }] as Prisma.InputJsonValue,
          },
        });
      }
      if (input.disposition === 'wrong_number' && contactPoint) {
        await tx.customerContactPoint.updateMany({
          where: { id: contactPoint.id },
          data: { isValid: false, invalidReason: 'staff_reported_wrong_number', invalidatedAt: now },
        });
      }
      if (input.disposition === 'do_not_call' && row.customerId) {
        await tx.customerContactPolicy.upsert({
          where: { tenantId_customerId: { tenantId, customerId: row.customerId } },
          create: {
            id: prefixedId('ccpol'),
            tenantId,
            customerId: row.customerId,
            doNotCall: true,
            reason: input.note?.trim() || 'Customer requested no further calls.',
            setByMemberId: memberId,
            setAt: now,
          },
          update: {
            doNotCall: true,
            reason: input.note?.trim() || 'Customer requested no further calls.',
            setByMemberId: memberId,
            setAt: now,
          },
        });
      }
      if (input.disposition === 'completed' && row.customerId && row.assignedMemberId && completionVisibleAfter) {
        const idempotencyKey = `completion-reappearance:${row.id}:${outcome.id}`;
        await tx.staffWorkItem.upsert({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
          create: {
            id: prefixedId('swi'),
            tenantId,
            customerId: row.customerId,
            assignedMemberId: row.assignedMemberId,
            axis: row.axis,
            matchedRuleId: row.matchedRuleId,
            source: 'completion_reappearance',
            surface: 'staff',
            sourceCallId: row.sourceCallId,
            sourceEmailId: row.sourceEmailId,
            sourceEventId: outcome.id,
            sourceOccurredAt: now,
            operationalIntent: row.operationalIntent,
            contactIdentityKey: row.contactIdentityKey,
            contactIdentityAliases: row.contactIdentityAliases,
            occurrenceCount: 0,
            title: row.title,
            description: row.description,
            status: 'open',
            priority: row.priority,
            dueAt: completionVisibleAfter,
            visibleAfter: completionVisibleAfter,
            workState: 'scheduled',
            queueLocation: 'scheduled',
            metadata: {
              ...asRecord(row.metadata),
              lifecycle: {
                sourceStaffWorkItemId: row.id,
                sourceOutcomeId: outcome.id,
                reason: 'completed_reappearance',
                visibleAfter: completionVisibleAfter.toISOString(),
              },
            } as Prisma.InputJsonValue,
            conditionTrace: row.conditionTrace === null ? [] : row.conditionTrace as Prisma.InputJsonValue,
            taskStateSnapshot: row.taskStateSnapshot === null ? {} : row.taskStateSnapshot as Prisma.InputJsonValue,
            idempotencyKey,
          },
          update: {},
        });
      }
      return outcome;
    });

    let outcome;
    try {
      outcome = await createOutcome();
    } catch (error) {
      if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.db.customerCallOutcome.findFirst({
          where: { memberId, idempotencyKey: input.idempotencyKey },
        });
        if (existing) return outcomeDto(existing, plan.visibleAfter);
      }
      throw error;
    }
    this.logger.log('staff_work', 'call_outcome.record', 'Staff call outcome recorded', {
      staff_work_item_id: row.id,
      customer_id: row.customerId,
      member_id: memberId,
      disposition: input.disposition,
      queue_location: plan.queueLocation,
    });
    return outcomeDto(outcome, completionVisibleAfter ?? plan.visibleAfter);
  }

  private async completionReappearanceAt(now: Date) {
    const calendar = await this.businessClock.calendar();
    return this.businessClock.addCalendarDays(now, calendar.repeatPolicy.completionReappearanceDays);
  }

  private async outcomePlan(disposition: PersonCallDisposition, scheduledAt: string | undefined, now: Date) {
    if (disposition === 'no_answer' || disposition === 'voicemail' || disposition === 'voicemail_unavailable' || disposition === 'callback_requested' || disposition === 'follow_up_scheduled') {
      const configured = scheduledAt ? new Date(scheduledAt) : null;
      const calendar = await this.businessClock.calendar();
      const visibleAfter = configured && !Number.isNaN(configured.getTime()) && configured.getTime() > now.getTime()
        ? configured
        : await this.businessClock.addBusinessDays(now, calendar.repeatPolicy.defaultFollowUpBusinessDays);
      return {
        workState: 'scheduled',
        queueLocation: 'scheduled',
        status: 'open',
        visibleAfter,
        archivedAt: null,
        archiveReason: null,
        closedAt: null,
        resolutionCode: null,
      };
    }
    if (['order_placed', 'not_interested', 'wrong_number', 'do_not_call', 'completed'].includes(disposition)) {
      return {
        workState: 'completed',
        queueLocation: 'archive',
        status: 'closed',
        visibleAfter: null,
        archivedAt: now,
        archiveReason: `call_outcome:${disposition}`,
        closedAt: now,
        resolutionCode: disposition,
      };
    }
    return {
      workState: 'in_progress',
      queueLocation: 'follow_up',
      status: 'open',
      visibleAfter: null,
      archivedAt: null,
      archiveReason: null,
      closedAt: null,
      resolutionCode: null,
    };
  }

  private async requireMember(id: string) {
    const row = await this.prisma.db.member.findFirst({ where: { id, status: 'active' }, select: { id: true } });
    if (!row) throw new BadRequestException('Assigned staff member is not active.');
  }

  private async requireCustomer(id: string) {
    const row = await this.prisma.db.customer.findFirst({
      where: { id },
      select: { id: true, phone: true, email: true },
    });
    if (!row) throw new BadRequestException('Customer was not found in this workspace.');
    return row;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is missing tenantId');
    return tenantId;
  }
}

function outcomeDto(row: {
  id: string;
  staffWorkItemId: string;
  customerId: string | null;
  disposition: string;
  note: string | null;
  resultingWorkState: string;
  resultingQueue: string;
  selectedAt: Date;
}, visibleAfter: Date | null): PersonTaskOutcome {
  return {
    id: row.id,
    taskId: row.staffWorkItemId,
    customerId: row.customerId,
    disposition: row.disposition as PersonCallDisposition,
    note: row.note,
    workState: row.resultingWorkState,
    queueLocation: row.resultingQueue as PersonTaskOutcome['queueLocation'],
    visibleAfter: visibleAfter?.toISOString() ?? null,
    selectedAt: row.selectedAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean)));
}

function cleanString(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function earliestDate(...values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  return dates.length > 0
    ? dates.reduce((earliest, value) => value.getTime() < earliest.getTime() ? value : earliest)
    : null;
}

function latestDate(...values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  return dates.length > 0
    ? dates.reduce((latest, value) => value.getTime() > latest.getTime() ? value : latest)
    : null;
}

function dateTime(value: Date | null | undefined) {
  return value?.getTime() ?? Number.NEGATIVE_INFINITY;
}

async function upsertParticipantsTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  staffWorkItemId: string,
  memberIds: string[],
  role: string,
  source: string,
) {
  for (const memberId of memberIds) {
    await tx.staffWorkParticipant.upsert({
      where: {
        tenantId_staffWorkItemId_memberId_role: { tenantId, staffWorkItemId, memberId, role },
      },
      create: {
        id: prefixedId('swp'),
        tenantId,
        staffWorkItemId,
        memberId,
        role,
        source,
      },
      update: { source },
    });
  }
}
