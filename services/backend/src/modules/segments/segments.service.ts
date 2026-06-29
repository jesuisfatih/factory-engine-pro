import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  CreateSegmentInput,
  PreviewSegmentInput,
  SegmentConditionInput,
  SyncShopifySegmentsInput,
  SyncShopifySegmentsResponse,
  UpsertSegmentOwnershipInput,
  UpdateSegmentInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { RulesService } from '../rules/rules.service.js';
import { SegmentsRepository, type SegmentMembershipMetadata } from './segments.repository.js';
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

interface SegmentConditionGroups {
  company: SegmentConditionInput[];
  customerUser: SegmentConditionInput[];
  shopifyCustomer: SegmentConditionInput[];
}

interface CustomerUserEntity {
  id: string;
  customerId: string;
  companyName: string;
  email: string;
  roleValues: string[];
  isActive: boolean;
}

interface ShopifyCustomerEntity {
  shopifyCustomerId: string;
  name: string;
  email: string | null;
  tags: string[];
  segmentIds: string[];
  acceptsMarketing: boolean | null;
  state: string | null;
  locale: string | null;
  ordersCount: number;
  totalSpent: number;
  linkedCustomerId: string | null;
  companyName: string | null;
  linkedUsers: Array<{ id: string; email: string; companyId: string; companyName: string }>;
  linkState: 'linked' | 'unlinked';
}

interface EvaluationContext {
  candidates: SegmentCandidate[];
  snapshotCustomerIds: Set<string>;
  requestedShopifySegmentIds: string[];
  shopifyMembershipsByCustomerId: Map<string, string[]>;
  metricsByCustomer: Map<string, Record<string, unknown>>;
}

