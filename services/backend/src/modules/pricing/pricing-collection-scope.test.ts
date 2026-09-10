import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogCollectionIdentifiers, identifiersOverlap } from './pricing-calculator.service.js';

test('collection pricing matches only products in the selected collection', () => {
  const productCollections = catalogCollectionIdentifiers([
    { id: 'gid://shopify/Collection/123', title: 'Wholesale' },
    { id: '456', title: 'Transfers' },
  ]);

  assert.equal(identifiersOverlap(['gid://shopify/Collection/123'], productCollections), true);
  assert.equal(identifiersOverlap(['123'], productCollections), true);
  assert.equal(identifiersOverlap(['999'], productCollections), false);
});

test('collection pricing never matches when catalog membership is missing', () => {
  assert.deepEqual(catalogCollectionIdentifiers(null), []);
  assert.equal(identifiersOverlap(['123'], []), false);
  assert.equal(identifiersOverlap([], ['123']), false);
});
