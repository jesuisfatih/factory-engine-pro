UPDATE "staff_work_items"
SET "current_disposition" = 'not_selected'
WHERE "current_disposition" IS NULL
  AND "queue_location" = 'follow_up'
  AND "status" NOT IN ('closed', 'resolved', 'transferred');
