UPDATE "member_roles"
SET
  "permissions" = "permissions" || '{"messaging.read": true, "messaging.write": true}'::jsonb,
  "updated_at" = NOW()
WHERE "slug" IN ('owner', 'admin', 'agent', 'customer_service', 'sales_personel');
