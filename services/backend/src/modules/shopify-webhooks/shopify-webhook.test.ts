import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { safeShopifyWebhookHeaders, shopifyWebhookDedupeKey, verifyShopifyWebhookHmac } from './shopify-webhook.js';

describe('Shopify webhook helper', () => {
  it('accepts only the exact HMAC signed payload', () => {
    const secret = 'factory-engine-shopify-webhook-test-secret';
    const rawBody = JSON.stringify({ id: 1001, name: '#1001', email: 'buyer@example.com' });
    const signature = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

    assert.equal(verifyShopifyWebhookHmac(rawBody, signature, secret), true);
    assert.equal(verifyShopifyWebhookHmac(`${rawBody}\n`, signature, secret), false);
    assert.equal(verifyShopifyWebhookHmac(rawBody, 'invalid', secret), false);
  });

  it('uses webhook identity first and never persists sensitive headers', () => {
    const rawBody = JSON.stringify({ id: 1001 });
    assert.equal(
      shopifyWebhookDedupeKey('orders/create', rawBody, 'shopify-event-123'),
      'shopify:orders/create:shopify-event-123',
    );
    assert.notEqual(
      shopifyWebhookDedupeKey('orders/create', rawBody),
      shopifyWebhookDedupeKey('orders/updated', rawBody),
    );
    assert.deepEqual(safeShopifyWebhookHeaders({
      'x-shopify-topic': 'orders/create',
      'x-shopify-hmac-sha256': 'signature',
      authorization: 'secret',
      cookie: 'session=secret',
    }), { 'x-shopify-topic': 'orders/create' });
  });
});
