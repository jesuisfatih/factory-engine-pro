UPDATE "workflow_rules"
SET
  "status" = 'archived',
  "definition" = jsonb_set(
    jsonb_set(
      "definition"::jsonb,
      '{status}',
      '"archived"'::jsonb,
      true
    ),
    '{metadata,archivedReason}',
    '"Call-derived task creation must go through call.operational_signal.detected after transcript operational intent normalization."'::jsonb,
    true
  ),
  "updated_at" = NOW()
WHERE "status" = 'active'
  AND "trigger" IN (
    'aircall.call.created',
    'aircall.call.ended',
    'aircall.call.missed',
    'aircall.transcript.received',
    'call_intent.classified',
    'psych.tag.detected',
    'product.detected_in_transcript',
    'customer.matched_from_transcript',
    'psych.analysis.completed',
    'customer.repeat_call.detected',
    'customer.first_call.detected'
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE("definition"::jsonb -> 'actions', '[]'::jsonb)) AS action
    WHERE action ->> 'action' = 'create_task'
  );

UPDATE "service_requests"
SET
  "status" = 'closed',
  "closed_at" = COALESCE("closed_at", NOW()),
  "resolution_code" = 'call_derived_task_bypass_archived',
  "resolution_note" = 'Closed automatically: call-derived task creation now runs only through call.operational_signal.detected after transcript operational intent normalization.',
  "metadata" = jsonb_set(
    "metadata"::jsonb,
    '{workflow,legacyBypassArchivedAt}',
    to_jsonb(NOW()::text),
    true
  ),
  "updated_at" = NOW()
WHERE "matched_rule_id" IS NOT NULL
  AND "status" NOT IN ('closed', 'resolved')
  AND "metadata"::jsonb -> 'workflow' ->> 'trigger' IN (
    'aircall.call.created',
    'aircall.call.ended',
    'aircall.call.missed',
    'aircall.transcript.received',
    'call_intent.classified',
    'psych.tag.detected',
    'product.detected_in_transcript',
    'customer.matched_from_transcript',
    'psych.analysis.completed',
    'customer.repeat_call.detected',
    'customer.first_call.detected'
  );
