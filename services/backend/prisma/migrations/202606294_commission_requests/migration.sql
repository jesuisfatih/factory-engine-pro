CREATE TABLE "commission_requests" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "requester_member_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "order_id" TEXT,
  "product_reference" TEXT NOT NULL,
  "sale_reference" TEXT NOT NULL,
  "percent" DECIMAL(5,2) NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_admin_approval',
  "reviewed_by_member_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commission_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_requests_tenant_id_status_created_at_idx"
  ON "commission_requests"("tenant_id", "status", "created_at");

CREATE INDEX "commission_requests_tenant_id_requester_member_id_created_at_idx"
  ON "commission_requests"("tenant_id", "requester_member_id", "created_at");

CREATE INDEX "commission_requests_tenant_id_customer_id_idx"
  ON "commission_requests"("tenant_id", "customer_id");

CREATE INDEX "commission_requests_tenant_id_order_id_idx"
  ON "commission_requests"("tenant_id", "order_id");

ALTER TABLE "commission_requests"
  ADD CONSTRAINT "commission_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commission_requests"
  ADD CONSTRAINT "commission_requests_requester_member_id_fkey"
  FOREIGN KEY ("requester_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_requests"
  ADD CONSTRAINT "commission_requests_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commission_requests"
  ADD CONSTRAINT "commission_requests_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "commerce_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "commission_requests"
  ADD CONSTRAINT "commission_requests_reviewed_by_member_id_fkey"
  FOREIGN KEY ("reviewed_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
