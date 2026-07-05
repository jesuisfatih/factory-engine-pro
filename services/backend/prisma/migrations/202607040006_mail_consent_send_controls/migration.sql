CREATE TABLE "mail_consent_states" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "category" TEXT NOT NULL DEFAULT 'marketing',
  "state" TEXT NOT NULL DEFAULT 'unknown',
  "source" TEXT NOT NULL DEFAULT 'external_event',
  "source_detail" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_consent_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_consent_states_tenant_id_contact_id_channel_category_key"
  ON "mail_consent_states"("tenant_id", "contact_id", "channel", "category");

CREATE INDEX "mail_consent_states_tenant_id_contact_id_channel_category_idx"
  ON "mail_consent_states"("tenant_id", "contact_id", "channel", "category");

CREATE INDEX "mail_consent_states_tenant_id_state_updated_at_idx"
  ON "mail_consent_states"("tenant_id", "state", "updated_at");

ALTER TABLE "mail_consent_states"
  ADD CONSTRAINT "mail_consent_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_consent_states_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "mail_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
