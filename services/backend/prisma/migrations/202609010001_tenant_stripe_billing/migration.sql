CREATE TABLE "tenant_billing_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "plan_code" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "billing_interval" TEXT NOT NULL DEFAULT 'month',
    "status" TEXT NOT NULL DEFAULT 'unconfigured',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "last_invoice_id" TEXT,
    "last_invoice_status" TEXT,
    "last_payment_failed_at" TIMESTAMP(3),
    "grace_ends_at" TIMESTAMP(3),
    "enforcement_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stripe_billing_webhook_inbox" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL,
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_billing_webhook_inbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_billing_subscriptions_tenant_id_key" ON "tenant_billing_subscriptions"("tenant_id");
CREATE UNIQUE INDEX "tenant_billing_subscriptions_stripe_subscription_id_key" ON "tenant_billing_subscriptions"("stripe_subscription_id");
CREATE INDEX "tenant_billing_subscriptions_tenant_id_status_idx" ON "tenant_billing_subscriptions"("tenant_id", "status");
CREATE UNIQUE INDEX "stripe_billing_webhook_inbox_tenant_id_stripe_event_id_key" ON "stripe_billing_webhook_inbox"("tenant_id", "stripe_event_id");
CREATE INDEX "stripe_billing_webhook_inbox_tenant_id_status_received_at_idx" ON "stripe_billing_webhook_inbox"("tenant_id", "status", "received_at");

ALTER TABLE "tenant_billing_subscriptions"
ADD CONSTRAINT "tenant_billing_subscriptions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stripe_billing_webhook_inbox"
ADD CONSTRAINT "stripe_billing_webhook_inbox_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
