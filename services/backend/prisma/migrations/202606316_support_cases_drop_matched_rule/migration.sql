UPDATE "service_requests"
SET "matched_rule_id" = NULL
WHERE "axis" = 'support'
  AND "matched_rule_id" IS NOT NULL;
