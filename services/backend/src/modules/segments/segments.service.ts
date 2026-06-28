import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  CreateSegmentInput,
  PreviewSegmentInput,
  SegmentConditionInput,
  UpsertSegmentOwnershipInput,
  UpdateSegmentInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { RulesService } from '../rules/rules.service.js';
import { SegmentsRepository } from './segments.repository.js';
import { ShopifyCustomerSegmentsService } from './shopify-customer-segments.service.js';

type CustomerRow = Awaited<ReturnType<SegmentsRepository['listCustomers']>>[number];
type OrderRow = Awaited<ReturnType<SegmentsRepository['listOrdersSince']>>[number];
type ProductRow = Awaited<ReturnType<SegmentsRepository['listProducts']>>[number];

interface SegmentCandidate {
  customer: CustomerRow;
  shopifySegmentIds: string[];
  scopedOrders: OrderRow[];
  productIndex: Map<string, ProductRow>;
}

interface EvaluationContext {
  candidates: SegmentCandidate[];
  snapshotCustomerIds: Set<string>;
  requestedShopifySegmentIds: string[];
  metricsByCustomer: Map<string, Record<string, unknown>>;
}

const PERIOD_FIELDS = new Set(['periodRevenue', 'periodOrders', 'periodQuantity']);

@Injectable()
export class SegmentsService {
  constructor(
    private readonly repository: SegmentsRepository,
    private readonly rules: RulesService,
    private readonly shopifySegments: ShopifyCustomerSegmentsService,
    private readonly logger: AppLogger,
  ) {}

  async list() {
    const segments = await this.repository.list();
    return segments.map((segment) => this.presentSegment(segment));
  }

  async stats() {
    const segments = await this.repository.list();
    return {
      total: segments.length,
      active: segments.filter((segment) => segment.isActive).length,
      matchedCustomers: segments.reduce((sum, segment) => sum + Number(segment.customerCount || 0), 0),
      ownerships: segments.reduce((sum, segment) => sum + segment.ownerships.length, 0),
    };
  }

  async getOne(id: string) {
    const segment = await this.requireSegment(id);
    const preview = await this.preview({
      id: segment.id,
      matchMode: segment.matchMode as 'all' | 'any',
      conditions: this.normalizeConditions(segment.conditions),
    });
    return {
      ...this.presentSegment(segment),
      preview,
    };
  }

  async create(input: CreateSegmentInput) {
    const conditions = input.conditions;
    const matchMode = input.matchMode ?? 'all';
    const rules = this.buildRules(matchMode, conditions);
    const created = await this.repository.create({
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? '#2f80ed',
      priority: input.priority ?? 0,
      priorityGlobal: input.priorityGlobal ?? input.priority ?? 0,
      audienceType: input.audienceType ?? 'customer',
      lifecycleStage: input.lifecycleStage ?? null,
      matchMode,
      conditions,
      rules,
      rulesHash: this.hashRules(rules),
      isActive: input.isActive ?? true,
    });
    await this.evaluate(created.id);
    this.logger.log('segments', 'create', 'Segment created', { segment_id: created.id });
    return this.getOne(created.id);
  }

