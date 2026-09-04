import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ResendWebhookEvent } from './resend-webhook.js';

export const POSTMARK_API_BASE = 'https://api.postmarkapp.com';

// Postmark RecordType -> the provider event vocabulary the mail pipeline already understands.
const RECORD_TYPE_MAP: Record<string, string> = {
  Delivery: 'email.delivered',
  Bounce: 'email.bounced',
  SpamComplaint: 'email.complained',
  Open: 'email.opened',
  Click: 'email.clicked',
  SubscriptionChange: 'email.suppressed',
};

export interface PostmarkSendInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  metadata: Record<string, string>;
  tag?: string;
}

export function buildPostmarkSendBody(input: PostmarkSendInput) {
  return {
    From: input.from,
    To: input.to,
    Subject: input.subject,
    HtmlBody: input.html,
    ...(input.text ? { TextBody: input.text } : {}),
    ...(input.replyTo ? { ReplyTo: input.replyTo } : {}),
    ...(input.tag ? { Tag: input.tag.slice(0, 1000) } : {}),
    MessageStream: 'outbound',
    Metadata: input.metadata,
  };
}

// Postmark webhooks carry no signature. Authentication is a shared secret that the
// webhook URL sends as HTTP Basic auth (configured on the Postmark webhook as
// username "factory-engine" and the tenant secret as password).
export function verifyPostmarkBasicAuth(headers: Record<string, string>, webhookSecret: string) {
  const header = headers.authorization?.trim() ?? '';
  if (!header.toLowerCase().startsWith('basic ')) {
    throw new UnauthorizedException('Postmark webhook basic auth is missing.');
  }
  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  const password = separator >= 0 ? decoded.slice(separator + 1) : '';
  const expected = createHash('sha256').update(webhookSecret).digest();
  const received = createHash('sha256').update(password).digest();
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new UnauthorizedException('Postmark webhook credentials are invalid.');
  }
}

export function parsePostmarkWebhookEvent(rawBody: string): ResendWebhookEvent & { providerEventId: string } {
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    root = parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Postmark webhook payload is not valid JSON.');
  }
  const recordType = textValue(root.RecordType);
  if (!recordType) throw new BadRequestException('Postmark webhook RecordType is missing.');
  const type = RECORD_TYPE_MAP[recordType] ?? `postmark.${recordType.toLowerCase()}`;
  const providerMessageId = textValue(root.MessageID) || null;
  const recipientEmail = textValue(root.Recipient) || textValue(root.Email) || null;
  const occurredAt = dateValue(root.DeliveredAt) ?? dateValue(root.BouncedAt) ?? dateValue(root.ReceivedAt) ?? dateValue(root.ChangedAt) ?? null;
  // Postmark has no per-event id on most webhooks; Bounce/SpamComplaint carry ID.
  const nativeId = root.ID !== undefined && root.ID !== null ? String(root.ID) : null;
  const providerEventId = nativeId
    ? `${recordType}:${nativeId}`
    : `${recordType}:${providerMessageId ?? 'unknown'}:${occurredAt ? occurredAt.toISOString() : createHash('sha256').update(rawBody).digest('hex').slice(0, 16)}`;
  return {
    type,
    data: root,
    payload: root,
    providerMessageId,
    recipientEmail,
    subject: textValue(root.Subject) || null,
    occurredAt,
    providerEventId,
  };
}

export function postmarkFailureMessage(payload: Record<string, unknown>) {
  const description = textValue(payload.Description);
  const details = textValue(payload.Details);
  const name = textValue(payload.Name) || textValue(payload.Type);
  return [name, description, details].filter(Boolean).join(' — ') || 'Postmark reported a delivery failure.';
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function dateValue(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
