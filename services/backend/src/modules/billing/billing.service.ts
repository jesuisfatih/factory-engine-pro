import { BadGatewayException, BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingSession, BillingSubscriptionStatus, BillingSummary } from '@factory-engine-pro/contracts';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { verifyStripeSignature } from './stripe-signature.js';

const GRACE_PERIOD_DAYS = 7;
const DAY_MS = 86_400_000;
const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const KNOWN_STATUSES = new Set<BillingSubscriptionStatus>([
  'unconfigured', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused',
]);

interface StripeObject {
  id?: string;
  object?: string;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  status?: string | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  latest_invoice?: string | { id?: string; status?: string | null } | null;
  metadata?: Record<string, string> | null;
  url?: string | null;
}

interface StripeEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data?: { object?: StripeObject };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async summary(): Promise<BillingSummary> {
    const tenant = await this.currentTenant();
    const row = await this.prisma.db.tenantBillingSubscription.findFirst({ where: { tenantId: tenant.id } });
    return this.toSummary(tenant, row);
  }

  async createCheckoutSession(): Promise<BillingSession> {
    const tenant = await this.currentTenant();
    const plan = planForTenant(tenant.slug);
    const key = this.requiredStripeSecret();
    const priceId = this.priceIdForTenant(tenant.slug);
    if (!priceId) throw new ServiceUnavailableException('Stripe Price ID is not configured for this workspace plan.');

    let row = await this.prisma.db.tenantBillingSubscription.findFirst({ where: { tenantId: tenant.id } });
    if (row?.status === 'active' && row.stripeCustomerId) {
      throw new ConflictException('This workspace already has an active subscription. Use Manage billing instead.');
    }

    let customerId = row?.stripeCustomerId ?? null;
    if (!customerId) {
      const principalId = this.tenantContext.require().principalId;
      const member = principalId
        ? await this.prisma.db.member.findFirst({ where: { id: principalId }, select: { email: true, firstName: true, lastName: true } })
        : null;
      const customer = await this.stripeRequest<StripeObject>(key, 'POST', '/customers', {
        email: member?.email ?? undefined,
        name: member ? `${member.firstName} ${member.lastName}`.trim() : tenant.name,
        'metadata[tenant_id]': tenant.id,
        'metadata[tenant_slug]': tenant.slug,
      });
      if (!customer.id) throw new BadGatewayException('Stripe did not return a customer ID.');
      customerId = customer.id;
      row = await this.prisma.db.tenantBillingSubscription.upsert({
        where: { tenantId: tenant.id },
        create: {
          id: prefixedId('tbsub'), tenantId: tenant.id, stripeCustomerId: customerId, stripePriceId: priceId,
          planCode: plan.code, amountCents: plan.amountCents, status: 'unconfigured', enforcementEnabled: false,
        },
        update: {
          stripeCustomerId: customerId, stripePriceId: priceId, planCode: plan.code, amountCents: plan.amountCents,
        },
      });
    }

    const adminUrl = this.adminUrl();
    const session = await this.stripeRequest<StripeObject>(key, 'POST', '/checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: tenant.id,
      success_url: `${adminUrl}/settings/billing?checkout=success`,
      cancel_url: `${adminUrl}/settings/billing?checkout=cancelled`,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'metadata[tenant_id]': tenant.id,
      'metadata[tenant_slug]': tenant.slug,
      'subscription_data[metadata][tenant_id]': tenant.id,
      'subscription_data[metadata][tenant_slug]': tenant.slug,
    });
    if (!session.url) throw new BadGatewayException('Stripe did not return a Checkout URL.');
    this.logger.log('billing', 'checkout.created', 'Stripe subscription checkout created', { tenant_id: tenant.id, plan_code: plan.code });
    return { url: session.url };
  }

  async createPortalSession(): Promise<BillingSession> {
    const tenant = await this.currentTenant();
    const row = await this.prisma.db.tenantBillingSubscription.findFirst({ where: { tenantId: tenant.id } });
    if (!row?.stripeCustomerId) throw new ConflictException('No Stripe billing customer exists for this workspace yet.');
    const session = await this.stripeRequest<StripeObject>(this.requiredStripeSecret(), 'POST', '/billing_portal/sessions', {
      customer: row.stripeCustomerId,
      return_url: `${this.adminUrl()}/settings/billing`,
    });
    if (!session.url) throw new BadGatewayException('Stripe did not return a billing portal URL.');
    return { url: session.url };
  }

  async syncSubscription(): Promise<BillingSummary> {
    const tenant = await this.currentTenant();
    const row = await this.prisma.db.tenantBillingSubscription.findFirst({ where: { tenantId: tenant.id } });
    if (!row?.stripeSubscriptionId) return this.toSummary(tenant, row);
    const subscription = await this.stripeRequest<StripeObject>(this.requiredStripeSecret(), 'GET', `/subscriptions/${encodeURIComponent(row.stripeSubscriptionId)}`);
    await this.persistSubscription(tenant.id, subscription, row.stripeCustomerId);
    return this.summary();
  }

  async receiveWebhook(tenantSlug: string, rawBody: string, signature: string | undefined) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() ?? '';
    if (!verifyStripeSignature(rawBody, signature, secret)) throw new UnauthorizedException('Stripe webhook signature is invalid.');
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
    if (!tenant) throw new UnauthorizedException('Stripe webhook tenant is invalid.');
    const event = parseStripeEvent(rawBody);

    return this.tenantContext.run({ requestId: `stripe:${event.id}`, tenantId: tenant.id, permissions: [] }, async () => {
      const duplicate = await this.prisma.db.stripeBillingWebhookInbox.findFirst({ where: { stripeEventId: event.id } });
      if (duplicate?.status === 'processed') return { received: true, duplicate: true };
      await this.prisma.db.stripeBillingWebhookInbox.upsert({
        where: { tenantId_stripeEventId: { tenantId: tenant.id, stripeEventId: event.id } },
        create: {
          id: prefixedId('sbwin'), tenantId: tenant.id, stripeEventId: event.id, eventType: event.type,
          livemode: Boolean(event.livemode), status: 'received', payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
        },
        update: { eventType: event.type, status: 'received', errorMessage: null },
      });
      try {
        await this.processWebhookEvent(tenant.id, event);
        await this.prisma.db.stripeBillingWebhookInbox.updateMany({
          where: { stripeEventId: event.id }, data: { status: 'processed', processedAt: new Date(), errorMessage: null },
        });
        return { received: true, duplicate: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.db.stripeBillingWebhookInbox.updateMany({ where: { stripeEventId: event.id }, data: { status: 'failed', errorMessage: message } });
        throw error;
      }
    });
  }

  async accessDecision() {
    const globalEnabled = truthy(this.config.get<string>('BILLING_ENFORCEMENT_ENABLED'));
    if (!globalEnabled) return { effective: false, allowed: true, reason: 'Global billing enforcement is disabled.' };
    const context = this.tenantContext.get();
    if (!context?.tenantId || context.principalType !== 'member') return { effective: false, allowed: true, reason: 'Billing enforcement applies to member backpanels only.' };
    const row = await this.prisma.db.tenantBillingSubscription.findFirst({ where: { tenantId: context.tenantId } });
    if (!row?.enforcementEnabled) return { effective: false, allowed: true, reason: 'Tenant billing enforcement is disabled.' };
    const allowed = subscriptionAccessAllowed(row.status, row.graceEndsAt);
    return { effective: true, allowed, reason: allowed ? 'Subscription access is active or inside the grace period.' : 'Subscription payment is required.' };
  }

  private async processWebhookEvent(tenantId: string, event: StripeEvent) {
    const object = event.data?.object ?? {};
    if (event.type === 'checkout.session.completed') {
      if (object.metadata?.tenant_id !== tenantId) return;
      const subscriptionId = stripeId(object.subscription);
      if (!subscriptionId) return;
      const subscription = await this.stripeRequest<StripeObject>(this.requiredStripeSecret(), 'GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      await this.persistSubscription(tenantId, subscription, stripeId(object.customer));
      return;
    }
    if (event.type.startsWith('customer.subscription.')) {
      if (object.metadata?.tenant_id !== tenantId) return;
      await this.persistSubscription(tenantId, object, stripeId(object.customer));
      return;
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const subscriptionId = stripeId(object.subscription);
      const row = await this.prisma.db.tenantBillingSubscription.findFirst({ where: { tenantId } });
      if (!row || !subscriptionId || row.stripeSubscriptionId !== subscriptionId) return;
      const failed = event.type === 'invoice.payment_failed';
      await this.prisma.db.tenantBillingSubscription.updateMany({
        where: { tenantId },
        data: {
          lastInvoiceId: object.id ?? null,
          lastInvoiceStatus: object.status ?? (failed ? 'open' : 'paid'),
          lastPaymentFailedAt: failed ? new Date() : null,
          graceEndsAt: failed ? new Date(Date.now() + GRACE_PERIOD_DAYS * DAY_MS) : null,
          ...(failed ? { status: 'past_due' } : {}),
        },
      });
    }
  }

  private async persistSubscription(tenantId: string, subscription: StripeObject, fallbackCustomerId: string | null) {
    if (!subscription.id) throw new BadGatewayException('Stripe subscription payload is missing an ID.');
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { slug: true } });
    if (!tenant) throw new ServiceUnavailableException('Billing tenant no longer exists.');
    const plan = planForTenant(tenant.slug);
    const status = normalizeStatus(subscription.status);
    const latestInvoice = typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null;
    await this.prisma.db.tenantBillingSubscription.upsert({
      where: { tenantId },
      create: {
        id: prefixedId('tbsub'), tenantId, stripeCustomerId: stripeId(subscription.customer) ?? fallbackCustomerId,
        stripeSubscriptionId: subscription.id, stripePriceId: this.priceIdForTenant(tenant.slug), planCode: plan.code,
        amountCents: plan.amountCents, status, currentPeriodStart: fromUnix(subscription.current_period_start),
        currentPeriodEnd: fromUnix(subscription.current_period_end), cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        lastInvoiceId: latestInvoice?.id ?? stripeId(subscription.latest_invoice), lastInvoiceStatus: latestInvoice?.status ?? null,
        graceEndsAt: status === 'past_due' ? new Date(Date.now() + GRACE_PERIOD_DAYS * DAY_MS) : null,
        enforcementEnabled: false,
      },
      update: {
        stripeCustomerId: stripeId(subscription.customer) ?? fallbackCustomerId, stripeSubscriptionId: subscription.id,
        stripePriceId: this.priceIdForTenant(tenant.slug), planCode: plan.code, amountCents: plan.amountCents, status,
        currentPeriodStart: fromUnix(subscription.current_period_start), currentPeriodEnd: fromUnix(subscription.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), lastInvoiceId: latestInvoice?.id ?? stripeId(subscription.latest_invoice),
        lastInvoiceStatus: latestInvoice?.status ?? null,
        ...(status === 'active' ? { lastPaymentFailedAt: null, graceEndsAt: null } : {}),
        ...(status === 'past_due' ? { graceEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * DAY_MS) } : {}),
      },
    });
  }

  private async currentTenant() {
    const tenantId = this.tenantContext.require().tenantId;
    const tenant = tenantId ? await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true, slug: true, name: true } }) : null;
    if (!tenant) throw new ServiceUnavailableException('Billing tenant context is unavailable.');
    return tenant;
  }

  private toSummary(
    tenant: { id: string; slug: string; name: string },
    row: { status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null; graceEndsAt: Date | null; cancelAtPeriodEnd: boolean; lastInvoiceStatus: string | null; stripeCustomerId: string | null; enforcementEnabled: boolean } | null,
  ): BillingSummary {
    const plan = planForTenant(tenant.slug);
    const secretKeyPresent = Boolean(this.config.get<string>('STRIPE_SECRET_KEY')?.trim());
    const webhookSecretPresent = Boolean(this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim());
    const priceIdPresent = Boolean(this.priceIdForTenant(tenant.slug));
    const globallyEnabled = truthy(this.config.get<string>('BILLING_ENFORCEMENT_ENABLED'));
    const tenantEnabled = Boolean(row?.enforcementEnabled);
    const status = normalizeStatus(row?.status);
    const accessAllowed = !globallyEnabled || !tenantEnabled || subscriptionAccessAllowed(status, row?.graceEndsAt ?? null);
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      plan,
      status,
      configured: secretKeyPresent && webhookSecretPresent && priceIdPresent,
      checkoutAvailable: secretKeyPresent && priceIdPresent && status !== 'active',
      portalAvailable: secretKeyPresent && Boolean(row?.stripeCustomerId),
      enforcement: {
        prepared: true, globallyEnabled, tenantEnabled, effective: globallyEnabled && tenantEnabled,
        gracePeriodDays: GRACE_PERIOD_DAYS, accessAllowed,
        reason: !globallyEnabled ? 'Global enforcement is OFF.' : !tenantEnabled ? 'Tenant enforcement is OFF.' : accessAllowed ? 'Subscription is active or in grace.' : 'Subscription payment is required.',
      },
      subscription: {
        currentPeriodStart: row?.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
        graceEndsAt: row?.graceEndsAt?.toISOString() ?? null,
        cancelAtPeriodEnd: Boolean(row?.cancelAtPeriodEnd),
        lastInvoiceStatus: row?.lastInvoiceStatus ?? null,
      },
      setup: {
        secretKeyPresent, webhookSecretPresent, priceIdPresent,
        webhookUrl: `${this.apiUrl()}/api/v1/webhooks/stripe/${encodeURIComponent(tenant.slug)}`,
      },
    };
  }

  private async stripeRequest<T>(secret: string, method: 'GET' | 'POST', path: string, params: Record<string, string | undefined> = {}) {
    const body = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' ? { body } : {}),
    });
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } } & T;
    if (!response.ok) throw new BadGatewayException(payload.error?.message ?? `Stripe request failed with ${response.status}.`);
    return payload as T;
  }

  private requiredStripeSecret() {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!secret) throw new ServiceUnavailableException('Stripe secret key is not configured.');
    return secret;
  }

  private priceIdForTenant(slug: string) {
    const key = slug === 'dtfbank' ? 'STRIPE_PRICE_DTFBANK' : 'STRIPE_PRICE_STANDARD';
    return this.config.get<string>(key)?.trim() || null;
  }

  private adminUrl() { return (this.config.get<string>('ADMIN_APP_URL') ?? '').replace(/\/$/, ''); }
  private apiUrl() {
    return (
      this.config.get<string>('API_APP_URL')
      ?? this.config.get<string>('PUBLIC_API_URL')
      ?? this.config.get<string>('API_URL')
      ?? ''
    ).replace(/\/$/, '');
  }
}

