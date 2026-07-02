import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MEMBER_PERMISSIONS, TRANSCRIPT_RESOLVER_SCHEMA_VERSION, transcriptResolverOutputSchema } from '@factory-engine-pro/contracts';
import type {
  CreatePersonRequestInput,
  MovePersonQueueCardInput,
  PersonAiPsychAnalysis,
  PersonCustomerArchiveQuery,
  PersonDailyCallItem,
  PersonEmailContact,
  PersonDailyOperationRange,
  PersonDailyOperationsQuery,
  PersonTaskSyncResult,
  PersonTaskTransferResult,
  PersonMiniOrder,
  PersonPerformance30d,
  PersonQueueCardDto,
  PersonQueueColumn,
  PersonTaskBriefDetail,
  PersonTaskStateSnapshot,
  PersonTaskTimelineEntry,
  PersonTaskWorkflowTrace,
  PersonTransferTarget,
  PersonTaskBrief,
  TranscriptResolverOutput,
  UrgencyScoringConfig,
  ReorderPersonDailyCallInput,
  ReorderPersonDailyCallResult,
  ReplyPersonNoteInput,
  SavePersonEmailDraftInput,
  SavePersonCustomerNoteInput,
  SavePersonTaskNoteInput,
  SchedulePersonTaskFollowUpInput,
  SavePersonNoteInput,
  SendPersonMessageInput,
  SendPersonEmailInput,
  TogglePersonQueuePinInput,
  TransferPersonTaskInput,
  WorkflowConditionTrace,
  WorkflowWhenGroupTrace,
  CustomerAssignmentAxis,
  CreateTaskAxis,
  ArchivePersonDailyCallResult,
  AircallDialInput,
  AircallDialResponse,
} from '@factory-engine-pro/contracts';
import { aircallWhereFor, phoneVariants } from '../../shared/contact-match.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { RealtimeService } from '../../shared/realtime.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallService } from '../aircall/aircall.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { MailService } from '../mail/mail.service.js';
import { RulesService } from '../rules/rules.service.js';
import { isNonCatalogPromoPatchInquiry } from '../ai/transcript-operational-signals.js';
import { priorityRankFromUrgency, UrgencyScoringService } from './urgency-scoring.service.js';

const CLOSED = new Set(['closed', 'resolved', 'transferred']);
const CUSTOMER_PIN_KIND = 'customer_pin';
const CUSTOMER_PIN_SOURCE = 'manual';
const LEGACY_CUSTOMER_PIN_SOURCE = 'manual_pin';
const CUSTOMER_PIN_SURFACE = 'person_pin';
const INTERNAL_WORKSPACE_KINDS = new Set(['message_thread', 'note', 'staff_request', CUSTOMER_PIN_KIND]);
const DAILY_WORKFLOW_TRIGGERS = new Set(['aircall.transcript.received', 'call_intent.classified', 'psych.tag.detected', 'call.operational_signal.detected']);
const DAILY_WORKFLOW_AXES = new Set(['sales', 'account']);
const ARCHIVE_ORDER_DATE = new Date('1970-01-01T00:00:00.000Z');
const COLUMN_STATUS: Record<PersonQueueColumn, string> = {
  unassigned: 'open',
  in_progress: 'in_progress',
  positive: 'pending_resolve',
  closed: 'closed',
};
const SEGMENT_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#b91c1c', '#475569'];
const TRANSFER_AXES = ['sales', 'account'] as const satisfies readonly CreateTaskAxis[];
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
  participants: true,
  comments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ServiceRequestInclude;

type ServiceRequestRow = Prisma.ServiceRequestGetPayload<{
  include: typeof serviceRequestInclude;
}>;

type AxisAssignments = Map<string, Set<string>>;

type SegmentOwnershipRow = Prisma.SegmentOwnershipGetPayload<{
  include: { segment: true };
}>;

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

type CustomerWorkspaceRow = Prisma.CustomerGetPayload<{
  include: {
    insight: true;
    segmentMemberships: { include: { segment: true } };
  };
}>;

interface PersonDailyCallOrderRow {
  segmentId: string;
  customerId: string;
  position: number;
}

interface PersonDailyTaskOrderRow {
  serviceRequestId: string;
  position: number;
}

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

interface CardCallContext {
  callsById: Map<string, CardCallRow>;
}

interface CardCallRow {
  id: string;
  contactPhone: string | null;
  contactPhoneE164: string | null;
  contactEmail: string | null;
  transcriptRaw: string | null;
  resolverOutput: Prisma.JsonValue | null;
  resolverModel: string | null;
  resolverPromptKey: string | null;
  resolvedWithVersion: number | null;
}

interface OwnedSegmentContext {
  segmentId: string;
  segmentName: string;
  segmentColor: string;
  segmentPriority: number;
  ownershipPriority: number;
  matchedAt: Date;
}

interface PersonPriorityCustomerContext {
  notesCount: number;
  openTasksCount: number;
  openRequestsCount: number;
  callsCount: number;
  latestNote: {
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
  } | null;
  latestOrder: {
    id: string;
    orderNumber: string | null;
    totalPrice: number;
    currency: string;
    processedAt: string | null;
  } | null;
  latestCall: {
    id: string;
    phone: string | null;
    email: string | null;
    summary: string | null;
    at: string;
  } | null;
}

