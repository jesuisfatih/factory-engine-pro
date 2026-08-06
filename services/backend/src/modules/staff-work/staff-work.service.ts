import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StaffWorkItem } from '@prisma/client';
import {
  createTaskAxisSchema,
  type CreateTaskAxis,
  type PersonCallDisposition,
  type PersonTaskOutcome,
  type RecordPersonTaskOutcomeInput,
} from '@factory-engine-pro/contracts';
import { BusinessClockService } from '../../shared/business-clock.service.js';
import { normalizePhoneE164 } from '../../shared/customer-contact-resolver.service.js';
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
    if (disposition === 'no_answer' || disposition === 'voicemail' || disposition === 'callback_requested' || disposition === 'follow_up_scheduled') {
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
    const row = await this.prisma.db.customer.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new BadRequestException('Customer was not found in this workspace.');
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
