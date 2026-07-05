import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  parseResendWebhookEvent,
  requiredResendWebhookHeader,
  safeResendWebhookHeaders,
  verifyResendSvixSignature,
} from './resend-webhook.js';

const webhookSecret = `whsec_${Buffer.from('factory-engine-resend-webhook-test-secret').toString('base64')}`;

describe('Resend webhook helper', () => {
  it('verifies a Svix signature against the exact raw body', () => {
    const rawBody = JSON.stringify({
      type: 'email.bounced',
      created_at: '2026-07-05T10:20:30.000Z',
      data: {
        email_id: 'email_123',
        to: ['buyer@example.com'],
        subject: 'Order update',
      },
    });
    const headers = signedHeaders(rawBody);

    assert.doesNotThrow(() => verifyResendSvixSignature(rawBody, headers, webhookSecret));
    assert.throws(
      () => verifyResendSvixSignature(`${rawBody}\n`, headers, webhookSecret),
      /signature is invalid/,
    );
  });

  it('parses provider identity and safe headers without storing the raw signature', () => {
    const rawBody = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-07-05T11:22:33.000Z',
      data: {
        email_id: 'email_456',
        to: 'customer@example.com',
        subject: 'Invoice ready',
      },
    });
    const headers = signedHeaders(rawBody);
    const event = parseResendWebhookEvent(rawBody);

    assert.equal(event.type, 'email.delivered');
    assert.equal(event.providerMessageId, 'email_456');
    assert.equal(event.recipientEmail, 'customer@example.com');
    assert.equal(event.subject, 'Invoice ready');
    assert.equal(event.occurredAt?.toISOString(), '2026-07-05T11:22:33.000Z');
    assert.equal(requiredResendWebhookHeader(headers, 'svix-id'), headers['svix-id']);
    assert.deepEqual(safeResendWebhookHeaders(headers), {
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignaturePresent: true,
      userAgent: null,
    });
  });
});

function signedHeaders(rawBody: string) {
  const svixId = 'msg_test_resend_webhook';
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const secretPart = webhookSecret.slice('whsec_'.length);
  const signature = createHmac('sha256', Buffer.from(secretPart, 'base64'))
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');
  return {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': `v1,${signature}`,
  };
}
