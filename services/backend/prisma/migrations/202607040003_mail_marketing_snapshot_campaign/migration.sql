CREATE TABLE "mail_audience_snapshots" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "audience_id" TEXT,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "summary" JSONB NOT NULL DEFAULT '{}',
  "source_summary" JSONB NOT NULL DEFAULT '{}',
  "member_count" INTEGER NOT NULL DEFAULT 0,
  "reachable_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_audience_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_audience_snapshot_members" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "snapshot_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "email" TEXT NOT NULL,
  "consent_state" TEXT NOT NULL DEFAULT 'unknown',
  "suppression_reason" TEXT,
  "is_sendable" BOOLEAN NOT NULL DEFAULT false,
  "buyer_intent" TEXT,
  "last_activity_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_audience_snapshot_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_campaigns" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "audience_id" TEXT,
  "snapshot_id" TEXT,
  "template_id" TEXT,
  "scheduled_at" TIMESTAMP(3),
  "queued_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mail_audience_snapshots_tenant_id_created_at_idx"
  ON "mail_audience_snapshots"("tenant_id", "created_at");

CREATE INDEX "mail_audience_snapshots_tenant_id_audience_id_created_at_idx"
  ON "mail_audience_snapshots"("tenant_id", "audience_id", "created_at");

CREATE UNIQUE INDEX "mail_audience_snapshot_members_snapshot_id_contact_id_key"
  ON "mail_audience_snapshot_members"("snapshot_id", "contact_id");

CREATE INDEX "mail_audience_snapshot_members_tenant_id_snapshot_id_idx"
  ON "mail_audience_snapshot_members"("tenant_id", "snapshot_id");

CREATE INDEX "mail_audience_snapshot_members_tenant_id_customer_id_idx"
  ON "mail_audience_snapshot_members"("tenant_id", "customer_id");

CREATE INDEX "mail_campaigns_tenant_id_status_updated_at_idx"
  ON "mail_campaigns"("tenant_id", "status", "updated_at");

CREATE INDEX "mail_campaigns_tenant_id_audience_id_idx"
  ON "mail_campaigns"("tenant_id", "audience_id");

CREATE INDEX "mail_campaigns_tenant_id_snapshot_id_idx"
  ON "mail_campaigns"("tenant_id", "snapshot_id");

ALTER TABLE "mail_audience_snapshots"
  ADD CONSTRAINT "mail_audience_snapshots_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_audience_snapshots"
  ADD CONSTRAINT "mail_audience_snapshots_audience_id_fkey"
  FOREIGN KEY ("audience_id") REFERENCES "mail_audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_audience_snapshot_members"
  ADD CONSTRAINT "mail_audience_snapshot_members_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_audience_snapshot_members"
  ADD CONSTRAINT "mail_audience_snapshot_members_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "mail_audience_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_audience_snapshot_members"
  ADD CONSTRAINT "mail_audience_snapshot_members_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "mail_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_audience_id_fkey"
  FOREIGN KEY ("audience_id") REFERENCES "mail_audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "mail_audience_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
