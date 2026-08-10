ALTER TABLE "staff_work_items"
  ADD COLUMN "operational_intent" TEXT,
  ADD COLUMN "contact_identity_key" TEXT,
  ADD COLUMN "occurrence_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "first_signal_at" TIMESTAMP(3),
  ADD COLUMN "last_signal_at" TIMESTAMP(3);

CREATE TABLE "staff_work_occurrences" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "staff_work_item_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "operational_intent" TEXT NOT NULL,
  "contact_identity_key" TEXT,
  "source_call_id" TEXT,
  "source_event_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_work_occurrences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "staff_work_occurrences"
  ADD CONSTRAINT "staff_work_occurrences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_work_occurrences"
  ADD CONSTRAINT "staff_work_occurrences_staff_work_item_id_fkey"
  FOREIGN KEY ("staff_work_item_id") REFERENCES "staff_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_work_occurrences"
  ADD CONSTRAINT "staff_work_occurrences_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "staff_work_occurrences_tenant_id_source_event_id_key"
  ON "staff_work_occurrences"("tenant_id", "source_event_id");
CREATE INDEX "staff_work_occurrences_tenant_id_staff_work_item_id_occurred_at_idx"
  ON "staff_work_occurrences"("tenant_id", "staff_work_item_id", "occurred_at");
CREATE INDEX "staff_work_occurrences_tenant_id_customer_id_operational_intent_occurred_at_idx"
  ON "staff_work_occurrences"("tenant_id", "customer_id", "operational_intent", "occurred_at");
CREATE INDEX "staff_work_occurrences_tenant_id_contact_identity_key_operational_intent_occurred_at_idx"
  ON "staff_work_occurrences"("tenant_id", "contact_identity_key", "operational_intent", "occurred_at");

