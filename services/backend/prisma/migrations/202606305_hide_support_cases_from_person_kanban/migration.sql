UPDATE "service_requests"
SET "metadata" = "metadata" || jsonb_build_object(
  'personQueueVisible', false,
  'supportCaseOnly', true,
  'personQueueHiddenReason', 'support_case'
)
WHERE "axis" = 'support'
  AND "metadata" ->> 'category' = 'workflow_rule'
  AND (
    lower("title") LIKE 'support:%'
    OR "metadata" #>> '{workflow,action}' = 'create_task'
  );
