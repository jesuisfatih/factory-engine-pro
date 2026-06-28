import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { timingSafeEqual } from 'node:crypto';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { AIRCALL_INGEST_QUEUE, AI_TRANSCRIPT_RESOLVER_JOB, AI_TRANSCRIPT_RESOLVER_QUEUE } from '../../shared/queue.module.js';
import { PrismaService } from '../../shared/prisma.service.js';

export interface ReceiveAircallWebhookInput {
  tenantSlug: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  signature: string | null;
}

export interface ReceiveAircallWebhookResult {
  accepted: true;
  status: 'queued' | 'rejected' | 'duplicate';
  reason?: string;
}

export interface EnqueueTranscriptResolverOptions {
  forceReprocess?: boolean;
  targetVersion?: number;
  source?: 'ingest' | 'manual_reprocess';
}

export interface EnqueueTranscriptResolverResult {
  queued: boolean;
  jobId: string | null;
  skippedReason: string | null;
}

export const AIRCALL_INGEST_JOB = 'process';

@Injectable()
export class AircallIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
    @Inject(AIRCALL_INGEST_QUEUE) private readonly ingestQueue: Queue | null,
    @Inject(AI_TRANSCRIPT_RESOLVER_QUEUE) private readonly transcriptResolverQueue: Queue | null,
  ) {}

  async receiveWebhook(input: ReceiveAircallWebhookInput): Promise<ReceiveAircallWebhookResult> {
    const tokenClaim = extractTokenClaim(input.payload);
    const eventType = extractEventType(input.payload);
    const externalCallId = extractExternalCallId(input.payload);
    const rawBody = JSON.stringify(input.payload);

    let inboxId: string;
    try {
      const inbox = await this.prisma.aircallWebhookInbox.create({
        data: {
          id: prefixedId('awin'),
          tenantSlug: input.tenantSlug,
          rawBody,
          headers: input.headers as Prisma.InputJsonValue,
          signature: input.signature,
          tokenClaim,
          eventType,
          externalCallId,
          status: 'received',
        },
        select: { id: true },
      });
      inboxId = inbox.id;
    } catch (error) {
      this.logger.error('aircall', 'webhook_inbox_write_failed', 'Aircall webhook inbox write failed', {
        tenant_slug: input.tenantSlug,
        error: messageOf(error),
      });
      return { accepted: true, status: 'rejected', reason: 'inbox_write_failed' };
    }

    const tenant = await this.resolveTenant(input.tenantSlug);
    if (!tenant) {
      await this.markRejected(inboxId, 'tenant_not_found');
      return { accepted: true, status: 'rejected', reason: 'tenant_not_found' };
    }

    if (!tokenClaim) {
      await this.markRejected(inboxId, 'missing_token_claim', tenant.id);
      return { accepted: true, status: 'rejected', reason: 'missing_token_claim' };
    }

    const expectedToken = await this.resolveWebhookSecret(tenant.id);
    if (!expectedToken) {
      await this.markRejected(inboxId, 'webhook_secret_missing', tenant.id);
      return { accepted: true, status: 'rejected', reason: 'webhook_secret_missing' };
    }

    if (!timingSafeEquals(expectedToken, tokenClaim)) {
      await this.markRejected(inboxId, 'token_mismatch', tenant.id);
      return { accepted: true, status: 'rejected', reason: 'token_mismatch' };
    }

    await this.prisma.aircallWebhookInbox.update({
      where: { id: inboxId },
      data: { tenantId: tenant.id, status: 'verified' },
    });
    await this.prisma.aircallWebhookConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        id: prefixedId('awcfg'),
        tenantId: tenant.id,
        url: this.webhookUrl(tenant.slug),
        customName: `factoryengine-${tenant.slug}`,
        active: true,
        lastEventAt: new Date(),
      },
      update: {
        active: true,
        url: this.webhookUrl(tenant.slug),
        lastEventAt: new Date(),
        lastFailureAt: null,
        lastFailureReason: null,
      },
    });

    if (!this.ingestQueue) {
      this.logger.warn('aircall', 'ingest_queue_missing', 'REDIS_URL is not configured; Aircall inbox row remains verified', {
        inbox_id: inboxId,
        tenant_id: tenant.id,
      });
      return { accepted: true, status: 'queued', reason: 'queue_unavailable' };
    }

    try {
      await this.ingestQueue.add(
        AIRCALL_INGEST_JOB,
        { inboxId, tenantId: tenant.id },
        {
          jobId: inboxId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
      return { accepted: true, status: 'queued' };
    } catch (error) {
      this.logger.warn('aircall', 'ingest_enqueue_failed', 'Aircall ingest enqueue failed; verified inbox row retained', {
        inbox_id: inboxId,
        tenant_id: tenant.id,
        error: messageOf(error),
      });
      return { accepted: true, status: 'queued', reason: 'enqueue_failed' };
    }
  }

  async processInboxRow(inboxId: string): Promise<void> {
    const inbox = await this.prisma.aircallWebhookInbox.findUnique({ where: { id: inboxId } });
    if (!inbox || inbox.status === 'processed') return;
    if (!inbox.tenantId) {
      await this.markRejected(inboxId, 'tenant_not_resolved');
      return;
    }

    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(inbox.rawBody) as Record<string, unknown>;
    } catch (error) {
      await this.markRejected(inboxId, `body_parse_failed: ${messageOf(error).slice(0, 160)}`, inbox.tenantId);
      return;
    }

    const eventType = extractEventType(envelope) ?? inbox.eventType ?? 'unknown';
    const externalCallId = extractExternalCallId(envelope);
    const eventTimestamp = extractEventTimestamp(envelope);

    if (!externalCallId) {
      await this.markProcessed(inboxId);
      return;
    }

    const data = payloadData(envelope);
    const transcriptRaw = extractTranscript(data);
    try {
      const callEvent = await this.prisma.db.aircallCallEvent.upsert({
        where: {
          tenantId_externalCallId_eventType_eventTimestamp: {
            tenantId: inbox.tenantId,
            externalCallId,
            eventType,
            eventTimestamp,
          },
        },
        create: {
          id: prefixedId('acev'),
          tenantId: inbox.tenantId,
          externalCallId,
          eventType,
          eventTimestamp,
          direction: stringOrNull(data.direction),
          status: stringOrNull(data.status),
          durationSeconds: numberOrNull(data.duration),
          numberId: nestedString(data, 'number.id') ?? stringOrNull(data.number_id),
          aircallUserId: nestedString(data, 'user.id') ?? stringOrNull(data.user_id),
          contactPhone: contactPhone(data),
          contactPhoneE164: e164OrNull(contactPhone(data)),
          contactEmail: nestedString(data, 'customer.email') ?? nestedString(data, 'contact.email'),
          recordingUrl: stringOrNull(data.recording) ?? stringOrNull(data.recording_short_url),
          voicemailUrl: stringOrNull(data.voicemail),
          transcriptRaw,
          transcriptSource: transcriptRaw ? stringOrNull(data.transcript_source) ?? 'aircall_payload' : null,
          transcriptPulledAt: transcriptRaw ? new Date() : null,
          rawPayload: envelope as Prisma.InputJsonValue,
        },
        update: {
          status: stringOrNull(data.status),
          durationSeconds: numberOrNull(data.duration),
          recordingUrl: stringOrNull(data.recording) ?? stringOrNull(data.recording_short_url),
          voicemailUrl: stringOrNull(data.voicemail),
          transcriptRaw,
          transcriptSource: transcriptRaw ? stringOrNull(data.transcript_source) ?? 'aircall_payload' : undefined,
          transcriptPulledAt: transcriptRaw ? new Date() : undefined,
        },
      });

      const call = await this.mirrorCall(inbox.tenantId, externalCallId, eventType, data);
      await this.enqueueTranscriptResolver(callEvent.id, transcriptRaw);
      await this.prisma.db.callEvent.createMany({
        data: [
          {
            id: prefixedId('cevt'),
            tenantId: inbox.tenantId,
            callId: call.id,
            aircallCallId: externalCallId,
            sourceEventId: callEvent.id,
            eventType,
            actorType: 'system',
            metadata: {
              source: 'aircall_webhook',
              inboxId,
              aircallEventId: callEvent.id,
            } as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });

      await this.prisma.db.aircallCallEvent.updateMany({
        where: { id: callEvent.id },
        data: { processedAt: new Date(), processingError: null },
      });
      await this.markProcessed(inboxId);
    } catch (error) {
      const message = messageOf(error).slice(0, 300);
      await this.prisma.aircallWebhookInbox.update({
        where: { id: inboxId },
        data: { status: 'rejected', rejectionReason: `dispatch_error: ${message}` },
      });
      this.logger.error('aircall', 'ingest_dispatch_failed', 'Aircall ingest dispatch failed', {
        inbox_id: inboxId,
        tenant_id: inbox.tenantId,
        external_call_id: externalCallId,
        event_type: eventType,
        error: message,
      });
      throw error;
    }
  }

  private async mirrorCall(tenantId: string, externalCallId: string, eventType: string, data: Record<string, unknown>) {
    const endedAt = dateFromUnknown(data.ended_at ?? data.endedAt);
    const status = eventType === 'call.ended' || eventType === 'call.hungup'
      ? 'closed'
      : stringOrNull(data.status) ?? 'open';
    const aircallUserId = nestedString(data, 'user.id') ?? stringOrNull(data.user_id);
    const currentOperatorId = await this.resolveMappedMemberId(tenantId, aircallUserId);

    return this.prisma.db.call.upsert({
      where: {
        tenantId_aircallCallId: {
          tenantId,
          aircallCallId: externalCallId,
        },
      },
      create: {
        id: prefixedId('call'),
        tenantId,
        aircallCallId: externalCallId,
        direction: stringOrNull(data.direction),
        status,
        currentOperatorId,
        callerNumber: contactPhone(data),
        callerNumberE164: e164OrNull(contactPhone(data)),
        callerEmail: nestedString(data, 'customer.email') ?? nestedString(data, 'contact.email'),
        startedAt: dateFromUnknown(data.started_at ?? data.created_at ?? data.startedAt),
        answeredAt: dateFromUnknown(data.answered_at ?? data.answeredAt),
        endedAt,
        durationSeconds: numberOrNull(data.duration),
        transcriptRaw: extractTranscript(data),
        rawPayload: data as Prisma.InputJsonValue,
      },
      update: {
        direction: stringOrNull(data.direction),
        status,
        currentOperatorId,
        callerNumber: contactPhone(data),
        callerNumberE164: e164OrNull(contactPhone(data)),
        callerEmail: nestedString(data, 'customer.email') ?? nestedString(data, 'contact.email'),
        startedAt: dateFromUnknown(data.started_at ?? data.created_at ?? data.startedAt),
        answeredAt: dateFromUnknown(data.answered_at ?? data.answeredAt),
        endedAt,
        durationSeconds: numberOrNull(data.duration),
        transcriptRaw: extractTranscript(data),
        rawPayload: data as Prisma.InputJsonValue,
      },
    });
  }

  private async resolveMappedMemberId(tenantId: string, aircallUserId: string | null) {
    if (!aircallUserId) return null;
    const mapping = await this.prisma.db.aircallMemberMap.findFirst({
      where: { aircallUserId },
      select: { memberId: true },
    });
    if (mapping) return mapping.memberId;

    const legacyMember = await this.prisma.db.member.findFirst({
      where: { aircallUserId, status: { not: 'archived' } },
      select: { id: true },
    });
    if (!legacyMember) return null;

    await this.prisma.aircallMemberMap.create({
      data: {
        id: prefixedId('acmap'),
        tenantId,
        aircallUserId,
        memberId: legacyMember.id,
        source: 'member_legacy',
      },
    }).catch(() => undefined);
    return legacyMember.id;
  }

  async enqueueTranscriptResolver(
    callEventId: string,
    transcriptRaw?: string | null,
    options: EnqueueTranscriptResolverOptions = {},
  ): Promise<EnqueueTranscriptResolverResult> {
    const callEvent = await this.prisma.db.aircallCallEvent.findFirst({
      where: { id: callEventId },
      select: {
        id: true,
        tenantId: true,
        externalCallId: true,
        transcriptRaw: true,
        resolverQueuedAt: true,
        resolverQueueJobId: true,
        resolverStatus: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
    });
    if (!callEvent) return { queued: false, jobId: null, skippedReason: 'call_event_not_found' };

    const transcript = (transcriptRaw ?? callEvent.transcriptRaw)?.trim();
    if (!transcript) return { queued: false, jobId: null, skippedReason: 'transcript_empty' };

    const targetVersion = normalizeTargetVersion(options.targetVersion);
    if (!options.forceReprocess && (callEvent.resolverStatus === 'succeeded' || callEvent.resolvedAt)) {
      const versionLabel = callEvent.resolvedWithVersion ? `v${callEvent.resolvedWithVersion}` : 'legacy';
      return { queued: false, jobId: callEvent.resolverQueueJobId, skippedReason: `already_resolved_${versionLabel}` };
    }

    const jobId = ['aircall-transcript', callEvent.tenantId, callEvent.externalCallId, callEvent.id]
      .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, '_'))
      .join('-');
    if (!this.transcriptResolverQueue) {
      this.logger.warn('aircall', 'resolver_queue_missing', 'REDIS_URL is not configured; transcript resolver job was not queued', {
        call_event_id: callEvent.id,
        tenant_id: callEvent.tenantId,
        external_call_id: callEvent.externalCallId,
      });
      return { queued: false, jobId, skippedReason: 'resolver_queue_missing' };
    }

    const existingJob = await this.transcriptResolverQueue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      const returnValue = existingJob.returnvalue as { status?: unknown } | null;
      const completedWithoutSuccess = state === 'completed' && returnValue?.status !== 'succeeded';
      if (options.forceReprocess && state !== 'active') {
        await existingJob.remove();
      } else if (state === 'failed' || completedWithoutSuccess) {
        await existingJob.remove();
      } else if (state !== 'unknown') {
        await this.prisma.db.aircallCallEvent.updateMany({
          where: { id: callEvent.id },
          data: {
            resolverQueuedAt: callEvent.resolverQueuedAt ?? new Date(),
            resolverQueueJobId: jobId,
            resolverStatus: 'queued',
            resolverError: null,
          },
        });
        return { queued: false, jobId, skippedReason: `existing_job_${state}` };
      }
    }

    await this.transcriptResolverQueue.add(
      AI_TRANSCRIPT_RESOLVER_JOB,
      {
        tenantId: callEvent.tenantId,
        callEventId: callEvent.id,
        externalCallId: callEvent.externalCallId,
        forceReprocess: Boolean(options.forceReprocess),
        targetVersion,
      },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    await this.prisma.db.aircallCallEvent.updateMany({
      where: { id: callEvent.id },
      data: { resolverQueuedAt: new Date(), resolverQueueJobId: jobId, resolverStatus: 'queued', resolverError: null },
    });
    this.logger.log('aircall', 'resolver_job_queued', 'Transcript resolver job queued', {
      call_event_id: callEvent.id,
      tenant_id: callEvent.tenantId,
      external_call_id: callEvent.externalCallId,
      target_version: targetVersion,
      force_reprocess: Boolean(options.forceReprocess),
      source: options.source ?? 'ingest',
    });
    return { queued: true, jobId, skippedReason: null };
  }

  private async resolveTenant(tenantSlug: string) {
    const slug = tenantSlug.trim().toLowerCase();
    const normalized = slug.replace(/[^a-z0-9-]/g, '');
    return this.prisma.tenant.findFirst({
      where: {
        OR: [
          { slug },
          { slug: normalized },
          { slug: normalized.replace(/-/g, '') },
        ],
        status: 'active',
      },
      select: { id: true, slug: true },
    });
  }

  private async resolveWebhookSecret(tenantId: string) {
    const config = await this.prisma.tenantConfig.findFirst({
      where: { tenantId },
      select: { aircallWebhookSecretEncrypted: true },
    });
    const tenantSecret = this.crypto.decrypt(config?.aircallWebhookSecretEncrypted)?.trim();
    return tenantSecret
      || this.config.get<string>('AIRCALL_WEBHOOK_SECRET')?.trim()
      || this.config.get<string>('AIRCALL_WEBHOOK_TOKEN')?.trim()
      || null;
  }

  private webhookUrl(tenantSlug: string) {
    const baseUrl = this.config.get<string>('AIRCALL_PUBLIC_BASE_URL')
      ?? this.config.get<string>('API_PUBLIC_BASE_URL')
      ?? this.config.get<string>('PUBLIC_API_URL')
      ?? this.config.get<string>('API_URL')
      ?? '';
    if (!baseUrl) return null;
    return `${baseUrl.replace(/\/$/, '')}/api/v1/webhooks/aircall/${tenantSlug}`;
  }

  private async markRejected(inboxId: string, reason: string, tenantId?: string) {
    await this.prisma.aircallWebhookInbox.update({
      where: { id: inboxId },
      data: { status: 'rejected', rejectionReason: reason, ...(tenantId ? { tenantId } : {}) },
    });
    if (tenantId) {
      await this.prisma.aircallWebhookConfig.updateMany({
        where: { tenantId },
        data: {
          lastFailureAt: new Date(),
          lastFailureReason: reason,
          failureCount: { increment: 1 },
        },
      });
    }
  }

  private async markProcessed(inboxId: string) {
    await this.prisma.aircallWebhookInbox.update({
      where: { id: inboxId },
      data: { status: 'processed', processedAt: new Date() },
    });
  }
}

