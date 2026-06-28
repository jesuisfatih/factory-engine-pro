CREATE TABLE "rule_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "version_no" INTEGER NOT NULL,
  "json_snapshot" JSONB NOT NULL,
  "edited_by_member_id" TEXT,
  "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comment" TEXT,

  CONSTRAINT "rule_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rule_versions"
ADD CONSTRAINT "rule_versions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_versions"
ADD CONSTRAINT "rule_versions_rule_id_fkey"
FOREIGN KEY ("rule_id") REFERENCES "workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_versions"
ADD CONSTRAINT "rule_versions_edited_by_member_id_fkey"
FOREIGN KEY ("edited_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "rule_versions_tenant_id_rule_id_version_no_key"
ON "rule_versions"("tenant_id", "rule_id", "version_no");

CREATE INDEX "rule_versions_tenant_id_rule_id_edited_at_idx"
ON "rule_versions"("tenant_id", "rule_id", "edited_at");

CREATE INDEX "rule_versions_tenant_id_edited_by_member_id_idx"
ON "rule_versions"("tenant_id", "edited_by_member_id");
