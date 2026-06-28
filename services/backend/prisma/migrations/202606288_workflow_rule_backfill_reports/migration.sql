CREATE TABLE "workflow_rule_backfill_reports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "rule_name" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "recent_days" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "evaluated_events" INTEGER NOT NULL DEFAULT 0,
  "matched_events" INTEGER NOT NULL DEFAULT 0,
  "skipped_events" INTEGER NOT NULL DEFAULT 0,
  "would_create_tasks" INTEGER NOT NULL DEFAULT 0,
  "actual_tasks_created" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB NOT NULL DEFAULT '{}',
  "created_by_member_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "workflow_rule_backfill_reports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_rule_backfill_reports"
ADD CONSTRAINT "workflow_rule_backfill_reports_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_rule_backfill_reports"
ADD CONSTRAINT "workflow_rule_backfill_reports_rule_id_fkey"
FOREIGN KEY ("rule_id") REFERENCES "workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_rule_backfill_reports"
ADD CONSTRAINT "workflow_rule_backfill_reports_created_by_member_id_fkey"
FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "workflow_rule_backfill_reports_tenant_id_rule_id_created_at_idx"
ON "workflow_rule_backfill_reports"("tenant_id", "rule_id", "created_at");

CREATE INDEX "workflow_rule_backfill_reports_tenant_id_status_idx"
ON "workflow_rule_backfill_reports"("tenant_id", "status");

CREATE INDEX "workflow_rule_backfill_reports_tenant_id_created_by_member_id_idx"
ON "workflow_rule_backfill_reports"("tenant_id", "created_by_member_id");
