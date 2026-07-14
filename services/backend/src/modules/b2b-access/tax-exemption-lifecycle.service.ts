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
  }) {
    const customer = await this.prisma.db.customer.findFirst({ where: { id: input.customerId } });
    if (!customer) throw new Error('Approved B2B customer was not found');

    const rawData = mergeRawData(customer.rawData, { tax_exempt: true, taxExemptionExpiresAt: input.expiresAt.toISOString() });
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

    const shopifySyncError = await this.syncShopifyTaxExempt(customer.shopifyCustomerId, true);
    if (shopifySyncError) {
      await this.prisma.db.customerTaxExemption.updateMany({
        where: { customerId: customer.id },
        data: { shopifySyncError },
      });
      this.logger.warn('b2b_access', 'tax_exemption_shopify_enable_failed', shopifySyncError, {
        customer_id: customer.id,
        request_id: input.requestId,
      });
    }
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

    const shopifySyncError = await this.syncShopifyTaxExempt(customer.shopifyCustomerId, false);
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

  private async syncShopifyTaxExempt(shopifyCustomerId: string | null, taxExempt: boolean) {
    if (!shopifyCustomerId) return null;
    const credentials = await this.shopify.resolveCredentials();
    if (!credentials) return 'Shopify credentials are not configured for this tenant.';
    const id = shopifyCustomerId.startsWith('gid://')
      ? shopifyCustomerId
      : `gid://shopify/Customer/${shopifyCustomerId}`;
    try {
      const response = await this.shopify.graphql<{
        customerUpdate?: { userErrors?: Array<{ field?: string[]; message: string }> };
      }>(credentials, `
        mutation UpdateCustomerTaxExempt($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id taxExempt }
            userErrors { field message }
          }
        }
      `, { input: { id, taxExempt } });
      const errors = response.customerUpdate?.userErrors ?? [];
      return errors.length ? errors.map((error) => error.message).join('; ') : null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
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

function accountsUrl(path: string) {
  const base = (process.env.ACCOUNTS_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}
