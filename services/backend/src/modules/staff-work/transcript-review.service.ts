import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  operationalIntentSchema,
  type AssignedTranscriptReviewItem,
  type AssignUnmatchedTranscriptReviewInput,
  type DismissUnmatchedTranscriptReviewInput,
  type ReleaseAssignedTranscriptReviewInput,
  type TranscriptReviewTaskStatus,
  type UnmatchedTranscriptReviewActionResult,
  type UnmatchedTranscriptReviewItem,
  type UpdateAssignedTranscriptReviewStatusInput,
} from '@factory-engine-pro/contracts';
import { currentModelResolverOutput } from '../ai/transcript-resolver-trust.js';
import { CustomerContactResolverService } from '../../shared/customer-contact-resolver.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { RealtimeService } from '../../shared/realtime.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { StaffWorkService } from './staff-work.service.js';

const UNMATCHED = ['no_matching_rule', 'no_action_unmatched'];
const REVIEW_TASK_STATUS: Record<TranscriptReviewTaskStatus, { label: string; workState: string; queueLocation: string; status: string }> = {
  assigned: { label: 'Assigned', workState: 'open', queueLocation: 'follow_up', status: 'open' },
  in_progress: { label: 'In progress', workState: 'in_progress', queueLocation: 'follow_up', status: 'in_progress' },
  customer_waiting: { label: 'Customer waiting', workState: 'pending_resolve', queueLocation: 'follow_up', status: 'pending_resolve' },
  completed: { label: 'Completed', workState: 'closed', queueLocation: 'archive', status: 'closed' },
};

