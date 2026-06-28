ALTER TABLE "aircall_call_events"
  ADD COLUMN "transcript_source" TEXT,
  ADD COLUMN "transcript_pulled_at" TIMESTAMP(3),
  ADD COLUMN "resolver_queued_at" TIMESTAMP(3),
  ADD COLUMN "resolver_queue_job_id" TEXT;

CREATE INDEX "aircall_call_events_resolver_queued_at_idx" ON "aircall_call_events"("resolver_queued_at");
