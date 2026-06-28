CREATE TABLE "customer_assignments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "axis" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT NOT NULL DEFAULT 'admin_transfer',
  "reason" TEXT,
  "approved_by_member_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_assignments_axis_check" CHECK ("axis" IN ('sales', 'support', 'account'))
);

CREATE TABLE "customer_assignment_audits" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "axis" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previous_member_id" TEXT,
  "new_member_id" TEXT,
  "actor_member_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'admin_transfer',
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_assignment_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_assignment_audits_axis_check" CHECK ("axis" IN ('sales', 'support', 'account'))
);

CREATE UNIQUE INDEX "customer_assignments_tenant_id_customer_id_axis_key"
  ON "customer_assignments"("tenant_id", "customer_id", "axis");

CREATE INDEX "customer_assignments_tenant_id_member_id_axis_idx"
  ON "customer_assignments"("tenant_id", "member_id", "axis");

CREATE INDEX "customer_assignments_tenant_id_axis_idx"
  ON "customer_assignments"("tenant_id", "axis");

CREATE INDEX "customer_assignment_audits_tenant_id_customer_id_axis_idx"
  ON "customer_assignment_audits"("tenant_id", "customer_id", "axis");

CREATE INDEX "customer_assignment_audits_tenant_id_action_idx"
  ON "customer_assignment_audits"("tenant_id", "action");

CREATE INDEX "customer_assignment_audits_tenant_id_created_at_idx"
  ON "customer_assignment_audits"("tenant_id", "created_at");

ALTER TABLE "customer_assignments"
  ADD CONSTRAINT "customer_assignments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_assignments"
  ADD CONSTRAINT "customer_assignments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_assignments"
  ADD CONSTRAINT "customer_assignments_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_assignments"
  ADD CONSTRAINT "customer_assignments_approved_by_member_id_fkey"
  FOREIGN KEY ("approved_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_assignment_audits"
  ADD CONSTRAINT "customer_assignment_audits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_assignment_audits"
  ADD CONSTRAINT "customer_assignment_audits_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_assignment_audits"
  ADD CONSTRAINT "customer_assignment_audits_previous_member_id_fkey"
  FOREIGN KEY ("previous_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_assignment_audits"
  ADD CONSTRAINT "customer_assignment_audits_new_member_id_fkey"
  FOREIGN KEY ("new_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_assignment_audits"
  ADD CONSTRAINT "customer_assignment_audits_actor_member_id_fkey"
  FOREIGN KEY ("actor_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
