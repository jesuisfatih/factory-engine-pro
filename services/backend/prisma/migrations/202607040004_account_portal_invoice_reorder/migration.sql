CREATE TABLE "account_invoices" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "order_id" TEXT,
  "shopify_customer_id" TEXT,
  "invoice_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unpaid',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMP(3),
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shipping_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "file_url" TEXT,
  "external_payment_url" TEXT,
  "notes" TEXT,
  "line_items" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_reorder_carts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "source_order_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'review_required',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "item_count" INTEGER NOT NULL DEFAULT 0,
  "checkout_url" TEXT,
  "checkout_error" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_reorder_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_invoice_payments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'manual',
  "note" TEXT,
  "recorded_by_member_id" TEXT,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "account_invoice_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_invoice_activities" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor_member_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_invoice_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_reorder_cart_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cart_id" TEXT NOT NULL,
  "source_order_id" TEXT,
  "source_line_item_key" TEXT NOT NULL,
  "product_title" TEXT NOT NULL,
  "variant_title" TEXT,
  "sku" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shopify_variant_id" TEXT,
  "catalog_variant_id" TEXT,
  "reorderable" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "properties_json" JSONB NOT NULL DEFAULT '[]',
  "design_files_json" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_reorder_cart_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_invoices_tenant_id_invoice_number_key" ON "account_invoices"("tenant_id", "invoice_number");
CREATE INDEX "account_invoices_tenant_id_customer_id_idx" ON "account_invoices"("tenant_id", "customer_id");
CREATE INDEX "account_invoices_tenant_id_order_id_idx" ON "account_invoices"("tenant_id", "order_id");
CREATE INDEX "account_invoices_tenant_id_status_idx" ON "account_invoices"("tenant_id", "status");

CREATE INDEX "account_invoice_payments_tenant_id_invoice_id_idx" ON "account_invoice_payments"("tenant_id", "invoice_id");
CREATE INDEX "account_invoice_payments_tenant_id_recorded_at_idx" ON "account_invoice_payments"("tenant_id", "recorded_at");
CREATE INDEX "account_invoice_activities_tenant_id_invoice_id_idx" ON "account_invoice_activities"("tenant_id", "invoice_id");
CREATE INDEX "account_invoice_activities_tenant_id_action_idx" ON "account_invoice_activities"("tenant_id", "action");
CREATE INDEX "account_invoice_activities_tenant_id_created_at_idx" ON "account_invoice_activities"("tenant_id", "created_at");

CREATE INDEX "account_reorder_carts_tenant_id_customer_id_idx" ON "account_reorder_carts"("tenant_id", "customer_id");
CREATE INDEX "account_reorder_carts_tenant_id_source_order_id_idx" ON "account_reorder_carts"("tenant_id", "source_order_id");
CREATE INDEX "account_reorder_carts_tenant_id_status_idx" ON "account_reorder_carts"("tenant_id", "status");

CREATE INDEX "account_reorder_cart_items_tenant_id_cart_id_idx" ON "account_reorder_cart_items"("tenant_id", "cart_id");
CREATE INDEX "account_reorder_cart_items_tenant_id_source_order_id_idx" ON "account_reorder_cart_items"("tenant_id", "source_order_id");
CREATE INDEX "account_reorder_cart_items_tenant_id_sku_idx" ON "account_reorder_cart_items"("tenant_id", "sku");

ALTER TABLE "account_invoices"
  ADD CONSTRAINT "account_invoices_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_invoices"
  ADD CONSTRAINT "account_invoices_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_invoices"
  ADD CONSTRAINT "account_invoices_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "commerce_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "account_invoice_payments"
  ADD CONSTRAINT "account_invoice_payments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_invoice_payments"
  ADD CONSTRAINT "account_invoice_payments_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "account_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_invoice_activities"
  ADD CONSTRAINT "account_invoice_activities_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_invoice_activities"
  ADD CONSTRAINT "account_invoice_activities_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "account_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_carts"
  ADD CONSTRAINT "account_reorder_carts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_carts"
  ADD CONSTRAINT "account_reorder_carts_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_carts"
  ADD CONSTRAINT "account_reorder_carts_source_order_id_fkey"
  FOREIGN KEY ("source_order_id") REFERENCES "commerce_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "account_reorder_cart_items"
  ADD CONSTRAINT "account_reorder_cart_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_cart_items"
  ADD CONSTRAINT "account_reorder_cart_items_cart_id_fkey"
  FOREIGN KEY ("cart_id") REFERENCES "account_reorder_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_reorder_cart_items"
  ADD CONSTRAINT "account_reorder_cart_items_source_order_id_fkey"
  FOREIGN KEY ("source_order_id") REFERENCES "commerce_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
