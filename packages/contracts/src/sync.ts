import { z } from 'zod';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from './ai.js';

export const shopifySyncResourceSchema = z.enum(['customers', 'products', 'orders']);
export type ShopifySyncResource = z.infer<typeof shopifySyncResourceSchema>;

export const shopifyInitialSyncSchema = z.object({
  resources: z.array(shopifySyncResourceSchema).min(1).optional(),
});
export type ShopifyInitialSyncInput = z.infer<typeof shopifyInitialSyncSchema>;

export const shopifySyncStateSchema = z.object({
  resource: shopifySyncResourceSchema,
  status: z.string(),
  isRunning: z.boolean(),
  lastCompletedAt: z.string().nullable(),
  lastFailedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  totalRecordsSynced: z.number(),
  lastRunRecords: z.number(),
  snapshotRecords: z.number(),
  consecutiveFailures: z.number(),
  lastCursor: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
});
export type ShopifySyncState = z.infer<typeof shopifySyncStateSchema>;

export const shopifySyncStatusSchema = z.object({
  credentialRequired: z.boolean(),
  configured: z.boolean(),
  shopifyDomain: z.string().nullable(),
  isAnySyncing: z.boolean(),
  hasErrors: z.boolean(),
  entities: z.record(shopifySyncResourceSchema, shopifySyncStateSchema),
  recentLogs: z.array(z.object({
    id: z.string(),
    action: z.string(),
    status: z.string(),
    message: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    metadata: z.unknown(),
  })),
});
export type ShopifySyncStatus = z.infer<typeof shopifySyncStatusSchema>;

export const shopifyInitialSyncResponseSchema = z.object({
  message: z.string(),
  batchId: z.string(),
  queued: z.boolean(),
  resources: z.array(shopifySyncResourceSchema),
  syncLogIds: z.array(z.string()),
});
export type ShopifyInitialSyncResponse = z.infer<typeof shopifyInitialSyncResponseSchema>;

export const rollingBackfillTriggerSchema = z.object({
  recentDays: z.coerce.number().int().min(1).max(7).default(7),
  shopifyResources: z.array(shopifySyncResourceSchema).min(1).default(['customers', 'orders']),
  shopifySegmentLimit: z.coerce.number().int().min(1).max(100).default(100),
  aircallMaxPages: z.coerce.number().int().min(1).max(40).default(40),
  resolverLimit: z.coerce.number().int().min(1).max(10000).default(1000),
  targetResolverVersion: z.coerce.number().int().min(1).default(TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
});
export type RollingBackfillTriggerInput = z.infer<typeof rollingBackfillTriggerSchema>;

export type RollingBackfillSource = 'manual' | 'scheduled';
export type RollingBackfillStatus = 'queued' | 'running' | 'success' | 'partial_success' | 'failed' | 'skipped';
export type RollingBackfillStepStatus = 'success' | 'failed' | 'skipped';

export interface RollingBackfillStepDto {
  key: 'shopify_sync' | 'shopify_segments' | 'segment_evaluation' | 'aircall_recent_calls' | 'aircall_resolver' | 'customer_axis';
  status: RollingBackfillStepStatus;
  message: string;
  detail: unknown;
}

export interface RollingBackfillRunResponse {
  syncLogId: string;
  jobId: string | null;
  queued: boolean;
  status: RollingBackfillStatus;
  message: string;
  source: RollingBackfillSource;
  recentDays: number;
  startedAt: string;
  finishedAt: string | null;
  steps: RollingBackfillStepDto[];
}

export interface RollingBackfillStatusResponse {
  queueConfigured: boolean;
  schedulerCount: number;
  schedulers: Array<{
    id: string;
    name: string;
    pattern: string | null;
    nextRunAt: string | null;
  }>;
  recentRuns: RollingBackfillRunResponse[];
}

export interface ShopifyConnectionTestResponse {
  ok: boolean;
  status: 'ok' | 'missing_credentials' | 'provider_error' | 'network_error';
  credentialRequired: boolean;
  configured: boolean;
  source: 'tenant_config' | 'env' | 'none';
  shopifyDomain: string | null;
  apiVersion: string | null;
  checkedAt: string;
  latencyMs: number;
  shopId: string | null;
  shopName: string | null;
  shopEmail: string | null;
  error: string | null;
}
