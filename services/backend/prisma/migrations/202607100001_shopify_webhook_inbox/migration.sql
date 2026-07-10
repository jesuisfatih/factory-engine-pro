CREATE TABLE "shopify_webhook_inbox" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shop_domain" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "webhook_id" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "payload" JSONB NOT NULL,
  "headers" JSONB NOT NULL DEFAULT '{}',
  "error_message" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shopify_webhook_inbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_webhook_inbox_tenant_id_dedupe_key_key"
  ON "shopify_webhook_inbox"("tenant_id", "dedupe_key");
CREATE INDEX "shopify_webhook_inbox_tenant_id_status_received_at_idx"
  ON "shopify_webhook_inbox"("tenant_id", "status", "received_at");
CREATE INDEX "shopify_webhook_inbox_tenant_id_topic_received_at_idx"
  ON "shopify_webhook_inbox"("tenant_id", "topic", "received_at");
CREATE INDEX "shopify_webhook_inbox_tenant_id_shop_domain_received_at_idx"
  ON "shopify_webhook_inbox"("tenant_id", "shop_domain", "received_at");

ALTER TABLE "shopify_webhook_inbox"
  ADD CONSTRAINT "shopify_webhook_inbox_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