UPDATE "staff_work_items"
SET
  "operational_intent" = NULLIF("metadata" #>> '{workflow,params,operationalIntent}', ''),
  "contact_identity_key" = CASE
    WHEN "customer_id" IS NOT NULL THEN 'customer:' || "customer_id"
    WHEN NULLIF("metadata" #>> '{workflow,params,contactPhoneE164}', '') IS NOT NULL
      THEN 'phone:+' || regexp_replace("metadata" #>> '{workflow,params,contactPhoneE164}', '[^0-9]', '', 'g')
    WHEN NULLIF("metadata" #>> '{workflow,params,customerPhone}', '') IS NOT NULL
      THEN 'phone:+' || regexp_replace("metadata" #>> '{workflow,params,customerPhone}', '[^0-9]', '', 'g')
    WHEN NULLIF("metadata" #>> '{workflow,params,contactEmail}', '') IS NOT NULL
      THEN 'email:' || lower(trim("metadata" #>> '{workflow,params,contactEmail}'))
    WHEN NULLIF("metadata" #>> '{workflow,params,customerEmail}', '') IS NOT NULL
      THEN 'email:' || lower(trim("metadata" #>> '{workflow,params,customerEmail}'))
    ELSE NULL
  END,
  "occurrence_count" = CASE
    WHEN NULLIF("metadata" #>> '{workflow,params,operationalIntent}', '') IS NULL THEN 0
    ELSE 1
  END,
  "first_signal_at" = CASE
    WHEN NULLIF("metadata" #>> '{workflow,params,operationalIntent}', '') IS NULL THEN NULL
    ELSE COALESCE("source_occurred_at", "created_at")
  END,
  "last_signal_at" = CASE
    WHEN NULLIF("metadata" #>> '{workflow,params,operationalIntent}', '') IS NULL THEN NULL
    ELSE COALESCE("source_occurred_at", "created_at")
  END
WHERE "source" = 'transcript_workflow';

UPDATE "staff_work_items"
SET "contact_identity_key" = regexp_replace("contact_identity_key", '^phone:\\+', 'phone:+1')
WHERE "contact_identity_key" ~ '^phone:\\+[0-9]{10}$';

CREATE TEMP TABLE "staff_work_lifecycle_merge" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "tenant_id", COALESCE('customer:' || "customer_id", "contact_identity_key"), "operational_intent"
      ORDER BY COALESCE("source_occurred_at", "updated_at", "created_at") DESC, "id" DESC
    ) AS "winner_id",
    row_number() OVER (
      PARTITION BY "tenant_id", COALESCE('customer:' || "customer_id", "contact_identity_key"), "operational_intent"
      ORDER BY COALESCE("source_occurred_at", "updated_at", "created_at") DESC, "id" DESC
    ) AS "rank"
  FROM "staff_work_items"
  WHERE "source" = 'transcript_workflow'
    AND "operational_intent" IS NOT NULL
    AND COALESCE('customer:' || "customer_id", "contact_identity_key") IS NOT NULL
    AND "status" NOT IN ('closed', 'resolved', 'transferred')
)
SELECT "id" AS "loser_id", "winner_id"
FROM ranked
WHERE "rank" > 1;

INSERT INTO "staff_work_participants" (
  "id", "tenant_id", "staff_work_item_id", "member_id", "role", "source", "created_at"
)
SELECT
  'swp_' || md5(participant."tenant_id" || ':' || merge."winner_id" || ':' || participant."member_id" || ':' || participant."role"),
  participant."tenant_id",
  merge."winner_id",
  participant."member_id",
  participant."role",
  participant."source",
  participant."created_at"
FROM "staff_work_participants" AS participant
JOIN "staff_work_lifecycle_merge" AS merge ON merge."loser_id" = participant."staff_work_item_id"
ON CONFLICT ("tenant_id", "staff_work_item_id", "member_id", "role") DO NOTHING;

UPDATE "staff_work_comments" AS comment
SET "staff_work_item_id" = merge."winner_id"
FROM "staff_work_lifecycle_merge" AS merge
WHERE comment."staff_work_item_id" = merge."loser_id";

UPDATE "customer_call_outcomes" AS outcome
SET "staff_work_item_id" = merge."winner_id"
FROM "staff_work_lifecycle_merge" AS merge
WHERE outcome."staff_work_item_id" = merge."loser_id";

UPDATE "work_item_state_transitions" AS transition
SET "staff_work_item_id" = merge."winner_id"
FROM "staff_work_lifecycle_merge" AS merge
WHERE transition."staff_work_item_id" = merge."loser_id";

UPDATE "person_workspace_notes" AS note
SET "linked_staff_work_item_id" = merge."winner_id"
FROM "staff_work_lifecycle_merge" AS merge
WHERE note."linked_staff_work_item_id" = merge."loser_id";

UPDATE "workflow_scheduled_actions" AS scheduled
SET "executed_staff_work_item_id" = merge."winner_id"
FROM "staff_work_lifecycle_merge" AS merge
WHERE scheduled."executed_staff_work_item_id" = merge."loser_id";

DELETE FROM "person_daily_task_orders" AS task_order
USING "staff_work_lifecycle_merge" AS merge
WHERE task_order."staff_work_item_id" = merge."loser_id";

DELETE FROM "staff_work_participants" AS participant
USING "staff_work_lifecycle_merge" AS merge
WHERE participant."staff_work_item_id" = merge."loser_id";

UPDATE "staff_work_items" AS item
SET
  "status" = 'closed',
  "work_state" = 'completed',
  "queue_location" = 'archive',
  "closed_at" = COALESCE(item."closed_at", CURRENT_TIMESTAMP),
  "archived_at" = COALESCE(item."archived_at", CURRENT_TIMESTAMP),
  "archive_reason" = 'lifecycle_merged',
  "resolution_code" = 'lifecycle_merged',
  "resolution_note" = 'Merged into the active customer and operational-intent lifecycle.',
  "metadata" = item."metadata" || jsonb_build_object('lifecycleMergedInto', merge."winner_id")
FROM "staff_work_lifecycle_merge" AS merge
WHERE item."id" = merge."loser_id";

INSERT INTO "staff_work_occurrences" (
  "id",
  "tenant_id",
  "staff_work_item_id",
  "customer_id",
  "operational_intent",
  "contact_identity_key",
  "source_call_id",
  "source_event_id",
  "occurred_at",
  "metadata"
)
SELECT
  'swo_' || md5(item."tenant_id" || ':' || item."source_event_id"),
  item."tenant_id",
  COALESCE(merge."winner_id", item."id"),
  item."customer_id",
  item."operational_intent",
  item."contact_identity_key",
  item."source_call_id",
  item."source_event_id",
  COALESCE(item."source_occurred_at", item."created_at"),
  jsonb_build_object('backfilled', true, 'originalStaffWorkItemId', item."id")
FROM "staff_work_items" AS item
LEFT JOIN "staff_work_lifecycle_merge" AS merge ON merge."loser_id" = item."id"
WHERE item."source" = 'transcript_workflow'
  AND item."operational_intent" IS NOT NULL
  AND item."source_event_id" IS NOT NULL
ON CONFLICT ("tenant_id", "source_event_id") DO NOTHING;

UPDATE "staff_work_items" AS item
SET
  "occurrence_count" = counts."occurrence_count",
  "first_signal_at" = counts."first_signal_at",
  "last_signal_at" = counts."last_signal_at"
FROM (
  SELECT
    "staff_work_item_id",
    count(*)::INTEGER AS "occurrence_count",
    min("occurred_at") AS "first_signal_at",
    max("occurred_at") AS "last_signal_at"
  FROM "staff_work_occurrences"
  GROUP BY "staff_work_item_id"
) AS counts
WHERE item."id" = counts."staff_work_item_id";

CREATE INDEX "staff_work_items_tenant_id_customer_id_operational_intent_status_idx"
  ON "staff_work_items"("tenant_id", "customer_id", "operational_intent", "status");
CREATE INDEX "staff_work_items_tenant_id_contact_identity_key_operational_intent_status_idx"
  ON "staff_work_items"("tenant_id", "contact_identity_key", "operational_intent", "status");

CREATE UNIQUE INDEX "staff_work_items_active_customer_intent_key"
  ON "staff_work_items"("tenant_id", "customer_id", "operational_intent")
  WHERE "customer_id" IS NOT NULL
    AND "operational_intent" IS NOT NULL
    AND "status" NOT IN ('closed', 'resolved', 'transferred');

CREATE UNIQUE INDEX "staff_work_items_active_contact_intent_key"
  ON "staff_work_items"("tenant_id", "contact_identity_key", "operational_intent")
  WHERE "customer_id" IS NULL
    AND "contact_identity_key" IS NOT NULL
    AND "operational_intent" IS NOT NULL
    AND "status" NOT IN ('closed', 'resolved', 'transferred');
