CREATE TABLE "workflow_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "priority" INTEGER NOT NULL DEFAULT 50,
  "composable" BOOLEAN NOT NULL DEFAULT false,
  "trigger" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_rules"
  ADD CONSTRAINT "workflow_rules_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "workflow_rules_tenant_id_status_idx" ON "workflow_rules"("tenant_id", "status");
CREATE INDEX "workflow_rules_tenant_id_trigger_idx" ON "workflow_rules"("tenant_id", "trigger");
CREATE INDEX "workflow_rules_tenant_id_priority_idx" ON "workflow_rules"("tenant_id", "priority");
