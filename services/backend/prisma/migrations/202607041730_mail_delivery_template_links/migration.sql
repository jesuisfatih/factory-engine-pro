ALTER TABLE "mail_deliveries"
  ADD COLUMN IF NOT EXISTS "template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "template_version_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mail_deliveries_template_id_fkey'
  ) THEN
    ALTER TABLE "mail_deliveries"
      ADD CONSTRAINT "mail_deliveries_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "email_templates"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mail_deliveries_template_version_id_fkey'
  ) THEN
    ALTER TABLE "mail_deliveries"
      ADD CONSTRAINT "mail_deliveries_template_version_id_fkey"
      FOREIGN KEY ("template_version_id") REFERENCES "email_template_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "mail_deliveries_tenant_id_template_id_created_at_idx"
  ON "mail_deliveries"("tenant_id", "template_id", "created_at");

CREATE INDEX IF NOT EXISTS "mail_deliveries_tenant_id_template_version_id_created_at_idx"
  ON "mail_deliveries"("tenant_id", "template_version_id", "created_at");
