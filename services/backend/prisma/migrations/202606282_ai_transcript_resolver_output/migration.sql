ALTER TABLE "aircall_call_events"
  ADD COLUMN "resolver_status" TEXT,
  ADD COLUMN "resolver_started_at" TIMESTAMP(3),
  ADD COLUMN "resolver_output" JSONB,
  ADD COLUMN "resolver_error" TEXT,
  ADD COLUMN "resolver_model" TEXT,
  ADD COLUMN "resolver_prompt_key" TEXT,
  ADD COLUMN "resolver_latency_ms" INTEGER,
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "resolved_with_version" INTEGER;

CREATE INDEX "aircall_call_events_resolver_status_idx" ON "aircall_call_events"("resolver_status");
CREATE INDEX "aircall_call_events_resolved_at_idx" ON "aircall_call_events"("resolved_at");
