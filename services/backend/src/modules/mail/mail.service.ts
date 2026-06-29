import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { MailListQuery, MailProviderHealthResponse } from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { MAIL_OUTBOUND_QUEUE } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailRepository } from './mail.repository.js';

export const MAIL_OUTBOUND_JOB = 'mail.deliver';

export interface TransactionalMailInput {
  eventKey: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WorkflowDisabledMailInput {
  eventKey: string;
  to: string;
  templateId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MailService {
  constructor(
    private readonly repository: MailRepository,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    @Inject(MAIL_OUTBOUND_QUEUE) private readonly outboundQueue: Queue | null,
  ) {}

  async sendTransactional(input: TransactionalMailInput) {
    const context = this.tenantContext.require();
    const delivery = await this.repository.createDelivery({
      eventKey: input.eventKey,
      recipientEmail: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    });

    if (this.outboundQueue) {
      await this.outboundQueue.add(
        MAIL_OUTBOUND_JOB,
        { tenantId: context.tenantId, deliveryId: delivery.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 100, removeOnFail: 100 },
      );
      this.logger.log('mail', 'queued', 'Transactional email queued', { mail_delivery_id: delivery.id, event_key: input.eventKey });
      return delivery;
    }

    this.logger.warn('mail', 'queue_missing', 'REDIS_URL is not configured; sending mail inline', { mail_delivery_id: delivery.id });
    return this.deliverQueued(delivery.id);
  }

  async queueDisabledWorkflowMail(input: WorkflowDisabledMailInput) {
    const templateHint = input.templateId?.trim() || null;
    const template = templateHint
      ? await this.prisma.db.emailTemplate.findFirst({
          where: {
            OR: [
              { id: templateHint },
              { slug: { equals: templateHint, mode: 'insensitive' } },
              { eventKey: { equals: templateHint, mode: 'insensitive' } },
            ],
          },
          orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        })
      : null;
    const variables = input.variables ?? {};
    const subject = template
      ? renderTemplate(template.subject, variables)
      : `Workflow email queued: ${input.eventKey}`;
    const html = template
      ? renderTemplate(template.html, variables)
      : `<p>Workflow email action matched for <strong>${escapeHtml(input.eventKey)}</strong>.</p>`;
    const text = template?.text
      ? renderTemplate(template.text, variables)
      : `Workflow email action matched for ${input.eventKey}.`;
    const delivery = await this.repository.createDelivery({
      eventKey: input.eventKey,
      category: 'workflow',
      recipientEmail: input.to,
      subject,
      html,
      text,
      status: 'queued_disabled',
      provider: 'disabled',
      errorMessage: 'mail.provider.disabled_in_phase_1',
      metadata: {
        ...(input.metadata ?? {}),
        source: 'workflow_send_mail',
        sendingEnabled: false,
        providerMode: 'disabled',
        templateId: template?.id ?? templateHint,
        templateFound: Boolean(template),
        customerId: input.customerId ?? null,
      } as Prisma.InputJsonValue,
    });
    this.logger.warn('mail', 'provider.disabled_in_phase_1', 'Workflow mail delivery was queued with provider disabled', {
      mail_delivery_id: delivery.id,
      event_key: input.eventKey,
      template_id: template?.id ?? templateHint,
      customer_id: input.customerId ?? null,
    });
    return delivery;
  }

  list(query: MailListQuery) {
    return this.repository.list(query);
  }

  async findOne(id: string) {
    const delivery = await this.repository.findById(id);
    if (!delivery) throw new NotFoundException('Mail delivery not found');
    return delivery;
  }

  async retryDelivery(id: string) {
    await this.findOne(id);
    try {
      return await this.deliverQueued(id);
    } catch {
      return this.findOne(id);
    }
  }

  async sendTest(to: string, subject: string) {
    const brand = await this.resolveBrandName();
    return this.sendTransactional({
      eventKey: 'system.test',
      to,
      subject,
      html: `<p>This is a Factory Engine Pro transactional mail test for <strong>${escapeHtml(brand)}</strong>.</p>`,
      text: `This is a Factory Engine Pro transactional mail test for ${brand}.`,
      metadata: { source: 'mail_center_test' },
    });
  }

  async health(): Promise<MailProviderHealthResponse> {
    const startedAt = Date.now();
    const credentials = await this.resolveResendApiKeyWithSource();
    const checkedAt = new Date().toISOString();
    if (!credentials.key) {
      return {
        provider: 'resend',
        credentialRequired: true,
        configured: false,
        reachable: false,
        status: 'missing_credentials',
        source: 'none',
        latencyMs: null,
        checkedAt,
        providerStatus: null,
        domainCount: null,
        error: 'Resend API key is not configured for this tenant.',
      };
    }

    try {
      const response = await fetch(`${this.resendBaseUrl()}/domains`, {
        headers: {
          authorization: `Bearer ${credentials.key}`,
          accept: 'application/json',
        },
      });
      const latencyMs = Date.now() - startedAt;
      const text = await response.text();
      const body = parseJson(text);
      if (response.ok) {
        return {
          provider: 'resend',
          credentialRequired: false,
          configured: true,
          reachable: true,
          status: 'ok',
          source: credentials.source,
          latencyMs,
          checkedAt: new Date().toISOString(),
          providerStatus: response.status,
          domainCount: Array.isArray(body?.data) ? body.data.length : null,
          error: null,
        };
      }

      const status = response.status === 401 || response.status === 403 ? 'invalid_credentials' : 'provider_error';
      const message = providerMessage(body, text) ?? `Resend health check failed with HTTP ${response.status}.`;
      this.logger.warn('mail', 'health_failed', 'Resend health check failed', {
        status_code: response.status,
        source: credentials.source,
        provider_status: status,
      });
      return {
        provider: 'resend',
        credentialRequired: false,
        configured: true,
        reachable: true,
        status,
        source: credentials.source,
        latencyMs,
        checkedAt: new Date().toISOString(),
        providerStatus: response.status,
        domainCount: null,
        error: message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('mail', 'health_network_failed', 'Resend health check could not reach provider', { error: message });
      return {
        provider: 'resend',
        credentialRequired: false,
        configured: true,
        reachable: false,
        status: 'network_error',
        source: credentials.source,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        providerStatus: null,
        domainCount: null,
        error: message.slice(0, 300),
      };
    }
  }

  async sendInvitation(input: {
    to: string;
    recipientName: string;
    token: string;
    surface: 'admin' | 'accounts';
    eventKey: 'identity.member_invitation' | 'identity.customer_invitation' | 'b2b_access.approved';
    metadata?: Record<string, unknown>;
  }) {
    const brand = await this.resolveBrandName();
    const baseUrl = input.surface === 'accounts'
      ? this.config.get<string>('ACCOUNTS_URL')
      : this.config.get<string>('ADMIN_URL');
    const invitationUrl = `${(baseUrl ?? '').replace(/\/+$/, '')}/reset-password?flow=invitation&token=${encodeURIComponent(input.token)}`;
    const subject = `${brand} invitation`;
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>You have been invited to join <strong>${escapeHtml(brand)}</strong>.</p>`,
      `<p><a href="${escapeHtml(invitationUrl)}">Accept invitation and set your password</a></p>`,
      '<p>This invitation expires in 7 days.</p>',
    ].join('');
    return this.sendTransactional({
      eventKey: input.eventKey,
      to: input.to,
      subject,
      html,
      text: `Hello ${input.recipientName}, accept your ${brand} invitation: ${invitationUrl}`,
      metadata: { ...(input.metadata ?? {}), invitationUrl },
    });
  }

  async sendPasswordReset(input: { to: string; recipientName: string; token: string; surface: 'admin' | 'person' | 'accounts' }) {
    const brand = await this.resolveBrandName();
    const baseUrl = input.surface === 'accounts'
      ? this.config.get<string>('ACCOUNTS_URL')
      : this.config.get<string>('ADMIN_URL');
    const resetUrl = `${(baseUrl ?? '').replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(input.token)}`;
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>Use the link below to reset your <strong>${escapeHtml(brand)}</strong> password.</p>`,
      `<p><a href="${escapeHtml(resetUrl)}">Reset password</a></p>`,
      '<p>This link expires in 30 minutes.</p>',
    ].join('');
    return this.sendTransactional({
      eventKey: 'identity.password_reset',
      to: input.to,
      subject: `${brand} password reset`,
      html,
      text: `Reset your ${brand} password: ${resetUrl}`,
      metadata: { surface: input.surface, resetUrl },
    });
  }

  async deliverQueued(deliveryId: string) {
    const existing = await this.repository.findById(deliveryId);
    if (!existing) throw new NotFoundException('Mail delivery not found');
    if (existing.status === 'sent') return existing;

    const delivery = await this.repository.markSending(deliveryId);
    if (!delivery) throw new NotFoundException('Mail delivery not found');

    const apiKey = await this.resolveResendApiKey();
    if (!apiKey) {
      this.logger.warn('mail', 'resend_missing', 'RESEND_API_KEY is not configured; delivery skipped', { mail_delivery_id: delivery.id });
      return this.repository.markSkipped(delivery.id, 'RESEND_API_KEY is not configured');
    }

    try {
      const from = await this.resolveFromAddress();
      const response = await fetch(`${this.resendBaseUrl()}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [delivery.recipientEmail],
          subject: delivery.subject,
          html: delivery.html,
          text: delivery.text ?? undefined,
        }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.name ?? `Resend failed with ${response.status}`);
      }
      this.logger.log('mail', 'sent', 'Transactional email sent', {
        mail_delivery_id: delivery.id,
        event_key: delivery.eventKey,
        provider_message_id: payload?.id,
      });
      return this.repository.markSent(delivery.id, 'resend', payload?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markFailed(delivery.id, message);
      this.logger.error('mail', 'send_failed', message, { mail_delivery_id: delivery.id, event_key: delivery.eventKey });
      throw error;
    }
  }

  private async resolveBrandName() {
    const tenantBrand = await this.prisma.db.tenantConfig.findFirst({ select: { workspaceName: true } });
    if (tenantBrand?.workspaceName?.trim()) return tenantBrand.workspaceName.trim();
    const workspaceName = this.config.get<string>('WORKSPACE_NAME') ?? this.config.get<string>('BRAND_NAME');
    return workspaceName?.trim() || 'Factory Engine Pro';
  }

  private async resolveResendApiKey() {
    return (await this.resolveResendApiKeyWithSource()).key ?? '';
  }

  private async resolveResendApiKeyWithSource(): Promise<{ key: string | null; source: 'tenant_config' | 'env' | 'none' }> {
    const tenantConfig = await this.prisma.db.tenantConfig.findFirst({ select: { resendApiKeyEncrypted: true } });
    const tenantKey = this.crypto.decrypt(tenantConfig?.resendApiKeyEncrypted)?.trim();
    if (tenantKey) return { key: tenantKey, source: 'tenant_config' };
    const envKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (envKey) return { key: envKey, source: 'env' };
    return { key: null, source: 'none' };
  }

  private async resolveFromAddress() {
    const brand = await this.resolveBrandName();
    const configured = this.config.get<string>('MAIL_FROM')?.trim();
    if (configured) return `${brand} <${configured}>`;
    const domain = rootDomain(this.config.get<string>('ADMIN_URL') ?? this.config.get<string>('ACCOUNTS_URL') ?? this.config.get<string>('API_URL') ?? '');
    return `${brand} <noreply@${domain || 'example.com'}>`;
  }

  private resendBaseUrl() {
    return this.config.get<string>('RESEND_API_BASE_URL', 'https://api.resend.com').replace(/\/+$/, '');
  }
}

function parseJson(text: string): { data?: unknown; error?: { message?: unknown }; message?: unknown; name?: unknown } | null {
  try {
    return JSON.parse(text) as { data?: unknown; error?: { message?: unknown }; message?: unknown; name?: unknown };
  } catch {
    return null;
  }
}

function providerMessage(body: { error?: { message?: unknown }; message?: unknown; name?: unknown } | null, fallback: string) {
  if (typeof body?.message === 'string' && body.message.trim()) return body.message.slice(0, 300);
  if (typeof body?.error?.message === 'string' && body.error.message.trim()) return body.error.message.slice(0, 300);
  if (typeof body?.name === 'string' && body.name.trim()) return body.name.slice(0, 300);
  return fallback.trim().slice(0, 300) || null;
}

function renderTemplate(source: string, variables: Record<string, unknown>) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, variables);
    return value === undefined || value === null ? '' : String(value);
  });
}

function rootDomain(value: string) {
  try {
    const host = new URL(value.startsWith('http') ? value : `https://${value}`).hostname;
    const parts = host.split('.').filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join('.') : host;
  } catch {
    return '';
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
