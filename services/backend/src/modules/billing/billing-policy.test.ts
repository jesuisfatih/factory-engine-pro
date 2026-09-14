import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planForTenant, subscriptionAccessAllowed } from './billing.service.js';

describe('Tenant billing policy', () => {
  it('charges DTFBank $249 and every standard tenant $199 monthly', () => {
    assert.equal(planForTenant('dtfbank').amountCents, 24_900);
    for (const slug of ['dtfprintdepot', 'eagledtfprint', 'eagledtfsupply', 'fastdtfsupply', 'fastdtftransfer', 'future-tenant']) {
      assert.equal(planForTenant(slug).code, 'factory_engine_199_monthly');
      assert.equal(planForTenant(slug).amountCents, 19_900);
    }
    assert.equal(planForTenant('dtfbank').taxIncluded, true);
  });

  it('allows active subscriptions and past-due subscriptions inside grace only', () => {
    const now = Date.UTC(2026, 8, 1);
    assert.equal(subscriptionAccessAllowed('active', null, now), true);
    assert.equal(subscriptionAccessAllowed('past_due', new Date(now + 7 * 86_400_000), now), true);
    assert.equal(subscriptionAccessAllowed('past_due', new Date(now - 1), now), false);
    assert.equal(subscriptionAccessAllowed('unpaid', null, now), false);
  });
});
