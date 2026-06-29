UPDATE "workflow_rules"
SET
  "status" = 'archived',
  "trigger" = 'manual.trigger',
  "definition" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "definition"::jsonb,
        '{trigger}',
        to_jsonb('manual.trigger'::text),
        true
      ),
      '{status}',
      to_jsonb('archived'::text),
      true
    ),
    '{metadata}',
    coalesce("definition"::jsonb -> 'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'supportWorkflowTriggerRemoved', true,
        'originalTrigger', 'support.request.created'
      ),
    true
  )
WHERE "trigger" = 'support.request.created'
   OR "definition"::jsonb ->> 'trigger' = 'support.request.created';

UPDATE "rule_versions"
SET "json_snapshot" = jsonb_set(
  jsonb_set(
    jsonb_set(
      "json_snapshot"::jsonb,
      '{definition,trigger}',
      to_jsonb('manual.trigger'::text),
      true
    ),
    '{definition,status}',
    to_jsonb('archived'::text),
    true
  ),
  '{definition,metadata}',
  coalesce("json_snapshot"::jsonb #> '{definition,metadata}', '{}'::jsonb)
    || jsonb_build_object(
      'supportWorkflowTriggerRemoved', true,
      'originalTrigger', 'support.request.created'
    ),
  true
)
WHERE "json_snapshot"::jsonb #>> '{definition,trigger}' = 'support.request.created';

UPDATE "workflow_rule_backfill_reports"
SET "trigger" = 'manual.trigger',
    "result" = "result" || jsonb_build_object(
      'supportWorkflowTriggerRemoved', true,
      'originalTrigger', 'support.request.created'
    )
WHERE "trigger" = 'support.request.created';

UPDATE "workflow_rule_executions"
SET "trigger" = 'manual.trigger',
    "status" = 'skipped',
    "result" = "result" || jsonb_build_object(
      'supportWorkflowTriggerRemoved', true,
      'originalTrigger', 'support.request.created'
    )
WHERE "trigger" = 'support.request.created';
