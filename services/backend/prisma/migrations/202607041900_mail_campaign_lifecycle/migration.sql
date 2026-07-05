ALTER TABLE "mail_campaigns"
  ADD COLUMN "template_version_id" TEXT,
  ADD COLUMN "subject_override" TEXT,
  ADD COLUMN "sender_name" TEXT,
  ADD COLUMN "reply_to" TEXT,
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "paused_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "created_by_member_id" TEXT,
  ADD COLUMN "approved_by_member_id" TEXT,
  ADD COLUMN "queued_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sent_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "suppressed_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "mail_campaigns_tenant_id_template_version_id_idx"
  ON "mail_campaigns"("tenant_id", "template_version_id");

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_template_version_id_fkey"
  FOREIGN KEY ("template_version_id") REFERENCES "email_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
