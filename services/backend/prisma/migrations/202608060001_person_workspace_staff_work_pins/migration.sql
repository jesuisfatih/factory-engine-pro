ALTER TABLE "person_workspace_pins"
  DROP CONSTRAINT IF EXISTS "person_workspace_pins_target_kind_check";

ALTER TABLE "person_workspace_pins"
  ADD CONSTRAINT "person_workspace_pins_target_kind_check"
  CHECK ("target_kind" IN ('customer', 'service_request', 'staff_work_item'));

DELETE FROM "person_workspace_pins" legacy
USING "person_workspace_pins" current
WHERE legacy."target_kind" = 'service_request'
  AND current."target_kind" = 'staff_work_item'
  AND current."tenant_id" = legacy."tenant_id"
  AND current."member_id" = legacy."member_id"
  AND current."target_id" = legacy."target_id";

UPDATE "person_workspace_pins" pin
SET "target_kind" = 'staff_work_item',
    "updated_at" = CURRENT_TIMESTAMP
WHERE pin."target_kind" = 'service_request'
  AND EXISTS (
    SELECT 1
    FROM "staff_work_items" item
    WHERE item."tenant_id" = pin."tenant_id"
      AND item."id" = pin."target_id"
  );
