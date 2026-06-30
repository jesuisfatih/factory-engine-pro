CREATE TABLE IF NOT EXISTS "workflow_mcp_drafts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "source_goal" TEXT NOT NULL,
  "rule" JSONB NOT NULL,
  "detected_intent" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "assumptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "unsupported" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_member_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_mcp_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_mcp_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workflow_mcp_drafts_tenant_id_created_at_idx" ON "workflow_mcp_drafts"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "workflow_mcp_drafts_tenant_id_expires_at_idx" ON "workflow_mcp_drafts"("tenant_id", "expires_at");
CREATE INDEX IF NOT EXISTS "workflow_mcp_drafts_tenant_id_created_by_member_id_idx" ON "workflow_mcp_drafts"("tenant_id", "created_by_member_id");
