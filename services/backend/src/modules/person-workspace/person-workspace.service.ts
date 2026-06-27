import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreatePersonRequestInput,
  MovePersonQueueCardInput,
  PersonQueueColumn,
  SavePersonNoteInput,
  SendPersonMessageInput,
  TogglePersonQueuePinInput,
} from '@factory-engine-pro/contracts';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

const CLOSED = new Set(['closed', 'resolved', 'transferred']);
const COLUMN_STATUS: Record<PersonQueueColumn, string> = {
  unassigned: 'open',
  in_progress: 'in_progress',
  positive: 'pending_resolve',
  closed: 'closed',
};
const PRIORITY_SCORE: Record<string, number> = {
  critical: 9,
  urgent: 9,
  high: 7,
  medium: 5,
  low: 3,
};
const SEGMENT_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#b91c1c', '#475569'];

type ServiceRequestRow = Prisma.ServiceRequestGetPayload<{
  include: { customer: true; customerUser: true; assignedMember: true; comments: true };
}>;

@Injectable()
export class PersonWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async summary() {
    const member = await this.currentMember();
    const [queue, customers, assigned, failedMail] = await Promise.all([
      this.prisma.db.serviceRequest.count({ where: { status: { notIn: Array.from(CLOSED) } } }),
      this.prisma.db.customer.count({ where: { status: 'active' } }),
      this.prisma.db.serviceRequest.count({
        where: { assignedMemberId: member.id, status: { notIn: Array.from(CLOSED) } },
      }),
      this.prisma.db.mailDelivery.count({ where: { status: 'failed' } }),
    ]);
    return {
      queue,
      customers,
      notifications: assigned + failedMail,
      assigned,
      failedMail,
    };
  }

  async queue() {
    const member = await this.currentMember();
    const rows = await this.prisma.db.serviceRequest.findMany({
      where: {
        NOT: [
          { metadata: { path: ['personWorkspaceKind'], equals: 'message_thread' } },
          { metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
          { metadata: { path: ['personWorkspaceKind'], equals: 'staff_request' } },
        ],
      },
      include: { customer: true, customerUser: true, assignedMember: true, comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 120,
    });
    return rows.map((row) => this.queueCard(row, member.id));
  }

  async moveQueueCard(id: string, input: MovePersonQueueCardInput) {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
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
    return this.queueCard(await this.requireServiceRequest(id), member.id);
  }

  async toggleQueuePin(id: string, input: TogglePersonQueuePinInput) {
    const member = await this.currentMember();
    const row = await this.requireServiceRequest(id);
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
    return this.queueCard(await this.requireServiceRequest(id), member.id);
  }

  async customers() {
    const rows = await this.prisma.db.customer.findMany({
      include: {
        insight: true,
        segmentMemberships: { include: { segment: true }, orderBy: { matchedAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastOrderAt: 'desc' }, { updatedAt: 'desc' }],
      take: 120,
    });
    return rows.map((customer, index) => {
      const segment = customer.segmentMemberships[0]?.segment;
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
      };
    });
  }

  async calendar() {
    const [requests, calls, mail] = await Promise.all([
      this.prisma.db.serviceRequest.findMany({
        where: { status: { notIn: Array.from(CLOSED) } },
        include: { customer: true, customerUser: true, assignedMember: true, comments: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
      }),
      this.prisma.db.aircallCallEvent.findMany({ orderBy: { eventTimestamp: 'desc' }, take: 25 }),
      this.prisma.db.mailDelivery.findMany({ where: { status: 'failed' }, orderBy: { updatedAt: 'desc' }, take: 15 }),
    ]);
    return [
      ...requests.map((row) => this.calendarFromRequest(row)),
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
    const created = await this.prisma.db.serviceRequestComment.create({
      data: {
        id: prefixedId('srcm'),
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
      include: { customer: true, customerUser: true, assignedMember: true, comments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Service request not found');
    return row;
  }

  private queueCard(row: ServiceRequestRow, memberId: string) {
    const metadata = this.record(row.metadata);
    const pinnedBy = this.record(metadata.personPinnedBy);
    const pinnedAt = typeof pinnedBy[memberId] === 'number' ? Number(pinnedBy[memberId]) : null;
    const columnId = personColumn(row.status, metadata.personColumnId);
    const source = taskSource(row);
    const customerName = row.customer?.companyName ?? row.customerUser?.email ?? row.title;
    const ticket = ticketNumber(row);
    return {
      id: row.id,
      title: customerName,
      summary: `${ticket} · ${titleize(row.priority)} · ${titleize(row.status)} · ${relative(row.updatedAt)}`,
      segment: String(metadata.category ?? row.surface ?? 'Support'),
      segmentColor: colorFor(row.priority),
      priority: PRIORITY_SCORE[row.priority] ?? 5,
      columnId,
      pinned: pinnedAt !== null,
      pinnedAt,
      source,
      phone: row.customer?.phone ?? row.customerUser?.phone ?? undefined,
      email: row.customer?.email ?? row.customerUser?.email ?? undefined,
      ordersCount: row.customer?.ordersCount ?? undefined,
      totalSpent: row.customer ? money(row.customer.totalSpent) : undefined,
      aiBrief: source === 'manual' ? undefined : this.brief(row),
    };
  }

  private calendarFromRequest(row: ServiceRequestRow) {
    const date = row.assignedMemberId ? row.updatedAt : row.createdAt;
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
}

function participants(thread: { metadata: Prisma.JsonValue }) {
  const metadata = thread.metadata && typeof thread.metadata === 'object' && !Array.isArray(thread.metadata)
    ? thread.metadata as Record<string, unknown>
    : {};
  return Array.isArray(metadata.participantIds) ? metadata.participantIds.filter((id): id is string => typeof id === 'string') : [];
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

function taskSource(row: { source: string; sourceCallId?: string | null; sourceEmailId?: string | null; metadata: Prisma.JsonValue }) {
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

function colorFor(priority: string) {
  if (priority === 'critical' || priority === 'urgent') return '#b91c1c';
  if (priority === 'high') return '#b45309';
  if (priority === 'medium') return '#2563eb';
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
