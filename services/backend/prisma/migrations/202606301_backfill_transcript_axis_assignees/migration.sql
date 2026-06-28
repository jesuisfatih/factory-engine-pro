-- Align open AI transcript workflow tasks with DTFBank axis ownership after the
-- axis resolver fix. This only touches live, open workflow tasks generated from
-- transcripts; closed cleanup rows remain closed for audit history.

WITH preferred_axis_member AS (
  SELECT 'support' AS axis, "id" AS member_id
  FROM "members"
  WHERE "tenant_id" = 'ten_dtfbank'
    AND "email" = 'dtfbanktx@gmail.com'
    AND "status" = 'active'
  UNION ALL
  SELECT 'sales' AS axis, "id" AS member_id
  FROM "members"
  WHERE "tenant_id" = 'ten_dtfbank'
    AND "email" = 'ihsan@dtfbank.com'
    AND "status" = 'active'
  UNION ALL
  SELECT 'account' AS axis, "id" AS member_id
  FROM "members"
  WHERE "tenant_id" = 'ten_dtfbank'
    AND "email" = 'info@dtfbank.com'
    AND "status" = 'active'
)
UPDATE "service_requests" request
SET
  "assigned_member_id" = preferred.member_id,
  "metadata" = jsonb_set(
    jsonb_set(
      request."metadata",
      '{workflow,assigneeResolution,assigneeMemberId}',
      to_jsonb(preferred.member_id),
      true
    ),
    '{workflow,assigneeResolution,source}',
    to_jsonb('axis_primary_role'::text),
    true
  ),
  "updated_at" = NOW()
FROM preferred_axis_member preferred
WHERE request."tenant_id" = 'ten_dtfbank'
  AND request."source" = 'ai_transcript'
  AND request."status" NOT IN ('closed', 'resolved')
  AND request."metadata" ->> 'category' = 'workflow_rule'
  AND request."axis" = preferred.axis
  AND request."assigned_member_id" IS DISTINCT FROM preferred.member_id;
