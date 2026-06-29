import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../shared/crypto.service.js';
import { PrismaService } from '../../shared/prisma.service.js';

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
  ) {}

  async credentialState(): Promise<ShopifyCredentialState> {
    const config = await this.prisma.db.tenantConfig.findFirst({
      select: { shopifyDomain: true, shopifyAdminTokenEncrypted: true },
    });
    const shopifyDomain = normalizeShopDomain(
      config?.shopifyDomain
      ?? this.config.get<string>('SHOPIFY_STORE_DOMAIN')
      ?? this.config.get<string>('SHOPIFY_SHOP_DOMAIN')
      ?? this.config.get<string>('SHOPIFY_DOMAIN')
      ?? null,
    );
    const tenantToken = this.crypto.decrypt(config?.shopifyAdminTokenEncrypted)?.trim();
    const envToken = this.envAdminToken();
    const source = tenantToken ? 'tenant_config' : envToken ? 'env' : 'none';
    const configured = Boolean(shopifyDomain && (tenantToken || envToken));
    return {
      credentialRequired: !configured,
      configured,
      shopifyDomain,
      source,
    };
  }

  async resolveCredentials(): Promise<ShopifyCredentials | null> {
    const config = await this.prisma.db.tenantConfig.findFirst({
      select: { shopifyDomain: true, shopifyAdminTokenEncrypted: true },
    });
    const shopifyDomain = normalizeShopDomain(
      config?.shopifyDomain
      ?? this.config.get<string>('SHOPIFY_STORE_DOMAIN')
      ?? this.config.get<string>('SHOPIFY_SHOP_DOMAIN')
      ?? this.config.get<string>('SHOPIFY_DOMAIN')
      ?? null,
    );
    const tenantToken = this.crypto.decrypt(config?.shopifyAdminTokenEncrypted)?.trim();
    const envToken = this.envAdminToken();
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
    if (!response.ok || graphqlErrors.length > 0) {
      const providerMessage = extractShopifyError(body) ?? text.trim().slice(0, 240);
      throw new ShopifyAdminApiError(
        `Shopify Admin GraphQL failed with ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
        response.status,
        typeof body?.errors === 'string' ? body.errors : undefined,
      );
    }
    return ((body?.data && typeof body.data === 'object') ? body.data : {}) as T;
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
}

function normalizeShopDomain(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
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
  const message = typeof record.message === 'string' ? record.message : JSON.stringify(record);
  const path = Array.isArray(record.path) ? ` path=${record.path.join('.')}` : '';
  return `${message}${path}`;
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