function extractTokenClaim(payload: Record<string, unknown>) {
  return typeof payload.token === 'string' && payload.token.trim() ? payload.token.trim() : null;
}

function extractEventType(payload: Record<string, unknown>) {
  return typeof payload.event === 'string' && payload.event.trim() ? payload.event.trim() : null;
}

function extractExternalCallId(payload: Record<string, unknown>) {
  const data = payloadData(payload);
  const candidates = [
    data.call_id,
    nestedString(data, 'call.id'),
    data.id,
    payload.id,
  ];
  for (const candidate of candidates) {
    const value = stringOrNull(candidate);
    if (value) return value;
  }
  return null;
}

function extractEventTimestamp(payload: Record<string, unknown>) {
  return dateFromUnknown(payload.timestamp) ?? new Date();
}

function payloadData(payload: Record<string, unknown>) {
  const data = payload.data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : payload;
}

function stringOrNull(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nestedString(record: Record<string, unknown>, path: string) {
  let current: unknown = record;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return stringOrNull(current);
}

function contactPhone(data: Record<string, unknown>) {
  return stringOrNull(data.raw_digits)
    ?? nestedString(data, 'customer.phone')
    ?? nestedString(data, 'contact.phone');
}

function e164OrNull(phone: string | null) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : null;
}

