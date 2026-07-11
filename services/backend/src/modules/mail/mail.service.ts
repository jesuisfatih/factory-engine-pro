import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import {
  mailCenterSettingsSchema,
  patchMailCenterSettingsSchema,
  type AddMailSuppressionInput,
  type MailCenterSettings,
  type MailDeliveryLogQuery,
  type MailDlqListQuery,
  type MailListQuery,
  type MailProviderEventDto,
  type MailProviderEventLogResponse,
  type MailProviderEventQuery,
  type MailProviderMode,
  type MailProviderHealthResponse,
  type MailSettingsAuditQuery,
  type MailSuppressionListQuery,
  type PatchMailCenterSettingsInput,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { MAIL_OUTBOUND_QUEUE } from '../../shared/queue.module.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailRepository } from './mail.repository.js';
import {
  parseResendWebhookEvent,
  requiredResendWebhookHeader,
  safeResendWebhookHeaders,
  verifyResendSvixSignature,
  type ResendWebhookEvent,
} from './resend-webhook.js';

export const MAIL_OUTBOUND_JOB = 'mail.deliver';

export interface TransactionalMailInput {
  eventKey: string;
  category?: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  templateId?: string | null;
  templateVersionId?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WorkflowMailInput {
  eventKey: string;
  to: string;
  templateId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface RenderedTransactionalTemplate {
  subject: string;
  html: string;
  text?: string | null;
  templateId?: string | null;
  templateVersionId?: string | null;
  templateSource: 'event_binding' | 'fallback';
}

type SupportTicketEventKey =
  | 'support.ticket_created.user'
  | 'support.ticket_created.internal'
  | 'support.reply_added.user'
  | 'support.reply_added.internal'
  | 'support.ticket_closed.user';

type TaxExemptEventKey =
  | 'tax_exempt.request_received.user'
  | 'tax_exempt.request_received.internal'
  | 'tax_exempt.request_approved.user'
  | 'tax_exempt.request_rejected.user';

export interface ResendWebhookInput {
  tenantSlug: string;
  rawBody: string;
  headers: Record<string, string>;
}

type MailSettingsCategory = 'system' | 'system.b2b' | 'marketing';
type MarketingMailType = 'campaigns' | 'flows' | 'drips' | 'transactionalMarketing';
type MailSendDecision =
  | {
      allowed: true;
      reason: 'critical-bypass' | 'category-enabled';
      providerMode: MailProviderMode;
      category: MailSettingsCategory;
    }
  | {
      allowed: false;
      status: 'queued_disabled' | 'skipped';
      reason: string;
      providerMode: MailProviderMode;
      category: MailSettingsCategory;
      field: string;
    };

@Injectable()
export class MailService {
  private static readonly MAIL_IDEMPOTENCY_WINDOW_MS = 60_000;

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
    const { transport: _ignoredTransport, ...metadata } = input.metadata ?? {};
    const transport = {
      fromName: safeMailHeader(input.fromName),
      replyTo: safeEmailAddress(input.replyTo),
    };
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    const deliveryResult = idempotencyKey
      ? await this.repository.createIdempotentDelivery({
        idempotencyKey,
        eventKey: input.eventKey,
        category: input.category,
        recipientEmail: input.to,
        templateId: input.templateId ?? null,
        templateVersionId: input.templateVersionId ?? null,
        subject: input.subject,
        html: input.html,
        text: input.text,
        metadata: {
          ...metadata,
          ...(transport.fromName || transport.replyTo ? { transport } : {}),
        } as Prisma.InputJsonValue,
      })
      : {
        delivery: await this.repository.createDelivery({
          eventKey: input.eventKey,
          category: input.category,
          recipientEmail: input.to,
          templateId: input.templateId ?? null,
          templateVersionId: input.templateVersionId ?? null,
          subject: input.subject,
          html: input.html,
          text: input.text,
          metadata: {
            ...metadata,
            ...(transport.fromName || transport.replyTo ? { transport } : {}),
          } as Prisma.InputJsonValue,
        }),
        duplicate: false,
      };
    const delivery = deliveryResult.delivery;
    if (deliveryResult.duplicate) {
      this.logger.log('mail', 'idempotent_duplicate', 'Transactional email was already accepted for this event.', {
        mail_delivery_id: delivery.id,
        event_key: input.eventKey,
        idempotency_key: idempotencyKey,
      });
      return delivery;
    }

    if (this.outboundQueue) {
      try {
        await this.outboundQueue.add(
          MAIL_OUTBOUND_JOB,
          { tenantId: context.tenantId, deliveryId: delivery.id },
          { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 100, removeOnFail: 100 },
        );
        this.logger.log('mail', 'queued', 'Transactional email queued', { mail_delivery_id: delivery.id, event_key: input.eventKey });
        return delivery;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.repository.markFailed(delivery.id, `Unable to queue email: ${message}`);
        await this.recordDlq(delivery.id, `Unable to queue email: ${message}`);
        this.logger.error('mail', 'queue_failed', message, { mail_delivery_id: delivery.id, event_key: input.eventKey });
        return (await this.repository.findById(delivery.id)) ?? delivery;
      }
    }

    this.logger.warn('mail', 'queue_missing', 'REDIS_URL is not configured; sending mail inline', { mail_delivery_id: delivery.id });
    try {
      return await this.deliverQueued(delivery.id);
    } catch {
      return (await this.repository.findById(delivery.id)) ?? delivery;
    }
  }

  async recordDisabledDelivery(input: TransactionalMailInput & {
    category?: string;
    errorMessage?: string;
  }) {
    const delivery = await this.repository.createDelivery({
      eventKey: input.eventKey,
      category: input.category ?? 'system',
      recipientEmail: input.to,
      templateId: input.templateId ?? null,
      templateVersionId: input.templateVersionId ?? null,
      subject: input.subject,
      html: input.html,
      text: input.text,
      status: 'queued_disabled',
      provider: 'disabled',
      errorMessage: input.errorMessage ?? 'Mail provider is disabled for this tenant.',
      metadata: {
        ...(input.metadata ?? {}),
        providerMode: 'disabled',
        sendingEnabled: false,
      } as Prisma.InputJsonValue,
    });
    this.logger.warn('mail', 'queued_disabled', 'Mail delivery recorded while provider is disabled', {
      mail_delivery_id: delivery.id,
      event_key: input.eventKey,
    });
    return delivery;
  }

  async sendWorkflowMail(input: WorkflowMailInput) {
    const templateHint = input.templateId?.trim() || null;
    const variables = input.variables ?? {};
    const idempotencyKey = deriveMailIdempotencyKey(input.eventKey, input.to, templateHint, variables);
    const duplicate = await this.repository.findRecentIdempotencyKey(
      idempotencyKey,
      new Date(Date.now() - MailService.MAIL_IDEMPOTENCY_WINDOW_MS),
    );
    if (duplicate?.deliveryId) {
      const previousDelivery = await this.repository.findById(duplicate.deliveryId);
      if (previousDelivery) return previousDelivery;
    }
    const resolved = await this.resolveWorkflowMailTemplate(input.eventKey, templateHint);
    if (!resolved) {
      const delivery = await this.recordDisabledDelivery({
        eventKey: input.eventKey,
        category: 'system',
        to: input.to,
        subject: `Workflow email blocked: ${input.eventKey}`,
        html: `<p>No active published email template is bound for <strong>${escapeHtml(input.eventKey)}</strong>.</p>`,
        text: `No active published email template is bound for ${input.eventKey}.`,
        errorMessage: 'No active published email template is bound for this workflow mail event.',
        metadata: {
          ...(input.metadata ?? {}),
          source: 'workflow_send_mail_blocked',
          sendingEnabled: false,
          providerMode: 'disabled',
          templateId: templateHint,
          templateFound: false,
          failClosed: true,
          customerId: input.customerId ?? null,
        },
      });
      await this.repository.recordIdempotencyKey({
        idempotencyKey,
        eventKey: input.eventKey,
        recipientEmail: input.to,
        deliveryId: delivery.id,
      });
      return delivery;
    }
    const subject = renderTemplate(resolved.revision.subject, variables);
    const renderedCss = resolved.revision.css ? renderTemplate(resolved.revision.css, variables) : null;
    const html = renderEmailHtml(renderTemplate(resolved.revision.html, variables, { escapeHtml: true }), renderedCss);
    const text = resolved.revision.text
      ? renderTemplate(resolved.revision.text, variables)
      : null;

    const delivery = await this.sendTransactional({
      eventKey: input.eventKey,
      to: input.to,
      subject,
      html,
      text,
      templateId: resolved.templateId,
      templateVersionId: resolved.revision.id,
      metadata: {
        ...(input.metadata ?? {}),
        source: 'workflow_send_mail',
        sendingEnabled: true,
        provider: 'resend',
        templateId: resolved.templateId,
        templateVersionId: resolved.revision.id,
        templateSource: resolved.source,
        templateFound: true,
        customerId: input.customerId ?? null,
      },
    });
    await this.repository.recordIdempotencyKey({
      idempotencyKey,
      eventKey: input.eventKey,
      recipientEmail: input.to,
      deliveryId: delivery.id,
    });
    return delivery;
  }

  private async resolveWorkflowMailTemplate(eventKey: string, templateHint: string | null) {
    if (templateHint) {
      const hintedBinding = await this.resolveActiveBinding(templateHint);
      if (hintedBinding) return hintedBinding;
      const template = await this.prisma.db.emailTemplate.findFirst({
        where: {
          isArchived: false,
          OR: [
            { id: templateHint },
            { slug: { equals: templateHint, mode: 'insensitive' } },
          ],
        },
        include: { publishedVersion: true },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      });
      if (template?.publishedVersion) {
        return {
          source: 'explicit_template' as const,
          templateId: template.id,
          revision: template.publishedVersion,
        };
      }
      return null;
    }
    return this.resolveActiveBinding(eventKey);
  }

  private async resolveActiveBinding(eventKey: string) {
    const binding = await this.prisma.db.emailTemplateBinding.findFirst({
      where: { eventKey, isEnabled: true },
      include: {
        template: true,
        templateVersion: true,
      },
    });
    if (!binding || binding.template.isArchived || binding.templateVersion.status !== 'published') return null;
    return {
      source: 'event_binding' as const,
      templateId: binding.templateId,
      revision: binding.templateVersion,
    };
  }

  private async renderTransactionalEventTemplate(input: {
    eventKey: string;
    variables: Record<string, unknown>;
    fallback: { subject: string; html: string; text?: string | null };
  }): Promise<RenderedTransactionalTemplate> {
    const resolved = await this.resolveActiveBinding(input.eventKey);
    if (!resolved) {
      return {
        ...input.fallback,
        templateId: null,
        templateVersionId: null,
        templateSource: 'fallback',
      };
    }
    const renderedCss = resolved.revision.css ? renderTemplate(resolved.revision.css, input.variables) : null;
    return {
      subject: renderTemplate(resolved.revision.subject, input.variables),
      html: renderEmailHtml(renderTemplate(resolved.revision.html, input.variables, { escapeHtml: true }), renderedCss),
      text: resolved.revision.text ? renderTemplate(resolved.revision.text, input.variables) : input.fallback.text ?? null,
      templateId: resolved.templateId,
      templateVersionId: resolved.revision.id,
      templateSource: resolved.source,
    };
  }

  list(query: MailListQuery) {
    return this.repository.list(query);
  }

  deliveryLog(query: MailDeliveryLogQuery) {
    return this.repository.listPage(query);
  }

  async providerEvents(query: MailProviderEventQuery): Promise<MailProviderEventLogResponse> {
    const page = await this.repository.listProviderEventPage(query);
    return {
      data: page.data.map(toProviderEventDto),
      meta: page.meta,
    };
  }

  listTemplateRevisionTestProofs(templateVersionId: string) {
    return this.repository.list({
      templateVersionId,
      source: 'email_template_test_send',
      limit: 25,
    });
  }

  async findOne(id: string) {
    const delivery = await this.repository.findById(id);
    if (!delivery) throw new NotFoundException('Mail delivery not found');
    return delivery;
  }

  async listSuppression(query: MailSuppressionListQuery) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailSuppression.findMany({
      where: {
        tenantId,
        ...(query.active !== undefined && { isActive: query.active }),
        ...(query.scope && { scope: query.scope }),
        ...(query.category && { category: query.category }),
        ...(query.campaignId && { campaignId: query.campaignId }),
        ...(query.flowId && { flowId: query.flowId }),
        ...(query.templateId && { templateId: query.templateId }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        contact: {
          select: { id: true, email: true, normalizedEmail: true, name: true, isSendable: true },
        },
      },
    });
  }

  async addSuppression(input: AddMailSuppressionInput) {
    const tenantId = this.tenantId();
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('Email is required');
    const scope = input.scope ?? 'global';
    const category = scope === 'category' ? input.category?.trim() : null;
    const campaignId = scope === 'campaign' ? input.campaignId?.trim() : null;
    const flowId = scope === 'flow' ? input.flowId?.trim() : null;
    const templateId = scope === 'template' ? input.templateId?.trim() : null;
    if (scope === 'category' && !category) throw new BadRequestException('Category suppression requires category.');
    if (scope === 'campaign' && !campaignId) throw new BadRequestException('Campaign suppression requires campaignId.');
    if (scope === 'flow' && !flowId) throw new BadRequestException('Flow suppression requires flowId.');
    if (scope === 'template' && !templateId) throw new BadRequestException('Template suppression requires templateId.');

    let contact = await this.prisma.db.mailContact.findFirst({
      where: { tenantId, normalizedEmail },
    });
    if (!contact) {
      contact = await this.prisma.db.mailContact.create({
        data: {
          id: prefixedId('mcon'),
          tenantId,
          email: normalizedEmail,
          normalizedEmail,
          isSendable: scope === 'global' ? false : true,
          metadata: { source: 'mail_center_suppression' },
        },
      });
    } else if (scope === 'global') {
      await this.prisma.db.mailContact.updateMany({
        where: { tenantId, id: contact.id },
        data: { isSendable: false },
      });
    }

    const existing = await this.prisma.db.mailSuppression.findFirst({
      where: {
        tenantId,
        contactId: contact.id,
        channel: 'email',
        scope,
        category,
        campaignId,
        flowId,
        templateId,
        isActive: true,
      },
    });
    const data = {
      scope,
      category,
      campaignId,
      flowId,
      templateId,
      isActive: true,
      reason: input.reason || 'manual',
      source: 'admin-ui',
      notes: input.notes ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };
    if (existing) {
      await this.prisma.db.mailSuppression.updateMany({
        where: { tenantId, id: existing.id },
        data,
      });
      return this.prisma.db.mailSuppression.findFirst({
        where: { tenantId, id: existing.id },
        include: { contact: { select: { id: true, email: true, normalizedEmail: true, name: true, isSendable: true } } },
      });
    }

    return this.prisma.db.mailSuppression.create({
      data: {
        id: prefixedId('msup'),
        tenantId,
        contactId: contact.id,
        channel: 'email',
        ...data,
      },
      include: { contact: { select: { id: true, email: true, normalizedEmail: true, name: true, isSendable: true } } },
    });
  }

  async unsuppress(id: string) {
    const tenantId = this.tenantId();
    const row = await this.prisma.db.mailSuppression.findFirst({ where: { tenantId, id } });
    if (!row) throw new NotFoundException('Suppression record not found');
    await this.prisma.db.mailSuppression.updateMany({
      where: { tenantId, id },
      data: { isActive: false },
    });
    if (row.scope === 'global') {
      const activeGlobal = await this.prisma.db.mailSuppression.count({
        where: { tenantId, contactId: row.contactId, channel: row.channel, scope: 'global', isActive: true, id: { not: id } },
      });
      if (activeGlobal === 0) {
        await this.prisma.db.mailContact.updateMany({
          where: { tenantId, id: row.contactId },
          data: { isSendable: true },
        });
      }
    }
    return this.prisma.db.mailSuppression.findFirst({
      where: { tenantId, id },
      include: { contact: { select: { id: true, email: true, normalizedEmail: true, name: true, isSendable: true } } },
    });
  }

  async listDlq(query: MailDlqListQuery) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailDlq.findMany({
      where: {
        tenantId,
        ...(query.status !== 'all' && { status: query.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
  }

  async retryDlq(id: string) {
    const tenantId = this.tenantId();
    const row = await this.prisma.db.mailDlq.findFirst({ where: { tenantId, id } });
    if (!row) throw new NotFoundException('Mail DLQ item not found');
    await this.prisma.db.mailDlq.updateMany({ where: { tenantId, id }, data: { status: 'retrying', resolvedAt: null } });
    if (!row.lastDeliveryId) throw new BadRequestException('DLQ item is not linked to a delivery');
    try {
      const delivery = await this.deliverQueued(row.lastDeliveryId);
      await this.prisma.db.mailDlq.updateMany({ where: { tenantId, id }, data: { status: 'resolved', resolvedAt: new Date() } });
      return { success: true, delivery };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.db.mailDlq.updateMany({
        where: { tenantId, id },
        data: { status: 'pending', errorMessage: message.slice(0, 1000) },
      });
      throw error;
    }
  }

  async discardDlq(id: string) {
    const tenantId = this.tenantId();
    const row = await this.prisma.db.mailDlq.findFirst({ where: { tenantId, id } });
    if (!row) throw new NotFoundException('Mail DLQ item not found');
    await this.prisma.db.mailDlq.updateMany({
      where: { tenantId, id },
      data: { status: 'discarded', resolvedAt: new Date() },
    });
    return { success: true };
  }

  async mailCenterSettings() {
    return {
      settings: await this.loadMailCenterSettings(),
      criticalEvents: CRITICAL_MAIL_EVENTS,
    };
  }

  async patchMailCenterSettings(input: PatchMailCenterSettingsInput) {
    const parsed = patchMailCenterSettingsSchema.parse(input);
    const before = await this.loadMailCenterSettings();
    const next = sanitizeMailSettings({
      providerMode: parsed.providerMode ?? before.providerMode,
      categorySystem: { ...before.categorySystem, ...(parsed.categorySystem ?? {}) },
      categoryB2b: { ...before.categoryB2b, ...(parsed.categoryB2b ?? {}) },
      categoryMarketing: { ...before.categoryMarketing, ...(parsed.categoryMarketing ?? {}) },
    });
    const changedBy = this.tenantContext.get()?.principalId ?? 'system';
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.mailCenterSetting.findFirst({ where: { tenantId } });
    if (existing) {
      await this.prisma.db.mailCenterSetting.updateMany({
        where: { tenantId, id: existing.id },
        data: {
          providerMode: next.providerMode,
          categorySystem: next.categorySystem as Prisma.InputJsonValue,
          categoryB2b: next.categoryB2b as Prisma.InputJsonValue,
          categoryMarketing: next.categoryMarketing as Prisma.InputJsonValue,
          updatedBy: changedBy,
        },
      });
    } else {
      await this.prisma.db.mailCenterSetting.create({
        data: {
          id: prefixedId('mcset'),
          tenantId,
          providerMode: next.providerMode,
          categorySystem: next.categorySystem as Prisma.InputJsonValue,
          categoryB2b: next.categoryB2b as Prisma.InputJsonValue,
          categoryMarketing: next.categoryMarketing as Prisma.InputJsonValue,
          updatedBy: changedBy,
        },
      });
    }
    await this.writeSettingsAudit(before, next, changedBy);
    return { success: true, settings: next };
  }

  async resetMailCenterSettings() {
    const before = await this.loadMailCenterSettings();
    const next = defaultMailCenterSettings();
    const changedBy = this.tenantContext.get()?.principalId ?? 'system';
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.mailCenterSetting.findFirst({ where: { tenantId } });
    if (existing) {
      await this.prisma.db.mailCenterSetting.updateMany({
        where: { tenantId, id: existing.id },
        data: {
          providerMode: next.providerMode,
          categorySystem: next.categorySystem as Prisma.InputJsonValue,
          categoryB2b: next.categoryB2b as Prisma.InputJsonValue,
          categoryMarketing: next.categoryMarketing as Prisma.InputJsonValue,
          updatedBy: changedBy,
        },
      });
    } else {
      await this.prisma.db.mailCenterSetting.create({
        data: {
          id: prefixedId('mcset'),
          tenantId,
          providerMode: next.providerMode,
          categorySystem: next.categorySystem as Prisma.InputJsonValue,
          categoryB2b: next.categoryB2b as Prisma.InputJsonValue,
          categoryMarketing: next.categoryMarketing as Prisma.InputJsonValue,
          updatedBy: changedBy,
        },
      });
    }
    await this.prisma.db.mailSettingsAuditLog.create({
      data: {
        id: prefixedId('msal'),
        tenantId,
        category: 'all',
        field: 'reset-to-defaults',
        oldValue: before as Prisma.InputJsonValue,
        newValue: next as Prisma.InputJsonValue,
        changedBy,
      },
    });
    return { success: true, settings: next };
  }

  async settingsAudit(query: MailSettingsAuditQuery) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailSettingsAuditLog.findMany({
      where: { tenantId },
      orderBy: { changedAt: 'desc' },
      take: query.limit,
    });
  }

  private async evaluateDeliverySendDecision(delivery: {
    eventKey: string;
    category: string;
    metadata: Prisma.JsonValue;
  }): Promise<MailSendDecision> {
    const settings = await this.loadMailCenterSettings();
    const category = resolveSettingsCategory(delivery.eventKey, delivery.category);
    const base = {
      providerMode: settings.providerMode,
      category,
    };

    if (settings.providerMode === 'disabled') {
      return {
        ...base,
        allowed: false,
        status: 'queued_disabled',
        reason: 'Provider mode is disabled. Delivery proof was recorded without contacting the recipient.',
        field: 'providerMode',
      };
    }

    if (settings.providerMode === 'test' && !isSystemTestDelivery(delivery.eventKey, delivery.metadata)) {
      return {
        ...base,
        allowed: false,
        status: 'queued_disabled',
        reason: 'Provider mode is test-only. This non-test delivery was recorded without contacting the recipient.',
        field: 'providerMode',
      };
    }

    if (isCriticalMailEvent(delivery.eventKey)) {
      return { ...base, allowed: true, reason: 'critical-bypass' };
    }

    if (category === 'marketing') {
      if (!settings.categoryMarketing.enabled) {
        return {
          ...base,
          allowed: false,
          status: 'skipped',
          reason: 'Marketing mail is disabled by tenant send controls.',
          field: 'categoryMarketing.enabled',
        };
      }
      const type = marketingTypeForEvent(delivery.eventKey);
      if (type && settings.categoryMarketing.types[type] === false) {
        return {
          ...base,
          allowed: false,
          status: 'skipped',
          reason: `Marketing ${type} mail is disabled by tenant send controls.`,
          field: `categoryMarketing.types.${type}`,
        };
      }
      return { ...base, allowed: true, reason: 'category-enabled' };
    }

    if (category === 'system.b2b') {
      if (!settings.categoryB2b.enabled) {
        return {
          ...base,
          allowed: false,
          status: 'skipped',
          reason: 'Account mail is disabled by tenant send controls.',
          field: 'categoryB2b.enabled',
        };
      }
      if (settings.categoryB2b.subcategories[delivery.eventKey] === false) {
        return {
          ...base,
          allowed: false,
          status: 'skipped',
          reason: 'This account mail event is disabled by tenant send controls.',
          field: `categoryB2b.subcategories.${delivery.eventKey}`,
        };
      }
      return { ...base, allowed: true, reason: 'category-enabled' };
    }

    if (!settings.categorySystem.enabled) {
      return {
        ...base,
        allowed: false,
        status: 'skipped',
        reason: 'System mail is disabled by tenant send controls.',
        field: 'categorySystem.enabled',
      };
    }
    if (settings.categorySystem.subcategories[delivery.eventKey] === false) {
      return {
        ...base,
        allowed: false,
        status: 'skipped',
        reason: 'This system mail event is disabled by tenant send controls.',
        field: `categorySystem.subcategories.${delivery.eventKey}`,
      };
    }
    return { ...base, allowed: true, reason: 'category-enabled' };
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

  async receiveResendWebhook(input: ResendWebhookInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: input.tenantSlug },
      include: { config: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found for this Resend webhook.');

    const webhookSecret = this.resolveResendWebhookSecret(tenant.config?.resendWebhookSecretEncrypted);
    if (!webhookSecret) throw new BadRequestException('Resend webhook signing secret is not configured for this tenant.');

    verifyResendSvixSignature(input.rawBody, input.headers, webhookSecret);
    const event = parseResendWebhookEvent(input.rawBody);
    const providerEventId = requiredResendWebhookHeader(input.headers, 'svix-id');
    const requestId = this.tenantContext.get()?.requestId ?? `resend-webhook-${providerEventId}`;

    return this.tenantContext.run({ requestId, tenantId: tenant.id, permissions: [] }, async () => {
      const tenantId = tenant.id;
      const duplicate = await this.prisma.db.mailProviderEvent.findFirst({
        where: { tenantId, provider: 'resend', providerEventId },
      });
      if (duplicate) {
        return {
          accepted: true,
          status: 'duplicate',
          eventId: duplicate.id,
          deliveryId: duplicate.deliveryId,
          eventType: duplicate.eventType,
        };
      }

      const delivery = await this.resolveResendWebhookDelivery(event);
      const ignoredReason = delivery ? null : 'delivery_not_matched';
      let stored: { id: string; deliveryId: string | null; eventType: string };
      try {
        stored = await this.prisma.db.mailProviderEvent.create({
          data: {
            id: prefixedId('mpev'),
            tenantId,
            provider: 'resend',
            providerEventId,
            providerMessageId: event.providerMessageId,
            deliveryId: delivery?.id ?? null,
            eventType: event.type,
            recipientEmail: event.recipientEmail,
            subject: event.subject,
            payload: event.payload as Prisma.InputJsonValue,
            headers: safeResendWebhookHeaders(input.headers) as Prisma.InputJsonValue,
            occurredAt: event.occurredAt,
            ignoredReason,
          },
        });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        const racedDuplicate = await this.prisma.db.mailProviderEvent.findFirst({
          where: { tenantId, provider: 'resend', providerEventId },
        });
        if (!racedDuplicate) throw error;
        return {
          accepted: true,
          status: 'duplicate',
          eventId: racedDuplicate.id,
          deliveryId: racedDuplicate.deliveryId,
          eventType: racedDuplicate.eventType,
        };
      }

      await this.applyResendProviderEvent(event, delivery);
      await this.prisma.db.mailProviderEvent.updateMany({
        where: { tenantId, id: stored.id },
        data: { processedAt: new Date() },
      });

      this.logger.log('mail', 'resend_webhook_processed', 'Resend provider event processed', {
        mail_provider_event_id: stored.id,
        mail_delivery_id: delivery?.id ?? null,
        event_type: event.type,
        ignored_reason: ignoredReason,
      });

      return {
        accepted: true,
        status: ignoredReason ? 'stored_unmatched' : 'processed',
        eventId: stored.id,
        deliveryId: delivery?.id ?? null,
        eventType: event.type,
      };
    });
  }

  async health(): Promise<MailProviderHealthResponse> {
    const startedAt = Date.now();
    const settings = await this.loadMailCenterSettings();
    const providerModeReason = settings.providerMode === 'live'
      ? null
      : settings.providerMode === 'test'
        ? 'Provider mode is test-only. Only explicit System Mail test messages can contact recipients.'
        : 'Provider mode is disabled. Delivery records are proof-only and no customer email is sent.';
    const credentials = await this.resolveResendApiKeyWithSource();
    const operational = await this.mailOperationalHealth();
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
        disabledReason: providerModeReason ?? 'Provider key is missing. Delivery records can still be recorded as disabled proof, but customer email is not sent.',
        ...operational,
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
          disabledReason: providerModeReason,
          ...operational,
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
        disabledReason: message,
        ...operational,
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
        disabledReason: message.slice(0, 300),
        ...operational,
      };
    }
  }

  private async mailOperationalHealth(): Promise<Pick<MailProviderHealthResponse, 'queueCounts' | 'dlq' | 'deliveryWindow'>> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tenantId = this.tenantId();
    const [queueCountsRaw, dlq, byStatusRows, byCategoryRows] = await Promise.all([
      this.outboundQueue?.getJobCounts().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('mail', 'queue_health_failed', 'Mail queue counts could not be read', { error: message });
        return {};
      }) ?? {},
      Promise.all([
        this.prisma.db.mailDlq.count({ where: { tenantId, status: 'pending' } }),
        this.prisma.db.mailDlq.count({ where: { tenantId, status: 'retrying' } }),
        this.prisma.db.mailDlq.count({ where: { tenantId, status: 'resolved' } }),
        this.prisma.db.mailDlq.count({ where: { tenantId, status: 'discarded' } }),
      ]).then(([pending, retrying, resolved, discarded]) => ({ pending, retrying, resolved, discarded })),
      this.prisma.db.mailDelivery.groupBy({
        by: ['status'],
        where: { tenantId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.db.mailDelivery.groupBy({
        by: ['category'],
        where: { tenantId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const queueCounts = queueCountsRaw as Record<string, unknown>;

    return {
      queueCounts: {
        waiting: numberFromUnknown(queueCounts.waiting),
        active: numberFromUnknown(queueCounts.active),
        completed: numberFromUnknown(queueCounts.completed),
        failed: numberFromUnknown(queueCounts.failed),
        delayed: numberFromUnknown(queueCounts.delayed),
        paused: numberFromUnknown(queueCounts.paused),
      },
      dlq,
      deliveryWindow: {
        hours: 24,
        byStatus: Object.fromEntries(byStatusRows.map((row) => [row.status, row._count._all])),
        byCategory: Object.fromEntries(byCategoryRows.map((row) => [row.category, row._count._all])),
      },
    };
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
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: input.eventKey,
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        action_url: invitationUrl,
        invitation_url: invitationUrl,
        reset_url: invitationUrl,
        expires_in_days: 7,
        surface: input.surface,
      },
      fallback: {
        subject,
        html,
        text: `Hello ${input.recipientName}, accept your ${brand} invitation: ${invitationUrl}`,
      },
    });
    return this.sendTransactional({
      eventKey: input.eventKey,
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        ...(input.metadata ?? {}),
        invitationUrl,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendB2BApplicationApproved(input: {
    to: string;
    recipientName: string;
    companyName: string;
    requestId: string;
    customerId: string;
    customerUserId: string;
    existingPortalAccount: boolean;
  }) {
    const brand = await this.resolveBrandName();
    const baseUrl = this.config.get<string>('ACCOUNTS_URL')?.replace(/\/+$/, '') || '';
    const loginUrl = `${baseUrl}/login`;
    const subject = `${brand} B2B access approved`;
    const accountText = input.existingPortalAccount
      ? 'Your existing portal account now has B2B access.'
      : 'Your portal account is ready with B2B access.';
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>Your B2B access application for <strong>${escapeHtml(input.companyName)}</strong> has been approved.</p>`,
      `<p>${escapeHtml(accountText)}</p>`,
      loginUrl ? `<p><a href="${escapeHtml(loginUrl)}">Open your account portal</a></p>` : '',
      '<p>You can now review orders, invoices, reorder options, team users, and account pricing from the portal.</p>',
    ].filter(Boolean).join('');
    const text = [
      `Hello ${input.recipientName},`,
      `Your B2B access application for ${input.companyName} has been approved.`,
      accountText,
      loginUrl ? `Open your account portal: ${loginUrl}` : '',
      'You can now review orders, invoices, reorder options, team users, and account pricing from the portal.',
    ].filter(Boolean).join('\n\n');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.application_approved.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        companyName: input.companyName,
        company_name: input.companyName,
        account_text: accountText,
        login_url: loginUrl,
        portal_url: loginUrl,
        action_url: loginUrl,
        request_id: input.requestId,
        customer_id: input.customerId,
        customer_user_id: input.customerUserId,
        existing_portal_account: input.existingPortalAccount,
      },
      fallback: { subject, html, text },
    });
    return this.sendTransactional({
      eventKey: 'b2b.application_approved.user',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        requestId: input.requestId,
        customerId: input.customerId,
        customerUserId: input.customerUserId,
        companyName: input.companyName,
        existingPortalAccount: input.existingPortalAccount,
        loginUrl,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendB2BApplicationReceived(input: {
    to: string;
    recipientName: string;
    companyName: string;
    requestId: string;
    sourceSurface?: string | null;
    sourcePath?: string | null;
    sourceUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const portalUrl = `${(this.config.get<string>('ACCOUNTS_URL') ?? '').replace(/\/+$/, '')}/login`;
    const subject = `We received your ${brand} B2B application`;
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>We received the B2B access application for <strong>${escapeHtml(input.companyName)}</strong>.</p>`,
      '<p>Our team will review the request and follow up with the next step.</p>',
      portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">Open account portal</a></p>` : '',
      `<p>Reference: ${escapeHtml(input.requestId)}</p>`,
    ].filter(Boolean).join('');
    const text = [
      `Hello ${input.recipientName},`,
      `We received the B2B access application for ${input.companyName}.`,
      'Our team will review the request and follow up with the next step.',
      portalUrl ? `Portal: ${portalUrl}` : '',
      `Reference: ${input.requestId}`,
    ].filter(Boolean).join('\n\n');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.application_received.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        companyName: input.companyName,
        company_name: input.companyName,
        requestId: input.requestId,
        request_id: input.requestId,
        portal_url: portalUrl,
        login_url: portalUrl,
        action_url: portalUrl,
        review_timeline: '1-2 business days',
        source_surface: input.sourceSurface ?? '',
        source_path: input.sourcePath ?? '',
        source_url: input.sourceUrl ?? '',
      },
      fallback: { subject, html, text },
    });
    return this.sendTransactional({
      eventKey: 'b2b.application_received.user',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        requestId: input.requestId,
        companyName: input.companyName,
        sourceSurface: input.sourceSurface ?? null,
        sourcePath: input.sourcePath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendB2BApplicationReceivedInternal(input: {
    to: string;
    recipientName: string;
    applicantName: string;
    applicantEmail: string;
    applicantPhone?: string | null;
    companyName: string;
    requestId: string;
    sourceSurface?: string | null;
    sourcePath?: string | null;
    sourceUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const adminUrl = `${(this.config.get<string>('ADMIN_URL') ?? '').replace(/\/+$/, '')}/b2b-access`;
    const subject = `New B2B application: ${input.companyName}`;
    const html = [
      `<p>${escapeHtml(input.applicantName)} submitted a B2B application for <strong>${escapeHtml(input.companyName)}</strong>.</p>`,
      `<p><strong>Email:</strong> ${escapeHtml(input.applicantEmail)}</p>`,
      input.applicantPhone ? `<p><strong>Phone:</strong> ${escapeHtml(input.applicantPhone)}</p>` : '',
      `<p><strong>Reference:</strong> ${escapeHtml(input.requestId)}</p>`,
      adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Review request</a></p>` : '',
    ].filter(Boolean).join('');
    const text = [
      `${input.applicantName} submitted a B2B application for ${input.companyName}.`,
      `Email: ${input.applicantEmail}`,
      input.applicantPhone ? `Phone: ${input.applicantPhone}` : '',
      `Reference: ${input.requestId}`,
      adminUrl ? `Review: ${adminUrl}` : '',
    ].filter(Boolean).join('\n\n');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.application_received.internal',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        applicantName: input.applicantName,
        applicant_name: input.applicantName,
        applicantEmail: input.applicantEmail,
        applicant_email: input.applicantEmail,
        applicantPhone: input.applicantPhone ?? '',
        phone: input.applicantPhone ?? '',
        companyName: input.companyName,
        company_name: input.companyName,
        requestId: input.requestId,
        request_id: input.requestId,
        admin_url: adminUrl,
        action_url: adminUrl,
        source_surface: input.sourceSurface ?? '',
        source_path: input.sourcePath ?? '',
        source_url: input.sourceUrl ?? '',
      },
      fallback: { subject, html, text },
    });
    return this.sendTransactional({
      eventKey: 'b2b.application_received.internal',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        requestId: input.requestId,
        companyName: input.companyName,
        applicantEmail: input.applicantEmail,
        sourceSurface: input.sourceSurface ?? null,
        sourcePath: input.sourcePath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendB2BApplicationRejected(input: {
    to: string;
    recipientName: string;
    companyName: string;
    reviewNotes?: string | null;
    requestId: string;
  }) {
    const brand = await this.resolveBrandName();
    const note = input.reviewNotes?.trim();
    const subject = `${brand} B2B access application update`;
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>Thank you for applying for B2B access with <strong>${escapeHtml(brand)}</strong>.</p>`,
      `<p>We could not approve the application for <strong>${escapeHtml(input.companyName)}</strong> at this time.</p>`,
      note ? `<p><strong>Review note:</strong> ${escapeHtml(note)}</p>` : '',
      '<p>If your account details change, you can submit a new application from the customer portal.</p>',
    ].filter(Boolean).join('');
    const text = [
      `Hello ${input.recipientName},`,
      `Thank you for applying for B2B access with ${brand}.`,
      `We could not approve the application for ${input.companyName} at this time.`,
      note ? `Review note: ${note}` : '',
      'If your account details change, you can submit a new application from the customer portal.',
    ].filter(Boolean).join('\n\n');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.application_rejected.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        companyName: input.companyName,
        company_name: input.companyName,
        review_note: note ?? '',
        request_id: input.requestId,
      },
      fallback: { subject, html, text },
    });
    return this.sendTransactional({
      eventKey: 'b2b.application_rejected.user',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        requestId: input.requestId,
        companyName: input.companyName,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendAccountInvoiceDelivered(input: {
    to: string;
    recipientName: string;
    invoiceId: string;
    invoiceNumber: string;
    amountDue: number;
    currency: string;
    dueAt?: Date | null;
    invoiceUrl?: string | null;
    paymentUrl?: string | null;
    portalUrl?: string | null;
    note?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const portalUrl = input.portalUrl?.trim()
      || `${(this.config.get<string>('ACCOUNTS_URL') ?? '').replace(/\/+$/, '')}/invoices`;
    const amountDue = formatCurrency(input.amountDue, input.currency);
    const dueDate = input.dueAt ? input.dueAt.toLocaleDateString('en-US', { dateStyle: 'medium' }) : null;
    const note = input.note?.trim();
    const subject = `${brand} invoice ${input.invoiceNumber}`;
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>Your invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is ready in the <strong>${escapeHtml(brand)}</strong> account portal.</p>`,
      `<p><strong>Amount due:</strong> ${escapeHtml(amountDue)}${dueDate ? ` · <strong>Due:</strong> ${escapeHtml(dueDate)}` : ''}</p>`,
      note ? `<p><strong>Billing note:</strong> ${escapeHtml(note)}</p>` : '',
      input.paymentUrl ? `<p><a href="${escapeHtml(input.paymentUrl)}">Open secure payment link</a></p>` : '',
      input.invoiceUrl ? `<p><a href="${escapeHtml(input.invoiceUrl)}">Download invoice file</a></p>` : '',
      portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">Review invoice in your account portal</a></p>` : '',
      '<p>If you have questions, reply to this email or contact billing from your account portal.</p>',
    ].filter(Boolean).join('');
    const text = [
      `Hello ${input.recipientName},`,
      `Your invoice ${input.invoiceNumber} is ready in the ${brand} account portal.`,
      `Amount due: ${amountDue}${dueDate ? ` · Due: ${dueDate}` : ''}`,
      note ? `Billing note: ${note}` : '',
      input.paymentUrl ? `Payment link: ${input.paymentUrl}` : '',
      input.invoiceUrl ? `Invoice file: ${input.invoiceUrl}` : '',
      portalUrl ? `Account portal: ${portalUrl}` : '',
      'If you have questions, reply to this email or contact billing from your account portal.',
    ].filter(Boolean).join('\n\n');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.invoice_delivered.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        invoice_id: input.invoiceId,
        invoice_number: input.invoiceNumber,
        amount_due: amountDue,
        amount_due_value: input.amountDue,
        currency: input.currency,
        due_date: dueDate ?? '',
        due_at: input.dueAt?.toISOString() ?? '',
        invoice_url: input.invoiceUrl ?? '',
        payment_url: input.paymentUrl ?? '',
        portal_url: portalUrl,
        action_url: input.paymentUrl ?? portalUrl,
        billing_note: note ?? '',
      },
      fallback: { subject, html, text },
    });
    return this.sendTransactional({
      eventKey: 'b2b.invoice_delivered.user',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
        amountDue: input.amountDue,
        currency: input.currency,
        dueAt: input.dueAt?.toISOString() ?? null,
        invoiceUrl: input.invoiceUrl ?? null,
        paymentUrl: input.paymentUrl ?? null,
        portalUrl: portalUrl || null,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendOrderConfirmation(input: {
    to: string;
    recipientName: string;
    shopifyOrderId: string;
    orderNumber: string;
    total: number;
    currency: string;
    portalUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const total = formatCurrency(input.total, input.currency);
    const portalUrl = input.portalUrl?.trim()
      || `${(this.config.get<string>('ACCOUNTS_URL') ?? '').replace(/\/+$/, '')}/orders`;
    const subject = `${brand} order ${input.orderNumber} confirmed`;
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>We received your order <strong>${escapeHtml(input.orderNumber)}</strong>.</p>`,
      `<p><strong>Order total:</strong> ${escapeHtml(total)}</p>`,
      portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">View your order</a></p>` : '',
    ].filter(Boolean).join('');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'orders.order_confirmation.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        shopify_order_id: input.shopifyOrderId,
        order_number: input.orderNumber,
        order_total: total,
        order_total_value: input.total,
        currency: input.currency,
        portal_url: portalUrl,
        order_url: portalUrl,
        action_url: portalUrl,
      },
      fallback: {
        subject,
        html,
        text: `Hello ${input.recipientName}, we received your order ${input.orderNumber}. Order total: ${total}.${portalUrl ? ` View your order: ${portalUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'orders.order_confirmation.user',
      category: 'system',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `shopify:order_confirmation:${input.shopifyOrderId}:${input.to.toLowerCase()}`,
      metadata: {
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendOrderShipment(input: {
    to: string;
    recipientName: string;
    shopifyOrderId: string;
    orderNumber: string;
    shipmentId: string;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    trackingCompany?: string | null;
    portalUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const portalUrl = input.portalUrl?.trim()
      || `${(this.config.get<string>('ACCOUNTS_URL') ?? '').replace(/\/+$/, '')}/orders`;
    const subject = `${brand} order ${input.orderNumber} is on its way`;
    const trackingLine = input.trackingNumber
      ? `<p><strong>Tracking:</strong> ${escapeHtml(input.trackingNumber)}${input.trackingCompany ? ` (${escapeHtml(input.trackingCompany)})` : ''}</p>`
      : '';
    const html = [
      `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
      `<p>Your order <strong>${escapeHtml(input.orderNumber)}</strong> has shipped.</p>`,
      trackingLine,
      input.trackingUrl ? `<p><a href="${escapeHtml(input.trackingUrl)}">Track shipment</a></p>` : '',
      portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">View your order</a></p>` : '',
    ].filter(Boolean).join('');
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'orders.order_shipped.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        shopify_order_id: input.shopifyOrderId,
        order_number: input.orderNumber,
        shipment_id: input.shipmentId,
        tracking_number: input.trackingNumber ?? '',
        tracking_url: input.trackingUrl ?? '',
        tracking_company: input.trackingCompany ?? '',
        portal_url: portalUrl,
        order_url: portalUrl,
        action_url: input.trackingUrl ?? portalUrl,
      },
      fallback: {
        subject,
        html,
        text: `Hello ${input.recipientName}, your order ${input.orderNumber} has shipped.${input.trackingNumber ? ` Tracking: ${input.trackingNumber}.` : ''}${input.trackingUrl ? ` Track shipment: ${input.trackingUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'orders.order_shipped.user',
      category: 'system',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `shopify:order_shipped:${input.shopifyOrderId}:${input.shipmentId}:${input.to.toLowerCase()}`,
      metadata: {
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        shipmentId: input.shipmentId,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendPickupReady(input: {
    to: string;
    recipientName: string;
    pickupOrderId: string;
    orderNumber: string;
    shelfCode?: string | null;
    portalUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const portalUrl = input.portalUrl?.trim()
      || `${(this.config.get<string>('ACCOUNTS_URL') ?? '').replace(/\/+$/, '')}/pickup`;
    const subject = `${brand} order ${input.orderNumber} is ready for pickup`;
    const shelfLine = input.shelfCode ? ` Pickup location: ${input.shelfCode}.` : '';
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'orders.pickup_ready.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        pickup_order_id: input.pickupOrderId,
        order_number: input.orderNumber,
        shelf_code: input.shelfCode ?? '',
        portal_url: portalUrl,
        action_url: portalUrl,
      },
      fallback: {
        subject,
        html: [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p>Your order <strong>${escapeHtml(input.orderNumber)}</strong> is ready for pickup.</p>`,
          input.shelfCode ? `<p><strong>Pickup location:</strong> ${escapeHtml(input.shelfCode)}</p>` : '',
          portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">View pickup details</a></p>` : '',
        ].filter(Boolean).join(''),
        text: `Hello ${input.recipientName}, your order ${input.orderNumber} is ready for pickup.${shelfLine}${portalUrl ? ` View pickup details: ${portalUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'orders.pickup_ready.user',
      category: 'system',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `order:pickup_ready:${input.pickupOrderId}:${input.to.toLowerCase()}`,
      metadata: {
        pickupOrderId: input.pickupOrderId,
        orderNumber: input.orderNumber,
        shelfCode: input.shelfCode ?? null,
        templateSource: rendered.templateSource,
      },
    });
  }

  async listInternalRecipients() {
    return this.prisma.db.member.findMany({
      where: {
        status: 'active',
        roleAssignments: { some: { role: { slug: { in: ['owner', 'admin'] } } } },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 25,
    });
  }

  async sendSupportTicketEvent(input: {
    eventKey: SupportTicketEventKey;
    eventId: string;
    to: string;
    recipientName: string;
    ticketId: string;
    ticketNumber: string;
    ticketSubject: string;
    ticketMessage?: string | null;
    replyMessage?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    actionUrl?: string | null;
    adminUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const fallback = supportTicketFallback(input, brand);
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: input.eventKey,
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        ticket_id: input.ticketId,
        ticket_number: input.ticketNumber,
        ticket_subject: input.ticketSubject,
        ticket_message: input.ticketMessage ?? '',
        reply_message: input.replyMessage ?? '',
        customer_name: input.customerName ?? '',
        customer_email: input.customerEmail ?? '',
        action_url: input.actionUrl ?? input.adminUrl ?? '',
        admin_url: input.adminUrl ?? '',
      },
      fallback,
    });
    return this.sendTransactional({
      eventKey: input.eventKey,
      category: 'system',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `support:${input.eventKey}:${input.eventId}:${input.to.toLowerCase()}`,
      metadata: {
        ticketId: input.ticketId,
        ticketNumber: input.ticketNumber,
        ticketSubject: input.ticketSubject,
        templateSource: rendered.templateSource,
      },
    });
  }

  async sendPasswordResetCompleted(input: {
    to: string;
    recipientName: string;
    eventId: string;
    surface: 'admin' | 'person' | 'accounts';
  }) {
    const brand = await this.resolveBrandName();
    const loginUrl = this.surfaceLoginUrl(input.surface);
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'auth.password_reset_completed.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        login_url: loginUrl,
        action_url: loginUrl,
        surface: input.surface,
      },
      fallback: {
        subject: `${brand} password updated`,
        html: [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p>Your ${escapeHtml(brand)} password was updated successfully.</p>`,
          `<p>If you did not make this change, contact your workspace administrator immediately.</p>`,
          loginUrl ? `<p><a href="${escapeHtml(loginUrl)}">Sign in</a></p>` : '',
        ].filter(Boolean).join(''),
        text: `Hello ${input.recipientName}, your ${brand} password was updated successfully.${loginUrl ? ` Sign in: ${loginUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'auth.password_reset_completed.user',
      category: 'system',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `auth:password_reset_completed:${input.eventId}:${input.to.toLowerCase()}`,
      metadata: { surface: input.surface, templateSource: rendered.templateSource },
    });
  }

  async sendAccountActivated(input: {
    to: string;
    recipientName: string;
    eventId: string;
    surface: 'admin' | 'accounts';
  }) {
    const brand = await this.resolveBrandName();
    const loginUrl = this.surfaceLoginUrl(input.surface);
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'users.account_activated.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        login_url: loginUrl,
        action_url: loginUrl,
      },
      fallback: {
        subject: `${brand} account is ready`,
        html: [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p>Your ${escapeHtml(brand)} account is active and ready to use.</p>`,
          loginUrl ? `<p><a href="${escapeHtml(loginUrl)}">Open your account</a></p>` : '',
        ].filter(Boolean).join(''),
        text: `Hello ${input.recipientName}, your ${brand} account is active.${loginUrl ? ` Open your account: ${loginUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'users.account_activated.user',
      category: 'system',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `auth:account_activated:${input.eventId}:${input.to.toLowerCase()}`,
      metadata: { surface: input.surface, templateSource: rendered.templateSource },
    });
  }

  async sendB2BInvitationAcceptedInternal(input: {
    to: string;
    recipientName: string;
    eventId: string;
    accountName: string;
    accountEmail: string;
    adminUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.invitation_accepted.internal',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        account_name: input.accountName,
        customer_name: input.accountName,
        account_email: input.accountEmail,
        customer_email: input.accountEmail,
        admin_url: input.adminUrl ?? '',
        action_url: input.adminUrl ?? '',
      },
      fallback: {
        subject: `${input.accountName} activated B2B access`,
        html: [
          `<p><strong>${escapeHtml(input.accountName)}</strong> activated B2B access.</p>`,
          `<p>Email: ${escapeHtml(input.accountEmail)}</p>`,
          input.adminUrl ? `<p><a href="${escapeHtml(input.adminUrl)}">Open B2B applications</a></p>` : '',
        ].filter(Boolean).join(''),
        text: `${input.accountName} (${input.accountEmail}) activated B2B access.${input.adminUrl ? ` Review: ${input.adminUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'b2b.invitation_accepted.internal',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `b2b:invitation_accepted:${input.eventId}:${input.to.toLowerCase()}`,
      metadata: { accountEmail: input.accountEmail, templateSource: rendered.templateSource },
    });
  }

  async sendCustomPricingChanged(input: {
    to: string;
    recipientName: string;
    eventId: string;
    pricingName: string;
    pricingSummary: string;
    active: boolean;
  }) {
    const brand = await this.resolveBrandName();
    const portalUrl = `${(this.config.get<string>('ACCOUNTS_URL') ?? '').replace(/\/+$/, '')}/products`;
    const changeLabel = input.active ? 'is now available' : 'is no longer active';
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'b2b.custom_pricing_changed.user',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        pricing_name: input.pricingName,
        pricing_summary: input.pricingSummary,
        pricing_active: input.active,
        pricing_status: changeLabel,
        portal_url: portalUrl,
        action_url: portalUrl,
      },
      fallback: {
        subject: `${brand} pricing update`,
        html: [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p>Your account pricing <strong>${escapeHtml(input.pricingName)}</strong> ${escapeHtml(changeLabel)}.</p>`,
          `<p>${escapeHtml(input.pricingSummary)}</p>`,
          portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">Review account pricing</a></p>` : '',
        ].filter(Boolean).join(''),
        text: `Hello ${input.recipientName}, your account pricing ${input.pricingName} ${changeLabel}. ${input.pricingSummary}${portalUrl ? ` Review account pricing: ${portalUrl}` : ''}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'b2b.custom_pricing_changed.user',
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `pricing:changed:${input.eventId}:${input.to.toLowerCase()}`,
      metadata: { pricingName: input.pricingName, active: input.active, templateSource: rendered.templateSource },
    });
  }

  async sendTaxExemptEvent(input: {
    eventKey: TaxExemptEventKey;
    eventId: string;
    to: string;
    recipientName: string;
    companyName: string;
    requestId: string;
    applicantEmail?: string | null;
    reviewNotes?: string | null;
    actionUrl?: string | null;
  }) {
    const brand = await this.resolveBrandName();
    const fallback = taxExemptFallback(input, brand);
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: input.eventKey,
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        company_name: input.companyName,
        applicant_email: input.applicantEmail ?? '',
        email: input.applicantEmail ?? input.to,
        request_id: input.requestId,
        review_notes: input.reviewNotes ?? '',
        login_url: input.actionUrl ?? '',
        admin_url: input.actionUrl ?? '',
        action_url: input.actionUrl ?? '',
      },
      fallback,
    });
    return this.sendTransactional({
      eventKey: input.eventKey,
      category: 'system.b2b',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      idempotencyKey: `tax_exempt:${input.eventKey}:${input.eventId}:${input.to.toLowerCase()}`,
      metadata: { requestId: input.requestId, companyName: input.companyName, templateSource: rendered.templateSource },
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
    const rendered = await this.renderTransactionalEventTemplate({
      eventKey: 'identity.password_reset',
      variables: {
        brand,
        brand_name: brand,
        recipientName: input.recipientName,
        recipient_name: input.recipientName,
        email: input.to,
        action_url: resetUrl,
        reset_url: resetUrl,
        expires_in_minutes: 30,
        surface: input.surface,
      },
      fallback: {
        subject: `${brand} password reset`,
        html,
        text: `Reset your ${brand} password: ${resetUrl}`,
      },
    });
    return this.sendTransactional({
      eventKey: 'identity.password_reset',
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        surface: input.surface,
        resetUrl,
        templateSource: rendered.templateSource,
      },
    });
  }

  private surfaceLoginUrl(surface: 'admin' | 'person' | 'accounts') {
    const base = surface === 'accounts'
      ? this.config.get<string>('ACCOUNTS_URL')
      : surface === 'person'
        ? this.config.get<string>('PERSON_APP_URL')
        : this.config.get<string>('ADMIN_URL');
    return `${(base ?? '').replace(/\/+$/, '')}/login`;
  }

  async deliverQueued(deliveryId: string) {
    const existing = await this.repository.findById(deliveryId);
    if (!existing) throw new NotFoundException('Mail delivery not found');
    if (existing.status === 'sent') return existing;
    if (existing.status === 'queued_disabled') return existing;

    const sendDecision = await this.evaluateDeliverySendDecision(existing);
    if (!sendDecision.allowed) {
      const metadata = {
        sendControl: sendDecision,
        providerMode: sendDecision.providerMode,
        sendingEnabled: false,
      } as Prisma.InputJsonValue;
      this.logger.warn('mail', 'send_control_blocked', sendDecision.reason, {
        mail_delivery_id: existing.id,
        event_key: existing.eventKey,
        category: sendDecision.category,
        provider_mode: sendDecision.providerMode,
        field: sendDecision.field ?? null,
      });
      if (sendDecision.status === 'queued_disabled') {
        return this.repository.markQueuedDisabled(existing.id, sendDecision.reason, metadata);
      }
      return this.repository.markSkipped(existing.id, sendDecision.reason, metadata);
    }

    const delivery = await this.repository.markSending(deliveryId);
    if (!delivery) throw new NotFoundException('Mail delivery not found');

    const apiKey = await this.resolveResendApiKey();
    if (!apiKey) {
      this.logger.warn('mail', 'resend_missing', 'RESEND_API_KEY is not configured; delivery skipped', { mail_delivery_id: delivery.id });
      return this.repository.markSkipped(delivery.id, 'RESEND_API_KEY is not configured');
    }

    try {
      const transport = deliveryTransport(delivery.metadata);
      const from = await this.resolveFromAddress(transport.fromName);
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
          ...(transport.replyTo ? { reply_to: transport.replyTo } : {}),
          tags: [
            { name: 'delivery_id', value: tagValue(delivery.id) },
            { name: 'tenant_id', value: tagValue(delivery.tenantId) },
            { name: 'category', value: tagValue(delivery.category) },
            { name: 'event_key', value: tagValue(delivery.eventKey) },
          ],
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
      await this.recordDlq(delivery.id, message);
      this.logger.error('mail', 'send_failed', message, { mail_delivery_id: delivery.id, event_key: delivery.eventKey });
      throw error;
    }
  }

  async loadMailCenterSettings(): Promise<MailCenterSettings> {
    const tenantId = this.tenantId();
    const row = await this.prisma.db.mailCenterSetting.findFirst({ where: { tenantId } });
    if (!row) return defaultMailCenterSettings();
    return sanitizeMailSettings({
      providerMode: row.providerMode,
      categorySystem: row.categorySystem,
      categoryB2b: row.categoryB2b,
      categoryMarketing: row.categoryMarketing,
    });
  }

  private async writeSettingsAudit(before: MailCenterSettings, after: MailCenterSettings, changedBy: string) {
    const rows = diffSettings(before, after);
    if (rows.length === 0) return;
    const tenantId = this.tenantId();
    await this.prisma.db.mailSettingsAuditLog.createMany({
      data: rows.map((row) => ({
        id: prefixedId('msal'),
        tenantId,
        category: row.category,
        field: row.field,
        oldValue: row.oldValue as Prisma.InputJsonValue,
        newValue: row.newValue as Prisma.InputJsonValue,
        changedBy,
      })),
    });
  }

  private async recordDlq(deliveryId: string, message: string) {
    const delivery = await this.repository.findById(deliveryId);
    if (!delivery) return;
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.mailDlq.findFirst({ where: { tenantId, lastDeliveryId: deliveryId } });
    const payload = {
      deliveryId,
      subject: delivery.subject,
      category: delivery.category,
      metadata: delivery.metadata,
      attemptCount: delivery.attemptCount,
    };
    if (existing) {
      await this.prisma.db.mailDlq.updateMany({
        where: { tenantId, id: existing.id },
        data: {
          status: 'pending',
          provider: delivery.provider,
          errorMessage: message.slice(0, 1000),
          payload: payload as Prisma.InputJsonValue,
          resolvedAt: null,
        },
      });
      return;
    }
    await this.prisma.db.mailDlq.create({
      data: {
        id: prefixedId('mdlq'),
        tenantId,
        eventKey: delivery.eventKey,
        recipientEmail: delivery.recipientEmail,
        status: 'pending',
        provider: delivery.provider,
        errorMessage: message.slice(0, 1000),
        lastDeliveryId: delivery.id,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private async resolveBrandName() {
    const tenantBrand = await this.prisma.db.tenantConfig.findFirst({
      where: { tenantId: this.tenantId() },
      select: { workspaceName: true },
    });
    if (tenantBrand?.workspaceName?.trim()) return tenantBrand.workspaceName.trim();
    const workspaceName = this.config.get<string>('WORKSPACE_NAME') ?? this.config.get<string>('BRAND_NAME');
    return workspaceName?.trim() || 'Factory Engine Pro';
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }

  private async resolveResendApiKey() {
    return (await this.resolveResendApiKeyWithSource()).key ?? '';
  }

  private async resolveResendApiKeyWithSource(): Promise<{ key: string | null; source: 'tenant_config' | 'env' | 'none' }> {
    const tenantConfig = await this.prisma.db.tenantConfig.findFirst({
      where: { tenantId: this.tenantId() },
      select: { resendApiKeyEncrypted: true },
    });
    const tenantKey = this.crypto.decrypt(tenantConfig?.resendApiKeyEncrypted)?.trim();
    if (tenantKey) return { key: tenantKey, source: 'tenant_config' };
    const envKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (envKey) return { key: envKey, source: 'env' };
    return { key: null, source: 'none' };
  }

  private resolveResendWebhookSecret(encryptedTenantSecret: string | null | undefined) {
    const tenantSecret = this.crypto.decrypt(encryptedTenantSecret)?.trim();
    if (tenantSecret) return tenantSecret;
    return this.config.get<string>('RESEND_WEBHOOK_SECRET')?.trim() || null;
  }

  private async resolveResendWebhookDelivery(event: ResendWebhookEvent) {
    const tenantId = this.tenantId();
    const taggedDeliveryId = textValue(asRecord(event.data.tags).delivery_id);
    if (taggedDeliveryId) {
      const tagged = await this.prisma.db.mailDelivery.findFirst({ where: { tenantId, id: taggedDeliveryId } });
      if (tagged) return tagged;
    }
    if (event.providerMessageId) {
      return this.prisma.db.mailDelivery.findFirst({
        where: { tenantId, provider: 'resend', providerMessageId: event.providerMessageId },
      });
    }
    return null;
  }

  private async applyResendProviderEvent(
    event: ResendWebhookEvent,
    delivery: Awaited<ReturnType<MailService['resolveResendWebhookDelivery']>>,
  ) {
    if (delivery) {
      const currentMetadata = asRecord(delivery.metadata);
      const providerEvents = asRecord(currentMetadata.providerEvents);
      const counts = asRecord(providerEvents.counts);
      const currentCount = typeof counts[event.type] === 'number' ? counts[event.type] as number : 0;
      const happenedAt = event.occurredAt ?? new Date();
      const nextProviderEvents: Record<string, unknown> = {
        ...providerEvents,
        provider: 'resend',
        lastEventType: event.type,
        lastEventAt: happenedAt.toISOString(),
        counts: { ...counts, [event.type]: currentCount + 1 },
      };
      const timestampField = providerTimestampField(event.type);
      if (timestampField) nextProviderEvents[timestampField] = happenedAt.toISOString();

      const data: Prisma.MailDeliveryUpdateManyMutationInput = {
        metadata: {
          ...currentMetadata,
          providerEvents: nextProviderEvents,
        } as Prisma.InputJsonValue,
      };
      if (event.type === 'email.delivered' || event.type === 'email.sent') {
        data.status = 'sent';
        data.provider = 'resend';
        data.sentAt = delivery.sentAt ?? happenedAt;
        data.errorMessage = null;
      }
      if (event.type === 'email.failed' || event.type === 'email.bounced') {
        data.status = 'failed';
        data.errorMessage = eventFailureMessage(event);
      }
      if (event.type === 'email.suppressed') {
        data.status = 'skipped';
        data.errorMessage = eventFailureMessage(event);
      }
      await this.prisma.db.mailDelivery.updateMany({ where: { tenantId: delivery.tenantId, id: delivery.id }, data });
    }

    if (event.recipientEmail && shouldSuppressForProviderEvent(event.type)) {
      await this.suppressRecipientFromProvider(event);
    }
  }

  private async suppressRecipientFromProvider(event: ResendWebhookEvent) {
    const normalizedEmail = event.recipientEmail?.trim().toLowerCase();
    if (!normalizedEmail) return;
    const tenantId = this.tenantId();
    let contact = await this.prisma.db.mailContact.findFirst({ where: { tenantId, normalizedEmail } });
    if (!contact) {
      contact = await this.prisma.db.mailContact.create({
        data: {
          id: prefixedId('mcon'),
          tenantId,
          email: normalizedEmail,
          normalizedEmail,
          isSendable: false,
          metadata: {
            source: 'resend_webhook',
            lastProviderEvent: event.type,
            providerMessageId: event.providerMessageId,
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      await this.prisma.db.mailContact.updateMany({
        where: { tenantId, id: contact.id },
        data: {
          isSendable: false,
          metadata: {
            ...asRecord(contact.metadata),
            lastProviderEvent: event.type,
            providerMessageId: event.providerMessageId,
          } as Prisma.InputJsonValue,
        },
      });
    }

    const existing = await this.prisma.db.mailSuppression.findFirst({
      where: {
        tenantId,
        contactId: contact.id,
        channel: 'email',
        scope: 'global',
        category: null,
        campaignId: null,
        flowId: null,
        templateId: null,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const data = {
      scope: 'global',
      category: null,
      campaignId: null,
      flowId: null,
      templateId: null,
      isActive: true,
      reason: providerSuppressionReason(event.type),
      source: 'resend_webhook',
      notes: eventFailureMessage(event),
      expiresAt: null,
    };
    if (existing) {
      await this.prisma.db.mailSuppression.updateMany({ where: { tenantId, id: existing.id }, data });
      return;
    }
    await this.prisma.db.mailSuppression.create({
      data: {
        id: prefixedId('msup'),
        tenantId,
        contactId: contact.id,
        channel: 'email',
        ...data,
      },
    });
  }

  private async resolveFromAddress(overrideName?: string | null) {
    const brand = overrideName ?? await this.resolveBrandName();
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

function providerTimestampField(eventType: string) {
  const map: Record<string, string> = {
    'email.sent': 'sentAt',
    'email.delivered': 'deliveredAt',
    'email.opened': 'openedAt',
    'email.clicked': 'clickedAt',
    'email.bounced': 'bouncedAt',
    'email.complained': 'complainedAt',
    'email.failed': 'failedAt',
    'email.suppressed': 'suppressedAt',
    'email.delivery_delayed': 'deliveryDelayedAt',
  };
  return map[eventType] ?? null;
}

function eventFailureMessage(event: ResendWebhookEvent) {
  const bounce = asRecord(event.data.bounce);
  const failure = asRecord(event.data.failure);
  return (
    textValue(bounce.message) ||
    textValue(failure.message) ||
    textValue(event.data.reason) ||
    textValue(event.data.error) ||
    `Provider reported ${event.type}`
  ).slice(0, 1000);
}

function shouldSuppressForProviderEvent(eventType: string) {
  return eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.suppressed';
}

function providerSuppressionReason(eventType: string) {
  if (eventType === 'email.complained') return 'provider_spam_complaint';
  if (eventType === 'email.suppressed') return 'provider_suppressed';
  return 'provider_hard_bounce';
}

function resolveSettingsCategory(eventKey: string, storedCategory: string): MailSettingsCategory {
  const normalizedCategory = storedCategory.toLowerCase();
  if (normalizedCategory === 'marketing') return 'marketing';
  if (normalizedCategory === 'system.b2b' || normalizedCategory === 'b2b' || normalizedCategory === 'account') return 'system.b2b';

  const normalizedEvent = eventKey.toLowerCase();
  if (['marketing.', 'campaigns.', 'flows.', 'mail_marketing.'].some((prefix) => normalizedEvent.startsWith(prefix))) {
    return 'marketing';
  }
  if (['b2b.', 'tax_exempt.', 'pricing.'].some((prefix) => normalizedEvent.startsWith(prefix))) {
    return 'system.b2b';
  }
  return 'system';
}

function marketingTypeForEvent(eventKey: string): MarketingMailType | null {
  const normalized = eventKey.toLowerCase();
  if (normalized.startsWith('campaigns.') || normalized.startsWith('marketing.campaign') || normalized.includes('campaign')) return 'campaigns';
  if (normalized.startsWith('flows.') || normalized.startsWith('marketing.flow') || normalized.includes('flow')) return 'flows';
  if (normalized.includes('drip')) return 'drips';
  if (normalized.includes('transactional')) return 'transactionalMarketing';
  return null;
}

function isSystemTestDelivery(eventKey: string, metadata: unknown) {
  const data = asRecord(metadata);
  return eventKey === 'system.test'
    || textValue(data.source) === 'mail_center_test'
    || (textValue(data.source) === 'email_template_test_send' && data.explicitTest === true);
}

function deliveryTransport(metadata: unknown) {
  const value = asRecord(asRecord(metadata).transport);
  return {
    fromName: safeMailHeader(textValue(value.fromName)),
    replyTo: safeEmailAddress(textValue(value.replyTo)),
  };
}

function safeMailHeader(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function safeEmailAddress(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function toProviderEventDto(row: Awaited<ReturnType<MailRepository['listProviderEventPage']>>['data'][number]): MailProviderEventDto {
  const payload = asRecord(row.payload);
  const headers = asRecord(row.headers);
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    providerMessageId: row.providerMessageId,
    deliveryId: row.deliveryId,
    eventType: row.eventType,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    ignoredReason: row.ignoredReason,
    delivery: row.delivery ? {
      id: row.delivery.id,
      status: row.delivery.status,
      eventKey: row.delivery.eventKey,
      category: row.delivery.category,
      recipientEmail: row.delivery.recipientEmail,
      subject: row.delivery.subject,
      providerMessageId: row.delivery.providerMessageId,
    } : null,
    proof: {
      matchedDelivery: Boolean(row.delivery),
      storedPayloadKeys: Object.keys(payload).sort(),
      storedHeaderKeys: Object.keys(headers).sort(),
    },
  };
}

function isCriticalMailEvent(eventKey: string) {
  return (CRITICAL_MAIL_EVENTS as readonly string[]).includes(eventKey);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function tagValue(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
  return sanitized || 'unknown';
}

function numberFromUnknown(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function renderTemplate(source: string, variables: Record<string, unknown>, options: { escapeHtml?: boolean } = {}) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, variables);
    if (value === undefined || value === null) return '';
    const rendered = String(value);
    return options.escapeHtml ? escapeHtml(rendered) : rendered;
  });
}

function renderEmailHtml(html: string, css: string | null) {
  return css?.trim() ? `<style>${css}</style>${html}` : html;
}

function supportTicketFallback(input: {
  eventKey: SupportTicketEventKey;
  ticketNumber: string;
  ticketSubject: string;
  ticketMessage?: string | null;
  replyMessage?: string | null;
  actionUrl?: string | null;
  adminUrl?: string | null;
}, brand: string) {
  const actionUrl = input.actionUrl ?? input.adminUrl ?? '';
  const message = input.replyMessage ?? input.ticketMessage ?? '';
  const textByEvent: Record<SupportTicketEventKey, { subject: string; lead: string }> = {
    'support.ticket_created.user': {
      subject: `${brand} received your request ${input.ticketNumber}`,
      lead: `We received your request: ${input.ticketSubject}.`,
    },
    'support.ticket_created.internal': {
      subject: `New customer request ${input.ticketNumber}`,
      lead: `A customer request needs review: ${input.ticketSubject}.`,
    },
    'support.reply_added.user': {
      subject: `There is an update on ${input.ticketNumber}`,
      lead: `The support team added an update to ${input.ticketNumber}.`,
    },
    'support.reply_added.internal': {
      subject: `Customer replied on ${input.ticketNumber}`,
      lead: `A customer added a reply to ${input.ticketNumber}.`,
    },
    'support.ticket_closed.user': {
      subject: `${input.ticketNumber} was closed`,
      lead: `Your request ${input.ticketNumber} was closed.`,
    },
  };
  const copy = textByEvent[input.eventKey];
  const html = [
    `<p>${escapeHtml(copy.lead)}</p>`,
    message ? `<p>${escapeHtml(message)}</p>` : '',
    actionUrl ? `<p><a href="${escapeHtml(actionUrl)}">Open request</a></p>` : '',
  ].filter(Boolean).join('');
  return {
    subject: copy.subject,
    html,
    text: [copy.lead, message, actionUrl ? `Open request: ${actionUrl}` : ''].filter(Boolean).join('\n\n'),
  };
}

function taxExemptFallback(input: {
  eventKey: TaxExemptEventKey;
  companyName: string;
  requestId: string;
  reviewNotes?: string | null;
  actionUrl?: string | null;
}, brand: string) {
  const states: Record<TaxExemptEventKey, { subject: string; body: string }> = {
    'tax_exempt.request_received.user': {
      subject: `We received your ${brand} tax exemption request`,
      body: `We received the tax exemption request for ${input.companyName}.`,
    },
    'tax_exempt.request_received.internal': {
      subject: `New tax exemption request: ${input.companyName}`,
      body: `A tax exemption request for ${input.companyName} needs review.`,
    },
    'tax_exempt.request_approved.user': {
      subject: `${brand} tax exemption request approved`,
      body: `The tax exemption request for ${input.companyName} was approved.`,
    },
    'tax_exempt.request_rejected.user': {
      subject: `Update on your ${brand} tax exemption request`,
      body: `The tax exemption request for ${input.companyName} was not approved at this time.`,
    },
  };
  const copy = states[input.eventKey];
  const html = [
    `<p>${escapeHtml(copy.body)}</p>`,
    input.reviewNotes ? `<p>${escapeHtml(input.reviewNotes)}</p>` : '',
    `<p>Reference: ${escapeHtml(input.requestId)}</p>`,
    input.actionUrl ? `<p><a href="${escapeHtml(input.actionUrl)}">Open account</a></p>` : '',
  ].filter(Boolean).join('');
  return {
    subject: copy.subject,
    html,
    text: [copy.body, input.reviewNotes ?? '', `Reference: ${input.requestId}`, input.actionUrl ? `Open account: ${input.actionUrl}` : ''].filter(Boolean).join('\n\n'),
  };
}

function deriveMailIdempotencyKey(
  eventKey: string,
  recipientEmail: string,
  templateHint: string | null,
  variables: Record<string, unknown>,
) {
  const hash = createHash('sha256')
    .update(stableJson({ templateHint, variables }))
    .digest('hex')
    .slice(0, 24);
  return `${eventKey}:${recipientEmail.trim().toLowerCase()}:${hash}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortJson((value as Record<string, unknown>)[key]);
    return acc;
  }, {});
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

function formatCurrency(value: number, currency: string) {
  try {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency || 'USD'} ${value.toFixed(2)}`;
  }
}

const CRITICAL_SYSTEM_MAIL_EVENTS = [
  'identity.password_reset',
  'identity.member_invitation',
  'identity.customer_invitation',
  'b2b_access.approved',
] as const;

const CRITICAL_B2B_MAIL_EVENTS = [
  'b2b.application_received.user',
  'b2b.application_received.internal',
  'b2b.application_approved.user',
  'b2b.application_rejected.user',
  'b2b.invoice_delivered.user',
] as const;

const CRITICAL_MAIL_EVENTS = [
  ...CRITICAL_SYSTEM_MAIL_EVENTS,
  ...CRITICAL_B2B_MAIL_EVENTS,
] as const;

function defaultMailCenterSettings(): MailCenterSettings {
  return mailCenterSettingsSchema.parse({});
}

function sanitizeMailSettings(value: unknown): MailCenterSettings {
  const parsed = mailCenterSettingsSchema.parse(value);
  for (const eventKey of CRITICAL_SYSTEM_MAIL_EVENTS) {
    parsed.categorySystem.subcategories[eventKey] = true;
  }
  for (const eventKey of CRITICAL_B2B_MAIL_EVENTS) {
    parsed.categoryB2b.subcategories[eventKey] = true;
  }
  parsed.categoryMarketing.compliance.unsubscribeFooter = true;
  parsed.categoryMarketing.compliance.physicalAddressFooter = true;
  return parsed;
}

function diffSettings(before: MailCenterSettings, after: MailCenterSettings) {
  const rows: Array<{ category: string; field: string; oldValue: unknown; newValue: unknown }> = [];
  if (before.providerMode !== after.providerMode) {
    rows.push({
      category: 'provider',
      field: 'mode',
      oldValue: before.providerMode,
      newValue: after.providerMode,
    });
  }
  collectDiff(rows, 'system', before.categorySystem, after.categorySystem);
  collectDiff(rows, 'system.b2b', before.categoryB2b, after.categoryB2b);
  collectDiff(rows, 'marketing', before.categoryMarketing, after.categoryMarketing);
  return rows;
}

function collectDiff(
  rows: Array<{ category: string; field: string; oldValue: unknown; newValue: unknown }>,
  category: string,
  before: unknown,
  after: unknown,
  prefix = '',
) {
  const beforeObject = isRecord(before) ? before : {};
  const afterObject = isRecord(after) ? after : {};
  const keys = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]);
  for (const key of keys) {
    const field = prefix ? `${prefix}.${key}` : key;
    const oldValue = beforeObject[key];
    const newValue = afterObject[key];
    if (isRecord(oldValue) && isRecord(newValue)) {
      collectDiff(rows, category, oldValue, newValue, field);
      continue;
    }
    if (JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null)) {
      rows.push({ category, field, oldValue: oldValue ?? null, newValue: newValue ?? null });
    }
  }
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
