-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "average_order_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "last_order_at" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "orders_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "raw_data" JSONB,
ADD COLUMN     "synced_at" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "catalog_products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "vendor" TEXT,
    "product_type" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "images" JSONB,
    "collections" JSONB,
    "raw_data" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_variants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "compare_at_price" DECIMAL(12,2),
    "inventory_quantity" INTEGER,
    "inventory_policy" TEXT,
    "available_for_sale" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "raw_data" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_user_id" TEXT,
    "shopify_order_id" TEXT,
    "shopify_order_number" TEXT,
    "shopify_customer_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'shopify',
    "idempotency_key" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_shipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_refunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "financial_status" TEXT,
    "fulfillment_status" TEXT,
    "fulfillment_mode" TEXT NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risk_level" TEXT,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "discount_codes" JSONB,
    "fulfillments" JSONB,
    "refunds" JSONB,
    "design_files" JSONB NOT NULL DEFAULT '[]',
    "fulfillment_evidence" JSONB,
    "raw_data" JSONB,
    "processed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_pickup_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "qr_code" TEXT,
    "order_number" TEXT,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "pickup_at" TIMESTAMP(3),
    "design_files" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_pickup_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_activity_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "shopify_customer_id" TEXT,
    "event_type" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "shopify_product_id" TEXT,
    "shopify_variant_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_insights" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "clv_score" INTEGER NOT NULL DEFAULT 0,
    "projected_clv" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "clv_tier" TEXT NOT NULL DEFAULT 'new',
    "rfm_recency" INTEGER NOT NULL DEFAULT 0,
    "rfm_frequency" INTEGER NOT NULL DEFAULT 0,
    "rfm_monetary" INTEGER NOT NULL DEFAULT 0,
    "rfm_segment" TEXT NOT NULL DEFAULT 'new',
    "health_score" INTEGER NOT NULL DEFAULT 0,
    "churn_risk" TEXT NOT NULL DEFAULT 'unknown',
    "days_since_last_order" INTEGER,
    "avg_days_between_orders" DECIMAL(12,2),
    "purchase_frequency" DECIMAL(12,2),
    "preferred_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferred_vendors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avg_order_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_order_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "order_trend" TEXT NOT NULL DEFAULT 'stable',
    "first_order_at" TIMESTAMP(3),
    "last_order_at" TIMESTAMP(3),
    "customer_since" TIMESTAMP(3),
    "is_returning" BOOLEAN NOT NULL DEFAULT false,
    "deep_metrics" JSONB NOT NULL DEFAULT '{}',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_lists" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "icon" TEXT NOT NULL DEFAULT 'users',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "system_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_list_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "notes" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_type" TEXT NOT NULL DEFAULT 'all',
    "target_customer_id" TEXT,
    "target_customer_user_id" TEXT,
    "target_customer_group" TEXT,
    "target_shopify_customer_id" TEXT,
    "target_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope_type" TEXT NOT NULL DEFAULT 'all',
    "scope_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope_collection_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope_variant_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discount_type" TEXT NOT NULL,
    "discount_value" DECIMAL(12,2),
    "discount_percentage" DECIMAL(6,3),
    "qty_breaks" JSONB NOT NULL DEFAULT '[]',
    "min_cart_amount" DECIMAL(12,2),
    "discount_policy" TEXT NOT NULL DEFAULT 'best',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "shopify_discount_code" TEXT,
    "shopify_discount_id" TEXT,
    "execution_mode" TEXT NOT NULL DEFAULT 'draft_order',
    "shopify_sync_state" TEXT NOT NULL DEFAULT 'not_applicable',
    "shopify_sync_error" TEXT,
    "shopify_synced_at" TIMESTAMP(3),
    "shopify_sync_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_products_tenant_id_handle_idx" ON "catalog_products"("tenant_id", "handle");

-- CreateIndex
CREATE INDEX "catalog_products_tenant_id_status_idx" ON "catalog_products"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_products_tenant_id_shopify_product_id_key" ON "catalog_products"("tenant_id", "shopify_product_id");

-- CreateIndex
CREATE INDEX "catalog_variants_tenant_id_product_id_idx" ON "catalog_variants"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "catalog_variants_tenant_id_sku_idx" ON "catalog_variants"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_variants_tenant_id_shopify_variant_id_key" ON "catalog_variants"("tenant_id", "shopify_variant_id");

-- CreateIndex
CREATE INDEX "commerce_orders_tenant_id_customer_id_idx" ON "commerce_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_orders_tenant_id_customer_user_id_idx" ON "commerce_orders"("tenant_id", "customer_user_id");

