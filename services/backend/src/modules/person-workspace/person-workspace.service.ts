import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';
import { MEMBER_PERMISSIONS, TRANSCRIPT_RESOLVER_SCHEMA_VERSION, staffSafeDisplayText } from '@factory-engine-pro/contracts';
import type {
  CreatePersonRequestInput,
  MovePersonQueueCardInput,
  PersonCallSummary,
  PersonCustomerRisk,
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
  PersonContactState,
  PersonQueueColumn,
  PersonTaskBriefDetail,
  PersonTaskOutcome,
  PersonTaskTimelineEntry,
  PersonTransferTarget,
  TranscriptResolverOutput,
  UrgencyScoringConfig,
  ReorderPersonDailyCallInput,
  ReorderPersonDailyCallResult,
  ReplyPersonNoteInput,
  RecordPersonTaskOutcomeInput,
  SavePersonEmailDraftInput,
  SavePersonCustomerNoteInput,
  SavePersonTaskNoteInput,
  SchedulePersonTaskFollowUpInput,
  SavePersonNoteInput,
  SendPersonMessageInput,
  SendPersonEmailInput,
  TogglePersonQueuePinInput,
  TransferPersonTaskInput,
  CustomerAssignmentAxis,
  CreateTaskAxis,
  ArchivePersonDailyCallResult,
  AircallDialInput,
  AircallDialResponse,
  AlgorithmStrategyDefinition,
  LinkPersonTaskCustomerInput,
  LinkPersonTaskCustomerResult,
} from '@factory-engine-pro/contracts';
import { aircallWhereFor, phoneVariants } from '../../shared/contact-match.js';
import { BusinessClockService } from '../../shared/business-clock.service.js';
import type { BusinessDayRange } from '../../shared/business-time.js';
import {
  CustomerContactResolverService,
  normalizePhoneE164,
  type ResolvedCustomerContact,
} from '../../shared/customer-contact-resolver.service.js';
import { CustomerInternalNotesService } from '../../shared/customer-internal-notes.service.js';
import { CustomerContactTimelineService } from '../../shared/customer-contact-timeline.service.js';
import { currentModelResolverOutput as trustedCurrentModelResolverOutput } from '../ai/transcript-resolver-trust.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { RealtimeService } from '../../shared/realtime.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallService } from '../aircall/aircall.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { MailService } from '../mail/mail.service.js';
import { RulesService } from '../rules/rules.service.js';
import { StaffWorkService } from '../staff-work/staff-work.service.js';
import { priorityRankFromUrgency, UrgencyScoringService } from './urgency-scoring.service.js';
import { PersonWorkspaceNoteService } from './person-workspace-note.service.js';
import { PersonWorkspacePinService } from './person-workspace-pin.service.js';

const CLOSED = new Set(['closed', 'resolved', 'transferred']);
const CUSTOMER_PIN_KIND = 'customer_pin';
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

const staffWorkItemInclude = {
  customer: {
    include: {
      insight: true,
      segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 3 },
    },
  },
  assignedMember: true,
  participants: true,
  comments: { orderBy: { createdAt: 'asc' } },
  occurrences: { orderBy: { occurredAt: 'asc' } },
} satisfies Prisma.StaffWorkItemInclude;

type StaffWorkItemRow = Prisma.StaffWorkItemGetPayload<{
  include: typeof staffWorkItemInclude;
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
  staffWorkItemId: string | null;
  position: number;
}

type PersonQueueCardDisplayFields = Pick<
  PersonQueueCardDto,
  | 'analysisStatus'
  | 'displayTitle'
  | 'displayReason'
  | 'displayConcern'
  | 'displayOutcome'
  | 'displayActions'
  | 'displayBadges'
  | 'displayCustomerSummary'
  | 'displayCommerceSnapshot'
  | 'displayCallSnapshot'
>;

type PersonTaskBrief = {
  whyCalling: string;
  upsetAbout: string;
  callGoal: string;
  suggestedActions: string[];
  promptKey: string;
  promptVersion: string;
  modelUsed: string;
  confidence: number;
  transcriptSnippet?: string;
  ctaPriority?: string[];
  modalActionOrder?: string[];
  strategyProof?: PersonQueueCardDto['strategyProof'];
};

type PersonQueueCardInternalFields = {
  aiBrief?: PersonTaskBrief;
  resolverOutput?: TranscriptResolverOutput | null;
  workflowTrace?: unknown;
  taskStateSnapshot?: unknown;
  matchedRuleId?: string | null;
};
type PersonQueueCardInternal = PersonQueueCardDto & PersonQueueCardInternalFields;
type PersonQueueCardWithoutDisplay = Omit<PersonQueueCardInternal, keyof PersonQueueCardDisplayFields>;
type PersonDailyCallItemDisplayFields = Pick<PersonDailyCallItem, keyof PersonQueueCardDisplayFields>;
type PersonDailyCallItemWithoutDisplay = Omit<PersonDailyCallItem, keyof PersonDailyCallItemDisplayFields>;

