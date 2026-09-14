# Stripe backpanel billing setup

Factory Engine uses one monthly Stripe subscription per tenant. The admin surface is **System → Billing**.

## Plans

- DTFBank: **$249 USD / month**, tax included.
- All other tenants, including future tenants: **$199 USD / month**, tax included.
- No trial.
- Payment failure grace period: 7 days.
- Customer cancellation is disabled in the Stripe Customer Portal configuration.

## Stripe Dashboard preparation

1. Use the existing recurring monthly Price for `$249 USD` and the new one for `$199 USD`.
2. Treat the displayed amount as tax-inclusive. If Stripe Tax is enabled on the account, set each Price tax behavior to **Inclusive**.
3. In **Settings → Billing → Customer portal**, enable payment-method updates and invoice history, and disable subscription cancellation.
4. Create a webhook endpoint for each tenant using the endpoint shown on that tenant's Billing page.
5. Subscribe each endpoint to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

## Tenant environment keys

Set the values only in the tenant's server environment. Never commit real values.

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_DTFBANK
STRIPE_PRICE_STANDARD
BILLING_ENFORCEMENT_ENABLED=false
```

DTFBank reads `STRIPE_PRICE_DTFBANK`; the other tenants read `STRIPE_PRICE_STANDARD`. The unused price variable may remain empty in a tenant container.
For each new tenant, configure `STRIPE_PRICE_STANDARD` with the active, tax-inclusive $199/month Price ID before enabling checkout.

## Safety interlock

Non-payment enforcement is implemented but intentionally inactive. Access is restricted only when both conditions are true:

1. `BILLING_ENFORCEMENT_ENABLED=true` in the tenant runtime; and
2. that tenant's `tenant_billing_subscriptions.enforcement_enabled` flag is true.

Until both are deliberately enabled, payment state never blocks the admin or staff backpanel. Customer Accounts surfaces are never blocked by this guard.