  async update(id: string, input: UpdateSegmentInput) {
    const existing = await this.requireSegment(id);
    const conditions = input.conditions ?? this.normalizeConditions(existing.conditions);
    const matchMode = input.matchMode ?? existing.matchMode;
    const rules = this.buildRules(matchMode, conditions);
    await this.repository.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.priorityGlobal !== undefined && { priorityGlobal: input.priorityGlobal }),
      ...(input.audienceType !== undefined && { audienceType: input.audienceType }),
      ...(input.lifecycleStage !== undefined && { lifecycleStage: input.lifecycleStage || null }),
      ...(input.matchMode !== undefined && { matchMode: input.matchMode }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      conditions,
      rules,
      rulesHash: this.hashRules(rules),
    });
    await this.evaluate(id);
    this.logger.log('segments', 'update', 'Segment updated', { segment_id: id });
    return this.getOne(id);
  }

  async remove(id: string) {
    await this.requireSegment(id);
    await this.repository.delete(id);
    this.logger.log('segments', 'delete', 'Segment deleted', { segment_id: id });
    return { ok: true };
  }

  async preview(input: PreviewSegmentInput) {
    const customers = await this.repository.listCustomers();
    const context = await this.buildEvaluationContext(customers, input.conditions);
    const matches = this.matchCustomers(context.candidates, input.conditions, input.matchMode);
    const totalRevenue = matches.reduce((sum, candidate) => sum + Number(candidate.customer.totalSpent || 0), 0);
    const totalOrders = matches.reduce((sum, candidate) => sum + Number(candidate.customer.ordersCount || 0), 0);
    const atRisk = matches.filter((candidate) => candidate.customer.insight?.churnRisk === 'high').length;
    const localShopifyIds = new Set(customers.map((customer) => customer.shopifyCustomerId).filter((id): id is string => Boolean(id)));
    const unlinkedSnapshotCustomers = Array.from(context.snapshotCustomerIds).filter((id) => !localShopifyIds.has(id)).length;

    return {
      summary: {
        totalCustomers: customers.length,
        totalCustomerUsers: customers.reduce((sum, customer) => sum + customer.customerUsers.length, 0),
        totalShopifyCustomers: localShopifyIds.size,
        shopifySnapshotCustomers: context.snapshotCustomerIds.size,
        unlinkedShopifyCustomers: unlinkedSnapshotCustomers,
        requestedShopifySegments: context.requestedShopifySegmentIds.length,
        matchCount: matches.length,
        matchedCustomers: matches.length,
        matchedCustomerUsers: matches.reduce((sum, candidate) => sum + customerUserMatchCount(candidate, input.conditions), 0),
        matchedShopifyCustomers: matches.filter((candidate) => Boolean(candidate.customer.shopifyCustomerId)).length,
        totalRevenue,
        avgOrders: matches.length ? totalOrders / matches.length : 0,
        atRisk,
      },
      breakdown: {
        customers: matches.length,
        customerUsers: matches.reduce((sum, candidate) => sum + customerUserMatchCount(candidate, input.conditions), 0),
        shopifyCustomers: matches.filter((candidate) => Boolean(candidate.customer.shopifyCustomerId)).length,
        unlinkedShopifyCustomers: unlinkedSnapshotCustomers,
      },
      matches: matches.slice(0, 100).map((candidate) => this.presentCustomerMatch(candidate)),
    };
  }

  async evaluate(id: string) {
    const segment = await this.requireSegment(id);
    const conditions = this.normalizeConditions(segment.conditions);
    const customers = await this.repository.listCustomers();
    const context = await this.buildEvaluationContext(customers, conditions);
    const matches = segment.isActive
      ? this.matchCustomers(context.candidates, conditions, segment.matchMode as 'all' | 'any')
      : [];
    const matchIds = matches.map((candidate) => candidate.customer.id);
    const existingRows = await this.repository.listMembershipCustomerIds(id);
    const existingIds = new Set(existingRows.map((row) => row.customerId));
    const matchIdSet = new Set(matchIds);

    await this.repository.replaceMemberships(id, matchIds);
    await this.repository.syncAssignmentHistory(segment, matchIds, context.metricsByCustomer);

    const added = matches.filter((candidate) => !existingIds.has(candidate.customer.id));
    const removed = existingRows.filter((membership) => !matchIdSet.has(membership.customerId));
    for (const candidate of added) {
      await this.fireSegmentMembershipTrigger('segment.member_added', candidate.customer.id, segment.id, segment.name);
    }
    for (const membership of removed) {
      await this.fireSegmentMembershipTrigger('segment.member_removed', membership.customerId, segment.id, segment.name);
    }

    this.logger.log('segments', 'evaluate', 'Segment evaluated', {
      segment_id: id,
      match_count: matches.length,
      added_count: added.length,
      removed_count: removed.length,
    });
    return this.getOne(id);
  }

  async evaluateAll() {
    const segments = await this.repository.list();
    let evaluated = 0;
    for (const segment of segments) {
      await this.evaluate(segment.id);
      evaluated += 1;
    }
    this.logger.log('segments', 'evaluate_all', 'All segments evaluated', { evaluated });
    return { evaluated };
  }

  async evaluateForCustomer(customerId: string) {
    const customer = await this.repository.findCustomerById(customerId);
    if (!customer) throw new NotFoundException('Customer not found for segment evaluation');
    const [segments, existingMemberships] = await Promise.all([
      this.repository.listActiveSegments(),
      this.repository.listMembershipsForCustomer(customerId),
    ]);
    const allConditions = segments.flatMap((segment) => this.normalizeConditions(segment.conditions));
    const context = await this.buildEvaluationContext([customer], allConditions);
    const candidate = context.candidates[0];
    const existingSegmentIds = new Set(existingMemberships.map((membership) => membership.segmentId));
    const matchedSegments = candidate
      ? segments.filter((segment) => {
          const conditions = this.normalizeConditions(segment.conditions);
          return this.matchCustomers([candidate], conditions, segment.matchMode as 'all' | 'any').length > 0;
        })
      : [];
    const matchedSegmentIds = new Set(matchedSegments.map((segment) => segment.id));
    const added = matchedSegments.filter((segment) => !existingSegmentIds.has(segment.id));
    const removed = existingMemberships.filter((membership) => !matchedSegmentIds.has(membership.segmentId));

    for (const segment of segments) {
      const matched = matchedSegmentIds.has(segment.id) ? [customerId] : [];
      await this.repository.syncAssignmentHistory(segment, matched, context.metricsByCustomer);
    }
    for (const segment of added) {
      await this.repository.upsertMembership(segment.id, customerId);
      await this.fireSegmentMembershipTrigger('segment.member_added', customerId, segment.id, segment.name);
    }
    for (const membership of removed) {
      await this.repository.deleteMembership(membership.segmentId, customerId);
      await this.fireSegmentMembershipTrigger('segment.member_removed', customerId, membership.segmentId, membership.segment.name);
    }

    this.logger.log('segments', 'evaluate_customer', 'Customer segment memberships evaluated', {
      customer_id: customerId,
      matched_count: matchedSegments.length,
      added_count: added.length,
      removed_count: removed.length,
    });
    return {
      customerId,
      matched: matchedSegments.map((segment) => ({ id: segment.id, name: segment.name })),
      added: added.map((segment) => ({ id: segment.id, name: segment.name })),
      removed: removed.map((membership) => ({ id: membership.segmentId, name: membership.segment.name })),
    };
  }

  async evaluateBatch(customerIds: string[]) {
    const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
    const results = [];
    for (const customerId of uniqueIds) {
      results.push(await this.evaluateForCustomer(customerId));
    }
    this.logger.log('segments', 'evaluate_batch', 'Customer segment batch evaluated', { customer_count: uniqueIds.length });
    return { evaluated: results.length, results };
  }

  async getOwnerships(id: string) {
    const segment = await this.requireSegment(id);
    return segment.ownerships.map((ownership) => this.presentOwnership(ownership));
  }

  async upsertOwnership(id: string, input: UpsertSegmentOwnershipInput) {
    await this.requireSegment(id);
    const member = await this.repository.findActiveMember(input.memberId);
    if (!member) throw new BadRequestException('Active member is required for segment ownership');
    const ownership = await this.repository.upsertOwnership(id, {
      memberId: input.memberId,
      priority: input.priority ?? 0,
      importance: input.importance ?? 'normal',
      dailyCap: input.dailyCap,
      autoAssignNew: input.autoAssignNew ?? true,
      notes: input.notes,
      visualToken: input.visualToken,
    });
    this.logger.log('segments', 'ownership_upsert', 'Segment ownership changed', {
      segment_id: id,
      member_id: input.memberId,
    });
    return this.presentOwnership(ownership);
  }

  async removeOwnership(id: string, ownershipId?: string) {
    await this.requireSegment(id);
    await this.repository.removeOwnership(id, ownershipId);
    this.logger.log('segments', 'ownership_remove', 'Segment ownership removed', { segment_id: id, ownership_id: ownershipId });
    return { ok: true };
  }

  private async requireSegment(id: string) {
    const segment = await this.repository.findById(id);
    if (!segment) throw new NotFoundException('Segment not found');
    return segment;
  }

  private async buildEvaluationContext(customers: CustomerRow[], conditions: SegmentConditionInput[]): Promise<EvaluationContext> {
    const requestedShopifySegmentIds = extractShopifySegmentIds(conditions);
    if (requestedShopifySegmentIds.length > 0) {
      await this.shopifySegments.ensureMembershipSnapshots(requestedShopifySegmentIds);
    }
    const membershipMap = requestedShopifySegmentIds.length > 0
      ? await this.shopifySegments.getMembershipsByCustomerId(requestedShopifySegmentIds)
      : new Map<string, string[]>();
    const snapshotCustomerIds = new Set(membershipMap.keys());
    const needsPeriod = conditions.some((condition) => PERIOD_FIELDS.has(condition.field));
    const maxDays = Math.max(0, ...conditions.map((condition) => condition.timeframeDays ?? 0));
    const since = needsPeriod
      ? new Date(Date.now() - (maxDays || 30) * 24 * 60 * 60 * 1000)
      : null;
    const [orders, products] = needsPeriod
      ? await Promise.all([this.repository.listOrdersSince(since), this.repository.listProducts()])
      : [[], []] as [OrderRow[], ProductRow[]];
    const ordersByCustomer = new Map<string, OrderRow[]>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const current = ordersByCustomer.get(order.customerId) ?? [];
      current.push(order);
      ordersByCustomer.set(order.customerId, current);
    }
    const productIndex = new Map(products.map((product) => [product.shopifyProductId, product]));
    const candidates = customers.map((customer) => ({
      customer,
      shopifySegmentIds: customer.shopifyCustomerId ? membershipMap.get(customer.shopifyCustomerId) ?? [] : [],
      scopedOrders: ordersByCustomer.get(customer.id) ?? [],
      productIndex,
    }));
    const metricsByCustomer = new Map(candidates.map((candidate) => [candidate.customer.id, this.metricsSnapshot(candidate)]));
    return { candidates, snapshotCustomerIds, requestedShopifySegmentIds, metricsByCustomer };
  }

  private async fireSegmentMembershipTrigger(
    trigger: 'segment.member_added' | 'segment.member_removed',
    customerId: string,
    segmentId: string,
    segmentName: string,
  ) {
    try {
      await this.rules.fireTrigger({
        trigger,
        eventId: `segment-${trigger}-${customerId}-${segmentId}-${Date.now()}`,
        source: 'segments.evaluate',
        params: { customerId, segmentId, segmentName },
      });
      this.logger.log('segments', trigger, 'Segment membership workflow trigger fired', {
        customer_id: customerId,
        segment_id: segmentId,
        segment_name: segmentName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('segments', 'workflow_trigger_failed', 'Segment membership workflow trigger failed', {
        trigger,
        customer_id: customerId,
        segment_id: segmentId,
        error: message,
      });
    }
  }

  private matchCustomers(candidates: SegmentCandidate[], conditions: SegmentConditionInput[], matchMode: 'all' | 'any') {
    if (conditions.length === 0) return candidates;
    return candidates.filter((candidate) => {
      const checks = conditions.map((condition) => this.matchesCondition(this.valueFor(candidate, condition), condition.operator, condition.value));
      return matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
    });
  }

  private valueFor(candidate: SegmentCandidate, condition: SegmentConditionInput) {
    const customer = candidate.customer;
    const raw = record(customer.rawData);
    const insight = customer.insight;
    const deepMetrics = record(insight?.deepMetrics);
    switch (condition.field) {
      case 'companyStatus':
        return customer.status;
      case 'companyName':
        return customer.companyName;
      case 'companyGroup':
        return stringValue(raw.company_group ?? raw.companyGroup ?? raw.group ?? customer.tags.find((tag) => tag.toLowerCase().startsWith('group:')));
      case 'companyEmail':
        return customer.email ?? '';
      case 'companyPhone':
        return customer.phone ?? '';
      case 'companyTaxId':
        return customer.taxId ?? '';
      case 'currentLifecycleStage':
      case 'lifecycle':
      case 'segment':
        return insight?.rfmSegment ?? 'new';
      case 'teamCount':
        return customer.customerUsers.length;
      case 'companyUserRole':
        return uniqueStrings(customer.customerUsers.flatMap((user) => user.roleAssignments.flatMap((assignment) => [
          assignment.role.slug,
          assignment.role.name,
        ])));
      case 'companyUserIsActive':
        return customer.customerUsers.map((user) => user.status === 'active');
      case 'shopifyCustomerTags':
        return customer.tags;
      case 'shopifyCustomerSegmentIds':
        return candidate.shopifySegmentIds;
      case 'shopifyCustomerAcceptsMarketing':
        return Boolean(raw.accepts_marketing ?? raw.acceptsMarketing ?? false);
      case 'shopifyCustomerState':
        return stringValue(raw.state) ?? '';
      case 'shopifyCustomerLocale':
        return stringValue(raw.locale) ?? '';
      case 'shopifyCustomerOrdersCount':
      case 'totalOrders':
        return Number(customer.ordersCount || 0);
      case 'shopifyCustomerTotalSpent':
      case 'totalRevenue':
        return Number(customer.totalSpent || 0);
      case 'avgOrderValue':
        return Number(customer.averageOrderValue || 0);
      case 'daysSinceLastOrder':
        return customer.lastOrderAt ? Math.floor((Date.now() - customer.lastOrderAt.getTime()) / 86_400_000) : 9999;
      case 'healthScore':
      case 'engagementScore':
        return Number(deepMetrics.engagementScore ?? deepMetrics.engagement_score ?? insight?.healthScore ?? 0);
      case 'churnRisk':
        return insight?.churnRisk ?? 'unknown';
      case 'clvTier':
        return insight?.clvTier ?? 'new';
      case 'buyerIntent':
        return stringValue(deepMetrics.buyerIntent ?? deepMetrics.buyer_intent ?? raw.buyer_intent) ?? 'unknown';
      case 'upsellPotential':
        return numberValue(deepMetrics.upsellPotential ?? deepMetrics.upsell_potential);
      case 'totalSessions':
        return numberValue(deepMetrics.totalSessions ?? deepMetrics.total_sessions);
      case 'totalProductViews':
        return numberValue(deepMetrics.totalProductViews ?? deepMetrics.total_product_views);
      case 'totalAddToCarts':
        return numberValue(deepMetrics.totalAddToCarts ?? deepMetrics.total_add_to_carts);
      case 'periodRevenue':
        return this.periodMetric(candidate, condition, 'revenue');
      case 'periodOrders':
        return this.periodMetric(candidate, condition, 'orders');
      case 'periodQuantity':
        return this.periodMetric(candidate, condition, 'quantity');
      default:
        return null;
    }
  }

  private periodMetric(candidate: SegmentCandidate, condition: SegmentConditionInput, metric: 'revenue' | 'orders' | 'quantity') {
    const days = condition.timeframeDays && condition.timeframeDays > 0 ? condition.timeframeDays : 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const orders = candidate.scopedOrders.filter((order) => {
      const at = (order.processedAt ?? order.createdAt).getTime();
      return at >= since && orderMatchesScope(order, condition, candidate.productIndex);
    });
    if (metric === 'orders') return orders.length;
    if (metric === 'revenue') return orders.reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
    return orders.reduce((sum, order) => sum + orderQuantity(order, condition, candidate.productIndex), 0);
  }

  private matchesCondition(actual: unknown, operator: string, expected: unknown) {
    const normalizedActual = normalizeValue(actual);
    const normalizedExpected = Array.isArray(expected) ? expected.map(normalizeValue) : normalizeValue(expected);
    if (Array.isArray(normalizedActual)) return matchesArrayCondition(normalizedActual, operator, normalizedExpected);
    switch (operator) {
      case 'gt':
        return Number(normalizedActual) > Number(normalizedExpected);
      case 'gte':
        return Number(normalizedActual) >= Number(normalizedExpected);
      case 'lt':
        return Number(normalizedActual) < Number(normalizedExpected);
      case 'lte':
        return Number(normalizedActual) <= Number(normalizedExpected);
      case 'eq':
        return normalizedActual === normalizedExpected;
      case 'neq':
        return normalizedActual !== normalizedExpected;
      case 'contains':
        return String(normalizedActual).includes(String(normalizedExpected));
      case 'in':
        return Array.isArray(normalizedExpected) && normalizedExpected.includes(normalizedActual as never);
      case 'notIn':
        return Array.isArray(normalizedExpected) && !normalizedExpected.includes(normalizedActual as never);
      default:
        throw new BadRequestException(`Unsupported operator: ${operator}`);
    }
  }

  private normalizeConditions(raw: unknown): SegmentConditionInput[] {
    return Array.isArray(raw) ? raw as SegmentConditionInput[] : [];
  }

  private buildRules(matchMode: string, conditions: SegmentConditionInput[]) {
    return { matchMode, conditions };
  }

  private hashRules(rules: unknown) {
    return createHash('sha256').update(JSON.stringify(rules)).digest('hex');
  }

  private metricsSnapshot(candidate: SegmentCandidate) {
    return {
      customerId: candidate.customer.id,
      shopifyCustomerId: candidate.customer.shopifyCustomerId,
      shopifySegmentIds: candidate.shopifySegmentIds,
      totalRevenue: Number(candidate.customer.totalSpent || 0),
      totalOrders: Number(candidate.customer.ordersCount || 0),
      avgOrderValue: Number(candidate.customer.averageOrderValue || 0),
      healthScore: candidate.customer.insight?.healthScore ?? 0,
      churnRisk: candidate.customer.insight?.churnRisk ?? 'unknown',
      lifecycle: candidate.customer.insight?.rfmSegment ?? 'new',
      scopedOrderCount: candidate.scopedOrders.length,
    };
  }

  private presentSegment(segment: Awaited<ReturnType<SegmentsRepository['findById']>>) {
    if (!segment) return segment;
    return {
      id: segment.id,
      name: segment.name,
      description: segment.description,
      color: segment.color,
      priority: segment.priority,
      priorityGlobal: segment.priorityGlobal,
      audienceType: segment.audienceType,
      lifecycleStage: segment.lifecycleStage,
      matchMode: segment.matchMode,
      customerCount: segment.customerCount,
      companyCount: segment.customerCount,
      lastEvaluatedAt: segment.lastEvaluatedAt,
      isActive: segment.isActive,
      conditions: this.normalizeConditions(segment.conditions),
      ownerships: segment.ownerships.map((ownership) => this.presentOwnership(ownership)),
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }

  private presentOwnership(ownership: any) {
    return {
      id: ownership.id,
      memberId: ownership.memberId,
      memberName: ownership.member ? `${ownership.member.firstName} ${ownership.member.lastName}` : null,
      memberEmail: ownership.member?.email ?? null,
      priority: ownership.priority,
      importance: ownership.importance,
      dailyCap: ownership.dailyCap,
      autoAssignNew: ownership.autoAssignNew,
      notes: ownership.notes,
      visualToken: ownership.visualToken,
      createdAt: ownership.createdAt,
      updatedAt: ownership.updatedAt,
    };
  }

  private presentCustomerMatch(candidate: SegmentCandidate) {
    const customer = candidate.customer;
    return {
      id: customer.id,
      customerId: customer.id,
      companyName: customer.companyName,
      email: customer.email,
      status: customer.status,
      tags: customer.tags,
      shopifyCustomerId: customer.shopifyCustomerId,
      shopifySegmentIds: candidate.shopifySegmentIds,
      customerUsers: customer.customerUsers.length,
      totalRevenue: Number(customer.totalSpent || 0),
      totalOrders: customer.ordersCount,
      avgOrderValue: Number(customer.averageOrderValue || 0),
      lastOrderAt: customer.lastOrderAt,
      healthScore: customer.insight?.healthScore ?? 0,
      churnRisk: customer.insight?.churnRisk ?? 'unknown',
      lifecycle: customer.insight?.rfmSegment ?? 'new',
    };
  }
}

function extractShopifySegmentIds(conditions: SegmentConditionInput[]) {
  const values = conditions
    .filter((condition) => condition.field === 'shopifyCustomerSegmentIds')
    .flatMap((condition) => Array.isArray(condition.value) ? condition.value : [condition.value])
    .map((value) => String(value || '').trim())
    .filter((value) => value.startsWith('gid://shopify/Segment/'));
  return uniqueStrings(values);
}

function customerUserMatchCount(candidate: SegmentCandidate, conditions: SegmentConditionInput[]) {
  if (!conditions.some((condition) => condition.field === 'companyUserRole' || condition.field === 'companyUserIsActive')) {
    return 0;
  }
  return candidate.customer.customerUsers.length;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && trimmed !== '') return numeric;
    return lower;
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  return value;
}

function matchesArrayCondition(actual: unknown[], operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'contains':
    case 'eq':
      return Array.isArray(expected)
        ? expected.every((entry) => actual.includes(entry))
        : actual.includes(expected);
    case 'neq':
      return !matchesArrayCondition(actual, 'eq', expected);
    case 'in':
      return Array.isArray(expected)
        ? actual.some((entry) => expected.includes(entry))
        : actual.includes(expected);
    case 'notIn':
      return Array.isArray(expected)
        ? actual.every((entry) => !expected.includes(entry))
        : !actual.includes(expected);
    default:
      throw new BadRequestException(`Unsupported operator for array field: ${operator}`);
  }
}

