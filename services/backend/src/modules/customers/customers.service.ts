import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  assignCustomerAxisPrimarySchema,
  assignDefaultCustomerAxisSchema,
  type CreateCustomerListInput,
  type CustomerAssignmentAxis,
  type CustomerCommerceQuery,
  type CustomerDetailPanelDto,
  type CustomerDetailTab,
  type CustomerListCustomersInput,
  MEMBER_PERMISSIONS,
  recordCustomerAxisNoAutoReassignSchema,
  taskAxisSchema,
  type AssignCustomerAxisPrimaryInput,
  type AssignDefaultCustomerAxisInput,
  type RecordCustomerAxisNoAutoReassignInput,
  type UpdateCustomerListInput,
} from '@factory-engine-pro/contracts';
import { aircallWhereFor } from '../../shared/contact-match.js';
import { AppLogger } from '../../shared/logger.service.js';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { ShopifyClientService, type ShopifyCredentials } from '../sync/shopify-client.service.js';
import {
  type CustomerAssignmentAuditWithMembers,
  type CustomerAssignmentWithMember,
  type CustomerWithCommerce,
  CustomersRepository,
  customerAssignmentInclude,
} from './customers.repository.js';

const CLOSED_STATUSES = new Set(['closed', 'resolved', 'transferred']);
const INTERNAL_CUSTOMER_KINDS = new Set(['message_thread', 'note', 'staff_request', 'customer_pin']);
type CustomerDetailShopifyOrderDto = CustomerDetailPanelDto['tabs']['shopifyOrders'][number];

