ALTER TABLE "segment_ownerships"
  ADD COLUMN IF NOT EXISTS "team_id" TEXT;

ALTER TABLE "segment_customer_memberships"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "shopify_segment_ref" TEXT;

CREATE INDEX IF NOT EXISTS "segment_ownerships_tenant_id_team_id_idx"
  ON "segment_ownerships"("tenant_id", "team_id");

CREATE INDEX IF NOT EXISTS "segment_customer_memberships_tenant_id_source_idx"
  ON "segment_customer_memberships"("tenant_id", "source");

CREATE INDEX IF NOT EXISTS "segment_customer_memberships_tenant_id_shopify_segment_ref_idx"
  ON "segment_customer_memberships"("tenant_id", "shopify_segment_ref");
