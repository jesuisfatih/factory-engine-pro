import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService } from '../mail/mail.service.js';
import { normalizeShopDomain } from '../sync/shopify-domain.js';
import { SyncService } from '../sync/sync.service.js';
import { safeShopifyWebhookHeaders, shopifyWebhookDedupeKey, verifyShopifyWebhookHmac } from './shopify-webhook.js';

type ShopifyWebhookTopic = 'orders/create' | 'orders/updated';

interface ShopifyWebhookInput {
  topic: ShopifyWebhookTopic;
  rawBody: string;
  headers: Record<string, string>;
}

@Injectable()
export class ShopifyWebhookIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tenantContext: TenantContextService,
    private readonly sync: SyncService,
    private readonly mail: MailService,
    private readonly logger: AppLogger,
  ) {}

  async receive(input: ShopifyWebhookInput) {
    const shopDomain = normalizeShopDomain(input.headers['x-shopify-shop-domain']);
    if (!shopDomain) throw new BadRequestException('Shopify shop domain header is required.');

    const config = await this.prisma.tenantConfig.findFirst({
      where: { shopifyDomain: { equals: shopDomain, mode: 'insensitive' } },
      select: { tenantId: true, webhookHmacKeyEncrypted: true },
    });
    const secret = this.crypto.decrypt(config?.webhookHmacKeyEncrypted)?.trim();
    if (!config || !secret || !verifyShopifyWebhookHmac(input.rawBody, input.headers['x-shopify-hmac-sha256'], secret)) {
      this.logger.warn('shopify_webhook', 'signature_rejected', 'Shopify webhook signature verification failed.', {
        shop_domain: shopDomain,
        topic: input.topic,
      });
      throw new UnauthorizedException('Shopify webhook signature is invalid.');
    }

    const payload = parsePayload(input.rawBody);
    const webhookId = nonEmpty(input.headers['x-shopify-webhook-id']);
    const dedupeKey = shopifyWebhookDedupeKey(input.topic, input.rawBody, webhookId);

    return this.tenantContext.run(
      { requestId: `shopify-webhook:${webhookId ?? dedupeKey.slice(-16)}`, tenantId: config.tenantId, permissions: [] },
      () => this.processVerifiedWebhook({
        tenantId: config.tenantId,
        shopDomain,
        topic: input.topic,
        webhookId,
        dedupeKey,
        payload,
        headers: safeShopifyWebhookHeaders(input.headers),
      }),
    );
  }

  private async processVerifiedWebhook(input: {
    tenantId: string;
    shopDomain: string;
    topic: ShopifyWebhookTopic;
    webhookId: string | null;
    dedupeKey: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  }) {
    let inbox = await this.prisma.db.shopifyWebhookInbox.findFirst({
      where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey },
    });
    if (!inbox) {
      try {
        inbox = await this.prisma.db.shopifyWebhookInbox.create({
          data: {
            id: prefixedId('shwin'),
            tenantId: input.tenantId,
            shopDomain: input.shopDomain,
            topic: input.topic,
            webhookId: input.webhookId,
            dedupeKey: input.dedupeKey,
            payload: input.payload as Prisma.InputJsonValue,
            headers: input.headers as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        inbox = await this.prisma.db.shopifyWebhookInbox.findFirst({
          where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey },
        });
      }
    }
    if (!inbox) throw new BadRequestException('Shopify webhook could not be claimed.');

    const claim = await this.prisma.db.shopifyWebhookInbox.updateMany({
      where: {
        tenantId: input.tenantId,
        id: inbox.id,
        status: { in: ['received', 'failed'] },
      },
      data: { status: 'processing', errorMessage: null, processedAt: null },
    });
    if (claim.count === 0) {
      return { accepted: true, duplicate: true, status: inbox.status, webhookId: inbox.webhookId };
    }

    try {
      await this.sync.ingestWebhookOrder(input.payload);
      const deliveries = input.topic === 'orders/create'
        ? await this.sendOrderConfirmation(input.payload)
        : await this.sendShipmentNotifications(input.payload);
      await this.prisma.db.shopifyWebhookInbox.updateMany({
        where: { tenantId: input.tenantId, id: inbox.id },
        data: { status: 'processed', processedAt: new Date() },
      });
      this.logger.log('shopify_webhook', 'processed', 'Verified Shopify order webhook processed.', {
        inbox_id: inbox.id,
        topic: input.topic,
        shop_domain: input.shopDomain,
        delivery_ids: deliveries.map((delivery) => delivery.id),
      });
      return { accepted: true, duplicate: false, status: 'processed', webhookId: input.webhookId, deliveryIds: deliveries.map((delivery) => delivery.id) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.db.shopifyWebhookInbox.updateMany({
        where: { tenantId: input.tenantId, id: inbox.id },
        data: { status: 'failed', errorMessage: message.slice(0, 2_000) },
      });
      this.logger.error('shopify_webhook', 'processing_failed', message, {
        inbox_id: inbox.id,
        topic: input.topic,
        shop_domain: input.shopDomain,
      });
      throw error;
    }
  }

  private async sendOrderConfirmation(payload: Record<string, unknown>) {
    const contact = orderContact(payload);
    const shopifyOrderId = nonEmpty(payload.id);
    if (!contact.email || !shopifyOrderId) return [];
    return [await this.mail.sendOrderConfirmation({
      to: contact.email,
      recipientName: contact.name,
      shopifyOrderId,
      orderNumber: orderNumber(payload),
      total: numberValue(payload.total_price),
      currency: nonEmpty(payload.currency) ?? 'USD',
    })];
  }

  private async sendShipmentNotifications(payload: Record<string, unknown>) {
    const contact = orderContact(payload);
    const shopifyOrderId = nonEmpty(payload.id);
    if (!contact.email || !shopifyOrderId) return [];
    const fulfillments = Array.isArray(payload.fulfillments) ? payload.fulfillments : [];
    const deliveries = [];
    for (const entry of fulfillments) {
      if (!isRecord(entry) || nonEmpty(entry.status)?.toLowerCase() !== 'success') continue;
      const shipmentId = nonEmpty(entry.id);
      if (!shipmentId) continue;
      deliveries.push(await this.mail.sendOrderShipment({
        to: contact.email,
        recipientName: contact.name,
        shopifyOrderId,
        orderNumber: orderNumber(payload),
        shipmentId,
        trackingNumber: nonEmpty(entry.tracking_number),
        trackingUrl: nonEmpty(entry.tracking_url),
        trackingCompany: nonEmpty(entry.tracking_company),
      }));
    }
    return deliveries;
  }
}

function parsePayload(rawBody: string) {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (isRecord(parsed)) return parsed;
  } catch {
    // The signature was valid, but the payload is unusable for order ingestion.
  }
  throw new BadRequestException('Shopify webhook payload must be a JSON object.');
}

function orderContact(payload: Record<string, unknown>) {
  const customer = isRecord(payload.customer) ? payload.customer : {};
  const shipping = isRecord(payload.shipping_address) ? payload.shipping_address : {};
  const email = nonEmpty(payload.email) ?? nonEmpty(customer.email);
  const firstName = nonEmpty(customer.first_name) ?? nonEmpty(shipping.first_name);
  const lastName = nonEmpty(customer.last_name) ?? nonEmpty(shipping.last_name);
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || email || 'Customer';
  return { email, name };
}

function orderNumber(payload: Record<string, unknown>) {
  return nonEmpty(payload.name) ?? nonEmpty(payload.order_number) ?? nonEmpty(payload.id) ?? 'your order';
}

function nonEmpty(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}
