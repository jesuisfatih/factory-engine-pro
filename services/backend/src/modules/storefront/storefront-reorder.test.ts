import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  hashStorefrontReorderToken,
  renderStorefrontCartTransfer,
  shopifyVariantNumericId,
  storefrontLineProperties,
  verifyShopifyAppProxySignature,
} from './storefront-reorder.js';

test('normalizes numeric and GraphQL Shopify variant ids', () => {
  assert.equal(shopifyVariantNumericId('12345'), '12345');
  assert.equal(shopifyVariantNumericId('gid://shopify/ProductVariant/98765'), '98765');
  assert.equal(shopifyVariantNumericId('invalid'), null);
});

test('preserves line properties and adds only missing design links', () => {
  assert.deepEqual(storefrontLineProperties(
    [{ name: 'Upload', value: 'https://cdn.example/a.png' }, { name: 'Size', value: '22x36' }],
    [{ name: 'Upload', url: 'https://cdn.example/a.png' }, { name: 'Back artwork', url: 'https://cdn.example/b.png' }],
  ), {
    Upload: 'https://cdn.example/a.png',
    Size: '22x36',
    'Back artwork': 'https://cdn.example/b.png',
  });
});

test('verifies Shopify app proxy signatures without accepting tampering', () => {
  const secret = 'test-secret';
  const query = { shop: 'example.myshopify.com', timestamp: '123', cart: 'arc_1', token: 'token' };
  const message = Object.keys(query).sort().map((key) => `${key}=${query[key as keyof typeof query]}`).join('');
  const signature = createHmac('sha256', secret).update(message).digest('hex');
  assert.equal(verifyShopifyAppProxySignature({ ...query, signature }, secret), true);
  assert.equal(verifyShopifyAppProxySignature({ ...query, cart: 'arc_2', signature }, secret), false);
});

test('renders a safe storefront cart transfer document', () => {
  const html = renderStorefrontCartTransfer([{ id: '123', quantity: 2, properties: { Artwork: '</script><script>alert(1)</script>' } }]);
  assert.match(html, /fetch\('\/cart\/add\.js'/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.equal(hashStorefrontReorderToken('abc').length, 64);
});
