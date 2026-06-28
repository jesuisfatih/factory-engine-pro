ALTER TABLE "service_requests" ADD COLUMN "due_at" TIMESTAMP(3);

CREATE INDEX "service_requests_tenant_id_due_at_idx" ON "service_requests"("tenant_id", "due_at");
