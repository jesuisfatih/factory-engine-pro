ALTER TABLE "staff_work_items"
  ADD COLUMN IF NOT EXISTS "contact_identity_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "staff_work_items" AS item
SET "contact_identity_aliases" = ARRAY(
  SELECT DISTINCT alias_values.alias
  FROM unnest(ARRAY[
    item."contact_identity_key",
    CASE
      WHEN NULLIF(regexp_replace(item."metadata" #>> '{workflow,params,contactPhoneE164}', '[^0-9]', '', 'g'), '') IS NULL THEN NULL
      WHEN length(regexp_replace(item."metadata" #>> '{workflow,params,contactPhoneE164}', '[^0-9]', '', 'g')) = 10
        THEN 'phone:+1' || regexp_replace(item."metadata" #>> '{workflow,params,contactPhoneE164}', '[^0-9]', '', 'g')
      ELSE 'phone:+' || regexp_replace(item."metadata" #>> '{workflow,params,contactPhoneE164}', '[^0-9]', '', 'g')
    END,
    CASE
      WHEN NULLIF(regexp_replace(item."metadata" #>> '{workflow,params,customerPhone}', '[^0-9]', '', 'g'), '') IS NULL THEN NULL
      WHEN length(regexp_replace(item."metadata" #>> '{workflow,params,customerPhone}', '[^0-9]', '', 'g')) = 10
        THEN 'phone:+1' || regexp_replace(item."metadata" #>> '{workflow,params,customerPhone}', '[^0-9]', '', 'g')
      ELSE 'phone:+' || regexp_replace(item."metadata" #>> '{workflow,params,customerPhone}', '[^0-9]', '', 'g')
    END,
    CASE
      WHEN NULLIF(trim(item."metadata" #>> '{workflow,params,contactEmail}'), '') IS NULL THEN NULL
      ELSE 'email:' || lower(trim(item."metadata" #>> '{workflow,params,contactEmail}'))
    END,
    CASE
      WHEN NULLIF(trim(item."metadata" #>> '{workflow,params,customerEmail}'), '') IS NULL THEN NULL
      ELSE 'email:' || lower(trim(item."metadata" #>> '{workflow,params,customerEmail}'))
    END
  ]::TEXT[]) AS alias_values(alias)
  WHERE alias_values.alias IS NOT NULL AND alias_values.alias <> ''
);

UPDATE "staff_work_items" AS item
SET "contact_identity_aliases" = ARRAY(
  SELECT DISTINCT alias_values.alias
  FROM unnest(item."contact_identity_aliases" || ARRAY[
    CASE
      WHEN NULLIF(regexp_replace(customer."phone", '[^0-9]', '', 'g'), '') IS NULL THEN NULL
      WHEN length(regexp_replace(customer."phone", '[^0-9]', '', 'g')) = 10
        THEN 'phone:+1' || regexp_replace(customer."phone", '[^0-9]', '', 'g')
      ELSE 'phone:+' || regexp_replace(customer."phone", '[^0-9]', '', 'g')
    END,
    CASE
      WHEN NULLIF(trim(customer."email"), '') IS NULL THEN NULL
      ELSE 'email:' || lower(trim(customer."email"))
    END
  ]::TEXT[]) AS alias_values(alias)
  WHERE alias_values.alias IS NOT NULL AND alias_values.alias <> ''
)
FROM "customers" AS customer
WHERE customer."id" = item."customer_id"
  AND customer."tenant_id" = item."tenant_id";

CREATE INDEX IF NOT EXISTS "staff_work_items_contact_identity_aliases_idx"
  ON "staff_work_items" USING GIN ("contact_identity_aliases");

CREATE TEMP TABLE "staff_work_resolved_identity_merge" ON COMMIT DROP AS
SELECT
  provisional."id" AS "loser_id",
  resolved."id" AS "winner_id"
FROM "staff_work_items" AS provisional
CROSS JOIN LATERAL (
  SELECT candidate."id"
  FROM "staff_work_items" AS candidate
  WHERE candidate."tenant_id" = provisional."tenant_id"
    AND candidate."customer_id" IS NOT NULL
    AND candidate."operational_intent" = provisional."operational_intent"
    AND candidate."status" NOT IN ('closed', 'resolved', 'transferred')
    AND candidate."contact_identity_aliases" && provisional."contact_identity_aliases"
  ORDER BY COALESCE(candidate."last_signal_at", candidate."updated_at", candidate."created_at") DESC, candidate."id" DESC
  LIMIT 1
) AS resolved
WHERE provisional."customer_id" IS NULL
  AND provisional."operational_intent" IS NOT NULL
  AND provisional."status" NOT IN ('closed', 'resolved', 'transferred')
  AND cardinality(provisional."contact_identity_aliases") > 0;

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
JOIN "staff_work_resolved_identity_merge" AS merge ON merge."loser_id" = participant."staff_work_item_id"
ON CONFLICT ("tenant_id", "staff_work_item_id", "member_id", "role") DO NOTHING;

UPDATE "staff_work_occurrences" AS occurrence
SET
  "staff_work_item_id" = merge."winner_id",
  "customer_id" = winner."customer_id"
FROM "staff_work_resolved_identity_merge" AS merge
JOIN "staff_work_items" AS winner ON winner."id" = merge."winner_id"
WHERE occurrence."staff_work_item_id" = merge."loser_id";

UPDATE "staff_work_comments" AS comment
SET "staff_work_item_id" = merge."winner_id"
FROM "staff_work_resolved_identity_merge" AS merge
WHERE comment."staff_work_item_id" = merge."loser_id";

UPDATE "customer_call_outcomes" AS outcome
SET
  "staff_work_item_id" = merge."winner_id",
  "customer_id" = winner."customer_id"
FROM "staff_work_resolved_identity_merge" AS merge
JOIN "staff_work_items" AS winner ON winner."id" = merge."winner_id"
WHERE outcome."staff_work_item_id" = merge."loser_id";

UPDATE "work_item_state_transitions" AS transition
SET
  "staff_work_item_id" = merge."winner_id",
  "customer_id" = winner."customer_id"
FROM "staff_work_resolved_identity_merge" AS merge
JOIN "staff_work_items" AS winner ON winner."id" = merge."winner_id"
WHERE transition."staff_work_item_id" = merge."loser_id";

UPDATE "person_workspace_notes" AS note
SET
  "linked_staff_work_item_id" = merge."winner_id",
  "linked_customer_id" = winner."customer_id"
FROM "staff_work_resolved_identity_merge" AS merge
JOIN "staff_work_items" AS winner ON winner."id" = merge."winner_id"
WHERE note."linked_staff_work_item_id" = merge."loser_id";

UPDATE "workflow_scheduled_actions" AS scheduled
SET
  "executed_staff_work_item_id" = merge."winner_id",
  "customer_id" = winner."customer_id"
FROM "staff_work_resolved_identity_merge" AS merge
JOIN "staff_work_items" AS winner ON winner."id" = merge."winner_id"
WHERE scheduled."executed_staff_work_item_id" = merge."loser_id";

INSERT INTO "person_workspace_pins" (
  "id", "tenant_id", "member_id", "target_kind", "target_id", "created_at", "updated_at"
)
SELECT
  'pwp_' || md5(pin."tenant_id" || ':' || pin."member_id" || ':staff_work_item:' || merge."winner_id"),
  pin."tenant_id",
  pin."member_id",
  'staff_work_item',
  merge."winner_id",
  pin."created_at",
  pin."updated_at"
FROM "person_workspace_pins" AS pin
JOIN "staff_work_resolved_identity_merge" AS merge ON merge."loser_id" = pin."target_id"
WHERE pin."target_kind" = 'staff_work_item'
ON CONFLICT ("tenant_id", "member_id", "target_kind", "target_id") DO NOTHING;

DELETE FROM "person_workspace_pins" AS pin
USING "staff_work_resolved_identity_merge" AS merge
WHERE pin."target_kind" = 'staff_work_item'
  AND pin."target_id" = merge."loser_id";

DELETE FROM "person_daily_task_orders" AS ordering
USING "staff_work_resolved_identity_merge" AS merge
WHERE ordering."staff_work_item_id" = merge."loser_id";

UPDATE "staff_work_items" AS winner
SET "contact_identity_aliases" = ARRAY(
  SELECT DISTINCT alias_values.alias
  FROM unnest(winner."contact_identity_aliases" || merged."aliases") AS alias_values(alias)
  WHERE alias_values.alias IS NOT NULL AND alias_values.alias <> ''
)
FROM (
  SELECT
    merge."winner_id",
    array_agg(DISTINCT alias_values.alias) AS "aliases"
  FROM "staff_work_resolved_identity_merge" AS merge
  JOIN "staff_work_items" AS loser ON loser."id" = merge."loser_id"
  CROSS JOIN LATERAL unnest(loser."contact_identity_aliases") AS alias_values(alias)
  GROUP BY merge."winner_id"
) AS merged
WHERE winner."id" = merged."winner_id";

UPDATE "staff_work_items" AS item
SET
  "status" = 'closed',
  "work_state" = 'completed',
  "queue_location" = 'archive',
  "closed_at" = COALESCE(item."closed_at", CURRENT_TIMESTAMP),
  "archived_at" = COALESCE(item."archived_at", CURRENT_TIMESTAMP),
  "archive_reason" = 'provisional_identity_merged',
  "resolution_code" = 'provisional_identity_merged',
  "resolution_note" = 'Merged into the resolved customer lifecycle.',
  "metadata" = item."metadata" || jsonb_build_object(
    'lifecycleMergedInto', merge."winner_id",
    'lifecycleMergeReason', 'provisional_identity_resolved'
  )
FROM "staff_work_resolved_identity_merge" AS merge
WHERE item."id" = merge."loser_id";

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
