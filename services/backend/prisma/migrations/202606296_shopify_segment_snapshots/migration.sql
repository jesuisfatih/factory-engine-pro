CREATE TABLE IF NOT EXISTS "shopify_customer_segments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shopify_segment_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "customer_count" INTEGER,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_synced_at" TIMESTAMP(3),
  "sync_status" TEXT NOT NULL DEFAULT 'pending',
  "sync_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shopify_customer_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "shopify_customer_segment_members" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shopify_segment_ref_id" TEXT NOT NULL,
  "shopify_segment_id" TEXT NOT NULL,
  "shopify_customer_id" TEXT NOT NULL,
  "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shopify_customer_segment_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "segment_customer_assignments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "segment_id" TEXT NOT NULL,
  "segment_name" TEXT NOT NULL,
  "lifecycle_stage" TEXT,
  "is_matched" BOOLEAN NOT NULL DEFAULT true,
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'segment_evaluator',
  "first_matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_matched_at" TIMESTAMP(3),
  "last_evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "match_count" INTEGER NOT NULL DEFAULT 1,
  "metrics_snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "segment_customer_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shopify_customer_segments_tenant_id_shopify_segment_id_key"
  ON "shopify_customer_segments"("tenant_id", "shopify_segment_id");
CREATE INDEX IF NOT EXISTS "shopify_customer_segments_tenant_id_last_seen_at_idx"
  ON "shopify_customer_segments"("tenant_id", "last_seen_at");
CREATE INDEX IF NOT EXISTS "shopify_customer_segments_tenant_id_sync_status_idx"
  ON "shopify_customer_segments"("tenant_id", "sync_status");

CREATE UNIQUE INDEX IF NOT EXISTS "shopify_customer_segment_members_tenant_id_shopify_segment_id_shopify_customer_id_key"
  ON "shopify_customer_segment_members"("tenant_id", "shopify_segment_id", "shopify_customer_id");
CREATE INDEX IF NOT EXISTS "shopify_customer_segment_members_tenant_id_shopify_segment_ref_id_idx"
  ON "shopify_customer_segment_members"("tenant_id", "shopify_segment_ref_id");
CREATE INDEX IF NOT EXISTS "shopify_customer_segment_members_tenant_id_shopify_customer_id_idx"
  ON "shopify_customer_segment_members"("tenant_id", "shopify_customer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "segment_customer_assignments_tenant_id_customer_id_segment_id_key"
  ON "segment_customer_assignments"("tenant_id", "customer_id", "segment_id");
CREATE INDEX IF NOT EXISTS "segment_customer_assignments_tenant_id_customer_id_is_matched_idx"
  ON "segment_customer_assignments"("tenant_id", "customer_id", "is_matched");
CREATE INDEX IF NOT EXISTS "segment_customer_assignments_tenant_id_segment_id_is_matched_idx"
  ON "segment_customer_assignments"("tenant_id", "segment_id", "is_matched");
CREATE INDEX IF NOT EXISTS "segment_customer_assignments_tenant_id_is_current_idx"
  ON "segment_customer_assignments"("tenant_id", "is_current");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_customer_segments_tenant_id_fkey') THEN
    ALTER TABLE "shopify_customer_segments"
      ADD CONSTRAINT "shopify_customer_segments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_customer_segment_members_tenant_id_fkey') THEN
    ALTER TABLE "shopify_customer_segment_members"
      ADD CONSTRAINT "shopify_customer_segment_members_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_customer_segment_members_shopify_segment_ref_id_fkey') THEN
    ALTER TABLE "shopify_customer_segment_members"
      ADD CONSTRAINT "shopify_customer_segment_members_shopify_segment_ref_id_fkey"
      FOREIGN KEY ("shopify_segment_ref_id") REFERENCES "shopify_customer_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'segment_customer_assignments_tenant_id_fkey') THEN
    ALTER TABLE "segment_customer_assignments"
      ADD CONSTRAINT "segment_customer_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'segment_customer_assignments_customer_id_fkey') THEN
    ALTER TABLE "segment_customer_assignments"
      ADD CONSTRAINT "segment_customer_assignments_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'segment_customer_assignments_segment_id_fkey') THEN
    ALTER TABLE "segment_customer_assignments"
      ADD CONSTRAINT "segment_customer_assignments_segment_id_fkey"
      FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
