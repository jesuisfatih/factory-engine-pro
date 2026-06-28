CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "template_type" TEXT NOT NULL DEFAULT 'transactional',
  "folder_key" TEXT NOT NULL DEFAULT 'general',
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "approval_state" TEXT NOT NULL DEFAULT 'draft',
  "variables" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_template_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "approval_state" TEXT NOT NULL DEFAULT 'draft',
  "variables" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3),
  CONSTRAINT "email_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_contacts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "email" TEXT NOT NULL,
  "normalized_email" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "tags" JSONB NOT NULL DEFAULT '[]',
  "buyer_intent" TEXT,
  "lifecycle_stage" TEXT,
  "is_sendable" BOOLEAN NOT NULL DEFAULT true,
  "last_activity_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_audiences" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "contact_count" INTEGER NOT NULL DEFAULT 0,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "last_calculated_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_audiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_flows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "trigger_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "graph" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_flows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_marketing_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "source" TEXT NOT NULL DEFAULT 'system',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_marketing_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_marketing_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "sending_enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider_mode" TEXT NOT NULL DEFAULT 'disabled',
  "default_sender_name" TEXT NOT NULL DEFAULT 'Factory Engine Pro',
  "default_sender_email" TEXT,
  "quiet_hours" JSONB NOT NULL DEFAULT '{}',
  "daily_send_cap" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_marketing_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_tenant_id_slug_key" ON "email_templates"("tenant_id", "slug");
CREATE INDEX "email_templates_tenant_id_event_key_status_idx" ON "email_templates"("tenant_id", "event_key", "status");
CREATE INDEX "email_templates_tenant_id_template_type_folder_key_updated_at_idx" ON "email_templates"("tenant_id", "template_type", "folder_key", "updated_at");

CREATE UNIQUE INDEX "email_template_versions_tenant_id_template_id_version_number_key" ON "email_template_versions"("tenant_id", "template_id", "version_number");
CREATE INDEX "email_template_versions_tenant_id_template_id_created_at_idx" ON "email_template_versions"("tenant_id", "template_id", "created_at");

CREATE UNIQUE INDEX "mail_contacts_tenant_id_normalized_email_key" ON "mail_contacts"("tenant_id", "normalized_email");
CREATE INDEX "mail_contacts_tenant_id_is_sendable_idx" ON "mail_contacts"("tenant_id", "is_sendable");
CREATE INDEX "mail_contacts_tenant_id_customer_id_idx" ON "mail_contacts"("tenant_id", "customer_id");
CREATE INDEX "mail_contacts_tenant_id_last_activity_at_idx" ON "mail_contacts"("tenant_id", "last_activity_at");

CREATE UNIQUE INDEX "mail_audiences_tenant_id_slug_key" ON "mail_audiences"("tenant_id", "slug");
CREATE INDEX "mail_audiences_tenant_id_is_archived_updated_at_idx" ON "mail_audiences"("tenant_id", "is_archived", "updated_at");

CREATE UNIQUE INDEX "mail_flows_tenant_id_slug_key" ON "mail_flows"("tenant_id", "slug");
CREATE INDEX "mail_flows_tenant_id_status_updated_at_idx" ON "mail_flows"("tenant_id", "status", "updated_at");
CREATE INDEX "mail_flows_tenant_id_trigger_type_idx" ON "mail_flows"("tenant_id", "trigger_type");

CREATE INDEX "mail_marketing_events_tenant_id_event_type_created_at_idx" ON "mail_marketing_events"("tenant_id", "event_type", "created_at");
CREATE INDEX "mail_marketing_events_tenant_id_status_created_at_idx" ON "mail_marketing_events"("tenant_id", "status", "created_at");

CREATE UNIQUE INDEX "mail_marketing_settings_tenant_id_key" ON "mail_marketing_settings"("tenant_id");

ALTER TABLE "email_templates"
  ADD CONSTRAINT "email_templates_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_template_versions"
  ADD CONSTRAINT "email_template_versions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_template_versions"
  ADD CONSTRAINT "email_template_versions_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_contacts"
  ADD CONSTRAINT "mail_contacts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_audiences"
  ADD CONSTRAINT "mail_audiences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_flows"
  ADD CONSTRAINT "mail_flows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_marketing_events"
  ADD CONSTRAINT "mail_marketing_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_marketing_settings"
  ADD CONSTRAINT "mail_marketing_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
