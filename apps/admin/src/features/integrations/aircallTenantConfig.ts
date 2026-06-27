import { adminApi } from '@/lib/api';

export const aircallTenantConfigQueryKey = ['identity', 'tenant-config'] as const;

export interface AircallTenantConfig {
  hasAircallApiId: boolean;
  hasAircallApiToken: boolean;
  hasAircallWebhookSecret: boolean;
}

export function fetchAircallTenantConfig() {
  return adminApi.tenantConfig() as Promise<AircallTenantConfig>;
}

export function hasAircallCredentials(config: AircallTenantConfig | undefined) {
  return Boolean(config?.hasAircallApiId && config.hasAircallApiToken && config.hasAircallWebhookSecret);
}
