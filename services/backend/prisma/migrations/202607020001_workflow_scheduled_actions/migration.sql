CREATE TABLE "workflow_scheduled_actions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "source_event_id" TEXT,
  "source_call_id" TEXT,
  "customer_id" TEXT,
  "assigned_member_id" TEXT,
  "axis" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "action_payload" JSONB NOT NULL,
  "brief_payload" JSONB NOT NULL DEFAULT '{}',
  "revalidation_policy" JSONB NOT NULL DEFAULT '{}',
  "run_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "skip_reason" TEXT,
  "error_message" TEXT,
  "executed_service_request_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_scheduled_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_scheduled_actions_axis_check" CHECK ("axis" IN ('sales', 'account')),
  CONSTRAINT "workflow_scheduled_actions_status_check" CHECK ("status" IN ('pending', 'executing', 'executed', 'skipped', 'cancelled', 'failed'))
);

CREATE UNIQUE INDEX "workflow_scheduled_actions_tenant_id_idempotency_key_key"
  ON "workflow_scheduled_actions"("tenant_id", "idempotency_key");

CREATE INDEX "workflow_scheduled_actions_tenant_id_status_run_at_idx"
  ON "workflow_scheduled_actions"("tenant_id", "status", "run_at");

CREATE INDEX "workflow_scheduled_actions_tenant_id_rule_id_idx"
  ON "workflow_scheduled_actions"("tenant_id", "rule_id");

CREATE INDEX "workflow_scheduled_actions_tenant_id_customer_id_idx"
  ON "workflow_scheduled_actions"("tenant_id", "customer_id");

CREATE INDEX "workflow_scheduled_actions_tenant_id_assigned_member_id_idx"
  ON "workflow_scheduled_actions"("tenant_id", "assigned_member_id");

CREATE INDEX "workflow_scheduled_actions_tenant_id_executed_service_request_id_idx"
  ON "workflow_scheduled_actions"("tenant_id", "executed_service_request_id");

ALTER TABLE "workflow_scheduled_actions"
  ADD CONSTRAINT "workflow_scheduled_actions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_scheduled_actions"
  ADD CONSTRAINT "workflow_scheduled_actions_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_scheduled_actions"
  ADD CONSTRAINT "workflow_scheduled_actions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_scheduled_actions"
  ADD CONSTRAINT "workflow_scheduled_actions_assigned_member_id_fkey"
  FOREIGN KEY ("assigned_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_scheduled_actions"
  ADD CONSTRAINT "workflow_scheduled_actions_executed_service_request_id_fkey"
  FOREIGN KEY ("executed_service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
