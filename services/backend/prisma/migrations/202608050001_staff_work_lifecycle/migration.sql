ALTER TABLE "customer_internal_notes"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by_member_id" TEXT;

ALTER TABLE "person_workspace_notes"
  ADD COLUMN "linked_staff_work_item_id" TEXT;

ALTER TABLE "aircall_call_events"
  ADD COLUMN "resolver_input_hash" TEXT,
  ADD COLUMN "resolver_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resolver_input_tokens" INTEGER,
  ADD COLUMN "resolver_output_tokens" INTEGER,
  ADD COLUMN "resolver_cost_micros" INTEGER,
  ADD COLUMN "resolver_repair_attempted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "resolver_failure_kind" TEXT,
  ADD COLUMN "resolver_next_retry_at" TIMESTAMP(3);

ALTER TABLE "calls"
  ADD COLUMN "missed_at" TIMESTAMP(3),
  ADD COLUMN "callback_resolved_at" TIMESTAMP(3),
  ADD COLUMN "reconciliation_status" TEXT,
  ADD COLUMN "ring_group_user_ids" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "staff_work_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "assigned_member_id" TEXT,
  "axis" TEXT NOT NULL,
  "matched_rule_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'workflow',
  "surface" TEXT NOT NULL DEFAULT 'staff',
  "source_call_id" TEXT,
  "source_email_id" TEXT,
  "source_event_id" TEXT,
  "source_occurred_at" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "created_by_actor_id" TEXT,
  "due_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "resolution_code" TEXT,
  "resolution_note" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "condition_trace" JSONB NOT NULL DEFAULT '[]',
  "task_state_snapshot" JSONB NOT NULL DEFAULT '{}',
  "work_state" TEXT NOT NULL DEFAULT 'open',
  "queue_location" TEXT NOT NULL DEFAULT 'follow_up',
  "visible_after" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "archive_reason" TEXT,
  "current_disposition" TEXT,
  "current_outcome_id" TEXT,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_work_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_work_items_axis_check" CHECK ("axis" IN ('sales', 'account')),
  CONSTRAINT "staff_work_items_queue_check" CHECK ("queue_location" IN ('follow_up', 'scheduled', 'archive'))
);

CREATE TABLE "staff_work_participants" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "staff_work_item_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'watcher',
  "source" TEXT NOT NULL DEFAULT 'axis_primary',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_work_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_work_comments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "staff_work_item_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "actor_type" TEXT,
  "body" TEXT NOT NULL,
  "internal" BOOLEAN NOT NULL DEFAULT true,
  "attachments_json" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_work_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_contact_points" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "source_ref" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "is_valid" BOOLEAN NOT NULL DEFAULT true,
  "invalid_reason" TEXT,
  "invalidated_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_contact_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_contact_policies" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "do_not_call" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "set_by_member_id" TEXT,
  "set_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_contact_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_calendars" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'default',
  "timezone" TEXT NOT NULL,
  "weekly_hours" JSONB NOT NULL DEFAULT '{}',
  "holidays" JSONB NOT NULL DEFAULT '[]',
  "repeat_policy" JSONB NOT NULL DEFAULT '{}',
  "is_default" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_calendars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_call_outcomes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "staff_work_item_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "member_id" TEXT NOT NULL,
  "contact_point_id" TEXT,
  "external_call_id" TEXT,
  "provider_result" TEXT,
  "resolver_suggestion" TEXT,
  "disposition" TEXT NOT NULL,
  "note" TEXT,
  "resulting_work_state" TEXT NOT NULL,
  "resulting_queue" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'staff',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_call_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_item_state_transitions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "staff_work_item_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "member_id" TEXT,
  "from_work_state" TEXT,
  "to_work_state" TEXT NOT NULL,
  "from_queue" TEXT,
  "to_queue" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "outcome_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "happened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_item_state_transitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_work_items_tenant_id_idempotency_key_key"
  ON "staff_work_items"("tenant_id", "idempotency_key");
