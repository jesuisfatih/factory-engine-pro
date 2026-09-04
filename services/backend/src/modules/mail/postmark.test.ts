import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPostmarkSendBody, parsePostmarkWebhookEvent, verifyPostmarkBasicAuth } from './postmark.js';

describe('Postmark send body', () => {
  it('maps fields to the Postmark API shape', () => {
    const body = buildPostmarkSendBody({
      from: 'Eagle DTF Print <noreply@eagledtfprint.com>',
      to: 'user@example.com',
      subject: 'B2B access approved',
      html: '<p>hi</p>',
      text: 'hi',
      replyTo: 'support@eagledtfprint.com',
      tag: 'b2b.application_approved.user',
      metadata: { delivery_id: 'mail_1', tenant_id: 'ten_x', category: 'system.b2b', event_key: 'b2b.application_approved.user' },
    });
    assert.equal(body.From, 'Eagle DTF Print <noreply@eagledtfprint.com>');
    assert.equal(body.To, 'user@example.com');
    assert.equal(body.MessageStream, 'outbound');
    assert.equal(body.Metadata.delivery_id, 'mail_1');
    assert.equal(body.Tag, 'b2b.application_approved.user');
  });
});

describe('Postmark webhook parsing', () => {
  it('normalizes Delivery events to the shared vocabulary', () => {
    const event = parsePostmarkWebhookEvent(JSON.stringify({
      RecordType: 'Delivery',
      MessageID: 'pm-123',
      Recipient: 'user@example.com',
      DeliveredAt: '2026-09-02T12:00:00Z',
      Metadata: { delivery_id: 'mail_1' },
    }));
    assert.equal(event.type, 'email.delivered');
    assert.equal(event.providerMessageId, 'pm-123');
    assert.equal(event.recipientEmail, 'user@example.com');
    assert.ok(event.providerEventId.startsWith('Delivery:pm-123'));
  });

  it('normalizes Bounce events with their native id', () => {
    const event = parsePostmarkWebhookEvent(JSON.stringify({
      RecordType: 'Bounce', ID: 42, MessageID: 'pm-9', Email: 'user@example.com', BouncedAt: '2026-09-02T12:00:00Z',
    }));
    assert.equal(event.type, 'email.bounced');
    assert.equal(event.providerEventId, 'Bounce:42');
    assert.equal(event.recipientEmail, 'user@example.com');
  });

  it('rejects payloads without RecordType', () => {
    assert.throws(() => parsePostmarkWebhookEvent(JSON.stringify({ MessageID: 'x' })));
  });
});

describe('Postmark webhook basic auth', () => {
  const header = (user: string, pass: string) => ({ authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` });
  it('accepts the correct shared secret', () => {
    assert.doesNotThrow(() => verifyPostmarkBasicAuth(header('factory-engine', 's3cret'), 's3cret'));
  });
  it('rejects a wrong secret and missing auth', () => {
    assert.throws(() => verifyPostmarkBasicAuth(header('factory-engine', 'nope'), 's3cret'));
    assert.throws(() => verifyPostmarkBasicAuth({}, 's3cret'));
  });
});