export function planForTenant(slug: string) {
  return slug === 'dtfbank'
    ? { code: 'dtfbank_249_monthly', name: 'DTFBank Backpanel', amountCents: 24_900, currency: 'usd' as const, interval: 'month' as const, taxIncluded: true as const }
    : { code: 'factory_engine_149_monthly', name: 'Factory Engine Backpanel', amountCents: 14_900, currency: 'usd' as const, interval: 'month' as const, taxIncluded: true as const };
}

function normalizeStatus(value: string | null | undefined): BillingSubscriptionStatus {
  return value && KNOWN_STATUSES.has(value as BillingSubscriptionStatus) ? value as BillingSubscriptionStatus : 'unconfigured';
}

export function subscriptionAccessAllowed(status: string, graceEndsAt: Date | null, now = Date.now()) {
  if (status === 'active' || status === 'trialing') return true;
  return status === 'past_due' && Boolean(graceEndsAt && graceEndsAt.getTime() >= now);
}

function stripeId(value: StripeObject['customer'] | StripeObject['subscription'] | StripeObject['latest_invoice']) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function fromUnix(value: number | null | undefined) { return value ? new Date(value * 1000) : null; }
function truthy(value: string | undefined) { return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? ''); }

function parseStripeEvent(rawBody: string): StripeEvent {
  let parsed: Partial<StripeEvent>;
  try {
    parsed = JSON.parse(rawBody) as Partial<StripeEvent>;
  } catch {
    throw new BadRequestException('Stripe webhook payload is not valid JSON.');
  }
  if (!parsed.id || !parsed.type) throw new UnauthorizedException('Stripe webhook payload is invalid.');
  return parsed as StripeEvent;
}
