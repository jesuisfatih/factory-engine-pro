CREATE TABLE "account_reorder_cart_activities" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cart_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "detail" TEXT,
  "actor_type" TEXT NOT NULL DEFAULT 'customer',
  "actor_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "account_reorder_cart_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_reorder_cart_activities_tenant_id_cart_id_idx" ON "account_reorder_cart_activities"("tenant_id", "cart_id");
CREATE INDEX "account_reorder_cart_activities_tenant_id_customer_id_idx" ON "account_reorder_cart_activities"("tenant_id", "customer_id");
CREATE INDEX "account_reorder_cart_activities_tenant_id_action_idx" ON "account_reorder_cart_activities"("tenant_id", "action");
CREATE INDEX "account_reorder_cart_activities_tenant_id_created_at_idx" ON "account_reorder_cart_activities"("tenant_id", "created_at");

ALTER TABLE "account_reorder_cart_activities"
  ADD CONSTRAINT "account_reorder_cart_activities_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_cart_activities"
  ADD CONSTRAINT "account_reorder_cart_activities_cart_id_fkey"
  FOREIGN KEY ("cart_id") REFERENCES "account_reorder_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_cart_activities"
  ADD CONSTRAINT "account_reorder_cart_activities_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