-- CreateIndex
CREATE INDEX "commerce_orders_tenant_id_shopify_customer_id_idx" ON "commerce_orders"("tenant_id", "shopify_customer_id");

-- CreateIndex
CREATE INDEX "commerce_orders_tenant_id_processed_at_idx" ON "commerce_orders"("tenant_id", "processed_at");

-- CreateIndex
CREATE INDEX "commerce_orders_tenant_id_fulfillment_mode_idx" ON "commerce_orders"("tenant_id", "fulfillment_mode");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_orders_tenant_id_shopify_order_id_key" ON "commerce_orders"("tenant_id", "shopify_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_orders_tenant_id_idempotency_key_key" ON "commerce_orders"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_pickup_orders_order_id_key" ON "commerce_pickup_orders"("order_id");

-- CreateIndex
CREATE INDEX "commerce_pickup_orders_tenant_id_status_idx" ON "commerce_pickup_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_pickup_orders_tenant_id_customer_id_idx" ON "commerce_pickup_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_pickup_orders_tenant_id_qr_code_key" ON "commerce_pickup_orders"("tenant_id", "qr_code");

-- CreateIndex
CREATE INDEX "commerce_activity_logs_tenant_id_customer_id_created_at_idx" ON "commerce_activity_logs"("tenant_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "commerce_activity_logs_tenant_id_shopify_customer_id_create_idx" ON "commerce_activity_logs"("tenant_id", "shopify_customer_id", "created_at");

-- CreateIndex
CREATE INDEX "commerce_activity_logs_tenant_id_event_type_created_at_idx" ON "commerce_activity_logs"("tenant_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_insights_customer_id_key" ON "customer_insights"("customer_id");

-- CreateIndex
CREATE INDEX "customer_insights_tenant_id_rfm_segment_idx" ON "customer_insights"("tenant_id", "rfm_segment");

-- CreateIndex
CREATE INDEX "customer_insights_tenant_id_churn_risk_idx" ON "customer_insights"("tenant_id", "churn_risk");

-- CreateIndex
CREATE UNIQUE INDEX "customer_insights_tenant_id_customer_id_key" ON "customer_insights"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_lists_tenant_id_is_system_idx" ON "customer_lists"("tenant_id", "is_system");

-- CreateIndex
CREATE UNIQUE INDEX "customer_lists_tenant_id_system_type_key" ON "customer_lists"("tenant_id", "system_type");

-- CreateIndex
CREATE INDEX "customer_list_items_tenant_id_customer_id_idx" ON "customer_list_items"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_list_items_tenant_id_list_id_customer_id_key" ON "customer_list_items"("tenant_id", "list_id", "customer_id");

-- CreateIndex
CREATE INDEX "pricing_rules_tenant_id_is_active_idx" ON "pricing_rules"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "pricing_rules_tenant_id_target_type_idx" ON "pricing_rules"("tenant_id", "target_type");

-- CreateIndex
CREATE INDEX "pricing_rules_tenant_id_execution_mode_idx" ON "pricing_rules"("tenant_id", "execution_mode");

-- CreateIndex
CREATE INDEX "pricing_rules_tenant_id_shopify_sync_state_idx" ON "pricing_rules"("tenant_id", "shopify_sync_state");

-- CreateIndex
CREATE INDEX "customers_tenant_id_last_order_at_idx" ON "customers"("tenant_id", "last_order_at");

-- AddForeignKey
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_pickup_orders" ADD CONSTRAINT "commerce_pickup_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_pickup_orders" ADD CONSTRAINT "commerce_pickup_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_pickup_orders" ADD CONSTRAINT "commerce_pickup_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_pickup_orders" ADD CONSTRAINT "commerce_pickup_orders_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_activity_logs" ADD CONSTRAINT "commerce_activity_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_activity_logs" ADD CONSTRAINT "commerce_activity_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_lists" ADD CONSTRAINT "customer_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_list_items" ADD CONSTRAINT "customer_list_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_list_items" ADD CONSTRAINT "customer_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "customer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_list_items" ADD CONSTRAINT "customer_list_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_target_customer_user_id_fkey" FOREIGN KEY ("target_customer_user_id") REFERENCES "customer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill new Commerce permissions into existing system member roles.
UPDATE "member_roles"
SET "permissions" = "permissions" || '{
  "orders.read": true,
  "orders.write": true,
  "pricing.read": true,
  "pricing.write": true
}'::jsonb
WHERE "slug" IN ('owner', 'admin');

UPDATE "member_roles"
SET "permissions" = "permissions" || '{
  "orders.read": true,
  "pricing.read": true
}'::jsonb
WHERE "slug" = 'agent';
