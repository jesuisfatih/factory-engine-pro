CREATE TABLE "account_abandoned_checkouts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "shopify_checkout_id" TEXT NOT NULL,
  "shopify_customer_id" TEXT,
  "name" TEXT,
  "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "line_items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "recovery_url_encrypted" TEXT,
  "provider_created_at" TIMESTAMP(3) NOT NULL,
  "provider_updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_abandoned_checkouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_abandoned_checkouts_tenant_id_shopify_checkout_id_key"
  ON "account_abandoned_checkouts"("tenant_id", "shopify_checkout_id");
CREATE INDEX "account_abandoned_checkouts_tenant_id_customer_id_status_provider_updated_at_idx"
  ON "account_abandoned_checkouts"("tenant_id", "customer_id", "status", "provider_updated_at");
CREATE INDEX "account_abandoned_checkouts_tenant_id_shopify_customer_id_status_idx"
  ON "account_abandoned_checkouts"("tenant_id", "shopify_customer_id", "status");
CREATE INDEX "account_abandoned_checkouts_tenant_id_email_status_idx"
  ON "account_abandoned_checkouts"("tenant_id", "email", "status");

ALTER TABLE "account_abandoned_checkouts"
  ADD CONSTRAINT "account_abandoned_checkouts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_abandoned_checkouts"
  ADD CONSTRAINT "account_abandoned_checkouts_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