@Injectable()
export class TranscriptReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly contacts: CustomerContactResolverService,
    private readonly staffWork: StaffWorkService,
    private readonly logger: AppLogger,
    private readonly realtime: RealtimeService,
  ) {}

  async list(limit = 100): Promise<UnmatchedTranscriptReviewItem[]> {
    const evaluations = await this.prisma.db.transcriptWorkflowEvaluation.findMany({
      where: { status: { in: UNMATCHED } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200) * 4,
    });
    const callEventIds = [...new Set(evaluations.map((row) => row.callEventId))];
    if (callEventIds.length === 0) return [];
    const [calls, decisions] = await Promise.all([
      this.prisma.db.aircallCallEvent.findMany({ where: { id: { in: callEventIds }, resolverStatus: 'succeeded' } }),
      this.prisma.db.transcriptReviewDecision.findMany({ where: { callEventId: { in: callEventIds } } }),
    ]);
    const decided = new Set(decisions.filter((row) => row.status !== 'pending_review').map((row) => row.callEventId));
    const evaluationsByCall = new Map<string, typeof evaluations>();
    for (const row of evaluations) evaluationsByCall.set(row.callEventId, [...(evaluationsByCall.get(row.callEventId) ?? []), row]);
    const candidates = calls
      .sort((a, b) => b.eventTimestamp.getTime() - a.eventTimestamp.getTime())
      .flatMap((call) => {
        if (decided.has(call.id)) return [];
        const resolver = currentModelResolverOutput(call);
        return resolver ? [{ call, resolver }] : [];
      })
      .slice(0, limit);
    return mapWithConcurrency(candidates, 8, async ({ call, resolver }) => {
      const customer = await this.contacts.findCustomer({
        customerId: resolver.customer_match.customer_id,
        phone: resolver.customer_match.phone ?? call.contactPhoneE164 ?? call.contactPhone,
        email: call.contactEmail,
      });
      const [recentOrder, previousCall] = customer ? await Promise.all([
        this.prisma.db.commerceOrder.findFirst({
          where: { customerId: customer.id }, orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.db.aircallCallEvent.findFirst({
          where: { id: { not: call.id }, OR: [{ contactPhoneE164: customer.phone }, { contactEmail: customer.email }] },
          orderBy: { eventTimestamp: 'desc' },
        }),
      ]) : [null, null];
      const grouped = evaluationsByCall.get(call.id) ?? [];
      return {
        id: call.id,
        callEventId: call.id,
        phone: call.contactPhoneE164 ?? call.contactPhone ?? resolver.customer_match.phone,
        customerId: customer?.id ?? null,
        customerName: customer ? customerName(customer) : resolver.customer_match.name_hint,
        occurredAt: call.eventTimestamp.toISOString(),
        direction: call.direction === 'inbound' || call.direction === 'outbound' ? call.direction : 'unknown',
        reason: grouped.some((row) => row.status === 'no_action_unmatched')
          ? 'Review whether a follow-up is needed'
          : 'No follow-up was assigned yet',
        summary: resolver.person_brief.why_calling || resolver.summary,
        concern: resolver.person_brief.upset_about || resolver.person_brief.issue,
        goal: resolver.person_brief.call_goal || resolver.person_brief.next_action,
        suggestedActions: resolver.person_brief.suggested_actions,
        excerpt: resolver.person_brief.transcript_snippet || null,
        mood: resolver.customer_mood.label || null,
        intents: grouped.map((row) => row.signal),
        psychTags: resolver.psych_tags,
        shopifyMatched: Boolean(customer?.shopifyCustomerId),
        lastOrderSummary: recentOrder ? `${recentOrder.shopifyOrderNumber ?? 'Order'} · ${recentOrder.totalPrice} ${recentOrder.currency}` : null,
        lastCallSummary: previousCall ? `${previousCall.direction ?? 'Call'} · ${previousCall.eventTimestamp.toISOString()}` : null,
      };
    });
  }

  async listAssigned(limit = 100): Promise<AssignedTranscriptReviewItem[]> {
    const decisions = await this.prisma.db.transcriptReviewDecision.findMany({
      where: { status: 'assigned', assignedStaffWorkItemId: { not: null } },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });
    const workItemIds = decisions.flatMap((row) => row.assignedStaffWorkItemId ? [row.assignedStaffWorkItemId] : []);
    if (workItemIds.length === 0) return [];
    const [workItems, calls] = await Promise.all([
      this.prisma.db.staffWorkItem.findMany({
        where: { id: { in: workItemIds } },
        include: {
          customer: true,
          assignedMember: { include: { roleAssignments: { include: { role: true } } } },
          comments: {
            include: { actor: { select: { firstName: true, lastName: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            take: 12,
          },
          callOutcomes: {
            include: { member: { select: { firstName: true, lastName: true, email: true } } },
            orderBy: { selectedAt: 'desc' },
            take: 12,
          },
          stateTransitions: {
            include: { member: { select: { firstName: true, lastName: true, email: true } } },
            orderBy: { happenedAt: 'desc' },
            take: 12,
          },
        },
      }),
      this.prisma.db.aircallCallEvent.findMany({
        where: { id: { in: decisions.map((row) => row.callEventId) } },
      }),
    ]);
    const workItemById = new Map(workItems.map((row) => [row.id, row]));
    const callById = new Map(calls.map((row) => [row.id, row]));
    return decisions.flatMap((decision) => {
      const task = decision.assignedStaffWorkItemId ? workItemById.get(decision.assignedStaffWorkItemId) : null;
      if (!task) return [];
      const call = callById.get(decision.callEventId);
      const resolver = call ? currentModelResolverOutput(call) : null;
      const member = task.assignedMember;
      const latestOutcome = task.callOutcomes[0] ?? null;
      const activity = [
        ...task.stateTransitions.map((item) => ({
          id: item.id,
          kind: 'status' as const,
          label: taskStateLabel(item.toWorkState),
          note: transitionNote(item.reason),
          actorName: item.member ? memberName(item.member) : null,
          at: item.happenedAt.toISOString(),
        })),
        ...task.callOutcomes.map((item) => ({
          id: item.id,
          kind: 'outcome' as const,
          label: callOutcomeLabel(item.disposition),
          note: item.note,
          actorName: memberName(item.member),
          at: item.selectedAt.toISOString(),
        })),
        ...task.comments.map((item) => ({
          id: item.id,
          kind: 'comment' as const,
          label: 'Comment',
          note: item.body,
          actorName: item.actor ? memberName(item.actor) : null,
          at: item.createdAt.toISOString(),
        })),
      ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 20);
      return [{
        id: decision.id,
        callEventId: decision.callEventId,
        staffWorkItemId: task.id,
        customerId: task.customerId,
        customerName: task.customer ? customerName(task.customer) : resolver?.customer_match.name_hint ?? null,
        customerPhone: task.customer?.phone ?? call?.contactPhoneE164 ?? call?.contactPhone ?? null,
        title: task.title,
        description: decision.humanDescription ?? task.description,
        latestComment: task.comments[0]?.body ?? null,
        latestCommentAt: task.comments[0]?.createdAt.toISOString() ?? null,
        assignedMemberId: task.assignedMemberId,
        assignedMemberName: member ? memberName(member) : 'Unassigned',
        assignedMemberRole: member?.roleAssignments[0]?.role.name ?? 'Member',
        status: task.workState !== 'open' ? task.workState : task.status,
        priority: task.priority,
        assignedAt: (decision.reviewedAt ?? decision.createdAt).toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        completedAt: task.closedAt?.toISOString() ?? task.archivedAt?.toISOString() ?? null,
        latestOutcome: latestOutcome ? callOutcomeLabel(latestOutcome.disposition) : null,
        latestOutcomeNote: latestOutcome?.note ?? null,
        latestOutcomeAt: latestOutcome?.selectedAt.toISOString() ?? null,
        nextFollowUpAt: task.queueLocation === 'scheduled' ? task.visibleAfter?.toISOString() ?? task.dueAt?.toISOString() ?? null : null,
        activity,
      }];
    });
  }

  async assign(callEventId: string, input: AssignUnmatchedTranscriptReviewInput): Promise<UnmatchedTranscriptReviewActionResult> {
    const actor = await this.currentMember();
    const target = await this.prisma.db.member.findFirst({ where: { id: input.targetMemberId, status: 'active' } });
    if (!target) throw new NotFoundException('Assignment target is not available');
    const source = await this.requirePendingSource(callEventId);
    const description = input.description.trim();
    await this.claim(callEventId, source.evaluations.map((row) => row.id));
    const intent = source.evaluations.map((row) => operationalIntentSchema.safeParse(row.signal)).find((row) => row.success);
    const customer = await this.contacts.findCustomer({
      customerId: source.resolver.customer_match.customer_id,
      phone: source.resolver.customer_match.phone ?? source.call.contactPhoneE164 ?? source.call.contactPhone,
      email: source.call.contactEmail,
    });
    const idempotencyKey = `manual-transcript-review:${callEventId}`;
    let task;
    try {
      task = await this.staffWork.create({
      customerId: customer?.id,
      assignedMemberId: target.id,
      axis: source.evaluations.find((row) => row.recommendedAxis === 'sales') ? 'sales' : 'account',
      source: 'manual_transcript_review',
      sourceCallId: source.call.externalCallId,
      sourceEventId: source.call.id,
      sourceOccurredAt: source.call.eventTimestamp,
      operationalIntent: intent?.success ? intent.data : null,
      title: source.resolver.person_brief.call_goal || source.resolver.person_brief.why_calling || 'Customer follow-up',
      description,
      metadata: { reviewCallEventId: callEventId, manualDescription: description },
      idempotencyKey,
      });
    } catch (error) {
      await this.release(callEventId);
      throw error;
    }
    const decision = await this.finalize(callEventId, 'assigned', actor.id, source.evaluations.map((row) => row.id), {
      assignedStaffWorkItemId: task.id,
      humanDescription: description,
    });
    this.changed('assign', callEventId, actor.id, task.id);
    return { ok: true, reviewId: decision.id, status: 'assigned', staffWorkItemId: task.id };
  }

  async dismiss(callEventId: string, input: DismissUnmatchedTranscriptReviewInput): Promise<UnmatchedTranscriptReviewActionResult> {
    const actor = await this.currentMember();
    const source = await this.requirePendingSource(callEventId);
    await this.claim(callEventId, source.evaluations.map((row) => row.id));
    const decision = await this.finalize(callEventId, 'dismissed', actor.id, source.evaluations.map((row) => row.id), {
      dismissalReason: input.reason,
    });
    this.changed('dismiss', callEventId, actor.id, null);
    return { ok: true, reviewId: decision.id, status: 'dismissed', staffWorkItemId: null };
  }

  async reassign(callEventId: string, input: AssignUnmatchedTranscriptReviewInput): Promise<UnmatchedTranscriptReviewActionResult> {
    const actor = await this.currentMember();
    const target = await this.prisma.db.member.findFirst({ where: { id: input.targetMemberId, status: 'active' } });
    if (!target) throw new NotFoundException('Assignment target is not available');
    const { decision, task } = await this.requireAssigned(callEventId);
    const metadata = task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
      ? task.metadata as Record<string, unknown>
      : {};
    await this.prisma.db.$transaction(async (tx) => {
      const updatedTask = await tx.staffWorkItem.updateMany({
        where: { id: task.id },
        data: {
          assignedMemberId: target.id,
          description: input.description,
          metadata: { ...metadata, manualDescription: input.description } as Prisma.InputJsonValue,
        },
      });
      const updatedDecision = await tx.transcriptReviewDecision.updateMany({
        where: { id: decision.id, status: 'assigned' },
        data: {
          reviewedByMemberId: actor.id,
          reviewedAt: new Date(),
          humanDescription: input.description,
        },
      });
      if (updatedTask.count !== 1 || updatedDecision.count !== 1) throw new ConflictException('This review assignment changed while it was being saved');
    });
    this.changed('reassign', callEventId, actor.id, task.id);
    return { ok: true, reviewId: decision.id, status: 'assigned', staffWorkItemId: task.id };
  }

  async releaseAssignment(callEventId: string, input: ReleaseAssignedTranscriptReviewInput): Promise<UnmatchedTranscriptReviewActionResult> {
    const actor = await this.currentMember();
    const { decision, task } = await this.requireAssigned(callEventId);
    const now = new Date();
    await this.prisma.db.$transaction(async (tx) => {
      const updatedTask = await tx.staffWorkItem.updateMany({
        where: { id: task.id },
        data: {
          assignedMemberId: null,
          status: 'cancelled',
          workState: 'closed',
          closedAt: task.closedAt ?? now,
          queueLocation: 'archive',
          archivedAt: now,
          archiveReason: input.reason?.trim() || 'Returned to transcript review pool',
          idempotencyKey: null,
        },
      });
      const updatedDecision = await tx.transcriptReviewDecision.updateMany({
        where: { id: decision.id, status: 'assigned' },
        data: {
          status: 'pending_review',
          assignedStaffWorkItemId: null,
          reviewedByMemberId: actor.id,
          reviewedAt: now,
          humanDescription: null,
          dismissalReason: null,
        },
      });
      if (updatedTask.count !== 1 || updatedDecision.count !== 1) throw new ConflictException('This review assignment changed while it was being returned to the pool');
    });
    this.changed('release', callEventId, actor.id, null);
    return { ok: true, reviewId: decision.id, status: 'pending_review', staffWorkItemId: null };
  }

  async updateAssignmentStatus(callEventId: string, input: UpdateAssignedTranscriptReviewStatusInput): Promise<UnmatchedTranscriptReviewActionResult> {
    const actor = await this.currentMember();
    const { decision, task } = await this.requireAssigned(callEventId);
    const next = REVIEW_TASK_STATUS[input.status];
    const now = new Date();
    await this.staffWork.transition(task.id, {
      memberId: actor.id,
      toWorkState: next.workState,
      toQueue: next.queueLocation,
      reason: 'admin_transcript_review_status',
      data: {
        status: next.status,
        ...(input.status === 'completed'
          ? { closedAt: task.closedAt ?? now, archivedAt: now, archiveReason: 'review_follow_up_completed' }
          : { closedAt: null, archivedAt: null, archiveReason: null }),
      },
    });
    const comment = input.comment?.trim();
    if (comment) {
      await this.prisma.db.staffWorkComment.create({
        data: {
          id: prefixedId('swc'),
          tenantId: this.tenantId(),
          staffWorkItemId: task.id,
          actorId: actor.id,
          actorType: 'member',
          body: `[Task status: ${next.label}] ${comment}`,
          internal: true,
          attachmentsJson: [{ kind: 'admin_review_status' }] as Prisma.InputJsonValue,
        },
      });
    }
    this.changed('status', callEventId, actor.id, task.id);
    return { ok: true, reviewId: decision.id, status: 'assigned', staffWorkItemId: task.id };
  }

  private async requireAssigned(callEventId: string) {
    const decision = await this.prisma.db.transcriptReviewDecision.findFirst({
      where: { callEventId, status: 'assigned', assignedStaffWorkItemId: { not: null } },
    });
    if (!decision?.assignedStaffWorkItemId) throw new ConflictException('This review is not currently assigned');
    const task = await this.prisma.db.staffWorkItem.findFirst({ where: { id: decision.assignedStaffWorkItemId } });
    if (!task) throw new NotFoundException('Assigned follow-up was not found');
    return { decision, task };
  }

  private async requirePendingSource(callEventId: string) {
    const existing = await this.prisma.db.transcriptReviewDecision.findFirst({ where: { callEventId } });
    if (existing && existing.status !== 'pending_review') throw new ConflictException('This call was already reviewed');
    const [call, evaluations] = await Promise.all([
      this.prisma.db.aircallCallEvent.findFirst({ where: { id: callEventId, resolverStatus: 'succeeded' } }),
      this.prisma.db.transcriptWorkflowEvaluation.findMany({ where: { callEventId, status: { in: UNMATCHED } } }),
    ]);
    if (!call || evaluations.length === 0) throw new NotFoundException('Call review item not found');
    const resolver = currentModelResolverOutput(call);
    if (!resolver) throw new NotFoundException('Call review item not found');
    return { call, evaluations, resolver };
  }

  private async finalize(callEventId: string, status: 'assigned' | 'dismissed', actorId: string, evaluationIds: string[], data: { assignedStaffWorkItemId?: string; humanDescription?: string; dismissalReason?: string }) {
    const result = await this.prisma.db.transcriptReviewDecision.updateMany({ where: { callEventId, status: 'processing' }, data: { evaluationIds, status, reviewedByMemberId: actorId, reviewedAt: new Date(), ...data } });
    if (result.count !== 1) throw new ConflictException('This call was already reviewed');
    return this.prisma.db.transcriptReviewDecision.findFirstOrThrow({ where: { callEventId } });
  }

  private async claim(callEventId: string, evaluationIds: string[]) {
    try {
      await this.prisma.db.transcriptReviewDecision.create({ data: { id: prefixedId('trv'), tenantId: this.tenantId(), callEventId, evaluationIds } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    const claimed = await this.prisma.db.transcriptReviewDecision.updateMany({ where: { callEventId, status: 'pending_review' }, data: { status: 'processing' } });
    if (claimed.count !== 1) throw new ConflictException('This call was already reviewed');
  }

  private release(callEventId: string) {
    return this.prisma.db.transcriptReviewDecision.updateMany({ where: { callEventId, status: 'processing' }, data: { status: 'pending_review' } });
  }

  private async currentMember() {
    const id = this.tenantContext.require().principalId;
    const member = id ? await this.prisma.db.member.findFirst({ where: { id, status: 'active' } }) : null;
    if (!member) throw new NotFoundException('Active member session required');
    return member;
  }
  private tenantId() { return this.tenantContext.require().tenantId!; }
  private changed(action: string, callEventId: string, actorId: string, taskId: string | null) {
    this.logger.log('transcript_review', action, 'Transcript review completed', { call_event_id: callEventId, actor_id: actorId, staff_work_item_id: taskId });
    this.realtime.emitTenantInvalidate(this.tenantId(), { module: 'call_center', reason: `transcript-review.${action}`, at: new Date().toISOString() });
  }
}

function customerName(customer: { firstName: string | null; lastName: string | null; companyName: string | null; email: string | null }) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || customer.companyName || customer.email || 'Customer';
}

function memberName(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName} ${member.lastName}`.trim() || member.email;
}

function callOutcomeLabel(value: string) {
  const labels: Record<string, string> = {
    customer_reached: 'Action needed',
    no_answer: 'No answer',
    voicemail: 'Voicemail left',
    voicemail_unavailable: 'Voicemail unavailable',
    wrong_number: 'Invalid number',
    do_not_call: 'Do not call',
    completed: 'Call completed',
  };
  return labels[value] ?? value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function taskStateLabel(value: string) {
  if (value === 'in_progress') return 'In progress';
  if (value === 'pending_resolve' || value === 'waiting_on_customer') return 'Customer waiting';
  if (value === 'closed' || value === 'completed') return 'Completed';
  return 'Assigned';
}

function transitionNote(reason: string) {
  if (reason.startsWith('call_outcome:')) return `Call outcome: ${callOutcomeLabel(reason.slice('call_outcome:'.length))}`;
  return reason.split('_').join(' ');
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]!);
    }
  }));
  return results;
}
