-- Remove early scaffold/demo seed records. Real customer/order data must come from
-- Shopify sync, and operational records must come from workflows/manual/accounts.

DELETE FROM "workflow_rule_cooldowns"
WHERE "rule_id" IN (
  SELECT "id"
  FROM "workflow_rules"
  WHERE "id" LIKE 'wrule\_%\_seed\_%' ESCAPE '\'
     OR "definition" -> 'metadata' ->> 'source' = 'seed'
);

DELETE FROM "workflow_rule_executions"
WHERE "rule_id" IN (
  SELECT "id"
  FROM "workflow_rules"
  WHERE "id" LIKE 'wrule\_%\_seed\_%' ESCAPE '\'
     OR "definition" -> 'metadata' ->> 'source' = 'seed'
);

DELETE FROM "workflow_rule_backfill_reports"
WHERE "rule_id" IN (
  SELECT "id"
  FROM "workflow_rules"
  WHERE "id" LIKE 'wrule\_%\_seed\_%' ESCAPE '\'
     OR "definition" -> 'metadata' ->> 'source' = 'seed'
);

DELETE FROM "rule_versions"
WHERE "rule_id" IN (
  SELECT "id"
  FROM "workflow_rules"
  WHERE "id" LIKE 'wrule\_%\_seed\_%' ESCAPE '\'
     OR "definition" -> 'metadata' ->> 'source' = 'seed'
)
   OR "id" LIKE 'wrv\_%\_seed\_%' ESCAPE '\'
   OR "json_snapshot" -> 'definition' -> 'metadata' ->> 'source' = 'seed';

DELETE FROM "workflow_rules"
WHERE "id" LIKE 'wrule\_%\_seed\_%' ESCAPE '\'
   OR "definition" -> 'metadata' ->> 'source' = 'seed';

DELETE FROM "task_participants"
WHERE "service_request_id" IN (
  SELECT "id"
  FROM "service_requests"
  WHERE "id" LIKE 'sr\_%\_welcome' ESCAPE '\'
     OR ("title" = 'Seed support follow-up' AND "metadata" ->> 'category' = 'operations')
);

DELETE FROM "service_request_comments"
WHERE "id" LIKE 'srcm\_%\_welcome' ESCAPE '\'
   OR "service_request_id" IN (
     SELECT "id"
     FROM "service_requests"
     WHERE "id" LIKE 'sr\_%\_welcome' ESCAPE '\'
        OR ("title" = 'Seed support follow-up' AND "metadata" ->> 'category' = 'operations')
   );

DELETE FROM "service_requests"
WHERE "id" LIKE 'sr\_%\_welcome' ESCAPE '\'
   OR ("title" = 'Seed support follow-up' AND "metadata" ->> 'category' = 'operations');

DELETE FROM "b2b_access_request_files"
WHERE "id" LIKE 'b2bf\_%\_seed\_cert' ESCAPE '\'
   OR "request_id" IN (
     SELECT "id"
     FROM "b2b_access_requests"
     WHERE "id" LIKE 'b2br\_%\_seed' ESCAPE '\'
        OR "email" LIKE 'b2b.seed+%@example.com'
        OR "metadata" ->> 'sourceSurface' = 'seed'
   )
   OR "storage_key" LIKE 'seed/b2br\_%\_seed/%' ESCAPE '\';

DELETE FROM "b2b_access_requests"
WHERE "id" LIKE 'b2br\_%\_seed' ESCAPE '\'
   OR "email" LIKE 'b2b.seed+%@example.com'
   OR "metadata" ->> 'sourceSurface' = 'seed';

DELETE FROM "pricing_rules"
WHERE "id" LIKE 'prule\_%\_vip10' ESCAPE '\'
   OR ("name" = 'VIP B2B 10% off' AND "description" = 'Tenant-scoped seed rule for B2B VIP customers');

