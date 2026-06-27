import type { ShopifySyncResource } from '@factory-engine-pro/contracts';

export const SHOPIFY_INITIAL_SYNC_JOB = 'initial-sync';
export const SHOPIFY_SYNC_RESOURCES: ShopifySyncResource[] = ['customers', 'products', 'orders'];
export const SHOPIFY_SYNC_LOCK_TTL_MS = 60 * 60 * 1000;
export const SHOPIFY_SYNC_MAX_FAILURES = 5;
