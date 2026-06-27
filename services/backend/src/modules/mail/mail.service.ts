import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
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

  list(query: { status?: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'; eventKey?: string; recipient?: string; limit: number }) {
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
      const response = await fetch(`${this.config.get<string>('RESEND_API_BASE_URL', 'https://api.resend.com').replace(/\/+$/, '')}/emails`, {
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
    const tenantConfig = await this.prisma.db.tenantConfig.findFirst({ select: { resendApiKeyEncrypted: true } });
    const tenantKey = this.crypto.decrypt(tenantConfig?.resendApiKeyEncrypted)?.trim();
    if (tenantKey) return tenantKey;
    return this.config.get<string>('RESEND_API_KEY')?.trim() || '';
  }

  private async resolveFromAddress() {
    const brand = await this.resolveBrandName();
    const configured = this.config.get<string>('MAIL_FROM')?.trim();
    if (configured) return `${brand} <${configured}>`;
    const domain = rootDomain(this.config.get<string>('ADMIN_URL') ?? this.config.get<string>('ACCOUNTS_URL') ?? this.config.get<string>('API_URL') ?? '');
    return `${brand} <noreply@${domain || 'example.com'}>`;
  }
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
