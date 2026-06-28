CREATE TABLE "workflow_rule_executions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'started',
  "task_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "result" JSONB NOT NULL DEFAULT '{}',
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_rule_executions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_rule_executions"
  ADD CONSTRAINT "workflow_rule_executions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_rule_executions"
  ADD CONSTRAINT "workflow_rule_executions_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "workflow_rule_executions_tenant_id_event_id_rule_id_key"
  ON "workflow_rule_executions"("tenant_id", "event_id", "rule_id");

CREATE INDEX "workflow_rule_executions_tenant_id_event_id_idx"
  ON "workflow_rule_executions"("tenant_id", "event_id");

CREATE INDEX "workflow_rule_executions_tenant_id_rule_id_idx"
  ON "workflow_rule_executions"("tenant_id", "rule_id");
