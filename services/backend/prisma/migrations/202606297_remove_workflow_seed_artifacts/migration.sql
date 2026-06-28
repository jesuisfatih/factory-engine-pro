WITH seed_tasks AS (
  SELECT "id"
  FROM "service_requests"
  WHERE
    "matched_rule_id" LIKE 'wrule_ten_dtfbank_seed_%'
    OR "matched_rule_id" LIKE 'wrule_roadmap%'
    OR "title" ILIKE '% proof %'
),
seed_rules AS (
  SELECT "id"
  FROM "workflow_rules"
  WHERE
    "id" LIKE 'wrule_ten_dtfbank_seed_%'
    OR "id" LIKE 'wrule_roadmap%'
    OR "name" ILIKE 'Roadmap % proof%'
    OR "name" ILIKE '% seed %'
)
DELETE FROM "service_request_comments"
WHERE "service_request_id" IN (SELECT "id" FROM seed_tasks);

WITH seed_tasks AS (
  SELECT "id"
  FROM "service_requests"
  WHERE
    "matched_rule_id" LIKE 'wrule_ten_dtfbank_seed_%'
    OR "matched_rule_id" LIKE 'wrule_roadmap%'
    OR "title" ILIKE '% proof %'
)
DELETE FROM "task_participants"
WHERE "service_request_id" IN (SELECT "id" FROM seed_tasks);

DELETE FROM "workflow_rule_executions"
WHERE
  "rule_id" LIKE 'wrule_ten_dtfbank_seed_%'
  OR "rule_id" LIKE 'wrule_roadmap%'
  OR "event_id" LIKE 'roadmap:%'
  OR "event_id" LIKE 'proof:%';

DELETE FROM "workflow_rule_cooldowns"
WHERE
  "rule_id" LIKE 'wrule_ten_dtfbank_seed_%'
  OR "rule_id" LIKE 'wrule_roadmap%';

WITH seed_rules AS (
  SELECT "id"
  FROM "workflow_rules"
  WHERE
    "id" LIKE 'wrule_ten_dtfbank_seed_%'
    OR "id" LIKE 'wrule_roadmap%'
    OR "name" ILIKE 'Roadmap % proof%'
    OR "name" ILIKE '% seed %'
)
DELETE FROM "workflow_rule_backfill_reports"
WHERE "rule_id" IN (SELECT "id" FROM seed_rules);

WITH seed_rules AS (
  SELECT "id"
  FROM "workflow_rules"
  WHERE
    "id" LIKE 'wrule_ten_dtfbank_seed_%'
    OR "id" LIKE 'wrule_roadmap%'
    OR "name" ILIKE 'Roadmap % proof%'
    OR "name" ILIKE '% seed %'
)
DELETE FROM "rule_versions"
WHERE "rule_id" IN (SELECT "id" FROM seed_rules);

WITH seed_tasks AS (
  SELECT "id"
  FROM "service_requests"
  WHERE
    "matched_rule_id" LIKE 'wrule_ten_dtfbank_seed_%'
    OR "matched_rule_id" LIKE 'wrule_roadmap%'
    OR "title" ILIKE '% proof %'
)
DELETE FROM "service_requests"
WHERE "id" IN (SELECT "id" FROM seed_tasks);

DELETE FROM "workflow_rules"
WHERE
  "id" LIKE 'wrule_ten_dtfbank_seed_%'
  OR "id" LIKE 'wrule_roadmap%'
  OR "name" ILIKE 'Roadmap % proof%'
  OR "name" ILIKE '% seed %';
