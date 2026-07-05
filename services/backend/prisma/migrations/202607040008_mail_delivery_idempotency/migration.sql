CREATE TABLE "mail_idempotency_keys" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "recipient_email" TEXT NOT NULL,
  "delivery_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mail_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_idempotency_keys_tenant_id_idempotency_key_key"
  ON "mail_idempotency_keys"("tenant_id", "idempotency_key");

CREATE INDEX "mail_idempotency_keys_tenant_id_event_key_recipient_email_created_at_idx"
  ON "mail_idempotency_keys"("tenant_id", "event_key", "recipient_email", "created_at");

CREATE INDEX "mail_idempotency_keys_tenant_id_delivery_id_idx"
  ON "mail_idempotency_keys"("tenant_id", "delivery_id");

ALTER TABLE "mail_idempotency_keys"
  ADD CONSTRAINT "mail_idempotency_keys_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
