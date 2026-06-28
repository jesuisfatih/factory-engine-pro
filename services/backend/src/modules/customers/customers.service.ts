import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  assignCustomerAxisPrimarySchema,
  type CreateCustomerListInput,
  type CustomerAssignmentAxis,
  type CustomerCommerceQuery,
  type CustomerListCustomersInput,
  recordCustomerAxisNoAutoReassignSchema,
  taskAxisSchema,
  type AssignCustomerAxisPrimaryInput,
  type RecordCustomerAxisNoAutoReassignInput,
  type UpdateCustomerListInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import {
  type CustomerAssignmentAuditWithMembers,
  type CustomerAssignmentWithMember,
  type CustomerWithCommerce,
  CustomersRepository,
} from './customers.repository.js';

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

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
