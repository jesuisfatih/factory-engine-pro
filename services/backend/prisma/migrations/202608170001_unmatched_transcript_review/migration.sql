CREATE TABLE "transcript_review_decisions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "call_event_id" TEXT NOT NULL,
  "evaluation_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "assigned_staff_work_item_id" TEXT,
  "reviewed_by_member_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "human_description" TEXT,
  "dismissal_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transcript_review_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transcript_review_decisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "transcript_review_decisions_tenant_id_call_event_id_key"
  ON "transcript_review_decisions"("tenant_id", "call_event_id");
CREATE INDEX "transcript_review_decisions_tenant_id_status_created_at_idx"
  ON "transcript_review_decisions"("tenant_id", "status", "created_at");
CREATE INDEX "transcript_review_decisions_tenant_id_reviewed_by_member_id_idx"
  ON "transcript_review_decisions"("tenant_id", "reviewed_by_member_id");
