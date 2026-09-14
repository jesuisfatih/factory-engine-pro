import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountSupportTicketSchema } from '@factory-engine-pro/contracts';
import { AccountsService } from './accounts.service.js';

test('order-related support requests require a number', () => {
  const base = { subject: 'Damaged transfer', description: 'The transfer arrived damaged.', category: 'product', priority: 'normal' };
  assert.equal(createAccountSupportTicketSchema.safeParse({ ...base, orderRelated: true }).success, false);
  assert.equal(createAccountSupportTicketSchema.safeParse({ ...base, orderRelated: true, orderNumber: '#12345' }).success, true);
  assert.equal(createAccountSupportTicketSchema.safeParse(base).success, true);
});

test('Eagle links an order only within the signed-in customer account', async () => {
  const orderQueries: Record<string, unknown>[] = [];
  const savedTickets: Record<string, unknown>[] = [];
  const prisma = {
    db: {
      commerceOrder: {
        findFirst: async (input: { where: Record<string, unknown> }) => {
          orderQueries.push(input.where);
          return { id: 'order_own', shopifyOrderNumber: '#12345' };
        },
      },
      serviceRequest: {
        create: async (input: { data: { metadata: Record<string, unknown> } }) => {
          savedTickets.push(input.data.metadata);
          return { id: 'sr_test' };
        },
      },
      serviceRequestComment: { create: async () => ({ id: 'comment_test' }) },
    },
  };
  const service = new AccountsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const internals = service as unknown as {
    currentActor: () => Promise<unknown>;
    tenantId: () => string;
    notifyCustomerTicketCreated: () => Promise<void>;
    supportTickets: () => Promise<Array<{ id: string }>>;
  };
  internals.currentActor = async () => ({ customerId: 'customer_own', principalId: 'user_own', principalType: 'customer_user' });
  internals.tenantId = () => 'ten_eagledtfprint';
  internals.notifyCustomerTicketCreated = async () => {};
  internals.supportTickets = async () => [{ id: 'sr_test' }];
  (service as unknown as { logger: { log: () => void } }).logger = { log: () => {} };

  await service.createSupportTicket({
    subject: 'Damaged transfer', description: 'The transfer arrived damaged.', category: 'product', priority: 'normal',
    orderRelated: true, orderNumber: '12345',
  });

  assert.equal(orderQueries[0]?.tenantId, 'ten_eagledtfprint');
  assert.equal(orderQueries[0]?.customerId, 'customer_own');
  assert.equal(savedTickets[0]?.orderId, 'order_own');
  assert.equal(savedTickets[0]?.orderNumber, '#12345');
});

test('an unmatched manual order number remains visible without an order link', async () => {
  const savedTickets: Record<string, unknown>[] = [];
  const prisma = {
    db: {
      commerceOrder: { findFirst: async () => null },
      serviceRequest: { create: async (input: { data: { metadata: Record<string, unknown> } }) => {
        savedTickets.push(input.data.metadata);
        return { id: 'sr_test' };
      } },
      serviceRequestComment: { create: async () => ({ id: 'comment_test' }) },
    },
  };
  const service = new AccountsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const internals = service as unknown as {
    currentActor: () => Promise<unknown>;
    tenantId: () => string;
    notifyCustomerTicketCreated: () => Promise<void>;
    supportTickets: () => Promise<Array<{ id: string }>>;
  };
  internals.currentActor = async () => ({ customerId: 'customer_own', principalId: 'user_own', principalType: 'customer_user' });
  internals.tenantId = () => 'ten_eagledtfprint';
  internals.notifyCustomerTicketCreated = async () => {};
  internals.supportTickets = async () => [{ id: 'sr_test' }];
  (service as unknown as { logger: { log: () => void } }).logger = { log: () => {} };

  await service.createSupportTicket({
    subject: 'Older order', description: 'I need help with this order.', category: 'shipping', priority: 'normal',
    orderRelated: true, orderNumber: '#OLD-42',
  });
  assert.equal(savedTickets[0]?.orderNumber, '#OLD-42');
  assert.equal(savedTickets[0]?.orderId, undefined);
});
