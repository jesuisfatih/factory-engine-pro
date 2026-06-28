import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreatePersonRequestInput,
  MovePersonQueueCardInput,
  PersonAiPsychAnalysis,
  PersonMiniOrder,
  PersonPerformance30d,
  PersonQueueColumn,
  PersonTaskBriefDetail,
  PersonTaskStateSnapshot,
  PersonTaskTimelineEntry,
  PersonTaskWorkflowTrace,
  SavePersonTaskNoteInput,
  SchedulePersonTaskFollowUpInput,
  SavePersonNoteInput,
  SendPersonMessageInput,
  TogglePersonQueuePinInput,
  WorkflowConditionTrace,
  WorkflowWhenGroupTrace,
} from '@factory-engine-pro/contracts';
import { aircallWhereFor, phoneVariants } from '../../shared/contact-match.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { CustomersService } from '../customers/customers.service.js';
import { priorityRankFromUrgency, UrgencyScoringService } from './urgency-scoring.service.js';

const CLOSED = new Set(['closed', 'resolved', 'transferred']);
const CUSTOMER_PIN_KIND = 'customer_pin';
const CUSTOMER_PIN_SOURCE = 'manual_pin';
const CUSTOMER_PIN_SURFACE = 'person_pin';
const INTERNAL_WORKSPACE_KINDS = new Set(['message_thread', 'note', 'staff_request', CUSTOMER_PIN_KIND]);
const COLUMN_STATUS: Record<PersonQueueColumn, string> = {
  unassigned: 'open',
  in_progress: 'in_progress',
  positive: 'pending_resolve',
  closed: 'closed',
};
const SEGMENT_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#b91c1c', '#475569'];
const EMPTY_PERFORMANCE_30D: PersonPerformance30d = {
  orders: 0,
  revenue: 0,
  calls: 0,
  callMinutes: 0,
  serviceRequests: 0,
};

const serviceRequestInclude = {
  customer: {
    include: {
      insight: true,
      segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 3 },
    },
  },
  customerUser: true,
  assignedMember: true,
  comments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ServiceRequestInclude;

type ServiceRequestRow = Prisma.ServiceRequestGetPayload<{
  include: typeof serviceRequestInclude;
}>;

type AxisAssignments = Map<string, Set<string>>;

type SegmentMembershipRow = Prisma.SegmentCustomerMembershipGetPayload<{
  include: {
    segment: true;
    customer: {
      include: {
        insight: true;
        segmentMemberships: { include: { segment: true } };
      };
    };
  };
}>;

type CustomerPinRow = Prisma.ServiceRequestGetPayload<{
  include: {
    customer: {
      include: {
        insight: true;
        segmentMemberships: { include: { segment: true } };
      };
    };
  };
}>;

interface CardContext {
  miniOrders: Map<string, PersonMiniOrder>;
  performance: Map<string, PersonPerformance30d>;
}

