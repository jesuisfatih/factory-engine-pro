import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatDateOnly } from '../../shared/date-only.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService } from '../mail/mail.service.js';
import { ShopifyClientService } from '../sync/shopify-client.service.js';

const WARNING_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export type TaxExemptionMode = 'general' | 'state_reseller';

export interface TaxExemptionSyncResult {
  status: 'synced' | 'failed';
  mode: TaxExemptionMode;
  jurisdictions: string[];
  shopifyExemptions: string[];
  error: string | null;
  updatedAt: string;
}

@Injectable()
export class TaxExemptionLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly mail: MailService,
    private readonly shopify: ShopifyClientService,
    private readonly logger: AppLogger,
  ) {}

  async activateForApprovedRequest(input: {
    customerId: string;
    requestId: string;
    expiresAt: Date;
    certificateFileId?: string | null;
    mode: TaxExemptionMode;
    jurisdictions?: string[];
  }) {
    const customer = await this.prisma.db.customer.findFirst({ where: { id: input.customerId } });
    if (!customer) throw new Error('Approved B2B customer was not found');

    const jurisdictions = input.mode === 'state_reseller'
      ? normalizeStates(input.jurisdictions ?? [])
      : [];
    const shopifyExemptions = shopifyResellerExemptionsForStates(jurisdictions);
    const rawData = mergeRawData(customer.rawData, {
      tax_exempt: true,
      taxExemptionMode: input.mode,
      taxExemptionJurisdictions: jurisdictions,
      shopifyTaxExemptions: shopifyExemptions,
      taxExemptionExpiresAt: input.expiresAt.toISOString(),
    });
    await this.prisma.db.customer.updateMany({
      where: { id: customer.id },
      data: {
        status: 'active',
        tags: ensureTag(customer.tags, 'tax-exempt'),
        rawData,
      },
    });
    await this.prisma.db.customerTaxExemption.upsert({
      where: { customerId: customer.id },
      create: {
        id: prefixedId('taxex'),
        tenantId: this.tenantContext.require().tenantId!,
        customerId: customer.id,
        sourceRequestId: input.requestId,
        certificateFileId: input.certificateFileId ?? null,
        status: 'active',
        expiresAt: input.expiresAt,
      },
      update: {
        sourceRequestId: input.requestId,
        certificateFileId: input.certificateFileId ?? null,
        status: 'active',
        expiresAt: input.expiresAt,
        warningSentAt: null,
        warningDeliveryId: null,
        expiredAt: null,
        shopifyTaxExemptDisabledAt: null,
        shopifySyncError: null,
      },
    });

    const shopifySyncError = await this.syncShopifyTaxExemption(customer.shopifyCustomerId, {
      enabled: true,
      mode: input.mode,
      shopifyExemptions,
    });
    await this.prisma.db.customerTaxExemption.updateMany({
      where: { customerId: customer.id },
      data: {
        status: shopifySyncError ? 'sync_failed' : 'active',
        shopifySyncError,
      },
    });
    if (shopifySyncError) {
      this.logger.warn('b2b_access', 'tax_exemption_shopify_enable_failed', shopifySyncError, {
        customer_id: customer.id,
        request_id: input.requestId,
      });
    }
    return this.syncResult(input.mode, jurisdictions, shopifyExemptions, shopifySyncError);
  }

  async retryForApprovedRequest(input: {
    customerId: string;
    requestId: string;
  }) {
    const customer = await this.prisma.db.customer.findFirst({ where: { id: input.customerId } });
    if (!customer) throw new Error('Approved B2B customer was not found');
    const settings = taxSettingsFromRawData(customer.rawData);
    if (!settings) throw new Error('Tax exemption settings are missing for this approved request.');
    const shopifySyncError = await this.syncShopifyTaxExemption(customer.shopifyCustomerId, {
      enabled: true,
      mode: settings.mode,
      shopifyExemptions: settings.shopifyExemptions,
    });
    await this.prisma.db.customerTaxExemption.updateMany({
      where: { customerId: customer.id, sourceRequestId: input.requestId },
      data: {
        status: shopifySyncError ? 'sync_failed' : 'active',
        shopifySyncError,
      },
    });
    this.logger.log('b2b_access', 'tax_exemption_shopify_retry', 'Shopify tax exemption sync retried', {
      customer_id: customer.id,
      request_id: input.requestId,
      status: shopifySyncError ? 'failed' : 'synced',
    });
    return this.syncResult(
      settings.mode,
      settings.jurisdictions,
      settings.shopifyExemptions,
      shopifySyncError,
    );
  }

  async sweep() {
    const horizon = new Date(Date.now() + WARNING_WINDOW_MS);
    const records = await this.prisma.db.customerTaxExemption.findMany({
      where: {
        status: { in: ['active', 'expiring', 'sync_failed'] },
        expiresAt: { lte: horizon },
      },
      include: {
        customer: {
          include: {
            customerUsers: {
              where: { status: 'active' },
              select: { email: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { expiresAt: 'asc' },
    });

    let warned = 0;
    let expired = 0;
    let syncFailed = 0;
    for (const record of records) {
      if (record.expiresAt.getTime() <= Date.now()) {
        const result = await this.expire(record);
        expired += 1;
        if (result.shopifySyncError) syncFailed += 1;
      } else if (!record.warningSentAt) {
        await this.warn(record);
        warned += 1;
      }
    }

    this.logger.log('b2b_access', 'tax_exemption_lifecycle_sweep', 'Tax exemption lifecycle sweep completed', {
      records: records.length,
      warned,
      expired,
      sync_failed: syncFailed,
    });
    return { records: records.length, warned, expired, syncFailed };
  }

  private async warn(record: TaxExemptionRecord) {
    const recipient = primaryRecipient(record.customer);
    if (!recipient) return;
    const expiresAt = formatDateOnly(record.expiresAt);
    const delivery = await this.mail.sendTaxExemptEvent({
      eventKey: 'tax_exempt.certificate_expiring.user',
      eventId: `${record.id}:${expiresAt}`,
      to: recipient.email,
      recipientName: recipient.name,
      companyName: record.customer.companyName,
      requestId: record.sourceRequestId ?? record.id,
      expiresAt,
      actionUrl: accountsUrl('/profile'),
    });
    await this.prisma.db.customerTaxExemption.updateMany({
      where: { id: record.id },
      data: {
        status: 'expiring',
        warningSentAt: new Date(),
        warningDeliveryId: delivery.id,
      },
    });
  }

  private async expire(record: TaxExemptionRecord) {
    const customer = record.customer;
    await this.prisma.db.customer.updateMany({
      where: { id: customer.id },
      data: {
        status: 'tax_hold',
        tags: removeTag(customer.tags, 'tax-exempt'),
        rawData: mergeRawData(customer.rawData, { tax_exempt: false, taxExemptionExpiredAt: new Date().toISOString() }),
      },
    });

    const settings = taxSettingsFromRawData(customer.rawData) ?? {
      mode: 'general' as const,
      jurisdictions: [],
      shopifyExemptions: [],
    };
    const shopifySyncError = await this.syncShopifyTaxExemption(customer.shopifyCustomerId, {
      enabled: false,
      mode: settings.mode,
      shopifyExemptions: settings.shopifyExemptions,
    });
    const recipient = primaryRecipient(customer);
    if (recipient) {
      await this.mail.sendTaxExemptEvent({
        eventKey: 'tax_exempt.certificate_expired.user',
        eventId: `${record.id}:${formatDateOnly(record.expiresAt)}`,
        to: recipient.email,
        recipientName: recipient.name,
        companyName: customer.companyName,
        requestId: record.sourceRequestId ?? record.id,
        expiresAt: formatDateOnly(record.expiresAt),
        actionUrl: accountsUrl('/profile'),
      });
    }
    await this.prisma.db.customerTaxExemption.updateMany({
      where: { id: record.id },
      data: {
        status: shopifySyncError ? 'sync_failed' : 'expired',
        expiredAt: record.expiredAt ?? new Date(),
        shopifyTaxExemptDisabledAt: shopifySyncError ? null : new Date(),
        shopifySyncError,
      },
    });
    return { shopifySyncError };
  }

  private async syncShopifyTaxExemption(
    shopifyCustomerId: string | null,
    input: { enabled: boolean; mode: TaxExemptionMode; shopifyExemptions: string[] },
  ) {
    if (!shopifyCustomerId) return 'This portal customer is not linked to a Shopify customer.';
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) return 'Shopify credentials are not configured for this tenant.';
    const id = shopifyCustomerId.startsWith('gid://')
      ? shopifyCustomerId
      : `gid://shopify/Customer/${shopifyCustomerId}`;
    try {
      if (input.mode === 'state_reseller') {
        if (input.shopifyExemptions.length === 0) return 'At least one reseller jurisdiction is required.';
        const mutation = input.enabled ? 'customerAddTaxExemptions' : 'customerRemoveTaxExemptions';
        const response = await this.shopify.graphql<Record<string, {
          userErrors?: Array<{ field?: string[]; message: string }>;
        }>>(credentials, `
          mutation UpdateCustomerTaxExemptions($customerId: ID!, $taxExemptions: [TaxExemption!]!) {
            ${mutation}(customerId: $customerId, taxExemptions: $taxExemptions) {
              customer { id taxExempt taxExemptions }
              userErrors { field message }
            }
          }
        `, { customerId: id, taxExemptions: input.shopifyExemptions });
        const errors = response[mutation]?.userErrors ?? [];
        return errors.length ? errors.map((error) => error.message).join('; ') : null;
      }
      const response = await this.shopify.graphql<{
        customerUpdate?: { userErrors?: Array<{ field?: string[]; message: string }> };
      }>(credentials, `
        mutation UpdateCustomerTaxExempt($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id taxExempt }
            userErrors { field message }
          }
        }
      `, { input: { id, taxExempt: input.enabled } });
      const errors = response.customerUpdate?.userErrors ?? [];
      return errors.length ? errors.map((error) => error.message).join('; ') : null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  private syncResult(
    mode: TaxExemptionMode,
    jurisdictions: string[],
    shopifyExemptions: string[],
    error: string | null,
  ): TaxExemptionSyncResult {
    return {
      status: error ? 'failed' : 'synced',
      mode,
      jurisdictions,
      shopifyExemptions,
      error,
      updatedAt: new Date().toISOString(),
    };
  }
}

type TaxExemptionRecord = Prisma.CustomerTaxExemptionGetPayload<{
  include: {
    customer: {
      include: {
        customerUsers: {
          select: { email: true; firstName: true; lastName: true };
        };
      };
    };
  };
}>;

function primaryRecipient(customer: TaxExemptionRecord['customer']) {
  const user = customer.customerUsers[0];
  const email = user?.email ?? customer.email;
  if (!email) return null;
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : customer.companyName;
  return { email, name: name || email };
}

function ensureTag(tags: string[], tag: string) {
  return tags.some((item) => item.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag];
}

function removeTag(tags: string[], tag: string) {
  return tags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
}

function mergeRawData(value: Prisma.JsonValue | null, patch: Record<string, Prisma.JsonValue>) {
  const current = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
  return { ...current, ...patch } as Prisma.InputJsonValue;
}

export function shopifyResellerExemptionsForStates(states: string[]) {
  return normalizeStates(states).map((state) => `US_${state}_RESELLER_EXEMPTION`);
}

function normalizeStates(states: string[]) {
  return [...new Set(states.map((state) => state.trim().toUpperCase()).filter(Boolean))].sort();
}

function taxSettingsFromRawData(value: Prisma.JsonValue | null): {
  mode: TaxExemptionMode;
  jurisdictions: string[];
  shopifyExemptions: string[];
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const mode = value.taxExemptionMode === 'state_reseller' ? 'state_reseller' : value.taxExemptionMode === 'general' ? 'general' : null;
  if (!mode) return null;
  const jurisdictions = Array.isArray(value.taxExemptionJurisdictions)
    ? normalizeStates(value.taxExemptionJurisdictions.filter((item): item is string => typeof item === 'string'))
    : [];
  const shopifyExemptions = Array.isArray(value.shopifyTaxExemptions)
    ? value.shopifyTaxExemptions.filter((item): item is string => typeof item === 'string')
    : shopifyResellerExemptionsForStates(jurisdictions);
  return { mode, jurisdictions, shopifyExemptions };
}

function accountsUrl(path: string) {
  const base = (process.env.ACCOUNTS_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}