@Injectable()
export class PersonWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly scoring: UrgencyScoringService,
    private readonly customersService: CustomersService,
    private readonly aircall: AircallService,
    private readonly mail: MailService,
    private readonly rules: RulesService,
    private readonly logger: AppLogger,
    private readonly realtime: RealtimeService,
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

  async dailyOperations(query: PersonDailyOperationsQuery = { range: 'last7d' }) {
    const member = await this.currentMember();
    return this.dailyOperationsFor(member, query.range);
  }

  private async dailyOperationsFor(
    member: Awaited<ReturnType<PersonWorkspaceService['currentMember']>>,
    range: PersonDailyOperationRange = 'last7d',
  ) {
    const assignments = await this.axisAssignments(member.id);
    const visibleCustomerIds = Array.from(assignments.keys());
    const assignmentAxes = Array.from(new Set(Array.from(assignments.values()).flatMap((axes) => Array.from(axes)))).sort();
    const today = istanbulDayRange();
    const dailyWindow = dailyWorkflowRange(range, today);

    const [config, rawSegmentOwnerships, frontendCustomization] = await Promise.all([
      this.urgencyConfig(),
      this.prisma.db.segmentOwnership.findMany({
        where: { memberId: member.id },
        include: { segment: true },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      this.rules.frontendRuntimeCustomization('staff.queue'),
    ]);
    const segmentOwnerships = rawSegmentOwnerships.filter((ownership) => isShopifyNativeSegment(ownership.segment));
    const ownedSegmentIds = segmentOwnerships.map((ownership) => ownership.segmentId);

    const [memberships, dailyTaskRows, dailyTaskOrderRows]: [SegmentMembershipRow[], ServiceRequestRow[], PersonDailyTaskOrderRow[]] = await Promise.all([
      ownedSegmentIds.length > 0
        ? this.prisma.db.segmentCustomerMembership.findMany({
          where: {
            segmentId: { in: ownedSegmentIds },
            shopifySegmentRef: { not: null },
            customer: {
              shopifyCustomerId: { not: null },
              status: 'active',
            },
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
          take: 10000,
        })
        : Promise.resolve([]),
      this.dailyWorkflowRows(member, dailyWindow.start, dailyWindow.end),
      this.prisma.db.personDailyTaskOrder.findMany({
        where: {
          memberId: member.id,
          workDate: dailyWindow.orderDate,
        },
        select: {
          serviceRequestId: true,
          position: true,
        },
        orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const requestRows = await this.personRequestRows(member.id, visibleCustomerIds);
    const allRequestRows = mergeRequestRows(requestRows, dailyTaskRows);

    const contextCustomerIds = uniqueStrings([
      ...visibleCustomerIds,
      ...memberships.map((membership) => membership.customerId),
      ...allRequestRows.map((row) => row.customerId).filter((id): id is string => Boolean(id)),
    ]);
    const [customerPinRows, initialRepeatCounts, initialCardContext, initialCallContext, priorityCustomerContext] = await Promise.all([
      this.customerPins(member.id, contextCustomerIds),
      this.repeatCounts(contextCustomerIds),
      this.cardContext(contextCustomerIds),
      this.cardCallContext(allRequestRows),
      this.priorityCustomerContext(memberships.map((membership) => membership.customer)),
    ]);
    const repeatCounts = initialRepeatCounts;
    const cardContext = initialCardContext;
    const callContext = initialCallContext;
    const customerPinsByCustomer = new Map(customerPinRows.flatMap((row) => row.customerId ? [[row.customerId, row] as const] : []));
    const membershipsBySegment = groupBy(memberships, (row) => row.segmentId);

    const segmentGroups = segmentOwnerships.map((ownership) => {
      const segmentMemberships = membershipsBySegment.get(ownership.segmentId) ?? [];
      const items = segmentMemberships
        .map((membership) => this.dailyCallItem(
          membership,
          ownership,
          assignments,
          config,
          repeatCounts.get(membership.customerId) ?? 0,
          customerPinsByCustomer.get(membership.customerId) ?? null,
          priorityCustomerContext.get(membership.customerId) ?? emptyPersonPriorityCustomerContext(),
        ))
        .sort(sortDaily)
        .slice(0, ownership.dailyCap ?? 100);

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

    const ownedSegmentByCustomer = this.highestOwnedSegmentByCustomer(segmentOwnerships, memberships);
    const dailyCallList = this.applyDailyTaskOrder(
      dailyTaskRows
        .filter((row) => this.isQueueVisible(row))
        .filter((row) => this.isDailyWorkflowTask(row))
        .filter((row) => range === 'archive'
          ? this.isDailyWorkflowArchived(row, member.id, dailyWindow.start)
          : !this.isArchivedForMember(row, member.id))
        .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext, ownedSegmentByCustomer.get(row.customerId ?? '') ?? null, callContext)),
      dailyTaskOrderRows,
    ).slice(0, 150);

    const segmentPriorityCards = segmentGroups
      .flatMap((group) => group.items.map((item) => this.segmentPriorityCard(item, member, cardContext)))
      .sort(sortByUrgency)
      .slice(0, 120);
    const visibleAxes = Array.from(new Set([
      ...assignmentAxes,
      ...dailyTaskRows.map((row) => row.axis).filter((axis): axis is string => Boolean(axis)),
    ])).sort();

    const scopedRows = requestRows
      .filter((row) => this.isQueueVisible(row))
      .filter((row) => this.isServiceRequestScoped(row, assignments, member.id));
    const pinnedTasks = scopedRows
      .filter((row) => this.isTaskPinned(row, member.id))
      .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext, ownedSegmentByCustomer.get(row.customerId ?? '') ?? null, callContext));
    const pinnedCustomers = customerPinRows
      .filter((row) => row.customer)
      .map((row) => this.customerPinCard(row, assignments, config, repeatCounts.get(row.customerId ?? '') ?? 0));
    const pinBoard = [...pinnedTasks, ...pinnedCustomers].sort(sortByUrgency).slice(0, 120);

    return {
      summary: {
        dailyCount: dailyCallList.length,
        priorityCount: segmentGroups.reduce((total, group) => total + group.items.length, 0),
        pinnedCount: pinBoard.length,
        highUrgencyCount: uniqueHighUrgencyCount(dailyCallList, segmentPriorityCards),
        visibleAxes,
        segmentGroupCount: segmentGroups.length,
      },
      dailyCallList,
      priorityKanban: segmentPriorityCards,
      pinBoard,
      segmentGroups,
      frontendCustomization,
    };
  }

  private async dailyWorkflowRows(member: { id: string; aircallUserId?: string | null }, start: Date, end: Date | null) {
    const ownerScope: Prisma.ServiceRequestWhereInput = end === null
      ? {
          OR: [
            { assignedMemberId: member.id },
            { metadata: { path: ['personArchivedBy', member.id], not: Prisma.JsonNull } },
          ],
        }
      : { assignedMemberId: member.id };
    const archiveDateScope: Prisma.ServiceRequestWhereInput[] = end === null
      ? [
          { createdAt: { lt: start } },
          { metadata: { path: ['personArchivedBy', member.id], not: Prisma.JsonNull } },
        ]
      : [{ createdAt: { gte: start, lt: end } }];
    const workflowScope: Prisma.ServiceRequestWhereInput = {
      OR: [
        { sourceCallId: { not: null } },
        { sourceEmailId: { not: null } },
        { matchedRuleId: { not: null } },
        { metadata: { path: ['workflow'], not: Prisma.JsonNull } },
      ],
    };
    return this.prisma.db.serviceRequest.findMany({
      where: {
        axis: { in: Array.from(DAILY_WORKFLOW_AXES) },
        AND: [
          ownerScope,
          workflowScope,
          { OR: archiveDateScope },
        ],
        status: { notIn: Array.from(CLOSED) },
      },
      include: serviceRequestInclude,
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });
  }

  private async dailyWorkflowSourceCallIdsForMember(member: { id: string; aircallUserId?: string | null }, start: Date, end: Date | null) {
    const aircallUserIds = await this.memberAircallUserIds(member.id, member.aircallUserId ?? null);
    if (aircallUserIds.length === 0) return [];
    const calls = await this.prisma.db.aircallCallEvent.findMany({
      where: {
        aircallUserId: { in: aircallUserIds },
        eventTimestamp: end ? { gte: start, lt: end } : { lt: start },
      },
      select: { id: true },
      orderBy: [{ eventTimestamp: 'desc' }],
      take: 5000,
    });
    return calls.map((call) => call.id);
  }

  private isDailyWorkflowTask(row: ServiceRequestRow) {
    const metadata = this.record(row.metadata);
    const workflow = this.record(metadata.workflow);
    const trigger = String(workflow.trigger ?? '');
    if (!row.matchedRuleId && !workflow.matchedRuleId && !workflow.ruleId) return false;
    if (!DAILY_WORKFLOW_AXES.has(String(row.axis ?? ''))) return false;
    const workflowSource = String(workflow.source ?? '');
    const dailySignal = DAILY_WORKFLOW_TRIGGERS.has(trigger)
      || row.sourceCallId
      || metadata.aiSource === 'transcript'
      || workflowSource.includes('aircall')
      || workflowSource.includes('transcript');
    return Boolean(dailySignal) && taskSource(row) === 'call_analysis';
  }

  private applyDailyTaskOrder(
    cards: PersonQueueCardDto[],
    orderRows: PersonDailyTaskOrderRow[],
  ) {
    if (orderRows.length === 0) return [...cards].sort(sortByCreatedAtDesc);
    const orderByTaskId = new Map(orderRows.map((row) => [row.serviceRequestId, row.position] as const));
    return cards
      .map((card) => ({ card, position: orderByTaskId.get(card.id) ?? null }))
      .sort((left, right) => {
        if (left.position !== null && right.position !== null) {
          return left.position - right.position || sortByCreatedAtDesc(left.card, right.card);
        }
        if (left.position !== null) return -1;
        if (right.position !== null) return 1;
        return sortByCreatedAtDesc(left.card, right.card);
      })
      .map((entry) => entry.card);
  }

  private personRequestRows(memberId: string, visibleCustomerIds: string[]) {
    return this.prisma.db.serviceRequest.findMany({
      where: {
        OR: [
          ...(visibleCustomerIds.length > 0 ? [{ customerId: { in: visibleCustomerIds } }] : []),
          { assignedMemberId: memberId },
          { participants: { some: { memberId } } },
        ],
      },
      include: serviceRequestInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
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
    const [config, repeatCounts, cardContext, callContext] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(visibleCustomerIds),
      this.cardContext(visibleCustomerIds),
      this.cardCallContext(visible),
    ]);
    return visible
      .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext, null, callContext))
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
    this.emitCallCenterInvalidate('person.queue.move');
    const updated = await this.requireServiceRequest(id);
    return this.queueCard(
      updated,
      member.id,
      await this.urgencyConfig(),
      await this.repeatCount(updated.customerId),
      await this.cardContext(updated.customerId ? [updated.customerId] : []),
      null,
      await this.cardCallContext([updated]),
    );
  }

  async reorderDailyCalls(input: ReorderPersonDailyCallInput): Promise<ReorderPersonDailyCallResult> {
    const member = await this.currentMember();
    const tenantId = this.tenantId();
    if (!input.segmentId) {
      const dailyWindow = dailyWorkflowRange(input.range ?? 'last7d', istanbulDayRange());
      const operations = await this.dailyOperationsFor(member, input.range ?? 'last7d');
      const currentById = new Map(operations.dailyCallList.map((item) => [item.id, item] as const));
      const requested = uniqueStrings(input.orderedItemIds).filter((id) => currentById.has(id));
      if (requested.length === 0) throw new BadRequestException('No valid daily call task cards were provided');
      const orderedItemIds = [
        ...requested,
        ...operations.dailyCallList.map((item) => item.id).filter((id) => !requested.includes(id)),
      ];

      await this.prisma.db.$transaction([
        this.prisma.db.personDailyTaskOrder.deleteMany({
          where: {
            tenantId,
            memberId: member.id,
            workDate: dailyWindow.orderDate,
            serviceRequestId: { notIn: orderedItemIds },
          },
        }),
        ...orderedItemIds.map((id, index) => this.prisma.db.personDailyTaskOrder.upsert({
          where: {
            tenantId_memberId_workDate_serviceRequestId: {
              tenantId,
              memberId: member.id,
              workDate: dailyWindow.orderDate,
              serviceRequestId: id,
            },
          },
          create: {
            id: prefixedId('pdto'),
            tenantId,
            memberId: member.id,
            workDate: dailyWindow.orderDate,
            serviceRequestId: id,
            position: index,
          },
          update: {
            position: index,
          },
        })),
      ]);

      this.logger.log('person_workspace', 'daily.workflow_reorder', 'Person daily workflow task order saved', {
        member_id: member.id,
        work_date: dailyWindow.orderDate.toISOString().slice(0, 10),
        range: input.range ?? 'last7d',
        item_count: orderedItemIds.length,
      });
      this.emitCallCenterInvalidate('person.daily.workflow_reorder');
      return { ok: true, segmentId: null, orderedItemIds };
    }

    const segmentId = input.segmentId;
    const ownership = await this.prisma.db.segmentOwnership.findFirst({
      where: {
        segmentId,
        memberId: member.id,
      },
      select: { segmentId: true },
    });
    if (!ownership) throw new ForbiddenException('Daily segment group is outside your workspace');

    const operations = await this.dailyOperationsFor(member);
    const group = operations.segmentGroups.find((segmentGroup) => segmentGroup.segmentId === segmentId);
    if (!group) throw new NotFoundException('Daily segment group not found');
    if (group.items.length === 0) throw new BadRequestException('Daily segment group has no customers to reorder');

    const currentById = new Map(group.items.map((item) => [item.id, item] as const));
    const requested = uniqueStrings(input.orderedItemIds).filter((id) => currentById.has(id));
    if (requested.length === 0) throw new BadRequestException('No valid daily call cards were provided');
    const orderedItemIds = [
      ...requested,
      ...group.items.map((item) => item.id).filter((id) => !requested.includes(id)),
    ];
    const orderedCustomerIds = orderedItemIds.map((id) => currentById.get(id)?.customerId).filter((id): id is string => Boolean(id));

    await this.prisma.db.$transaction([
      this.prisma.db.personDailyCallOrder.deleteMany({
        where: {
          tenantId,
          memberId: member.id,
          segmentId,
          customerId: { notIn: orderedCustomerIds },
        },
      }),
      ...orderedItemIds.map((id, index) => {
        const item = currentById.get(id);
        if (!item) throw new BadRequestException('Daily call card is no longer available');
        return this.prisma.db.personDailyCallOrder.upsert({
          where: {
            tenantId_memberId_segmentId_customerId: {
              tenantId,
              memberId: member.id,
              segmentId,
              customerId: item.customerId,
            },
          },
          create: {
            id: prefixedId('pdco'),
            tenantId,
            memberId: member.id,
            segmentId,
            customerId: item.customerId,
            position: index,
          },
          update: {
            position: index,
          },
        });
      }),
    ]);

    this.logger.log('person_workspace', 'daily.reorder', 'Person daily call order saved', {
      member_id: member.id,
      segment_id: segmentId,
      item_count: orderedItemIds.length,
    });
    this.emitCallCenterInvalidate('person.daily.reorder');
    return { ok: true, segmentId, orderedItemIds };
  }

  async archiveDailyCall(id: string): Promise<ArchivePersonDailyCallResult> {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);
    if (!this.isDailyWorkflowTask(row)) {
      throw new BadRequestException('Only call-analysis daily tasks can be archived from this list');
    }

    const archivedAt = new Date().toISOString();
    const metadata = this.record(row.metadata);
    const archivedBy = this.record(metadata.personArchivedBy);
    archivedBy[member.id] = archivedAt;

    await this.prisma.db.serviceRequest.updateMany({
      where: { id: row.id },
      data: {
        metadata: {
          ...metadata,
          personArchivedBy: archivedBy,
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'daily.archive', 'Person daily call task archived', {
      service_request_id: row.id,
      member_id: member.id,
      archived_at: archivedAt,
    });
    this.emitCallCenterInvalidate('person.daily.archive');

    return { ok: true, taskId: row.id, archived: true, archivedAt };
  }

  async syncTasks(): Promise<PersonTaskSyncResult> {
    const backfill = await this.aircall.backfillRecentCalls({ recentDays: 7, maxPages: 20 });
    const resolver = await this.aircall.repairWorkflowEvaluations({ targetVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION, scope: 'recent', recentDays: 7, limit: 1000 });
    const syncedAt = new Date().toISOString();
    this.logger.log('person_workspace', 'tasks.sync', 'Person workspace task sync requested', {
      fetched: backfill.fetched,
      ingested: backfill.ingested,
      workflow_repair_queued: resolver.queued,
      workflow_missing_evaluations: resolver.missingEvaluations,
    });
    this.emitCallCenterInvalidate('person.tasks.sync');
    return {
      ok: true,
      backfill: {
        recentDays: backfill.recentDays,
        fetched: backfill.fetched,
        ingested: backfill.ingested,
        resolverQueued: backfill.resolverQueued,
        transcriptsFound: backfill.transcriptsFound,
        errors: backfill.errors,
      },
      resolver: {
        scanned: resolver.scanned,
        queued: resolver.queued,
        skipped: resolver.skipped,
        targetVersion: resolver.targetVersion,
      },
      syncedAt,
    };
  }

  async dialCustomer(input: AircallDialInput): Promise<AircallDialResponse> {
    const member = await this.currentMember();
    if (input.customerId) await this.assertCustomerInWorkspace(input.customerId, member.id);
    const result = await this.aircall.dialForMember(member.id, input);
    this.logger.log('person_workspace', 'aircall.dial', 'Person workspace Aircall dial requested', {
      member_id: member.id,
      customer_id: input.customerId ?? null,
      source: input.source,
      mode: result.mode,
      ok: result.ok,
      provider_status: result.providerStatus,
    });
    this.emitCallCenterInvalidate('person.aircall.dial');
    return result;
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
    this.emitCallCenterInvalidate('person.queue.pin');
    const updated = await this.requireServiceRequest(id);
    return this.queueCard(
      updated,
      member.id,
      await this.urgencyConfig(),
      await this.repeatCount(updated.customerId),
      await this.cardContext(updated.customerId ? [updated.customerId] : []),
      null,
      await this.cardCallContext([updated]),
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
        source: { in: [CUSTOMER_PIN_SOURCE, LEGACY_CUSTOMER_PIN_SOURCE] },
        surface: CUSTOMER_PIN_SURFACE,
        metadata: { path: ['personWorkspaceKind'], equals: CUSTOMER_PIN_KIND },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const isPinned = existing ? !CLOSED.has(existing.status) : false;
    const nextPinned = input.pinned ?? !isPinned;

    if (nextPinned) {
      if (existing) {
        const sourceOrigin = existing.source === LEGACY_CUSTOMER_PIN_SOURCE
          ? { sourceOrigin: LEGACY_CUSTOMER_PIN_SOURCE }
          : {};
        await this.prisma.db.serviceRequest.updateMany({
          where: { id: existing.id },
          data: {
            source: CUSTOMER_PIN_SOURCE,
            status: 'open',
            closedAt: null,
            metadata: {
              ...this.record(existing.metadata),
              personWorkspaceKind: CUSTOMER_PIN_KIND,
              personPinnedBy: { [member.id]: Date.now() },
              category: 'customer_pin',
              ...sourceOrigin,
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
              sourceOrigin: 'person_workspace_pin',
            } as Prisma.InputJsonValue,
          },
        });
      }
    } else if (existing) {
      const sourceOrigin = existing.source === LEGACY_CUSTOMER_PIN_SOURCE
        ? { sourceOrigin: LEGACY_CUSTOMER_PIN_SOURCE }
        : {};
      await this.prisma.db.serviceRequest.updateMany({
        where: { id: existing.id },
        data: {
          source: CUSTOMER_PIN_SOURCE,
          status: 'closed',
          closedAt: new Date(),
          metadata: {
            ...this.record(existing.metadata),
            personWorkspaceKind: CUSTOMER_PIN_KIND,
            personPinnedBy: {},
            category: 'customer_pin',
            ...sourceOrigin,
          } as Prisma.InputJsonValue,
        },
      });
    }

    this.logger.log('person_workspace', 'customer.pin', 'Person customer pin toggled', {
      customer_id: id,
      member_id: member.id,
      pinned: nextPinned,
    });
    this.emitCallCenterInvalidate('person.customer.pin');
    return { ok: true, pinned: nextPinned };
  }

  async transferTargets(): Promise<PersonTransferTarget[]> {
    const current = await this.currentMember();
    const rows = await this.prisma.db.member.findMany({
      where: { status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      take: 200,
    });

    return rows
      .filter((row) => row.id !== current.id)
      .map((row) => {
        const roleNames = row.roleAssignments.map((assignment) => assignment.role.name);
        const axes = transferAxesForRoles(row.roleAssignments.map((assignment) => assignment.role));
        return {
          id: row.id,
          name: memberDisplayName(row),
          email: row.email,
          roleNames,
          axes,
        };
      })
      .filter((row) => row.axes.length > 0);
  }

  async transferTask(id: string, input: TransferPersonTaskInput): Promise<PersonTaskTransferResult> {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);
    if (CLOSED.has(row.status)) throw new BadRequestException('Closed or resolved tasks cannot be transferred');
    if (input.targetMemberId === member.id) throw new BadRequestException('Choose another teammate as transfer target');

    const target = await this.prisma.db.member.findFirst({
      where: { id: input.targetMemberId, status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException('Transfer target teammate not found');

    const targetAxes = transferAxesForRoles(target.roleAssignments.map((assignment) => assignment.role));
    if (targetAxes.length === 0) throw new BadRequestException('Transfer target does not have a transferable workspace axis');

    const fromAxis = axisOrNull(row.axis);
    const toAxis = input.targetAxis ?? (isTransferAxis(fromAxis) ? fromAxis : null) ?? targetAxes[0];
    if (!targetAxes.includes(toAxis)) throw new BadRequestException(`Transfer target cannot receive ${toAxis} work`);

    const tenantId = this.tenantId();
    const transferredAt = new Date();
    const reason = input.reason?.trim() || 'Manual transfer from person workspace';
    const sourceAssignmentsChanged = await this.prisma.$transaction(async (tx) => {
      const metadata = this.record(row.metadata);
      const transferEvent = {
        at: transferredAt.toISOString(),
        actorMemberId: member.id,
        fromMemberId: row.assignedMemberId ?? member.id,
        toMemberId: target.id,
        fromAxis,
        toAxis,
        reason,
      };
      const history = Array.isArray(metadata.transferHistory) ? metadata.transferHistory : [];

      await tx.serviceRequest.updateMany({
        where: { id: row.id, tenantId },
        data: {
          assignedMemberId: target.id,
          axis: toAxis,
          metadata: {
            ...metadata,
            transferredAt: transferredAt.toISOString(),
            transferredByMemberId: member.id,
            previousAssignedMemberId: row.assignedMemberId,
            previousAxis: fromAxis,
            transferReason: reason,
            transferHistory: [...history, transferEvent].slice(-25),
          } as Prisma.InputJsonValue,
        },
      });

      await tx.serviceRequestComment.create({
        data: {
          id: prefixedId('srcm'),
          tenantId,
          serviceRequestId: row.id,
          actorId: member.id,
          actorType: 'member',
          body: `Transferred from ${memberDisplayName(row.assignedMember ?? member)} to ${memberDisplayName(target)} (${fromAxis ?? 'unassigned'} -> ${toAxis}). Reason: ${reason}`,
          internal: true,
          attachmentsJson: [{
            kind: 'task_transfer',
            fromMemberId: row.assignedMemberId ?? member.id,
            toMemberId: target.id,
            fromAxis,
            toAxis,
          }] as Prisma.InputJsonValue,
        },
      });

      if (row.assignedMemberId && row.assignedMemberId !== target.id) {
        await tx.taskParticipant.upsert({
          where: {
            tenantId_serviceRequestId_memberId_role: {
              tenantId,
              serviceRequestId: row.id,
              memberId: row.assignedMemberId,
              role: 'watcher',
            },
          },
          create: {
            id: prefixedId('tpar'),
            tenantId,
            serviceRequestId: row.id,
            memberId: row.assignedMemberId,
            role: 'watcher',
            source: 'manual_transfer',
          },
          update: { source: 'manual_transfer' },
        });
      }

      if (!row.customerId) return false;

      const currentAssignments = await tx.customerAssignment.findMany({
        where: {
          tenantId,
          customerId: row.customerId,
          memberId: member.id,
          isPrimary: true,
        },
      });
      const previousTargetAxis = await tx.customerAssignment.findFirst({
        where: { tenantId, customerId: row.customerId, axis: toAxis },
      });
      const touched = currentAssignments.length > 0;

      if (touched) {
        await tx.customerAssignment.updateMany({
          where: {
            tenantId,
            customerId: row.customerId,
            memberId: member.id,
            isPrimary: true,
          },
          data: {
            isPrimary: false,
            reason,
            approvedByMemberId: member.id,
            approvedAt: transferredAt,
            source: 'person_workspace_transfer',
          },
        });
      }

      const targetAssignment = await tx.customerAssignment.upsert({
        where: {
          tenantId_customerId_axis: {
            tenantId,
            customerId: row.customerId,
            axis: toAxis,
          },
        },
        create: {
          id: prefixedId('casn'),
          tenantId,
          customerId: row.customerId,
          axis: toAxis,
          memberId: target.id,
          isPrimary: true,
          source: 'person_workspace_transfer',
          reason,
          approvedByMemberId: member.id,
          approvedAt: transferredAt,
        },
        update: {
          memberId: target.id,
          isPrimary: true,
          source: 'person_workspace_transfer',
          reason,
          approvedByMemberId: member.id,
          approvedAt: transferredAt,
        },
      });

      await tx.customerAssignmentAudit.create({
        data: {
          id: prefixedId('caud'),
          tenantId,
          customerId: row.customerId,
          axis: toAxis,
          action: 'person_workspace_transfer',
          previousMemberId: previousTargetAxis?.memberId ?? (fromAxis === toAxis ? member.id : null),
          newMemberId: target.id,
          actorMemberId: member.id,
          source: 'person_workspace_transfer',
          reason,
          metadata: {
            serviceRequestId: row.id,
            assignmentId: targetAssignment.id,
            fromAxis,
            toAxis,
            disabledSourceAssignmentIds: currentAssignments.map((assignment) => assignment.id),
          } as Prisma.InputJsonValue,
        },
      });

      if (fromAxis && fromAxis !== toAxis) {
        await tx.customerAssignmentAudit.create({
          data: {
            id: prefixedId('caud'),
            tenantId,
            customerId: row.customerId,
            axis: fromAxis,
            action: 'person_workspace_transfer_out',
            previousMemberId: member.id,
            newMemberId: target.id,
            actorMemberId: member.id,
            source: 'person_workspace_transfer',
            reason,
            metadata: {
              serviceRequestId: row.id,
              toAxis,
              disabledSourceAssignmentIds: currentAssignments.map((assignment) => assignment.id),
            } as Prisma.InputJsonValue,
          },
        });
      }

      return touched;
    });

    this.logger.log('person_workspace', 'task.transfer', 'Person workspace task transferred', {
      service_request_id: row.id,
      customer_id: row.customerId,
      from_member_id: row.assignedMemberId ?? member.id,
      to_member_id: target.id,
      from_axis: fromAxis,
      to_axis: toAxis,
    });
    this.emitCallCenterInvalidate('person.task.transfer');

    return {
      ok: true,
      taskId: row.id,
      customerId: row.customerId,
      fromMemberId: row.assignedMemberId ?? member.id,
      fromMemberName: memberDisplayName(row.assignedMember ?? member),
      toMemberId: target.id,
      toMemberName: memberDisplayName(target),
      fromAxis,
      toAxis,
      sourceListRemoved: row.customerId ? sourceAssignmentsChanged : true,
      targetListEntered: true,
    };
  }

  async taskBrief(id: string): Promise<PersonTaskBriefDetail> {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
    await this.assertServiceRequestScoped(row, member.id);

    const customerId = row.customerId;
    const customerEmail = row.customer?.email ?? row.customerUser?.email ?? null;
    const customerPhone = row.customer?.phone ?? row.customerUser?.phone ?? null;
    const aircallWhere = aircallWhereFor(customerEmail, customerPhone);
    const aircallScopes: Prisma.AircallCallEventWhereInput[] = [
      ...(row.sourceCallId ? [{ id: row.sourceCallId }] : []),
      ...(aircallWhere ? [aircallWhere] : []),
    ];
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
      callContext,
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
            take: 30,
          })
        : Promise.resolve([]),
      aircallScopes.length > 0
        ? this.prisma.db.aircallCallEvent.findMany({
            where: { OR: aircallScopes },
            orderBy: { eventTimestamp: 'desc' },
            take: 8,
          })
        : Promise.resolve([]),
      matchedRuleId
        ? this.prisma.db.workflowRule.findFirst({ where: { id: matchedRuleId } })
        : Promise.resolve(null),
      this.cardCallContext([row]),
    ]);

    const card = this.queueCard(row, member.id, config, repeatCount, cardContext, null, callContext);
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
    this.emitCallCenterInvalidate('person.task.note');
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
    this.emitCallCenterInvalidate('person.task.calendar');
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
    return rows
      .map((customer, index) => this.customerRow(customer, index, config, repeatCounts))
      .sort((left, right) => (right.urgencyScore ?? 0) - (left.urgencyScore ?? 0) || left.name.localeCompare(right.name));
  }

  async customerArchive(query: PersonCustomerArchiveQuery) {
    const limit = query.limit;
    const offset = query.offset;
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      shopifyCustomerId: { not: null },
      ...(search ? {
        OR: [
          { companyName: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { shopifyCustomerId: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [rows, total, aggregate, atRisk] = await Promise.all([
      this.prisma.db.customer.findMany({
        where,
        include: {
          insight: true,
          segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 1 },
        },
        orderBy: [{ lastOrderAt: 'desc' }, { updatedAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.db.customer.count({ where }),
      this.prisma.db.customer.aggregate({
        where,
        _sum: { totalSpent: true, ordersCount: true },
        _avg: { ordersCount: true },
      }),
      this.prisma.db.customer.count({
        where: {
          ...where,
          insight: { churnRisk: { in: ['critical', 'high'] } },
        },
      }),
    ]);
    const [config, repeatCounts] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(rows.map((row) => row.id)),
    ]);
    return {
      items: rows.map((customer, index) => this.customerRow(customer, offset + index, config, repeatCounts)),
      total,
      limit,
      offset,
      search: search ?? null,
      summary: {
        totalSpent: money(aggregate._sum.totalSpent),
        avgOrders: Math.round(aggregate._avg.ordersCount ?? 0),
        totalOrders: aggregate._sum.ordersCount ?? 0,
        atRisk,
      },
    };
  }

  async customerDetail(id: string) {
    const member = await this.currentMember();
    await this.assertCustomerInWorkspace(id, member.id);
    return this.customersService.detail(id);
  }

  async customerArchiveDetail(id: string) {
    const customer = await this.prisma.db.customer.findFirst({
      where: { id, shopifyCustomerId: { not: null } },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Shopify customer not found');
    return this.customersService.detail(id);
  }

  async saveCustomerNote(id: string, input: SavePersonCustomerNoteInput) {
    const member = await this.currentMember();
    await this.assertCustomerInWorkspace(id, member.id);
    const title = `Customer note - ${memberDisplayName(member)}`;
    await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        customerId: id,
        source: 'manual',
        surface: 'internal',
        title,
        description: input.body,
        status: 'closed',
        priority: 'low',
        createdByActorId: member.id,
        metadata: {
          personWorkspaceKind: 'note',
          noteKind: 'customer',
          linkedCustomer: id,
          category: 'person_customer_note',
          createdByMemberId: member.id,
          createdByMemberEmail: member.email,
          createdByMemberName: memberDisplayName(member),
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'customer.note.create', 'Customer note saved from priority board', {
      customer_id: id,
      member_id: member.id,
    });
    this.emitCallCenterInvalidate('person.customer.note.create');
    return this.customersService.detail(id);
  }

  private async assertCustomerInWorkspace(customerId: string, memberId: string) {
    const assignments = await this.axisAssignments(memberId);
    if (assignments.has(customerId)) return;
    const ownedSegmentMembership = await this.prisma.db.segmentCustomerMembership.findFirst({
      where: {
        customerId,
        shopifySegmentRef: { not: null },
        segment: {
          ownerships: { some: { memberId } },
        },
      },
      select: { id: true },
    });
    if (!ownedSegmentMembership) throw new ForbiddenException('Customer is outside your workspace');
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
        serviceRequestId: null,
        customerId: null,
        title: `${titleize(row.eventType)} call ${row.contactPhoneE164 ?? row.contactPhone ?? ''}`.trim(),
        customer: row.contactEmail ?? row.contactPhoneE164 ?? row.contactPhone ?? null,
        customerEmail: row.contactEmail,
        customerPhone: row.contactPhoneE164 ?? row.contactPhone,
        dayIso: isoDate(row.eventTimestamp),
        startHour: hour(row.eventTimestamp),
        durationMinutes: Math.max(15, Math.ceil((row.durationSeconds ?? 900) / 60)),
        kind: 'call',
        source: row.transcriptRaw ? 'call_analysis' : 'manual',
        aiBrief: row.transcriptRaw ? {
          whyCalling: row.transcriptRaw.slice(0, 500),
          painPoints: ['Recent Aircall transcript is available'],
          callGoal: 'Review the transcript and update the customer request.',
          promptKey: 'person.workspace.aircall',
          promptVersion: 'live',
          modelUsed: 'not-generated',
          confidence: 1,
          transcriptSnippet: row.transcriptRaw.slice(0, 240),
          suggestedActions: ['Open related customer record', 'Add call notes', 'Schedule follow-up if needed'],
        } : undefined,
      })),
      ...mail.map((row) => ({
        id: `mail-${row.id}`,
        serviceRequestId: null,
        customerId: null,
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
    this.emitCallCenterInvalidate('person.message.send');
    return { id: created.id, threadId: other.id, fromMe: true, author: 'You', text: created.body, at: 'Now' };
  }

  async notes() {
    const member = await this.currentMember();
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: { createdByActorId: member.id, metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
      include: { customer: true, comments: { orderBy: { createdAt: 'asc' }, take: 50 } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
    const actorIds = uniqueStrings(rows.flatMap((row) => [
      row.createdByActorId,
      ...(row.comments ?? []).map((comment) => comment.actorId),
    ]).filter((id): id is string => Boolean(id)));
    const actors = actorIds.length
      ? await this.prisma.db.member.findMany({
          where: { id: { in: actorIds } },
          include: { roleAssignments: { include: { role: true } } },
          take: 200,
        })
      : [];
    const memberById = new Map(actors.map((actor) => [actor.id, actor] as const));
    return rows.map((row) => this.note(row, memberById, member.id));
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
            updatedByMemberId: member.id,
            updatedByMemberEmail: member.email,
            updatedByMemberName: memberDisplayName(member),
          } as Prisma.InputJsonValue,
        },
      });
      this.logger.log('person_workspace', 'note.update', 'Person note updated', { note_id: input.id, member_id: member.id });
      this.emitCallCenterInvalidate('person.note.update');
      return this.note(await this.requireServiceRequest(input.id), new Map([[member.id, member]]), member.id);
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
          createdByMemberId: member.id,
          createdByMemberEmail: member.email,
          createdByMemberName: memberDisplayName(member),
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'note.create', 'Person note created', { note_id: created.id, member_id: member.id });
    this.emitCallCenterInvalidate('person.note.create');
    return this.note(created, new Map([[member.id, member]]), member.id);
  }

  async replyNote(id: string, input: ReplyPersonNoteInput) {
    const member = await this.currentMember();
    const row = await this.prisma.db.serviceRequest.findFirst({
      where: { id, metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
      include: serviceRequestInclude,
    });
    if (!row) throw new NotFoundException('Note not found');
    if (row.createdByActorId !== member.id) {
      const linkedCustomer = this.record(row.metadata).linkedCustomer;
      if (typeof linkedCustomer !== 'string') throw new ForbiddenException('Note is outside your workspace');
      await this.assertCustomerInWorkspace(linkedCustomer, member.id);
    }
    await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId: this.tenantId(),
        serviceRequestId: row.id,
        actorId: member.id,
        actorType: 'member',
        body: input.body,
        internal: true,
        attachmentsJson: [{
          kind: 'person_note_reply',
          actorMemberId: member.id,
          at: new Date().toISOString(),
        }] as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.serviceRequest.updateMany({ where: { id: row.id }, data: { updatedAt: new Date() } });
    this.logger.log('person_workspace', 'note.reply', 'Person note reply saved', { note_id: id, member_id: member.id });
    this.emitCallCenterInvalidate('person.note.reply');
    return this.note(await this.requireServiceRequest(id), new Map([[member.id, member]]), member.id);
  }

  async emails() {
    const member = await this.currentMember();
    const rows = await this.prisma.db.mailDelivery.findMany({
      where: {
        OR: [
          { status: { not: 'draft' } },
          { status: 'draft', metadata: { path: ['createdByMemberId'], equals: member.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
    return rows.map((row) => this.emailRow(row));
  }

  async emailContacts(): Promise<PersonEmailContact[]> {
    const member = await this.currentMember();
    const assignments = await this.axisAssignments(member.id);
    const assignedCustomerIds = Array.from(assignments.keys());
    const ownedSegments = await this.prisma.db.segmentOwnership.findMany({
      where: { memberId: member.id },
      select: { segmentId: true },
      take: 100,
    });
    const ownedSegmentIds = ownedSegments.map((row) => row.segmentId);
    const segmentMemberships = ownedSegmentIds.length
      ? await this.prisma.db.segmentCustomerMembership.findMany({
          where: { segmentId: { in: ownedSegmentIds }, customer: { email: { not: null }, status: 'active' } },
          select: { customerId: true },
          take: 1000,
        })
      : [];
    const customerIds = uniqueStrings([...assignedCustomerIds, ...segmentMemberships.map((row) => row.customerId)]);
    const [customers, recentMail] = await Promise.all([
      customerIds.length
        ? this.prisma.db.customer.findMany({
            where: { id: { in: customerIds }, email: { not: null }, status: 'active' },
            orderBy: [{ lastOrderAt: 'desc' }, { updatedAt: 'desc' }],
            take: 500,
          })
        : Promise.resolve([]),
      this.prisma.db.mailDelivery.findMany({
        where: {
          OR: [
            { metadata: { path: ['createdByMemberId'], equals: member.id } },
            { eventKey: 'person.email.draft' },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      }),
    ]);

    const rows = new Map<string, PersonEmailContact>();
    for (const customer of customers) {
      const email = customer.email?.trim().toLowerCase();
      if (!email) continue;
      rows.set(email, {
        id: customer.id,
        name: customerDisplayName(customer),
        email,
        phone: customer.phone,
        source: 'customer',
        lastContactAt: (customer.lastOrderAt ?? customer.updatedAt).toISOString(),
      });
    }
    for (const mail of recentMail) {
      const email = mail.recipientEmail.trim().toLowerCase();
      if (!email || rows.has(email)) continue;
      rows.set(email, {
        id: mail.id,
        name: mail.recipientEmail,
        email,
        phone: null,
        source: 'mail_delivery',
        lastContactAt: mail.updatedAt.toISOString(),
      });
    }
    return Array.from(rows.values())
      .sort((left, right) => String(right.lastContactAt ?? '').localeCompare(String(left.lastContactAt ?? '')) || left.name.localeCompare(right.name))
      .slice(0, 100);
  }

  async saveEmailDraft(input: SavePersonEmailDraftInput) {
    const member = await this.currentMember();
    const created = await this.prisma.db.mailDelivery.create({
      data: {
        id: prefixedId('mail'),
        tenantId: this.tenantId(),
        eventKey: 'person.email.draft',
        category: 'person_draft',
        recipientEmail: input.to,
        subject: input.subject,
        html: htmlFromPlainText(input.body),
        text: input.body,
        status: 'draft',
        provider: 'disabled',
        metadata: {
          source: 'person_email_compose',
          surface: 'staff',
          createdByMemberId: member.id,
          createdByMemberEmail: member.email,
          sendingEnabled: false,
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('person_workspace', 'email.draft', 'Person email draft saved', {
      mail_delivery_id: created.id,
      member_id: member.id,
    });
    return this.emailRow(created);
  }

  async sendEmail(input: SendPersonEmailInput) {
    const member = await this.currentMember();
    const delivery = await this.mail.sendTransactional({
      eventKey: 'person.email.sent',
      to: input.to,
      subject: input.subject,
      html: htmlFromPlainText(input.body),
      text: input.body,
      metadata: {
        source: 'person_email_compose',
        createdByMemberId: member.id,
        createdByMemberEmail: member.email,
        createdByMemberName: memberDisplayName(member),
      },
    });
    this.logger.log('person_workspace', 'email.send', 'Person email sent from workspace compose', {
      mail_delivery_id: delivery.id,
      member_id: member.id,
      recipient_email: input.to,
    });
    return this.emailRow(delivery);
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
    const [rawSegments, rawRequests] = await Promise.all([
      this.prisma.db.segment.findMany({ where: { isActive: true }, orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }], take: 30 }),
      this.prisma.db.serviceRequest.findMany({
        where: { priority: { in: ['critical', 'urgent', 'high'] }, status: { notIn: Array.from(CLOSED) } },
        orderBy: [{ updatedAt: 'desc' }],
        take: 30,
      }),
    ]);
    const segments = rawSegments.filter(isShopifyNativeSegment).slice(0, 8);
    const requests = rawRequests.filter((request) => this.isOperationalTrainingRequest(request)).slice(0, 8);
    return {
      highPriorityCount: requests.length,
      cards: [
        ...segments.map((segment) => ({
          id: `segment-${segment.id}`,
          title: `${segment.name} segment context`,
          description: segment.description ?? `Live Shopify segment with ${segment.customerCount} customer(s). Review customer history before calling.`,
          source: 'shopify_segment',
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
    this.emitCallCenterInvalidate('person.request.create');
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

  private async memberAircallUserIds(memberId: string, primaryAircallUserId?: string | null) {
    const [member, mappings] = await Promise.all([
      primaryAircallUserId === undefined
        ? this.prisma.db.member.findFirst({ where: { id: memberId }, select: { aircallUserId: true } })
        : Promise.resolve(null),
      this.prisma.db.aircallMemberMap.findMany({
        where: { memberId },
        select: { aircallUserId: true },
      }),
    ]);
    return uniqueStrings([
      primaryAircallUserId ?? null,
      member?.aircallUserId ?? null,
      ...mappings.map((mapping) => mapping.aircallUserId),
    ]);
  }

  private async assertServiceRequestScoped(row: ServiceRequestRow, memberId: string) {
    const assignments = await this.axisAssignments(memberId);
    if (
      !this.isServiceRequestScoped(row, assignments, memberId)
      && !(await this.isDailyWorkflowOperatorScoped(row, memberId))
    ) {
      throw new ForbiddenException('Customer is outside your axis scope');
    }
  }

  private async isDailyWorkflowOperatorScoped(row: ServiceRequestRow, memberId: string) {
    if (!this.isDailyWorkflowTask(row) || !row.sourceCallId) return false;
    const aircallUserIds = await this.memberAircallUserIds(memberId);
    if (aircallUserIds.length === 0) return false;
    const count = await this.prisma.db.aircallCallEvent.count({
      where: {
        id: row.sourceCallId,
        aircallUserId: { in: aircallUserIds },
      },
    });
    return count > 0;
  }

  private isServiceRequestScoped(
    row: { customerId: string | null; assignedMemberId: string | null; axis: string | null; participants?: Array<{ memberId: string | null }> },
    assignments: AxisAssignments,
    memberId: string,
  ) {
    if (row.assignedMemberId === memberId) return true;
    if (Array.isArray(row.participants) && row.participants.some((participant) => participant.memberId === memberId)) {
      return true;
    }
    if (!row.customerId) return row.assignedMemberId === memberId;
    const axes = assignments.get(row.customerId);
    if (!axes) return false;
    return row.axis ? axes.has(row.axis) : true;
  }

  private isOwnedSegmentPriorityTask(
    row: { customerId: string | null; axis: string | null },
    assignments: AxisAssignments,
    ownedSegmentByCustomer: Map<string, OwnedSegmentContext>,
  ) {
    if (!row.customerId) return false;
    if (!ownedSegmentByCustomer.has(row.customerId)) return false;
    const axes = assignments.get(row.customerId);
    if (!axes) return false;
    return row.axis ? axes.has(row.axis) : true;
  }

  private isGeneratedOrSegmentPriorityTask(row: { source: string; sourceCallId?: string | null; sourceEmailId?: string | null; metadata: Prisma.JsonValue }) {
    const source = taskSource(row);
    return hasGeneratedBrief(source);
  }

  private isPriorityKanbanTask(
    row: ServiceRequestRow,
    memberId: string,
    assignments: AxisAssignments,
    ownedSegmentByCustomer: Map<string, OwnedSegmentContext>,
  ) {
    if (taskSource(row) === 'admin_transfer') return row.assignedMemberId === memberId;
    return this.isGeneratedOrSegmentPriorityTask(row) && this.isOwnedSegmentPriorityTask(row, assignments, ownedSegmentByCustomer);
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
        source: { in: [CUSTOMER_PIN_SOURCE, LEGACY_CUSTOMER_PIN_SOURCE] },
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

  private async priorityCustomerContext(
    customers: Array<{ id: string; email: string | null; phone: string | null }>,
  ): Promise<Map<string, PersonPriorityCustomerContext>> {
    const ids = uniqueStrings(customers.map((customer) => customer.id));
    const result = new Map(ids.map((id) => [id, emptyPersonPriorityCustomerContext()] as const));
    if (ids.length === 0) return result;

    const emailToCustomerId = new Map<string, string>();
    const phoneToCustomerId = new Map<string, string>();
    for (const customer of customers) {
      const email = customer.email?.trim().toLowerCase();
      if (email) emailToCustomerId.set(email, customer.id);
      for (const phone of phoneVariants(customer.phone)) {
        phoneToCustomerId.set(phone, customer.id);
      }
    }
    const emails = [...emailToCustomerId.keys()];
    const phones = [...phoneToCustomerId.keys()];

    const [serviceRows, noteRows, commentRows, orderRows, callRows] = await Promise.all([
      this.prisma.db.serviceRequest.findMany({
        where: { customerId: { in: ids } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 20, 200), 3000),
      }),
      this.prisma.db.serviceRequest.findMany({
        where: {
          customerId: { in: ids },
          metadata: { path: ['personWorkspaceKind'], equals: 'note' },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 5, 100), 1000),
      }),
      this.prisma.db.serviceRequestComment.findMany({
        where: {
          internal: true,
          serviceRequest: { customerId: { in: ids } },
        },
        include: { serviceRequest: { select: { customerId: true } } },
        orderBy: [{ createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 8, 100), 1600),
      }),
      this.prisma.db.commerceOrder.findMany({
        where: { customerId: { in: ids } },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 4, 100), 800),
      }),
      emails.length || phones.length
        ? this.prisma.db.aircallCallEvent.findMany({
          where: {
            OR: [
              ...(emails.length ? [{ contactEmail: { in: emails, mode: Prisma.QueryMode.insensitive } }] : []),
              ...(phones.length ? [{ contactPhone: { in: phones } }, { contactPhoneE164: { in: phones } }] : []),
            ],
          },
          orderBy: [{ eventTimestamp: 'desc' }],
          take: Math.min(Math.max(ids.length * 6, 100), 1200),
        })
        : Promise.resolve([]),
    ]);

    const memberIds = uniqueStrings([
      ...noteRows.map((row) => row.createdByActorId),
      ...commentRows.map((row) => row.actorId),
    ]);
    const members = memberIds.length
      ? await this.prisma.db.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const memberById = new Map(members.map((member) => [member.id, memberDisplayName(member)] as const));

    for (const row of serviceRows) {
      if (!row.customerId) continue;
      const context = result.get(row.customerId);
      if (!context || CLOSED.has(row.status) || INTERNAL_WORKSPACE_KINDS.has(String(this.record(row.metadata).personWorkspaceKind))) continue;
      context.openTasksCount += 1;
      if (isCustomerRequestLike(row)) context.openRequestsCount += 1;
    }

    for (const row of noteRows) {
      if (!row.customerId) continue;
      const context = result.get(row.customerId);
      if (!context) continue;
      const note = {
        id: row.id,
        body: row.description || row.title,
        authorName: memberById.get(row.createdByActorId ?? '') ?? 'Staff member',
        createdAt: row.updatedAt.toISOString(),
      };
      context.notesCount += 1;
      if (!context.latestNote || note.createdAt > context.latestNote.createdAt) context.latestNote = note;
    }

    for (const row of commentRows) {
      const customerId = row.serviceRequest.customerId;
      if (!customerId) continue;
      const context = result.get(customerId);
      if (!context) continue;
      const note = {
        id: row.id,
        body: row.body,
        authorName: memberById.get(row.actorId ?? '') ?? 'Staff member',
        createdAt: row.createdAt.toISOString(),
      };
      context.notesCount += 1;
      if (!context.latestNote || note.createdAt > context.latestNote.createdAt) context.latestNote = note;
    }

    for (const row of orderRows) {
      if (!row.customerId) continue;
      const context = result.get(row.customerId);
      if (!context || context.latestOrder) continue;
      context.latestOrder = {
        id: row.id,
        orderNumber: row.shopifyOrderNumber,
        totalPrice: money(row.totalPrice),
        currency: row.currency,
        processedAt: (row.processedAt ?? row.createdAt).toISOString(),
      };
    }

    for (const row of callRows) {
      const customerId = customerIdForPriorityCall(row, emailToCustomerId, phoneToCustomerId);
      if (!customerId) continue;
      const context = result.get(customerId);
      if (!context) continue;
      const resolver = asRecord(row.resolverOutput);
      const call = {
        id: row.id,
        phone: row.contactPhoneE164 ?? row.contactPhone,
        email: row.contactEmail,
        summary: stringOrNull(resolver.summary) ?? row.transcriptRaw?.slice(0, 180) ?? row.status,
        at: row.eventTimestamp.toISOString(),
      };
      context.callsCount += 1;
      if (!context.latestCall || call.at > context.latestCall.at) context.latestCall = call;
    }

    return result;
  }

  private dailyCallItem(
    membership: SegmentMembershipRow,
    ownership: { priority: number; dailyCap: number | null; segment: { id: string; name: string; color: string; priority: number; priorityGlobal: number } },
    assignments: AxisAssignments,
    config = this.scoring.configFrom({}),
    repeatCount = 0,
    pin: CustomerPinRow | null = null,
    context: PersonPriorityCustomerContext = emptyPersonPriorityCustomerContext(),
  ): PersonDailyCallItem {
    const customer = membership.customer;
    const axes = assignments.get(customer.id) ?? new Set<string>();
    const assignedAxis = Array.from(axes).filter((axis) => DAILY_WORKFLOW_AXES.has(axis)).sort().join(', ') || 'unassigned';
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
      id: dailyItemId(membership.segmentId, customer.id),
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
      customOrder: null,
      pinned: Boolean(pin),
      pinId: pin?.id ?? null,
      notesCount: context.notesCount,
      openTasksCount: context.openTasksCount,
      openRequestsCount: context.openRequestsCount,
      callsCount: context.callsCount,
      latestNote: context.latestNote,
      latestOrder: context.latestOrder,
      latestCall: context.latestCall,
      reason: priorityCustomerReason(membership.segment.name, context, repeatCount),
    };
  }

  private applyDailyCustomOrder(
    items: PersonDailyCallItem[],
    orderRows: PersonDailyCallOrderRow[],
  ) {
    if (orderRows.length === 0) return items;
    const orderByItemId = new Map(orderRows.map((row) => [dailyItemId(row.segmentId, row.customerId), row.position] as const));
    return items
      .map((item) => ({ ...item, customOrder: orderByItemId.get(item.id) ?? null }))
      .sort((left, right) => {
        if (left.customOrder !== null && right.customOrder !== null) {
          return left.customOrder - right.customOrder || sortDaily(left, right);
        }
        if (left.customOrder !== null) return -1;
        if (right.customOrder !== null) return 1;
        return sortDaily(left, right);
      });
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

  private segmentPriorityCard(
    item: PersonDailyCallItem,
    member: { id: string; firstName: string; lastName: string; email: string },
    cardContext?: CardContext,
  ): PersonQueueCardDto {
    const urgencyScore = item.urgencyScore;
    return {
      kind: 'customer',
      id: item.id,
      customerId: item.customerId,
      assignedMemberId: member.id,
      assignedMemberName: memberDisplayName(member),
      axis: axisOrNull(item.assignedAxis),
      title: item.customerName,
      summary: `${item.segment.name} segment customer - U${urgencyScore}`,
      segment: item.segment.name,
      segmentColor: item.segment.color,
      segmentId: item.segment.id,
      segmentName: item.segment.name,
      segmentPriority: item.segment.priority,
      segmentOwnershipPriority: item.segment.priority,
      priority: priorityRankFromUrgency(urgencyScore),
      urgencyScore,
      urgencyBreakdown: item.urgencyBreakdown,
      columnId: 'unassigned',
      pinned: item.pinned,
      pinnedAt: null,
      source: 'segment_priority',
      phone: item.phone ?? undefined,
      email: item.email ?? undefined,
      ordersCount: item.ordersCount,
      totalSpent: item.totalSpent,
      aiBrief: {
        whyCalling: `Customer is in ${item.segment.name}, a Shopify segment assigned to this workspace.`,
        upsetAbout: 'No complaint captured from the segment signal.',
        callGoal: 'Review recent Shopify activity and decide the next human outreach step.',
        suggestedActions: ['Review latest order', 'Call or email the customer', 'Pin if follow-up is needed'],
        promptKey: 'person.workspace.segment-priority',
        promptVersion: 'live',
        modelUsed: 'not-generated',
        confidence: 1,
        transcriptSnippet: item.reason,
      },
      miniOrder: cardContext?.miniOrders.get(item.customerId),
      performance30d: cardContext?.performance.get(item.customerId) ?? { ...EMPTY_PERFORMANCE_30D },
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

  private emailRow(row: {
    id: string;
    provider: string | null;
    category: string;
    recipientEmail: string;
    subject: string;
    errorMessage: string | null;
    text: string | null;
    eventKey: string;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      from: row.status === 'draft' ? 'Draft' : row.provider ?? row.category,
      fromEmail: row.recipientEmail,
      subject: row.subject,
      preview: row.errorMessage ?? row.text?.slice(0, 220) ?? row.eventKey,
      unread: row.status === 'failed',
      at: relative(row.createdAt),
      status: row.status,
    };
  }

  private queueCard(
    row: ServiceRequestRow,
    memberId: string,
    config = this.scoring.configFrom({}),
    repeatCount = 0,
    cardContext?: CardContext,
    ownedSegment?: OwnedSegmentContext | null,
    callContext?: CardCallContext,
  ) {
    const metadata = this.record(row.metadata);
    const pinnedBy = this.record(metadata.personPinnedBy);
    const pinnedAt = typeof pinnedBy[memberId] === 'number' ? Number(pinnedBy[memberId]) : null;
    const columnId = personColumn(row.status, metadata.personColumnId);
    const source = taskSource(row);
    const header = taskHeader(row, metadata, callContext);
    const sourceCall = row.sourceCallId ? callContext?.callsById.get(row.sourceCallId) ?? null : null;
    const suppressLocalFallbackSignals = shouldSuppressLocalFallbackSignals(sourceCall);
    const ticket = ticketNumber(row);
    const workflowTrace = workflowTraceFromMetadata(metadata);
    const workflowBadges = workflowBadgesFromMetadata(metadata, row.taskStateSnapshot);
    const matchedRuleId = row.matchedRuleId ?? workflowTrace?.matchedRuleId ?? workflowTrace?.ruleId ?? null;
    const urgencyBreakdown = this.scoring.score({
      priority: row.priority,
      source: row.source,
      axis: row.axis,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
      taskStateSnapshot: row.taskStateSnapshot,
      segmentPriority: ownedSegment?.segmentPriority ?? row.customer?.segmentMemberships[0]?.segment.priorityGlobal ?? row.customer?.segmentMemberships[0]?.segment.priority ?? null,
      repeatCount,
    }, config);
    return {
      kind: 'task' as const,
      id: row.id,
      customerId: row.customerId,
      assignedMemberId: row.assignedMemberId,
      assignedMemberName: row.assignedMember ? memberDisplayName(row.assignedMember) : null,
      axis: axisOrNull(row.axis),
      title: header.title,
      summary: `${ticket} - U${urgencyBreakdown.score} - ${titleize(row.status)} - ${relative(row.updatedAt)}`,
      segment: ownedSegment?.segmentName ?? taskCategoryLabel(metadata.category ?? row.surface),
      segmentColor: ownedSegment?.segmentColor ?? colorForUrgency(urgencyBreakdown.score),
      priority: priorityRankFromUrgency(urgencyBreakdown.score),
      urgencyScore: urgencyBreakdown.score,
      urgencyBreakdown,
      columnId,
      pinned: pinnedAt !== null,
      pinnedAt,
      source,
      createdAt: row.createdAt.toISOString(),
      callIntent: suppressLocalFallbackSignals ? 'inquiry' : workflowBadges.callIntent,
      psychTags: suppressLocalFallbackSignals ? [] : workflowBadges.psychTags,
      phone: header.phone ?? undefined,
      email: header.email ?? undefined,
      ordersCount: row.customer?.ordersCount ?? undefined,
      totalSpent: row.customer ? money(row.customer.totalSpent) : undefined,
      segmentId: ownedSegment?.segmentId ?? row.customer?.segmentMemberships[0]?.segment.id ?? null,
      segmentName: ownedSegment?.segmentName ?? row.customer?.segmentMemberships[0]?.segment.name ?? null,
      segmentPriority: ownedSegment?.segmentPriority ?? row.customer?.segmentMemberships[0]?.segment.priorityGlobal ?? row.customer?.segmentMemberships[0]?.segment.priority ?? null,
      segmentOwnershipPriority: ownedSegment?.ownershipPriority ?? null,
      aiBrief: hasGeneratedBrief(source) ? this.brief(row, callContext) : undefined,
      workflowTrace,
      taskStateSnapshot: taskStateSnapshotFromJson(row.taskStateSnapshot),
      matchedRuleId,
      miniOrder: row.customerId ? cardContext?.miniOrders.get(row.customerId) : undefined,
      performance30d: row.customerId ? cardContext?.performance.get(row.customerId) ?? { ...EMPTY_PERFORMANCE_30D } : undefined,
    };
  }

  private highestOwnedSegmentByCustomer(
    ownerships: SegmentOwnershipRow[],
    memberships: SegmentMembershipRow[],
  ) {
    const ownershipBySegment = new Map(ownerships.map((ownership) => [ownership.segmentId, ownership]));
    const result = new Map<string, OwnedSegmentContext>();

    for (const membership of memberships) {
      const ownership = ownershipBySegment.get(membership.segmentId);
      if (!ownership) continue;
      const context: OwnedSegmentContext = {
        segmentId: ownership.segment.id,
        segmentName: ownership.segment.name,
        segmentColor: ownership.segment.color,
        segmentPriority: Math.max(ownership.priority, membership.segment.priorityGlobal, membership.segment.priority),
        ownershipPriority: ownership.priority,
        matchedAt: membership.matchedAt,
      };
      const current = result.get(membership.customerId);
      if (!current
        || context.segmentPriority > current.segmentPriority
        || (context.segmentPriority === current.segmentPriority && context.matchedAt.getTime() > current.matchedAt.getTime())) {
        result.set(membership.customerId, context);
      }
    }

    return result;
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

  private async cardCallContext(rows: Array<{ sourceCallId: string | null }>): Promise<CardCallContext> {
    const sourceCallIds = uniqueStrings(rows.map((row) => row.sourceCallId).filter((id): id is string => Boolean(id)));
    if (sourceCallIds.length === 0) return { callsById: new Map() };
    const calls = await this.prisma.db.aircallCallEvent.findMany({
      where: { id: { in: sourceCallIds } },
      select: {
        id: true,
        contactPhone: true,
        contactPhoneE164: true,
        contactEmail: true,
        transcriptRaw: true,
        resolverOutput: true,
        resolverModel: true,
        resolverPromptKey: true,
        resolvedWithVersion: true,
      },
    });
    return { callsById: new Map(calls.map((call) => [call.id, call])) };
  }

  private calendarFromRequest(row: ServiceRequestRow) {
    const date = row.dueAt ?? (row.assignedMemberId ? row.updatedAt : row.createdAt);
    const source = taskSource(row);
    return {
      id: `sr-${row.id}`,
      serviceRequestId: row.id,
      customerId: row.customerId,
      title: row.title,
      customer: row.customer?.companyName ?? row.customerUser?.email ?? null,
      customerEmail: row.customer?.email ?? row.customerUser?.email ?? null,
      customerPhone: row.customer?.phone ?? row.customerUser?.phone ?? null,
      dayIso: isoDate(date),
      startHour: hour(date),
      durationMinutes: row.priority === 'critical' || row.priority === 'urgent' ? 30 : 20,
      kind: row.source === 'call' ? 'callback' : 'task',
      source,
      aiBrief: hasGeneratedBrief(source) ? this.brief(row) : undefined,
    };
  }

  private brief(row: ServiceRequestRow, callContext?: CardCallContext): PersonTaskBrief {
    const metadata = this.record(row.metadata);
    const sourceCall = row.sourceCallId ? callContext?.callsById.get(row.sourceCallId) ?? null : null;
    const resolver = resolverForBrief(row, metadata, sourceCall);
    if (resolver) return transcriptPersonBrief(row, resolver, sourceCall);

    return {
      whyCalling: row.description ?? row.title,
      upsetAbout: row.priority === 'critical' || row.priority === 'urgent' ? 'High-priority customer task needs a human response.' : 'No explicit complaint captured.',
      callGoal: CLOSED.has(row.status) ? 'Confirm the resolution and close the loop.' : 'Move the customer task to the next accountable status.',
      suggestedActions: ['Review customer context', 'Add an internal note', 'Update status before leaving the screen'],
      promptKey: 'person.workspace.live-context',
      promptVersion: 'live',
      modelUsed: 'not-generated',
      confidence: 1,
      transcriptSnippet: row.description?.slice(0, 240),
    };
  }

  private customerRow(
    customer: CustomerWorkspaceRow,
    index: number,
    config: UrgencyScoringConfig,
    repeatCounts: Map<string, number>,
  ) {
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
  }

  private note(row: {
    id: string;
    title: string;
    description: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    createdByActorId?: string | null;
    customer?: { id: string; companyName: string | null; firstName?: string | null; lastName?: string | null; email: string | null } | null;
    comments?: Array<{ id: string; body: string; actorId: string | null; actorType: string | null; attachmentsJson: Prisma.JsonValue; createdAt: Date }>;
  }, memberById: Map<string, { id: string; firstName: string; lastName: string; email: string; roleAssignments?: Array<{ role: { name: string } }> }> = new Map(), currentMemberId?: string | null) {
    const metadata = this.record(row.metadata);
    const author = row.createdByActorId ? memberById.get(row.createdByActorId) : null;
    const authorName = author
      ? memberDisplayName(author)
      : stringOrNull(metadata.createdByMemberName) ?? (row.createdByActorId === currentMemberId ? 'You' : 'Team member');
    const authorEmail = author?.email ?? stringOrNull(metadata.createdByMemberEmail) ?? undefined;
    const authorRole = author?.roleAssignments?.[0]?.role.name ?? 'Member';
    return {
      id: row.id,
      kind: metadata.noteKind === 'queue' ? 'queue' : 'scratch',
      title: row.title,
      body: row.description ?? '',
      authorName,
      authorEmail,
      authorRole,
      linkedCustomer: typeof metadata.linkedCustomer === 'string' ? metadata.linkedCustomer : undefined,
      linkedCustomerName: row.customer ? customerDisplayName(row.customer) : undefined,
      linkedQueueId: typeof metadata.linkedQueueId === 'string' ? metadata.linkedQueueId : undefined,
      createdAt: relative(row.createdAt),
      updatedAt: relative(row.updatedAt),
      replies: (row.comments ?? []).filter(isNoteReplyComment).map((comment) => ({
        id: comment.id,
        body: comment.body,
        authorName: comment.actorId && memberById.has(comment.actorId)
          ? memberDisplayName(memberById.get(comment.actorId)!)
          : comment.actorId === currentMemberId ? 'You' : 'Team member',
        authorRole: comment.actorId && memberById.has(comment.actorId)
          ? memberById.get(comment.actorId)?.roleAssignments?.[0]?.role.name ?? 'Member'
          : comment.actorType ?? 'member',
        createdAt: relative(comment.createdAt),
      })),
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

  private isQueueVisible(row: { metadata: Prisma.JsonValue; axis?: string | null; title?: string | null; source?: string | null }) {
    const metadata = this.record(row.metadata);
    if (metadata.personQueueVisible === false) return false;
    if (this.isSupportWorkflowCase(row, metadata)) return false;
    const kind = metadata.personWorkspaceKind;
    return typeof kind !== 'string' || !INTERNAL_WORKSPACE_KINDS.has(kind);
  }

  private isArchivedForMember(row: { metadata: Prisma.JsonValue }, memberId: string) {
    const metadata = this.record(row.metadata);
    const archivedBy = this.record(metadata.personArchivedBy);
    return typeof archivedBy[memberId] === 'string' || typeof archivedBy[memberId] === 'number';
  }

  private isDailyWorkflowArchived(row: { metadata: Prisma.JsonValue; createdAt: Date }, memberId: string, archiveStart: Date) {
    return row.createdAt.getTime() < archiveStart.getTime() || this.isArchivedForMember(row, memberId);
  }

  private isOperationalTrainingRequest(row: { status: string; priority: string; source: string; surface: string; title: string; metadata: Prisma.JsonValue }) {
    if (CLOSED.has(row.status) || !['critical', 'urgent', 'high'].includes(row.priority)) return false;
    const metadata = this.record(row.metadata);
    const kind = metadata.personWorkspaceKind;
    if (typeof kind === 'string' && INTERNAL_WORKSPACE_KINDS.has(kind)) return false;
    return !this.isSyntheticOperationalRecord(row, metadata);
  }

  private isSyntheticOperationalRecord(
    row: { source: string; surface: string; title: string },
    metadata: Record<string, unknown>,
  ) {
    if (has(metadata, 'createdForRoadmapItem') || metadata.seed === true || metadata.mock === true || metadata.demo === true) return true;
    const metadataSource = normalizeText(metadata.source);
    const workflow = this.record(metadata.workflow);
    const workflowSource = normalizeText(workflow.source);
    const source = normalizeText(row.source);
    const surface = normalizeText(row.surface);
    const syntheticMarkers = ['seed', 'mock', 'demo', 'fixture', 'prodtest', 'roadmap', 'proof', 'live_flow', 'person_item'];
    return [metadataSource, workflowSource, source, surface].some((value) => syntheticMarkers.some((marker) => value.includes(marker)));
  }

  private isSupportWorkflowCase(
    row: { axis?: string | null; title?: string | null; source?: string | null },
    metadata: Record<string, unknown>,
  ) {
    const workflow = this.record(metadata.workflow);
    const axis = normalizeText(row.axis ?? workflow.axis);
    if (axis !== 'support') return false;
    const category = normalizeText(metadata.category);
    if (category !== 'workflow_rule') return false;
    const action = normalizeText(workflow.action);
    const title = normalizeText(row.title);
    const source = normalizeText(row.source);
    return action === 'create_task' || title.startsWith('support:') || source === 'call' || source === 'workflow';
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context is required');
    return tenantId;
  }

  private emitCallCenterInvalidate(reason: string) {
    this.realtime.emitTenantInvalidate(this.tenantId(), {
      module: 'call_center',
      reason,
      at: new Date().toISOString(),
    });
  }
}

function participants(thread: { metadata: Prisma.JsonValue }) {
  const metadata = thread.metadata && typeof thread.metadata === 'object' && !Array.isArray(thread.metadata)
    ? thread.metadata as Record<string, unknown>
    : {};
  return Array.isArray(metadata.participantIds) ? metadata.participantIds.filter((id): id is string => typeof id === 'string') : [];
}

function memberDisplayName(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.email;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function axisOrNull(value: string | null | undefined): CustomerAssignmentAxis | null {
  if (value === 'sales' || value === 'account') return value;
  return null;
}

function isTransferAxis(value: CustomerAssignmentAxis | null): value is CreateTaskAxis {
  return value === 'sales' || value === 'account';
}

function transferAxesForRoles(roles: Array<{ slug: string; permissions: unknown }>): CreateTaskAxis[] {
  const slugs = new Set(roles.map((role) => role.slug));
  if (slugs.has('owner') || slugs.has('admin')) return [...TRANSFER_AXES];

  const axes: CreateTaskAxis[] = [];
  const add = (axis: CreateTaskAxis) => {
    if (!axes.includes(axis)) axes.push(axis);
  };

  for (const role of roles) {
    const permissions = asRecord(role.permissions);
    if (permissionEnabled(permissions, MEMBER_PERMISSIONS.commissionSubmit)
      || permissionEnabled(permissions, MEMBER_PERMISSIONS.ordersWrite)
      || permissionEnabled(permissions, MEMBER_PERMISSIONS.pricingWrite)) {
      add('sales');
    }
    if (permissionEnabled(permissions, MEMBER_PERMISSIONS.customersRead)
      && permissionEnabled(permissions, MEMBER_PERMISSIONS.ordersRead)) {
      add('account');
    }
  }

  return axes;
}

function permissionEnabled(permissions: Record<string, unknown>, permission: string) {
  return permissions[permission] === true;
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function mergeRequestRows(primary: ServiceRequestRow[], extra: ServiceRequestRow[]) {
  const rows = new Map<string, ServiceRequestRow>();
  for (const row of primary) rows.set(row.id, row);
  for (const row of extra) rows.set(row.id, row);
  return Array.from(rows.values());
}

function istanbulDayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '01';
  const ymd = `${part('year')}-${part('month')}-${part('day')}`;
  const start = new Date(`${ymd}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start,
    end,
    workDate: new Date(`${ymd}T00:00:00.000Z`),
  };
}

function dailyWorkflowRange(range: PersonDailyOperationRange, today = istanbulDayRange(), now = new Date()) {
  const sevenDayStart = new Date(now.getTime() - 7 * 86_400_000);
  if (range === 'today') {
    return {
      start: today.start,
      end: today.end,
      orderDate: today.workDate,
    };
  }
  if (range === 'archive') {
    return {
      start: sevenDayStart,
      end: null,
      orderDate: ARCHIVE_ORDER_DATE,
    };
  }
  return {
    start: sevenDayStart,
    end: today.end,
    orderDate: today.workDate,
  };
}

function sortDaily(
  left: { urgencyScore: number; customerName: string; repeatCount: number },
  right: { urgencyScore: number; customerName: string; repeatCount: number },
) {
  return right.urgencyScore - left.urgencyScore
    || right.repeatCount - left.repeatCount
    || left.customerName.localeCompare(right.customerName);
}

function dailyItemId(segmentId: string, customerId: string) {
  return `daily-${segmentId}-${customerId}`;
}

function uniqueHighUrgencyCount(
  daily: { customerId?: string | null; id: string; urgencyScore: number }[],
  tasks: { customerId?: string | null; id: string; urgencyScore: number }[],
) {
  const seen = new Set<string>();
  let count = 0;
  for (const item of daily) {
    if (item.urgencyScore < 80) continue;
    const key = item.customerId ? `customer:${item.customerId}` : `task:${item.id}`;
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

function resolverForBrief(
  row: ServiceRequestRow,
  metadata: Record<string, unknown>,
  sourceCall?: CardCallRow | null,
): TranscriptResolverOutput | null {
  const workflow = asRecord(metadata.workflow);
  const workflowState = asRecord(workflow.stateSnapshot ?? workflow.state_snapshot);
  const snapshot = asRecord(row.taskStateSnapshot);
  const candidates = [
    sourceCall?.resolverOutput,
    snapshot.resolverOutput,
    snapshot.resolver_output,
    workflowState.resolverOutput,
    workflowState.resolver_output,
  ];
  for (const candidate of candidates) {
    const parsed = transcriptResolverOutputSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function transcriptPersonBrief(
  row: ServiceRequestRow,
  resolver: TranscriptResolverOutput,
  sourceCall?: CardCallRow | null,
): PersonTaskBrief {
  if (shouldSuppressLocalFallbackSignals(sourceCall)) {
    const transcript = sourceCall?.transcriptRaw?.replace(/\s+/g, ' ').trim() ?? '';
    return {
      whyCalling: 'Promo patch, embroidery, digitizing, or vendor-service talk was captured; no DTF Bank purchase or account follow-up request is confirmed.',
      upsetAbout: 'No customer complaint or DTF Bank product request was confirmed in this call.',
      callGoal: 'Do not treat this as a purchase follow-up unless a person confirms a real DTF Bank product need.',
      suggestedActions: ['Skim the call excerpt for a real product request', 'If no DTF Bank product need exists, archive this follow-up', 'Do not promise refund, pricing, or reorder steps from this call alone'],
      promptKey: 'person.workspace.local-fallback-suppressed',
      promptVersion: String(sourceCall?.resolvedWithVersion ?? resolver.resolved_with_version ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
      modelUsed: sourceCall?.resolverModel ?? 'local-rule-fallback',
      confidence: 0.35,
      transcriptSnippet: transcript.slice(0, 500) || row.description?.slice(0, 240),
    };
  }
  const personBrief = resolver.person_brief;
  const synthesized = synthesizedResolverBrief(row, resolver, sourceCall);
  const suggestedActions = cleanedActions(personBrief.suggested_actions);
  return {
    whyCalling: staffBriefText(personBrief.why_calling, synthesized.whyCalling),
    upsetAbout: staffBriefText(personBrief.upset_about, synthesized.upsetAbout),
    callGoal: staffBriefText(personBrief.call_goal, synthesized.callGoal),
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : synthesized.suggestedActions,
    promptKey: 'person.workspace.transcript-brief',
    promptVersion: String(sourceCall?.resolvedWithVersion ?? resolver.resolved_with_version ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
    modelUsed: sourceCall?.resolverModel ?? 'transcript-resolver',
    confidence: resolverBriefConfidence(resolver),
    transcriptSnippet: staffBriefText(personBrief.transcript_snippet, sourceCall?.transcriptRaw?.slice(0, 500) ?? resolver.summary ?? row.description ?? row.title),
  };
}

function synthesizedResolverBrief(
  row: ServiceRequestRow,
  resolver: TranscriptResolverOutput,
  sourceCall?: CardCallRow | null,
) {
  const primarySignal = resolver.operational_signals.find((signal) => signal.action_required && signal.intent !== 'no_action')
    ?? resolver.operational_signals.find((signal) => signal.intent !== 'no_action')
    ?? null;
  const products = resolver.product_mentions
    .map((mention) => mention.name_hint ?? mention.sku)
    .filter((value): value is string => Boolean(value?.trim()));
  const productText = products.length ? ` about ${products.slice(0, 3).join(', ')}` : '';
  const tags = new Set(resolver.psych_tags);
  const signalIntent = primarySignal?.intent ?? null;
  const intent = signalIntent
    ?? (resolver.payment_signals.refund_asked ? 'refund_requested' : null)
    ?? (resolver.shipping_signals.tracking_asked || resolver.shipping_signals.complaint ? 'shipping_status_question' : null)
    ?? (tags.has('follow_up') || resolver.call_intent === 'follow_up' ? 'callback_requested' : null)
    ?? (tags.has('purchase_intent') || resolver.call_intent === 'sale' ? 'sales_follow_up' : null)
    ?? (products.length > 0 ? 'product_fit_question' : 'no_action');

  const whyByIntent: Record<string, string> = {
    refund_requested: 'Customer mentioned refund, return, cancellation, or payment recovery; handle the account follow-up.',
    shipping_status_question: 'Customer asked about shipping, delivery, tracking, freight, or address details.',
    callback_requested: 'Customer or agent indicated a follow-up call is needed; call back and close the loop.',
    sales_follow_up: `Customer showed purchase or sales intent${productText}; qualify the next sales step.`,
    product_fit_question: `Customer needs product guidance${productText}; clarify fit before recommending the next step.`,
    no_action: resolver.summary || row.description || row.title,
  };
  const goalByIntent: Record<string, string> = {
    refund_requested: 'Clarify order number, reason, and the next account-side action.',
    shipping_status_question: 'Clarify order/tracking context and give the next accountable shipping update.',
    callback_requested: 'Reach the customer and confirm what decision, order, or question is pending.',
    sales_follow_up: 'Qualify product need, timing, price path, and next sales action.',
    product_fit_question: 'Clarify use case, volume, material, and size before recommending a product.',
    no_action: CLOSED.has(row.status) ? 'Confirm the resolution and close the loop.' : 'Decide whether a human follow-up is still needed.',
  };
  const upsetAbout = resolver.payment_signals.refund_asked
    ? 'Refund, return, cancellation, or payment recovery was mentioned.'
    : resolver.shipping_signals.complaint || resolver.shipping_signals.tracking_asked
      ? 'Shipping, delivery, tracking, freight, or address uncertainty was mentioned.'
      : resolver.payment_signals.complaint
        ? 'Payment, pricing, or refund friction was mentioned.'
        : tags.has('complaint')
          ? 'Complaint language was captured in the transcript.'
          : 'No explicit complaint captured in the transcript.';

  return {
    whyCalling: primarySignal?.reason ?? whyByIntent[intent] ?? resolver.summary ?? row.description ?? row.title,
    upsetAbout,
    callGoal: goalByIntent[intent] ?? 'Move the customer to the next accountable sales or account step.',
    suggestedActions: cleanedActions([
      ...(synthesizedActionsByIntent(intent, products)),
      primarySignal?.suggested_task_title ? `Use task context: ${primarySignal.suggested_task_title}` : null,
      sourceCall?.transcriptRaw ? 'Record the call outcome before leaving the task' : null,
    ]),
  };
}

function synthesizedActionsByIntent(intent: string, products: string[]) {
  const productAction = products.length ? `Confirm product context: ${products.slice(0, 3).join(', ')}` : null;
  const actions: Record<string, Array<string | null>> = {
    refund_requested: ['Ask for order number and refund reason', 'Clarify whether replacement, return, or account review is needed', 'Set the next account-side action'],
    shipping_status_question: ['Ask for order or tracking number', 'Clarify freight, address, or delivery issue', 'Give the next accountable update path'],
    callback_requested: ['Call the customer back from the task phone number', 'Confirm what decision or question is pending', 'Record the outcome before leaving the task'],
    sales_follow_up: ['Clarify product need, timing, and budget', productAction, 'Set quote or order next step'],
    product_fit_question: ['Ask use case, volume, material, and size', productAction, 'Recommend the matching product family'],
    no_action: ['Review transcript signal', 'Decide if follow-up is required', 'Record the outcome before leaving the task'],
  };
  return actions[intent] ?? actions.no_action;
}

function resolverBriefConfidence(resolver: TranscriptResolverOutput) {
  const values = [
    resolver.customer_match.confidence,
    ...resolver.product_mentions.map((mention) => mention.confidence),
    ...resolver.operational_signals.map((signal) => signal.confidence),
  ].filter((value) => Number.isFinite(value));
  return Math.max(0.1, Math.min(1, values.length > 0 ? Math.max(...values) : 0.7));
}

function shouldSuppressLocalFallbackSignals(sourceCall?: CardCallRow | null) {
  return sourceCall?.resolverModel === 'local-rule-fallback'
    && Boolean(sourceCall.transcriptRaw)
    && isNonCatalogPromoPatchInquiry(sourceCall.transcriptRaw ?? '');
}

function cleanedActions(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const actions: string[] = [];
  for (const value of values) {
    const action = staffBriefText(value, '');
    if (!action) continue;
    const key = action
      .toLowerCase()
      .replace(/\b(the|a|an|call)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  return actions.slice(0, 5);
}

function staffBriefText(value: unknown, fallback: string) {
  const text = firstString(value, fallback) ?? fallback;
  return text
    .replace(/\bAI\b/gi, 'Transcript')
    .replace(/\bautomation\b/gi, 'workflow')
    .replace(/\bsupport case\b/gi, 'customer request')
    .replace(/\s+/g, ' ')
    .trim();
}

function taskHeader(row: ServiceRequestRow, metadata: Record<string, unknown>, callContext?: CardCallContext) {
  if (row.customer) {
    return {
      title: shopifyCustomerHeader(row.customer),
      phone: row.customer.phone ?? null,
      email: row.customer.email ?? null,
    };
  }

  const workflow = asRecord(metadata.workflow);
  const params = asRecord(workflow.params);
  const snapshot = asRecord(row.taskStateSnapshot);
  const snapshotCustomer = asRecord(snapshot.customer);
  const resolverOutput = asRecord(snapshot.resolverOutput ?? snapshot.resolver_output);
  const sourceCall = row.sourceCallId ? callContext?.callsById.get(row.sourceCallId) : null;
  const phone = firstString(
    row.customerUser?.phone,
    params.contactPhoneE164,
    params.customerPhone,
    params.phone,
    params.contactPhone,
    snapshotCustomer.phone,
    resolverOutput.customer_phone,
    resolverOutput.phone,
    sourceCall?.contactPhoneE164,
    sourceCall?.contactPhone,
  );
  const email = firstString(
    row.customerUser?.email,
    params.customerEmail,
    params.email,
    params.contactEmail,
    snapshotCustomer.email,
    resolverOutput.customer_email,
    resolverOutput.email,
    sourceCall?.contactEmail,
  );

  return {
    title: phone ?? email ?? row.title,
    phone,
    email,
  };
}

function shopifyCustomerHeader(customer: { companyName: string | null; firstName?: string | null; lastName?: string | null; email: string | null; id: string }) {
  return `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    || customer.companyName
    || customer.email
    || customer.id;
}

function customerDisplayName(customer: { companyName: string | null; firstName?: string | null; lastName?: string | null; email: string | null; id: string }) {
  return customer.companyName
    || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    || customer.email
    || customer.id;
}

function emptyPersonPriorityCustomerContext(): PersonPriorityCustomerContext {
  return {
    notesCount: 0,
    openTasksCount: 0,
    openRequestsCount: 0,
    callsCount: 0,
    latestNote: null,
    latestOrder: null,
    latestCall: null,
  };
}

function priorityCustomerReason(segmentName: string, context: PersonPriorityCustomerContext, repeatCount: number) {
  const signals = [
    `${segmentName} segment customer`,
    context.latestCall ? `last call ${relative(new Date(context.latestCall.at))}` : null,
    context.latestOrder ? `last order ${money(context.latestOrder.totalPrice).toLocaleString()} ${context.latestOrder.currency}` : null,
    context.latestNote ? `last note by ${context.latestNote.authorName}` : null,
    context.openRequestsCount ? `${context.openRequestsCount} customer request${context.openRequestsCount === 1 ? '' : 's'}` : null,
    repeatCount ? `${repeatCount} task${repeatCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return signals.join(' - ');
}

function isCustomerRequestLike(row: { source: string; surface: string; axis: string | null; metadata: Prisma.JsonValue }) {
  const metadata = asRecord(row.metadata);
  const category = normalizeText(metadata.category);
  return row.source === 'customer_self_service'
    || row.source === 'admin_created'
    || row.surface === 'customer_facing'
    || row.axis === 'support'
    || category.includes('support')
    || category.includes('customer_request');
}

function isNoteReplyComment(comment: { attachmentsJson: Prisma.JsonValue }) {
  const attachments = Array.isArray(comment.attachmentsJson) ? comment.attachmentsJson : [];
  return attachments.some((attachment) => {
    const item = asRecord(attachment);
    return item.kind === 'person_note_reply' || item.kind === 'call_center_note_reply';
  });
}

function customerIdForPriorityCall(
  row: { contactEmail: string | null; contactPhone: string | null; contactPhoneE164: string | null },
  emailToCustomerId: Map<string, string>,
  phoneToCustomerId: Map<string, string>,
) {
  const email = row.contactEmail?.trim().toLowerCase();
  if (email && emailToCustomerId.has(email)) return emailToCustomerId.get(email) ?? null;
  for (const phone of [...phoneVariants(row.contactPhoneE164), ...phoneVariants(row.contactPhone)]) {
    const customerId = phoneToCustomerId.get(phone);
    if (customerId) return customerId;
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
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

function workflowBadgesFromMetadata(metadata: Record<string, unknown>, taskStateSnapshot: unknown) {
  const workflow = asRecord(metadata.workflow);
  const params = asRecord(workflow.params);
  const snapshot = asRecord(taskStateSnapshot);
  const workflowSnapshot = asRecord(workflow.stateSnapshot ?? workflow.state_snapshot);
  const resolverOutput = asRecord(
    snapshot.resolverOutput
    ?? snapshot.resolver_output
    ?? workflowSnapshot.resolverOutput
    ?? workflowSnapshot.resolver_output,
  );
  const callIntent = stringOrNull(params.intent)
    ?? stringOrNull(params.callIntent)
    ?? stringOrNull(params.call_intent)
    ?? stringOrNull(resolverOutput.call_intent)
    ?? stringOrNull(resolverOutput.callIntent);
  const psychTags = uniqueStrings([
    ...stringArray(params.psychTags),
    ...stringArray(params.psych_tags),
    ...stringArray(resolverOutput.psych_tags),
    ...stringArray(resolverOutput.psychTags),
    stringOrNull(params.tag),
    stringOrNull(params.psychTag),
    stringOrNull(params.psych_tag),
  ].filter((value): value is string => Boolean(value)));
  return { callIntent, psychTags };
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
    source: string;
    surface: string;
    axis: string | null;
    matchedRuleId: string | null;
    sourceCallId: string | null;
    sourceEmailId: string | null;
    metadata: Prisma.JsonValue;
    taskStateSnapshot?: Prisma.JsonValue;
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
    const metadata = asRecord(request.metadata);
    if (metadata.personQueueVisible === false || metadata.workflowSuppressed === true) continue;
    const workflow = asRecord(metadata.workflow);
    const source = taskSource(request);
    const matchedRuleId = request.matchedRuleId ?? stringOrNull(workflow.matchedRuleId ?? workflow.matched_rule_id ?? workflow.ruleId);
    const ruleName = stringOrNull(workflow.ruleName);
    const latest = latestComment(request);
    entries.push({
      id: `request-${request.id}`,
      kind: 'task',
      title: `${source === 'call_analysis' ? 'Transcript task' : request.source === 'workflow' ? 'Automation task' : 'Task'}: ${request.title}`,
      summary: [
        `${titleize(request.status)} - ${titleize(request.priority)}`,
        ruleName ? `Rule: ${ruleName}` : matchedRuleId ? `Rule: ${matchedRuleId}` : null,
        latest?.body ? `Latest note: ${latest.body.slice(0, 180)}` : null,
      ].filter(Boolean).join(' - '),
      at: request.updatedAt.toISOString(),
      meta: {
        requestId: request.id,
        source,
        workflowSource: stringOrNull(workflow.source),
        trigger: stringOrNull(workflow.trigger),
        action: stringOrNull(workflow.action),
        matchedRuleId,
        axis: request.axis,
        comments: request.comments?.length ?? 0,
      },
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
    .slice(0, 50);
}

function latestAiPsychAnalysis(calls: Array<{
  eventTimestamp: Date;
  resolvedAt: Date | null;
  resolverModel: string | null;
  resolverOutput: Prisma.JsonValue | null;
  transcriptRaw: string | null;
}>): PersonAiPsychAnalysis | null {
  const call = calls.find((row) => row.resolverOutput) ?? calls.find((row) => row.transcriptRaw);
  if (!call) return null;
  if (call.resolverModel === 'local-rule-fallback' && call.transcriptRaw && isNonCatalogPromoPatchInquiry(call.transcriptRaw)) {
    return {
      communicationStyle: 'No confirmed follow-up',
      decisionMakingStyle: 'Low',
      trustLevel: null,
      engagementLevel: null,
      winProbability: null,
      motivators: [],
      objections: [],
      buyingSignals: [],
      hesitationSignals: ['Promo/vendor-service conversation'],
      talkTrack: 'The local fallback detected promo patch or vendor-service talk, but no confirmed DTF Bank product purchase or account follow-up request.',
      generatedAt: call.resolvedAt?.toISOString() ?? call.eventTimestamp.toISOString(),
    };
  }
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

function isShopifyNativeSegment(segment: { conditions: Prisma.JsonValue }) {
  return shopifySegmentRefsFromConditions(segment.conditions).length > 0;
}

function shopifySegmentRefsFromConditions(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap((condition) => {
    const row = asRecord(condition);
    if (row.field !== 'shopifyCustomerSegmentIds') return [];
    return Array.isArray(row.value) ? row.value.map((item) => String(item)) : [String(row.value ?? '')];
  })).filter((segmentId) => segmentId.startsWith('gid://shopify/Segment/'));
}

function taskSource(row: { source: string; sourceCallId?: string | null; sourceEmailId?: string | null; metadata: Prisma.JsonValue }): 'manual' | 'call_analysis' | 'segment_priority' | 'stale_follow_up' | 'admin_transfer' {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  const workflow = asRecord(metadata.workflow);
  const workflowTrigger = String(workflow.trigger ?? '');
  const workflowSource = String(workflow.source ?? '');
  if (metadata.category === 'admin_order_transfer') return 'admin_transfer';
  if (metadata.aiSource === 'segment') return 'segment_priority';
  if (metadata.aiSource === 'stale') return 'stale_follow_up';
  if (metadata.aiSource === 'transcript'
    || row.source === 'call'
    || row.sourceCallId
    || row.sourceEmailId
    || workflowTrigger.startsWith('aircall.')
    || workflowTrigger.includes('transcript')
    || workflowSource.includes('aircall')
    || workflowSource.includes('transcript')
    || [
      'call_intent.classified',
      'psych.tag.detected',
      'product.detected_in_transcript',
      'customer.matched_from_transcript',
      'psych.analysis.completed',
      'call.operational_signal.detected',
      'customer.repeat_call.detected',
      'customer.first_call.detected',
    ].includes(workflowTrigger)) return 'call_analysis';
  return 'manual';
}

function hasGeneratedBrief(source: ReturnType<typeof taskSource>) {
  return source === 'call_analysis' || source === 'segment_priority' || source === 'stale_follow_up';
}

function taskCategoryLabel(value: unknown) {
  const key = normalizeText(value);
  if (key === 'workflow_rule' || key === 'workflow') return 'Call analysis';
  if (key === 'call' || key === 'aircall') return 'Call';
  if (key === 'support') return 'Customer request';
  return value ? titleize(String(value)) : 'Customer request';
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

function sortByCreatedAtDesc(
  left: { createdAt?: string; urgencyScore: number; pinnedAt: number | null; title: string },
  right: { createdAt?: string; urgencyScore: number; pinnedAt: number | null; title: string },
) {
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  return rightTime - leftTime || sortByUrgency(left, right);
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

function htmlFromPlainText(value: string) {
  return `<p>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
