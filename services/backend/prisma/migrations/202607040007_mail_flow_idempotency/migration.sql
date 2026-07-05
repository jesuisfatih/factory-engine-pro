CREATE TABLE "mail_flow_idempotency_keys" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "flow_version_id" TEXT,
  "trigger_type" TEXT NOT NULL,
  "target_key" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_flow_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_flow_idempotency_keys_tenant_id_flow_id_idempotency_key_key"
  ON "mail_flow_idempotency_keys"("tenant_id", "flow_id", "idempotency_key");

CREATE INDEX "mail_flow_idempotency_keys_tenant_id_expires_at_idx"
  ON "mail_flow_idempotency_keys"("tenant_id", "expires_at");

CREATE INDEX "mail_flow_idempotency_keys_tenant_id_trigger_type_target_key_idx"
  ON "mail_flow_idempotency_keys"("tenant_id", "trigger_type", "target_key");

ALTER TABLE "mail_flow_idempotency_keys"
  ADD CONSTRAINT "mail_flow_idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_idempotency_keys_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "mail_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_idempotency_keys_flow_version_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "mail_flow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
