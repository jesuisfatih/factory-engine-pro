CREATE TABLE "mail_suppressions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL DEFAULT 'manual',
  "source" TEXT NOT NULL DEFAULT 'admin-ui',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_center_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "category_system" JSONB NOT NULL DEFAULT '{}',
  "category_b2b" JSONB NOT NULL DEFAULT '{}',
  "category_marketing" JSONB NOT NULL DEFAULT '{}',
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_center_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_settings_audit_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "old_value" JSONB,
  "new_value" JSONB,
  "changed_by" TEXT NOT NULL DEFAULT 'system',
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_settings_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_dlq" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "recipient_email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider" TEXT,
  "error_message" TEXT,
  "last_delivery_id" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "mail_dlq_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_suppressions_tenant_id_contact_id_channel_key"
  ON "mail_suppressions"("tenant_id", "contact_id", "channel");
CREATE INDEX "mail_suppressions_tenant_id_is_active_created_at_idx"
  ON "mail_suppressions"("tenant_id", "is_active", "created_at");
CREATE INDEX "mail_suppressions_tenant_id_reason_idx"
  ON "mail_suppressions"("tenant_id", "reason");

CREATE UNIQUE INDEX "mail_center_settings_tenant_id_key"
  ON "mail_center_settings"("tenant_id");

CREATE INDEX "mail_settings_audit_logs_tenant_id_changed_at_idx"
  ON "mail_settings_audit_logs"("tenant_id", "changed_at");
CREATE INDEX "mail_settings_audit_logs_tenant_id_category_field_idx"
  ON "mail_settings_audit_logs"("tenant_id", "category", "field");

CREATE INDEX "mail_dlq_tenant_id_status_created_at_idx"
  ON "mail_dlq"("tenant_id", "status", "created_at");
CREATE INDEX "mail_dlq_tenant_id_event_key_created_at_idx"
  ON "mail_dlq"("tenant_id", "event_key", "created_at");
CREATE INDEX "mail_dlq_tenant_id_recipient_email_idx"
  ON "mail_dlq"("tenant_id", "recipient_email");

ALTER TABLE "mail_suppressions"
  ADD CONSTRAINT "mail_suppressions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_suppressions"
  ADD CONSTRAINT "mail_suppressions_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "mail_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_center_settings"
  ADD CONSTRAINT "mail_center_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_settings_audit_logs"
  ADD CONSTRAINT "mail_settings_audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_dlq"
  ADD CONSTRAINT "mail_dlq_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
