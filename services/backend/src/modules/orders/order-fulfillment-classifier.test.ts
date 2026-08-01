import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFulfillment } from './order-fulfillment-classifier.js';

test('classifies a local pickup shipping title as pickup', () => {
  const result = classifyFulfillment({
    shippingLines: [{ title: 'Local Pickup - Chicago' }],
  });

  assert.equal(result.mode, 'pickup');
  assert.deepEqual(result.evidence.shippingLineTitles, ['local pickup chicago']);
});

test('classifies Shopify shipping-line codes with punctuation as pickup', () => {
  const result = classifyFulfillment({
    shippingLines: [{ code: 'LOCAL_PICKUP', title: 'Free' }],
  });

  assert.equal(result.mode, 'pickup');
});

test('classifies line-item delivery properties as pickup', () => {
  const result = classifyFulfillment({
    lineItems: [{ properties: [{ name: '_delivery_method', value: 'Store Pickup' }] }],
  });

  assert.equal(result.mode, 'pickup');
  assert.ok(result.evidence.lineItemSignals.includes('store pickup'));
});

test('classifies Shopify recipient pickup fulfillment status as pickup', () => {
  const result = classifyFulfillment({
    shippingAddress: { city: 'Chicago' },
    shippingLines: [{ title: 'Eagle DTF Print', code: 'Eagle DTF Print' }],
    fulfillments: [{ status: 'success', shipment_status: 'ready_for_recipient_pickup' }],
  });

  assert.equal(result.mode, 'pickup');
  assert.ok(result.evidence.fulfillmentSignals.includes('ready for recipient pickup'));
});

test('does not misclassify a normal carrier shipment as pickup', () => {
  const result = classifyFulfillment({
    shippingAddress: { city: 'Chicago' },
    shippingLines: [{ title: 'UPS Ground', code: 'Standard' }],
  });

  assert.equal(result.mode, 'shipping');
  assert.deepEqual(result.evidence.fulfillmentSignals, []);
});

test('ignores unrelated custom artwork text containing pickup words', () => {
  const result = classifyFulfillment({
    shippingAddress: { city: 'Chicago' },
    shippingLines: [{ title: 'UPS Ground' }],
    lineItems: [{ properties: [{ name: 'Artwork note', value: 'Vintage pickup truck' }] }],
  });

  assert.equal(result.mode, 'shipping');
  assert.deepEqual(result.evidence.lineItemSignals, []);
});
