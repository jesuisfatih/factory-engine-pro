ALTER TABLE "email_templates"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "published_version_id" TEXT;

ALTER TABLE "email_template_versions"
  ADD COLUMN "preview_text" TEXT,
  ADD COLUMN "css" TEXT,
  ADD COLUMN "render_mode" TEXT NOT NULL DEFAULT 'code',
  ADD COLUMN "lint_summary" JSONB,
  ADD COLUMN "spam_score" DOUBLE PRECISION,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "email_template_bindings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "template_version_id" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_template_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_template_approvals" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "template_version_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT,
  "actor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_template_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_template_preview_profiles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "template_id" TEXT,
  "event_key" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "variables" JSONB NOT NULL DEFAULT '{}',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_template_preview_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_published_version_id_key"
  ON "email_templates"("published_version_id");

CREATE INDEX "email_template_versions_tenant_id_template_id_status_created_at_idx"
  ON "email_template_versions"("tenant_id", "template_id", "status", "created_at");

CREATE INDEX "email_template_versions_tenant_id_approval_state_updated_at_idx"
  ON "email_template_versions"("tenant_id", "approval_state", "updated_at");

CREATE UNIQUE INDEX "email_template_bindings_tenant_id_event_key_key"
  ON "email_template_bindings"("tenant_id", "event_key");

CREATE INDEX "email_template_bindings_tenant_id_template_id_idx"
  ON "email_template_bindings"("tenant_id", "template_id");

CREATE INDEX "email_template_bindings_tenant_id_template_version_id_idx"
  ON "email_template_bindings"("tenant_id", "template_version_id");

CREATE INDEX "mail_template_approvals_tenant_id_template_id_created_at_idx"
  ON "mail_template_approvals"("tenant_id", "template_id", "created_at");

CREATE INDEX "mail_template_approvals_tenant_id_template_version_id_created_at_idx"
  ON "mail_template_approvals"("tenant_id", "template_version_id", "created_at");

CREATE INDEX "mail_template_preview_profiles_tenant_id_template_id_is_default_idx"
  ON "mail_template_preview_profiles"("tenant_id", "template_id", "is_default");

CREATE INDEX "mail_template_preview_profiles_tenant_id_event_key_is_default_idx"
  ON "mail_template_preview_profiles"("tenant_id", "event_key", "is_default");

ALTER TABLE "email_templates"
  ADD CONSTRAINT "email_templates_published_version_id_fkey"
  FOREIGN KEY ("published_version_id") REFERENCES "email_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_template_bindings"
  ADD CONSTRAINT "email_template_bindings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_template_bindings"
  ADD CONSTRAINT "email_template_bindings_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_template_bindings"
  ADD CONSTRAINT "email_template_bindings_template_version_id_fkey"
  FOREIGN KEY ("template_version_id") REFERENCES "email_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_template_approvals"
  ADD CONSTRAINT "mail_template_approvals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_template_approvals"
  ADD CONSTRAINT "mail_template_approvals_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_template_approvals"
  ADD CONSTRAINT "mail_template_approvals_template_version_id_fkey"
  FOREIGN KEY ("template_version_id") REFERENCES "email_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_template_preview_profiles"
  ADD CONSTRAINT "mail_template_preview_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_template_preview_profiles"
  ADD CONSTRAINT "mail_template_preview_profiles_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
