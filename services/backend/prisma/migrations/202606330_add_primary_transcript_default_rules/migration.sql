WITH default_rules AS (
  SELECT
    tenant.id AS tenant_id,
    item.rule_key,
    item.name,
    item.priority,
    item.definition
  FROM "tenants" tenant
  CROSS JOIN (
    VALUES
      (
        'operational_spare_part_purchase_sales_task',
        'Default: Spare part purchase follow-up',
        72,
        '{
          "when": [
            {"id": "intent_spare_part_purchase", "value": "spare_part_purchase_intent", "operator": "=", "condition": "operational_intent"}
          ],
          "status": "active",
          "actions": [
            {"id": "create_spare_part_sales_task", "axis": "sales", "value": "Spare part purchase follow-up", "action": "create_task"}
          ],
          "trigger": "call.operational_signal.detected",
          "cooldown": {"hours": 24, "limit": 1},
          "metadata": {"source": "dtfbank_default_workflow_rules", "defaultRuleKey": "operational_spare_part_purchase_sales_task"},
          "priority": 72,
          "composable": false
        }'::jsonb
      ),
      (
        'operational_heat_press_machine_purchase_sales_task',
        'Default: Heat press machine purchase follow-up',
        75,
        '{
          "when": [
            {"id": "intent_heat_press_machine_purchase", "value": "heat_press_machine_purchase_intent", "operator": "=", "condition": "operational_intent"}
          ],
          "status": "active",
          "actions": [
            {"id": "create_heat_press_machine_sales_task", "axis": "sales", "value": "Heat press machine purchase follow-up", "action": "create_task"}
          ],
          "trigger": "call.operational_signal.detected",
          "cooldown": {"hours": 24, "limit": 1},
          "metadata": {"source": "dtfbank_default_workflow_rules", "defaultRuleKey": "operational_heat_press_machine_purchase_sales_task"},
          "priority": 75,
          "composable": false
        }'::jsonb
      )
  ) AS item(rule_key, name, priority, definition)
),
inserted_rules AS (
  INSERT INTO "workflow_rules" (
    "id",
    "tenant_id",
    "name",
    "status",
    "priority",
    "composable",
    "trigger",
    "definition",
    "created_at",
    "updated_at"
  )
  SELECT
    'wrule_' || substr(md5(default_rules.tenant_id || ':' || default_rules.rule_key), 1, 24),
    default_rules.tenant_id,
    default_rules.name,
    'active',
    default_rules.priority,
    false,
    'call.operational_signal.detected',
    default_rules.definition,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM default_rules
  WHERE NOT EXISTS (
    SELECT 1
    FROM "workflow_rules" existing
    WHERE existing."tenant_id" = default_rules.tenant_id
      AND (
        lower(trim(existing."name")) = lower(trim(default_rules.name))
        OR existing."definition" #>> '{metadata,defaultRuleKey}' = default_rules.rule_key
      )
  )
  RETURNING "id", "tenant_id", "name", "definition"
)
INSERT INTO "rule_versions" (
  "id",
  "tenant_id",
  "rule_id",
  "version_no",
  "json_snapshot",
  "edited_by_member_id",
  "edited_at",
  "comment"
)
SELECT
  'wrv_' || substr(md5(inserted_rules."id" || ':v1'), 1, 24),
  inserted_rules."tenant_id",
  inserted_rules."id",
  1,
  jsonb_build_object('name', inserted_rules."name", 'definition', inserted_rules."definition"),
  NULL,
  CURRENT_TIMESTAMP,
  'Default workflow rule repaired for primary transcript operational intent coverage'
FROM inserted_rules
WHERE NOT EXISTS (
  SELECT 1
  FROM "rule_versions" existing
  WHERE existing."tenant_id" = inserted_rules."tenant_id"
    AND existing."rule_id" = inserted_rules."id"
    AND existing."version_no" = 1
);
