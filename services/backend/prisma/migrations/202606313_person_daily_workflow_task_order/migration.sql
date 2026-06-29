CREATE TABLE "person_daily_task_orders" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "service_request_id" TEXT NOT NULL,
  "work_date" DATE NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "person_daily_task_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "person_daily_task_orders_tenant_id_member_id_work_date_service_request_id_key"
  ON "person_daily_task_orders"("tenant_id", "member_id", "work_date", "service_request_id");

CREATE INDEX "person_daily_task_orders_tenant_id_member_id_work_date_position_idx"
  ON "person_daily_task_orders"("tenant_id", "member_id", "work_date", "position");

CREATE INDEX "person_daily_task_orders_tenant_id_service_request_id_idx"
  ON "person_daily_task_orders"("tenant_id", "service_request_id");

ALTER TABLE "person_daily_task_orders"
  ADD CONSTRAINT "person_daily_task_orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_daily_task_orders"
  ADD CONSTRAINT "person_daily_task_orders_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_daily_task_orders"
  ADD CONSTRAINT "person_daily_task_orders_service_request_id_fkey"
  FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
