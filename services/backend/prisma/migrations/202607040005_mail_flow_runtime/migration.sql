ALTER TABLE "mail_flows"
  ADD COLUMN "active_version_id" TEXT;

CREATE TABLE "mail_flow_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "trigger_type" TEXT NOT NULL,
  "graph" JSONB NOT NULL DEFAULT '{}',
  "summary" JSONB NOT NULL DEFAULT '{}',
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_flow_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_flow_nodes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "flow_version_id" TEXT NOT NULL,
  "node_key" TEXT NOT NULL,
  "node_type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "next_node_key" TEXT,
  "routes" JSONB NOT NULL DEFAULT '[]',
  "config" JSONB NOT NULL DEFAULT '{}',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "position_x" INTEGER NOT NULL DEFAULT 0,
  "position_y" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_flow_nodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_flow_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "flow_version_id" TEXT,
  "trigger_type" TEXT NOT NULL,
  "trigger_event_type" TEXT,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "enrollment_count" INTEGER NOT NULL DEFAULT 0,
  "completed_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_flow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_flow_enrollments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "flow_version_id" TEXT,
  "flow_run_id" TEXT NOT NULL,
  "contact_id" TEXT,
  "customer_id" TEXT,
  "email" TEXT,
  "current_node_key" TEXT,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "event_payload" JSONB NOT NULL DEFAULT '{}',
  "last_error" TEXT,
  "next_run_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_flow_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_flow_action_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "flow_version_id" TEXT,
  "flow_run_id" TEXT,
  "enrollment_id" TEXT,
  "contact_id" TEXT,
  "action_type" TEXT NOT NULL,
  "node_key" TEXT,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "message" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_flow_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_flows_active_version_id_key" ON "mail_flows"("active_version_id");
CREATE UNIQUE INDEX "mail_flow_versions_tenant_id_flow_id_version_number_key" ON "mail_flow_versions"("tenant_id", "flow_id", "version_number");
CREATE UNIQUE INDEX "mail_flow_nodes_tenant_id_flow_version_id_node_key_key" ON "mail_flow_nodes"("tenant_id", "flow_version_id", "node_key");

CREATE INDEX "mail_flow_versions_tenant_id_flow_id_status_idx" ON "mail_flow_versions"("tenant_id", "flow_id", "status");
CREATE INDEX "mail_flow_versions_tenant_id_trigger_type_idx" ON "mail_flow_versions"("tenant_id", "trigger_type");
CREATE INDEX "mail_flow_nodes_tenant_id_node_type_idx" ON "mail_flow_nodes"("tenant_id", "node_type");
CREATE INDEX "mail_flow_runs_tenant_id_flow_id_created_at_idx" ON "mail_flow_runs"("tenant_id", "flow_id", "created_at");
CREATE INDEX "mail_flow_runs_tenant_id_status_created_at_idx" ON "mail_flow_runs"("tenant_id", "status", "created_at");
CREATE INDEX "mail_flow_enrollments_tenant_id_flow_id_status_idx" ON "mail_flow_enrollments"("tenant_id", "flow_id", "status");
CREATE INDEX "mail_flow_enrollments_tenant_id_flow_run_id_idx" ON "mail_flow_enrollments"("tenant_id", "flow_run_id");
CREATE INDEX "mail_flow_enrollments_tenant_id_contact_id_idx" ON "mail_flow_enrollments"("tenant_id", "contact_id");
CREATE INDEX "mail_flow_action_logs_tenant_id_flow_id_created_at_idx" ON "mail_flow_action_logs"("tenant_id", "flow_id", "created_at");
CREATE INDEX "mail_flow_action_logs_tenant_id_flow_run_id_idx" ON "mail_flow_action_logs"("tenant_id", "flow_run_id");
CREATE INDEX "mail_flow_action_logs_tenant_id_enrollment_id_idx" ON "mail_flow_action_logs"("tenant_id", "enrollment_id");
CREATE INDEX "mail_flow_action_logs_tenant_id_action_type_status_idx" ON "mail_flow_action_logs"("tenant_id", "action_type", "status");

ALTER TABLE "mail_flow_versions"
  ADD CONSTRAINT "mail_flow_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_versions_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "mail_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_flows"
  ADD CONSTRAINT "mail_flows_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "mail_flow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_flow_nodes"
  ADD CONSTRAINT "mail_flow_nodes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_nodes_flow_version_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "mail_flow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_flow_runs"
  ADD CONSTRAINT "mail_flow_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_runs_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "mail_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_runs_flow_version_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "mail_flow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_flow_enrollments"
  ADD CONSTRAINT "mail_flow_enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_enrollments_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "mail_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_enrollments_flow_version_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "mail_flow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_enrollments_flow_run_id_fkey" FOREIGN KEY ("flow_run_id") REFERENCES "mail_flow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "mail_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_flow_action_logs"
  ADD CONSTRAINT "mail_flow_action_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_action_logs_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "mail_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_action_logs_flow_version_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "mail_flow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_action_logs_flow_run_id_fkey" FOREIGN KEY ("flow_run_id") REFERENCES "mail_flow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_action_logs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "mail_flow_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "mail_flow_action_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "mail_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
