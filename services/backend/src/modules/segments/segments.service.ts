import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  CreateSegmentInput,
  PreviewSegmentInput,
  SegmentConditionInput,
  UpsertSegmentOwnershipInput,
  UpdateSegmentInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { SegmentsRepository } from './segments.repository.js';

type CustomerCandidate = Awaited<ReturnType<SegmentsRepository['listCustomers']>>[number];

@Injectable()
export class SegmentsService {
  constructor(
    private readonly repository: SegmentsRepository,
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
    const matches = this.matchCustomers(customers, input.conditions, input.matchMode);
    const totalRevenue = matches.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0);
    const totalOrders = matches.reduce((sum, customer) => sum + Number(customer.ordersCount || 0), 0);
    const atRisk = matches.filter((customer) => customer.insight?.churnRisk === 'high').length;
    return {
      summary: {
        totalCustomers: customers.length,
        matchCount: matches.length,
        totalRevenue,
        avgOrders: matches.length ? totalOrders / matches.length : 0,
        atRisk,
      },
      matches: matches.slice(0, 100).map((customer) => this.presentCustomerMatch(customer)),
    };
  }

  async evaluate(id: string) {
    const segment = await this.requireSegment(id);
    const conditions = this.normalizeConditions(segment.conditions);
    const customers = await this.repository.listCustomers();
    const matches = segment.isActive
      ? this.matchCustomers(customers, conditions, segment.matchMode as 'all' | 'any')
      : [];
    await this.repository.replaceMemberships(id, matches.map((customer) => customer.id));
    this.logger.log('segments', 'evaluate', 'Segment evaluated', { segment_id: id, match_count: matches.length });
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

  private matchCustomers(customers: CustomerCandidate[], conditions: SegmentConditionInput[], matchMode: 'all' | 'any') {
    if (conditions.length === 0) return customers;
    return customers.filter((customer) => {
      const checks = conditions.map((condition) => this.matchesCondition(this.valueFor(customer, condition), condition.operator, condition.value));
      return matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
    });
  }

  private valueFor(customer: CustomerCandidate, condition: SegmentConditionInput) {
    switch (condition.field) {
      case 'companyStatus':
        return customer.status;
      case 'companyName':
        return customer.companyName;
      case 'companyEmail':
        return customer.email ?? '';
      case 'companyPhone':
        return customer.phone ?? '';
      case 'shopifyCustomerTags':
        return customer.tags;
      case 'totalRevenue':
        return Number(customer.totalSpent || 0);
      case 'totalOrders':
        return Number(customer.ordersCount || 0);
      case 'avgOrderValue':
        return Number(customer.averageOrderValue || 0);
      case 'daysSinceLastOrder':
        return customer.lastOrderAt ? Math.floor((Date.now() - customer.lastOrderAt.getTime()) / 86_400_000) : 9999;
      case 'healthScore':
        return customer.insight?.healthScore ?? 0;
      case 'churnRisk':
        return customer.insight?.churnRisk ?? 'unknown';
      case 'lifecycle':
        return customer.insight?.rfmSegment ?? 'new';
      case 'clvTier':
        return customer.insight?.clvTier ?? 'new';
      default:
        return null;
    }
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

  private presentCustomerMatch(customer: CustomerCandidate) {
    return {
      id: customer.id,
      customerId: customer.id,
      companyName: customer.companyName,
      email: customer.email,
      status: customer.status,
      tags: customer.tags,
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
