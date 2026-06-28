-- Normalize transcript-created workflow tasks and close tasks created during the
-- psych tag cross-match bug window. Real tasks keep their row history; only the
-- operational status/source classification is corrected.

UPDATE "service_requests"
SET
  "source" = 'ai_transcript',
  "updated_at" = NOW()
WHERE "source" = 'call'
  AND "metadata" ->> 'category' = 'workflow_rule'
  AND (
    "metadata" ->> 'aiSource' = 'transcript'
    OR "metadata" -> 'workflow' ->> 'source' ILIKE '%transcript%'
    OR "metadata" -> 'workflow' ->> 'trigger' IN (
      'aircall.transcript.received',
      'call_intent.classified',
      'psych.tag.detected',
      'product.detected_in_transcript',
      'customer.matched_from_transcript',
      'psych.analysis.completed',
      'customer.repeat_call.detected',
      'customer.first_call.detected'
    )
  );

UPDATE "service_requests"
SET
  "status" = 'closed',
  "closed_at" = COALESCE("closed_at", NOW()),
  "resolution_code" = 'workflow_mismatch_cleanup',
  "resolution_note" = 'Closed automatically: workflow rule did not match the event psych tag after transcript replay cleanup.',
  "updated_at" = NOW()
WHERE "status" NOT IN ('closed', 'resolved')
  AND "metadata" ->> 'category' = 'workflow_rule'
  AND "metadata" -> 'workflow' ->> 'trigger' = 'psych.tag.detected'
  AND (
    (
      "metadata" -> 'workflow' ->> 'ruleName' ILIKE '%purchase intent%'
      AND "metadata" -> 'workflow' ->> 'eventId' NOT LIKE '%:psych_tag:purchase_intent'
    )
    OR (
      "metadata" -> 'workflow' ->> 'ruleName' ILIKE '%refund intent%'
      AND "metadata" -> 'workflow' ->> 'eventId' NOT LIKE '%:psych_tag:refund_intent'
    )
    OR (
      "metadata" -> 'workflow' ->> 'ruleName' ILIKE '%shipping issue%'
      AND "metadata" -> 'workflow' ->> 'eventId' NOT LIKE '%:psych_tag:shipping_issue'
    )
    OR (
      "metadata" -> 'workflow' ->> 'ruleName' ILIKE '%angry%'
      AND "metadata" -> 'workflow' ->> 'eventId' NOT LIKE '%:psych_tag:angry'
    )
  );
