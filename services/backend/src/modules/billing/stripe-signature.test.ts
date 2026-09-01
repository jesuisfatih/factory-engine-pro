import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyStripeSignature } from './stripe-signature.js';

describe('Stripe signature verification', () => {
  it('accepts a current matching v1 signature', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ id: 'evt_test' });
    const timestamp = 1_700_000_000;
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  });

  it('rejects stale and mismatched signatures', () => {
    const timestamp = 1_700_000_000;
    assert.equal(verifyStripeSignature('{}', `t=${timestamp},v1=invalid`, 'whsec_test', timestamp), false);
    assert.equal(verifyStripeSignature('{}', `t=${timestamp},v1=invalid`, 'whsec_test', timestamp + 301), false);
  });
});
