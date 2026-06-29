CREATE TABLE "person_daily_call_orders" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "segment_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "person_daily_call_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "person_daily_call_orders_tenant_id_member_id_segment_id_customer_id_key"
  ON "person_daily_call_orders"("tenant_id", "member_id", "segment_id", "customer_id");

CREATE INDEX "person_daily_call_orders_tenant_id_member_id_segment_id_position_idx"
  ON "person_daily_call_orders"("tenant_id", "member_id", "segment_id", "position");

CREATE INDEX "person_daily_call_orders_tenant_id_customer_id_idx"
  ON "person_daily_call_orders"("tenant_id", "customer_id");

ALTER TABLE "person_daily_call_orders"
  ADD CONSTRAINT "person_daily_call_orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_daily_call_orders"
  ADD CONSTRAINT "person_daily_call_orders_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_daily_call_orders"
  ADD CONSTRAINT "person_daily_call_orders_segment_id_fkey"
  FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_daily_call_orders"
  ADD CONSTRAINT "person_daily_call_orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
