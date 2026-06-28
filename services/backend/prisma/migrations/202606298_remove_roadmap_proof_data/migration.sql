-- Remove roadmap/proof records that were created only to exercise UI surfaces.
-- Real customers, orders, segments, tasks and workflow rules must come from
-- Shopify, Aircall, admin actions, or the workflow engine itself.

CREATE TEMP TABLE _roadmap_fake_customers ON COMMIT DROP AS
SELECT id, shopify_customer_id
FROM customers
WHERE lower(company_name) LIKE 'roadmap %'
   OR lower(coalesce(email, '')) LIKE 'roadmap%@%'
   OR lower(coalesce(email, '')) LIKE '%@dtfbank.test'
   OR lower(coalesce(email, '')) LIKE '%@example.invalid';

CREATE TEMP TABLE _roadmap_fake_segments ON COMMIT DROP AS
SELECT id
FROM segments
WHERE lower(name) LIKE 'roadmap %'
   OR lower(coalesce(description, '')) LIKE '%roadmap%'
   OR lower(coalesce(description, '')) LIKE '%proof segment%';

CREATE TEMP TABLE _roadmap_fake_requests ON COMMIT DROP AS
SELECT id
FROM service_requests
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR lower(title) LIKE 'roadmap %'
   OR lower(title) LIKE 'pinned customer: roadmap %'
   OR lower(coalesce(description, '')) LIKE '%roadmap%'
   OR lower(coalesce(description, '')) LIKE '%live support row for the customer 360 panel%'
   OR lower(metadata::text) LIKE '%roadmap%';

CREATE TEMP TABLE _roadmap_fake_orders ON COMMIT DROP AS
SELECT id
FROM commerce_orders
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR lower(coalesce(email, '')) LIKE 'roadmap%@%'
   OR shopify_customer_id IN (
     SELECT shopify_customer_id
     FROM _roadmap_fake_customers
     WHERE shopify_customer_id IS NOT NULL
   );

DELETE FROM task_participants
WHERE service_request_id IN (SELECT id FROM _roadmap_fake_requests);

DELETE FROM service_request_comments
WHERE service_request_id IN (SELECT id FROM _roadmap_fake_requests)
   OR lower(body) LIKE '%roadmap%';

DELETE FROM service_requests
WHERE id IN (SELECT id FROM _roadmap_fake_requests);

DELETE FROM segment_customer_assignments
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR segment_id IN (SELECT id FROM _roadmap_fake_segments);

DELETE FROM segment_customer_memberships
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR segment_id IN (SELECT id FROM _roadmap_fake_segments);

DELETE FROM segment_ownerships
WHERE segment_id IN (SELECT id FROM _roadmap_fake_segments);

DELETE FROM segments
WHERE id IN (SELECT id FROM _roadmap_fake_segments);

DELETE FROM workflow_rule_backfill_reports
WHERE lower(rule_name) LIKE 'roadmap %'
   OR lower(rule_name) LIKE '% proof %';

DELETE FROM workflow_rule_versions
WHERE lower(name) LIKE 'roadmap %'
   OR lower(definition::text) LIKE '%roadmap%';

DELETE FROM workflow_rule_executions
WHERE lower(event_id) LIKE 'roadmap%'
   OR lower(event_id) LIKE '%proof%';

DELETE FROM workflow_rule_cooldowns
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers);

DELETE FROM workflow_rules
WHERE lower(name) LIKE 'roadmap %'
   OR lower(description) LIKE '%roadmap%'
   OR lower(description) LIKE '%proof%';

DELETE FROM commerce_pickup_orders
WHERE order_id IN (SELECT id FROM _roadmap_fake_orders)
   OR customer_id IN (SELECT id FROM _roadmap_fake_customers);

DELETE FROM commerce_orders
WHERE id IN (SELECT id FROM _roadmap_fake_orders);

DELETE FROM commerce_activity_logs
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR shopify_customer_id IN (
     SELECT shopify_customer_id
     FROM _roadmap_fake_customers
     WHERE shopify_customer_id IS NOT NULL
   );

DELETE FROM pricing_rules
WHERE target_customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR lower(name) LIKE 'roadmap %'
   OR lower(coalesce(description, '')) LIKE '%roadmap%';

DELETE FROM customer_assignment_audits
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR lower(coalesce(reason, '')) LIKE '%roadmap%';

DELETE FROM customer_assignments
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers)
   OR lower(coalesce(reason, '')) LIKE '%roadmap%';

DELETE FROM customer_list_items
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers);

DELETE FROM customer_insights
WHERE customer_id IN (SELECT id FROM _roadmap_fake_customers);

DELETE FROM b2b_access_request_files
WHERE request_id IN (
  SELECT id
  FROM b2b_access_requests
  WHERE lower(email) LIKE 'roadmap%@%'
     OR lower(email) LIKE '%@dtfbank.test'
     OR lower(email) LIKE '%@example.invalid'
     OR lower(company_name) LIKE 'roadmap %'
);

DELETE FROM b2b_access_requests
WHERE lower(email) LIKE 'roadmap%@%'
   OR lower(email) LIKE '%@dtfbank.test'
   OR lower(email) LIKE '%@example.invalid'
   OR lower(company_name) LIKE 'roadmap %';

DELETE FROM mail_deliveries
WHERE lower(recipient_email) LIKE 'roadmap%@%'
   OR lower(recipient_email) LIKE '%@dtfbank.test'
   OR lower(recipient_email) LIKE '%@example.invalid'
   OR lower(metadata::text) LIKE '%roadmap%';

DELETE FROM customers
WHERE id IN (SELECT id FROM _roadmap_fake_customers);
