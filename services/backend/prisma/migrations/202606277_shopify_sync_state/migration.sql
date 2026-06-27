CREATE TABLE "shopify_sync_states" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "lock_expires_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "current_sync_log_id" TEXT,
    "last_cursor" TEXT,
    "last_started_at" TIMESTAMP(3),
    "last_completed_at" TIMESTAMP(3),
    "last_failed_at" TIMESTAMP(3),
    "total_records_synced" INTEGER NOT NULL DEFAULT 0,
    "last_run_records" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_sync_states_tenant_id_resource_key" ON "shopify_sync_states"("tenant_id", "resource");
CREATE INDEX "shopify_sync_states_tenant_id_idx" ON "shopify_sync_states"("tenant_id");
CREATE INDEX "shopify_sync_states_tenant_id_status_idx" ON "shopify_sync_states"("tenant_id", "status");

ALTER TABLE "shopify_sync_states"
  ADD CONSTRAINT "shopify_sync_states_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "member_roles"
SET "permissions" = "permissions" || '{"sync.trigger": true}'::jsonb
WHERE "slug" IN ('owner', 'admin') AND "is_system" = true;
