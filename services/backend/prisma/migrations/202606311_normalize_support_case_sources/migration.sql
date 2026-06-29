WITH forbidden_requests AS (
  SELECT "id"
  FROM "service_requests"
  WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')
)
DELETE FROM "task_participants"
WHERE "service_request_id" IN (SELECT "id" FROM forbidden_requests);

WITH forbidden_requests AS (
  SELECT "id"
  FROM "service_requests"
  WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')
)
DELETE FROM "service_request_comments"
WHERE "service_request_id" IN (SELECT "id" FROM forbidden_requests);

DELETE FROM "service_requests"
WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment');

UPDATE "service_requests"
SET
  "source" = 'manual',
  "metadata" = coalesce("metadata"::jsonb, '{}'::jsonb)
    || jsonb_build_object(
      'sourceOrigin', 'manual_pin',
      'supportSourceNormalizedAt', now()
    )
WHERE "source" = 'manual_pin'
  AND coalesce("metadata"::jsonb ->> 'sourceOrigin', '') <> 'manual_pin';

UPDATE "service_requests"
SET "source" = 'manual'
WHERE "source" = 'manual_pin';

ALTER TABLE "service_requests"
DROP CONSTRAINT IF EXISTS "service_requests_source_allowed";

ALTER TABLE "service_requests"
ADD CONSTRAINT "service_requests_source_allowed"
CHECK ("source" IN ('manual', 'customer_self_service', 'admin_created'));
