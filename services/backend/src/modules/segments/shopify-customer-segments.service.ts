import { BadRequestException, Injectable } from '@nestjs/common';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { ShopifyClientService } from '../sync/shopify-client.service.js';

type ShopifySegmentNode = {
  id: string;
  name: string;
  query: string;
};

type ShopifySegmentMembershipEdge = {
  cursor: string;
  node: { id: string };
};

export type ShopifySegmentCatalogItem = {
  id: string;
  name: string;
  query: string;
  customerCount: number | null;
  lastSyncedAt: string | null;
  syncStatus: string | null;
};

const SEGMENT_CATALOG_PAGE_SIZE = 50;
const SEGMENT_MEMBERS_PAGE_SIZE = 250;
const SEGMENT_SNAPSHOT_STALE_MS = 15 * 60 * 1000;
const SHOPIFY_SEGMENT_GID_PREFIX = 'gid://shopify/Segment/';

@Injectable()
export class ShopifyCustomerSegmentsService {
  private readonly inflightSyncs = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly shopify: ShopifyClientService,
    private readonly logger: AppLogger,
  ) {}

  async listSegments(options?: {
    search?: string;
    limit?: number;
    ids?: string[];
  }): Promise<ShopifySegmentCatalogItem[]> {
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) {
      throw new BadRequestException('Shopify credentials are not configured for this tenant.');
    }

    const limit = Math.min(Math.max(options?.limit || 25, 1), 100);
    const requestedIds = this.normalizeSegmentIds(options?.ids || []);
    const normalizedSearch = (options?.search || '').trim().toLowerCase();
    const fetched = await this.fetchLiveSegments(limit, normalizedSearch);

    const liveById = new Map<string, ShopifySegmentNode>();
    for (const segment of fetched) liveById.set(segment.id, segment);

    if (requestedIds.length > 0) {
      const missingIds = requestedIds.filter((id) => !liveById.has(id));
      for (const segmentId of missingIds) {
        const detail = await this.fetchSegmentById(segmentId).catch(() => null);
        if (detail) liveById.set(detail.id, detail);
      }
    }

    const liveSegments = Array.from(liveById.values());
    if (liveSegments.length > 0) await this.upsertSegmentMetadata(liveSegments);

    const storedSegments = await this.prisma.db.shopifyCustomerSegment.findMany({
      where: requestedIds.length > 0 ? { shopifySegmentId: { in: requestedIds } } : {},
      orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const storedById = new Map(storedSegments.map((segment) => [segment.shopifySegmentId, segment]));
    const resultIds = requestedIds.length > 0 ? requestedIds : liveSegments.map((segment) => segment.id);

    const merged = resultIds
      .map((segmentId) => {
        const live = liveById.get(segmentId);
        const stored = storedById.get(segmentId);
        if (!live && !stored) return null;
        return {
          id: segmentId,
          name: live?.name || stored?.name || segmentId,
          query: live?.query || stored?.query || '',
          customerCount: stored?.customerCount ?? null,
          lastSyncedAt: stored?.lastSyncedAt?.toISOString() || null,
          syncStatus: stored?.syncStatus || null,
        } satisfies ShopifySegmentCatalogItem;
      })
      .filter((segment): segment is ShopifySegmentCatalogItem => Boolean(segment));

    if (requestedIds.length > 0) return merged;
    return merged
      .filter((segment) => {
        if (!normalizedSearch) return true;
        return `${segment.name} ${segment.query}`.toLowerCase().includes(normalizedSearch);
      })
      .slice(0, limit);
  }

  async ensureMembershipSnapshots(shopifySegmentIds: string[], options?: { force?: boolean; staleAfterMs?: number }) {
    const uniqueSegmentIds = this.normalizeSegmentIds(shopifySegmentIds);
    if (uniqueSegmentIds.length === 0) return [];

    const staleAfterMs = options?.staleAfterMs ?? SEGMENT_SNAPSHOT_STALE_MS;
    const metadata = await this.prisma.db.shopifyCustomerSegment.findMany({
      where: { shopifySegmentId: { in: uniqueSegmentIds } },
      select: { shopifySegmentId: true, lastSyncedAt: true, syncStatus: true },
    });
    const metadataById = new Map(metadata.map((segment) => [segment.shopifySegmentId, segment]));
    const now = Date.now();
    const staleSegmentIds = uniqueSegmentIds.filter((segmentId) => {
      if (options?.force) return true;
      const current = metadataById.get(segmentId);
      if (!current?.lastSyncedAt) return true;
      if (current.syncStatus !== 'ready') return true;
      return now - current.lastSyncedAt.getTime() > staleAfterMs;
    });

    for (const segmentId of staleSegmentIds) await this.syncSegmentMembershipSnapshot(segmentId);
    return staleSegmentIds;
  }

  async getMembershipsByCustomerId(shopifySegmentIds: string[]): Promise<Map<string, string[]>> {
    const uniqueSegmentIds = this.normalizeSegmentIds(shopifySegmentIds);
    const membershipMap = new Map<string, string[]>();
    if (uniqueSegmentIds.length === 0) return membershipMap;

    const members = await this.prisma.db.shopifyCustomerSegmentMember.findMany({
      where: { shopifySegmentId: { in: uniqueSegmentIds } },
      select: { shopifyCustomerId: true, shopifySegmentId: true },
    });

    for (const member of members) {
      const current = membershipMap.get(member.shopifyCustomerId) || [];
      current.push(member.shopifySegmentId);
      membershipMap.set(member.shopifyCustomerId, current);
    }
    return membershipMap;
  }

  async syncSegmentMembershipSnapshot(shopifySegmentId: string): Promise<void> {
    if (!this.isValidSegmentId(shopifySegmentId)) {
      throw new BadRequestException(`Invalid Shopify segment id: ${shopifySegmentId}`);
    }
    const key = `${this.tenantId()}:${shopifySegmentId}`;
    const existing = this.inflightSyncs.get(key);
    if (existing) return existing;

    const task = this.runSegmentMembershipSync(shopifySegmentId).finally(() => {
      this.inflightSyncs.delete(key);
    });
    this.inflightSyncs.set(key, task);
    return task;
  }

  private async runSegmentMembershipSync(shopifySegmentId: string) {
    const detail = await this.fetchSegmentById(shopifySegmentId);
    if (!detail) throw new Error(`Shopify segment not found: ${shopifySegmentId}`);

    const metadata = await this.prisma.db.shopifyCustomerSegment.upsert({
      where: { tenantId_shopifySegmentId: { tenantId: this.tenantId(), shopifySegmentId: detail.id } },
      create: {
        id: prefixedId('shseg'),
        tenantId: this.tenantId(),
        shopifySegmentId: detail.id,
        name: detail.name,
        query: detail.query,
        syncStatus: 'syncing',
        syncError: null,
      },
      update: {
        name: detail.name,
        query: detail.query,
        lastSeenAt: new Date(),
        syncStatus: 'syncing',
        syncError: null,
      },
    });

    try {
      const members = await this.fetchAllSegmentMembers(detail.id);
      const customerIds = Array.from(new Set(
        members.map((member) => this.parseShopifyCustomerId(member.node.id)).filter((value): value is string => Boolean(value)),
      ));
      const canonicalCustomerIds = await this.filterCanonicalShopifyCustomerIds(customerIds);
      const now = new Date();
      const tenantId = this.tenantId();

      await this.prisma.$transaction(async (tx) => {
        await tx.shopifyCustomerSegmentMember.deleteMany({
          where: { tenantId, shopifySegmentRefId: metadata.id },
        });

        for (const chunk of chunks(canonicalCustomerIds, 500)) {
          if (chunk.length === 0) continue;
          await tx.shopifyCustomerSegmentMember.createMany({
            data: chunk.map((shopifyCustomerId) => ({
              id: prefixedId('shsmem'),
              tenantId,
              shopifySegmentRefId: metadata.id,
              shopifySegmentId: detail.id,
              shopifyCustomerId,
              snapshotAt: now,
            })),
            skipDuplicates: true,
          });
        }

        await tx.shopifyCustomerSegment.update({
          where: { id: metadata.id },
          data: {
            name: detail.name,
            query: detail.query,
            customerCount: canonicalCustomerIds.length,
            lastSeenAt: now,
            lastSyncedAt: now,
            syncStatus: 'ready',
            syncError: null,
          },
        });
      });

      this.logger.log('segments', 'shopify_segment_snapshot_synced', 'Shopify customer segment snapshot synced', {
        shopify_segment_id: detail.id,
        customer_count: canonicalCustomerIds.length,
        excluded_non_canonical_count: customerIds.length - canonicalCustomerIds.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Shopify segment sync error';
      await this.prisma.db.shopifyCustomerSegment.updateMany({
        where: { id: metadata.id },
        data: { syncStatus: 'error', syncError: message.slice(0, 500) },
      }).catch(() => undefined);
      this.logger.error('segments', 'shopify_segment_snapshot_failed', 'Shopify segment snapshot sync failed', {
        shopify_segment_id: shopifySegmentId,
        error: message,
      });
      throw error;
    }
  }

  private async fetchLiveSegments(limit: number, search: string) {
    const credentials = await this.requireCredentials();
    const results: ShopifySegmentNode[] = [];
    let cursor: string | undefined;
    let hasNextPage = true;
    let fetchedPages = 0;
    const target = Math.min(Math.max(limit * 2, limit), 150);

    while (hasNextPage && results.length < target && fetchedPages < 5) {
      const response = await this.shopify.graphql<{
        segments?: {
          edges: Array<{ cursor: string; node: ShopifySegmentNode }>;
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>(credentials, `
        query GetSegments($first: Int!, $after: String) {
          segments(first: $first, after: $after, reverse: true) {
            edges {
              cursor
              node {
                id
                name
                query
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, { first: SEGMENT_CATALOG_PAGE_SIZE, after: cursor || null });

      const edges = response?.segments?.edges || [];
      for (const edge of edges) {
        const segment = edge?.node;
        if (!segment?.id || !segment?.name) continue;
        if (search && !`${segment.name} ${segment.query || ''}`.toLowerCase().includes(search)) continue;
        results.push({ id: segment.id, name: segment.name, query: segment.query || '' });
      }

      hasNextPage = Boolean(response?.segments?.pageInfo?.hasNextPage);
      cursor = response?.segments?.pageInfo?.endCursor || undefined;
      fetchedPages += 1;
    }

    return results.slice(0, limit);
  }

  private async fetchSegmentById(shopifySegmentId: string) {
    const credentials = await this.requireCredentials();
    const response = await this.shopify.graphql<{ segment?: ShopifySegmentNode | null }>(credentials, `
      query GetSegment($id: ID!) {
        segment(id: $id) {
          id
          name
          query
        }
      }
    `, { id: shopifySegmentId });

    if (!response?.segment?.id || !response.segment.name) return null;
    return {
      id: response.segment.id,
      name: response.segment.name,
      query: response.segment.query || '',
    } satisfies ShopifySegmentNode;
  }

  private async fetchAllSegmentMembers(shopifySegmentId: string) {
    const credentials = await this.requireCredentials();
    const members: ShopifySegmentMembershipEdge[] = [];
    let cursor: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await this.shopify.graphql<{
        customerSegmentMembers?: {
          edges: ShopifySegmentMembershipEdge[];
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>(credentials, `
        query GetCustomerSegmentMembers($segmentId: ID!, $first: Int!, $after: String) {
          customerSegmentMembers(segmentId: $segmentId, first: $first, after: $after) {
            totalCount
            edges {
              cursor
              node {
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        segmentId: shopifySegmentId,
        first: SEGMENT_MEMBERS_PAGE_SIZE,
        after: cursor || null,
      });

      members.push(...(response?.customerSegmentMembers?.edges || []));
      hasNextPage = Boolean(response?.customerSegmentMembers?.pageInfo?.hasNextPage);
      cursor = response?.customerSegmentMembers?.pageInfo?.endCursor || undefined;
    }

    return members;
  }

  private async upsertSegmentMetadata(segments: ShopifySegmentNode[]) {
    for (const segment of segments) {
      await this.prisma.db.shopifyCustomerSegment.upsert({
        where: { tenantId_shopifySegmentId: { tenantId: this.tenantId(), shopifySegmentId: segment.id } },
        create: {
          id: prefixedId('shseg'),
          tenantId: this.tenantId(),
          shopifySegmentId: segment.id,
          name: segment.name,
          query: segment.query,
          lastSeenAt: new Date(),
        },
        update: {
          name: segment.name,
          query: segment.query,
          lastSeenAt: new Date(),
        },
      });
    }
  }

  private normalizeSegmentIds(values: Array<string | number>) {
    return Array.from(new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => this.isValidSegmentId(value)),
    ));
  }

  private isValidSegmentId(value: string) {
    return value.startsWith(SHOPIFY_SEGMENT_GID_PREFIX);
  }

  private parseShopifyCustomerId(value: string) {
    const match = String(value || '').match(/\/(\d+)$/);
    return match?.[1] ?? null;
  }

  private async filterCanonicalShopifyCustomerIds(shopifyCustomerIds: string[]) {
    if (shopifyCustomerIds.length === 0) return [];
    const canonicalCustomers = await this.prisma.db.customer.findMany({
      where: { shopifyCustomerId: { in: shopifyCustomerIds }, status: 'active' },
      select: { shopifyCustomerId: true },
    });
    const canonicalIds = new Set(canonicalCustomers.map((customer) => customer.shopifyCustomerId).filter(Boolean));
    return shopifyCustomerIds.filter((shopifyCustomerId) => canonicalIds.has(shopifyCustomerId));
  }

  private async requireCredentials() {
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) throw new BadRequestException('Shopify credentials are not configured for this tenant.');
    return credentials;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}

function chunks<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}
