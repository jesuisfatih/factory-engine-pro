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
    '"Transcript-derived task creation must go through call.operational_signal.detected."'::jsonb,
    true
  ),
  "updated_at" = NOW()
WHERE "status" = 'active'
  AND "trigger" IN (
    'aircall.transcript.received',
    'call_intent.classified',
    'psych.tag.detected',
    'product.detected_in_transcript',
    'customer.matched_from_transcript',
    'psych.analysis.completed'
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE("definition"::jsonb -> 'actions', '[]'::jsonb)) AS action
    WHERE action ->> 'action' = 'create_task'
  );