const PERIOD_FIELDS = new Set(['periodRevenue', 'periodOrders', 'periodQuantity']);
const CUSTOMER_USER_FIELDS = new Set(['companyUserRole', 'companyUserIsActive']);
const SHOPIFY_CUSTOMER_FIELDS = new Set([
  'shopifyCustomerTags',
  'shopifyCustomerSegmentIds',
  'shopifyCustomerAcceptsMarketing',
  'shopifyCustomerState',
  'shopifyCustomerLocale',
  'shopifyCustomerOrdersCount',
  'shopifyCustomerTotalSpent',
]);
const SHOPIFY_SEGMENT_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#b91c1c', '#475569'];

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
      audienceType: input.audienceType ?? 'accountscompany',
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
    const groups = this.splitConditions(input.conditions);
    const matches = this.matchCustomers(context.candidates, input.conditions, input.matchMode);
    const companySignalMatches = groups.company.length > 0
      ? context.candidates.filter((candidate) => this.matchesCompanyConditionGroup(candidate, groups.company, input.matchMode))
      : [];
    const customerUserMatches = this.matchCustomerUserEntities(context.candidates, groups.customerUser, input.matchMode);
    const shopifyCustomerMatches = this.matchShopifyCustomerEntities(
      this.previewShopifyCustomerEntities(context),
      groups.shopifyCustomer,
      input.matchMode,
    );
    const totalRevenue = matches.reduce((sum, candidate) => sum + Number(candidate.customer.totalSpent || 0), 0);
    const totalOrders = matches.reduce((sum, candidate) => sum + Number(candidate.customer.ordersCount || 0), 0);
    const atRisk = matches.filter((candidate) => candidate.customer.insight?.churnRisk === 'high').length;
    const localShopifyIds = new Set(customers.map((customer) => customer.shopifyCustomerId).filter((id): id is string => Boolean(id)));
    const unlinkedSnapshotCustomers = Array.from(context.snapshotCustomerIds).filter((id) => !localShopifyIds.has(id)).length;
    const matchedShopifyCustomerCount = groups.shopifyCustomer.length > 0
      ? shopifyCustomerMatches.length
      : matches.filter((candidate) => Boolean(candidate.customer.shopifyCustomerId)).length;
    const linkedShopifyCustomerIds = new Set(shopifyCustomerMatches.flatMap((customer) => customer.linkedCustomerId ? [customer.linkedCustomerId] : []));
    const linkedShopifyUserIds = new Set(shopifyCustomerMatches.flatMap((customer) => customer.linkedUsers.map((user) => user.id)));

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
        matchedCustomerUsers: customerUserMatches.length,
        matchedShopifyCustomers: matchedShopifyCustomerCount,
        totalRevenue,
        avgOrders: matches.length ? totalOrders / matches.length : 0,
        atRisk,
      },
      breakdown: {
        customers: matches.length,
        customerUsers: customerUserMatches.length,
        shopifyCustomers: matchedShopifyCustomerCount,
        unlinkedShopifyCustomers: unlinkedSnapshotCustomers,
        primaryEntity: this.resolvePreviewPrimaryEntity(groups),
        activeGroups: this.activePreviewGroups(groups),
        companySignals: {
          matchedCount: companySignalMatches.length,
        },
        companyUserSignals: {
          matchedCount: customerUserMatches.length,
          matchedCustomerCount: new Set(customerUserMatches.map((user) => user.customerId)).size,
        },
        shopifyCustomerSignals: {
          matchedCount: shopifyCustomerMatches.length,
          linkedCustomerCount: linkedShopifyCustomerIds.size,
          linkedUserCount: linkedShopifyUserIds.size,
          unlinkedCount: shopifyCustomerMatches.filter((customer) => customer.linkState === 'unlinked').length,
        },
      },
      matches: matches.slice(0, 100).map((candidate) => this.presentCustomerMatch(candidate)),
      companyUserMatches: customerUserMatches.slice(0, 100),
      shopifyCustomerMatches: shopifyCustomerMatches.slice(0, 100),
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
    const membershipMetadata = this.membershipMetadataByCustomer(matches, context.requestedShopifySegmentIds);

    await this.repository.replaceMemberships(id, matchIds, membershipMetadata);
    await this.repository.syncAssignmentHistory(segment, matchIds, context.metricsByCustomer);
    const assignmentSync = await this.repository.syncSalesAssignmentsFromCurrentSegments([
      ...matchIds,
      ...existingRows.map((membership) => membership.customerId),
    ]);

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
      auto_assigned_count: assignmentSync.assigned,
      auto_assign_skipped_count: assignmentSync.skipped,
      auto_assign_cleared_count: assignmentSync.cleared,
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

  async syncShopifySegments(input: SyncShopifySegmentsInput = {}): Promise<SyncShopifySegmentsResponse> {
    const liveSegments = await this.shopifySegments.listSegments({ limit: input.limit ?? 100 });
    const existingSegments = await this.repository.list();
    const existingByShopifySegmentId = this.existingSegmentsByShopifySegmentId(existingSegments);
    const orderedLiveSegments = [...liveSegments].sort((left, right) => {
      const leftExists = existingByShopifySegmentId.has(left.id);
      const rightExists = existingByShopifySegmentId.has(right.id);
      if (leftExists !== rightExists) return leftExists ? 1 : -1;
      return left.name.localeCompare(right.name);
    });
    const results: SyncShopifySegmentsResponse['segments'] = [];

    let created = 0;
    let updated = 0;
    let evaluated = 0;
    let skippedEvaluation = 0;
    let failed = 0;

    for (const [index, shopifySegment] of orderedLiveSegments.entries()) {
      const conditions = this.shopifySegmentConditions(shopifySegment.id);
      const rules = this.buildRules('all', conditions, {
        source: 'shopify_customer_segment',
        shopifySegmentId: shopifySegment.id,
        shopifyQuery: shopifySegment.query,
      });
      const rulesHash = this.hashRules(rules);
      const existing = existingByShopifySegmentId.get(shopifySegment.id);
      const description = this.shopifySegmentDescription(shopifySegment.query);
      const action = existing ? 'updated' as const : 'created' as const;
      let canonicalId: string | null = existing?.id ?? null;
      let customerCount = existing?.customerCount ?? 0;
      let evaluationStatus: 'evaluated' | 'skipped' | 'failed' = 'skipped';
      let error: string | null = null;

      try {
        const refreshedSnapshots = await this.shopifySegments.ensureMembershipSnapshots([shopifySegment.id], { force: input.force ?? false });
        const snapshotRefreshed = refreshedSnapshots.includes(shopifySegment.id);
        const shouldEvaluate = !existing
          || input.force === true
          || snapshotRefreshed
          || !existing.lastEvaluatedAt
          || existing.rulesHash !== rulesHash;

        if (existing) {
          await this.repository.update(existing.id, {
            name: shopifySegment.name,
            ...(this.shouldReplaceShopifyDescription(existing) ? { description } : {}),
            audienceType: 'shopify_customer',
            matchMode: 'all',
            conditions,
            rules,
            rulesHash,
          });
          updated += 1;
        } else {
          const segment = await this.repository.create({
            name: shopifySegment.name,
            description,
            color: SHOPIFY_SEGMENT_COLORS[index % SHOPIFY_SEGMENT_COLORS.length],
            priority: 0,
            priorityGlobal: 0,
            audienceType: 'shopify_customer',
            lifecycleStage: null,
            matchMode: 'all',
            conditions,
            rules,
            rulesHash,
            isActive: true,
          });
          canonicalId = segment.id;
          created += 1;
        }

        if (canonicalId && shouldEvaluate) {
          const evaluatedSegment = await this.evaluate(canonicalId) as { customerCount?: number } | null;
          customerCount = Number(evaluatedSegment?.customerCount ?? customerCount ?? 0);
          evaluationStatus = 'evaluated';
          evaluated += 1;
        } else {
          skippedEvaluation += 1;
        }
      } catch (caught) {
        failed += 1;
        evaluationStatus = 'failed';
        error = caught instanceof Error ? caught.message : String(caught);
        this.logger.warn('segments', 'shopify_segment_sync_failed', 'Shopify segment canonical sync failed', {
          shopify_segment_id: shopifySegment.id,
          shopify_segment_name: shopifySegment.name,
          error,
        });
      }

      results.push({
        id: canonicalId ?? shopifySegment.id,
        name: shopifySegment.name,
        shopifySegmentId: shopifySegment.id,
        action,
        evaluationStatus,
        customerCount,
        syncStatus: shopifySegment.syncStatus,
        error,
      });
    }

    this.logger.log('segments', 'sync_shopify_segments', 'Shopify customer segments synced into canonical operations segments', {
      scanned: liveSegments.length,
      created,
      updated,
      evaluated,
      skipped_evaluation: skippedEvaluation,
      failed,
      force: input.force ?? false,
    });

    return {
      scanned: liveSegments.length,
      created,
      updated,
      evaluated,
      skippedEvaluation,
      failed,
      segments: results,
    };
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
    for (const segment of matchedSegments) {
      await this.repository.upsertMembership(
        segment.id,
        customerId,
        this.membershipMetadataForCandidate(candidate, extractShopifySegmentIds(this.normalizeConditions(segment.conditions))),
      );
    }
    for (const segment of added) {
      await this.fireSegmentMembershipTrigger('segment.member_added', customerId, segment.id, segment.name);
    }
    for (const membership of removed) {
      await this.repository.deleteMembership(membership.segmentId, customerId);
      await this.fireSegmentMembershipTrigger('segment.member_removed', customerId, membership.segmentId, membership.segment.name);
    }
    const assignmentSync = await this.repository.syncSalesAssignmentsFromCurrentSegments([customerId]);

    this.logger.log('segments', 'evaluate_customer', 'Customer segment memberships evaluated', {
      customer_id: customerId,
      matched_count: matchedSegments.length,
      added_count: added.length,
      removed_count: removed.length,
      auto_assigned_count: assignmentSync.assigned,
      auto_assign_skipped_count: assignmentSync.skipped,
      auto_assign_cleared_count: assignmentSync.cleared,
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
      teamId: input.teamId,
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
      team_id: input.teamId,
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

  private existingSegmentsByShopifySegmentId(segments: Awaited<ReturnType<SegmentsRepository['list']>>) {
    const mapped = new Map<string, (typeof segments)[number]>();
    for (const segment of segments) {
      for (const shopifySegmentId of extractShopifySegmentIds(this.normalizeConditions(segment.conditions))) {
        if (!mapped.has(shopifySegmentId)) mapped.set(shopifySegmentId, segment);
      }
    }
    return mapped;
  }

  private shopifySegmentConditions(shopifySegmentId: string): SegmentConditionInput[] {
    return [{
      field: 'shopifyCustomerSegmentIds',
      operator: 'in',
      value: [shopifySegmentId],
      scopeType: 'all',
      scopeValues: [],
    }];
  }

  private shopifySegmentDescription(query: string) {
    const trimmed = query.trim();
    return trimmed ? `Shopify segment query: ${trimmed}` : 'Imported from Shopify customer segments.';
  }

  private shouldReplaceShopifyDescription(segment: { description: string | null; rules: Prisma.JsonValue }) {
    if (!segment.description) return true;
    if (segment.description.startsWith('Shopify segment query:')) return true;
    const metadata = record(record(segment.rules).metadata);
    return metadata.source === 'shopify_customer_segment';
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
    return { candidates, snapshotCustomerIds, requestedShopifySegmentIds, shopifyMembershipsByCustomerId: membershipMap, metricsByCustomer };
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
    const groups = this.splitConditions(conditions);
    return candidates.filter((candidate) => this.matchesCandidate(candidate, groups, matchMode));
  }

  private splitConditions(conditions: SegmentConditionInput[]): SegmentConditionGroups {
    return {
      company: conditions.filter((condition) => !CUSTOMER_USER_FIELDS.has(condition.field) && !SHOPIFY_CUSTOMER_FIELDS.has(condition.field)),
      customerUser: conditions.filter((condition) => CUSTOMER_USER_FIELDS.has(condition.field)),
      shopifyCustomer: conditions.filter((condition) => SHOPIFY_CUSTOMER_FIELDS.has(condition.field)),
    };
  }

  private matchesCandidate(candidate: SegmentCandidate, groups: SegmentConditionGroups, matchMode: 'all' | 'any') {
    if (matchMode === 'all') {
      return (
        this.matchesCompanyConditionGroup(candidate, groups.company, 'all')
        && this.matchesAllEntityConditions(this.customerUserEntities(candidate), groups.customerUser, (entity, condition) =>
          this.customerUserValueFor(entity, condition),
        )
        && this.matchesAllEntityConditions(this.shopifyCustomerEntities(candidate), groups.shopifyCustomer, (entity, condition) =>
          this.shopifyCustomerValueFor(entity, condition),
        )
      );
    }

    return [...groups.company, ...groups.customerUser, ...groups.shopifyCustomer].some((condition) =>
      this.matchesAnyCondition(candidate, condition),
    );
  }

  private matchesCompanyConditionGroup(
    candidate: SegmentCandidate,
    conditions: SegmentConditionInput[],
    matchMode: 'all' | 'any',
  ) {
    if (conditions.length === 0) return matchMode === 'all';
    return matchMode === 'all'
      ? conditions.every((condition) => this.matchesCompanyCondition(candidate, condition))
      : conditions.some((condition) => this.matchesCompanyCondition(candidate, condition));
  }

  private matchesAnyCondition(candidate: SegmentCandidate, condition: SegmentConditionInput) {
    if (CUSTOMER_USER_FIELDS.has(condition.field)) {
      return this.matchesAnyEntityCondition(this.customerUserEntities(candidate), condition, (entity, item) =>
        this.customerUserValueFor(entity, item),
      );
    }
    if (SHOPIFY_CUSTOMER_FIELDS.has(condition.field)) {
      return this.matchesAnyEntityCondition(this.shopifyCustomerEntities(candidate), condition, (entity, item) =>
        this.shopifyCustomerValueFor(entity, item),
      );
    }
    return this.matchesCompanyCondition(candidate, condition);
  }

  private matchesCompanyCondition(candidate: SegmentCandidate, condition: SegmentConditionInput) {
    return this.matchesCondition(this.valueFor(candidate, condition), condition.operator, condition.value);
  }

  private matchesAllEntityConditions<T>(
    entities: T[],
    conditions: SegmentConditionInput[],
    resolver: (entity: T, condition: SegmentConditionInput) => unknown,
  ) {
    if (conditions.length === 0) return true;
    if (entities.length === 0) return false;
    return entities.some((entity) =>
      conditions.every((condition) => this.matchesCondition(resolver(entity, condition), condition.operator, condition.value)),
    );
  }

  private matchesAnyEntityCondition<T>(
    entities: T[],
    condition: SegmentConditionInput,
    resolver: (entity: T, condition: SegmentConditionInput) => unknown,
  ) {
    return entities.some((entity) => this.matchesCondition(resolver(entity, condition), condition.operator, condition.value));
  }

  private matchCustomerUserEntities(
    candidates: SegmentCandidate[],
    conditions: SegmentConditionInput[],
    matchMode: 'all' | 'any',
  ) {
    if (conditions.length === 0) return [];
    return candidates
      .flatMap((candidate) => this.customerUserEntities(candidate))
      .filter((entity) => matchMode === 'all'
        ? conditions.every((condition) => this.matchesCondition(this.customerUserValueFor(entity, condition), condition.operator, condition.value))
        : conditions.some((condition) => this.matchesCondition(this.customerUserValueFor(entity, condition), condition.operator, condition.value)));
  }

  private matchShopifyCustomerEntities(
    entities: ShopifyCustomerEntity[],
    conditions: SegmentConditionInput[],
    matchMode: 'all' | 'any',
  ) {
    if (conditions.length === 0) return [];
    return entities.filter((entity) => matchMode === 'all'
      ? conditions.every((condition) => this.matchesCondition(this.shopifyCustomerValueFor(entity, condition), condition.operator, condition.value))
      : conditions.some((condition) => this.matchesCondition(this.shopifyCustomerValueFor(entity, condition), condition.operator, condition.value)));
  }

  private customerUserEntities(candidate: SegmentCandidate): CustomerUserEntity[] {
    return candidate.customer.customerUsers.map((user) => {
      const roleValues = uniqueStrings(user.roleAssignments.flatMap((assignment) => [
        assignment.role.slug,
        assignment.role.name,
      ]));
      return {
        id: user.id,
        customerId: candidate.customer.id,
        companyName: candidate.customer.companyName,
        email: user.email,
        roleValues,
        isActive: user.status === 'active',
      };
    });
  }

  private customerUserValueFor(entity: CustomerUserEntity, condition: SegmentConditionInput) {
    if (condition.field === 'companyUserRole') return entity.roleValues;
    if (condition.field === 'companyUserIsActive') return entity.isActive;
    return null;
  }

  private shopifyCustomerEntities(candidate: SegmentCandidate): ShopifyCustomerEntity[] {
    const entity = this.linkedShopifyCustomerEntity(candidate);
    return entity ? [entity] : [];
  }

  private linkedShopifyCustomerEntity(candidate: SegmentCandidate): ShopifyCustomerEntity | null {
    const shopifyCustomerId = candidate.customer.shopifyCustomerId;
    if (!shopifyCustomerId) return null;
    const raw = record(candidate.customer.rawData);
    const fullName = [candidate.customer.firstName, candidate.customer.lastName].filter(Boolean).join(' ').trim();
    return {
      shopifyCustomerId,
      name: fullName || candidate.customer.email || candidate.customer.companyName || shopifyCustomerId,
      email: candidate.customer.email,
      tags: candidate.customer.tags,
      segmentIds: candidate.shopifySegmentIds,
      acceptsMarketing: booleanOrNull(raw.accepts_marketing ?? raw.acceptsMarketing),
      state: stringValue(raw.state),
      locale: stringValue(raw.locale),
      ordersCount: Number(candidate.customer.ordersCount || 0),
      totalSpent: Number(candidate.customer.totalSpent || 0),
      linkedCustomerId: candidate.customer.id,
      companyName: candidate.customer.companyName,
      linkedUsers: candidate.customer.customerUsers.map((user) => ({
        id: user.id,
        email: user.email,
        companyId: candidate.customer.id,
        companyName: candidate.customer.companyName,
      })),
      linkState: 'linked',
    };
  }

  private previewShopifyCustomerEntities(context: EvaluationContext): ShopifyCustomerEntity[] {
    const linked = context.candidates.flatMap((candidate) => this.shopifyCustomerEntities(candidate));
    const linkedIds = new Set(linked.map((entity) => entity.shopifyCustomerId));
    const unlinked = Array.from(context.shopifyMembershipsByCustomerId.entries())
      .filter(([shopifyCustomerId]) => !linkedIds.has(shopifyCustomerId))
      .map(([shopifyCustomerId, segmentIds]) => ({
        shopifyCustomerId,
        name: `Shopify Customer ${shopifyCustomerId}`,
        email: null,
        tags: [],
        segmentIds,
        acceptsMarketing: null,
        state: null,
        locale: null,
        ordersCount: 0,
        totalSpent: 0,
        linkedCustomerId: null,
        companyName: null,
        linkedUsers: [],
        linkState: 'unlinked' as const,
      }));
    return [...linked, ...unlinked];
  }

  private shopifyCustomerValueFor(entity: ShopifyCustomerEntity, condition: SegmentConditionInput) {
    switch (condition.field) {
      case 'shopifyCustomerTags':
        return entity.tags;
      case 'shopifyCustomerSegmentIds':
        return entity.segmentIds;
      case 'shopifyCustomerAcceptsMarketing':
        return entity.acceptsMarketing;
      case 'shopifyCustomerState':
        return entity.state ?? '';
      case 'shopifyCustomerLocale':
        return entity.locale ?? '';
      case 'shopifyCustomerOrdersCount':
        return entity.ordersCount;
      case 'shopifyCustomerTotalSpent':
        return entity.totalSpent;
      default:
        return null;
    }
  }

  private valueFor(candidate: SegmentCandidate, condition: SegmentConditionInput) {
    const customer = candidate.customer;
    const raw = record(customer.rawData);
    const insight = customer.insight;
    const deepMetrics = record(insight?.deepMetrics);
    const field = condition.field as string;
    switch (field) {
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
        return numberValue(deepMetrics.churnRisk ?? deepMetrics.churn_risk ?? riskScore(insight?.churnRisk));
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

  private activePreviewGroups(groups: SegmentConditionGroups) {
    const activeGroups: Array<'company' | 'customer_user' | 'shopify_customer'> = [];
    if (groups.company.length > 0) activeGroups.push('company');
    if (groups.customerUser.length > 0) activeGroups.push('customer_user');
    if (groups.shopifyCustomer.length > 0) activeGroups.push('shopify_customer');
    return activeGroups;
  }

  private resolvePreviewPrimaryEntity(groups: SegmentConditionGroups) {
    const activeGroups = this.activePreviewGroups(groups);
    if (activeGroups.length === 0) return 'company';
    if (activeGroups.length > 1) return 'mixed';
    return activeGroups[0];
  }

  private normalizeConditions(raw: unknown): SegmentConditionInput[] {
    return Array.isArray(raw) ? raw as SegmentConditionInput[] : [];
  }

  private buildRules(matchMode: string, conditions: SegmentConditionInput[], metadata: Record<string, unknown> = {}) {
    return (Object.keys(metadata).length ? { matchMode, conditions, metadata } : { matchMode, conditions }) as Prisma.InputJsonObject;
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

  private membershipMetadataByCustomer(
    candidates: SegmentCandidate[],
    requestedShopifySegmentIds: string[],
  ): Map<string, SegmentMembershipMetadata> {
    return new Map(candidates.map((candidate) => [
      candidate.customer.id,
      this.membershipMetadataForCandidate(candidate, requestedShopifySegmentIds),
    ]));
  }

  private membershipMetadataForCandidate(
    candidate: SegmentCandidate | undefined,
    requestedShopifySegmentIds: string[],
  ): SegmentMembershipMetadata {
    if (!candidate) return { source: 'auto', shopifySegmentRef: null, score: 1 };
    const requested = new Set(requestedShopifySegmentIds);
    const shopifySegmentRef = candidate.shopifySegmentIds.find((segmentId) => requested.has(segmentId)) ?? null;
    return { source: shopifySegmentRef ? 'shopify_native' : 'auto', shopifySegmentRef, score: 1 };
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
      teamId: ownership.teamId,
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

function booleanOrNull(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function riskScore(value: unknown) {
  const normalized = stringValue(value)?.toLowerCase();
  if (!normalized) return 0;
  if (normalized === 'critical') return 100;
  if (normalized === 'high') return 75;
  if (normalized === 'medium') return 50;
  if (normalized === 'low') return 20;
  if (normalized === 'unknown') return 0;
  return numberValue(normalized);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
