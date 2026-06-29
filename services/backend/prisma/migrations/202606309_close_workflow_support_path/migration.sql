WITH doomed AS (
  SELECT "id"
  FROM "service_requests"
  WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')
     OR "id" LIKE 'sr_dtfbank_welcome%'
     OR "id" LIKE 'srseg_%'
     OR "metadata" @> '{"seed":true}'::jsonb
     OR "metadata" @> '{"mock":true}'::jsonb
     OR "metadata" @> '{"demo":true}'::jsonb
)
DELETE FROM "task_participants"
WHERE "service_request_id" IN (SELECT "id" FROM doomed);

WITH doomed AS (
  SELECT "id"
  FROM "service_requests"
  WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')
     OR "id" LIKE 'sr_dtfbank_welcome%'
     OR "id" LIKE 'srseg_%'
     OR "metadata" @> '{"seed":true}'::jsonb
     OR "metadata" @> '{"mock":true}'::jsonb
     OR "metadata" @> '{"demo":true}'::jsonb
)
DELETE FROM "service_request_comments"
WHERE "service_request_id" IN (SELECT "id" FROM doomed);

DELETE FROM "service_requests"
WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')
   OR "id" LIKE 'sr_dtfbank_welcome%'
   OR "id" LIKE 'srseg_%'
   OR "metadata" @> '{"seed":true}'::jsonb
   OR "metadata" @> '{"mock":true}'::jsonb
   OR "metadata" @> '{"demo":true}'::jsonb;

UPDATE "workflow_rules"
SET "definition" = jsonb_set(
  "definition"::jsonb,
  '{actions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN action ->> 'action' = 'create_task'
          AND (
            lower(coalesce(action ->> 'axis', '')) = 'support'
            OR lower(coalesce(action ->> 'value', '')) LIKE 'support:%'
          )
        THEN jsonb_build_object(
          'id', coalesce(action ->> 'id', 'support-case-manual-only'),
          'action', 'no-op',
          'value', 'Support intent detected; Support cases are created manually.'
        )
        WHEN action ->> 'action' = 'create_task'
        THEN action || jsonb_build_object(
          'axis',
          CASE
            WHEN lower(coalesce(action ->> 'axis', '')) = 'account' THEN 'account'
            WHEN lower(coalesce(action ->> 'value', '')) LIKE 'account:%' THEN 'account'
            ELSE 'sales'
          END
        )
        ELSE action
      END
    )
    FROM jsonb_array_elements("definition"::jsonb -> 'actions') AS action
  ),
  false
)::jsonb
WHERE "definition"::jsonb ? 'actions'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("definition"::jsonb -> 'actions') AS action
    WHERE action ->> 'action' = 'create_task'
      AND (
        action ->> 'axis' IS NULL
        OR lower(coalesce(action ->> 'axis', '')) = 'support'
        OR lower(coalesce(action ->> 'value', '')) LIKE 'support:%'
      )
  );
