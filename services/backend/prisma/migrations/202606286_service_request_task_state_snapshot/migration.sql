ALTER TABLE "service_requests"
ADD COLUMN "task_state_snapshot" JSONB NOT NULL DEFAULT '{}';
