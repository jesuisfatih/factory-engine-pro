import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ResendWebhookEvent {
  type: string;
  data: Record<string, unknown>;
  payload: Record<string, unknown>;
  providerMessageId: string | null;
  recipientEmail: string | null;
  subject: string | null;
  occurredAt: Date | null;
}

export function parseResendWebhookEvent(rawBody: string): ResendWebhookEvent {
  const root = parseJsonRecord(rawBody);
  const type = textValue(root.type);
  if (!type) throw new BadRequestException('Resend webhook event type is missing.');
  const data = asRecord(root.data);
  const providerMessageId = textValue(data.email_id) || textValue(data.emailId) || null;
  const recipientEmail = firstEmail(data.to) || textValue(data.email) || null;
  const subject = textValue(data.subject) || null;
  const occurredAt = dateValue(root.created_at) ?? dateValue(data.created_at);
  return { type, data, payload: root, providerMessageId, recipientEmail, subject, occurredAt };
}

export function verifyResendSvixSignature(rawBody: string, headers: Record<string, string>, webhookSecret: string) {
  const svixId = requiredResendWebhookHeader(headers, 'svix-id');
  const svixTimestamp = requiredResendWebhookHeader(headers, 'svix-timestamp');
  const svixSignature = requiredResendWebhookHeader(headers, 'svix-signature');
  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) throw new BadRequestException('Resend webhook timestamp is invalid.');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 5 * 60) {
    throw new BadRequestException('Resend webhook timestamp is outside the accepted replay window.');
  }
  const secretPart = webhookSecret.startsWith('whsec_') ? webhookSecret.slice('whsec_'.length) : '';
  if (!secretPart) throw new BadRequestException('Resend webhook signing secret must start with whsec_.');
  const expected = createHmac('sha256', Buffer.from(secretPart, 'base64'))
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');
  const signatures = svixSignature
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith('v1,') ? entry.slice(3) : entry);
  const expectedBuffer = Buffer.from(expected);
  const matched = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature);
    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  });
  if (!matched) throw new BadRequestException('Resend webhook signature is invalid.');
}

export function requiredResendWebhookHeader(headers: Record<string, string>, name: string) {
  const value = headers[name.toLowerCase()]?.trim();
  if (!value) throw new BadRequestException(`Resend webhook ${name} header is missing.`);
  return value;
}

export function safeResendWebhookHeaders(headers: Record<string, string>) {
  return {
    svixId: headers['svix-id'] ?? null,
    svixTimestamp: headers['svix-timestamp'] ?? null,
    svixSignaturePresent: Boolean(headers['svix-signature']),
    userAgent: headers['user-agent'] ?? null,
  };
}

function parseJsonRecord(rawBody: string) {
  try {
    return asRecord(JSON.parse(rawBody) as unknown);
  } catch {
    throw new BadRequestException('Resend webhook payload is not valid JSON.');
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstEmail(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = textValue(item);
      if (email) return email;
    }
    return null;
  }
  const email = textValue(value);
  return email || null;
}

function dateValue(value: unknown) {
  const raw = textValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
