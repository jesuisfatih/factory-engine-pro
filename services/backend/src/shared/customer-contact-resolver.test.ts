import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CustomerContactResolverService,
  displayPhone,
  extractPhoneValues,
  normalizePhoneE164,
} from './customer-contact-resolver.service.js';

test('normalizes US phone records without fabricating invalid values', () => {
  assert.equal(normalizePhoneE164('(254) 993-2442'), '+12549932442');
  assert.equal(normalizePhoneE164('1 254 993 2442'), '+12549932442');
  assert.equal(displayPhone('+12549932442'), '+1 (254) 993-2442');
  assert.equal(normalizePhoneE164('254993244'), null);
  assert.equal(normalizePhoneE164('not a phone'), null);
});

test('extracts nested Shopify checkout and address phone records only from phone fields', () => {
  const values = extractPhoneValues({
    customer: { email: 'buyer@example.com' },
    abandonedCheckout: {
      billingAddress: { phone: '(254) 993-2442' },
      shipping_address: { phone_number: '1-832-207-5225' },
      note: 'call 555-555-5555',
    },
    contact: { mobile: '+1 713 555 0100' },
  });
  assert.deepEqual(values, ['(254) 993-2442', '1-832-207-5225', '+1 713 555 0100']);
});

test('resolves one canonical phone with stable source precedence for every workspace surface', async () => {
  const service = new CustomerContactResolverService({
    db: {
      customer: {
        findMany: async () => [{
          id: 'cust_1',
          shopifyCustomerId: 'gid://shopify/Customer/1',
          email: 'buyer@example.com',
          phone: null,
          billingAddress: { phone: '(254) 993-2442' },
          shippingAddress: { phone: '+1 713 555 0100' },
          rawData: { abandonedCheckout: { billing_address: { phone: '1-832-207-5225' } } },
          customerUsers: [{ email: 'buyer@example.com', phone: '(832) 555-0199' }],
          subUsers: [{ email: 'buyer.ops@example.com', phone: '(346) 555-0102' }],
          orders: [{
            phone: '(281) 555-0110',
            billingAddress: null,
            shippingAddress: null,
            rawData: null,
          }],
        }],
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_test' }) } as never);

  const contact = (await service.resolveMany([{ id: 'cust_1' }])).get('cust_1');
  assert.ok(contact);
  assert.equal(contact.canonicalIdentityKey, 'shopify:gid://shopify/Customer/1');
  assert.equal(contact.phone, '+18325550199');
  assert.equal(contact.phoneSource, 'customer_user');
  assert.equal(contact.phoneCallable, true);
  assert.deepEqual(contact.alternatePhones.map((entry) => entry.source), [
    'customer_user',
    'sub_user',
    'billing_address',
    'shipping_address',
    'customer_shopify_data',
    'order',
  ]);
});