CREATE INDEX "staff_work_items_tenant_id_customer_id_idx" ON "staff_work_items"("tenant_id", "customer_id");
CREATE INDEX "staff_work_items_member_queue_visible_idx" ON "staff_work_items"("tenant_id", "assigned_member_id", "queue_location", "visible_after");
CREATE INDEX "staff_work_items_member_archived_idx" ON "staff_work_items"("tenant_id", "assigned_member_id", "archived_at");
CREATE INDEX "staff_work_items_tenant_id_axis_idx" ON "staff_work_items"("tenant_id", "axis");
CREATE INDEX "staff_work_items_tenant_id_matched_rule_id_idx" ON "staff_work_items"("tenant_id", "matched_rule_id");
CREATE INDEX "staff_work_items_tenant_id_status_idx" ON "staff_work_items"("tenant_id", "status");
CREATE INDEX "staff_work_items_tenant_id_due_at_idx" ON "staff_work_items"("tenant_id", "due_at");
CREATE INDEX "staff_work_items_disposition_idx" ON "staff_work_items"("tenant_id", "current_disposition");
CREATE INDEX "staff_work_items_source_call_idx" ON "staff_work_items"("tenant_id", "source_call_id");
CREATE INDEX "staff_work_items_member_source_occurred_idx"
  ON "staff_work_items"("tenant_id", "assigned_member_id", "source_occurred_at");

CREATE UNIQUE INDEX "staff_work_participants_tenant_item_member_role_key"
  ON "staff_work_participants"("tenant_id", "staff_work_item_id", "member_id", "role");
CREATE INDEX "staff_work_participants_item_idx" ON "staff_work_participants"("tenant_id", "staff_work_item_id");
CREATE INDEX "staff_work_participants_member_idx" ON "staff_work_participants"("tenant_id", "member_id");
CREATE INDEX "staff_work_comments_item_idx" ON "staff_work_comments"("tenant_id", "staff_work_item_id");
CREATE INDEX "staff_work_comments_actor_idx" ON "staff_work_comments"("tenant_id", "actor_id");

CREATE UNIQUE INDEX "customer_contact_points_tenant_customer_type_value_source_key"
  ON "customer_contact_points"("tenant_id", "customer_id", "type", "normalized_value", "source");
CREATE INDEX "customer_contact_points_customer_lookup_idx"
  ON "customer_contact_points"("tenant_id", "customer_id", "type", "is_valid", "priority");
CREATE INDEX "customer_contact_points_value_lookup_idx"
  ON "customer_contact_points"("tenant_id", "normalized_value", "type");
CREATE UNIQUE INDEX "customer_contact_policies_tenant_customer_key"
  ON "customer_contact_policies"("tenant_id", "customer_id");
CREATE INDEX "customer_contact_policies_dnc_idx"
  ON "customer_contact_policies"("tenant_id", "do_not_call", "updated_at");
CREATE UNIQUE INDEX "business_calendars_tenant_name_key"
  ON "business_calendars"("tenant_id", "name");
CREATE INDEX "business_calendars_default_idx"
  ON "business_calendars"("tenant_id", "is_default");
CREATE INDEX "customer_call_outcomes_item_idx"
  ON "customer_call_outcomes"("tenant_id", "staff_work_item_id", "selected_at");
CREATE INDEX "customer_call_outcomes_customer_idx"
  ON "customer_call_outcomes"("tenant_id", "customer_id", "selected_at");
CREATE INDEX "customer_call_outcomes_member_idx"
  ON "customer_call_outcomes"("tenant_id", "member_id", "disposition", "selected_at");
CREATE INDEX "customer_call_outcomes_external_call_idx"
  ON "customer_call_outcomes"("tenant_id", "external_call_id");
CREATE UNIQUE INDEX "customer_call_outcomes_tenant_member_idempotency_key"
  ON "customer_call_outcomes"("tenant_id", "member_id", "idempotency_key");
CREATE INDEX "work_item_state_transitions_item_idx"
  ON "work_item_state_transitions"("tenant_id", "staff_work_item_id", "happened_at");
