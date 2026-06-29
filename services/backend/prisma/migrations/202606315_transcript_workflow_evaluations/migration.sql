CREATE TABLE "transcript_workflow_evaluations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "call_event_id" TEXT NOT NULL,
    "external_call_id" TEXT,
    "event_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "action_required" BOOLEAN NOT NULL DEFAULT false,
    "recommended_axis" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "evaluated_rules" INTEGER NOT NULL DEFAULT 0,
    "matched_rules" INTEGER NOT NULL DEFAULT 0,
    "tasks_created" INTEGER NOT NULL DEFAULT 0,
    "task_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'transcript-operational-signal',
    "resolver_version" INTEGER,
    "resolver_model" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_workflow_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transcript_workflow_evaluations_tenant_id_call_event_id_signal_key"
    ON "transcript_workflow_evaluations"("tenant_id", "call_event_id", "signal");

CREATE INDEX "transcript_workflow_evaluations_tenant_id_call_event_id_idx"
    ON "transcript_workflow_evaluations"("tenant_id", "call_event_id");

CREATE INDEX "transcript_workflow_evaluations_tenant_id_signal_idx"
    ON "transcript_workflow_evaluations"("tenant_id", "signal");

CREATE INDEX "transcript_workflow_evaluations_tenant_id_status_idx"
    ON "transcript_workflow_evaluations"("tenant_id", "status");

CREATE INDEX "transcript_workflow_evaluations_tenant_id_created_at_idx"
    ON "transcript_workflow_evaluations"("tenant_id", "created_at");

ALTER TABLE "transcript_workflow_evaluations"
    ADD CONSTRAINT "transcript_workflow_evaluations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
