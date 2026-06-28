ALTER TABLE "service_requests"
  ADD COLUMN "axis" TEXT,
  ADD COLUMN "matched_rule_id" TEXT,
  ADD COLUMN "condition_trace" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "task_participants" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "service_request_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'watcher',
  "source" TEXT NOT NULL DEFAULT 'axis_primary',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_participants_tenant_id_service_request_id_member_id_role_key"
  ON "task_participants"("tenant_id", "service_request_id", "member_id", "role");

CREATE INDEX "task_participants_tenant_id_service_request_id_idx"
  ON "task_participants"("tenant_id", "service_request_id");

CREATE INDEX "task_participants_tenant_id_member_id_idx"
  ON "task_participants"("tenant_id", "member_id");

CREATE INDEX "service_requests_tenant_id_axis_idx"
  ON "service_requests"("tenant_id", "axis");

CREATE INDEX "service_requests_tenant_id_matched_rule_id_idx"
  ON "service_requests"("tenant_id", "matched_rule_id");

ALTER TABLE "task_participants"
  ADD CONSTRAINT "task_participants_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_participants"
  ADD CONSTRAINT "task_participants_service_request_id_fkey"
  FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_participants"
  ADD CONSTRAINT "task_participants_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
