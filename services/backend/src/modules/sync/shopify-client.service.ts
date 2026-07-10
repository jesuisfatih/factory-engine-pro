import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../shared/crypto.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { normalizeShopDomain } from './shopify-domain.js';

export interface ShopifyCredentials {
  shopifyDomain: string;
  adminToken: string;
  apiVersion: string;
  source: 'tenant_config' | 'env';
}

export interface ShopifyCredentialState {
  credentialRequired: boolean;
  configured: boolean;
  shopifyDomain: string | null;
  source: 'tenant_config' | 'env' | 'none';
}

export interface ShopifyPage<T> {
  items: T[];
  nextCursor: string | null;
}

const SHOPIFY_GRAPHQL_MAX_ATTEMPTS = 7;
const SHOPIFY_GRAPHQL_BASE_RETRY_MS = 750;
const SHOPIFY_GRAPHQL_MAX_RETRY_MS = 30_000;

export class ShopifyAdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerCode?: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ShopifyClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async credentialState(tenantId = this.tenantContext.get()?.tenantId): Promise<ShopifyCredentialState> {
    const config = tenantId ? await this.prisma.db.tenantConfig.findFirst({
      where: { tenantId },
      select: { shopifyDomain: true, shopifyAdminTokenEncrypted: true },
    }) : null;
    const shopifyDomain = normalizeShopDomain(tenantId ? config?.shopifyDomain : this.envShopifyDomain());
    const tenantToken = this.crypto.decrypt(config?.shopifyAdminTokenEncrypted)?.trim();
    const envToken = tenantId ? null : this.envAdminToken();
    const source = tenantToken ? 'tenant_config' : envToken ? 'env' : 'none';
    const configured = Boolean(shopifyDomain && (tenantToken || envToken));
    return {
      credentialRequired: !configured,
      configured,
      shopifyDomain,
      source,
    };
  }

  async resolveCredentials(tenantId = this.tenantContext.get()?.tenantId): Promise<ShopifyCredentials | null> {
    const config = tenantId ? await this.prisma.db.tenantConfig.findFirst({
      where: { tenantId },
      select: { shopifyDomain: true, shopifyAdminTokenEncrypted: true },
    }) : null;
    const shopifyDomain = normalizeShopDomain(tenantId ? config?.shopifyDomain : this.envShopifyDomain());
    const tenantToken = this.crypto.decrypt(config?.shopifyAdminTokenEncrypted)?.trim();
    const envToken = tenantId ? null : this.envAdminToken();
    const adminToken = tenantToken || envToken;
    if (!shopifyDomain || !adminToken) return null;
    return {
      shopifyDomain,
      adminToken,
      apiVersion: this.config.get<string>('SHOPIFY_API_VERSION')?.trim() || '2025-10',
      source: tenantToken ? 'tenant_config' : 'env',
    };
  }

  customers(credentials: ShopifyCredentials, cursor?: string | null, query: Record<string, string> = {}) {
    return this.getPage<Record<string, unknown>>(credentials, '/customers.json', 'customers', cursor, query);
  }

  products(credentials: ShopifyCredentials, cursor?: string | null, query: Record<string, string> = {}) {
    return this.getPage<Record<string, unknown>>(credentials, '/products.json', 'products', cursor, query);
  }

  orders(credentials: ShopifyCredentials, cursor?: string | null, query: Record<string, string> = {}) {
    return this.getPage<Record<string, unknown>>(
      credentials,
      '/orders.json',
      'orders',
      cursor,
      cursor ? {} : { status: 'any', ...query },
    );
  }

  customerOrders(credentials: ShopifyCredentials, shopifyCustomerId: string, cursor?: string | null, query: Record<string, string> = {}) {
    return this.getPage<Record<string, unknown>>(
      credentials,
      `/customers/${encodeURIComponent(shopifyCustomerId)}/orders.json`,
      'orders',
      cursor,
      cursor ? {} : { status: 'any', ...query },
    );
  }

  async shop(credentials: ShopifyCredentials) {
    const url = this.adminUrl(credentials, '/shop.json');
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'X-Shopify-Access-Token': credentials.adminToken,
      },
    });
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      const providerMessage = extractShopifyError(body) ?? text.trim().slice(0, 240);
      throw new ShopifyAdminApiError(
        `Shopify Admin API failed with ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
        response.status,
        typeof body?.errors === 'string' ? body.errors : undefined,
      );
    }
    return body?.shop && typeof body.shop === 'object' && !Array.isArray(body.shop)
      ? body.shop as Record<string, unknown>
      : {};
  }

  async graphql<T = Record<string, unknown>>(
    credentials: ShopifyCredentials,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const url = this.adminUrl(credentials, '/graphql.json');
    let lastError: ShopifyAdminApiError | null = null;
    for (let attempt = 1; attempt <= SHOPIFY_GRAPHQL_MAX_ATTEMPTS; attempt += 1) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'X-Shopify-Access-Token': credentials.adminToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      const text = await response.text();
      const body = parseJson(text);
      const graphqlErrors = Array.isArray(body?.errors) ? body.errors : [];
      if (response.ok && graphqlErrors.length === 0) {
        return ((body?.data && typeof body.data === 'object') ? body.data : {}) as T;
      }

      const providerMessage = extractShopifyError(body) ?? text.trim().slice(0, 240);
      lastError = new ShopifyAdminApiError(
        `Shopify Admin GraphQL failed with ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
        response.status,
        typeof body?.errors === 'string' ? body.errors : undefined,
      );
      if (attempt < SHOPIFY_GRAPHQL_MAX_ATTEMPTS && isShopifyThrottle(response, body, text)) {
        await sleep(shopifyGraphqlRetryDelayMs(response, body, attempt));
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new ShopifyAdminApiError('Shopify Admin GraphQL failed', 0);
  }

  private async getPage<T>(
    credentials: ShopifyCredentials,
    path: string,
    collectionKey: string,
    cursor?: string | null,
    query: Record<string, string> = {},
  ): Promise<ShopifyPage<T>> {
    const url = this.adminUrl(credentials, path);
    url.searchParams.set('limit', '250');
    if (cursor) {
      url.searchParams.set('page_info', cursor);
    } else {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'X-Shopify-Access-Token': credentials.adminToken,
      },
    });
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      const providerMessage = extractShopifyError(body) ?? text.trim().slice(0, 240);
      throw new ShopifyAdminApiError(
        `Shopify Admin API failed with ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
        response.status,
        typeof body?.errors === 'string' ? body.errors : undefined,
      );
    }

    const items = Array.isArray(body?.[collectionKey]) ? body[collectionKey] as T[] : [];
    return {
      items,
      nextCursor: nextPageInfo(response.headers.get('link')),
    };
  }

  private adminUrl(credentials: ShopifyCredentials, path: string) {
    return new URL(`https://${credentials.shopifyDomain}/admin/api/${credentials.apiVersion}${path}`);
  }

  private envAdminToken() {
    return this.config.get<string>('SHOPIFY_ACCESS_TOKEN')?.trim()
      || this.config.get<string>('SHOPIFY_ADMIN_ACCESS_TOKEN')?.trim()
      || this.config.get<string>('SHOPIFY_ADMIN_TOKEN')?.trim()
      || null;
  }

  private envShopifyDomain() {
    return this.config.get<string>('SHOPIFY_STORE_DOMAIN')?.trim()
      || this.config.get<string>('SHOPIFY_SHOP_DOMAIN')?.trim()
      || this.config.get<string>('SHOPIFY_DOMAIN')?.trim()
      || null;
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractShopifyError(body: Record<string, unknown> | null) {
  if (!body) return null;
  if (typeof body.errors === 'string') return body.errors.slice(0, 240);
  if (Array.isArray(body.errors)) return body.errors.map(formatShopifyError).join(', ').slice(0, 240);
  if (body.errors && typeof body.errors === 'object') return JSON.stringify(body.errors).slice(0, 240);
  return null;
}

function formatShopifyError(error: unknown) {
  if (!error || typeof error !== 'object') return String(error);
  const record = error as Record<string, unknown>;
  const rawMessage = typeof record.message === 'string' ? record.message : null;
  const message = rawMessage ?? safeJson(record);
  const path = Array.isArray(record.path) ? ` path=${record.path.join('.')}` : '';
  return `${message}${path}`;
}

function isShopifyThrottle(response: Response, body: Record<string, unknown> | null, text: string) {
  if (response.status === 429) return true;
  const providerMessage = (extractShopifyError(body) ?? text).toLowerCase();
  if (providerMessage.includes('throttled') || providerMessage.includes('throttle')) return true;
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  return errors.some((error) => safeJson(error).toLowerCase().includes('throttled')
    || safeJson(error).toLowerCase().includes('throttle'));
}

function shopifyGraphqlRetryDelayMs(response: Response, body: Record<string, unknown> | null, attempt: number) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return clamp(retryAfter * 1000, SHOPIFY_GRAPHQL_BASE_RETRY_MS, SHOPIFY_GRAPHQL_MAX_RETRY_MS);
  }

  const extensions = asRecord(body?.extensions);
  const cost = asRecord(extensions.cost);
  const throttleStatus = asRecord(cost.throttleStatus);
  const requestedQueryCost = Number(cost.requestedQueryCost ?? 0);
  const currentlyAvailable = Number(throttleStatus.currentlyAvailable ?? 0);
  const restoreRate = Number(throttleStatus.restoreRate ?? 0);
  if (requestedQueryCost > currentlyAvailable && restoreRate > 0) {
    const waitForBucket = ((requestedQueryCost - currentlyAvailable) / restoreRate) * 1000;
    return clamp(Math.ceil(waitForBucket + 500), SHOPIFY_GRAPHQL_BASE_RETRY_MS, SHOPIFY_GRAPHQL_MAX_RETRY_MS);
  }

  const exponential = SHOPIFY_GRAPHQL_BASE_RETRY_MS * 2 ** (attempt - 1);
  return clamp(exponential, SHOPIFY_GRAPHQL_BASE_RETRY_MS, SHOPIFY_GRAPHQL_MAX_RETRY_MS);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextPageInfo(linkHeader: string | null) {
  if (!linkHeader) return null;
  const nextLink = linkHeader.split(',').find((part) => part.includes('rel="next"'));
  const match = nextLink?.match(/<([^>]+)>/);
  if (!match?.[1]) return null;
  try {
    return new URL(match[1]).searchParams.get('page_info');
  } catch {
    return null;
  }
}
