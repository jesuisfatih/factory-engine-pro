-- Mail suppression scopes let recipient safety block globally, by category, or by a
-- specific campaign/flow/template without making every suppression a full contact block.

ALTER TABLE "mail_suppressions"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN "category" TEXT,
  ADD COLUMN "campaign_id" TEXT,
  ADD COLUMN "flow_id" TEXT,
  ADD COLUMN "template_id" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3);

ALTER TABLE "mail_suppressions"
  DROP CONSTRAINT IF EXISTS "mail_suppressions_tenant_id_contact_id_channel_key";

CREATE INDEX "mail_suppressions_tenant_id_contact_id_channel_scope_is_active_idx"
  ON "mail_suppressions"("tenant_id", "contact_id", "channel", "scope", "is_active");

CREATE INDEX "mail_suppressions_tenant_id_category_is_active_idx"
  ON "mail_suppressions"("tenant_id", "category", "is_active");

CREATE INDEX "mail_suppressions_tenant_id_campaign_id_is_active_idx"
  ON "mail_suppressions"("tenant_id", "campaign_id", "is_active");

CREATE INDEX "mail_suppressions_tenant_id_flow_id_is_active_idx"
  ON "mail_suppressions"("tenant_id", "flow_id", "is_active");

CREATE INDEX "mail_suppressions_tenant_id_template_id_is_active_idx"
  ON "mail_suppressions"("tenant_id", "template_id", "is_active");
