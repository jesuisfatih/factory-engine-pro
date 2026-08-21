import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutLineItems, secureRecoveryUrl, ShopifyAbandonedCheckoutService } from './shopify-abandoned-checkout.service.js';

test('stores only a matched customer checkout and encrypts the recovery URL', async () => {
  let stored: Record<string, unknown> | null = null;
  const prisma = {
    db: {
      tenantConfig: { findFirst: async () => ({ accountPortalExperience: { portalMode: 'order_history' } }) },
      shopifySyncState: {
        upsert: async () => ({ isLocked: false, lockExpiresAt: null, lastCompletedAt: null, totalRecordsSynced: 0, consecutiveFailures: 0 }),
        updateMany: async () => ({ count: 1 }),
      },
      customer: {
        findFirst: async () => ({ id: 'cust_1' }),
        findMany: async () => [],
      },
      accountAbandonedCheckout: {
        upsert: async (input: Record<string, unknown>) => { stored = input; },
        updateMany: async () => ({ count: 0 }),
      },
    },
  };
  const shopify = {
    resolveCredentials: async () => ({ shopifyDomain: 'example.myshopify.com', adminToken: 'hidden', apiVersion: '2025-10', source: 'tenant_config' }),
    abandonedCheckouts: async () => ({
      items: [{
        id: 123,
        name: '#123',
        email: 'buyer@example.com',
        customer: { id: 456, email: 'buyer@example.com' },
        presentment_currency: 'USD',
        subtotal_price: '19.00',
        total_price: '20.00',
        total_discounts: '1.00',
        created_at: '2026-08-21T08:00:00Z',
        updated_at: '2026-08-21T08:05:00Z',
        abandoned_checkout_url: 'https://shop.example/checkouts/abc/recover?key=secret',
        line_items: [{ id: 1, title: 'Transfer', quantity: 2, price: '9.50', line_price: '19.00' }],
      }],
      nextCursor: null,
    }),
  };
  const crypto = { encrypt: (value: string) => `encrypted:${value}`, decrypt: () => null };
  const logger = { log: () => undefined, warn: () => undefined };
  const service = new ShopifyAbandonedCheckoutService(prisma as never, shopify as never, crypto as never, logger as never);

  const result = await service.sync({ tenantId: 'ten_eagle' });

  assert.equal(result.stored, 1);
  assert.ok(stored);
  const create = (stored as { create: Record<string, unknown> }).create;
  assert.equal(create.customerId, 'cust_1');
  assert.match(String(create.recoveryUrlEncrypted), /^encrypted:https:\/\//);
  assert.doesNotMatch(JSON.stringify(create.lineItems), /recovery|secret/i);
});

test('rejects unsafe recovery URLs and maps only checkout display fields', () => {
  assert.equal(secureRecoveryUrl('http://shop.example/recover'), null);
  assert.equal(secureRecoveryUrl('https://user:pass@shop.example/recover'), null);
  assert.equal(secureRecoveryUrl('javascript:alert(1)'), null);
  assert.equal(secureRecoveryUrl('https://shop.example/recover?key=abc'), 'https://shop.example/recover?key=abc');

  assert.deepEqual(checkoutLineItems([{ id: 1, title: 'Transfer', quantity: 2, price: '5.00', line_price: '10.00', private: 'drop-me' }]), [{
    id: '1',
    productId: null,
    variantId: null,
    title: 'Transfer',
    variantTitle: null,
    sku: null,
    quantity: 2,
    unitPrice: 5,
    lineTotal: 10,
  }]);
});
