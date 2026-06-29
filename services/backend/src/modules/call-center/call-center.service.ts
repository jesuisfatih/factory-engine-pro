import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CallCenterActionResult,
  CallCenterCreateCustomerTaskInput,
  CallCenterCalendarEvent,
  CallCenterMember,
  CallCenterMessage,
  CallCenterNote,
  CallCenterOverview,
  CallCenterPin,
  CallCenterPriorityGroup,
  CallCenterSaveCustomerNoteInput,
  CallCenterTask,
  CallCenterTransferTaskInput,
  CustomerDetailPanelDto,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { CustomersService } from '../customers/customers.service.js';

const CLOSED = new Set(['closed', 'resolved', 'cancelled']);
const DAILY_AXES = ['sales', 'account'];
const MESSAGE_THREAD_KIND = 'message_thread';
const NOTE_KIND = 'note';

@Injectable()
export class CallCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly customers: CustomersService,
    private readonly logger: AppLogger,
  ) {}

  async overview(): Promise<CallCenterOverview> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = daysAgo(now, 7);
    const members = await this.members();
    const memberById = new Map(members.map((member) => [member.id, member]));
    const memberByAircallId = await this.memberAircallMap(memberById);

    const [
      dailyCallList,
      priorityGroups,
      pinBoard,
      calendar,
      notes,
      messages,
      sentMail,
      recentCalls,
      callStats,
      taskActivity,
      activeRuleFire,
    ] = await Promise.all([
      this.dailyCallList(weekStart, memberById),
      this.priorityGroups(memberById),
      this.pinBoard(memberById),
      this.calendar(memberById),
      this.notes(memberById),
      this.messages(memberById),
      this.sentMail(todayStart, weekStart),
      this.recentCalls(memberByAircallId),
      this.callStats(todayStart, memberByAircallId),
      this.taskActivity(memberById),
      this.activeRuleFire(weekStart),
    ]);

    return {
      generatedAt: now.toISOString(),
      members,
      preview: {
        latestMessages: messages.slice(0, 5),
        sentMail,
        recentCalls,
        callStats,
        taskActivity,
        activeRuleFire,
      },
      kanban: {
        dailyCallList,
        priorityGroups,
        pinBoard,
      },
      calendar,
      notes,
      messages,
    };
  }

  async customerDetail(id: string): Promise<CustomerDetailPanelDto> {
    return this.customers.detail(id);
  }

  async saveCustomerNote(id: string, input: CallCenterSaveCustomerNoteInput): Promise<CustomerDetailPanelDto> {
    const actor = await this.currentMember();
    const customer = await this.prisma.db.customer.findFirst({ where: { id }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        customerId: id,
        source: 'manual',
        surface: 'internal',
        title: `Admin note - ${memberName(actor)}`,
        description: input.body,
        status: 'closed',
        priority: 'low',
        createdByActorId: actor.id,
        metadata: {
          personWorkspaceKind: 'note',
          noteKind: 'customer',
          linkedCustomer: id,
          category: 'admin_customer_note',
          createdByMemberId: actor.id,
          createdByMemberEmail: actor.email,
          createdByMemberName: memberName(actor),
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log('call_center', 'customer.note.create', 'Admin Call Center customer note saved', {
      customer_id: id,
      member_id: actor.id,
    });
    return this.customers.detail(id);
  }

  async transferTask(id: string, input: CallCenterTransferTaskInput): Promise<CallCenterActionResult> {
    const actor = await this.currentMember();
    const row = await this.prisma.db.serviceRequest.findFirst({
      where: { id },
      include: { assignedMember: true, customer: true },
    });
    if (!row) throw new NotFoundException('Task not found');
    if (CLOSED.has(row.status)) throw new BadRequestException('Closed or resolved tasks cannot be transferred');
    const target = await this.requireActiveMember(input.targetMemberId);
    const toAxis = input.targetAxis ?? row.axis ?? 'sales';
    const tenantId = this.tenantId();
    const transferredAt = new Date();
    const metadata = record(row.metadata);
    const history = Array.isArray(metadata.transferHistory) ? metadata.transferHistory : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequest.updateMany({
        where: { id: row.id, tenantId },
        data: {
          assignedMemberId: target.id,
          axis: toAxis,
          metadata: {
            ...metadata,
            adminTransferredAt: transferredAt.toISOString(),
            adminTransferredByMemberId: actor.id,
            previousAssignedMemberId: row.assignedMemberId,
            previousAxis: row.axis,
            transferReason: input.reason,
            transferHistory: [
              ...history,
              {
                at: transferredAt.toISOString(),
                actorMemberId: actor.id,
                fromMemberId: row.assignedMemberId,
                toMemberId: target.id,
                fromAxis: row.axis,
                toAxis,
                reason: input.reason,
                source: 'admin_call_center',
              },
            ].slice(-25),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.serviceRequestComment.create({
        data: {
          id: prefixedId('srcm'),
          tenantId,
          serviceRequestId: row.id,
          actorId: actor.id,
          actorType: 'member',
          body: `Admin transferred task to ${memberName(target)} (${row.axis ?? 'unassigned'} -> ${toAxis}). Reason: ${input.reason}`,
          internal: true,
          attachmentsJson: [{
            kind: 'admin_call_center_task_transfer',
            fromMemberId: row.assignedMemberId,
            toMemberId: target.id,
            fromAxis: row.axis,
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
            source: 'admin_call_center_transfer',
          },
          update: { source: 'admin_call_center_transfer' },
        });
      }
    });

    this.logger.log('call_center', 'task.transfer', 'Admin Call Center task transferred', {
      service_request_id: row.id,
      customer_id: row.customerId,
      target_member_id: target.id,
      axis: toAxis,
    });

    return {
      ok: true,
      serviceRequestId: row.id,
      customerId: row.customerId,
      assignedMemberId: target.id,
      assignedMemberName: memberName(target),
      axis: toAxis,
    };
  }

  async createCustomerTask(id: string, input: CallCenterCreateCustomerTaskInput): Promise<CallCenterActionResult> {
    const actor = await this.currentMember();
    const [customer, target] = await Promise.all([
      this.prisma.db.customer.findFirst({ where: { id } }),
      this.requireActiveMember(input.targetMemberId),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');
    const tenantId = this.tenantId();
    const customerLabel = customerName(customer);
    const created = await this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId,
        customerId: customer.id,
        assignedMemberId: target.id,
        axis: input.targetAxis,
        source: 'admin_created',
        surface: 'internal',
        title: `${customerLabel} follow-up`,
        description: input.note,
        status: 'open',
        priority: input.priority,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdByActorId: actor.id,
        metadata: {
          category: 'admin_customer_transfer',
          personQueueVisible: true,
          customerName: customerLabel,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          transferredByMemberId: actor.id,
          transferredAt: new Date().toISOString(),
          adminNote: input.note,
        } as Prisma.InputJsonValue,
        conditionTrace: [] as Prisma.InputJsonValue,
        taskStateSnapshot: {
          customer: {
            id: customer.id,
            name: customerLabel,
            email: customer.email,
            phone: customer.phone,
            ordersCount: customer.ordersCount,
            totalSpent: Number(customer.totalSpent ?? 0),
          },
        } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
        tenantId,
        serviceRequestId: created.id,
        actorId: actor.id,
        actorType: 'member',
        body: `Admin created customer follow-up for ${memberName(target)}: ${input.note}`,
        internal: true,
        attachmentsJson: [{
          kind: 'admin_call_center_customer_task',
          customerId: customer.id,
          targetMemberId: target.id,
          targetAxis: input.targetAxis,
        }] as Prisma.InputJsonValue,
      },
    });
    this.logger.log('call_center', 'customer.task.create', 'Admin Call Center customer task created', {
      service_request_id: created.id,
      customer_id: customer.id,
      target_member_id: target.id,
      axis: input.targetAxis,
    });
    return {
      ok: true,
      serviceRequestId: created.id,
      customerId: customer.id,
      assignedMemberId: target.id,
      assignedMemberName: memberName(target),
      axis: input.targetAxis,
    };
  }

  private async members(): Promise<CallCenterMember[]> {
    const rows = await this.prisma.db.member.findMany({
      where: { status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });
    return rows.map((member) => ({
      id: member.id,
      name: memberName(member),
      email: member.email,
      role: member.roleAssignments[0]?.role.name ?? 'Member',
      status: member.status,
    }));
  }

  private async currentMember() {
    const context = this.tenantContext.require();
    if (context.principalType !== 'member' || !context.principalId) {
      throw new BadRequestException('Admin Call Center requires a member session');
    }
    const member = await this.prisma.db.member.findFirst({ where: { id: context.principalId, status: 'active' } });
    if (!member) throw new BadRequestException('Member session is no longer active');
    return member;
  }

  private async requireActiveMember(id: string) {
    const member = await this.prisma.db.member.findFirst({ where: { id, status: 'active' } });
    if (!member) throw new NotFoundException('Target member not found');
    return member;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }

  private async memberAircallMap(memberById: Map<string, CallCenterMember>) {
    const rows = await this.prisma.db.member.findMany({
      where: { status: 'active', aircallUserId: { not: null } },
      select: { id: true, aircallUserId: true },
    });
    const map = new Map<string, CallCenterMember>();
    for (const row of rows) {
      if (!row.aircallUserId) continue;
      const member = memberById.get(row.id);
      if (member) map.set(row.aircallUserId, member);
    }
    const explicitMaps = await this.prisma.db.aircallMemberMap.findMany({
      select: { memberId: true, aircallUserId: true },
      take: 500,
    });
    for (const row of explicitMaps) {
      const member = memberById.get(row.memberId);
      if (member) map.set(row.aircallUserId, member);
    }
    return map;
  }

  private async dailyCallList(start: Date, memberById: Map<string, CallCenterMember>): Promise<CallCenterTask[]> {
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: {
        status: { notIn: Array.from(CLOSED) },
        axis: { in: DAILY_AXES },
        createdAt: { gte: start },
        assignedMemberId: { not: null },
        OR: [
          { sourceCallId: { not: null } },
          { sourceEmailId: { not: null } },
          { matchedRuleId: { not: null } },
          { metadata: { path: ['workflow'], not: Prisma.JsonNull } },
        ],
      },
      include: { customer: true, assignedMember: { include: { roleAssignments: { include: { role: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });
    return rows
      .filter((row) => !isInternalWorkspaceRow(row.metadata))
      .map((row) => this.task(row, memberById));
  }

  private async priorityGroups(memberById: Map<string, CallCenterMember>): Promise<CallCenterPriorityGroup[]> {
    const ownerships = await this.prisma.db.segmentOwnership.findMany({
      include: {
        member: { include: { roleAssignments: { include: { role: true } } } },
        segment: true,
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 80,
    });
    const groups: CallCenterPriorityGroup[] = [];
    for (const ownership of ownerships) {
      const member = memberById.get(ownership.memberId) ?? {
        id: ownership.memberId,
        name: memberName(ownership.member),
        email: ownership.member.email,
        role: ownership.member.roleAssignments[0]?.role.name ?? 'Member',
        status: ownership.member.status,
      };
      const [count, memberships] = await Promise.all([
        this.prisma.db.segmentCustomerMembership.count({ where: { segmentId: ownership.segmentId } }),
        this.prisma.db.segmentCustomerMembership.findMany({
          where: { segmentId: ownership.segmentId },
          include: { customer: true },
          orderBy: [{ matchedAt: 'desc' }],
          take: ownership.dailyCap ?? 25,
        }),
      ]);
      groups.push({
        segmentId: ownership.segmentId,
        segmentName: ownership.segment.name,
        segmentColor: ownership.segment.color,
        ownerMemberId: member.id,
        ownerName: member.name,
        ownerRole: member.role,
        customerCount: count,
        customers: memberships.map((membership) => ({
          id: membership.id,
          customerId: membership.customerId,
          customerName: customerName(membership.customer),
          email: membership.customer.email,
          phone: membership.customer.phone,
          ordersCount: membership.customer.ordersCount,
          totalSpent: Number(membership.customer.totalSpent ?? 0),
          lastOrderAt: membership.customer.lastOrderAt?.toISOString() ?? null,
          reason: `${ownership.segment.name} customer assigned to ${member.name}`,
        })),
      });
    }
    return groups;
  }

  private async pinBoard(memberById: Map<string, CallCenterMember>): Promise<CallCenterPin[]> {
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: { status: { notIn: Array.from(CLOSED) } },
      include: { customer: true, assignedMember: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 400,
    });
    const pins: CallCenterPin[] = [];
    for (const row of rows) {
      const metadata = record(row.metadata);
      const pinnedBy = record(metadata.personPinnedBy);
      for (const [memberId, value] of Object.entries(pinnedBy)) {
        const owner = memberById.get(memberId) ?? anonymousMember(memberId);
        pins.push({
          id: `${row.id}:${memberId}`,
          serviceRequestId: row.id,
          customerId: row.customerId,
          title: row.title,
          ownerMemberId: owner.id,
          ownerName: owner.name,
          ownerRole: owner.role,
          customerName: row.customer ? customerName(row.customer) : null,
          kind: metadata.category === 'customer_pin' ? 'customer' : 'task',
          pinnedAt: typeof value === 'string' ? value : typeof value === 'number' ? new Date(value).toISOString() : null,
        });
      }
    }
    return pins.sort((a, b) => String(b.pinnedAt ?? '').localeCompare(String(a.pinnedAt ?? ''))).slice(0, 60);
  }

  private async calendar(memberById: Map<string, CallCenterMember>): Promise<CallCenterCalendarEvent[]> {
    const since = daysAgo(new Date(), 14);
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: {
        OR: [{ dueAt: { not: null } }, { sourceCallId: { not: null } }],
        updatedAt: { gte: since },
      },
      include: { customer: true, assignedMember: true },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => {
      const date = row.dueAt ?? row.updatedAt;
      const member = row.assignedMemberId ? memberById.get(row.assignedMemberId) : null;
      return {
        id: row.id,
        title: row.title,
        customerName: row.customer ? customerName(row.customer) : null,
        memberId: row.assignedMemberId,
        memberName: member?.name ?? (row.assignedMember ? memberName(row.assignedMember) : 'Unassigned'),
        memberRole: member?.role ?? 'Unassigned',
        dayIso: date.toISOString().slice(0, 10),
        startHour: date.getHours(),
        durationMinutes: row.sourceCallId ? 15 : 30,
        kind: row.sourceCallId ? 'call' : 'task',
      };
    });
  }

  private async notes(memberById: Map<string, CallCenterMember>): Promise<CallCenterNote[]> {
    const noteRows = await this.prisma.db.serviceRequest.findMany({
      where: { metadata: { path: ['personWorkspaceKind'], equals: NOTE_KIND } },
      include: { customer: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
    const commentRows = await this.prisma.db.serviceRequestComment.findMany({
      where: {
        internal: true,
        serviceRequest: { metadata: { path: ['personWorkspaceKind'], not: MESSAGE_THREAD_KIND } },
      },
      include: { serviceRequest: { include: { customer: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return [
      ...noteRows.map((row) => {
        const author = row.createdByActorId ? memberById.get(row.createdByActorId) : null;
        return {
          id: row.id,
          taskId: row.id,
          customerId: row.customerId,
          customerName: row.customer ? customerName(row.customer) : nullableString(record(row.metadata).linkedCustomer),
          authorId: row.createdByActorId,
          authorName: author?.name ?? 'Unknown member',
          authorRole: author?.role ?? 'Member',
          body: row.description ?? row.title,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      ...commentRows.map((comment) => {
        const author = comment.actorId ? memberById.get(comment.actorId) : null;
        return {
          id: comment.id,
          taskId: comment.serviceRequestId,
          customerId: comment.serviceRequest.customerId,
          customerName: comment.serviceRequest.customer ? customerName(comment.serviceRequest.customer) : null,
          authorId: comment.actorId,
          authorName: author?.name ?? 'Unknown member',
          authorRole: author?.role ?? 'Member',
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
        };
      }),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 150);
  }

  private async messages(memberById: Map<string, CallCenterMember>): Promise<CallCenterMessage[]> {
    const threads = await this.prisma.db.serviceRequest.findMany({
      where: { metadata: { path: ['personWorkspaceKind'], equals: MESSAGE_THREAD_KIND } },
      include: { comments: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
    const messages: CallCenterMessage[] = [];
    for (const thread of threads) {
      const participantIds = stringArray(record(thread.metadata).participantIds);
      for (const comment of thread.comments) {
        const author = comment.actorId ? memberById.get(comment.actorId) : null;
        const recipientId = participantIds.find((id) => id !== comment.actorId) ?? null;
        const recipient = recipientId ? memberById.get(recipientId) : null;
        messages.push({
          id: comment.id,
          threadId: thread.id,
          fromMemberId: comment.actorId,
          fromName: author?.name ?? 'Unknown member',
          fromRole: author?.role ?? 'Member',
          toName: recipient?.name ?? null,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
        });
      }
    }
    return messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  }

  private async sentMail(todayStart: Date, weekStart: Date) {
    const [today, week, last] = await Promise.all([
      this.prisma.db.mailDelivery.count({ where: { status: 'sent', sentAt: { gte: todayStart } } }),
      this.prisma.db.mailDelivery.count({ where: { status: 'sent', sentAt: { gte: weekStart } } }),
      this.prisma.db.mailDelivery.findFirst({ where: { status: 'sent' }, orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }] }),
    ]);
    return { today, week, lastSentAt: last?.sentAt?.toISOString() ?? last?.updatedAt.toISOString() ?? null };
  }

  private async recentCalls(memberByAircallId: Map<string, CallCenterMember>) {
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      orderBy: [{ eventTimestamp: 'desc' }],
      take: 12,
    });
    return rows.map((row) => {
      const member = row.aircallUserId ? memberByAircallId.get(row.aircallUserId) : null;
      return {
        id: row.id,
        customer: row.contactEmail ?? row.contactPhoneE164 ?? row.contactPhone ?? row.externalCallId,
        phone: row.contactPhoneE164 ?? row.contactPhone,
        memberName: member?.name ?? 'Unmapped operator',
        memberRole: member?.role ?? 'Aircall',
        at: row.eventTimestamp.toISOString(),
      };
    });
  }

  private async callStats(todayStart: Date, memberByAircallId: Map<string, CallCenterMember>) {
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      where: { eventTimestamp: { gte: todayStart } },
      select: { id: true, aircallUserId: true, durationSeconds: true, status: true },
      take: 2000,
    });
    const answered = rows.filter((row) => (row.durationSeconds ?? 0) > 0 || normalize(row.status).includes('answered')).length;
    const counts = new Map<string, { member: CallCenterMember; count: number }>();
    for (const row of rows) {
      const member = row.aircallUserId ? memberByAircallId.get(row.aircallUserId) : null;
      if (!member) continue;
      counts.set(member.id, { member, count: (counts.get(member.id)?.count ?? 0) + 1 });
    }
    return {
      todayTotal: rows.length,
      answeredRate: rows.length ? Math.round((answered / rows.length) * 100) : 0,
      byMember: Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .map(({ member, count }) => ({ memberId: member.id, memberName: member.name, count })),
    };
  }

  private async taskActivity(memberById: Map<string, CallCenterMember>) {
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: { assignedMemberId: { not: null } },
      include: { assignedMember: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 10,
    });
    return rows.map((row) => {
      const member = row.assignedMemberId ? memberById.get(row.assignedMemberId) : null;
      return {
        id: row.id,
        title: row.title,
        memberName: member?.name ?? (row.assignedMember ? memberName(row.assignedMember) : 'Unassigned'),
        memberRole: member?.role ?? 'Member',
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  private async activeRuleFire(start: Date) {
    const executions = await this.prisma.db.workflowRuleExecution.findMany({
      where: { updatedAt: { gte: start } },
      include: { rule: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 1000,
    });
    const byRule = new Map<string, { ruleId: string; ruleName: string; fires: number; matches: number; lastFiredAt: string | null }>();
    for (const execution of executions) {
      const current = byRule.get(execution.ruleId) ?? {
        ruleId: execution.ruleId,
        ruleName: execution.rule.name,
        fires: 0,
        matches: 0,
        lastFiredAt: null,
      };
      current.fires += 1;
      if (execution.taskIds.length > 0 || normalize(execution.status).includes('match') || normalize(execution.status).includes('success')) {
        current.matches += 1;
      }
      if (!current.lastFiredAt || execution.updatedAt.toISOString() > current.lastFiredAt) {
        current.lastFiredAt = execution.updatedAt.toISOString();
      }
      byRule.set(execution.ruleId, current);
    }
    return Array.from(byRule.values()).sort((a, b) => b.fires - a.fires).slice(0, 10);
  }

  private task(row: ServiceRequestWithRelations, memberById: Map<string, CallCenterMember>): CallCenterTask {
    const metadata = record(row.metadata);
    const member = row.assignedMemberId ? memberById.get(row.assignedMemberId) : null;
    return {
      id: row.id,
      title: taskTitle(row),
      summary: `${ticketNumber(row)} - ${titleize(row.status)} - ${relative(row.updatedAt)}`,
      customerId: row.customerId,
      customerName: row.customer ? customerName(row.customer) : null,
      customerEmail: row.customer?.email ?? null,
      customerPhone: row.customer?.phone ?? null,
      assignedMemberId: row.assignedMemberId,
      assignedMemberName: member?.name ?? (row.assignedMember ? memberName(row.assignedMember) : 'Unassigned'),
      assignedMemberRole: member?.role ?? row.assignedMember?.roleAssignments[0]?.role.name ?? 'Member',
      axis: row.axis,
      status: row.status,
      priority: row.priority,
      source: taskSourceLabel(row),
      segment: taskCategoryLabel(metadata.category ?? row.surface),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

type ServiceRequestWithRelations = Prisma.ServiceRequestGetPayload<{
  include: {
    customer: true;
    assignedMember: { include: { roleAssignments: { include: { role: true } } } };
  };
}>;

function memberName(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName} ${member.lastName}`.trim() || member.email;
}

function customerName(customer: { companyName: string; firstName?: string | null; lastName?: string | null; email?: string | null }) {
  return customer.companyName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.email || 'Customer';
}

function taskTitle(row: { customer?: { companyName: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null } | null; title: string }) {
  if (row.customer) return customerName(row.customer);
  return row.title;
}

function ticketNumber(row: { id: string; metadata: Prisma.JsonValue }) {
  return String(record(row.metadata).ticketNumber || `SR-${row.id.slice(-8).toUpperCase()}`);
}

function taskSourceLabel(row: { source: string; sourceCallId?: string | null; sourceEmailId?: string | null; matchedRuleId?: string | null; metadata: Prisma.JsonValue }) {
  const metadata = record(row.metadata);
  const workflow = record(metadata.workflow);
  if (row.sourceCallId || String(workflow.trigger ?? '').startsWith('aircall.')) return 'call_analysis';
  if (metadata.aiSource === 'segment') return 'segment_priority';
  if (row.matchedRuleId || workflow.ruleId || workflow.matchedRuleId) return 'workflow';
  if (row.sourceEmailId) return 'email';
  return row.source;
}

function taskCategoryLabel(value: unknown) {
  const key = normalize(value);
  if (key === 'workflow_rule' || key === 'workflow') return 'Call analysis';
  if (key === 'call' || key === 'aircall') return 'Call';
  if (key === 'support') return 'Customer request';
  return value ? titleize(String(value)) : 'Customer request';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isInternalWorkspaceRow(value: unknown) {
  const kind = record(value).personWorkspaceKind;
  return kind === MESSAGE_THREAD_KIND || kind === NOTE_KIND;
}

function anonymousMember(id: string): CallCenterMember {
  return { id, name: 'Unknown member', email: '', role: 'Member', status: 'unknown' };
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysAgo(value: Date, days: number) {
  return new Date(value.getTime() - days * 86_400_000);
}

function titleize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function relative(value: Date) {
  const diff = Date.now() - value.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
