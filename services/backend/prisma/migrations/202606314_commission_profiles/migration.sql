CREATE TABLE IF NOT EXISTS "commission_profiles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "assign_type" TEXT NOT NULL,
  "assignee_id" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "rules" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "commission_profiles_tenant_id_active_idx" ON "commission_profiles"("tenant_id", "active");
CREATE INDEX IF NOT EXISTS "commission_profiles_tenant_id_assignee_id_idx" ON "commission_profiles"("tenant_id", "assignee_id");
