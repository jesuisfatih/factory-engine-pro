import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PricingService } from './pricing.service.js';

function serviceWithDatabase(database: Record<string, unknown>) {
  return new PricingService(
    {} as never,
    {} as never,
    { db: database } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    null,
  );
}

async function validate(service: PricingService, input: Record<string, unknown>) {
  return (service as unknown as {
    validateRuleReferences: (value: Record<string, unknown>) => Promise<void>;
  }).validateRuleReferences(input);
}

test('rejects an email passed as a customer database id with a useful 400 error', async () => {
  const service = serviceWithDatabase({
    customer: { findFirst: async () => null },
  });

  await assert.rejects(
    validate(service, {
      targetType: 'customer',
      targetCustomerId: 'marc@kphatfactory.com',
      scopeType: 'all',
    }),
    (error: unknown) => error instanceof BadRequestException
      && error.message === 'The selected customer is not available in this workspace.',
  );
});

test('accepts a valid customer id and a real catalog collection', async () => {
  const service = serviceWithDatabase({
    customer: { findFirst: async () => ({ id: 'cust_1' }) },
    catalogProduct: {
      findMany: async () => [{ collections: [{ id: 'gid://shopify/Collection/123', title: 'Wholesale' }] }],
    },
  });

  await validate(service, {
    targetType: 'customer',
    targetCustomerId: 'cust_1',
    scopeType: 'collections',
    scopeCollectionIds: ['gid://shopify/Collection/123'],
  });
});

test('rejects a collection label that is not a synced Shopify collection id', async () => {
  const service = serviceWithDatabase({
    catalogProduct: {
      findMany: async () => [{ collections: [{ id: 'gid://shopify/Collection/123', title: 'Wholesale' }] }],
    },
  });

  await assert.rejects(
    validate(service, {
      targetType: 'all',
      scopeType: 'collections',
      scopeCollectionIds: ['Valentines Day Discount'],
    }),
    (error: unknown) => error instanceof BadRequestException
      && error.message === 'One or more selected collections are not available in the current Shopify catalog.',
  );
});