@Injectable()
export class PersonWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly scoring: UrgencyScoringService,
    private readonly customersService: CustomersService,
    private readonly logger: AppLogger,
  ) {}

  async summary() {
    const member = await this.currentMember();
    const [operations, assigned, failedMail] = await Promise.all([
      this.dailyOperationsFor(member),
      this.prisma.db.serviceRequest.count({
        where: { assignedMemberId: member.id, status: { notIn: Array.from(CLOSED) } },
      }),
      this.prisma.db.mailDelivery.count({ where: { status: 'failed' } }),
    ]);
    return {
      queue: operations.summary.priorityCount,
      customers: operations.summary.dailyCount,
      notifications: assigned + failedMail,
      assigned,
      failedMail,
    };
  }

  async queue() {
    const member = await this.currentMember();
    return (await this.dailyOperationsFor(member)).priorityKanban;
  }

  async dailyOperations() {
    const member = await this.currentMember();
    return this.dailyOperationsFor(member);
  }

  private async dailyOperationsFor(member: Awaited<ReturnType<PersonWorkspaceService['currentMember']>>) {
    const assignments = await this.axisAssignments(member.id);
    const visibleCustomerIds = Array.from(assignments.keys());
    const visibleAxes = Array.from(new Set(Array.from(assignments.values()).flatMap((axes) => Array.from(axes)))).sort();
    const config = await this.urgencyConfig();

    if (visibleCustomerIds.length === 0) {
      return {
        summary: {
          dailyCount: 0,
          priorityCount: 0,
          pinnedCount: 0,
          highUrgencyCount: 0,
          visibleAxes,
          segmentGroupCount: 0,
        },
        dailyCallList: [],
        priorityKanban: [],
        pinBoard: [],
        segmentGroups: [],
      };
    }

    const [segmentOwnerships, memberships, requestRows, customerPinRows] = await Promise.all([
      this.prisma.db.segmentOwnership.findMany({
        where: { memberId: member.id },
        include: { segment: true },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      this.prisma.db.segmentCustomerMembership.findMany({
        where: {
          customerId: { in: visibleCustomerIds },
          segment: { ownerships: { some: { memberId: member.id } } },
        },
        include: {
          segment: true,
          customer: {
            include: {
              insight: true,
              segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 3 },
            },
          },
        },
        orderBy: [{ matchedAt: 'desc' }],
        take: 5000,
      }),
      this.prisma.db.serviceRequest.findMany({
        where: {
          OR: [
            { customerId: { in: visibleCustomerIds } },
            { customerId: null, assignedMemberId: member.id },
          ],
        },
        include: serviceRequestInclude,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      this.customerPins(member.id, visibleCustomerIds),
    ]);

    const [repeatCounts, cardContext] = await Promise.all([
      this.repeatCounts(visibleCustomerIds),
      this.cardContext(visibleCustomerIds),
    ]);
    const customerPinsByCustomer = new Map(customerPinRows.flatMap((row) => row.customerId ? [[row.customerId, row] as const] : []));
    const membershipsBySegment = groupBy(memberships, (row) => row.segmentId);
    const dailyByCustomer = new Map<string, ReturnType<PersonWorkspaceService['dailyCallItem']>>();

    const segmentGroups = segmentOwnerships.map((ownership) => {
      const segmentMemberships = membershipsBySegment.get(ownership.segmentId) ?? [];
      const items = segmentMemberships
        .map((membership) => this.dailyCallItem(membership, ownership, assignments, config, repeatCounts.get(membership.customerId) ?? 0, customerPinsByCustomer.get(membership.customerId) ?? null))
        .sort(sortDaily)
        .slice(0, ownership.dailyCap ?? 100);

      for (const item of items) {
        const existing = dailyByCustomer.get(item.customerId);
        if (!existing || item.urgencyScore > existing.urgencyScore) dailyByCustomer.set(item.customerId, item);
      }

      return {
        segmentId: ownership.segment.id,
        segmentName: ownership.segment.name,
        segmentColor: ownership.segment.color,
        priority: ownership.priority,
        dailyCap: ownership.dailyCap,
        totalCustomers: segmentMemberships.length,
        items,
      };
    });

    const scopedRows = requestRows
      .filter((row) => this.isQueueVisible(row))
      .filter((row) => this.isServiceRequestScoped(row, assignments, member.id));
    const priorityKanban = scopedRows
      .filter((row) => !CLOSED.has(row.status))
      .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext))
      .sort(sortByUrgency)
      .slice(0, 120);
    const pinnedTasks = scopedRows
      .filter((row) => this.isTaskPinned(row, member.id))
      .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext));
    const pinnedCustomers = customerPinRows
      .filter((row) => row.customer)
      .map((row) => this.customerPinCard(row, assignments, config, repeatCounts.get(row.customerId ?? '') ?? 0));
    const pinBoard = [...pinnedTasks, ...pinnedCustomers].sort(sortByUrgency).slice(0, 120);
    const dailyCallList = Array.from(dailyByCustomer.values()).sort(sortDaily).slice(0, 150);

    return {
      summary: {
        dailyCount: dailyCallList.length,
        priorityCount: priorityKanban.length,
        pinnedCount: pinBoard.length,
        highUrgencyCount: uniqueHighUrgencyCount(dailyCallList, priorityKanban),
        visibleAxes,
        segmentGroupCount: segmentGroups.length,
      },
      dailyCallList,
      priorityKanban,
      pinBoard,
      segmentGroups,
    };
  }

  async legacyQueue() {
    const member = await this.currentMember();
    const assignments = await this.axisAssignments(member.id);
    const rows = await this.prisma.db.serviceRequest.findMany({
      include: serviceRequestInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const visible = rows.filter((row) => this.isQueueVisible(row) && this.isServiceRequestScoped(row, assignments, member.id));
    const visibleCustomerIds = visible.map((row) => row.customerId).filter((id): id is string => Boolean(id));
    const [config, repeatCounts, cardContext] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(visibleCustomerIds),
      this.cardContext(visibleCustomerIds),
    ]);
    return visible
      .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext))
      .sort(sortByUrgency)
      .slice(0, 120);
  }

  async moveQueueCard(id: string, input: MovePersonQueueCardInput) {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);
    const metadata = { ...this.record(row.metadata), personColumnId: input.columnId, personColumnIndex: input.index };
    await this.prisma.db.serviceRequest.updateMany({
      where: { id },
      data: { status: COLUMN_STATUS[input.columnId], metadata: metadata as Prisma.InputJsonValue },
    });
    this.logger.log('person_workspace', 'queue.move', 'Person queue card moved', {
      service_request_id: id,
      member_id: member.id,
      column_id: input.columnId,
    });
    const updated = await this.requireServiceRequest(id);
    return this.queueCard(
      updated,
      member.id,
      await this.urgencyConfig(),
      await this.repeatCount(updated.customerId),
      await this.cardContext(updated.customerId ? [updated.customerId] : []),
    );
  }

  async toggleQueuePin(id: string, input: TogglePersonQueuePinInput) {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);
    const metadata = this.record(row.metadata);
    const pinnedBy = this.record(metadata.personPinnedBy);
    const isPinned = typeof pinnedBy[member.id] === 'number';
    const nextPinned = input.pinned ?? !isPinned;
    if (nextPinned) pinnedBy[member.id] = Date.now();
    else delete pinnedBy[member.id];
    await this.prisma.db.serviceRequest.updateMany({
      where: { id },
      data: { metadata: { ...metadata, personPinnedBy: pinnedBy } as Prisma.InputJsonValue },
    });
    this.logger.log('person_workspace', 'queue.pin', 'Person queue pin toggled', {
      service_request_id: id,
      member_id: member.id,
      pinned: nextPinned,
    });
    const updated = await this.requireServiceRequest(id);
    return this.queueCard(
      updated,
      member.id,
      await this.urgencyConfig(),
      await this.repeatCount(updated.customerId),
      await this.cardContext(updated.customerId ? [updated.customerId] : []),
    );
  }

  async toggleCustomerPin(id: string, input: TogglePersonQueuePinInput) {
    const member = await this.currentMember();
    const assignments = await this.axisAssignments(member.id);
    if (!assignments.has(id)) throw new ForbiddenException('Customer is outside your axis scope');

    const customer = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const existing = await this.prisma.db.serviceRequest.findFirst({
      where: {
        customerId: id,
        assignedMemberId: member.id,
        source: CUSTOMER_PIN_SOURCE,
        surface: CUSTOMER_PIN_SURFACE,
        metadata: { path: ['personWorkspaceKind'], equals: CUSTOMER_PIN_KIND },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const isPinned = existing ? !CLOSED.has(existing.status) : false;
    const nextPinned = input.pinned ?? !isPinned;

    if (nextPinned) {
      if (existing) {
        await this.prisma.db.serviceRequest.updateMany({
          where: { id: existing.id },
          data: {
            status: 'open',
            closedAt: null,
            metadata: {
              ...this.record(existing.metadata),
              personWorkspaceKind: CUSTOMER_PIN_KIND,
              personPinnedBy: { [member.id]: Date.now() },
              category: 'customer_pin',
            } as Prisma.InputJsonValue,
          },
        });
      } else {
        await this.prisma.db.serviceRequest.create({
          data: {
            id: prefixedId('sr'),
            tenantId: this.tenantId(),
            customerId: id,
            assignedMemberId: member.id,
            axis: Array.from(assignments.get(id) ?? [])[0] ?? null,
            source: CUSTOMER_PIN_SOURCE,
            surface: CUSTOMER_PIN_SURFACE,
            title: `Pinned customer: ${customerDisplayName(customer)}`,
            description: 'Manual person workspace pin.',
            status: 'open',
            priority: 'medium',
            createdByActorId: member.id,
            metadata: {
              personWorkspaceKind: CUSTOMER_PIN_KIND,
              personPinnedBy: { [member.id]: Date.now() },
              category: 'customer_pin',
            } as Prisma.InputJsonValue,
          },
        });
      }
    } else if (existing) {
      await this.prisma.db.serviceRequest.updateMany({
        where: { id: existing.id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          metadata: {
            ...this.record(existing.metadata),
            personWorkspaceKind: CUSTOMER_PIN_KIND,
            personPinnedBy: {},
            category: 'customer_pin',
          } as Prisma.InputJsonValue,
        },
      });
    }

    this.logger.log('person_workspace', 'customer.pin', 'Person customer pin toggled', {
      customer_id: id,
      member_id: member.id,
      pinned: nextPinned,
    });
    return { ok: true, pinned: nextPinned };
  }

  async taskBrief(id: string): Promise<PersonTaskBriefDetail> {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);

    const customerId = row.customerId;
    const customerEmail = row.customer?.email ?? row.customerUser?.email ?? null;
    const customerPhone = row.customer?.phone ?? row.customerUser?.phone ?? null;
    const aircallWhere = aircallWhereFor(customerEmail, customerPhone);
    const matchedRuleId = matchedRuleIdFrom(row);

    const [
      config,
      repeatCount,
      cardContext,
      recentOrders,
      activityLogs,
      relatedRequests,
      aircallRows,
      rule,
    ] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCount(customerId),
      this.cardContext(customerId ? [customerId] : []),
      customerId
        ? this.prisma.db.commerceOrder.findMany({
            where: { customerId },
            orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
            take: 5,
          })
        : Promise.resolve([]),
      customerId
        ? this.prisma.db.commerceActivityLog.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            take: 5,
          })
        : Promise.resolve([]),
      customerId
        ? this.prisma.db.serviceRequest.findMany({
            where: { customerId },
            include: { comments: { orderBy: { createdAt: 'desc' }, take: 3 } },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: 5,
          })
        : Promise.resolve([]),
      aircallWhere
        ? this.prisma.db.aircallCallEvent.findMany({
            where: aircallWhere,
            orderBy: { eventTimestamp: 'desc' },
            take: 8,
          })
        : Promise.resolve([]),
      matchedRuleId
        ? this.prisma.db.workflowRule.findFirst({ where: { id: matchedRuleId } })
        : Promise.resolve(null),
    ]);

    const card = this.queueCard(row, member.id, config, repeatCount, cardContext);
    const orders = recentOrders.map((order) => miniOrder(order));
    const basePerformance = customerId
      ? cardContext.performance.get(customerId) ?? { ...EMPTY_PERFORMANCE_30D }
      : { ...EMPTY_PERFORMANCE_30D };
    const calls30d = callsSince(aircallRows, thirtyDaysAgo());
    const performance30d = {
      ...basePerformance,
      calls: calls30d.length,
      callMinutes: Math.round(calls30d.reduce((sum, call) => sum + (call.durationSeconds ?? 0), 0) / 60),
    };

    return {
      card,
      shopifyCustomer: {
        customerId,
        shopifyCustomerId: row.customer?.shopifyCustomerId ?? null,
        phoneMatched: Boolean(customerPhone && aircallRows.some((call) => phoneVariants(customerPhone).includes(call.contactPhone ?? '') || phoneVariants(customerPhone).includes(call.contactPhoneE164 ?? ''))),
        emailMatched: Boolean(customerEmail && aircallRows.some((call) => call.contactEmail?.toLowerCase() === customerEmail.toLowerCase())),
      },
      recentOrders: orders,
      timeline: taskTimeline(row, recentOrders, aircallRows, activityLogs, relatedRequests),
      performance30d,
      notes: row.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        actorType: comment.actorType,
        createdAt: comment.createdAt.toISOString(),
      })).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      aiPsychAnalysis: latestAiPsychAnalysis(aircallRows),
      rule: rule ? {
        id: rule.id,
        name: rule.name,
        status: rule.status,
        trigger: rule.trigger,
        canvasUrl: `/rules?ruleId=${encodeURIComponent(rule.id)}`,
      } : null,
      customerDetailUrl: customerId ? `/staff/customers?customerId=${encodeURIComponent(customerId)}` : null,
    };
  }

  async saveTaskNote(id: string, input: SavePersonTaskNoteInput) {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);
    await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId: this.tenantId(),
        serviceRequestId: row.id,
        actorId: member.id,
        actorType: 'member',
        body: input.body,
        internal: true,
        attachmentsJson: [{ kind: 'person_task_note', customerId: row.customerId }] as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.serviceRequest.updateMany({ where: { id: row.id }, data: { updatedAt: new Date() } });
    this.logger.log('person_workspace', 'task.note', 'Task brief note saved', {
      service_request_id: row.id,
      member_id: member.id,
      customer_id: row.customerId,
    });
    return this.taskBrief(id);
  }

  async scheduleTaskFollowUp(id: string, input: SchedulePersonTaskFollowUpInput) {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('Follow-up time is invalid');
    const metadata = this.record(row.metadata);
    const scheduledFollowUps = Array.isArray(metadata.scheduledFollowUps)
      ? metadata.scheduledFollowUps.filter((item) => item && typeof item === 'object')
      : [];
    const followUp = {
      id: prefixedId('srcm'),
      scheduledAt: scheduledAt.toISOString(),
      note: input.note ?? null,
      createdByMemberId: member.id,
      createdAt: new Date().toISOString(),
    };
    await this.prisma.db.serviceRequest.updateMany({
      where: { id: row.id },
      data: {
        dueAt: scheduledAt,
        status: CLOSED.has(row.status) ? 'open' : row.status,
        metadata: {
          ...metadata,
          scheduledFollowUps: [...scheduledFollowUps, followUp],
        } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId: this.tenantId(),
        serviceRequestId: row.id,
        actorId: member.id,
        actorType: 'member',
        body: input.note?.trim() ? `Follow-up scheduled: ${input.note.trim()}` : `Follow-up scheduled for ${scheduledAt.toISOString()}`,
        internal: true,
        attachmentsJson: [{ kind: 'calendar_follow_up', ...followUp }] as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'task.calendar', 'Task follow-up scheduled', {
      service_request_id: row.id,
      member_id: member.id,
      scheduled_at: scheduledAt.toISOString(),
    });
    return this.taskBrief(id);
  }

  async customers() {
    const member = await this.currentMember();
    const assignments = await this.axisAssignments(member.id);
    const visibleCustomerIds = Array.from(assignments.keys());
    if (visibleCustomerIds.length === 0) return [];
    const rows = await this.prisma.db.customer.findMany({
      where: { id: { in: visibleCustomerIds } },
      include: {
        insight: true,
        segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastOrderAt: 'desc' }, { updatedAt: 'desc' }],
      take: 120,
    });
    const [config, repeatCounts] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(rows.map((row) => row.id)),
    ]);
    return rows.map((customer, index) => {
      const segment = customer.segmentMemberships[0]?.segment;
      const urgencyBreakdown = this.scoring.score({
        priority: customer.insight?.churnRisk === 'critical' ? 'critical' : customer.insight?.churnRisk === 'high' ? 'high' : 'medium',
        source: 'daily_customer',
        axis: 'support',
        createdAt: customer.lastOrderAt ?? customer.updatedAt,
        updatedAt: customer.updatedAt,
        metadata: { workflow: { params: { intent: 'follow_up', aiUrgency: customer.insight?.churnRisk ?? undefined } } },
        taskStateSnapshot: {},
        segmentPriority: segment?.priorityGlobal ?? segment?.priority ?? index,
        repeatCount: repeatCounts.get(customer.id) ?? 0,
      }, config);
      return {
        id: customer.id,
        name: customer.companyName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.email || customer.id,
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        ordersCount: customer.ordersCount,
        totalSpent: money(customer.totalSpent),
        lastContact: isoDate(customer.lastOrderAt ?? customer.updatedAt),
        lifecycle: lifecycle(customer.insight?.churnRisk, customer.ordersCount, customer.lastOrderAt),
        segment: {
          id: segment?.id ?? `insight-${customer.insight?.rfmSegment ?? 'general'}`,
          name: segment?.name ?? titleize(customer.insight?.rfmSegment ?? 'General'),
          color: segment?.color ?? SEGMENT_COLORS[index % SEGMENT_COLORS.length],
        },
        urgencyScore: urgencyBreakdown.score,
        urgencyBreakdown,
      };
    }).sort((left, right) => (right.urgencyScore ?? 0) - (left.urgencyScore ?? 0) || left.name.localeCompare(right.name));
  }

  async customerDetail(id: string) {
    const member = await this.currentMember();
    const assignments = await this.axisAssignments(member.id);
    if (!assignments.has(id)) throw new ForbiddenException('Customer is outside your axis scope');
    return this.customersService.detail(id);
  }

  async calendar() {
    const [requests, calls, mail] = await Promise.all([
      this.prisma.db.serviceRequest.findMany({
        where: { status: { notIn: Array.from(CLOSED) } },
        include: serviceRequestInclude,
        orderBy: [{ updatedAt: 'desc' }],
        take: 150,
      }),
      this.prisma.db.aircallCallEvent.findMany({ orderBy: { eventTimestamp: 'desc' }, take: 25 }),
      this.prisma.db.mailDelivery.findMany({ where: { status: 'failed' }, orderBy: { updatedAt: 'desc' }, take: 15 }),
    ]);
    return [
      ...requests.filter((row) => this.isQueueVisible(row)).slice(0, 50).map((row) => this.calendarFromRequest(row)),
      ...calls.map((row) => ({
        id: `call-${row.id}`,
        title: `${titleize(row.eventType)} call ${row.contactPhoneE164 ?? row.contactPhone ?? ''}`.trim(),
        customer: row.contactEmail ?? row.contactPhoneE164 ?? row.contactPhone ?? null,
        customerEmail: row.contactEmail,
        customerPhone: row.contactPhoneE164 ?? row.contactPhone,
        dayIso: isoDate(row.eventTimestamp),
        startHour: hour(row.eventTimestamp),
        durationMinutes: Math.max(15, Math.ceil((row.durationSeconds ?? 900) / 60)),
        kind: 'call',
        source: row.transcriptRaw ? 'ai_transcript' : 'manual',
        aiBrief: row.transcriptRaw ? {
          whyCalling: row.transcriptRaw.slice(0, 500),
          painPoints: ['Recent Aircall transcript is available'],
          callGoal: 'Review the transcript and update the customer request.',
          promptKey: 'person.workspace.aircall',
          promptVersion: 'live',
          modelUsed: 'not-generated',
          confidence: 1,
          transcriptSnippet: row.transcriptRaw.slice(0, 240),
          suggestedActions: ['Open related service request', 'Add call notes', 'Schedule follow-up if needed'],
        } : undefined,
      })),
      ...mail.map((row) => ({
        id: `mail-${row.id}`,
        title: `Mail delivery failed: ${row.subject}`,
        customer: row.recipientEmail,
        customerEmail: row.recipientEmail,
        customerPhone: null,
        dayIso: isoDate(row.updatedAt),
        startHour: hour(row.updatedAt),
        durationMinutes: 15,
        kind: 'task',
        source: 'manual',
      })),
    ];
  }

  async teammates() {
    const member = await this.currentMember();
    const [members, aircallUsers, threads] = await Promise.all([
      this.prisma.db.member.findMany({
        where: { status: 'active' },
        include: { roleAssignments: { include: { role: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: 100,
      }),
      this.prisma.db.aircallUser.findMany({ take: 200 }),
      this.messageThreads(),
    ]);
    const aircallByExternalId = new Map(aircallUsers.map((user) => [user.aircallUserId, user]));
    return members
      .filter((row) => row.id !== member.id)
      .map((row) => {
        const aircall = row.aircallUserId ? aircallByExternalId.get(row.aircallUserId) : null;
        const thread = threads.find((candidate) => participants(candidate).includes(row.id));
        const latest = latestComment(thread);
        return {
          id: row.id,
          name: `${row.firstName} ${row.lastName}`.trim() || row.email,
          email: row.email,
          role: row.roleAssignments[0]?.role.name ?? 'Member',
          status: presence(aircall?.availableStatus, row.lastLoginAt),
          lastSeen: aircall?.availableStatus ?? (row.lastLoginAt ? `last login ${relative(row.lastLoginAt)}` : 'not logged in'),
          unread: 0,
          preview: latest?.body ?? 'No internal messages yet.',
          lastAt: latest ? relative(latest.createdAt) : relative(row.updatedAt),
        };
      });
  }

  async thread(threadId: string) {
    const member = await this.currentMember();
    await this.requireMember(threadId);
    const thread = await this.findThread(member.id, threadId);
    if (!thread) return [];
    return [...thread.comments]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((comment) => ({
        id: comment.id,
        threadId,
        fromMe: comment.actorId === member.id,
        author: comment.actorId === member.id ? 'You' : 'Teammate',
        text: comment.body,
        at: relative(comment.createdAt),
      }));
  }

  async sendMessage(input: SendPersonMessageInput) {
    const member = await this.currentMember();
    const other = await this.requireMember(input.threadId);
    const thread = await this.findThread(member.id, other.id) ?? await this.createMessageThread(member, other);
    const tenantId = this.tenantId();
    const created = await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId,
        serviceRequestId: thread.id,
        actorId: member.id,
        actorType: 'member',
        body: input.text,
        internal: true,
        attachmentsJson: [],
      },
    });
    await this.prisma.db.serviceRequest.updateMany({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    this.logger.log('person_workspace', 'message.send', 'Internal person message sent', {
      thread_id: thread.id,
      member_id: member.id,
      recipient_member_id: other.id,
    });
    return { id: created.id, threadId: other.id, fromMe: true, author: 'You', text: created.body, at: 'Now' };
  }

  async notes() {
    const member = await this.currentMember();
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: { createdByActorId: member.id, metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
    return rows.map((row) => this.note(row));
  }

  async saveNote(input: SavePersonNoteInput) {
    const member = await this.currentMember();
    if (input.id) {
      const existing = await this.prisma.db.serviceRequest.findFirst({
        where: { id: input.id, createdByActorId: member.id, metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
      });
      if (!existing) throw new NotFoundException('Note not found');
      await this.prisma.db.serviceRequest.updateMany({
        where: { id: input.id },
        data: {
          title: input.title,
          description: input.body || null,
          metadata: {
            ...this.record(existing.metadata),
            noteKind: input.kind,
            linkedCustomer: input.linkedCustomer ?? null,
            linkedQueueId: input.linkedQueueId ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      this.logger.log('person_workspace', 'note.update', 'Person note updated', { note_id: input.id, member_id: member.id });
      return this.note(await this.requireServiceRequest(input.id));
    }

    const created = await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        source: 'manual',
        surface: 'internal',
        title: input.title,
        description: input.body || null,
        status: 'open',
        priority: 'low',
        createdByActorId: member.id,
        metadata: {
          personWorkspaceKind: 'note',
          noteKind: input.kind,
          linkedCustomer: input.linkedCustomer ?? null,
          linkedQueueId: input.linkedQueueId ?? null,
          category: 'person_note',
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'note.create', 'Person note created', { note_id: created.id, member_id: member.id });
    return this.note(created);
  }

  async emails() {
    const rows = await this.prisma.db.mailDelivery.findMany({ orderBy: [{ createdAt: 'desc' }], take: 50 });
    return rows.map((row) => ({
      id: row.id,
      from: row.provider ?? row.category,
      fromEmail: row.recipientEmail,
      subject: row.subject,
      preview: row.errorMessage ?? row.text?.slice(0, 220) ?? row.eventKey,
      unread: row.status === 'failed',
      at: relative(row.createdAt),
      status: row.status,
    }));
  }

  async announcements() {
    const [webhook, shopifyStates, syncLogs, failedMail] = await Promise.all([
      this.prisma.db.aircallWebhookConfig.findFirst({}),
      this.prisma.db.shopifySyncState.findMany({ orderBy: [{ updatedAt: 'desc' }], take: 4 }),
      this.prisma.db.syncLog.findMany({ orderBy: [{ createdAt: 'desc' }], take: 6 }),
      this.prisma.db.mailDelivery.count({ where: { status: 'failed' } }),
    ]);
    const rows = [];
    if (webhook) {
      rows.push({
        id: `aircall-webhook-${webhook.id}`,
        title: `Aircall webhook ${webhook.active ? 'active' : 'inactive'}`,
        body: webhook.lastFailureReason ?? `${webhook.events.length} events configured. Last event ${webhook.lastEventAt ? relative(webhook.lastEventAt) : 'not received yet'}.`,
        from: 'Aircall integration',
        severity: webhook.active ? 'success' : 'warn',
        at: relative(webhook.updatedAt),
        read: webhook.active,
      });
    }
    for (const state of shopifyStates) {
      rows.push({
        id: `shopify-${state.id}`,
        title: `Shopify ${state.resource} sync ${state.status}`,
        body: `${state.totalRecordsSynced} records synced total, ${state.lastRunRecords} in last run.${state.lastError ? ` Last error: ${state.lastError}` : ''}`,
        from: 'Shopify sync',
        severity: state.status === 'failed' ? 'critical' : state.status === 'running' ? 'warn' : 'info',
        at: relative(state.updatedAt),
        read: state.status !== 'failed',
      });
    }
    if (failedMail > 0) {
      rows.push({
        id: 'mail-failed-count',
        title: `${failedMail} mail deliveries need attention`,
        body: 'Provider send flow remains out of this target, but failed delivery state is visible to staff.',
        from: 'Mail pipeline',
        severity: 'warn',
        at: 'Now',
        read: false,
      });
    }
    for (const log of syncLogs) {
      rows.push({
        id: `sync-${log.id}`,
        title: `${log.service} ${log.action} ${log.status}`,
        body: log.message ?? 'Sync log recorded.',
        from: 'System sync',
        severity: log.status === 'failed' ? 'critical' : log.status === 'success' ? 'success' : 'info',
        at: relative(log.createdAt),
        read: log.status !== 'failed',
      });
    }
    return rows.slice(0, 12);
  }

  async notifications() {
    const member = await this.currentMember();
    const [assigned, urgent, failedMail, aircallErrors] = await Promise.all([
      this.prisma.db.serviceRequest.findMany({
        where: { assignedMemberId: member.id, status: { notIn: Array.from(CLOSED) } },
        orderBy: [{ updatedAt: 'desc' }],
        take: 12,
      }),
      this.prisma.db.serviceRequest.findMany({
        where: { assignedMemberId: null, priority: { in: ['critical', 'urgent', 'high'] }, status: { notIn: Array.from(CLOSED) } },
        orderBy: [{ updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.db.mailDelivery.findMany({ where: { status: 'failed' }, orderBy: [{ updatedAt: 'desc' }], take: 5 }),
      this.prisma.db.aircallCallEvent.findMany({
        where: { processingError: { not: null } },
        orderBy: [{ receivedAt: 'desc' }],
        take: 5,
      }),
    ]);
    return [
      ...assigned.map((row) => ({ id: `assigned-${row.id}`, kind: 'assigned', title: `Assigned: ${row.title}`, body: row.description ?? row.status, at: relative(row.updatedAt), read: false })),
      ...urgent.map((row) => ({ id: `sla-${row.id}`, kind: 'sla', title: `${row.priority.toUpperCase()} unassigned request`, body: row.title, at: relative(row.updatedAt), read: false })),
      ...failedMail.map((row) => ({ id: `mail-${row.id}`, kind: 'system', title: 'Mail delivery failed', body: `${row.recipientEmail}: ${row.errorMessage ?? row.subject}`, at: relative(row.updatedAt), read: false })),
      ...aircallErrors.map((row) => ({ id: `aircall-${row.id}`, kind: 'system', title: 'Aircall ingest error', body: row.processingError ?? row.externalCallId, at: relative(row.receivedAt), read: false })),
    ].slice(0, 30);
  }

  async training() {
    const [stats, segments, requests] = await Promise.all([
      this.prisma.db.serviceRequest.groupBy({ by: ['priority'], _count: { _all: true } }),
      this.prisma.db.segment.findMany({ where: { isActive: true }, orderBy: [{ priority: 'desc' }], take: 8 }),
      this.prisma.db.serviceRequest.findMany({
        where: { priority: { in: ['critical', 'urgent', 'high'] } },
        orderBy: [{ updatedAt: 'desc' }],
        take: 8,
      }),
    ]);
    const highCount = stats.filter((row) => ['critical', 'urgent', 'high'].includes(row.priority)).reduce((sum, row) => sum + row._count._all, 0);
    return {
      highPriorityCount: highCount,
      cards: [
        ...segments.map((segment) => ({
          id: `segment-${segment.id}`,
          title: `${segment.name} outreach script`,
          description: segment.description ?? `Use this segment context for ${segment.name} customer conversations.`,
          source: 'segment',
          updatedAt: relative(segment.updatedAt),
        })),
        ...requests.map((request) => ({
          id: `request-${request.id}`,
          title: `${request.priority.toUpperCase()} case review`,
          description: request.title,
          source: 'support',
          updatedAt: relative(request.updatedAt),
        })),
      ].slice(0, 12),
    };
  }

  async requests() {
    const member = await this.currentMember();
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: { createdByActorId: member.id, metadata: { path: ['personWorkspaceKind'], equals: 'staff_request' } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      category: String(this.record(row.metadata).category ?? 'other'),
      priority: row.priority,
      status: row.status,
      createdAt: relative(row.createdAt),
      updatedAt: relative(row.updatedAt),
    }));
  }

  async createRequest(input: CreatePersonRequestInput) {
    const member = await this.currentMember();
    const created = await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        source: 'manual',
        surface: 'internal',
        title: input.title,
        description: input.description,
        status: 'open',
        priority: input.priority,
        createdByActorId: member.id,
        metadata: {
          personWorkspaceKind: 'staff_request',
          category: input.category,
          requestedByEmail: member.email,
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'request.create', 'Staff request created', {
      service_request_id: created.id,
      member_id: member.id,
      category: input.category,
    });
    return this.requests();
  }

  private async axisAssignments(memberId: string): Promise<AxisAssignments> {
    const rows = await this.prisma.db.customerAssignment.findMany({
      where: { memberId, isPrimary: true },
      select: { customerId: true, axis: true },
      take: 10000,
    });
    const map: AxisAssignments = new Map();
    for (const row of rows) {
      const axes = map.get(row.customerId) ?? new Set<string>();
      axes.add(row.axis);
      map.set(row.customerId, axes);
    }
    return map;
  }

  private async assertServiceRequestScoped(row: ServiceRequestRow, memberId: string) {
    const assignments = await this.axisAssignments(memberId);
    if (!this.isServiceRequestScoped(row, assignments, memberId)) {
      throw new ForbiddenException('Customer is outside your axis scope');
    }
  }

  private isServiceRequestScoped(row: { customerId: string | null; assignedMemberId: string | null; axis: string | null }, assignments: AxisAssignments, memberId: string) {
    if (!row.customerId) return row.assignedMemberId === memberId;
    const axes = assignments.get(row.customerId);
    if (!axes) return false;
    return row.axis ? axes.has(row.axis) : true;
  }

  private isTaskPinned(row: { metadata: Prisma.JsonValue }, memberId: string) {
    const pinnedBy = this.record(this.record(row.metadata).personPinnedBy);
    return typeof pinnedBy[memberId] === 'number';
  }

  private customerPins(memberId: string, customerIds: string[]) {
    if (customerIds.length === 0) return [];
    return this.prisma.db.serviceRequest.findMany({
      where: {
        customerId: { in: customerIds },
        assignedMemberId: memberId,
        source: CUSTOMER_PIN_SOURCE,
        surface: CUSTOMER_PIN_SURFACE,
        status: { notIn: Array.from(CLOSED) },
        metadata: { path: ['personWorkspaceKind'], equals: CUSTOMER_PIN_KIND },
      },
      include: {
        customer: {
          include: {
            insight: true,
            segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 3 },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500,
    });
  }

  private dailyCallItem(
    membership: SegmentMembershipRow,
    ownership: { priority: number; dailyCap: number | null; segment: { id: string; name: string; color: string; priority: number; priorityGlobal: number } },
    assignments: AxisAssignments,
    config = this.scoring.configFrom({}),
    repeatCount = 0,
    pin: CustomerPinRow | null = null,
  ) {
    const customer = membership.customer;
    const axes = assignments.get(customer.id) ?? new Set<string>();
    const assignedAxis = Array.from(axes).sort().join(', ') || 'unassigned';
    const urgencyBreakdown = this.scoring.score({
      priority: customer.insight?.churnRisk === 'critical' ? 'critical' : customer.insight?.churnRisk === 'high' ? 'high' : 'medium',
      source: 'daily_customer',
      axis: assignedAxis,
      createdAt: customer.lastOrderAt ?? membership.matchedAt,
      updatedAt: customer.updatedAt,
      metadata: { workflow: { params: { intent: 'follow_up', aiUrgency: customer.insight?.churnRisk ?? undefined } } },
      taskStateSnapshot: {
        segment: {
          id: membership.segment.id,
          name: membership.segment.name,
          priority: membership.segment.priority,
          priorityGlobal: membership.segment.priorityGlobal,
        },
        segmentMembershipScore: Number(membership.score ?? 0),
      },
      segmentPriority: Math.max(membership.segment.priorityGlobal, membership.segment.priority, ownership.priority),
      repeatCount,
    }, config);
    return {
      kind: 'customer' as const,
      id: `daily-${membership.segmentId}-${customer.id}`,
      customerId: customer.id,
      customerName: customerDisplayName(customer),
      email: customer.email,
      phone: customer.phone,
      ordersCount: customer.ordersCount,
      totalSpent: money(customer.totalSpent),
      lastContact: isoDate(customer.lastOrderAt ?? customer.updatedAt),
      assignedAxis,
      segment: {
        id: membership.segment.id,
        name: membership.segment.name,
        color: membership.segment.color,
        priority: ownership.priority,
        dailyCap: ownership.dailyCap,
      },
      urgencyScore: urgencyBreakdown.score,
      urgencyBreakdown,
      repeatCount,
      pinned: Boolean(pin),
      pinId: pin?.id ?? null,
      reason: `${membership.segment.name} segment - ${repeatCount} recent requests - ${assignedAxis} axis`,
    };
  }

  private customerPinCard(row: CustomerPinRow, assignments: AxisAssignments, config = this.scoring.configFrom({}), repeatCount = 0) {
    const customer = row.customer;
    const segment = customer?.segmentMemberships[0]?.segment;
    const axes = row.customerId ? assignments.get(row.customerId) : null;
    const assignedAxis = axes ? Array.from(axes).sort().join(', ') : 'unassigned';
    const metadata = this.record(row.metadata);
    const pinnedBy = this.record(metadata.personPinnedBy);
    const pinnedAtValues = Object.values(pinnedBy).filter((value): value is number => typeof value === 'number');
    const pinnedAt = pinnedAtValues.length ? Math.max(...pinnedAtValues) : row.updatedAt.getTime();
    const urgencyBreakdown = this.scoring.score({
      priority: customer?.insight?.churnRisk === 'critical' ? 'critical' : customer?.insight?.churnRisk === 'high' ? 'high' : row.priority,
      source: 'daily_customer',
      axis: assignedAxis,
      createdAt: customer?.lastOrderAt ?? row.createdAt,
      updatedAt: row.updatedAt,
      metadata: { workflow: { params: { intent: 'follow_up', aiUrgency: customer?.insight?.churnRisk ?? undefined } } },
      taskStateSnapshot: row.taskStateSnapshot,
      segmentPriority: segment?.priorityGlobal ?? segment?.priority ?? 0,
      repeatCount,
    }, config);
    return {
      kind: 'customer' as const,
      id: row.id,
      customerId: row.customerId,
      title: customer ? customerDisplayName(customer) : row.title,
      summary: `Pinned customer - U${urgencyBreakdown.score} - ${assignedAxis}`,
      segment: segment?.name ?? 'Pinned customer',
      segmentColor: segment?.color ?? colorForUrgency(urgencyBreakdown.score),
      priority: priorityRankFromUrgency(urgencyBreakdown.score),
      urgencyScore: urgencyBreakdown.score,
      urgencyBreakdown,
      columnId: 'unassigned' as const,
      pinned: true,
      pinnedAt,
      source: 'manual' as const,
      phone: customer?.phone ?? undefined,
      email: customer?.email ?? undefined,
      ordersCount: customer?.ordersCount ?? undefined,
      totalSpent: customer ? money(customer.totalSpent) : undefined,
    };
  }

  private async currentMember() {
    const context = this.tenantContext.require();
    if (context.principalType !== 'member' || !context.principalId) {
      throw new ForbiddenException('Person workspace requires a member session');
    }
    const member = await this.prisma.db.member.findFirst({
      where: { id: context.principalId },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!member) throw new ForbiddenException('Member session is no longer active');
    return member;
  }

  private async requireMember(id: string) {
    const member = await this.prisma.db.member.findFirst({ where: { id, status: 'active' } });
    if (!member) throw new NotFoundException('Teammate not found');
    return member;
  }

  private async requireServiceRequest(id: string) {
    const row = await this.prisma.db.serviceRequest.findFirst({
      where: { id },
      include: serviceRequestInclude,
    });
    if (!row) throw new NotFoundException('Service request not found');
    return row;
  }

  private queueCard(row: ServiceRequestRow, memberId: string, config = this.scoring.configFrom({}), repeatCount = 0, cardContext?: CardContext) {
    const metadata = this.record(row.metadata);
    const pinnedBy = this.record(metadata.personPinnedBy);
    const pinnedAt = typeof pinnedBy[memberId] === 'number' ? Number(pinnedBy[memberId]) : null;
    const columnId = personColumn(row.status, metadata.personColumnId);
    const source = taskSource(row);
    const customerName = row.customer?.companyName ?? row.customerUser?.email ?? row.title;
    const ticket = ticketNumber(row);
    const workflowTrace = workflowTraceFromMetadata(metadata);
    const matchedRuleId = row.matchedRuleId ?? workflowTrace?.matchedRuleId ?? workflowTrace?.ruleId ?? null;
    const urgencyBreakdown = this.scoring.score({
      priority: row.priority,
      source: row.source,
      axis: row.axis,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
      taskStateSnapshot: row.taskStateSnapshot,
      segmentPriority: row.customer?.segmentMemberships[0]?.segment.priorityGlobal ?? row.customer?.segmentMemberships[0]?.segment.priority ?? null,
      repeatCount,
    }, config);
    return {
      kind: 'task' as const,
      id: row.id,
      customerId: row.customerId,
      title: customerName,
      summary: `${ticket} - U${urgencyBreakdown.score} - ${titleize(row.status)} - ${relative(row.updatedAt)}`,
      segment: String(metadata.category ?? row.surface ?? 'Support'),
      segmentColor: colorForUrgency(urgencyBreakdown.score),
      priority: priorityRankFromUrgency(urgencyBreakdown.score),
      urgencyScore: urgencyBreakdown.score,
      urgencyBreakdown,
      columnId,
      pinned: pinnedAt !== null,
      pinnedAt,
      source,
      phone: row.customer?.phone ?? row.customerUser?.phone ?? undefined,
      email: row.customer?.email ?? row.customerUser?.email ?? undefined,
      ordersCount: row.customer?.ordersCount ?? undefined,
      totalSpent: row.customer ? money(row.customer.totalSpent) : undefined,
      aiBrief: source === 'manual' ? undefined : this.brief(row),
      workflowTrace,
      taskStateSnapshot: taskStateSnapshotFromJson(row.taskStateSnapshot),
      matchedRuleId,
      miniOrder: row.customerId ? cardContext?.miniOrders.get(row.customerId) : undefined,
      performance30d: row.customerId ? cardContext?.performance.get(row.customerId) ?? { ...EMPTY_PERFORMANCE_30D } : undefined,
    };
  }

  private async urgencyConfig() {
    const config = await this.prisma.db.tenantConfig.findFirst({ select: { urgencyScoringConfig: true } });
    return this.scoring.configFrom(config?.urgencyScoringConfig ?? {});
  }

  private async repeatCounts(customerIds: string[]) {
    const uniqueIds = Array.from(new Set(customerIds));
    if (uniqueIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.db.serviceRequest.groupBy({
      by: ['customerId'],
      where: { customerId: { in: uniqueIds } },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((row) => row.customerId ? [[row.customerId, row._count._all] as const] : []));
  }

  private async repeatCount(customerId: string | null) {
    if (!customerId) return 0;
    const counts = await this.repeatCounts([customerId]);
    return counts.get(customerId) ?? 0;
  }

  private async cardContext(customerIds: string[]): Promise<CardContext> {
    const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
    const miniOrders = new Map<string, PersonMiniOrder>();
    const performance = new Map<string, PersonPerformance30d>();
    if (uniqueIds.length === 0) return { miniOrders, performance };

    const since = thirtyDaysAgo();
    const [orders, orderAgg, requestAgg] = await Promise.all([
      this.prisma.db.commerceOrder.findMany({
        where: { customerId: { in: uniqueIds } },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(uniqueIds.length * 5, 500),
      }),
      this.prisma.db.commerceOrder.groupBy({
        by: ['customerId'],
        where: { customerId: { in: uniqueIds }, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.db.serviceRequest.groupBy({
        by: ['customerId'],
        where: { customerId: { in: uniqueIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    for (const order of orders) {
      if (!order.customerId || miniOrders.has(order.customerId)) continue;
      miniOrders.set(order.customerId, miniOrder(order));
    }
    for (const id of uniqueIds) performance.set(id, { ...EMPTY_PERFORMANCE_30D });
    for (const row of orderAgg) {
      if (!row.customerId) continue;
      performance.set(row.customerId, {
        ...(performance.get(row.customerId) ?? EMPTY_PERFORMANCE_30D),
        orders: row._count._all,
        revenue: money(row._sum.totalPrice),
      });
    }
    for (const row of requestAgg) {
      if (!row.customerId) continue;
      performance.set(row.customerId, {
        ...(performance.get(row.customerId) ?? EMPTY_PERFORMANCE_30D),
        serviceRequests: row._count._all,
      });
    }
    return { miniOrders, performance };
  }

  private calendarFromRequest(row: ServiceRequestRow) {
    const date = row.dueAt ?? (row.assignedMemberId ? row.updatedAt : row.createdAt);
    return {
      id: `sr-${row.id}`,
      title: row.title,
      customer: row.customer?.companyName ?? row.customerUser?.email ?? null,
      customerEmail: row.customer?.email ?? row.customerUser?.email ?? null,
      customerPhone: row.customer?.phone ?? row.customerUser?.phone ?? null,
      dayIso: isoDate(date),
      startHour: hour(date),
      durationMinutes: row.priority === 'critical' || row.priority === 'urgent' ? 30 : 20,
      kind: row.source === 'call' ? 'callback' : 'task',
      source: taskSource(row),
      aiBrief: taskSource(row) === 'manual' ? undefined : this.brief(row),
    };
  }

  private brief(row: ServiceRequestRow) {
    return {
      whyCalling: row.description ?? row.title,
      upsetAbout: row.priority === 'critical' || row.priority === 'urgent' ? 'High-priority service request needs a human response.' : 'No explicit complaint captured.',
      painPoints: [titleize(row.priority), titleize(row.status), String(this.record(row.metadata).category ?? row.source)],
      callGoal: CLOSED.has(row.status) ? 'Confirm the resolution and close the loop.' : 'Move the service request to the next accountable status.',
      suggestedActions: ['Review customer context', 'Add an internal note', 'Update status before leaving the screen'],
      promptKey: 'person.workspace.live-context',
      promptVersion: 'live',
      modelUsed: 'not-generated',
      confidence: 1,
      transcriptSnippet: row.description?.slice(0, 240),
    };
  }

  private note(row: { id: string; title: string; description: string | null; metadata: Prisma.JsonValue; createdAt: Date; updatedAt: Date }) {
    const metadata = this.record(row.metadata);
    return {
      id: row.id,
      kind: metadata.noteKind === 'queue' ? 'queue' : 'scratch',
      title: row.title,
      body: row.description ?? '',
      linkedCustomer: typeof metadata.linkedCustomer === 'string' ? metadata.linkedCustomer : undefined,
      linkedQueueId: typeof metadata.linkedQueueId === 'string' ? metadata.linkedQueueId : undefined,
      createdAt: relative(row.createdAt),
      updatedAt: relative(row.updatedAt),
    };
  }

  private async messageThreads() {
    return this.prisma.db.serviceRequest.findMany({
      where: { metadata: { path: ['personWorkspaceKind'], equals: 'message_thread' } },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  private async findThread(memberA: string, memberB: string) {
    const threads = await this.messageThreads();
    return threads.find((thread) => {
      const ids = participants(thread);
      return ids.includes(memberA) && ids.includes(memberB);
    }) ?? null;
  }

  private async createMessageThread(member: { id: string; firstName: string; lastName: string; email: string }, other: { id: string; firstName: string; lastName: string; email: string }) {
    return this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        source: 'manual',
        surface: 'internal',
        title: `Internal chat: ${member.email} / ${other.email}`,
        description: null,
        status: 'open',
        priority: 'low',
        createdByActorId: member.id,
        metadata: {
          personWorkspaceKind: 'message_thread',
          participantIds: [member.id, other.id],
          category: 'internal_message',
        } as Prisma.InputJsonValue,
      },
      include: { comments: true },
    });
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private isQueueVisible(row: { metadata: Prisma.JsonValue }) {
    const kind = this.record(row.metadata).personWorkspaceKind;
    return typeof kind !== 'string' || !INTERNAL_WORKSPACE_KINDS.has(kind);
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context is required');
    return tenantId;
  }
}

function participants(thread: { metadata: Prisma.JsonValue }) {
  const metadata = thread.metadata && typeof thread.metadata === 'object' && !Array.isArray(thread.metadata)
    ? thread.metadata as Record<string, unknown>
    : {};
  return Array.isArray(metadata.participantIds) ? metadata.participantIds.filter((id): id is string => typeof id === 'string') : [];
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function sortDaily(
  left: { urgencyScore: number; customerName: string; repeatCount: number },
  right: { urgencyScore: number; customerName: string; repeatCount: number },
) {
  return right.urgencyScore - left.urgencyScore
    || right.repeatCount - left.repeatCount
    || left.customerName.localeCompare(right.customerName);
}

function uniqueHighUrgencyCount(
  daily: { customerId: string; urgencyScore: number }[],
  tasks: { customerId?: string | null; id: string; urgencyScore: number }[],
) {
  const seen = new Set<string>();
  let count = 0;
  for (const item of daily) {
    if (item.urgencyScore < 80) continue;
    const key = `customer:${item.customerId}`;
    if (!seen.has(key)) {
      seen.add(key);
      count += 1;
    }
  }
  for (const item of tasks) {
    if (item.urgencyScore < 80) continue;
    const key = item.customerId ? `customer:${item.customerId}` : `task:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      count += 1;
    }
  }
  return count;
}

function customerDisplayName(customer: { companyName: string | null; firstName?: string | null; lastName?: string | null; email: string | null; id: string }) {
  return customer.companyName
    || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    || customer.email
    || customer.id;
}

function workflowTraceFromMetadata(metadata: Record<string, unknown>): PersonTaskWorkflowTrace | undefined {
  const workflow = asRecord(metadata.workflow);
  if (!Object.keys(workflow).length) return undefined;

  const conditionTrace = normalizeConditionTrace(workflow.conditionTrace);
  const whenTrace = normalizeWhenTrace(workflow.whenTrace);
  const trace: PersonTaskWorkflowTrace = {
    ruleId: stringOrNull(workflow.ruleId),
    matchedRuleId: stringOrNull(workflow.matchedRuleId ?? workflow.matched_rule_id),
    ruleName: stringOrNull(workflow.ruleName),
    trigger: stringOrNull(workflow.trigger),
    source: stringOrNull(workflow.source),
    eventId: stringOrNull(workflow.eventId),
    action: stringOrNull(workflow.action),
    actionId: stringOrNull(workflow.actionId),
    conditionTrace,
    whenTrace,
  };

  if (
    !trace.ruleId
    && !trace.matchedRuleId
    && !trace.ruleName
    && !trace.trigger
    && conditionTrace.length === 0
    && whenTrace.length === 0
  ) {
    return undefined;
  }

  return trace;
}

function taskStateSnapshotFromJson(value: unknown): PersonTaskStateSnapshot | undefined {
  const snapshot = asRecord(value);
  return Object.keys(snapshot).length ? snapshot : undefined;
}

function matchedRuleIdFrom(row: { matchedRuleId: string | null; metadata: Prisma.JsonValue }) {
  const workflow = asRecord(asRecord(row.metadata).workflow);
  return row.matchedRuleId
    ?? stringOrNull(workflow.matchedRuleId ?? workflow.matched_rule_id ?? workflow.ruleId);
}

function thirtyDaysAgo() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function miniOrder(order: {
  id: string;
  shopifyOrderNumber: string | null;
  totalPrice: unknown;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  processedAt: Date | null;
  createdAt: Date;
}): PersonMiniOrder {
  return {
    id: order.id,
    orderNumber: order.shopifyOrderNumber,
    totalPrice: money(order.totalPrice),
    currency: order.currency,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    processedAt: order.processedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

function callsSince<T extends { eventTimestamp: Date }>(rows: T[], since: Date) {
  return rows.filter((row) => row.eventTimestamp.getTime() >= since.getTime());
}

function taskTimeline(
  row: ServiceRequestRow,
  orders: Array<{
    id: string;
    shopifyOrderNumber: string | null;
    totalPrice: unknown;
    currency: string;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    processedAt: Date | null;
    createdAt: Date;
  }>,
  calls: Array<{
    id: string;
    eventType: string;
    eventTimestamp: Date;
    direction: string | null;
    status: string | null;
    durationSeconds: number | null;
    transcriptRaw: string | null;
    resolverOutput: Prisma.JsonValue | null;
  }>,
  activityLogs: Array<{
    id: string;
    eventType: string;
    payload: Prisma.JsonValue;
    createdAt: Date;
  }>,
  relatedRequests: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    updatedAt: Date;
    createdAt: Date;
    comments?: Array<{ body: string; createdAt: Date }>;
  }>,
): PersonTaskTimelineEntry[] {
  const entries: PersonTaskTimelineEntry[] = [{
    id: `task-created-${row.id}`,
    kind: 'task',
    title: row.title,
    summary: row.description ?? row.status,
    at: row.createdAt.toISOString(),
    meta: { status: row.status, priority: row.priority },
  }];

  for (const order of orders) {
    entries.push({
      id: `order-${order.id}`,
      kind: 'order',
      title: order.shopifyOrderNumber ? `Order ${order.shopifyOrderNumber}` : 'Shopify order',
      summary: `${order.currency} ${money(order.totalPrice).toLocaleString()} - ${order.financialStatus ?? 'status unknown'}`,
      at: (order.processedAt ?? order.createdAt).toISOString(),
      meta: {
        orderId: order.id,
        fulfillmentStatus: order.fulfillmentStatus,
      },
    });
  }

  for (const call of calls) {
    const resolver = asRecord(call.resolverOutput);
    entries.push({
      id: `aircall-${call.id}`,
      kind: 'aircall',
      title: `${titleize(call.eventType)} ${call.direction ?? 'call'}`.trim(),
      summary: stringOrNull(resolver.summary) ?? call.transcriptRaw?.slice(0, 220) ?? call.status,
      at: call.eventTimestamp.toISOString(),
      meta: {
        durationSeconds: call.durationSeconds,
        status: call.status,
        intent: stringOrNull(resolver.call_intent),
        psychTags: stringArray(resolver.psych_tags),
      },
    });
  }

  for (const comment of row.comments) {
    entries.push({
      id: `note-${comment.id}`,
      kind: 'note',
      title: 'Task note',
      summary: comment.body,
      at: comment.createdAt.toISOString(),
      meta: { actorType: comment.actorType, internal: comment.internal },
    });
  }

  for (const request of relatedRequests) {
    if (request.id === row.id) continue;
    entries.push({
      id: `request-${request.id}`,
      kind: 'task',
      title: request.title,
      summary: `${titleize(request.status)} - ${titleize(request.priority)}`,
      at: request.updatedAt.toISOString(),
      meta: { requestId: request.id, comments: request.comments?.length ?? 0 },
    });
  }

  for (const log of activityLogs) {
    entries.push({
      id: `activity-${log.id}`,
      kind: 'activity',
      title: titleize(log.eventType),
      summary: summarizePayload(log.payload),
      at: log.createdAt.toISOString(),
      meta: { eventType: log.eventType },
    });
  }

  return entries
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 16);
}

function latestAiPsychAnalysis(calls: Array<{
  eventTimestamp: Date;
  resolvedAt: Date | null;
  resolverOutput: Prisma.JsonValue | null;
  transcriptRaw: string | null;
}>): PersonAiPsychAnalysis | null {
  const call = calls.find((row) => row.resolverOutput) ?? calls.find((row) => row.transcriptRaw);
  if (!call) return null;
  const output = asRecord(call.resolverOutput);
  const tags = stringArray(output.psych_tags);
  const shipping = asRecord(output.shipping_signals);
  const payment = asRecord(output.payment_signals);
  const products = valueArray(output.product_mentions)
    .map((item) => asRecord(item))
    .map((item) => stringOrNull(item.name_hint ?? item.sku))
    .filter((item): item is string => Boolean(item));
  const objections = uniqueStrings([
    shipping.complaint === true ? 'Shipping complaint' : null,
    payment.complaint === true ? 'Payment complaint' : null,
    payment.refund_asked === true ? 'Refund asked' : null,
    tags.includes('complaint') ? 'Complaint language' : null,
    tags.includes('refund_intent') ? 'Refund intent' : null,
  ]);
  const buyingSignals = uniqueStrings([
    ...products.map((product) => `Mentioned ${product}`),
    tags.includes('purchase_intent') ? 'Purchase intent' : null,
    tags.includes('satisfied') ? 'Satisfied tone' : null,
  ]);
  const hesitationSignals = uniqueStrings([
    tags.includes('shipping_issue') ? 'Shipping issue' : null,
    tags.includes('info_request') ? 'Information request' : null,
    stringOrNull(output.urgency_signal) ? `Urgency ${stringOrNull(output.urgency_signal)}` : null,
  ]);
  return {
    communicationStyle: stringOrNull(output.call_intent),
    decisionMakingStyle: stringOrNull(output.urgency_signal),
    trustLevel: null,
    engagementLevel: null,
    winProbability: null,
    motivators: tags,
    objections,
    buyingSignals,
    hesitationSignals,
    talkTrack: stringOrNull(output.summary) ?? call.transcriptRaw?.slice(0, 320) ?? null,
    generatedAt: call.resolvedAt?.toISOString() ?? call.eventTimestamp.toISOString(),
  };
}

function summarizePayload(value: unknown) {
  const payload = asRecord(value);
  const summary = stringOrNull(payload.summary ?? payload.title ?? payload.name ?? payload.status);
  if (summary) return summary;
  const serialized = JSON.stringify(payload);
  return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
}

function normalizeWhenTrace(value: unknown): WorkflowWhenGroupTrace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const conditionTrace = normalizeConditionTrace(row.conditionTrace);
    if (!row.id && conditionTrace.length === 0) return [];
    return [{
      id: stringOrNull(row.id) ?? 'when-group',
      matched: row.matched === true,
      conditionTrace,
    }];
  });
}

function normalizeConditionTrace(value: unknown): WorkflowConditionTrace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const condition = stringOrNull(row.condition);
    if (!condition) return [];
    return [{
      id: stringOrNull(row.id) ?? condition,
      condition,
      operator: stringOrNull(row.operator) ?? '=',
      expected: has(row, 'expected') ? row.expected : null,
      actual: has(row, 'actual') ? row.actual : null,
      matched: row.matched === true,
      source: stringOrNull(row.source) ?? 'workflow',
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw ? raw : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function valueArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function has(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function latestComment(thread?: { comments?: { body: string; createdAt: Date }[] } | null) {
  if (!thread?.comments?.length) return null;
  return [...thread.comments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

function personColumn(status: string, raw: unknown): PersonQueueColumn {
  if (raw === 'unassigned' || raw === 'in_progress' || raw === 'positive' || raw === 'closed') return raw;
  if (status === 'closed' || status === 'resolved' || status === 'transferred') return 'closed';
  if (status === 'pending_resolve' || status === 'waiting_on_customer') return 'positive';
  if (status === 'in_progress' || status === 'reopened' || status === 'pending_transfer') return 'in_progress';
  return 'unassigned';
}

function taskSource(row: { source: string; sourceCallId?: string | null; sourceEmailId?: string | null; metadata: Prisma.JsonValue }): 'manual' | 'ai_transcript' | 'ai_segment' | 'ai_stale' {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  if (metadata.aiSource === 'segment') return 'ai_segment';
  if (metadata.aiSource === 'stale') return 'ai_stale';
  if (row.source === 'call' || row.sourceCallId || row.sourceEmailId) return 'ai_transcript';
  return 'manual';
}

function ticketNumber(row: { id: string; metadata: Prisma.JsonValue }) {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  return String(metadata.ticketNumber || `SR-${row.id.slice(-8).toUpperCase()}`);
}

function money(value: unknown) {
  return Number(value ?? 0);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function hour(value: Date) {
  const h = value.getUTCHours();
  return Math.max(9, Math.min(17, h));
}

function titleize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sortByUrgency(left: { urgencyScore: number; pinnedAt: number | null; title: string }, right: { urgencyScore: number; pinnedAt: number | null; title: string }) {
  return right.urgencyScore - left.urgencyScore
    || (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0)
    || left.title.localeCompare(right.title);
}

function colorForUrgency(score: number) {
  if (score >= 80) return '#b91c1c';
  if (score >= 50) return '#b45309';
  if (score >= 25) return '#2563eb';
  return '#0f766e';
}

function lifecycle(churnRisk: string | null | undefined, ordersCount: number, lastOrderAt: Date | null) {
  if (churnRisk === 'critical' || churnRisk === 'high') return 'at_risk';
  if (ordersCount === 0) return 'lead';
  if (!lastOrderAt) return 'engaged';
  const ageDays = (Date.now() - lastOrderAt.getTime()) / 86_400_000;
  if (ageDays <= 45) return 'active';
  if (ageDays > 180) return 'at_risk';
  return 'engaged';
}

function presence(status: string | null | undefined, lastLoginAt: Date | null) {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized.includes('available')) return 'online';
  if (normalized.includes('busy') || normalized.includes('call')) return 'busy';
  if (lastLoginAt && Date.now() - lastLoginAt.getTime() < 60 * 60 * 1000) return 'online';
  if (lastLoginAt && Date.now() - lastLoginAt.getTime() < 24 * 60 * 60 * 1000) return 'away';
  return 'offline';
}

function relative(value: Date) {
  const diff = Date.now() - value.getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
