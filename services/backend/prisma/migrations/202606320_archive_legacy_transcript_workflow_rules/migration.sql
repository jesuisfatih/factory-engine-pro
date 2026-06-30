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
    '{metadata}',
    coalesce("definition"::jsonb -> 'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'archivedBy', '202606320_archive_legacy_transcript_workflow_rules',
        'archiveReason', 'Transcript resolver decisions now flow only through call.operational_signal.detected after operational intent normalization.',
        'originalTrigger', "trigger"
      ),
    true
  )
WHERE "status" = 'active'
  AND "trigger" IN (
    'aircall.transcript.received',
    'call_intent.classified',
    'psych.tag.detected',
    'product.detected_in_transcript',
    'customer.matched_from_transcript',
    'psych.analysis.completed'
  );
