UPDATE "customer_roles"
SET
  "permissions" = "permissions" || '{
    "accounts.order.read_own": true,
    "accounts.order.create_own": true,
    "accounts.order.reorder_own": true,
    "accounts.invoice.read_own": true,
    "accounts.cart.write_own": true
  }'::jsonb,
  "updated_at" = NOW()
WHERE "slug" IN ('b2b_admin', 'b2b_user');
