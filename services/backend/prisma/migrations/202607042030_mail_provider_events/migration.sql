ALTER TABLE "tenant_configs"
  ADD COLUMN "resend_webhook_secret_encrypted" TEXT;

CREATE TABLE "mail_provider_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "provider_event_id" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "delivery_id" TEXT,
  "event_type" TEXT NOT NULL,
  "recipient_email" TEXT,
  "subject" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "headers" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ,
  "ignored_reason" TEXT,

  CONSTRAINT "mail_provider_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mail_provider_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mail_provider_events_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "mail_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mail_provider_events_tenant_provider_event_uid"
  ON "mail_provider_events"("tenant_id", "provider", "provider_event_id");

CREATE INDEX "mail_provider_events_tenant_provider_message_idx"
  ON "mail_provider_events"("tenant_id", "provider", "provider_message_id");

CREATE INDEX "mail_provider_events_tenant_delivery_occurred_idx"
  ON "mail_provider_events"("tenant_id", "delivery_id", "occurred_at");

CREATE INDEX "mail_provider_events_tenant_event_occurred_idx"
  ON "mail_provider_events"("tenant_id", "event_type", "occurred_at");