function extractTranscript(data: Record<string, unknown>) {
  const raw = data.transcript ?? data.transcription ?? data.content;
  if (typeof raw === 'string') return raw.trim() || null;
  if (raw && typeof raw === 'object') {
    const utterances = getAircallUtterances(raw as Record<string, unknown>);
    const formatted = formatAircallTranscript(utterances);
    if (formatted) return formatted;
    return JSON.stringify(raw);
  }
  return null;
}

function getAircallUtterances(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const transcription = payload.transcription;
  const contentSource = transcription && typeof transcription === 'object'
    ? (transcription as Record<string, unknown>).content
    : payload.content;
  const content = contentSource && typeof contentSource === 'object'
    ? contentSource as Record<string, unknown>
    : payload;
  return Array.isArray(content.utterances) ? content.utterances as Array<Record<string, unknown>> : [];
}

function formatAircallTranscript(utterances: Array<Record<string, unknown>>) {
  return utterances
    .map((utterance) => {
      const speaker = utterance.participant_type === 'external' ? 'Customer' : 'Agent';
      const text = stringOrNull(utterance.text);
      return text ? `${speaker}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function dateFromUnknown(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(value > 100000000000 ? value : value * 1000);
  }
  const text = String(value);
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text.trim() !== '') return dateFromUnknown(numeric);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function timingSafeEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeTargetVersion(value: unknown) {
  const parsed = Number(value ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
}