const ALARM_DEFINITIONS = [
  { systemType: 'churn_alarm', name: 'Churn alarm', color: '#dc2626', icon: 'alert-triangle' },
  { systemType: 'attention_needed', name: 'Attention needed', color: '#f59e0b', icon: 'activity' },
  { systemType: 'dormant_whales', name: 'Dormant whales', color: '#7c3aed', icon: 'gem' },
  { systemType: 'frequency_drop', name: 'Frequency drop', color: '#ea580c', icon: 'trending-down' },
  { systemType: 'rising_stars', name: 'Rising stars', color: '#16a34a', icon: 'sparkles' },
  { systemType: 'vip_candidates', name: 'VIP candidates', color: '#0f766e', icon: 'badge-check' },
  { systemType: 'comeback_window', name: 'Comeback window', color: '#2563eb', icon: 'timer' },
  { systemType: 'discount_sensitive', name: 'Discount sensitive', color: '#9333ea', icon: 'percent' },
] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly repository: CustomersRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly shopify: ShopifyClientService,
  ) {}

  async list(query: CustomerCommerceQuery) {
    const customers = await this.repository.list(this.whereFromQuery(query), this.orderBy(query), query.limit);
    return {
      data: customers.map((customer) => this.mapCustomer(customer)),
      meta: { count: customers.length, limit: query.limit },
    };
  }

  async stats(query: Partial<CustomerCommerceQuery> = {}) {
    const where = this.whereFromQuery({ limit: 100, sort: 'recent_order', ...query });
    const [count, aggregate, atRiskCount, vipCount, dormantCount] = await Promise.all([
      this.repository.count(where),
      this.repository.aggregate(where),
      this.repository.count({ ...where, insight: { churnRisk: { in: ['high', 'critical'] } } }),
      this.repository.count({ ...where, insight: { clvTier: { in: ['vip', 'whale'] } } }),
      this.repository.count({ ...where, insight: { rfmSegment: 'dormant' } }),
    ]);
    return {
      count,
      totalRevenue: money(aggregate._sum.totalSpent),
      totalOrders: Number(aggregate._sum.ordersCount ?? 0),
      averageOrderValue: money(aggregate._avg.averageOrderValue),
      atRiskCount,
      vipCount,
      dormantCount,
    };
  }

  async get(id: string) {
    const customer = await this.repository.getRequired(id);
    return {
      ...this.mapCustomer(customer),
      orders: customer.orders.map((order) => ({
        id: order.id,
        orderNumber: order.shopifyOrderNumber ?? order.id,
        totalPrice: money(order.totalPrice),
        currency: order.currency,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        processedAt: order.processedAt?.toISOString() ?? null,
      })),
    };
  }

  async detail(id: string): Promise<CustomerDetailPanelDto> {
    const customer = await this.prisma.db.customer.findFirst({
      where: { id },
      include: {
        insight: true,
        assignments: {
          include: customerAssignmentInclude,
          orderBy: [{ axis: 'asc' }, { updatedAt: 'desc' }],
        },
        segmentMemberships: {
          include: {
            segment: {
              include: {
                ownerships: {
                  include: {
                    member: { select: { id: true, email: true, firstName: true, lastName: true } },
                  },
                  orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
                  take: 5,
                },
              },
            },
          },
          orderBy: { matchedAt: 'desc' },
          take: 25,
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const email = customer.email?.trim() ?? null;
    const phone = customer.phone?.trim() ?? null;
    const aircallWhere = aircallWhereFor(email, phone);
    const orderWhere: Prisma.CommerceOrderWhereInput = { OR: compactOrderCustomerMatchers(customer) };
    const [orders, aircallCalls, serviceRequests, mailDeliveries, linkedNotes, linkedMessages] = await Promise.all([
      this.prisma.db.commerceOrder.findMany({
        where: orderWhere,
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      aircallWhere
        ? this.prisma.db.aircallCallEvent.findMany({
            where: aircallWhere,
            orderBy: { eventTimestamp: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      this.prisma.db.serviceRequest.findMany({
        where: { customerId: id },
        include: {
          assignedMember: { select: { id: true, email: true, firstName: true, lastName: true } },
          comments: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      email
        ? this.prisma.db.mailDelivery.findMany({
            where: { recipientEmail: { equals: email, mode: 'insensitive' } },
            orderBy: [{ createdAt: 'desc' }],
            take: 50,
          })
        : Promise.resolve([]),
      this.prisma.db.serviceRequest.findMany({
        where: {
          OR: [
            {
              AND: [
                { metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
                { metadata: { path: ['linkedCustomer'], equals: id } },
              ],
            },
            {
              AND: [
                { customerId: id },
                { metadata: { path: ['personWorkspaceKind'], equals: 'note' } },
              ],
            },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.db.serviceRequest.findMany({
        where: {
          AND: [
            { metadata: { path: ['personWorkspaceKind'], equals: 'message_thread' } },
            { metadata: { path: ['linkedCustomer'], equals: id } },
          ],
        },
        include: { comments: { orderBy: { createdAt: 'asc' }, take: 50 } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ]);
    const shopifyOrders = await this.detailShopifyOrders(customer, orders);
    const ruleIds = uniqueStrings(serviceRequests.map((row) => row.matchedRuleId));
    const rules = ruleIds.length
      ? await this.prisma.db.workflowRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, name: true },
        })
      : [];
    const rulesById = new Map(rules.map((rule) => [rule.id, rule.name]));
    const authorIds = uniqueStrings([
      ...linkedNotes.map((row) => row.createdByActorId),
      ...serviceRequests.flatMap((row) => row.comments.map((comment) => comment.actorId)),
    ]);
    const authorRows = authorIds.length
      ? await this.prisma.db.member.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const authorsById = new Map(authorRows.map((row) => [row.id, row]));

    const customerRequests = serviceRequests.filter((row) => !INTERNAL_CUSTOMER_KINDS.has(String(jsonRecord(row.metadata).personWorkspaceKind ?? '')));
    const supportRows = customerRequests.filter((row) => ['support', 'customer', 'customer_portal', 'email', 'call'].includes(row.surface) || ['email', 'call', 'customer_portal'].includes(row.source));
    const support = (supportRows.length ? supportRows : customerRequests).map((row) => this.mapDetailRequest(row));
    const tasks = customerRequests.map((row) => this.mapDetailTask(row, rulesById.get(row.matchedRuleId ?? '') ?? null));
    const noteRows = [
      ...linkedNotes.map((row) => this.mapLinkedNote(row, authorsById)),
      ...customerRequests.flatMap((row) => row.comments
        .filter((comment) => comment.internal)
        .map((comment) => ({
          id: comment.id,
          title: `Task note: ${row.title}`,
          body: comment.body,
          kind: 'task_comment',
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.createdAt.toISOString(),
          linkedQueueId: row.id,
          authorMemberId: comment.actorId,
          authorMemberName: comment.actorId && authorsById.get(comment.actorId) ? memberName(authorsById.get(comment.actorId)!) : null,
          authorMemberEmail: comment.actorId && authorsById.get(comment.actorId) ? authorsById.get(comment.actorId)!.email : null,
        }))),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 50);
    const visibleTabs = this.customerDetailTabs();
    const recentCutoff = new Date(Date.now() - 30 * 86_400_000);
    const revenue30d = shopifyOrders
      .filter((order) => (dateFromIso(order.processedAt ?? order.createdAt)?.getTime() ?? 0) >= recentCutoff.getTime())
      .reduce((sum, order) => sum + order.totalPrice, 0);
    const lastContactAt = latestIso([
      ...shopifyOrders.map((order) => dateFromIso(order.processedAt ?? order.createdAt)),
      ...aircallCalls.map((call) => call.eventTimestamp),
      ...mailDeliveries.map((mail) => mail.sentAt ?? mail.updatedAt ?? mail.createdAt),
      ...serviceRequests.map((request) => request.updatedAt),
    ]);

    this.logger.log('customers', 'customer_detail.read', 'Customer detail panel opened', {
      customer_id: id,
      orders: shopifyOrders.length,
      calls: aircallCalls.length,
      support: support.length,
      emails: mailDeliveries.length,
    });

    return {
      customer: {
        id: customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        companyName: customer.companyName,
        legalName: customer.legalName,
        name: customerDisplayName(customer),
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        tags: customer.tags,
        note: customer.note,
        totalSpent: money(customer.totalSpent),
        ordersCount: customer.ordersCount,
        averageOrderValue: money(customer.averageOrderValue),
        lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
        syncedAt: customer.syncedAt?.toISOString() ?? null,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress,
        insight: {
          lifecycle: customer.insight?.rfmSegment ?? 'new',
          clvTier: customer.insight?.clvTier ?? 'new',
          healthScore: customer.insight?.healthScore ?? null,
          churnRisk: customer.insight?.churnRisk ?? 'unknown',
          daysSinceLastOrder: customer.insight?.daysSinceLastOrder ?? null,
          purchaseFrequency: customer.insight?.purchaseFrequency === null || customer.insight?.purchaseFrequency === undefined
            ? null
            : money(customer.insight.purchaseFrequency),
          projectedClv: customer.insight ? money(customer.insight.projectedClv) : null,
          calculatedAt: customer.insight?.calculatedAt?.toISOString() ?? null,
        },
        metrics: {
          lifetimeRevenue: money(customer.totalSpent),
          ordersCount: customer.ordersCount,
          averageOrderValue: money(customer.averageOrderValue),
          openSupportCount: support.filter((row) => !CLOSED_STATUSES.has(row.status)).length,
          openTaskCount: tasks.filter((row) => !CLOSED_STATUSES.has(row.status)).length,
          callsCount: aircallCalls.length,
          emailsCount: mailDeliveries.length,
          lastContactAt,
        },
        segments: customer.segmentMemberships.map((membership) => ({
          id: membership.segment.id,
          name: membership.segment.name,
          color: membership.segment.color,
          priority: membership.segment.priorityGlobal || membership.segment.priority,
          matchedAt: membership.matchedAt.toISOString(),
          score: membership.score === null ? null : money(membership.score),
          owners: membership.segment.ownerships.map((ownership) => ({
            id: ownership.id,
            memberId: ownership.memberId,
            memberName: memberName(ownership.member),
            memberEmail: ownership.member.email,
            importance: ownership.importance,
            priority: ownership.priority,
          })),
        })),
        assignments: customer.assignments.map((assignment) => ({
          id: assignment.id,
          axis: assignment.axis,
          memberId: assignment.memberId,
          memberName: memberName(assignment.member),
          memberEmail: assignment.member.email,
          source: assignment.source,
          reason: assignment.reason,
          updatedAt: assignment.updatedAt.toISOString(),
        })),
      },
      visibleTabs,
      tabs: {
        profile: {
          addresses: {
            billing: customer.billingAddress,
            shipping: customer.shippingAddress,
          },
          tags: customer.tags,
          rawNote: customer.note,
        },
        shopifyOrders,
        aircallCalls: aircallCalls.map((call) => {
          const resolver = jsonRecord(call.resolverOutput);
          return {
            id: call.id,
            externalCallId: call.externalCallId,
            eventType: call.eventType,
            eventTimestamp: call.eventTimestamp.toISOString(),
            direction: call.direction,
            status: call.status,
            durationSeconds: call.durationSeconds,
            contactPhone: call.contactPhoneE164 ?? call.contactPhone,
            contactEmail: call.contactEmail,
            hasRecording: Boolean(call.recordingUrl),
            hasVoicemail: Boolean(call.voicemailUrl),
            hasTranscript: Boolean(call.transcriptRaw),
            transcriptPreview: call.transcriptRaw ? trimText(call.transcriptRaw, 280) : null,
            resolverStatus: call.resolverStatus,
            resolverSummary: stringOrNull(resolver.summary),
            resolverIntent: stringOrNull(resolver.call_intent),
            psychTags: stringArray(resolver.psych_tags),
          };
        }),
        support,
        email: mailDeliveries.map((mail) => ({
          id: mail.id,
          eventKey: mail.eventKey,
          category: mail.category,
          recipientEmail: mail.recipientEmail,
          subject: mail.subject,
          status: mail.status,
          provider: mail.provider,
          preview: trimText(mail.errorMessage ?? mail.text ?? '', 260) || null,
          errorMessage: mail.errorMessage,
          attemptCount: mail.attemptCount,
          createdAt: mail.createdAt.toISOString(),
          updatedAt: mail.updatedAt.toISOString(),
          sentAt: mail.sentAt?.toISOString() ?? null,
        })),
        messages: linkedMessages.map((thread) => {
          const comments = thread.comments.map((comment) => mapComment(comment));
          return {
            id: thread.id,
            title: thread.title,
            participants: stringArray(jsonRecord(thread.metadata).participantIds),
            latestMessage: comments.at(-1)?.body ?? null,
            createdAt: thread.createdAt.toISOString(),
            updatedAt: thread.updatedAt.toISOString(),
            messages: comments,
          };
        }),
        notes: noteRows,
        tasks,
        commission: visibleTabs.includes('commission')
          ? {
              eligible: true,
              lifetimeRevenue: money(customer.totalSpent),
              revenue30d,
              orders30d: orders.filter((order) => (order.processedAt ?? order.createdAt).getTime() >= recentCutoff.getTime()).length,
              projectedCommission: 0,
              note: 'Commission submit flow is a later roadmap item; this panel exposes the live order basis only.',
            }
          : null,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async assignments(customerId: string) {
    await this.repository.getRequired(customerId);
    const [assignments, audits] = await Promise.all([
      this.repository.listAssignments(customerId),
      this.repository.listAssignmentAudits(customerId),
    ]);
    return {
      customerId,
      assignments: assignments.map((assignment) => this.mapAssignment(assignment)),
      audits: audits.map((audit) => this.mapAssignmentAudit(audit)),
    };
  }

  async assignAxisPrimary(customerId: string, axisValue: string, input: AssignCustomerAxisPrimaryInput) {
    const axis = this.parseAxis(axisValue);
    const parsed = assignCustomerAxisPrimarySchema.parse(input);
    await this.repository.getRequired(customerId);

    const member = await this.repository.findActiveMember(parsed.memberId);
    if (!member) throw new BadRequestException('Assigned member is not active');

    const previous = await this.repository.findAssignment(customerId, axis);
    const actorMemberId = this.currentMemberId();
    const assignment = await this.repository.upsertAssignment({
      customerId,
      axis,
      memberId: member.id,
      source: parsed.source,
      reason: parsed.reason,
      approvedByMemberId: actorMemberId,
    });
    await this.repository.createAssignmentAudit({
      customerId,
      axis,
      action: 'primary_assigned',
      previousMemberId: previous?.memberId ?? null,
      newMemberId: member.id,
      actorMemberId,
      source: parsed.source,
      reason: parsed.reason ?? null,
      metadata: {
        assignmentId: assignment.id,
        previousMemberId: previous?.memberId ?? null,
        unchanged: previous?.memberId === member.id,
      },
    });

    this.logger.log('customers', 'customer_axis_primary_assigned', 'Customer axis primary assignment changed', {
      customer_id: customerId,
      axis,
      previous_member_id: previous?.memberId ?? null,
      new_member_id: member.id,
      actor_member_id: actorMemberId,
      source: parsed.source,
    });
    return this.assignments(customerId);
  }

  async assignDefaultAxis(input: AssignDefaultCustomerAxisInput) {
    const parsed = assignDefaultCustomerAxisSchema.parse(input ?? {});
    const axes = Array.from(new Set(parsed.axes));
    const owners = await this.defaultAxisOwners(axes);
    const missingOwnerAxes = axes.filter((axis) => !owners.get(axis));
    const customers = await this.prisma.db.customer.findMany({
      include: {
        assignments: {
          where: { axis: { in: axes }, isPrimary: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: parsed.limit,
    });

    let assigned = 0;
    let skippedExisting = 0;
    let skippedNoOwner = 0;

    for (const customer of customers) {
      const existingAxes = new Set(customer.assignments.map((assignment) => assignment.axis as CustomerAssignmentAxis));
      for (const axis of axes) {
        const owner = owners.get(axis);
        if (!owner) {
          skippedNoOwner += 1;
          continue;
        }
        const existing = customer.assignments.find((assignment) => assignment.axis === axis);
        if (parsed.onlyMissing && existing) {
          skippedExisting += 1;
          continue;
        }

        const previousMemberId = existing?.memberId ?? null;
        const assignment = await this.repository.upsertAssignment({
          customerId: customer.id,
          axis,
          memberId: owner.id,
          source: parsed.source,
          reason: parsed.reason,
          approvedByMemberId: this.currentMemberId(),
        });
        await this.repository.createAssignmentAudit({
          customerId: customer.id,
          axis,
          action: existingAxes.has(axis) ? 'default_axis_reassigned' : 'default_axis_assigned',
          previousMemberId,
          newMemberId: owner.id,
          actorMemberId: this.currentMemberId(),
          source: parsed.source,
          reason: parsed.reason,
          metadata: {
            assignmentId: assignment.id,
            ownerEmail: owner.email,
            onlyMissing: parsed.onlyMissing,
          },
        });
        existingAxes.add(axis);
        assigned += 1;
      }
    }

    this.logger.log('customers', 'assign_default_axis', 'Default customer axis assignment backfill completed', {
      scanned: customers.length,
      assigned,
      skipped_existing: skippedExisting,
      skipped_no_owner: skippedNoOwner,
      axes,
      missing_owner_axes: missingOwnerAxes,
    });

    return {
      scanned: customers.length,
      assigned,
      skippedExisting,
      skippedNoOwner,
      axes,
      missingOwnerAxes,
      owners: Object.fromEntries(axes.map((axis) => {
        const owner = owners.get(axis);
        return [axis, owner ? { id: owner.id, email: owner.email, name: memberName(owner) } : null];
      })),
    };
  }

  async recordNoAutoReassign(
    customerId: string,
    axisValue: string,
    input: RecordCustomerAxisNoAutoReassignInput,
  ) {
    const axis = this.parseAxis(axisValue);
    const parsed = recordCustomerAxisNoAutoReassignSchema.parse(input);
    await this.repository.getRequired(customerId);

    const attemptedMember = await this.repository.findActiveMember(parsed.attemptedMemberId);
    if (!attemptedMember) throw new BadRequestException('Attempted member is not active');

    const assignment = await this.repository.findAssignment(customerId, axis);
    if (assignment?.memberId && assignment.memberId !== attemptedMember.id) {
      await this.repository.createAssignmentAudit({
        customerId,
        axis,
        action: 'auto_reassign_skipped',
        previousMemberId: assignment.memberId,
        newMemberId: attemptedMember.id,
        actorMemberId: this.currentMemberId(),
        source: parsed.source,
        reason: parsed.reason ?? 'Different operator observed; primary owner was preserved.',
        metadata: {
          ...parsed.metadata,
          assignmentId: assignment.id,
          preservedMemberId: assignment.memberId,
          attemptedMemberId: attemptedMember.id,
        },
      });
      this.logger.log('customers', 'customer_axis_auto_reassign_skipped', 'Customer axis primary owner preserved', {
        customer_id: customerId,
        axis,
        preserved_member_id: assignment.memberId,
        attempted_member_id: attemptedMember.id,
        source: parsed.source,
      });
    }

    return this.assignments(customerId);
  }

  async resolveAxisPrimaryMember(customerId: string | null | undefined, axis: CustomerAssignmentAxis) {
    if (!customerId) return null;
    const assignment = await this.repository.findAssignment(customerId, axis);
    if (!assignment?.isPrimary || assignment.member.status !== 'active') return null;
    return {
      assignmentId: assignment.id,
      customerId,
      axis,
      member: assignment.member,
      source: assignment.source,
    };
  }

  async calculateInsights() {
    const customers = await this.prisma.db.customer.findMany({ take: 500, orderBy: { updatedAt: 'desc' } });
    let updated = 0;
    for (const customer of customers) {
      await this.calculateInsight(customer.id);
      updated += 1;
    }
    this.logger.log('customers', 'calculate_insights', 'Customer insights recalculated', { updated });
    return { updated };
  }

  async lists() {
    const lists = await this.repository.listCustomerLists();
    return lists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      color: list.color,
      icon: list.icon,
      isSystem: list.isSystem,
      systemType: list.systemType,
      customerCount: list._count.items,
      updatedAt: list.updatedAt.toISOString(),
    }));
  }

  async getList(id: string) {
    const list = await this.repository.findListById(id);
    if (!list) throw new NotFoundException('Customer list not found');
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      color: list.color,
      icon: list.icon,
      isSystem: list.isSystem,
      systemType: list.systemType,
      customers: list.items.map((item) => ({
        itemId: item.id,
        notes: item.notes,
        addedAt: item.addedAt.toISOString(),
        customer: this.mapCustomer({ ...item.customer, _count: { customerUsers: 0, orders: 0, listItems: 0 } }),
      })),
    };
  }

  async createList(input: CreateCustomerListInput) {
    return this.repository.createList(input);
  }

  async updateList(id: string, input: UpdateCustomerListInput) {
    const result = await this.repository.updateList(id, input);
    if (result.count === 0) throw new BadRequestException('Customer list cannot be updated');
    return this.getList(id);
  }

  async deleteList(id: string) {
    const result = await this.repository.deleteList(id);
    if (result.count === 0) throw new BadRequestException('Customer list cannot be deleted');
    return { ok: true };
  }

  async addCustomersToList(id: string, input: CustomerListCustomersInput) {
    await this.assertList(id);
    await this.assertCustomers(input.customerIds);
    await this.repository.addCustomersToList(id, input.customerIds, input.notes);
    return this.getList(id);
  }

  async removeCustomersFromList(id: string, input: CustomerListCustomersInput) {
    await this.assertList(id);
    await this.repository.removeCustomersFromList(id, input.customerIds);
    return this.getList(id);
  }

  async updateListItemNote(itemId: string, notes: string | null) {
    await this.repository.updateListItemNote(itemId, notes);
    return { ok: true };
  }

  async alarmsSummary() {
    await this.ensureSystemLists();
    const lists = await this.repository.listCustomerLists();
    return lists
      .filter((list) => list.isSystem)
      .map((list) => ({
        systemType: list.systemType,
        name: list.name,
        count: list._count.items,
        color: list.color,
        icon: list.icon,
      }));
  }

  async generateAlarms() {
    await this.calculateInsights();
    const lists = await this.ensureSystemLists();
    const customers = await this.prisma.db.customer.findMany({ include: { insight: true } });
    const byType = new Map(lists.map((list) => [list.systemType, list]));
    const counts: Record<string, number> = {};

    for (const definition of ALARM_DEFINITIONS) {
      const list = byType.get(definition.systemType);
      if (!list) continue;
      await this.prisma.db.customerListItem.deleteMany({ where: { listId: list.id } });
      const matched = customers.filter((customer) => this.matchesAlarm(definition.systemType, customer));
      if (matched.length > 0) {
        await this.repository.addCustomersToList(list.id, matched.map((customer) => customer.id));
      }
      counts[definition.systemType] = matched.length;
    }

    this.logger.log('customers', 'generate_alarms', 'Customer alarm lists generated', counts);
    return { counts };
  }

  private whereFromQuery(query: Partial<CustomerCommerceQuery>): Prisma.CustomerWhereInput {
    const and: Prisma.CustomerWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.segment) and.push({ insight: { rfmSegment: query.segment } });
    if (query.churnRisk) and.push({ insight: { churnRisk: query.churnRisk } });
    if (query.tag) and.push({ tags: { has: query.tag } });
    if (query.search) {
      and.push({
        OR: [
          { companyName: { contains: query.search, mode: 'insensitive' } },
          { legalName: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { shopifyCustomerId: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private orderBy(query: CustomerCommerceQuery): Prisma.CustomerOrderByWithRelationInput[] {
    if (query.sort === 'total_spent') return [{ totalSpent: 'desc' }, { companyName: 'asc' }];
    if (query.sort === 'orders_count') return [{ ordersCount: 'desc' }, { companyName: 'asc' }];
    if (query.sort === 'name') return [{ companyName: 'asc' }];
    return [{ lastOrderAt: 'desc' }, { updatedAt: 'desc' }];
  }

  private async calculateInsight(customerId: string) {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const customer = await this.prisma.db.customer.findFirst({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const orders = await this.prisma.db.commerceOrder.findMany({
      where: { customerId },
      orderBy: { processedAt: 'asc' },
      take: 500,
    });
    const count = orders.length || customer.ordersCount;
    const total = orders.length > 0 ? orders.reduce((sum, order) => sum + money(order.totalPrice), 0) : money(customer.totalSpent);
    const avg = count === 0 ? 0 : total / count;
    const firstOrderAt = orders[0]?.processedAt ?? null;
    const lastOrderAt = orders.at(-1)?.processedAt ?? customer.lastOrderAt ?? null;
    const daysSinceLastOrder = lastOrderAt ? daysBetween(lastOrderAt, new Date()) : null;
    const churnRisk = riskFromDays(daysSinceLastOrder, count);
    const clvTier = clvTierFromTotal(total);
    const rfmSegment = segmentFrom(total, count, daysSinceLastOrder);
    const healthScore = healthScoreFrom(churnRisk, count, total);

    return this.repository.upsertInsight(customerId, {
      tenantId,
      clvScore: Math.min(100, Math.round(total / 50)),
      projectedClv: Math.round(total * 1.2 * 100) / 100,
      clvTier,
      rfmRecency: recencyScore(daysSinceLastOrder),
      rfmFrequency: Math.min(5, Math.max(1, count)),
      rfmMonetary: Math.min(5, Math.max(1, Math.round(total / 500))),
      rfmSegment,
      healthScore,
      churnRisk,
      daysSinceLastOrder,
      avgDaysBetweenOrders: averageDaysBetween(orders.map((order) => order.processedAt).filter(Boolean) as Date[]),
      purchaseFrequency: count,
      avgOrderValue: avg,
      maxOrderValue: orders.reduce((max, order) => Math.max(max, money(order.totalPrice)), 0),
      orderTrend: daysSinceLastOrder !== null && daysSinceLastOrder < 30 ? 'rising' : 'stable',
      firstOrderAt,
      lastOrderAt,
      customerSince: customer.createdAt,
      isReturning: count > 1,
      deepMetrics: {
        tags: customer.tags,
        ordersCount: count,
        totalSpent: total,
      } as Prisma.InputJsonValue,
      calculatedAt: new Date(),
    });
  }

  private async detailShopifyOrders(
    customer: { id: string; shopifyCustomerId: string | null; ordersCount: number; email: string | null },
    localOrders: Array<{
      id: string;
      shopifyOrderId: string | null;
      shopifyOrderNumber: string | null;
      totalPrice: unknown;
      subtotal: unknown;
      totalDiscounts: unknown;
      totalTax: unknown;
      totalShipping: unknown;
      currency: string;
      financialStatus: string | null;
      fulfillmentStatus: string | null;
      fulfillmentMode: string;
      processedAt: Date | null;
      createdAt: Date;
      tags: string[];
      lineItems: Prisma.JsonValue;
    }>,
  ): Promise<CustomerDetailShopifyOrderDto[]> {
    if (localOrders.length > 0) return localOrders.map(mapPersistedDetailOrder);
    if (!customer.shopifyCustomerId || customer.ordersCount <= 0) return [];

    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) return [];
    const shopifyCustomerId = numericShopifyCustomerId(customer.shopifyCustomerId);
    if (!shopifyCustomerId) return [];

    try {
      const page = await this.shopify.customerOrders(credentials, shopifyCustomerId, null, { status: 'any' });
      const liveOrders = page.items
        .map(mapLiveShopifyOrder)
        .sort((left, right) => (dateFromIso(right.processedAt ?? right.createdAt)?.getTime() ?? 0) - (dateFromIso(left.processedAt ?? left.createdAt)?.getTime() ?? 0))
        .slice(0, 50);
      if (liveOrders.length === 0) {
        const graphqlOrders = await this.detailShopifyOrdersGraphql(credentials, customer, shopifyCustomerId);
        if (graphqlOrders.length > 0) return graphqlOrders;
      }
      this.logger.log('customers', 'customer_detail.shopify_live_orders', 'Customer detail loaded live Shopify orders', {
        customer_id: customer.id,
        shopify_customer_id: shopifyCustomerId,
        orders: liveOrders.length,
      });
      return liveOrders;
    } catch (error) {
      this.logger.warn('customers', 'customer_detail.shopify_live_orders_failed', 'Customer detail could not load live Shopify orders', {
        customer_id: customer.id,
        shopify_customer_id: shopifyCustomerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async detailShopifyOrdersGraphql(
    credentials: ShopifyCredentials,
    customer: { id: string; shopifyCustomerId: string | null; email: string | null },
    shopifyCustomerId: string,
  ): Promise<CustomerDetailShopifyOrderDto[]> {
    const queryParts = [`customer_id:${shopifyCustomerId}`];
    if (customer.email) queryParts.push(`email:${customer.email}`);
    const queryText = queryParts.join(' OR ');
    const data = await this.shopify.graphql<{
      orders?: {
        nodes?: Array<Record<string, unknown>>;
      };
    }>(credentials, `
      query CustomerDetailOrders($query: String!) {
        orders(first: 50, sortKey: PROCESSED_AT, reverse: true, query: $query) {
          nodes {
            id
            legacyResourceId
            name
            tags
            processedAt
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            currentSubtotalPriceSet { shopMoney { amount currencyCode } }
            currentTotalDiscountsSet { shopMoney { amount currencyCode } }
            currentTotalTaxSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            customer { id legacyResourceId email phone }
            lineItems(first: 20) {
              nodes {
                title
                quantity
                sku
                variant { id legacyResourceId sku title product { id legacyResourceId title } }
              }
            }
          }
        }
      }
    `, { query: queryText });
    const orders = Array.isArray(data.orders?.nodes) ? data.orders.nodes : [];
    const mapped = orders.map(mapGraphqlShopifyOrder);
    this.logger.log('customers', 'customer_detail.shopify_graphql_orders', 'Customer detail loaded Shopify orders through GraphQL fallback', {
      customer_id: customer.id,
      shopify_customer_id: shopifyCustomerId,
      query: queryText,
      orders: mapped.length,
    });
    return mapped;
  }

  private mapCustomer(customer: CustomerWithCommerce) {
    const personName = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    const insight = customer.insight;
    return {
      id: customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      companyName: customer.companyName,
      name: customer.companyName || personName || customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      status: customer.status,
      tags: customer.tags,
      totalSpent: money(customer.totalSpent),
      ordersCount: customer.ordersCount,
      averageOrderValue: money(customer.averageOrderValue),
      lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
      lifecycle: insight?.rfmSegment ?? 'new',
      clvTier: insight?.clvTier ?? 'new',
      healthScore: insight?.healthScore ?? null,
      churnRisk: insight?.churnRisk ?? 'unknown',
      customerUserCount: customer._count.customerUsers,
      listCount: customer._count.listItems,
      syncedAt: customer.syncedAt?.toISOString() ?? null,
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private async assertList(id: string) {
    const list = await this.repository.findListById(id);
    if (!list) throw new NotFoundException('Customer list not found');
  }

  private async assertCustomers(customerIds: string[]) {
    const count = await this.prisma.db.customer.count({ where: { id: { in: customerIds } } });
    if (count !== customerIds.length) throw new BadRequestException('One or more customers do not exist');
  }

  private async defaultAxisOwners(axes: CustomerAssignmentAxis[]) {
    const members = await this.prisma.db.member.findMany({
      where: { status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
      orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
    });
    const owners = new Map<CustomerAssignmentAxis, typeof members[number]>();
    for (const axis of axes) {
      const scored = members
        .map((member) => ({
          member,
          score: defaultAxisEmailScore(axis, member.email) + defaultAxisRoleScore(axis, member.roleAssignments.map((assignment) => assignment.role)),
        }))
        .sort((left, right) => right.score - left.score || left.member.email.localeCompare(right.member.email));
      owners.set(axis, scored.find((entry) => entry.score > 0)?.member ?? scored[0]?.member);
    }
    return owners;
  }

  private parseAxis(axis: string): CustomerAssignmentAxis {
    return taskAxisSchema.parse(axis);
  }

  private currentMemberId() {
    const context = this.tenantContext.require();
    return context.principalType === 'member' ? context.principalId ?? null : null;
  }

  private mapAssignment(assignment: CustomerAssignmentWithMember) {
    return {
      id: assignment.id,
      customerId: assignment.customerId,
      axis: assignment.axis as CustomerAssignmentAxis,
      memberId: assignment.memberId,
      memberName: memberName(assignment.member),
      memberEmail: assignment.member.email,
      isPrimary: assignment.isPrimary,
      source: assignment.source,
      reason: assignment.reason,
      approvedByMemberId: assignment.approvedByMemberId,
      approvedAt: assignment.approvedAt?.toISOString() ?? null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  private mapAssignmentAudit(audit: CustomerAssignmentAuditWithMembers) {
    return {
      id: audit.id,
      customerId: audit.customerId,
      axis: audit.axis as CustomerAssignmentAxis,
      action: audit.action,
      previousMemberId: audit.previousMemberId,
      previousMemberName: audit.previousMember ? memberName(audit.previousMember) : null,
      newMemberId: audit.newMemberId,
      newMemberName: audit.newMember ? memberName(audit.newMember) : null,
      actorMemberId: audit.actorMemberId,
      actorMemberName: audit.actorMember ? memberName(audit.actorMember) : null,
      source: audit.source,
      reason: audit.reason,
      metadata: jsonRecord(audit.metadata),
      createdAt: audit.createdAt.toISOString(),
    };
  }

  private customerDetailTabs(): CustomerDetailTab[] {
    const tabs: CustomerDetailTab[] = [
      'profile',
      'shopify_orders',
      'aircall_calls',
      'support',
      'email',
      'messages',
      'notes',
      'tasks',
    ];
    if (this.tenantContext.require().permissions.includes(MEMBER_PERMISSIONS.commissionSubmit)) {
      tabs.push('commission');
    }
    return tabs;
  }

  private mapDetailRequest(row: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    source: string;
    surface: string;
    axis: string | null;
    dueAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    assignedMember: { firstName: string; lastName: string; email: string } | null;
    comments: Array<{
      id: string;
      body: string;
      actorId: string | null;
      actorType: string | null;
      internal: boolean;
      createdAt: Date;
    }>;
  }) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      source: row.source,
      surface: row.surface,
      axis: row.axis,
      assignedMemberName: row.assignedMember ? memberName(row.assignedMember) : null,
      dueAt: row.dueAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      comments: row.comments.map((comment) => mapComment(comment)),
    };
  }

  private mapDetailTask(row: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    source: string;
    axis: string | null;
    matchedRuleId: string | null;
    dueAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    assignedMember: { firstName: string; lastName: string; email: string } | null;
  }, matchedRuleName: string | null) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      source: row.source,
      axis: row.axis,
      assignedMemberName: row.assignedMember ? memberName(row.assignedMember) : null,
      matchedRuleId: row.matchedRuleId,
      matchedRuleName,
      dueAt: row.dueAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapLinkedNote(
    row: { id: string; title: string; description: string | null; createdByActorId: string | null; metadata: Prisma.JsonValue; createdAt: Date; updatedAt: Date },
    authorsById: Map<string, { firstName: string; lastName: string; email: string }>,
  ) {
    const metadata = jsonRecord(row.metadata);
    const author = row.createdByActorId ? authorsById.get(row.createdByActorId) : null;
    const metadataAuthorName = stringOrNull(metadata.createdByMemberName);
    const metadataAuthorEmail = stringOrNull(metadata.createdByMemberEmail);
    return {
      id: row.id,
      title: row.title,
      body: row.description ?? '',
      kind: String(metadata.noteKind ?? 'scratch'),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      linkedQueueId: stringOrNull(metadata.linkedQueueId),
      authorMemberId: row.createdByActorId,
      authorMemberName: author ? memberName(author) : metadataAuthorName,
      authorMemberEmail: author?.email ?? metadataAuthorEmail,
    };
  }

  private async ensureSystemLists() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const lists = [];
    for (const definition of ALARM_DEFINITIONS) {
      const list = await this.prisma.db.customerList.upsert({
        where: {
          tenantId_systemType: {
            tenantId,
            systemType: definition.systemType,
          },
        },
        create: {
          id: prefixedId('clst'),
          tenantId,
          name: definition.name,
          description: `${definition.name} generated from customer intelligence signals`,
          color: definition.color,
          icon: definition.icon,
          isSystem: true,
          systemType: definition.systemType,
        },
        update: {
          name: definition.name,
          color: definition.color,
          icon: definition.icon,
          isSystem: true,
        },
      });
      lists.push(list);
    }
    return lists;
  }

  private matchesAlarm(systemType: string, customer: { totalSpent: unknown; ordersCount: number; lastOrderAt: Date | null; tags: string[]; insight: { healthScore: number; churnRisk: string; rfmSegment: string } | null }) {
    const totalSpent = money(customer.totalSpent);
    const daysSinceLastOrder = customer.lastOrderAt ? daysBetween(customer.lastOrderAt, new Date()) : null;
    if (systemType === 'churn_alarm') return ['high', 'critical'].includes(customer.insight?.churnRisk ?? '');
    if (systemType === 'attention_needed') return (customer.insight?.healthScore ?? 100) < 50;
    if (systemType === 'dormant_whales') return totalSpent >= 1000 && (daysSinceLastOrder ?? 0) > 90;
    if (systemType === 'frequency_drop') return customer.ordersCount >= 3 && (daysSinceLastOrder ?? 0) > 60;
    if (systemType === 'rising_stars') return customer.ordersCount >= 2 && (daysSinceLastOrder ?? 999) <= 30;
    if (systemType === 'vip_candidates') return totalSpent >= 2500 || customer.ordersCount >= 10;
    if (systemType === 'comeback_window') return (daysSinceLastOrder ?? 0) >= 45 && (daysSinceLastOrder ?? 0) <= 120;
    if (systemType === 'discount_sensitive') return customer.tags.some((tag) => /discount|promo|wholesale|b2b/i.test(tag));
    return false;
  }
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function mapPersistedDetailOrder(order: {
  id: string;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  totalPrice: unknown;
  subtotal: unknown;
  totalDiscounts: unknown;
  totalTax: unknown;
  totalShipping: unknown;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentMode: string;
  processedAt: Date | null;
  createdAt: Date;
  tags: string[];
  lineItems: Prisma.JsonValue;
}): CustomerDetailShopifyOrderDto {
  return {
    id: order.id,
    shopifyOrderId: order.shopifyOrderId,
    orderNumber: order.shopifyOrderNumber,
    totalPrice: money(order.totalPrice),
    subtotal: money(order.subtotal),
    totalDiscounts: money(order.totalDiscounts),
    totalTax: money(order.totalTax),
    totalShipping: money(order.totalShipping),
    currency: order.currency,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    fulfillmentMode: order.fulfillmentMode,
    processedAt: order.processedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    tags: order.tags,
    lineItems: order.lineItems,
  };
}

function mapLiveShopifyOrder(raw: Record<string, unknown>): CustomerDetailShopifyOrderDto {
  const shopifyOrderId = stringId(raw.id);
  const orderName = stringId(raw.name);
  const orderNumber = stringId(raw.order_number) ?? orderName?.replace(/^#/, '') ?? shopifyOrderId;
  const createdAt = isoFromUnknown(raw.created_at) ?? new Date().toISOString();
  return {
    id: `shopify-live-${shopifyOrderId ?? orderNumber ?? createdAt}`,
    shopifyOrderId,
    orderNumber,
    totalPrice: numeric(raw.total_price),
    subtotal: numeric(raw.subtotal_price),
    totalDiscounts: numeric(raw.total_discounts),
    totalTax: numeric(raw.total_tax),
    totalShipping: liveShippingTotal(raw.shipping_lines),
    currency: stringId(raw.currency) ?? 'USD',
    financialStatus: stringId(raw.financial_status),
    fulfillmentStatus: stringId(raw.fulfillment_status),
    fulfillmentMode: 'shopify',
    processedAt: isoFromUnknown(raw.processed_at),
    createdAt,
    tags: tags(raw.tags),
    lineItems: Array.isArray(raw.line_items) ? raw.line_items : [],
  };
}

function mapGraphqlShopifyOrder(raw: Record<string, unknown>): CustomerDetailShopifyOrderDto {
  const legacyId = stringId(raw.legacyResourceId);
  const gid = stringId(raw.id);
  const orderName = stringId(raw.name);
  const createdAt = isoFromUnknown(raw.createdAt) ?? new Date().toISOString();
  return {
    id: `shopify-live-${legacyId ?? gid ?? orderName ?? createdAt}`,
    shopifyOrderId: legacyId ?? gid,
    orderNumber: orderName?.replace(/^#/, '') ?? legacyId ?? gid,
    totalPrice: moneySet(raw.currentTotalPriceSet),
    subtotal: moneySet(raw.currentSubtotalPriceSet),
    totalDiscounts: moneySet(raw.currentTotalDiscountsSet),
    totalTax: moneySet(raw.currentTotalTaxSet),
    totalShipping: moneySet(raw.totalShippingPriceSet),
    currency: currencyFromMoneySet(raw.currentTotalPriceSet) ?? 'USD',
    financialStatus: stringId(raw.displayFinancialStatus),
    fulfillmentStatus: stringId(raw.displayFulfillmentStatus),
    fulfillmentMode: 'shopify',
    processedAt: isoFromUnknown(raw.processedAt),
    createdAt,
    tags: tags(raw.tags),
    lineItems: graphqlLineItems(raw.lineItems),
  };
}

function numericShopifyCustomerId(value: string) {
  return value.replace(/^gid:\/\/shopify\/Customer\//, '').trim() || null;
}

function compactOrderCustomerMatchers(customer: { id: string; shopifyCustomerId: string | null; email: string | null; phone: string | null }): Prisma.CommerceOrderWhereInput[] {
  const matchers: Prisma.CommerceOrderWhereInput[] = [{ customerId: customer.id }];
  if (customer.shopifyCustomerId?.trim()) matchers.push({ shopifyCustomerId: customer.shopifyCustomerId.trim() });
  if (customer.email?.trim()) matchers.push({ email: { equals: customer.email.trim(), mode: 'insensitive' } });
  if (customer.phone?.trim()) matchers.push({ phone: customer.phone.trim() });
  return matchers;
}

function stringId(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value).toString();
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneySet(value: unknown) {
  return numeric(jsonRecord(jsonRecord(value).shopMoney).amount);
}

function currencyFromMoneySet(value: unknown) {
  return stringId(jsonRecord(jsonRecord(value).shopMoney).currencyCode);
}

function graphqlLineItems(value: unknown) {
  const nodes = jsonArray(jsonRecord(value).nodes);
  return nodes.map((node) => {
    const row = jsonRecord(node);
    const variant = jsonRecord(row.variant);
    const product = jsonRecord(variant.product);
    return {
      title: stringId(row.title) ?? stringId(variant.title) ?? 'Line item',
      quantity: numeric(row.quantity),
      sku: stringId(row.sku ?? variant.sku),
      shopifyVariantId: stringId(variant.legacyResourceId ?? variant.id),
      shopifyProductId: stringId(product.legacyResourceId ?? product.id),
      productTitle: stringId(product.title),
    };
  });
}

function isoFromUnknown(value: unknown) {
  const text = stringId(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateFromIso(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tags(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return stringId(value)?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function liveShippingTotal(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return sum;
    return sum + numeric((line as Record<string, unknown>).price);
  }, 0);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function riskFromDays(days: number | null, ordersCount: number) {
  if (ordersCount === 0) return 'unknown';
  if (days === null) return 'unknown';
  if (days > 180) return 'critical';
  if (days > 90) return 'high';
  if (days > 45) return 'medium';
  return 'low';
}

function clvTierFromTotal(total: number) {
  if (total >= 5000) return 'whale';
  if (total >= 2500) return 'vip';
  if (total >= 1000) return 'growth';
  return total > 0 ? 'starter' : 'new';
}

function segmentFrom(total: number, count: number, days: number | null) {
  if (count === 0) return 'new';
  if ((days ?? 0) > 120) return 'dormant';
  if (total >= 2500 || count >= 10) return 'vip';
  if (count >= 3) return 'loyal';
  return 'active';
}

function recencyScore(days: number | null) {
  if (days === null) return 1;
  if (days <= 14) return 5;
  if (days <= 30) return 4;
  if (days <= 60) return 3;
  if (days <= 120) return 2;
  return 1;
}

function healthScoreFrom(risk: string, count: number, total: number) {
  const riskPenalty = risk === 'critical' ? 60 : risk === 'high' ? 40 : risk === 'medium' ? 20 : 0;
  return Math.max(0, Math.min(100, 55 + Math.min(25, count * 3) + Math.min(20, total / 250) - riskPenalty));
}

function averageDaysBetween(dates: Date[]) {
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date));
  return Math.round((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 100) / 100;
}

function memberName(member: { firstName: string; lastName: string; email: string }) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
}

function defaultAxisRoleScore(axis: CustomerAssignmentAxis, roles: Array<{ slug: string; permissions: Prisma.JsonValue }>) {
  const slugs = new Set(roles.map((role) => role.slug.trim().toLowerCase()));
  const isAdminFallback = slugs.has('owner') || slugs.has('admin');
  let score = 0;
  for (const role of roles) {
    const slug = role.slug.trim().toLowerCase();
    if (slug === 'owner' || slug === 'admin') {
      if (axis === 'account') score += 100;
      continue;
    }
    const permissions = jsonRecord(role.permissions);
    if (axis === 'sales') {
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.commissionSubmit)) score += 40;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.ordersWrite)) score += 25;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.pricingWrite)) score += 25;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.customersRead)) score += 10;
    }
    if (axis === 'support') {
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.supportWrite)) score += 45;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.supportRead)) score += 25;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.customersRead)) score += 10;
    }
    if (axis === 'account') {
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.customersRead)) score += 30;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.ordersRead)) score += 25;
      if (permissionEnabled(permissions, MEMBER_PERMISSIONS.supportRead)) score += 10;
    }
  }
  return score > 0 ? score : isAdminFallback ? 1 : 0;
}

function defaultAxisEmailScore(axis: CustomerAssignmentAxis, email: string) {
  const normalized = email.trim().toLowerCase();
  if (axis === 'sales' && normalized === 'ihsan@dtfbank.com') return 1000;
  if (axis === 'support' && normalized === 'dtfbanktx@gmail.com') return 1000;
  if (axis === 'support' && normalized === 'charlette@dtfbank.com') return 950;
  if (axis === 'account' && normalized === 'info@dtfbank.com') return 1000;
  return 0;
}

function permissionEnabled(permissions: Record<string, unknown>, permission: string) {
  return permissions[permission] === true;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapComment(comment: {
  id: string;
  body: string;
  actorId: string | null;
  actorType: string | null;
  internal: boolean;
  createdAt: Date;
}) {
  return {
    id: comment.id,
    body: comment.body,
    actorId: comment.actorId,
    actorType: comment.actorType,
    internal: comment.internal,
    createdAt: comment.createdAt.toISOString(),
  };
}

function customerDisplayName(customer: {
  companyName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  id: string;
}) {
  return customer.companyName
    || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    || customer.email
    || customer.id;
}

function latestIso(values: Array<Date | null | undefined>) {
  const latest = values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return latest?.toISOString() ?? null;
}

function trimText(value: string, max: number) {
  const normalized = value.trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
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