CREATE INDEX "work_item_state_transitions_member_idx"
  ON "work_item_state_transitions"("tenant_id", "member_id", "happened_at");
CREATE INDEX "work_item_state_transitions_queue_idx"
  ON "work_item_state_transitions"("tenant_id", "to_queue", "happened_at");
CREATE INDEX "customer_internal_notes_customer_deleted_idx"
  ON "customer_internal_notes"("tenant_id", "customer_id", "deleted_at");
CREATE INDEX "person_workspace_notes_staff_work_item_idx"
  ON "person_workspace_notes"("tenant_id", "linked_staff_work_item_id");
CREATE INDEX "aircall_call_events_input_version_idx"
  ON "aircall_call_events"("tenant_id", "resolver_input_hash", "resolved_with_version");
CREATE INDEX "aircall_call_events_failure_retry_idx"
  ON "aircall_call_events"("tenant_id", "resolver_failure_kind", "resolver_next_retry_at");
CREATE INDEX "calls_missed_callback_idx" ON "calls"("tenant_id", "missed_at", "callback_resolved_at");
CREATE INDEX "calls_reconciliation_idx" ON "calls"("tenant_id", "reconciliation_status", "updated_at");

ALTER TABLE "staff_work_items"
  ADD CONSTRAINT "staff_work_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_work_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_work_items_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff_work_participants"
  ADD CONSTRAINT "staff_work_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_work_participants_staff_work_item_id_fkey" FOREIGN KEY ("staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_work_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_work_comments"
  ADD CONSTRAINT "staff_work_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_work_comments_staff_work_item_id_fkey" FOREIGN KEY ("staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_work_comments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_contact_points"
  ADD CONSTRAINT "customer_contact_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_contact_points_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_contact_policies"
  ADD CONSTRAINT "customer_contact_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_contact_policies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_contact_policies_set_by_member_id_fkey" FOREIGN KEY ("set_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_calendars"
  ADD CONSTRAINT "business_calendars_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_call_outcomes"
  ADD CONSTRAINT "customer_call_outcomes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_call_outcomes_staff_work_item_id_fkey" FOREIGN KEY ("staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_call_outcomes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_call_outcomes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_call_outcomes_contact_point_id_fkey" FOREIGN KEY ("contact_point_id") REFERENCES "customer_contact_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_item_state_transitions"
  ADD CONSTRAINT "work_item_state_transitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_item_state_transitions_staff_work_item_id_fkey" FOREIGN KEY ("staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_item_state_transitions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "work_item_state_transitions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "person_workspace_notes"
  ADD CONSTRAINT "person_workspace_notes_linked_staff_work_item_id_fkey" FOREIGN KEY ("linked_staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve every valid operational staff task with its original public id.
INSERT INTO "staff_work_items" (
  "id", "tenant_id", "customer_id", "assigned_member_id", "axis", "matched_rule_id",
  "source", "surface", "source_call_id", "source_email_id", "source_occurred_at", "title", "description",
  "status", "priority", "created_by_actor_id", "due_at", "closed_at", "resolution_code",
  "resolution_note", "metadata", "condition_trace", "task_state_snapshot", "work_state",
  "queue_location", "visible_after", "archived_at", "archive_reason", "idempotency_key",
  "created_at", "updated_at"
)
SELECT
  request."id", request."tenant_id", request."customer_id", request."assigned_member_id",
  CASE WHEN request."axis" = 'account' THEN 'account' ELSE 'sales' END,
  request."matched_rule_id", request."source", request."surface", request."source_call_id",
  request."source_email_id",
  COALESCE(
    (
      SELECT call_event."event_timestamp"
      FROM "aircall_call_events" call_event
      WHERE call_event."tenant_id" = request."tenant_id"
        AND (
          call_event."id" = request."source_call_id"
          OR call_event."external_call_id" = request."source_call_id"
        )
      ORDER BY call_event."event_timestamp" DESC
      LIMIT 1
    ),
    request."created_at"
  ),
  request."title", request."description", request."status",
  request."priority", request."created_by_actor_id", request."due_at", request."closed_at",
  request."resolution_code", request."resolution_note", request."metadata", request."condition_trace",
  request."task_state_snapshot",
  CASE
    WHEN request."status" IN ('closed', 'resolved', 'transferred') THEN 'completed'
    WHEN request."status" IN ('in_progress', 'waiting') THEN request."status"
    ELSE 'open'
  END,
  CASE
    WHEN request."status" IN ('closed', 'resolved', 'transferred') THEN 'archive'
    WHEN request."metadata" ? 'personArchivedBy' THEN 'archive'
    WHEN request."source" NOT IN ('manual', 'customer_self_service', 'admin_created') AND request."created_at" < NOW() - INTERVAL '7 days' THEN 'archive'
    WHEN request."due_at" IS NOT NULL AND request."due_at" > NOW() THEN 'scheduled'
    ELSE 'follow_up'
  END,
  CASE WHEN request."due_at" IS NOT NULL AND request."due_at" > NOW() THEN request."due_at" ELSE NULL END,
  CASE
    WHEN request."status" IN ('closed', 'resolved', 'transferred') THEN COALESCE(request."closed_at", request."updated_at")
    WHEN request."metadata" ? 'personArchivedBy' THEN request."updated_at"
    WHEN request."source" NOT IN ('manual', 'customer_self_service', 'admin_created') AND request."created_at" < NOW() - INTERVAL '7 days' THEN request."created_at" + INTERVAL '7 days'
    ELSE NULL
  END,
  CASE
    WHEN request."status" IN ('closed', 'resolved', 'transferred') THEN 'completed'
    WHEN request."metadata" ? 'personArchivedBy' THEN 'legacy_person_archive'
    WHEN request."source" NOT IN ('manual', 'customer_self_service', 'admin_created') AND request."created_at" < NOW() - INTERVAL '7 days' THEN 'age_window'
    ELSE NULL
  END,
  'legacy:' || request."id", request."created_at", request."updated_at"
FROM "service_requests" request
WHERE request."axis" IN ('sales', 'account')
  AND (
    request."source" NOT IN ('manual', 'customer_self_service', 'admin_created')
    OR request."matched_rule_id" IS NOT NULL
    OR request."metadata"->'workflow'->>'action' = 'create_task'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "staff_work_comments" (
  "id", "tenant_id", "staff_work_item_id", "actor_id", "actor_type", "body", "internal", "attachments_json", "created_at"
)
SELECT comment."id", comment."tenant_id", comment."service_request_id", comment."actor_id", comment."actor_type",
  comment."body", comment."internal", comment."attachments_json", comment."created_at"
FROM "service_request_comments" comment
JOIN "staff_work_items" item ON item."id" = comment."service_request_id" AND item."tenant_id" = comment."tenant_id"
ON CONFLICT DO NOTHING;

INSERT INTO "staff_work_participants" (
  "id", "tenant_id", "staff_work_item_id", "member_id", "role", "source", "created_at"
)
SELECT participant."id", participant."tenant_id", participant."service_request_id", participant."member_id",
  participant."role", participant."source", participant."created_at"
FROM "task_participants" participant
JOIN "staff_work_items" item ON item."id" = participant."service_request_id" AND item."tenant_id" = participant."tenant_id"
ON CONFLICT DO NOTHING;

UPDATE "person_workspace_notes" note
SET "linked_staff_work_item_id" = note."linked_service_request_id", "linked_service_request_id" = NULL
WHERE EXISTS (
  SELECT 1 FROM "staff_work_items" item
  WHERE item."id" = note."linked_service_request_id" AND item."tenant_id" = note."tenant_id"
);

ALTER TABLE "person_daily_task_orders" DROP CONSTRAINT "person_daily_task_orders_service_request_id_fkey";
DROP INDEX "person_daily_task_orders_tenant_id_member_id_work_date_service_request_id_key";
DROP INDEX "person_daily_task_orders_tenant_id_service_request_id_idx";
DELETE FROM "person_daily_task_orders" ordering
WHERE NOT EXISTS (
  SELECT 1 FROM "staff_work_items" item
  WHERE item."id" = ordering."service_request_id" AND item."tenant_id" = ordering."tenant_id"
);
ALTER TABLE "person_daily_task_orders" RENAME COLUMN "service_request_id" TO "staff_work_item_id";
CREATE UNIQUE INDEX "person_daily_task_orders_tenant_id_member_id_work_date_staff_work_item_id_key"
  ON "person_daily_task_orders"("tenant_id", "member_id", "work_date", "staff_work_item_id");
CREATE INDEX "person_daily_task_orders_tenant_id_staff_work_item_id_idx"
  ON "person_daily_task_orders"("tenant_id", "staff_work_item_id");
ALTER TABLE "person_daily_task_orders"
  ADD CONSTRAINT "person_daily_task_orders_staff_work_item_id_fkey" FOREIGN KEY ("staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_scheduled_actions" DROP CONSTRAINT "workflow_scheduled_actions_executed_service_request_id_fkey";
DROP INDEX "workflow_scheduled_actions_tenant_id_executed_service_request_id_idx";
UPDATE "workflow_scheduled_actions" action
SET "executed_service_request_id" = NULL
WHERE action."executed_service_request_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "staff_work_items" item WHERE item."id" = action."executed_service_request_id");
ALTER TABLE "workflow_scheduled_actions" RENAME COLUMN "executed_service_request_id" TO "executed_staff_work_item_id";
CREATE INDEX "workflow_scheduled_actions_tenant_id_executed_staff_work_item_id_idx"
  ON "workflow_scheduled_actions"("tenant_id", "executed_staff_work_item_id");
ALTER TABLE "workflow_scheduled_actions"
  ADD CONSTRAINT "workflow_scheduled_actions_executed_staff_work_item_id_fkey" FOREIGN KEY ("executed_staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DELETE FROM "task_participants" participant
WHERE EXISTS (SELECT 1 FROM "staff_work_items" item WHERE item."id" = participant."service_request_id");
DELETE FROM "service_request_comments" comment
WHERE EXISTS (SELECT 1 FROM "staff_work_items" item WHERE item."id" = comment."service_request_id");
DELETE FROM "service_requests" request
WHERE request."source" NOT IN ('manual', 'customer_self_service', 'admin_created')
   OR request."matched_rule_id" IS NOT NULL
   OR request."metadata"->'workflow'->>'action' = 'create_task';

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_source_check" CHECK ("source" IN ('manual', 'customer_self_service', 'admin_created'));

UPDATE "aircall_call_events"
SET
  "resolver_status" = 'degraded',
  "resolver_error" = 'Legacy local resolver output was retired. Explicit bounded model reprocessing is required.',
  "resolver_output" = NULL,
  "resolver_model" = NULL,
  "resolver_prompt_key" = 'ai.transcript-resolver',
  "resolver_failure_kind" = 'legacy_local_fallback',
  "resolved_at" = NULL,
  "resolved_with_version" = NULL
WHERE "resolver_model" = 'local-rule-fallback';

INSERT INTO "business_calendars" (
  "id", "tenant_id", "name", "timezone", "weekly_hours", "holidays", "repeat_policy", "is_default"
)
SELECT
  'bcal_' || substr(md5(tenant."id" || ':default'), 1, 24),
  tenant."id",
  'default',
  COALESCE(NULLIF(config."company_profile"->>'timezone', ''), 'America/New_York'),
  '{"monday":["09:00","17:00"],"tuesday":["09:00","17:00"],"wednesday":["09:00","17:00"],"thursday":["09:00","17:00"],"friday":["09:00","17:00"]}'::jsonb,
  '[]'::jsonb,
  '{"maxCalls":2,"windowDays":5,"defaultFollowUpBusinessDays":4,"completionReappearanceDays":15}'::jsonb,
  true
FROM "tenants" tenant
LEFT JOIN "tenant_configs" config ON config."tenant_id" = tenant."id"
ON CONFLICT ("tenant_id", "name") DO NOTHING;
