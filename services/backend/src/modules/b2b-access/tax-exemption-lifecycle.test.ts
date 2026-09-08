import assert from 'node:assert/strict';
import test from 'node:test';
import { approveB2BAccessSchema } from '@factory-engine-pro/contracts';
import { TaxExemptionLifecycleService, shopifyResellerExemptionsForStates } from './tax-exemption-lifecycle.service.js';

test('maps approved states to Shopify reseller exemption enums', () => {
  assert.deepEqual(
    shopifyResellerExemptionsForStates(['il', 'CA', 'IL']),
    ['US_CA_RESELLER_EXEMPTION', 'US_IL_RESELLER_EXEMPTION'],
  );
});

test('requires a state for a state reseller approval', () => {
  assert.equal(approveB2BAccessSchema.safeParse({
    taxExemptionMode: 'state_reseller',
    taxExemptionJurisdictions: [],
  }).success, false);

  assert.deepEqual(approveB2BAccessSchema.parse({
    reviewNotes: 'Illinois certificate verified.',
    taxExemptionMode: 'state_reseller',
    taxExemptionJurisdictions: ['IL'],
  }), {
    reviewNotes: 'Illinois certificate verified.',
    taxExemptionMode: 'state_reseller',
    taxExemptionJurisdictions: ['IL'],
  });
});

test('general exemption does not accept reseller jurisdictions', () => {
  assert.equal(approveB2BAccessSchema.safeParse({
    taxExemptionMode: 'general',
    taxExemptionJurisdictions: ['IL'],
  }).success, false);
});

test('uses Shopify customerAddTaxExemptions for an Illinois reseller certificate', async () => {
  const calls: Array<{ query: string; variables: unknown }> = [];
  const shopify = {
    resolveCredentials: async () => ({ shop: 'test.myshopify.com', accessToken: 'token' }),
    graphql: async (_credentials: unknown, query: string, variables: unknown) => {
      calls.push({ query, variables });
      return { customerAddTaxExemptions: { userErrors: [] } };
    },
  };
  const service = new TaxExemptionLifecycleService(
    {} as never,
    {} as never,
    {} as never,
    shopify as never,
    {} as never,
  );

  const error = await (service as unknown as {
    syncShopifyTaxExemption: (customerId: string, input: unknown) => Promise<string | null>;
  }).syncShopifyTaxExemption('12345', {
    enabled: true,
    mode: 'state_reseller',
    shopifyExemptions: ['US_IL_RESELLER_EXEMPTION'],
  });

  assert.equal(error, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.query, /customerAddTaxExemptions/);
  assert.deepEqual(calls[0]!.variables, {
    customerId: 'gid://shopify/Customer/12345',
    taxExemptions: ['US_IL_RESELLER_EXEMPTION'],
  });
});

test('keeps the existing global customerUpdate path for general exemptions', async () => {
  const calls: Array<{ query: string; variables: unknown }> = [];
  const shopify = {
    resolveCredentials: async () => ({ shop: 'test.myshopify.com', accessToken: 'token' }),
    graphql: async (_credentials: unknown, query: string, variables: unknown) => {
      calls.push({ query, variables });
      return { customerUpdate: { userErrors: [] } };
    },
  };
  const service = new TaxExemptionLifecycleService(
    {} as never,
    {} as never,
    {} as never,
    shopify as never,
    {} as never,
  );

  const error = await (service as unknown as {
    syncShopifyTaxExemption: (customerId: string, input: unknown) => Promise<string | null>;
  }).syncShopifyTaxExemption('gid://shopify/Customer/42', {
    enabled: true,
    mode: 'general',
    shopifyExemptions: [],
  });

  assert.equal(error, null);
  assert.match(calls[0]!.query, /customerUpdate/);
  assert.deepEqual(calls[0]!.variables, {
    input: { id: 'gid://shopify/Customer/42', taxExempt: true },
  });
});
