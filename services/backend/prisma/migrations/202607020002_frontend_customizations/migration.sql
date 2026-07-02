CREATE TABLE "frontend_customizations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "surface_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "definition" JSONB NOT NULL,
  "reason" TEXT,
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_member_id" TEXT,
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "frontend_customizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "frontend_customizations_status_check" CHECK ("status" IN ('draft', 'active', 'archived')),
  CONSTRAINT "frontend_customizations_surface_check" CHECK ("surface_id" IN ('staff.queue'))
);

CREATE INDEX "frontend_customizations_tenant_surface_status_idx"
  ON "frontend_customizations"("tenant_id", "surface_id", "status");

CREATE INDEX "frontend_customizations_tenant_created_by_idx"
  ON "frontend_customizations"("tenant_id", "created_by_member_id");

CREATE INDEX "frontend_customizations_tenant_activated_idx"
  ON "frontend_customizations"("tenant_id", "activated_at");

ALTER TABLE "frontend_customizations"
  ADD CONSTRAINT "frontend_customizations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "frontend_customizations"
  ADD CONSTRAINT "frontend_customizations_created_by_member_id_fkey"
  FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