function orderMatchesScope(order: OrderRow, condition: SegmentConditionInput, productIndex: Map<string, ProductRow>) {
  const scopeType = condition.scopeType ?? 'all';
  const scopeValues = (condition.scopeValues ?? []).map((value) => value.toLowerCase()).filter(Boolean);
  if (scopeType === 'all' || scopeValues.length === 0) return true;
  return lineItems(order.lineItems).some((item) => lineItemMatchesScope(item, scopeType, scopeValues, productIndex));
}

function orderQuantity(order: OrderRow, condition: SegmentConditionInput, productIndex: Map<string, ProductRow>) {
  return lineItems(order.lineItems)
    .filter((item) => {
      const scopeType = condition.scopeType ?? 'all';
      const scopeValues = (condition.scopeValues ?? []).map((value) => value.toLowerCase()).filter(Boolean);
      return scopeType === 'all' || scopeValues.length === 0 || lineItemMatchesScope(item, scopeType, scopeValues, productIndex);
    })
    .reduce((sum, item) => sum + numberValue(item.quantity), 0);
}

function lineItemMatchesScope(
  item: Record<string, unknown>,
  scopeType: string,
  scopeValues: string[],
  productIndex: Map<string, ProductRow>,
) {
  const productId = stringValue(item.product_id ?? item.productId) ?? '';
  const variantId = stringValue(item.variant_id ?? item.variantId) ?? '';
  const sku = stringValue(item.sku) ?? '';
  if (scopeType === 'product') {
    return [productId, variantId, sku].map((value) => value.toLowerCase()).some((value) => scopeValues.includes(value));
  }
  if (scopeType === 'collection') {
    const product = productIndex.get(productId);
    const collectionValues = flattenCollections(product?.collections).concat(product?.tags ?? []).map((value) => value.toLowerCase());
    return collectionValues.some((value) => scopeValues.includes(value));
  }
  return true;
}

function flattenCollections(value: Prisma.JsonValue | null | undefined): string[] {
  if (!value) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenCollections);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenCollections);
  return [];
}

function lineItems(value: Prisma.JsonValue): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    return [item as Record<string, unknown>];
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  const text = String(value).trim();
  return text || null;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