type WorkspacePinRow = {
  id: string;
  tenantId: string;
  memberId: string;
  targetKind: string;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerPinRow = {
  pin: WorkspacePinRow;
  customer: CustomerWorkspaceRow;
};

interface CardContext {
  miniOrders: Map<string, PersonMiniOrder>;
  performance: Map<string, PersonPerformance30d>;
}

interface CardCallContext {
  callsById: Map<string, CardCallRow>;
}

interface CardCallRow {
  id: string;
  externalCallId: string;
  contactPhone: string | null;
  contactPhoneE164: string | null;
  contactEmail: string | null;
  transcriptRaw: string | null;
  resolverStatus: string | null;
  resolverOutput: Prisma.JsonValue | null;
  resolverModel: string | null;
  resolverPromptKey: string | null;
  resolvedAt: Date | null;
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

interface PersonCardStrategyRuntime {
  nextAction: AlgorithmStrategyDefinition;
  callBrief: AlgorithmStrategyDefinition;
}

@Injectable()
export class PersonWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly businessClock: BusinessClockService,
    private readonly contactResolver: CustomerContactResolverService,
    private readonly customerNotes: CustomerInternalNotesService,
    private readonly scoring: UrgencyScoringService,
    private readonly customersService: CustomersService,
    private readonly aircall: AircallService,
    private readonly mail: MailService,
    private readonly rules: RulesService,
    private readonly staffWork: StaffWorkService,
    private readonly logger: AppLogger,
    private readonly realtime: RealtimeService,
    private readonly workspacePins: PersonWorkspacePinService,
    private readonly workspaceNotes: PersonWorkspaceNoteService,
    private readonly contactTimeline: CustomerContactTimelineService,
  ) {}

  async summary() {
    const member = await this.currentMember();
    const [operations, assigned, failedMail] = await Promise.all([
      this.dailyOperationsFor(member),
      this.prisma.db.staffWorkItem.count({
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

  async dailyOperations(query: Partial<PersonDailyOperationsQuery> = {}) {
    const member = await this.currentMember();
    return this.dailyOperationsFor(member, query);
  }

  async frontendCustomization() {
    await this.currentMember();
    return this.rules.frontendRuntimeCustomization('staff.queue');
  }

  private async dailyOperationsFor(
    member: Awaited<ReturnType<PersonWorkspaceService['currentMember']>>,
    query: Partial<PersonDailyOperationsQuery> = {},
  ) {
    const range: PersonDailyOperationRange = query.range ?? 'last7d';
    const selectedFilter = query.filter ?? 'all';
    const archiveSort = query.sort ?? 'newest';
    const assignments = await this.axisAssignments(member.id);
    const visibleCustomerIds = Array.from(assignments.keys());
    const assignmentAxes = Array.from(new Set(Array.from(assignments.values()).flatMap((axes) => Array.from(axes)))).sort();
    const today = await this.businessClock.currentDay();
    const dailyWindow = dailyWorkflowRange(range, today);

    const [
      config,
      rawSegmentOwnerships,
      frontendCustomization,
      dailyRankingStrategy,
      priorityCustomerStrategy,
      taskVisibilityStrategy,
      nextActionStrategy,
      callBriefStrategy,
    ] = await Promise.all([
      this.urgencyConfig(),
      this.prisma.db.segmentOwnership.findMany({
        where: { memberId: member.id },
        include: { segment: true },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      this.rules.frontendRuntimeCustomization('staff.queue'),
      this.rules.algorithmRuntimeDefinition('staff.daily_call_list.ranking'),
      this.rules.algorithmRuntimeDefinition('staff.priority_kanban.customer_score'),
      this.rules.algorithmRuntimeDefinition('staff.task_visibility'),
      this.rules.algorithmRuntimeDefinition('staff.customer_next_action'),
      this.rules.algorithmRuntimeDefinition('staff.call_brief_generation'),
    ]);
    const cardStrategies = { nextAction: nextActionStrategy, callBrief: callBriefStrategy };
    const segmentOwnerships = rawSegmentOwnerships.filter((ownership) => isShopifyNativeSegment(ownership.segment));
    const ownedSegmentIds = segmentOwnerships.map((ownership) => ownership.segmentId);

    const [memberships, dailyTaskRows, dailyTaskOrderRows]: [SegmentMembershipRow[], StaffWorkItemRow[], PersonDailyTaskOrderRow[]] = await Promise.all([
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
          staffWorkItemId: true,
          position: true,
        },
        orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const pinRows = await this.workspacePins.list(member.id);
    const taskPinsByTarget = new Map(
      pinRows.filter((pin) => pin.targetKind === 'staff_work_item').map((pin) => [pin.targetId, pin] as const),
    );
    const customerPinsByTarget = new Map(
      pinRows.filter((pin) => pin.targetKind === 'customer').map((pin) => [pin.targetId, pin] as const),
    );
    const pinnedCustomerIds = Array.from(customerPinsByTarget.keys());
    const pinnedCustomerRows = pinnedCustomerIds.length > 0
      ? await this.prisma.db.customer.findMany({
        where: { id: { in: pinnedCustomerIds }, status: 'active' },
        include: {
          insight: true,
          segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 3 },
        },
        take: 500,
      })
      : [];
    const customerPinRows: CustomerPinRow[] = pinnedCustomerRows.flatMap((customer) => {
      const pin = customerPinsByTarget.get(customer.id);
      return pin ? [{ pin, customer }] : [];
    });

    const requestRows = await this.personRequestRows(member.id, visibleCustomerIds);
    const contextCustomerIds = uniqueStrings([
      ...visibleCustomerIds,
      ...memberships.map((membership) => membership.customerId),
      ...pinnedCustomerIds,
      ...requestRows.map((row) => row.customerId).filter((id): id is string => Boolean(id)),
      ...dailyTaskRows.map((row) => row.customerId).filter((id): id is string => Boolean(id)),
    ]);
    const [initialRepeatCounts, initialCardContext, initialCallContext, todayAircallStats, contactStates] = await Promise.all([
      this.repeatCounts(contextCustomerIds),
      this.cardContext(contextCustomerIds),
      this.cardCallContext(dailyTaskRows),
      this.todayAircallStats(member, today.start, today.end),
      this.contactTimeline.latestForCustomers(contextCustomerIds),
    ]);
    const repeatCounts = initialRepeatCounts;
    const cardContext = initialCardContext;
    const callContext = initialCallContext;
    const customerPinsByCustomer = customerPinsByTarget;
    const membershipsBySegment = groupBy(memberships, (row) => row.segmentId);
    const selectedMembershipGroups = segmentOwnerships.map((ownership) => {
      const segmentMemberships = membershipsBySegment.get(ownership.segmentId) ?? [];
      const selectedMemberships = segmentMemberships
        .map((membership) => ({
          membership,
          preview: this.dailyCallItem(
            membership,
            ownership,
            assignments,
            config,
            repeatCounts.get(membership.customerId) ?? 0,
            customerPinsByCustomer.get(membership.customerId) ?? null,
          ),
        }))
        .sort((left, right) => sortDaily(left.preview, right.preview))
        .slice(0, ownership.dailyCap ?? 100)
        .map((entry) => entry.membership);
      return { ownership, segmentMemberships, selectedMemberships };
    });
    const contactSeeds = uniqueCustomers([
      ...selectedMembershipGroups.flatMap((group) => group.selectedMemberships.map((membership) => membership.customer)),
      ...dailyTaskRows.flatMap((row) => row.customer ? [row.customer] : []),
      ...customerPinRows.map((row) => row.customer),
    ]);
    const contactByCustomer = await this.contactResolver.resolveMany(contactSeeds);
    const selectedCustomers = uniqueCustomers(selectedMembershipGroups.flatMap((group) => group.selectedMemberships.map((membership) => membership.customer)));
    const priorityCustomerContext = await this.priorityCustomerContext(selectedCustomers, contactByCustomer);

    const segmentGroups = selectedMembershipGroups.map(({ ownership, segmentMemberships, selectedMemberships }) => {
      const items = selectedMemberships.map((membership) => this.withContactState(this.dailyCallItem(
          membership,
          ownership,
          assignments,
          config,
          repeatCounts.get(membership.customerId) ?? 0,
          customerPinsByCustomer.get(membership.customerId) ?? null,
          priorityCustomerContext.get(membership.customerId) ?? emptyPersonPriorityCustomerContext(),
          contactByCustomer.get(membership.customerId) ?? null,
        ), contactStates));
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
    const allDailyCards = dailyTaskRows
        .filter((row) => this.isQueueVisible(row))
        .filter((row) => this.isDailyWorkflowTask(row))
        .filter((row) => range === 'archive'
          ? this.isDailyWorkflowArchived(row, member.id, dailyWindow.start)
          : !this.isArchivedForMember(row, member.id))
        .map((row) => this.withContactState(this.withResolvedContact(
            this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext, ownedSegmentByCustomer.get(row.customerId ?? '') ?? null, callContext, cardStrategies, taskPinsByTarget.get(row.id) ?? null),
            contactByCustomer,
          ), contactStates))
        .filter((card) => personStrategyVisible(taskVisibilityStrategy, personCardStrategySignals(card)));
    const dailyFilterCounts = personDailyFilterCounts(allDailyCards);
    const selectedDailyCards = allDailyCards.filter((card) => personDailyFilterMatches(card, selectedFilter));
    const dailyCallList = (range === 'archive'
      ? selectedDailyCards.sort((left, right) => sortArchivedCards(left, right, archiveSort))
      : this.applyDailyTaskOrder(selectedDailyCards, dailyTaskOrderRows, dailyRankingStrategy)
    ).slice(0, 150);

    const segmentPriorityCards = segmentGroups
      .flatMap((group) => group.items.map((item) => this.segmentPriorityCard(item, member, cardContext)))
      .sort((left, right) => sortByPersonStrategy(priorityCustomerStrategy, left, right) || sortByUrgency(left, right))
      .slice(0, 120);
    const visibleAxes = Array.from(new Set([
      ...assignmentAxes,
      ...dailyTaskRows.map((row) => row.axis).filter((axis): axis is string => Boolean(axis)),
    ])).sort();

    const scopedRows = requestRows
      .filter((row) => this.isQueueVisible(row))
      .filter((row) => this.isServiceRequestScoped(row, assignments, member.id));
    const pinnedTasks = dailyTaskRows
      .filter((row) => taskPinsByTarget.has(row.id))
      .map((row) => this.withContactState(this.withResolvedContact(
          this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext, ownedSegmentByCustomer.get(row.customerId ?? '') ?? null, callContext, cardStrategies, taskPinsByTarget.get(row.id) ?? null),
          contactByCustomer,
        ), contactStates));
    const pinnedCustomers = customerPinRows
      .map((row) => this.withContactState(this.withResolvedContact(
          this.customerPinCard(row, assignments, config, repeatCounts.get(row.customer.id) ?? 0),
          contactByCustomer,
        ), contactStates));
    const pinBoard = [...pinnedTasks, ...pinnedCustomers].sort(sortByUrgency).slice(0, 120);
    const openRequestsCount = scopedRows.filter((row) => !CLOSED.has(row.status) && isCustomerRequestLike(row)).length;
    const missedFollowUpCount = allDailyCards.filter((card) => card.unreached || isMissedFollowUp(card, today.start)).length;
    const atRiskCustomerCount = segmentGroups.reduce(
      (total, group) => total + group.items.filter((item) => item.customerRisk !== 'none').length,
      0,
    );

    return {
      summary: {
        viewer: {
          id: member.id,
          email: member.email ?? null,
          name: [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || member.id,
          roleNames: member.roleAssignments.map((assignment) => assignment.role.name),
        },
        dailyCount: dailyFilterCounts.all ?? allDailyCards.length,
        priorityCount: segmentGroups.reduce((total, group) => total + group.items.length, 0),
        pinnedCount: pinBoard.length,
        highUrgencyCount: uniqueHighIntentCount(dailyCallList, dailyRankingStrategy, segmentPriorityCards, priorityCustomerStrategy),
        incomingCallsToday: todayAircallStats.incomingCallsToday,
        outboundCallsToday: todayAircallStats.outboundCallsToday,
        callsMadeToday: todayAircallStats.callsMadeToday,
        openRequestsCount,
        missedFollowUpCount,
        atRiskCustomerCount,
        visibleAxes,
        segmentGroupCount: segmentGroups.length,
        businessTimezone: today.timeZone,
        businessDate: today.localDate,
        dailyFilterCounts,
      },
      dailyCallList,
      priorityKanban: segmentPriorityCards,
      pinBoard,
      segmentGroups,
      frontendCustomization,
    };
  }

  private async dailyWorkflowRows(member: { id: string; aircallUserId?: string | null }, start: Date, end: Date | null) {
    const archiveDateScope: Prisma.StaffWorkItemWhereInput[] = end === null
      ? [
          { queueLocation: 'scheduled', visibleAfter: { lt: start } },
          { queueLocation: { not: 'scheduled' }, sourceOccurredAt: { lt: start } },
          { queueLocation: { not: 'scheduled' }, sourceOccurredAt: null, createdAt: { lt: start } },
          { archivedAt: { not: null } },
        ]
      : [
          { queueLocation: 'scheduled', visibleAfter: { gte: start, lt: end } },
          { queueLocation: { not: 'scheduled' }, sourceOccurredAt: { gte: start, lt: end } },
          { queueLocation: { not: 'scheduled' }, sourceOccurredAt: null, createdAt: { gte: start, lt: end } },
        ];
    const workflowScope: Prisma.StaffWorkItemWhereInput = {
      OR: [
        { sourceCallId: { not: null } },
        { sourceEmailId: { not: null } },
        { matchedRuleId: { not: null } },
        { metadata: { path: ['workflow'], not: Prisma.JsonNull } },
      ],
    };
    return this.prisma.db.staffWorkItem.findMany({
      where: {
        assignedMemberId: member.id,
        axis: { in: Array.from(DAILY_WORKFLOW_AXES) },
        AND: [
          workflowScope,
          { OR: archiveDateScope },
          ...(end === null
            ? []
            : [{ archivedAt: null }, { queueLocation: { not: 'archive' } }, { OR: [{ visibleAfter: null }, { visibleAfter: { lte: new Date() } }] }]),
        ],
        ...(end === null ? {} : { status: { notIn: Array.from(CLOSED) } }),
      },
      include: staffWorkItemInclude,
      orderBy: end === null
        ? [{ archivedAt: 'desc' }, { sourceOccurredAt: 'desc' }, { createdAt: 'desc' }]
        : [{ sourceOccurredAt: 'desc' }, { createdAt: 'desc' }, { updatedAt: 'desc' }],
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

  private async todayAircallStats(member: { id: string; aircallUserId?: string | null }, start: Date, end: Date) {
    const aircallUserIds = await this.memberAircallUserIds(member.id, member.aircallUserId ?? null);
    if (aircallUserIds.length === 0) {
      return { incomingCallsToday: 0, outboundCallsToday: 0, callsMadeToday: 0 };
    }
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      where: {
        aircallUserId: { in: aircallUserIds },
        eventTimestamp: { gte: start, lt: end },
      },
      select: {
        externalCallId: true,
        direction: true,
        eventTimestamp: true,
      },
      orderBy: [{ eventTimestamp: 'desc' }],
      take: 1000,
    });
    const seen = new Set<string>();
    let incomingCallsToday = 0;
    let outboundCallsToday = 0;
    for (const row of rows) {
      if (seen.has(row.externalCallId)) continue;
      seen.add(row.externalCallId);
      const direction = normalizeText(row.direction);
      if (direction.includes('out')) outboundCallsToday += 1;
      else if (direction.includes('in')) incomingCallsToday += 1;
    }
    return {
      incomingCallsToday,
      outboundCallsToday,
      callsMadeToday: outboundCallsToday,
    };
  }

  private isDailyWorkflowTask(row: StaffWorkItemRow) {
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
    strategy?: AlgorithmStrategyDefinition,
  ) {
    if (orderRows.length === 0) {
      return [...cards].sort((left, right) => strategy ? sortByPersonStrategy(strategy, left, right) || sortByCreatedAtDesc(left, right) : sortByCreatedAtDesc(left, right));
    }
    const orderByTaskId = new Map(
      orderRows
        .filter((row): row is PersonDailyTaskOrderRow & { staffWorkItemId: string } => Boolean(row.staffWorkItemId))
        .map((row) => [row.staffWorkItemId, row.position] as const),
    );
    return cards
      .map((card) => ({ card, position: orderByTaskId.get(card.id) ?? null }))
      .sort((left, right) => {
        if (left.position !== null && right.position !== null) {
          return left.position - right.position || (strategy ? sortByPersonStrategy(strategy, left.card, right.card) : 0) || sortByCreatedAtDesc(left.card, right.card);
        }
        if (left.position !== null) return -1;
        if (right.position !== null) return 1;
        return (strategy ? sortByPersonStrategy(strategy, left.card, right.card) : 0) || sortByCreatedAtDesc(left.card, right.card);
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
    const rows = await this.prisma.db.staffWorkItem.findMany({
      where: { status: { notIn: Array.from(CLOSED) }, archivedAt: null },
      include: staffWorkItemInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const visible = rows.filter((row) => this.isQueueVisible(row) && this.isStaffWorkScoped(row, assignments, member.id));
    const visibleCustomerIds = visible.map((row) => row.customerId).filter((id): id is string => Boolean(id));
    const [config, repeatCounts, cardContext, callContext, cardStrategies] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(visibleCustomerIds),
      this.cardContext(visibleCustomerIds),
      this.cardCallContext(visible),
      this.personCardStrategies(),
    ]);
    return visible
      .map((row) => this.queueCard(row, member.id, config, repeatCounts.get(row.customerId ?? '') ?? 0, cardContext, null, callContext, cardStrategies))
      .sort(sortByUrgency)
      .slice(0, 120);
  }

  async moveQueueCard(id: string, input: MovePersonQueueCardInput) {
    const member = await this.currentMember();
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
    const metadata = { ...this.record(row.metadata), personColumnId: input.columnId, personColumnIndex: input.index };
    await this.staffWork.transition(id, {
      memberId: member.id,
      toWorkState: COLUMN_STATUS[input.columnId],
      toQueue: input.columnId === 'closed' ? 'archive' : 'follow_up',
      reason: 'staff_queue_move',
      data: {
        status: COLUMN_STATUS[input.columnId],
        metadata: metadata as Prisma.InputJsonValue,
        ...(input.columnId === 'closed' ? { archivedAt: new Date(), archiveReason: 'queue_closed' } : { archivedAt: null, archiveReason: null }),
      },
    });
    this.logger.log('person_workspace', 'queue.move', 'Person queue card moved', {
      staff_work_item_id: id,
      member_id: member.id,
      column_id: input.columnId,
    });
    this.emitCallCenterInvalidate('person.queue.move');
    const updated = await this.requireStaffWorkItem(id);
    const [config, repeatCount, cardContext, callContext, cardStrategies] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCount(updated.customerId),
      this.cardContext(updated.customerId ? [updated.customerId] : []),
      this.cardCallContext([updated]),
      this.personCardStrategies(),
    ]);
    return this.queueCard(
      updated,
      member.id,
      config,
      repeatCount,
      cardContext,
      null,
      callContext,
      cardStrategies,
    );
  }

  async reorderDailyCalls(input: ReorderPersonDailyCallInput): Promise<ReorderPersonDailyCallResult> {
    const member = await this.currentMember();
    const tenantId = this.tenantId();
    if (!input.segmentId) {
      const dailyWindow = dailyWorkflowRange(input.range ?? 'last7d', await this.businessClock.currentDay());
      const operations = await this.dailyOperationsFor(member, { range: input.range ?? 'last7d' });
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
            staffWorkItemId: { notIn: orderedItemIds },
          },
        }),
        ...orderedItemIds.map((id, index) => this.prisma.db.personDailyTaskOrder.upsert({
          where: {
            tenantId_memberId_workDate_staffWorkItemId: {
              tenantId,
              memberId: member.id,
              workDate: dailyWindow.orderDate,
              staffWorkItemId: id,
            },
          },
          create: {
            id: prefixedId('pdto'),
            tenantId,
            memberId: member.id,
            workDate: dailyWindow.orderDate,
            staffWorkItemId: id,
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
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
    if (!this.isDailyWorkflowTask(row)) {
      throw new BadRequestException('Only recent call follow-ups can be archived from this list');
    }

    const archivedDate = new Date();
    const archivedAt = archivedDate.toISOString();
    await this.staffWork.transition(row.id, {
      memberId: member.id,
      toWorkState: 'archived',
      toQueue: 'archive',
      reason: 'staff_archived',
      data: { archivedAt: archivedDate, archiveReason: 'staff_archived' },
    });
    this.logger.log('person_workspace', 'daily.archive', 'Person daily call task archived', {
      staff_work_item_id: row.id,
      member_id: member.id,
      archived_at: archivedAt,
    });
    this.emitCallCenterInvalidate('person.daily.archive');

    return { ok: true, taskId: row.id, archived: true, archivedAt };
  }

  async syncTasks(): Promise<PersonTaskSyncResult> {
    const backfill = await this.aircall.backfillRecentCalls({ recentDays: 7, maxPages: 20 });
    const syncedAt = new Date().toISOString();
    this.logger.log('person_workspace', 'tasks.sync', 'Person workspace task sync requested', {
      fetched: backfill.fetched,
      ingested: backfill.ingested,
      new_transcript_resolver_queued: backfill.resolverQueued,
    });
    this.emitCallCenterInvalidate('person.tasks.sync');
    return {
      ok: true,
      intake: {
        recentDays: backfill.recentDays,
        callsChecked: backfill.fetched,
        callsAdded: backfill.ingested,
        callSummariesQueued: backfill.resolverQueued,
        callNotesFound: backfill.transcriptsFound,
        errors: backfill.errors,
      },
      processing: {
        checked: 0,
        queued: backfill.resolverQueued,
        skipped: backfill.skipped,
        version: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
      },
      displayMessage: `${backfill.ingested} new call${backfill.ingested === 1 ? '' : 's'} added from the last ${backfill.recentDays} days.`,
      syncedAt,
    };
  }

  async dialCustomer(input: AircallDialInput): Promise<AircallDialResponse> {
    const member = await this.currentMember();
    if (input.customerId) {
      await this.assertCustomerInWorkspace(input.customerId, member.id);
      await this.staffWork.assertProactiveDialAllowed(input.customerId);
    }
    const existingTask = input.staffWorkItemId ? await this.requireStaffWorkItem(input.staffWorkItemId) : null;
    if (existingTask) {
      await this.assertStaffWorkScoped(existingTask, member.id);
      if (input.customerId && existingTask.customerId && input.customerId !== existingTask.customerId) {
        throw new BadRequestException('The selected phone does not belong to this follow-up.');
      }
    }
    const result = await this.aircall.dialForMember(member.id, input);
    let dialActivityId: string | null = null;
    if (input.customerId) {
      await this.contactResolver.capturePhonePoints(input.customerId, [{
        value: input.phone,
        source: 'call',
        sourceRef: input.idempotencyKey ?? null,
        priority: 70,
        metadata: { surface: input.source, providerAccepted: result.ok },
      }]);
      const activity = await this.contactTimeline.recordDial({
        customerId: input.customerId,
        memberId: member.id,
        phone: input.phone,
        result,
      });
      dialActivityId = activity.id;
    }
    let staffWorkItemId = existingTask?.id ?? null;
    if (result.ok && result.mode === 'aircall_dial') {
      if (!staffWorkItemId && input.source === 'priority_board' && input.customerId) {
        const customer = await this.prisma.db.customer.findFirst({ where: { id: input.customerId } });
        if (!customer) throw new NotFoundException('Customer not found.');
        const work = await this.staffWork.create({
          customerId: customer.id,
          assignedMemberId: member.id,
          axis: 'sales',
          source: 'priority_call',
          title: `${customerDisplayName(customer)} follow-up`,
          description: 'Call accepted from the priority customer list. Save the outcome before leaving this follow-up.',
          sourceEventId: dialActivityId ?? undefined,
          idempotencyKey: `priority-dial:${input.idempotencyKey ?? dialActivityId ?? prefixedId('dial')}`,
          metadata: {
            personSource: 'priority_board',
            phone: result.normalizedPhone,
            providerStatus: result.providerStatus,
          },
        });
        staffWorkItemId = work.id;
      }
      if (staffWorkItemId) {
        await this.staffWork.recordOutcome(staffWorkItemId, member.id, {
          disposition: 'not_selected',
          phone: result.normalizedPhone,
          providerResult: result.mode,
          idempotencyKey: `dial-outcome:${input.idempotencyKey ?? dialActivityId ?? staffWorkItemId}`,
        });
      }
    }
    this.logger.log('person_workspace', 'aircall.dial', 'Person workspace Aircall dial requested', {
      member_id: member.id,
      customer_id: input.customerId ?? null,
      source: input.source,
      mode: result.mode,
      ok: result.ok,
      provider_status: result.providerStatus,
    });
    this.emitCallCenterInvalidate('person.aircall.dial');
    return { ...result, staffWorkItemId };
  }

  async toggleQueuePin(id: string, input: TogglePersonQueuePinInput) {
    const member = await this.currentMember();
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
    const pin = await this.workspacePins.toggle(member.id, 'staff_work_item', id, input.pinned);
    this.logger.log('person_workspace', 'queue.pin', 'Person queue pin toggled', {
      staff_work_item_id: id,
      member_id: member.id,
      pinned: pin.pinned,
    });
    this.emitCallCenterInvalidate('person.queue.pin');
    const updated = await this.requireStaffWorkItem(id);
    const [config, repeatCount, cardContext, callContext, cardStrategies] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCount(updated.customerId),
      this.cardContext(updated.customerId ? [updated.customerId] : []),
      this.cardCallContext([updated]),
      this.personCardStrategies(),
    ]);
    const card = this.queueCard(
      updated,
      member.id,
      config,
      repeatCount,
      cardContext,
      null,
      callContext,
      cardStrategies,
    );
    return { ...card, pinned: pin.pinned, pinnedAt: pin.pinnedAt };
  }

  async toggleCustomerPin(id: string, input: TogglePersonQueuePinInput) {
    const member = await this.currentMember();
    await this.assertCustomerInWorkspace(id, member.id);

    const customer = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const pin = await this.workspacePins.toggle(member.id, 'customer', id, input.pinned);

    this.logger.log('person_workspace', 'customer.pin', 'Person customer pin toggled', {
      customer_id: id,
      member_id: member.id,
      pinned: pin.pinned,
    });
    this.emitCallCenterInvalidate('person.customer.pin');
    return { ok: true, pinned: pin.pinned, pinId: pin.id, pinnedAt: pin.pinnedAt };
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
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
    if (CLOSED.has(row.status)) throw new BadRequestException('Closed or resolved tasks cannot be transferred');
    if (input.targetMemberId === member.id) throw new BadRequestException('Choose another teammate as transfer target');

    const target = await this.prisma.db.member.findFirst({
      where: { id: input.targetMemberId, status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException('Transfer target teammate not found');

    const targetAxes = transferAxesForRoles(target.roleAssignments.map((assignment) => assignment.role));
    if (targetAxes.length === 0) throw new BadRequestException('Transfer target does not have a transferable workspace focus');

    const fromAxis = axisOrNull(row.axis);
    const toAxis = input.targetAxis ?? (isTransferAxis(fromAxis) ? fromAxis : null) ?? targetAxes[0];
    if (!targetAxes.includes(toAxis)) throw new BadRequestException(`Transfer target cannot receive ${staffFocusLabel(toAxis)} work`);

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

      await tx.staffWorkItem.updateMany({
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

      await tx.staffWorkComment.create({
        data: {
          id: prefixedId('swc'),
          tenantId,
          staffWorkItemId: row.id,
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
        await tx.staffWorkParticipant.upsert({
          where: {
            tenantId_staffWorkItemId_memberId_role: {
              tenantId,
              staffWorkItemId: row.id,
              memberId: row.assignedMemberId,
              role: 'watcher',
            },
          },
          create: {
            id: prefixedId('swp'),
            tenantId,
            staffWorkItemId: row.id,
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
            staffWorkItemId: row.id,
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
              staffWorkItemId: row.id,
              toAxis,
              disabledSourceAssignmentIds: currentAssignments.map((assignment) => assignment.id),
            } as Prisma.InputJsonValue,
          },
        });
      }

      return touched;
    });

    this.logger.log('person_workspace', 'task.transfer', 'Person workspace task transferred', {
      staff_work_item_id: row.id,
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
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);

    const customerId = row.customerId;
    const customerEmail = row.customer?.email ?? null;
    const customerPhone = row.customer?.phone ?? null;
    const aircallWhere = aircallWhereFor(customerEmail, customerPhone);
    const lifecycleCallIds = uniqueStrings([
      row.sourceCallId,
      ...row.occurrences.map((occurrence) => occurrence.sourceCallId),
    ].filter((value): value is string => Boolean(value)));
    const aircallScopes: Prisma.AircallCallEventWhereInput[] = [
      ...(lifecycleCallIds.length > 0
        ? [{ OR: [{ id: { in: lifecycleCallIds } }, { externalCallId: { in: lifecycleCallIds } }] }]
        : []),
      ...(aircallWhere ? [aircallWhere] : []),
    ];
    const [
      config,
      repeatCount,
      cardContext,
      recentOrders,
      activityLogs,
      relatedRequests,
      aircallRows,
      callContext,
      cardStrategies,
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
      this.cardCallContext([row]),
      this.personCardStrategies(),
    ]);

    const card = this.queueCard(row, member.id, config, repeatCount, cardContext, null, callContext, cardStrategies);
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
      callSummary: latestCallSummary(aircallRows),
      customerDetailUrl: customerId ? `/staff/customers?customerId=${encodeURIComponent(customerId)}` : null,
    };
  }

  async linkTaskCustomer(id: string, input: LinkPersonTaskCustomerInput): Promise<LinkPersonTaskCustomerResult> {
    const member = await this.currentMember();
    const task = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(task, member.id);
    const tenantId = this.tenantId();

    let customer: Customer | null = null;
    let created = false;
    let matchedExisting = false;
    if (input.mode === 'existing') {
      customer = await this.prisma.db.customer.findFirst({ where: { id: input.customerId, tenantId } });
      if (!customer) throw new NotFoundException('Customer not found.');
    } else {
      const normalizedEmail = input.email?.trim().toLowerCase() || null;
      const normalizedPhone = normalizePhoneE164(input.phone);
      const [emailMatches, phoneMatches] = await Promise.all([
        normalizedEmail
          ? this.prisma.db.customer.findMany({
              where: {
                tenantId,
                OR: [
                  { email: { equals: normalizedEmail, mode: 'insensitive' } },
                  { customerUsers: { some: { email: { equals: normalizedEmail, mode: 'insensitive' } } } },
                  { subUsers: { some: { email: { equals: normalizedEmail, mode: 'insensitive' } } } },
                ],
              },
              take: 3,
            })
          : Promise.resolve([]),
        normalizedPhone ? this.contactResolver.matchingCustomerIds(normalizedPhone) : Promise.resolve([]),
      ]);
      const candidateIds = uniqueStrings([...emailMatches.map((row) => row.id), ...phoneMatches]);
      if (candidateIds.length > 1) {
        throw new BadRequestException('More than one customer matches these contact details. Select the existing customer explicitly.');
      }
      if (candidateIds.length === 1) {
        customer = await this.prisma.db.customer.findFirst({ where: { id: candidateIds[0], tenantId } });
        matchedExisting = Boolean(customer);
      }
      if (!customer) {
        const companyName = input.companyName?.trim()
          || [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ')
          || normalizedEmail
          || normalizedPhone;
        if (!companyName) throw new BadRequestException('Enter a customer name, email, or phone.');
        customer = await this.prisma.db.customer.create({
          data: {
            id: prefixedId('cust'),
            tenantId,
            companyName,
            firstName: input.firstName?.trim() || null,
            lastName: input.lastName?.trim() || null,
            email: normalizedEmail,
            phone: normalizedPhone,
            status: 'active',
            rawData: {
              source: 'person_workspace_unmatched_call',
              sourceStaffWorkItemId: task.id,
              createdByMemberId: member.id,
            } as Prisma.InputJsonValue,
          },
        });
        created = true;
      }
    }

    if (!customer) throw new BadRequestException('Customer could not be linked.');
    const sourceCall = task.sourceCallId
      ? await this.prisma.db.aircallCallEvent.findFirst({
          where: {
            tenantId,
            OR: [{ id: task.sourceCallId }, { externalCallId: task.sourceCallId }],
          },
          orderBy: { eventTimestamp: 'desc' },
        })
      : null;
    const suppliedEmail = input.mode === 'create' ? input.email?.trim().toLowerCase() || null : null;
    const suppliedPhone = input.mode === 'create' ? normalizePhoneE164(input.phone) : null;
    const resolvedPhone = suppliedPhone
      || customer.phone
      || sourceCall?.contactPhoneE164
      || sourceCall?.contactPhone
      || null;
    await this.prisma.db.$transaction(async (tx) => {
      if ((suppliedEmail && !customer!.email) || (resolvedPhone && !customer!.phone)) {
        customer = await tx.customer.update({
          where: { id: customer!.id },
          data: {
            email: customer!.email || suppliedEmail,
            phone: customer!.phone || resolvedPhone,
          },
        });
      }
      await tx.staffWorkItem.update({
        where: { id: task.id },
        data: {
          customerId: customer!.id,
          metadata: {
            ...this.record(task.metadata),
            customerLink: {
              linkedAt: new Date().toISOString(),
              linkedByMemberId: member.id,
              created,
              matchedExisting,
            },
          } as Prisma.InputJsonValue,
        },
      });
      if (sourceCall) {
        await tx.call.updateMany({
          where: { tenantId, aircallCallId: sourceCall.externalCallId },
          data: { customerId: customer!.id },
        });
      }
    });
    if (resolvedPhone) {
      await this.contactResolver.capturePhonePoints(customer.id, [{
        value: resolvedPhone,
        source: sourceCall && !suppliedPhone ? 'call' : 'customer',
        sourceRef: task.id,
        priority: suppliedPhone ? 110 : 100,
        isPrimary: true,
        metadata: {
          linkedFromStaffWorkItemId: task.id,
          enteredByMemberId: suppliedPhone ? member.id : null,
        },
      }]);
    }
    this.logger.log('person_workspace', 'task.customer_link', 'Unmatched follow-up linked to customer', {
      staff_work_item_id: task.id,
      customer_id: customer.id,
      member_id: member.id,
      created,
      matched_existing: matchedExisting,
    });
    this.emitCallCenterInvalidate('person.task.customer_link');
    return {
      ok: true,
      taskId: task.id,
      customerId: customer.id,
      customerName: customerDisplayName(customer),
      created,
      matchedExisting,
    };
  }

  async saveTaskNote(id: string, input: SavePersonTaskNoteInput) {
    const member = await this.currentMember();
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
    await this.prisma.db.staffWorkComment.create({
      data: {
        id: prefixedId('swc'),
        tenantId: this.tenantId(),
        staffWorkItemId: row.id,
        actorId: member.id,
        actorType: 'member',
        body: input.body,
        internal: true,
        attachmentsJson: [{ kind: 'person_task_note', customerId: row.customerId }] as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.staffWorkItem.updateMany({ where: { id: row.id }, data: { updatedAt: new Date() } });
    this.logger.log('person_workspace', 'task.note', 'Task brief note saved', {
      staff_work_item_id: row.id,
      member_id: member.id,
      customer_id: row.customerId,
    });
    this.emitCallCenterInvalidate('person.task.note');
    return this.taskBrief(id);
  }

  async recordTaskOutcome(id: string, input: RecordPersonTaskOutcomeInput): Promise<PersonTaskOutcome> {
    const member = await this.currentMember();
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
    const outcome = await this.staffWork.recordOutcome(row.id, member.id, input);
    if (outcome.disposition === 'completed') {
      try {
        await this.rules.fireTrigger({
          trigger: 'task.completed',
          eventId: `staff-work:${row.id}:outcome:${outcome.id}`,
          source: 'person_workspace',
          params: {
            taskId: row.id,
            staffWorkItemId: row.id,
            customerId: row.customerId,
            assignedMemberId: row.assignedMemberId,
            outcomeId: outcome.id,
            disposition: outcome.disposition,
            selectedAt: outcome.selectedAt,
            visibleAfter: outcome.visibleAfter,
          },
        });
      } catch (error) {
        this.logger.warn('person_workspace', 'task.completed.trigger_failed', 'Completed task event could not be emitted', {
          staff_work_item_id: row.id,
          outcome_id: outcome.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (row.customerId && outcome.visibleAfter) {
      await this.contactTimeline.recordFollowUp({
        customerId: row.customerId,
        memberId: member.id,
        scheduledAt: new Date(outcome.visibleAfter),
        note: input.note,
      });
    }
    this.logger.log('person_workspace', 'task.outcome', 'Person task outcome saved', {
      staff_work_item_id: row.id,
      member_id: member.id,
      customer_id: row.customerId,
      disposition: outcome.disposition,
      queue_location: outcome.queueLocation,
    });
    this.emitCallCenterInvalidate('person.task.outcome');
    return outcome;
  }

  async scheduleTaskFollowUp(id: string, input: SchedulePersonTaskFollowUpInput) {
    const member = await this.currentMember();
    const row = await this.requireStaffWorkItem(id);
    await this.assertStaffWorkScoped(row, member.id);
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
    await this.staffWork.transition(row.id, {
      memberId: member.id,
      toWorkState: 'scheduled',
      toQueue: 'scheduled',
      reason: 'staff_scheduled_follow_up',
      data: {
        dueAt: scheduledAt,
        visibleAfter: scheduledAt,
        archivedAt: null,
        archiveReason: null,
        status: CLOSED.has(row.status) ? 'open' : row.status,
        metadata: {
          ...metadata,
          scheduledFollowUps: [...scheduledFollowUps, followUp],
        } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.staffWorkComment.create({
      data: {
        id: prefixedId('swc'),
        tenantId: this.tenantId(),
        staffWorkItemId: row.id,
        actorId: member.id,
        actorType: 'member',
        body: input.note?.trim() ? `Follow-up scheduled: ${input.note.trim()}` : `Follow-up scheduled for ${scheduledAt.toISOString()}`,
        internal: true,
        attachmentsJson: [{ kind: 'calendar_follow_up', ...followUp }] as Prisma.InputJsonValue,
      },
    });
    if (row.customerId) {
      await this.contactTimeline.recordFollowUp({
        customerId: row.customerId,
        memberId: member.id,
        scheduledAt,
        note: input.note,
      });
    }
    this.logger.log('person_workspace', 'task.calendar', 'Task follow-up scheduled', {
      staff_work_item_id: row.id,
      member_id: member.id,
      scheduled_at: scheduledAt.toISOString(),
    });
    this.emitCallCenterInvalidate('person.task.calendar');
    return this.taskBrief(id);
  }

  async customers(query: PersonCustomerArchiveQuery) {
    const member = await this.currentMember();
    const limit = query.limit;
    const offset = query.offset;
    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '') ?? '';
    const phoneSearches = search && searchDigits.length >= 4 ? phoneVariants(search) : [];
    const resolvedPhoneCustomerIds = search ? await this.contactResolver.matchingCustomerIds(search) : [];
    const searchOr: Prisma.CustomerWhereInput[] = search ? [
      { companyName: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { shopifyCustomerId: { contains: search, mode: 'insensitive' } },
      ...(resolvedPhoneCustomerIds.length ? [{ id: { in: resolvedPhoneCustomerIds } }] : []),
      ...phoneSearches.map((phone) => ({ phone: { contains: phone, mode: Prisma.QueryMode.insensitive } })),
    ] : [];
    const where: Prisma.CustomerWhereInput = {
      assignments: { some: { memberId: member.id, isPrimary: true } },
      ...(searchOr.length > 0 ? { OR: searchOr } : {}),
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
    const [config, repeatCounts, contacts] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(rows.map((row) => row.id)),
      this.contactResolver.resolveMany(rows),
    ]);
    const items = rows
      .map((customer, index) => this.customerRow(customer, offset + index, config, repeatCounts, contacts.get(customer.id) ?? null))
      .sort((left, right) => (right.urgencyScore ?? 0) - (left.urgencyScore ?? 0) || left.name.localeCompare(right.name));
    return {
      items,
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

  async customerArchive(query: PersonCustomerArchiveQuery) {
    const limit = query.limit;
    const offset = query.offset;
    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '') ?? '';
    const phoneSearches = search && searchDigits.length >= 4 ? phoneVariants(search) : [];
    const resolvedPhoneCustomerIds = search ? await this.contactResolver.matchingCustomerIds(search) : [];
    const phoneSearchOr: Prisma.CustomerWhereInput[] = phoneSearches.map((phone) => ({
      phone: { contains: phone, mode: 'insensitive' },
    }));
    const searchOr: Prisma.CustomerWhereInput[] = search ? [
      { companyName: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { shopifyCustomerId: { contains: search, mode: 'insensitive' } },
      ...(resolvedPhoneCustomerIds.length ? [{ id: { in: resolvedPhoneCustomerIds } }] : []),
      ...phoneSearchOr,
    ] : [];
    const where: Prisma.CustomerWhereInput = {
      shopifyCustomerId: { not: null },
      ...(searchOr.length > 0 ? { OR: searchOr } : {}),
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
    const [config, repeatCounts, contacts] = await Promise.all([
      this.urgencyConfig(),
      this.repeatCounts(rows.map((row) => row.id)),
      this.contactResolver.resolveMany(rows),
    ]);
    return {
      items: rows.map((customer, index) => this.customerRow(customer, offset + index, config, repeatCounts, contacts.get(customer.id) ?? null)),
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
    await this.createCustomerNote(id, input, member, 'workspace');
    return this.customersService.detail(id);
  }

  async saveCustomerArchiveNote(id: string, input: SavePersonCustomerNoteInput) {
    const member = await this.currentMember();
    const customer = await this.prisma.db.customer.findFirst({
      where: { id, shopifyCustomerId: { not: null } },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Shopify customer not found');
    await this.createCustomerNote(id, input, member, 'archive');
    return this.customersService.detail(id);
  }

  private async createCustomerNote(
    id: string,
    input: SavePersonCustomerNoteInput,
    member: Awaited<ReturnType<PersonWorkspaceService['currentMember']>>,
    source: 'workspace' | 'archive',
  ) {
    await this.customerNotes.create({
      customerId: id,
      authorMemberId: member.id,
      body: input.body,
      source: source === 'archive' ? 'customer_archive' : 'person_workspace',
    });
    this.logger.log('person_workspace', 'customer.note.create', 'Customer note saved from person workspace', {
      customer_id: id,
      member_id: member.id,
      source,
    });
    this.emitCallCenterInvalidate('person.customer.note.create');
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
    const member = await this.currentMember();
    const [requests, calls, mail] = await Promise.all([
      this.prisma.db.staffWorkItem.findMany({
        where: {
          status: { notIn: Array.from(CLOSED) },
          OR: [{ assignedMemberId: member.id }, { participants: { some: { memberId: member.id } } }],
        },
        include: staffWorkItemInclude,
        orderBy: [{ updatedAt: 'desc' }],
        take: 150,
      }),
      this.prisma.db.aircallCallEvent.findMany({ orderBy: { eventTimestamp: 'desc' }, take: 25 }),
      this.prisma.db.mailDelivery.findMany({ where: { status: 'failed' }, orderBy: { updatedAt: 'desc' }, take: 15 }),
    ]);
    const callContext = await this.cardCallContext(requests);
    return [
      ...requests.filter((row) => this.isQueueVisible(row)).slice(0, 50).map((row) => this.calendarFromRequest(row, callContext)),
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
        source: currentResolverOutput(row) ? 'call_analysis' : 'manual',
        ...calendarDisplayFromCall(row),
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
        displayReason: `Mail delivery failed for ${row.recipientEmail}.`,
        displayConcern: row.errorMessage ?? row.subject,
        displayOutcome: 'Review the delivery error and decide whether customer follow-up is needed.',
        displayActions: ['Review failed message', 'Check customer email', 'Save the next step if outreach is needed'],
        callExcerpt: null,
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
    return this.workspaceNotes.list(member.id);
  }

  async saveNote(input: SavePersonNoteInput) {
    const member = await this.currentMember();
    return this.workspaceNotes.save(member.id, input);
  }

  async replyNote(id: string, input: ReplyPersonNoteInput) {
    const member = await this.currentMember();
    return this.workspaceNotes.reply(member.id, id, input);
  }

  async deleteNote(id: string) {
    const member = await this.currentMember();
    return this.workspaceNotes.remove(member.id, id);
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
    const member = await this.currentMember();
    const rows = await this.prisma.db.staffWorkItem.findMany({
      where: {
        sourceCallId: { not: null },
        OR: [
          { assignedMemberId: member.id },
          { participants: { some: { memberId: member.id } } },
        ],
      },
      include: staffWorkItemInclude,
      orderBy: [{ sourceOccurredAt: 'desc' }, { updatedAt: 'desc' }],
      take: 80,
    });
    const callContext = await this.cardCallContext(rows);
    const cards = rows.flatMap((row) => {
      const sourceCall = row.sourceCallId ? callContext.callsById.get(row.sourceCallId) ?? null : null;
      const resolver = resolverForBrief(sourceCall);
      if (!resolver) return [];
      const evidence = uniqueStrings([
        ...resolver.person_brief.evidence,
        ...resolver.next_action.evidence,
        ...resolver.customer_issue.evidence,
        ...resolver.customer_mood.evidence,
      ].map((item) => `${item.speaker}: ${item.text}`)).slice(0, 4);
      if (evidence.length === 0) return [];
      return [{
        id: `coaching-${row.id}`,
        title: staffDisplayText(resolver.person_brief.call_goal || resolver.next_action.action || row.title),
        description: staffDisplayText(resolver.person_brief.why_calling || resolver.summary),
        focus: staffDisplayText(
          resolver.person_brief.issue
          || resolver.customer_issue.description
          || resolver.customer_issue.category
          || resolver.customer_mood.label,
        ),
        evidence,
        customerName: staffDisplayText(row.customer?.companyName || row.customer?.email || sourceCall?.contactPhoneE164 || sourceCall?.contactPhone),
        source: 'Verified customer conversation',
        updatedAt: relative(row.sourceOccurredAt ?? row.updatedAt),
      }];
    }).slice(0, 12);
    return {
      highPriorityCount: cards.length,
      cards,
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

  private async assertStaffWorkScoped(row: StaffWorkItemRow, memberId: string) {
    const assignments = await this.axisAssignments(memberId);
    if (
      !this.isStaffWorkScoped(row, assignments, memberId)
      && !(await this.isDailyWorkflowOperatorScoped(row, memberId))
    ) {
      throw new ForbiddenException('Customer is outside your workspace scope');
    }
  }

  private async isDailyWorkflowOperatorScoped(row: StaffWorkItemRow, memberId: string) {
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

  private isStaffWorkScoped(
    row: { customerId: string | null; assignedMemberId: string | null; axis: string | null; participants?: Array<{ memberId: string | null }> },
    assignments: AxisAssignments,
    memberId: string,
  ) {
    return this.isServiceRequestScoped(row, assignments, memberId);
  }

  private async priorityCustomerContext(
    customers: Array<{ id: string; email: string | null; phone: string | null }>,
    contacts: Map<string, ResolvedCustomerContact>,
  ): Promise<Map<string, PersonPriorityCustomerContext>> {
    const ids = uniqueStrings(customers.map((customer) => customer.id));
    const result = new Map(ids.map((id) => [id, emptyPersonPriorityCustomerContext()] as const));
    if (ids.length === 0) return result;

    const emailToCustomerId = new Map<string, string>();
    const phoneToCustomerId = new Map<string, string>();
    for (const customer of customers) {
      const contact = contacts.get(customer.id);
      const email = contact?.normalizedEmail ?? customer.email?.trim().toLowerCase();
      if (email) emailToCustomerId.set(email, customer.id);
      const resolvedPhones = contact?.alternatePhones.map((entry) => entry.phone) ?? [customer.phone];
      for (const phone of resolvedPhones.flatMap((value) => phoneVariants(value))) {
        phoneToCustomerId.set(phone, customer.id);
      }
    }
    const emails = [...emailToCustomerId.keys()];
    const phones = [...phoneToCustomerId.keys()];

    const [workRows, serviceRows, customerNoteRows, workspaceNoteRows, noteRows, commentRows, staffCommentRows, orderRows, callRows] = await Promise.all([
      this.prisma.db.staffWorkItem.findMany({
        where: { customerId: { in: ids }, status: { notIn: Array.from(CLOSED) } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 20, 200), 3000),
      }),
      this.prisma.db.serviceRequest.findMany({
        where: { customerId: { in: ids } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 20, 200), 3000),
      }),
      this.prisma.db.customerInternalNote.findMany({
        where: { customerId: { in: ids }, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 5, 100), 1000),
      }),
      this.prisma.db.personWorkspaceNote.findMany({
        where: { linkedCustomerId: { in: ids }, kind: 'queue', deletedAt: null },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(ids.length * 5, 100), 1000),
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
      this.prisma.db.staffWorkComment.findMany({
        where: {
          internal: true,
          staffWorkItem: { customerId: { in: ids } },
        },
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          staffWorkItem: { select: { customerId: true } },
        },
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
      ...customerNoteRows.map((row) => row.authorMemberId),
      ...workspaceNoteRows.map((row) => row.authorMemberId),
      ...noteRows.map((row) => row.createdByActorId),
      ...commentRows.map((row) => row.actorId),
      ...staffCommentRows.map((row) => row.actorId),
    ]);
    const members = memberIds.length
      ? await this.prisma.db.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const memberById = new Map(members.map((member) => [member.id, memberDisplayName(member)] as const));

    for (const row of workRows) {
      if (!row.customerId) continue;
      const context = result.get(row.customerId);
      if (!context || CLOSED.has(row.status)) continue;
      context.openTasksCount += 1;
    }

    for (const row of serviceRows) {
      if (!row.customerId) continue;
      const context = result.get(row.customerId);
      if (!context || CLOSED.has(row.status) || INTERNAL_WORKSPACE_KINDS.has(String(this.record(row.metadata).personWorkspaceKind))) continue;
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

    for (const row of customerNoteRows) {
      const context = result.get(row.customerId);
      if (!context) continue;
      const note = {
        id: row.id,
        body: row.body,
        authorName: memberById.get(row.authorMemberId ?? '') ?? 'Staff member',
        createdAt: row.createdAt.toISOString(),
      };
      context.notesCount += 1;
      if (!context.latestNote || note.createdAt > context.latestNote.createdAt) context.latestNote = note;
    }

    for (const row of workspaceNoteRows) {
      if (!row.linkedCustomerId) continue;
      const context = result.get(row.linkedCustomerId);
      if (!context) continue;
      const note = {
        id: row.id,
        body: row.body || row.title,
        authorName: memberById.get(row.authorMemberId) ?? 'Staff member',
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

    for (const row of staffCommentRows) {
      const customerId = row.staffWorkItem.customerId;
      if (!customerId) continue;
      const context = result.get(customerId);
      if (!context) continue;
      const note = {
        id: row.id,
        body: row.body,
        authorName: row.actor ? memberDisplayName(row.actor) : memberById.get(row.actorId ?? '') ?? 'Staff member',
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
      const resolver = currentResolverOutput(row);
      const personBrief = resolver?.person_brief;
      const call = {
        id: row.id,
        phone: row.contactPhoneE164 ?? row.contactPhone,
        email: row.contactEmail,
        summary: personBrief?.why_calling || resolver?.summary || 'Call analysis unavailable.',
        at: row.eventTimestamp.toISOString(),
      };
      context.callsCount += 1;
      if (!context.latestCall || call.at > context.latestCall.at) context.latestCall = call;
    }

    return result;
  }

  private withResolvedContact(
    card: PersonQueueCardDto,
    contacts: Map<string, ResolvedCustomerContact>,
  ): PersonQueueCardDto {
    if (!card.customerId) return card;
    const contact = contacts.get(card.customerId);
    if (!contact) return card;
    return {
      ...card,
      phone: contact.phone ?? undefined,
      email: contact.email ?? undefined,
    };
  }

  private withContactState<T extends { customerId?: string | null }>(
    item: T,
    states: Map<string, PersonContactState>,
  ): T {
    if (!item.customerId) return item;
    return { ...item, contactState: states.get(item.customerId) ?? null };
  }

  private dailyCallItem(
    membership: SegmentMembershipRow,
    ownership: { priority: number; dailyCap: number | null; segment: { id: string; name: string; color: string; priority: number; priorityGlobal: number } },
    assignments: AxisAssignments,
    config = this.scoring.configFrom({}),
    repeatCount = 0,
    pin: WorkspacePinRow | null = null,
    context: PersonPriorityCustomerContext = emptyPersonPriorityCustomerContext(),
    contact: ResolvedCustomerContact | null = null,
  ): PersonDailyCallItem {
    const customer = membership.customer;
    const axes = assignments.get(customer.id) ?? new Set<string>();
    const assignedAxis = Array.from(axes).filter((axis) => DAILY_WORKFLOW_AXES.has(axis)).sort().join(', ') || 'unassigned';
    const customerRisk = customerRiskFromSignals({
      churnRisk: customer.insight?.churnRisk,
      lastOrderAt: customer.lastOrderAt,
      openRequestsCount: context.openRequestsCount,
      repeatCount,
    });
    const urgencyBreakdown = this.scoring.score({
      priority: customer.insight?.churnRisk === 'critical' ? 'critical' : customer.insight?.churnRisk === 'high' ? 'high' : 'medium',
      source: 'daily_customer',
      axis: assignedAxis,
      createdAt: customer.lastOrderAt ?? membership.matchedAt,
      updatedAt: customer.updatedAt,
      metadata: { workflow: { params: { intent: 'follow_up', signalUrgency: customer.insight?.churnRisk ?? undefined } } },
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
    const item: PersonDailyCallItemWithoutDisplay = {
      kind: 'customer' as const,
      id: dailyItemId(membership.segmentId, customer.id),
      customerId: customer.id,
      customerName: customerDisplayName(customer),
      email: contact?.email ?? customer.email,
      phone: contact?.phone ?? null,
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
      customerRisk: customerRisk.risk,
      customerRiskNote: customerRisk.note,
      latestNote: context.latestNote,
      latestOrder: context.latestOrder,
      latestCall: context.latestCall,
      reason: priorityCustomerReason(membership.segment.name, context, repeatCount),
    };
    return withPersonDailyCallItemDisplay(item);
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
    const segment = customer.segmentMemberships[0]?.segment;
    const axes = assignments.get(customer.id);
    const assignedAxis = axes ? Array.from(axes).sort().join(', ') : 'unassigned';
    const customerRisk = customerRiskFromSignals({
      churnRisk: customer.insight?.churnRisk,
      lastOrderAt: customer.lastOrderAt,
      repeatCount,
    });
    const pinnedAt = row.pin.createdAt.getTime();
    const urgencyBreakdown = this.scoring.score({
      priority: customer.insight?.churnRisk === 'critical' ? 'critical' : customer.insight?.churnRisk === 'high' ? 'high' : 'medium',
      source: 'daily_customer',
      axis: assignedAxis,
      createdAt: customer.lastOrderAt ?? row.pin.createdAt,
      updatedAt: row.pin.updatedAt,
      metadata: { workflow: { params: { intent: 'follow_up', signalUrgency: customer.insight?.churnRisk ?? undefined } } },
      taskStateSnapshot: null,
      segmentPriority: segment?.priorityGlobal ?? segment?.priority ?? 0,
      repeatCount,
    }, config);
    return withPersonCardDisplay({
      kind: 'customer' as const,
      id: row.pin.id,
      customerId: customer.id,
      title: customerDisplayName(customer),
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
      occurrenceCount: 0,
      currentDisposition: null,
      outcomeRequired: false,
      phone: customer.phone ?? undefined,
      email: customer.email ?? undefined,
      ordersCount: customer.ordersCount,
      totalSpent: money(customer.totalSpent),
      customerRisk: customerRisk.risk,
      customerRiskNote: customerRisk.note,
    });
  }

  private segmentPriorityCard(
    item: PersonDailyCallItem,
    member: { id: string; firstName: string; lastName: string; email: string },
    cardContext?: CardContext,
  ): PersonQueueCardDto {
    const urgencyScore = item.urgencyScore;
    return withPersonCardDisplay({
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
      occurrenceCount: 0,
      currentDisposition: null,
      outcomeRequired: false,
      phone: item.phone ?? undefined,
      email: item.email ?? undefined,
      ordersCount: item.ordersCount,
      totalSpent: item.totalSpent,
      miniOrder: cardContext?.miniOrders.get(item.customerId),
      performance30d: cardContext?.performance.get(item.customerId) ?? { ...EMPTY_PERFORMANCE_30D },
      customerRisk: item.customerRisk,
      customerRiskNote: item.customerRiskNote,
      contactState: item.contactState ?? null,
    });
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

  private async requireStaffWorkItem(id: string) {
    const row = await this.prisma.db.staffWorkItem.findFirst({
      where: { id },
      include: staffWorkItemInclude,
    });
    if (!row) throw new NotFoundException('Follow-up not found');
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

  private async personCardStrategies(): Promise<PersonCardStrategyRuntime> {
    const [nextAction, callBrief] = await Promise.all([
      this.rules.algorithmRuntimeDefinition('staff.customer_next_action'),
      this.rules.algorithmRuntimeDefinition('staff.call_brief_generation'),
    ]);
    return { nextAction, callBrief };
  }

  private queueCard(
    row: StaffWorkItemRow,
    memberId: string,
    config = this.scoring.configFrom({}),
    repeatCount = 0,
    cardContext?: CardContext,
    ownedSegment?: OwnedSegmentContext | null,
    callContext?: CardCallContext,
    strategies?: PersonCardStrategyRuntime,
    pin: WorkspacePinRow | null = null,
  ): PersonQueueCardDto {
    const metadata = this.record(row.metadata);
    const pinnedBy = this.record(metadata.personPinnedBy);
    const legacyPinnedAt = typeof pinnedBy[memberId] === 'number' ? Number(pinnedBy[memberId]) : null;
    const pinnedAt = pin?.createdAt.getTime() ?? legacyPinnedAt;
    const columnId = personColumn(row.status, metadata.personColumnId);
    const source = taskSource(row);
    const header = taskHeader(row, metadata, callContext);
    const sourceCall = row.sourceCallId ? callContext?.callsById.get(row.sourceCallId) ?? null : null;
    const ticket = ticketNumber(row);
    const workflowBadges = workflowBadgesFromMetadata(metadata);
    const generatedBrief = hasGeneratedBrief(source) ? this.brief(row, callContext) : undefined;
    const resolverOutput = hasGeneratedBrief(source) ? resolverForBrief(sourceCall) : null;
    const missedNote = followUpMissedNote(row);
    const customerRisk = customerRiskFromSignals({
      churnRisk: row.customer?.insight?.churnRisk,
      lastOrderAt: row.customer?.lastOrderAt,
      repeatCount,
    });
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
    const card: PersonQueueCardWithoutDisplay = {
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
      createdAt: workDisplayTimestamp(row).toISOString(),
      occurrenceCount: row.occurrenceCount,
      firstSignalAt: row.firstSignalAt?.toISOString() ?? null,
      lastSignalAt: row.lastSignalAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      unreached: missedNote !== null,
      missedNote,
      customerRisk: customerRisk.risk,
      customerRiskNote: customerRisk.note,
      callIntent: workflowBadges.callIntent,
      psychTags: workflowBadges.psychTags,
      phone: header.phone ?? undefined,
      email: header.email ?? undefined,
      ordersCount: row.customer?.ordersCount ?? undefined,
      totalSpent: row.customer ? money(row.customer.totalSpent) : undefined,
      segmentId: ownedSegment?.segmentId ?? row.customer?.segmentMemberships[0]?.segment.id ?? null,
      segmentName: ownedSegment?.segmentName ?? row.customer?.segmentMemberships[0]?.segment.name ?? null,
      segmentPriority: ownedSegment?.segmentPriority ?? row.customer?.segmentMemberships[0]?.segment.priorityGlobal ?? row.customer?.segmentMemberships[0]?.segment.priority ?? null,
      segmentOwnershipPriority: ownedSegment?.ownershipPriority ?? null,
      aiBrief: generatedBrief,
      resolverOutput,
      callExcerpt: staffDisplayText(generatedBrief?.transcriptSnippet) || null,
      miniOrder: row.customerId ? cardContext?.miniOrders.get(row.customerId) : undefined,
      performance30d: row.customerId ? cardContext?.performance.get(row.customerId) ?? { ...EMPTY_PERFORMANCE_30D } : undefined,
      currentDisposition: effectiveWorkDisposition(row),
      outcomeRequired: effectiveWorkDisposition(row) === 'not_selected',
    };
    const displayCard = withPersonCardDisplay(card);
    return publicPersonQueueCard(strategies ? personCardWithStrategies(displayCard, strategies) : displayCard);
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
    const rows = await this.prisma.db.staffWorkItem.groupBy({
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
      this.prisma.db.staffWorkItem.groupBy({
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

  private async cardCallContext(rows: Array<{
    sourceCallId: string | null;
    occurrences?: Array<{ sourceCallId: string | null }>;
  }>): Promise<CardCallContext> {
    const sourceCallIds = uniqueStrings(rows.flatMap((row) => [
      row.sourceCallId,
      ...(row.occurrences ?? []).map((occurrence) => occurrence.sourceCallId),
    ]).filter((id): id is string => Boolean(id)));
    if (sourceCallIds.length === 0) return { callsById: new Map() };
    const calls = await this.prisma.db.aircallCallEvent.findMany({
      where: { OR: [{ id: { in: sourceCallIds } }, { externalCallId: { in: sourceCallIds } }] },
      select: {
        id: true,
        externalCallId: true,
        contactPhone: true,
        contactPhoneE164: true,
        contactEmail: true,
        transcriptRaw: true,
        resolverStatus: true,
        resolverOutput: true,
        resolverModel: true,
        resolverPromptKey: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
      orderBy: { eventTimestamp: 'desc' },
    });
    const callsById = new Map<string, CardCallRow>();
    for (const call of calls) {
      callsById.set(call.id, call);
      if (!callsById.has(call.externalCallId)) callsById.set(call.externalCallId, call);
    }
    return { callsById };
  }

  private calendarFromRequest(row: StaffWorkItemRow, callContext?: CardCallContext) {
    const date = row.dueAt ?? (row.assignedMemberId ? row.updatedAt : row.createdAt);
    const source = taskSource(row);
    const display = calendarDisplayFromRequest(row, hasGeneratedBrief(source) ? this.brief(row, callContext) : null);
    return {
      id: `sr-${row.id}`,
      serviceRequestId: row.id,
      customerId: row.customerId,
      title: row.title,
      customer: row.customer?.companyName ?? row.customer?.email ?? null,
      customerEmail: row.customer?.email ?? null,
      customerPhone: row.customer?.phone ?? null,
      dayIso: isoDate(date),
      startHour: hour(date),
      durationMinutes: row.priority === 'critical' || row.priority === 'urgent' ? 30 : 20,
      kind: row.source === 'call' ? 'callback' : 'task',
      source,
      ...display,
    };
  }

  private brief(row: StaffWorkItemRow, callContext?: CardCallContext): PersonTaskBrief {
    const sourceCall = row.sourceCallId ? callContext?.callsById.get(row.sourceCallId) ?? null : null;
    const resolver = resolverForBrief(sourceCall);
    if (resolver) return transcriptPersonBrief(row, resolver, sourceCall);

    return {
      whyCalling: '',
      upsetAbout: '',
      callGoal: '',
      suggestedActions: [],
      promptKey: 'person.workspace.resolver-unavailable',
      promptVersion: String(TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
      modelUsed: 'unavailable',
      confidence: 0,
      transcriptSnippet: sourceCall?.transcriptRaw?.slice(0, 600) || undefined,
    };
  }

  private customerRow(
    customer: CustomerWorkspaceRow,
    index: number,
    config: UrgencyScoringConfig,
    repeatCounts: Map<string, number>,
    contact: ResolvedCustomerContact | null,
  ) {
    const segment = customer.segmentMemberships[0]?.segment;
    const urgencyBreakdown = this.scoring.score({
      priority: customer.insight?.churnRisk === 'critical' ? 'critical' : customer.insight?.churnRisk === 'high' ? 'high' : 'medium',
      source: 'daily_customer',
      axis: 'account',
      createdAt: customer.lastOrderAt ?? customer.updatedAt,
      updatedAt: customer.updatedAt,
      metadata: { workflow: { params: { intent: 'follow_up', signalUrgency: customer.insight?.churnRisk ?? undefined } } },
      taskStateSnapshot: {},
      segmentPriority: segment?.priorityGlobal ?? segment?.priority ?? index,
      repeatCount: repeatCounts.get(customer.id) ?? 0,
    }, config);
    return {
      id: customer.id,
      name: customer.companyName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.email || customer.id,
      email: contact?.email ?? customer.email ?? '',
      phone: contact?.phone ?? '',
      phoneDisplay: contact?.displayPhone ?? '',
      phoneCallable: contact?.phoneCallable ?? false,
      phoneSource: contact?.phoneSource ?? null,
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

  private isArchivedForMember(
    row: { metadata: Prisma.JsonValue; archivedAt?: Date | null; queueLocation?: string | null },
    memberId: string,
  ) {
    if (row.archivedAt || row.queueLocation === 'archive') return true;
    const metadata = this.record(row.metadata);
    const archivedBy = this.record(metadata.personArchivedBy);
    return typeof archivedBy[memberId] === 'string' || typeof archivedBy[memberId] === 'number';
  }

  private isDailyWorkflowArchived(
    row: {
      metadata: Prisma.JsonValue;
      createdAt: Date;
      sourceOccurredAt?: Date | null;
      visibleAfter?: Date | null;
      archivedAt?: Date | null;
      queueLocation?: string | null;
    },
    memberId: string,
    archiveStart: Date,
  ) {
    return workDisplayTimestamp(row).getTime() < archiveStart.getTime() || this.isArchivedForMember(row, memberId);
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

function dailyWorkflowRange(range: PersonDailyOperationRange, today: BusinessDayRange, now = new Date()) {
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

function uniqueCustomers<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row] as const)).values());
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

function uniqueHighIntentCount(
  daily: PersonQueueCardDto[],
  dailyStrategy: AlgorithmStrategyDefinition,
  tasks: PersonQueueCardDto[],
  taskStrategy: AlgorithmStrategyDefinition,
) {
  const seen = new Set<string>();
  let count = 0;
  for (const item of daily) {
    if (!isHighIntentByStrategy(dailyStrategy, item)) continue;
    const key = item.customerId ? `customer:${item.customerId}` : `task:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      count += 1;
    }
  }
  for (const item of tasks) {
    if (!isHighIntentByStrategy(taskStrategy, item)) continue;
    const key = item.customerId ? `customer:${item.customerId}` : `task:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      count += 1;
    }
  }
  return count;
}

function isHighIntentByStrategy(strategy: AlgorithmStrategyDefinition, card: PersonQueueCardDto) {
  const signals = personCardStrategySignals(card);
  const score = personStrategyScore(strategy, signals);
  const band = strategy.scoreBands.find((entry) => score >= entry.min && score <= entry.max) ?? null;
  if (!band) return false;
  const configuredBandIds = highIntentBandIds(strategy);
  if (configuredBandIds.length > 0) return configuredBandIds.includes(band.id);
  return band.tone === 'danger' || /\b(high|urgent|fast)\b/i.test(`${band.id} ${band.label}`);
}

function highIntentBandIds(strategy: AlgorithmStrategyDefinition) {
  const raw = strategy.metadata?.highIntentBandIds;
  return Array.isArray(raw) ? raw.map((value) => String(value).trim()).filter(Boolean) : [];
}

function resolverForBrief(sourceCall?: CardCallRow | null): TranscriptResolverOutput | null {
  if (!sourceCall
    || sourceCall.resolverStatus !== 'succeeded'
  ) return null;
  return trustedCurrentModelResolverOutput(sourceCall, TRANSCRIPT_RESOLVER_SCHEMA_VERSION);
}

function transcriptPersonBrief(
  row: StaffWorkItemRow,
  resolver: TranscriptResolverOutput,
  sourceCall?: CardCallRow | null,
): PersonTaskBrief {
  const personBrief = resolver.person_brief;
  return {
    whyCalling: staffBriefText(personBrief.why_calling, ''),
    upsetAbout: staffBriefText(personBrief.upset_about || personBrief.issue, ''),
    callGoal: staffBriefText(personBrief.call_goal || personBrief.next_action, ''),
    suggestedActions: cleanedActions(personBrief.suggested_actions),
    promptKey: 'person.workspace.transcript-brief',
    promptVersion: String(sourceCall?.resolvedWithVersion ?? resolver.resolved_with_version ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
    modelUsed: sourceCall?.resolverModel ?? 'transcript-resolver',
    confidence: resolverBriefConfidence(resolver),
    transcriptSnippet: staffBriefText(personBrief.transcript_snippet, ''),
  };
}

function resolverBriefConfidence(resolver: TranscriptResolverOutput) {
  const values = [
    resolver.conversation.confidence,
    resolver.customer_mood.confidence,
    resolver.customer_issue.confidence,
    resolver.promise.confidence,
    resolver.next_action.confidence,
    ...resolver.operational_signals.map((signal) => signal.confidence),
  ].filter((value) => Number.isFinite(value));
  return Math.max(0, Math.min(1, values.length > 0 ? Math.max(...values) : 0));
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
  return staffSafeDisplayText(text);
}

function withPersonCardDisplay(card: PersonQueueCardWithoutDisplay): PersonQueueCardInternal {
  return { ...card, ...personCardDisplay(card) };
}

function publicPersonQueueCard(card: PersonQueueCardInternal): PersonQueueCardDto {
  const {
    aiBrief: _aiBrief,
    resolverOutput: _resolverOutput,
    workflowTrace: _workflowTrace,
    taskStateSnapshot: _taskStateSnapshot,
    matchedRuleId: _matchedRuleId,
    ...publicCard
  } = card;
  return publicCard;
}

function withPersonDailyCallItemDisplay(item: PersonDailyCallItemWithoutDisplay): PersonDailyCallItem {
  return { ...item, ...personDailyCallItemDisplay(item) };
}

export function personCardDisplay(card: PersonQueueCardWithoutDisplay): PersonQueueCardDisplayFields {
  if (card.kind === 'task' && card.source === 'call_analysis' && (!card.resolverOutput || !card.aiBrief || card.aiBrief.modelUsed === 'unavailable')) {
    return {
      analysisStatus: 'unavailable',
      displayTitle: 'Review required',
      displayReason: '',
      displayConcern: '',
      displayOutcome: '',
      displayActions: [],
      displayBadges: [{ label: 'Review required', tone: 'warning' }],
      displayCustomerSummary: staffCustomerSummary(card),
      displayCommerceSnapshot: staffCommerceSnapshot(card),
      displayCallSnapshot: staffCallSnapshot(card),
    };
  }
  if (card.kind === 'task' && card.resolverOutput && card.aiBrief) {
    const priority = card.resolverOutput.next_action.priority;
    const mood = card.resolverOutput.customer_mood.label;
    const primarySignal = card.resolverOutput.operational_signals
      .filter((signal) => signal.action_required)
      .sort((left, right) => right.confidence - left.confidence)[0] ?? null;
    const badgeLabel = staffDisplayText(
      primarySignal?.suggested_task_title
      ?? card.resolverOutput.next_action.action
      ?? card.aiBrief.callGoal,
    ).slice(0, 96) || 'Verified call context';
    const tone: PersonQueueCardDisplayFields['displayBadges'][number]['tone'] =
      priority === 'urgent' || mood === 'angry' ? 'danger'
        : priority === 'high' || mood === 'frustrated' || mood === 'anxious' ? 'warning'
          : card.resolverOutput.call_intent === 'sale' ? 'success' : 'info';
    return {
      analysisStatus: 'available',
      displayTitle: staffDisplayText(card.title),
      displayReason: staffDisplayText(card.aiBrief.whyCalling),
      displayConcern: staffDisplayText(card.aiBrief.upsetAbout),
      displayOutcome: staffDisplayText(card.aiBrief.callGoal),
      displayActions: cleanedActions(card.aiBrief.suggestedActions),
      displayBadges: [
        { label: badgeLabel, tone },
        card.customerRisk === 'lost'
          ? { label: 'Critical customer risk', tone: 'danger' as const }
          : card.customerRisk === 'at_risk'
            ? { label: 'At-risk customer', tone: 'warning' as const }
            : null,
      ].filter((badge): badge is NonNullable<typeof badge> => Boolean(badge)),
      displayCustomerSummary: staffCustomerSummary(card),
      displayCommerceSnapshot: staffCommerceSnapshot(card),
      displayCallSnapshot: staffCallSnapshot(card),
    };
  }
  if (card.kind === 'customer') {
    const concern = firstMeaningfulStaffText([card.customerRiskNote, card.missedNote]);
    const badges = [
      card.segment ? { label: staffDisplayText(card.segment), tone: 'info' as const } : null,
      card.customerRisk === 'lost'
        ? { label: 'Critical customer risk', tone: 'danger' as const }
        : card.customerRisk === 'at_risk'
          ? { label: 'At-risk customer', tone: 'warning' as const }
          : null,
      card.pinned ? { label: 'Pinned', tone: 'accent' as const } : null,
    ].filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
    return {
      analysisStatus: 'not_applicable',
      displayTitle: staffDisplayText(card.title),
      displayReason: card.segment
        ? `Assigned customer list: ${staffDisplayText(card.segment)}.`
        : card.pinned
          ? 'Pinned customer.'
          : '',
      displayConcern: concern,
      displayOutcome: '',
      displayActions: [],
      displayBadges: badges,
      displayCustomerSummary: staffCustomerSummary(card),
      displayCommerceSnapshot: staffCommerceSnapshot(card),
      displayCallSnapshot: staffCallSnapshot(card),
    };
  }
  const badges = [
    card.source === 'admin_transfer' ? { label: 'Team transfer', tone: 'info' as const } : null,
    card.source === 'stale_follow_up' ? { label: 'Scheduled follow-up', tone: 'warning' as const } : null,
    card.customerRisk === 'lost'
      ? { label: 'Critical customer risk', tone: 'danger' as const }
      : card.customerRisk === 'at_risk'
        ? { label: 'At-risk customer', tone: 'warning' as const }
        : null,
    card.unreached ? { label: 'Needs callback', tone: 'warning' as const } : null,
    card.source === 'segment_priority' ? { label: 'Customer portfolio', tone: 'info' as const } : null,
  ].filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  return {
    analysisStatus: 'not_applicable',
    displayTitle: staffDisplayText(card.title),
    displayReason: firstMeaningfulStaffText([card.summary, card.missedNote]),
    displayConcern: firstMeaningfulStaffText([card.customerRiskNote]),
    displayOutcome: '',
    displayActions: [],
    displayBadges: badges,
    displayCustomerSummary: staffCustomerSummary(card),
    displayCommerceSnapshot: staffCommerceSnapshot(card),
    displayCallSnapshot: staffCallSnapshot(card),
  };
}

export function personDailyCallItemDisplay(item: PersonDailyCallItemWithoutDisplay): PersonDailyCallItemDisplayFields {
  const concern = firstMeaningfulStaffText([
    item.customerRiskNote,
    item.latestCall?.summary,
    item.latestNote?.body,
  ]);
  const badges = [
    { label: staffDisplayText(item.segment.name), tone: 'info' as const },
    item.openRequestsCount > 0 ? { label: `${item.openRequestsCount} open customer request${item.openRequestsCount === 1 ? '' : 's'}`, tone: 'warning' as const } : null,
    item.customerRisk === 'lost' ? { label: 'Critical customer risk', tone: 'danger' as const } : null,
    item.customerRisk === 'at_risk' ? { label: 'At-risk customer', tone: 'warning' as const } : null,
    item.ordersCount > 0 ? { label: 'Has purchase history', tone: 'success' as const } : null,
    item.pinned ? { label: 'Pinned', tone: 'accent' as const } : null,
  ].filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  return {
    analysisStatus: 'not_applicable',
    displayTitle: staffDisplayText(item.customerName),
    displayReason: `Assigned customer list: ${staffDisplayText(item.segment.name)}.`,
    displayConcern: concern,
    displayOutcome: item.openRequestsCount > 0
      ? `${item.openRequestsCount} open customer request${item.openRequestsCount === 1 ? ' is' : 's are'} attached to this customer.`
      : '',
    displayActions: [],
    displayBadges: badges,
    displayCustomerSummary: [
      item.phone ? `Phone ${item.phone}` : 'No phone on file',
      item.email ? `Email ${item.email}` : null,
      staffFocusLabel(item.assignedAxis),
    ].filter((value): value is string => Boolean(value)).join(' - '),
    displayCommerceSnapshot: item.latestOrder
      ? `${item.latestOrder.orderNumber ?? item.latestOrder.id} - ${item.latestOrder.currency} ${money(item.latestOrder.totalPrice).toLocaleString()}`
      : item.ordersCount > 0
        ? `${item.ordersCount} orders - ${money(item.totalSpent).toLocaleString()} total`
        : 'No linked Shopify order yet.',
    displayCallSnapshot: item.latestCall
      ? `${relative(new Date(item.latestCall.at))} - ${staffDisplayText(item.latestCall.phone ?? item.latestCall.email ?? 'linked call')}`
      : item.callsCount > 0
        ? `${item.callsCount} calls linked to this customer`
        : 'No recent call activity attached yet.',
  };
}

function staffCustomerSummary(card: PersonQueueCardWithoutDisplay) {
  const parts = [
    card.phone ? `Phone ${card.phone}` : null,
    card.email ? `Email ${card.email}` : null,
    card.assignedMemberName ? `Assigned to ${card.assignedMemberName}` : null,
    staffFocusLabel(card.axis),
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' - ') : 'Customer details are not linked yet.';
}

function staffCommerceSnapshot(card: PersonQueueCardWithoutDisplay) {
  if (card.miniOrder) {
    return `${card.miniOrder.orderNumber ?? card.miniOrder.id} - ${card.miniOrder.currency} ${money(card.miniOrder.totalPrice).toLocaleString()}`;
  }
  if (card.ordersCount !== undefined && card.ordersCount > 0) {
    return `${card.ordersCount} orders - ${money(card.totalSpent ?? 0).toLocaleString()} total`;
  }
  return 'No linked Shopify order yet.';
}

function staffCallSnapshot(card: PersonQueueCardWithoutDisplay) {
  if (card.occurrenceCount > 1) {
    return `${card.occurrenceCount} related calls in this follow-up`;
  }
  if (card.performance30d) {
    return `${card.performance30d.calls} calls and ${card.performance30d.serviceRequests} follow-ups in 30 days`;
  }
  if (card.createdAt) return `Created ${relative(new Date(card.createdAt))}`;
  return 'No recent call activity attached yet.';
}

function firstMeaningfulStaffText(values: Array<unknown>) {
  return values
    .map((value) => staffDisplayText(value))
    .find((value) => value && !/^no explicit complaint/i.test(value) && !/^no customer complaint/i.test(value) && !/^no customer request/i.test(value))
    ?? '';
}

function staffDisplayText(value: unknown) {
  return staffBriefText(value, '');
}

function staffFocusLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'sales' || normalized === 'sale' || normalized.includes('purchase')) return 'Purchase intent';
  if (normalized === 'account') return 'Customer care';
  if (normalized === 'support') return 'Customer request';
  return titleize(staffBriefText(normalized, normalized));
}

function taskHeader(row: StaffWorkItemRow, metadata: Record<string, unknown>, callContext?: CardCallContext) {
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
  const sourceCall = row.sourceCallId ? callContext?.callsById.get(row.sourceCallId) : null;
  const phone = firstString(
    params.contactPhoneE164,
    params.customerPhone,
    params.phone,
    params.contactPhone,
    snapshotCustomer.phone,
    sourceCall?.contactPhoneE164,
    sourceCall?.contactPhone,
  );
  const email = firstString(
    params.customerEmail,
    params.email,
    params.contactEmail,
    snapshotCustomer.email,
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
    repeatCount ? `${repeatCount} follow-up${repeatCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return signals.join(' - ');
}

function customerRiskFromSignals(input: {
  churnRisk?: string | null;
  lastOrderAt?: Date | null;
  openRequestsCount?: number;
  repeatCount?: number;
}): { risk: PersonCustomerRisk; note: string | null } {
  const churnRisk = normalizeText(input.churnRisk);
  if (churnRisk === 'critical') return { risk: 'lost', note: 'Critical customer risk signal from the customer record.' };
  if (churnRisk === 'high') return { risk: 'at_risk', note: 'High customer risk signal from the customer record.' };
  if ((input.openRequestsCount ?? 0) > 0) return { risk: 'at_risk', note: 'Open customer request is waiting before outreach.' };
  if ((input.repeatCount ?? 0) >= 5) return { risk: 'at_risk', note: 'Multiple open follow-ups exist for this customer.' };
  if (input.lastOrderAt) {
    const daysSinceOrder = Math.floor((Date.now() - input.lastOrderAt.getTime()) / 86_400_000);
    if (daysSinceOrder >= 90) return { risk: 'at_risk', note: `No order in ${daysSinceOrder} days.` };
  }
  return { risk: 'none', note: null };
}

function followUpMissedNote(row: { status: string; createdAt: Date; dueAt?: Date | null }) {
  if (CLOSED.has(row.status)) return null;
  const now = Date.now();
  if (row.dueAt && row.dueAt.getTime() < now) return `Scheduled follow-up was due ${relative(row.dueAt)}.`;
  const ageHours = Math.floor((now - row.createdAt.getTime()) / 3_600_000);
  if (ageHours >= 24) return `Open follow-up has been waiting ${relative(row.createdAt)}.`;
  return null;
}

function isMissedFollowUp(card: PersonQueueCardDto, todayStart: Date) {
  if (card.missedNote) return true;
  if (!card.createdAt) return false;
  const createdAt = Date.parse(card.createdAt);
  return Number.isFinite(createdAt) && createdAt < todayStart.getTime() && card.urgencyScore >= 8;
}

function isCustomerRequestLike(row: { source: string; surface: string; axis: string | null; metadata: Prisma.JsonValue }) {
  const metadata = asRecord(row.metadata);
  const category = normalizeText(metadata.category);
  const source = normalizeText(row.source);
  const surface = normalizeText(row.surface);
  return source === 'customer_self_service'
    || source === 'admin_created'
    || (source === 'manual' && surface === 'customer_facing')
    || category === 'customer_request'
    || category === 'manual_customer_request';
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

function workflowBadgesFromMetadata(metadata: Record<string, unknown>) {
  const workflow = asRecord(metadata.workflow);
  const params = asRecord(workflow.params);
  const callIntent = stringOrNull(params.intent)
    ?? stringOrNull(params.callIntent)
    ?? stringOrNull(params.call_intent);
  const psychTags = uniqueStrings([
    ...stringArray(params.psychTags),
    ...stringArray(params.psych_tags),
    stringOrNull(params.tag),
    stringOrNull(params.psychTag),
    stringOrNull(params.psych_tag),
  ].filter((value): value is string => Boolean(value)));
  return { callIntent, psychTags };
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
  row: StaffWorkItemRow,
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
    resolverStatus: string | null;
    resolverModel: string | null;
    resolverOutput: Prisma.JsonValue | null;
    resolvedAt: Date | null;
    resolvedWithVersion: number | null;
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
    const resolver = call.resolverStatus === 'succeeded'
      ? trustedCurrentModelResolverOutput(call, TRANSCRIPT_RESOLVER_SCHEMA_VERSION)
      : null;
    entries.push({
      id: `aircall-${call.id}`,
      kind: 'aircall',
      title: `${titleize(call.eventType)} ${call.direction ?? 'call'}`.trim(),
      summary: resolver?.summary ?? call.transcriptRaw?.slice(0, 220) ?? call.status,
      at: call.eventTimestamp.toISOString(),
      meta: {
        durationSeconds: call.durationSeconds,
        status: call.status,
        intent: resolver?.call_intent ?? null,
        psychTags: resolver?.psych_tags ?? [],
      },
    });
  }

  for (const comment of row.comments) {
    entries.push({
      id: `note-${comment.id}`,
      kind: 'note',
      title: 'Follow-up note',
      summary: comment.body,
      at: comment.createdAt.toISOString(),
      meta: { actorType: comment.actorType, internal: comment.internal },
    });
  }

  for (const request of relatedRequests) {
    if (request.id === row.id) continue;
    const metadata = asRecord(request.metadata);
    if (metadata.personQueueVisible === false || metadata.workflowSuppressed === true) continue;
    const source = taskSource(request);
    const latest = latestComment(request);
    const titlePrefix = source === 'call_analysis'
      ? 'Call follow-up'
      : source === 'segment_priority'
        ? 'Customer priority'
        : 'Customer follow-up';
    entries.push({
      id: `request-${request.id}`,
      kind: 'task',
      title: staffDisplayText(`${titlePrefix}: ${request.title}`),
      summary: [
        `${titleize(request.status)} - ${titleize(request.priority)}`,
        latest?.body ? `Latest note: ${latest.body.slice(0, 180)}` : null,
      ].filter(Boolean).map((value) => staffDisplayText(value)).join(' - '),
      at: request.updatedAt.toISOString(),
      meta: {
        requestId: request.id,
        source,
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

function latestCallSummary(calls: Array<{
  eventTimestamp: Date;
  resolvedAt: Date | null;
  resolverStatus: string | null;
  resolverModel: string | null;
  resolverOutput: Prisma.JsonValue | null;
  resolvedWithVersion: number | null;
  transcriptRaw: string | null;
}>): PersonCallSummary | null {
  const trusted = calls
    .map((call) => ({
      call,
      output: call.resolverStatus === 'succeeded'
        ? trustedCurrentModelResolverOutput(call, TRANSCRIPT_RESOLVER_SCHEMA_VERSION)
        : null,
    }))
    .find((entry) => entry.output !== null);
  if (!trusted?.output) return null;
  const { call, output } = trusted;
  const tags = output.psych_tags;
  const shipping = output.shipping_signals;
  const payment = output.payment_signals;
  const products = output.product_mentions
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
    output.urgency_signal ? `Urgency ${output.urgency_signal}` : null,
  ]);
  return {
    communicationStyle: output.call_intent,
    decisionMakingStyle: output.urgency_signal,
    trustLevel: null,
    engagementLevel: null,
    winProbability: null,
    motivators: tags,
    objections,
    buyingSignals,
    hesitationSignals,
    talkTrack: output.summary,
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

function calendarDisplayFromRequest(
  row: { title: string; description: string | null; priority: string },
  brief: PersonTaskBrief | null,
) {
  if (brief?.modelUsed === 'unavailable') {
    return {
      analysisAvailable: false,
      displayReason: '',
      displayConcern: '',
      displayOutcome: '',
      displayActions: [],
      callExcerpt: staffDisplayText(brief.transcriptSnippet),
    };
  }
  const actions = cleanedActions(brief?.suggestedActions ?? []);
  return {
    analysisAvailable: brief ? true : null,
    displayReason: brief ? staffDisplayText(brief.whyCalling) : firstMeaningfulStaffText([row.description, row.title]),
    displayConcern: brief ? staffDisplayText(brief.upsetAbout) : '',
    displayOutcome: brief ? staffDisplayText(brief.callGoal) : '',
    displayActions: actions,
    callExcerpt: staffDisplayText(brief?.transcriptSnippet),
  };
}

function calendarDisplayFromCall(row: {
  transcriptRaw: string | null;
  resolverOutput: Prisma.JsonValue | null;
  resolverStatus: string | null;
  resolverModel: string | null;
  resolvedAt: Date | null;
  resolvedWithVersion: number | null;
  eventType: string;
  contactPhoneE164: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}) {
  const resolver = currentResolverOutput(row);
  if (!resolver) {
    return {
      analysisAvailable: false,
      displayReason: '',
      displayConcern: '',
      displayOutcome: '',
      displayActions: [],
      callExcerpt: staffDisplayText(row.transcriptRaw?.slice(0, 240)),
    };
  }
  const personBrief = resolver.person_brief;
  return {
    analysisAvailable: true,
    displayReason: staffDisplayText(personBrief.why_calling || resolver.summary),
    displayConcern: staffDisplayText(personBrief.upset_about || personBrief.issue),
    displayOutcome: staffDisplayText(personBrief.call_goal || personBrief.next_action),
    displayActions: cleanedActions(personBrief.suggested_actions),
    callExcerpt: staffDisplayText(personBrief.transcript_snippet || row.transcriptRaw?.slice(0, 240)),
  };
}

function currentResolverOutput(row: {
  resolverOutput: Prisma.JsonValue | null;
  resolverStatus: string | null;
  resolverModel: string | null;
  resolvedAt: Date | null;
  resolvedWithVersion: number | null;
}) {
  if (row.resolverStatus !== 'succeeded') return null;
  return trustedCurrentModelResolverOutput(row, TRANSCRIPT_RESOLVER_SCHEMA_VERSION);
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

const DAILY_OUTCOME_FILTERS = [
  'not_selected',
  'customer_reached',
  'no_answer',
  'voicemail',
  'callback_requested',
  'follow_up_scheduled',
  'quote_sent',
  'order_placed',
  'not_interested',
  'wrong_number',
  'do_not_call',
  'completed',
] as const;

function personDailyFilterCounts(cards: PersonQueueCardDto[]) {
  const counts: Record<string, number> = {
    all: cards.length,
    urgent: cards.filter((card) => card.urgencyScore >= 8).length,
    at_risk: cards.filter((card) => card.customerRisk === 'at_risk' || card.customerRisk === 'lost').length,
  };
  for (const disposition of DAILY_OUTCOME_FILTERS) {
    counts[disposition] = cards.filter((card) => personDailyFilterMatches(card, disposition)).length;
  }
  return counts;
}

function personDailyFilterMatches(card: PersonQueueCardDto, filter: PersonDailyOperationsQuery['filter']) {
  if (filter === 'all') return true;
  if (filter === 'urgent') return card.urgencyScore >= 8;
  if (filter === 'at_risk') return card.customerRisk === 'at_risk' || card.customerRisk === 'lost';
  const disposition = card.currentDisposition ?? (card.outcomeRequired ? 'not_selected' : null);
  return disposition === filter;
}

function effectiveWorkDisposition(row: { currentDisposition: string | null; queueLocation: string }) {
  return row.currentDisposition ?? (row.queueLocation === 'follow_up' ? 'not_selected' : null);
}

function sortArchivedCards(
  left: PersonQueueCardDto,
  right: PersonQueueCardDto,
  sort: PersonDailyOperationsQuery['sort'],
) {
  const leftTime = Date.parse(left.archivedAt ?? left.createdAt ?? '') || 0;
  const rightTime = Date.parse(right.archivedAt ?? right.createdAt ?? '') || 0;
  const compared = rightTime - leftTime;
  return (sort === 'oldest' ? -compared : compared) || sortByUrgency(left, right);
}

function workDisplayTimestamp(row: {
  createdAt: Date;
  sourceOccurredAt?: Date | null;
  visibleAfter?: Date | null;
  queueLocation?: string | null;
}) {
  if (row.queueLocation === 'scheduled' && row.visibleAfter) return row.visibleAfter;
  return row.sourceOccurredAt ?? row.createdAt;
}

function sortByPersonStrategy(strategy: AlgorithmStrategyDefinition, left: PersonQueueCardDto, right: PersonQueueCardDto) {
  const leftSignals = personCardStrategySignals(left);
  const rightSignals = personCardStrategySignals(right);
  const leftScore = personStrategyScore(strategy, leftSignals);
  const rightScore = personStrategyScore(strategy, rightSignals);
  const sortRules = strategy.sort.length ? strategy.sort : [{ field: 'urgencyScore', direction: 'desc' as const, nulls: 'last' as const }];
  for (const rule of sortRules) {
    const leftValue = rule.field === 'urgencyScore' ? leftScore : strategyComparable(leftSignals[rule.field]);
    const rightValue = rule.field === 'urgencyScore' ? rightScore : strategyComparable(rightSignals[rule.field]);
    const compared = compareStrategyValue(leftValue, rightValue, rule.nulls);
    if (compared !== 0) return rule.direction === 'desc' ? -compared : compared;
  }
  return 0;
}

function personStrategyVisible(strategy: AlgorithmStrategyDefinition, signals: Record<string, unknown>) {
  if (strategy.visibility.hideWhen.some((condition) => personConditionMatches(condition, signals))) return false;
  if (strategy.visibility.mode === 'hide_by_default') {
    if (!strategy.visibility.showWhen.some((condition) => personConditionMatches(condition, signals))) return false;
  }
  const waitingHours = numberSignal(signals.waitingHours);
  if (strategy.cooldown.reappearAfterHours !== undefined && waitingHours < strategy.cooldown.reappearAfterHours) return false;
  if (strategy.cooldown.archiveAfterDays !== undefined && waitingHours > strategy.cooldown.archiveAfterDays * 24) return false;
  return true;
}

function personStrategyScore(strategy: AlgorithmStrategyDefinition, signals: Record<string, unknown>) {
  let score = numberSignal(signals.urgencyScore);
  for (const [key, weight] of Object.entries(strategy.weights)) {
    score += numberSignal(signals[key]) * weight;
  }
  for (const condition of strategy.conditions) {
    if (personConditionMatches(condition, signals)) score += condition.weight ?? 1;
  }
  return Math.round(score * 10) / 10;
}

function personCardStrategySignals(card: PersonQueueCardDto | PersonQueueCardInternal): Record<string, unknown> {
  const createdAtMs = card.createdAt ? Date.parse(card.createdAt) : 0;
  const waitingHours = createdAtMs > 0 ? Math.max(0, (Date.now() - createdAtMs) / 3_600_000) : 0;
  const openTasksCount = card.performance30d?.serviceRequests ?? 0;
  const latestOrderValue = card.miniOrder?.totalPrice ?? 0;
  const ordersCount = card.ordersCount ?? 0;
  const totalSpent = card.totalSpent ?? 0;
  const hasOpenTask = !CLOSED.has(card.columnId);
  const isCallSource = card.source === 'call_analysis' || Boolean(card.callIntent);
  const resolver = 'resolverOutput' in card ? card.resolverOutput : null;
  const operationalIntents = new Set(resolver?.operational_signals.map((signal) => signal.intent) ?? []);
  const psychTags = new Set(card.psychTags ?? []);
  const complaint = Boolean(
    resolver?.shipping_signals.complaint
    || resolver?.payment_signals.complaint
    || resolver?.customer_issue.detected
    || resolver?.customer_mood.label === 'angry'
    || resolver?.customer_mood.label === 'frustrated'
    || psychTags.has('complaint'),
  );
  const refundOrPaymentIssue = Boolean(resolver?.payment_signals.refund_asked || resolver?.payment_signals.complaint);
  const shippingIssue = Boolean(
    resolver?.shipping_signals.complaint
    || resolver?.shipping_signals.tracking_asked
    || resolver?.shipping_signals.address_mentioned,
  );
  const purchaseIntent = card.callIntent === 'sale'
    || operationalIntents.has('heat_press_machine_purchase_intent')
    || operationalIntents.has('spare_part_purchase_intent')
    || operationalIntents.has('heat_press_purchase_intent')
    || operationalIntents.has('dtf_supply_reorder_signal')
    || operationalIntents.has('quote_request')
    || operationalIntents.has('machine_upgrade_interest')
    || operationalIntents.has('existing_customer_expansion_signal');
  return {
    createdAt: card.createdAt ?? null,
    updatedAt: card.createdAt ?? null,
    urgencyScore: card.urgencyScore,
    repeatCount: card.urgencyBreakdown.repeatCount,
    customerName: card.title,
    intent: card.callIntent ?? card.axis ?? card.source,
    callIntent: card.callIntent ?? null,
    psychTags: Array.from(psychTags).join(','),
    priority: card.priority,
    source: card.source,
    axis: card.axis,
    status: card.columnId,
    segmentPriority: card.segmentPriority ?? 0,
    ordersCount,
    totalSpent,
    openTasksCount,
    openRequestsCount: card.performance30d?.serviceRequests ?? 0,
    latestOrderValue,
    lastOrderValue: latestOrderValue,
    lastOrderAt: card.miniOrder?.processedAt ?? null,
    lastCallAt: isCallSource ? card.createdAt ?? null : null,
    latestNoteAt: null,
    purchaseIntent,
    refundOrPaymentIssue,
    shippingIssue,
    complaint,
    customerMatched: Boolean(card.customerId),
    hasOpenTask,
    callNow: Boolean(resolver?.next_action.required && resolver.next_action.owner === 'staff') || isCallSource,
    noteFirst: true,
    scheduleFirst: Boolean(resolver?.promise.made && resolver.promise.due_hint),
    emailFirst: false,
    reviewOrderFirst: Boolean(card.miniOrder) || ordersCount > 0,
    complaintTone: complaint,
    refundRisk: refundOrPaymentIssue,
    shippingConcern: shippingIssue,
    customerHistory: ordersCount > 0 || totalSpent > 0,
    productSpecificity: Boolean(resolver?.product_mentions.length),
    openTaskPenalty: hasOpenTask,
    unmatchedCustomerPenalty: !card.customerId,
    recentCallBoost: isCallSource && waitingHours <= 168,
    olderThanSevenDaysPenalty: waitingHours > 168,
    lastCallRecency: isCallSource ? Math.round((waitingHours / 24) * 10) / 10 : 0,
    openFollowUp: openTasksCount > 0,
    notesSignal: false,
    waitingHours,
  };
}

const STAFF_CTA_ALLOWLIST = [
  'call',
  'note',
  'schedule',
  'email',
  'customer_detail',
  'archive',
  'transfer',
  'done',
  'snooze',
  'more',
  'pin',
] as const;

const STAFF_MODAL_ACTION_ALLOWLIST = [
  'call_customer',
  'confirm_need',
  'capture_outcome',
  'check_order',
  'schedule_follow_up',
  'add_note',
  'review_context',
  'review_shopify_orders',
  'open_customer_history',
  'ask_specific_question',
  'state_reason',
  'confirm_next_step',
  'save_outcome',
  'archive_if_not_needed',
] as const;

function personCardWithStrategies(card: PersonQueueCardInternal, strategies: PersonCardStrategyRuntime): PersonQueueCardInternal {
  const signals = personCardStrategySignals(card);
  const nextActionProof = personStrategyRuntimeProof(strategies.nextAction, signals, 'cta');
  const callBriefProof = personStrategyRuntimeProof(strategies.callBrief, signals, 'modal');
  const ctaPriority = uniqueAllowedStrings(nextActionProof.ctaPriority, STAFF_CTA_ALLOWLIST);
  const modalActionOrder = uniqueAllowedStrings(callBriefProof.modalActionOrder, STAFF_MODAL_ACTION_ALLOWLIST);
  const strategyProof = {
    nextAction: { ...nextActionProof, ctaPriority },
    callBrief: { ...callBriefProof, modalActionOrder },
  };
  const nextCard = {
    ...card,
    ctaPriority,
    modalActionOrder,
    strategyProof,
  };
  return { ...nextCard, ...personCardDisplay(nextCard) };
}

function personStrategyRuntimeProof(
  strategy: AlgorithmStrategyDefinition,
  signals: Record<string, unknown>,
  mode: 'cta' | 'modal',
) {
  const score = personStrategyScore(strategy, signals);
  const band = strategy.scoreBands.find((entry) => score >= entry.min && score <= entry.max) ?? null;
  return {
    surfaceId: strategy.surfaceId,
    score,
    bandId: band?.id ?? null,
    bandLabel: band?.label ?? null,
    tone: band?.tone ?? null,
    ctaPriority: mode === 'cta' ? strategy.ctaPriority : [],
    modalActionOrder: mode === 'modal' ? strategy.modalActionOrder : [],
  };
}

function uniqueAllowedStrings(values: string[], allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value).trim();
    if (!normalized || !allowedSet.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function personConditionMatches(condition: AlgorithmStrategyDefinition['conditions'][number], signals: Record<string, unknown>) {
  const actual = signals[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'not_exists': return actual === undefined || actual === null || actual === '';
    case '=': return String(actual).toLowerCase() === String(expected).toLowerCase();
    case '!=': return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case '>': return numberSignal(actual) > numberSignal(expected);
    case '>=': return numberSignal(actual) >= numberSignal(expected);
    case '<': return numberSignal(actual) < numberSignal(expected);
    case '<=': return numberSignal(actual) <= numberSignal(expected);
    case 'contains': return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'in': return Array.isArray(expected) && expected.map((entry) => String(entry).toLowerCase()).includes(String(actual).toLowerCase());
    case 'not_in': return Array.isArray(expected) && !expected.map((entry) => String(entry).toLowerCase()).includes(String(actual).toLowerCase());
    default: return false;
  }
}

function strategyComparable(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate) && /[-:TZ]/.test(value)) return asDate;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value.toLowerCase();
  }
  return null;
}

function compareStrategyValue(left: string | number | null, right: string | number | null, nulls: 'first' | 'last') {
  if (left === null && right === null) return 0;
  if (left === null) return nulls === 'first' ? -1 : 1;
  if (right === null) return nulls === 'first' ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function numberSignal(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    return 1;
  }
  return 0;
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
