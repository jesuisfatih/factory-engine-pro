WITH forbidden_requests AS (
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
WHERE "service_request_id" IN (SELECT "id" FROM forbidden_requests);

WITH forbidden_requests AS (
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
WHERE "service_request_id" IN (SELECT "id" FROM forbidden_requests);

DELETE FROM "service_requests"
WHERE "source" IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')
   OR "id" LIKE 'sr_dtfbank_welcome%'
   OR "id" LIKE 'srseg_%'
   OR "metadata" @> '{"seed":true}'::jsonb
   OR "metadata" @> '{"mock":true}'::jsonb
   OR "metadata" @> '{"demo":true}'::jsonb;

UPDATE "service_requests"
SET "source" = 'manual'
WHERE "source" = 'manual_pin';

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
  true
)
WHERE jsonb_typeof("definition"::jsonb -> 'actions') = 'array'
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

UPDATE "rule_versions"
SET "json_snapshot" = jsonb_set(
  "json_snapshot"::jsonb,
  '{definition,actions}',
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
    FROM jsonb_array_elements("json_snapshot"::jsonb #> '{definition,actions}') AS action
  ),
  true
)
WHERE jsonb_typeof("json_snapshot"::jsonb #> '{definition,actions}') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("json_snapshot"::jsonb #> '{definition,actions}') AS action
    WHERE action ->> 'action' = 'create_task'
      AND (
        action ->> 'axis' IS NULL
        OR lower(coalesce(action ->> 'axis', '')) = 'support'
        OR lower(coalesce(action ->> 'value', '')) LIKE 'support:%'
      )
  );

UPDATE "workflow_rules"
SET
  "status" = 'archived',
  "trigger" = 'manual.trigger',
  "definition" = jsonb_set(
    jsonb_set(
      jsonb_set("definition"::jsonb, '{trigger}', to_jsonb('manual.trigger'::text), true),
      '{status}',
      to_jsonb('archived'::text),
      true
    ),
    '{metadata}',
    coalesce("definition"::jsonb -> 'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'supportWorkflowTriggerRemoved', true,
        'originalTrigger', coalesce("trigger", "definition"::jsonb ->> 'trigger')
      ),
    true
  )
WHERE "trigger" IN ('support.request.created', 'support.case.created')
   OR "definition"::jsonb ->> 'trigger' IN ('support.request.created', 'support.case.created');

UPDATE "rule_versions"
SET "json_snapshot" = jsonb_set(
  jsonb_set(
    jsonb_set("json_snapshot"::jsonb, '{definition,trigger}', to_jsonb('manual.trigger'::text), true),
    '{definition,status}',
    to_jsonb('archived'::text),
    true
  ),
  '{definition,metadata}',
  coalesce("json_snapshot"::jsonb #> '{definition,metadata}', '{}'::jsonb)
    || jsonb_build_object(
      'supportWorkflowTriggerRemoved', true,
      'originalTrigger', "json_snapshot"::jsonb #>> '{definition,trigger}'
    ),
  true
)
WHERE "json_snapshot"::jsonb #>> '{definition,trigger}' IN ('support.request.created', 'support.case.created');

UPDATE "workflow_rule_backfill_reports"
SET "trigger" = 'manual.trigger',
    "result" = "result" || jsonb_build_object(
      'supportWorkflowTriggerRemoved', true,
      'originalTrigger', "trigger"
    )
WHERE "trigger" IN ('support.request.created', 'support.case.created');

UPDATE "workflow_rule_executions"
SET "trigger" = 'manual.trigger',
    "status" = 'skipped',
    "result" = "result" || jsonb_build_object(
      'supportWorkflowTriggerRemoved', true,
      'originalTrigger', "trigger"
    )
WHERE "trigger" IN ('support.request.created', 'support.case.created');

ALTER TABLE "service_requests"
DROP CONSTRAINT IF EXISTS "service_requests_source_allowed";

ALTER TABLE "service_requests"
ADD CONSTRAINT "service_requests_source_allowed"
CHECK ("source" IN ('manual', 'customer_self_service', 'admin_created'));
