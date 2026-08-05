import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopifyAdminContextService } from './shopify-admin-context.service.js';

test('returns latest staff contact and internal note for an abandoned checkout customer', async () => {
  const capturedPhones: unknown[] = [];
  const service = new ShopifyAdminContextService({
    inspectAdmin: async () => ({ tenantId: 'ten_test', shopDomain: 'example.myshopify.com' }),
  } as never, {
    findCustomer: async ({ phone }: { phone?: string }) => phone === '+18325550100' ? customer : null,
    resolveOne: async () => ({ email: customer.email, displayPhone: '+1 (832) 555-0100' }),
    capturePhonePoints: async (_customerId: string, phones: unknown[]) => {
      capturedPhones.push(...phones);
      return [];
    },
  } as never, {
    latestForCustomer: async () => ({
      id: 'cca_1', status: 'completed', label: 'Last contacted 1h ago by Linda', memberId: 'tmbr_linda',
      memberName: 'Linda', phone: '+18325550100', startedAt: '2026-08-04T10:00:00.000Z',
      endedAt: '2026-08-04T10:05:00.000Z', expiresAt: null, active: false,
    }),
  } as never, {
    db: {
      customerInternalNote: { findFirst: async () => note },
      personWorkspaceNote: { findFirst: async () => null },
      serviceRequestComment: { findFirst: async () => taskComment },
      staffWorkComment: { findFirst: async () => null },
      member: { findFirst: async () => taskCommentAuthor },
    },
  } as never);

  const result = await service.abandonedCheckout({} as never, {
    checkoutId: 'gid://shopify/AbandonedCheckout/1',
    phone: '+18325550100',
    alternatePhones: [],
  });

  assert.equal(result.matched, true);
  assert.equal(result.customer?.id, customer.id);
  assert.equal(result.customer?.phone, '+1 (832) 555-0100');
  assert.equal(result.latestNote?.body, 'Refund status checked; call the customer after 4 PM.');
  assert.equal(result.latestNote?.authorName, 'Charlotte B');
  assert.equal(result.contactState?.status, 'completed');
  assert.equal(capturedPhones.length, 1);
  assert.deepEqual(capturedPhones[0], {
    value: '+18325550100',
    source: 'checkout',
    sourceRef: 'gid://shopify/AbandonedCheckout/1',
    priority: 85,
    metadata: {
      surface: 'shopify_admin_abandoned_checkout',
      checkoutId: 'gid://shopify/AbandonedCheckout/1',
    },
  });
});

const customer = {
  id: 'cust_1', companyName: 'Example DTF', firstName: null, lastName: null,
  email: 'buyer@example.com', phone: null,
};
const note = {
  id: 'cnote_1',
  body: 'Customer asked for a callback after 3 PM.',
  createdAt: new Date('2026-08-04T11:00:00.000Z'),
  author: { firstName: 'Linda', lastName: 'M', email: 'linda@example.com' },
};
const taskComment = {
  id: 'srcm_1',
  actorId: 'tmbr_charlotte',
  body: 'Refund status checked; call the customer after 4 PM.',
  createdAt: new Date('2026-08-04T12:00:00.000Z'),
};
const taskCommentAuthor = {
  firstName: 'Charlotte', lastName: 'B', email: 'charlotte@example.com',
};
