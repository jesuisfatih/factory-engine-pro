ALTER TABLE "b2b_access_requests"
ADD COLUMN "tax_certificate_expires_at" TIMESTAMP(3);

CREATE TABLE "customer_tax_exemptions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "source_request_id" TEXT,
  "certificate_file_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "warning_sent_at" TIMESTAMP(3),
  "warning_delivery_id" TEXT,
  "expired_at" TIMESTAMP(3),
  "shopify_tax_exempt_disabled_at" TIMESTAMP(3),
  "shopify_sync_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_tax_exemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_tax_exemptions_customer_id_key"
ON "customer_tax_exemptions"("customer_id");

CREATE INDEX "customer_tax_exemptions_tenant_id_status_expires_at_idx"
ON "customer_tax_exemptions"("tenant_id", "status", "expires_at");

CREATE INDEX "customer_tax_exemptions_tenant_id_warning_sent_at_expires_at_idx"
ON "customer_tax_exemptions"("tenant_id", "warning_sent_at", "expires_at");

ALTER TABLE "customer_tax_exemptions"
ADD CONSTRAINT "customer_tax_exemptions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_tax_exemptions"
ADD CONSTRAINT "customer_tax_exemptions_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
