import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import type { StorefrontLinkCustomerBody, StorefrontQuery } from './storefront.controller.js';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
  ) {}

  async handoffUrl(query: StorefrontQuery) {
    const tenant = await this.resolveTenant(query);
    const accountsUrl = this.accountsUrl();
    const email = customerEmail(query);
    const params = new URLSearchParams();
    if (tenant.shop) params.set('shop', tenant.shop);
    if (email) params.set('email', email);
    if (tenant.tenantId) params.set('tenantId', tenant.tenantId);
    params.set('sourceSurface', 'shopify-header-block');
    return `${accountsUrl}/login${params.toString() ? `?${params}` : ''}`;
  }

  async b2bContext(query: StorefrontQuery) {
    const tenant = await this.resolveTenant(query);
    const accountsUrl = this.accountsUrl();
    const email = customerEmail(query);
    const requestParams = new URLSearchParams();
    const loginParams = new URLSearchParams();
    if (tenant.shop) {
      requestParams.set('shop', tenant.shop);
      loginParams.set('shop', tenant.shop);
    }
    if (email) {
      requestParams.set('email', email);
      loginParams.set('email', email);
    }
    requestParams.set('sourceSurface', 'shopify-header-block');
    loginParams.set('sourceSurface', 'shopify-header-block');

    return {
      enabled: true,
      isAuthenticated: false,
      tenant: tenant.tenantId ? {
        id: tenant.tenantId,
        slug: tenant.slug,
        name: tenant.name,
      } : null,
      shop: tenant.shop,
      onboarding: {
        ctaHref: `${accountsUrl}/request-invitation?${requestParams}`,
        loginHref: `${accountsUrl}/login?${loginParams}`,
      },
      marketing: {
        headline: 'B2B account workspace',
        subheadline: 'Orders, invoices, reorder tools, and team access in one portal.',
      },
    };
  }

  async session(query: StorefrontQuery) {
    const tenant = await this.resolveTenant(query);
    const email = customerEmail(query);
    if (!tenant.tenantId || !email) {
      return {
        isAuthenticated: false,
        needsRegistration: Boolean(email),
        company: null,
        context: this.publicContext(tenant),
      };
    }
    const user = await this.prisma.customerUser.findFirst({
      where: { tenantId: tenant.tenantId, email: { equals: email, mode: 'insensitive' }, status: 'active' },
      include: { customer: true },
    });
    if (!user) {
      return {
        isAuthenticated: false,
        needsRegistration: true,
        company: null,
        context: this.publicContext(tenant),
      };
    }
    return {
      isAuthenticated: true,
      needsRegistration: false,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
      company: {
        id: user.customer.id,
        name: user.customer.companyName,
      },
      context: this.customerContext(tenant, user.customer),
    };
  }

  async dashboard(query: StorefrontQuery) {
    const tenant = await this.resolveTenant(query);
    const email = customerEmail(query);
    const shopifyCustomerId = shopifyCustomerIdFrom(query);
    if (!tenant.tenantId) {
      return { user: null, context: this.publicContext(tenant), stats: emptyStats() };
    }
    if (!email && !shopifyCustomerId) {
      return { user: null, context: this.publicContext(tenant), stats: emptyStats() };
    }
    const customerOr: Prisma.CustomerWhereInput[] = [
      ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
      ...(shopifyCustomerId ? [{ shopifyCustomerId }] : []),
    ];
    const customer = await this.prisma.customer.findFirst({
      where: {
        tenantId: tenant.tenantId,
        OR: customerOr,
      },
    });
    if (!customer) {
      return { user: null, context: this.publicContext(tenant), stats: emptyStats() };
    }
    const user = email
      ? await this.prisma.customerUser.findFirst({
          where: { tenantId: tenant.tenantId, customerId: customer.id, email: { equals: email, mode: 'insensitive' }, status: 'active' },
        })
      : null;
    const stats = await this.dashboardStats(tenant.tenantId, customer.id);
    return {
      user: user ? {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      } : null,
      context: this.customerContext(tenant, customer),
      stats,
    };
  }

  async linkCustomer(query: StorefrontQuery, body: StorefrontLinkCustomerBody) {
    const tenant = await this.resolveTenant(query);
    const email = customerEmail({ ...query, ...body });
    if (!tenant.tenantId || !email) return { linked: false };
    const user = await this.prisma.customerUser.findFirst({
      where: { tenantId: tenant.tenantId, email: { equals: email, mode: 'insensitive' }, status: 'active' },
      select: { id: true, customerId: true },
    });
    return {
      linked: Boolean(user),
      customerId: user?.customerId ?? null,
    };
  }

  private async resolveTenant(query: StorefrontQuery) {
    const shop = cleanShopDomain(query.shop);
    const contextTenantId = this.tenantContext.get()?.tenantId;
    if (contextTenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: contextTenantId },
        include: { config: true },
      });
      return {
        tenantId: tenant?.id ?? contextTenantId,
        slug: tenant?.slug ?? null,
        name: tenant?.name ?? null,
        shop: shop ?? cleanShopDomain(tenant?.config?.shopifyDomain) ?? null,
      };
    }

    const config = shop ? await this.prisma.tenantConfig.findFirst({
      where: {
        OR: [
          { shopifyDomain: { equals: shop, mode: 'insensitive' } },
          { shopifyDomain: { equals: `https://${shop}`, mode: 'insensitive' } },
          { shopifyDomain: { equals: `http://${shop}`, mode: 'insensitive' } },
        ],
      },
      include: { tenant: true },
    }) : null;
    const tenantId = config?.tenantId ?? this.defaultTenantId();
    if (tenantId) {
      this.tenantContext.set({ tenantId });
    }
    if (config?.tenant) {
      return {
        tenantId: config.tenantId,
        slug: config.tenant.slug,
        name: config.tenant.name,
        shop: shop ?? cleanShopDomain(config.shopifyDomain),
      };
    }
    if (tenantId) {
      const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, include: { config: true } });
      return {
        tenantId,
        slug: tenant?.slug ?? null,
        name: tenant?.name ?? null,
        shop: shop ?? cleanShopDomain(tenant?.config?.shopifyDomain) ?? null,
      };
    }
    return { tenantId: null, slug: null, name: null, shop: shop ?? null };
  }

  private async dashboardStats(tenantId: string, customerId: string) {
    const [pendingCarts, invoicesDue] = await Promise.all([
      this.prisma.accountReorderCart.count({
        where: { tenantId, customerId, status: { in: ['review_required', 'ready', 'checkout_pending'] } },
      }),
      this.prisma.accountInvoice.count({
        where: { tenantId, customerId, status: { in: ['unpaid', 'overdue', 'partially_paid'] } },
      }),
    ]);
    return { pendingCarts, invoicesDue };
  }

  private publicContext(tenant: Awaited<ReturnType<StorefrontService['resolveTenant']>>) {
    return {
      company: tenant.name ? { name: tenant.name } : null,
      marketing: {
        headline: 'B2B account workspace',
        subheadline: 'Orders, invoices, reorder tools, and team access in one portal.',
      },
    };
  }

  private customerContext(tenant: Awaited<ReturnType<StorefrontService['resolveTenant']>>, customer: {
    id: string;
    companyName: string;
    email: string | null;
    shopifyCustomerId: string | null;
  }) {
    return {
      company: {
        id: customer.id,
        name: customer.companyName,
        email: customer.email,
        shopifyCustomerId: customer.shopifyCustomerId,
      },
      marketing: {
        headline: `${customer.companyName} B2B portal`,
        subheadline: 'Review orders, invoices, reorder tools, and team access.',
      },
      tenant: tenant.tenantId ? {
        id: tenant.tenantId,
        slug: tenant.slug,
        name: tenant.name,
      } : null,
    };
  }

  private accountsUrl() {
    return firstConfiguredUrl([
      this.config.get<string>('ACCOUNTS_URL'),
      this.config.get<string>('CUSTOMER_ACCOUNTS_URL'),
    ]) || 'https://accounts.dtfbank.com';
  }

  private defaultTenantId() {
    return this.config.get<string>('STOREFRONT_DEFAULT_TENANT_ID')?.trim()
      || this.config.get<string>('DEFAULT_TENANT_ID')?.trim()
      || null;
  }
}

function emptyStats() {
  return { pendingCarts: 0, invoicesDue: 0 };
}

function customerEmail(query: StorefrontQuery | StorefrontLinkCustomerBody) {
  return textValue(query.email) || textValue(query.customer_email) || textValue(query.customerEmail);
}

function shopifyCustomerIdFrom(query: StorefrontQuery | StorefrontLinkCustomerBody) {
  return textValue(query.shopifyCustomerId) || textValue(query.shopify_customer_id);
}

function cleanShopDomain(value: string | null | undefined) {
  const trimmed = textValue(value).toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstConfiguredUrl(values: Array<string | undefined>) {
  for (const value of values) {
    const url = textValue(value);
    if (/^https?:\/\//i.test(url)) return url.replace(/\/+$/, '');
  }
  return '';
}
