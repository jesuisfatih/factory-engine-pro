import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountsService } from './accounts.service.js';

test('returns only the signed-in customer abandoned checkouts', async () => {
  let checkoutWhere: Record<string, unknown> | null = null;
  const prisma = {
    db: {
      tenantConfig: { findFirst: async () => ({ accountPortalExperience: { portalMode: 'order_history' } }) },
      accountAbandonedCheckout: {
        findMany: async (input: { where: Record<string, unknown> }) => {
          checkoutWhere = input.where;
          return [{
            id: 'acout_1',
            shopifyCheckoutId: '123',
            name: '#123',
            currency: 'USD',
            subtotal: 10,
            totalPrice: 10,
            totalDiscounts: 0,
            lineItems: [{ id: 'line-1', title: 'Transfer', quantity: 1, unitPrice: 10, lineTotal: 10 }],
            recoveryUrlEncrypted: 'encrypted',
            providerCreatedAt: new Date('2026-08-21T08:00:00Z'),
            providerUpdatedAt: new Date('2026-08-21T08:05:00Z'),
          }];
        },
      },
    },
  };
  const crypto = { decrypt: () => 'https://shop.example/checkouts/123/recover?key=secret' };
  const service = new AccountsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    crypto as never,
  );
  (service as unknown as { currentActor: () => Promise<unknown> }).currentActor = async () => ({ customerId: 'cust_signed_in' });

  const rows = await service.abandonedCheckouts();

  assert.equal((checkoutWhere as unknown as Record<string, unknown>).customerId, 'cust_signed_in');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.recoveryUrl, 'https://shop.example/checkouts/123/recover?key=secret');
});

test('keeps abandoned checkouts disabled outside order-history portal mode', async () => {
  let queried = false;
  const prisma = {
    db: {
      tenantConfig: { findFirst: async () => ({ accountPortalExperience: { portalMode: 'standard' } }) },
      accountAbandonedCheckout: { findMany: async () => { queried = true; return []; } },
    },
  };
  const service = new AccountsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  (service as unknown as { currentActor: () => Promise<unknown> }).currentActor = async () => ({ customerId: 'cust_1' });

  assert.deepEqual(await service.abandonedCheckouts(), []);
  assert.equal(queried, false);
});