DELETE FROM "segment_customer_memberships"
WHERE "id" LIKE 'smem\_%\_vip\_northstar' ESCAPE '\'
   OR "segment_id" IN (
     SELECT "id"
     FROM "segments"
     WHERE "id" LIKE 'seg\_%\_vip' ESCAPE '\'
        OR "rules_hash" = 'seed-vip-b2b'
        OR "rules_hash" LIKE 'seed-rfm-%'
        OR "rules" -> 'metadata' ->> 'source' = 'seed'
   );

DELETE FROM "segment_ownerships"
WHERE "segment_id" IN (
  SELECT "id"
  FROM "segments"
  WHERE "id" LIKE 'seg\_%\_vip' ESCAPE '\'
     OR "rules_hash" = 'seed-vip-b2b'
     OR "rules_hash" LIKE 'seed-rfm-%'
     OR "rules" -> 'metadata' ->> 'source' = 'seed'
);

DELETE FROM "segments"
WHERE "id" LIKE 'seg\_%\_vip' ESCAPE '\'
   OR "rules_hash" = 'seed-vip-b2b'
   OR "rules_hash" LIKE 'seed-rfm-%'
   OR "rules" -> 'metadata' ->> 'source' = 'seed';

DELETE FROM "commerce_pickup_orders"
WHERE "id" LIKE 'pick\_%\_1001' ESCAPE '\'
   OR "order_id" IN (
     SELECT "id"
     FROM "commerce_orders"
     WHERE "id" LIKE 'ord\_%\_1001' ESCAPE '\'
        OR "shopify_order_id" = '8000001001'
        OR "email" = 'orders+northstar@example.com'
   )
   OR "customer_email" = 'orders+northstar@example.com';

DELETE FROM "commerce_orders"
WHERE "id" LIKE 'ord\_%\_1001' ESCAPE '\'
   OR "shopify_order_id" = '8000001001'
   OR "email" = 'orders+northstar@example.com';

DELETE FROM "catalog_variants"
WHERE "id" LIKE 'var\_%\_dtf\_22' ESCAPE '\'
   OR "shopify_variant_id" = '9100000001';

DELETE FROM "catalog_products"
WHERE "id" LIKE 'prod\_%\_dtf' ESCAPE '\'
   OR "shopify_product_id" = '9000000001';

DELETE FROM "customer_assignment_audits"
WHERE "customer_id" IN (
  SELECT "id"
  FROM "customers"
  WHERE "id" LIKE 'cust\_%\_northstar' ESCAPE '\'
     OR "email" = 'orders+northstar@example.com'
     OR "shopify_customer_id" = '1000000001'
);

DELETE FROM "customer_assignments"
WHERE "customer_id" IN (
  SELECT "id"
  FROM "customers"
  WHERE "id" LIKE 'cust\_%\_northstar' ESCAPE '\'
     OR "email" = 'orders+northstar@example.com'
     OR "shopify_customer_id" = '1000000001'
);

DELETE FROM "customer_list_items"
WHERE "customer_id" IN (
  SELECT "id"
  FROM "customers"
  WHERE "id" LIKE 'cust\_%\_northstar' ESCAPE '\'
     OR "email" = 'orders+northstar@example.com'
     OR "shopify_customer_id" = '1000000001'
);

DELETE FROM "customer_insights"
WHERE "id" LIKE 'cins\_%\_northstar' ESCAPE '\'
   OR "customer_id" IN (
     SELECT "id"
     FROM "customers"
     WHERE "id" LIKE 'cust\_%\_northstar' ESCAPE '\'
        OR "email" = 'orders+northstar@example.com'
        OR "shopify_customer_id" = '1000000001'
   );

DELETE FROM "customers"
WHERE "id" LIKE 'cust\_%\_northstar' ESCAPE '\'
   OR "email" = 'orders+northstar@example.com'
   OR "shopify_customer_id" = '1000000001'
   OR "company_name" = 'Northstar Print Supply';
