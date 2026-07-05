CREATE TABLE "mail_flow_webhook_destinations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "auth_type" TEXT NOT NULL DEFAULT 'none',
  "secret_header_name" TEXT,
  "secret_value_encrypted" TEXT,
  "timeout_ms" INTEGER NOT NULL DEFAULT 5000,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mail_flow_webhook_destinations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_flow_webhook_destinations_tenant_id_slug_key"
  ON "mail_flow_webhook_destinations"("tenant_id", "slug");

CREATE INDEX "mail_flow_webhook_destinations_tenant_id_status_updated_at_idx"
  ON "mail_flow_webhook_destinations"("tenant_id", "status", "updated_at");

ALTER TABLE "mail_flow_webhook_destinations"
  ADD CONSTRAINT "mail_flow_webhook_destinations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
