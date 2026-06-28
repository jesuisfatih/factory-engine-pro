CREATE TABLE "workflow_rule_cooldowns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fire_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_rule_cooldowns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_rule_cooldowns_tenant_id_rule_id_customer_id_key"
    ON "workflow_rule_cooldowns"("tenant_id", "rule_id", "customer_id");

CREATE INDEX "workflow_rule_cooldowns_tenant_id_customer_id_idx"
    ON "workflow_rule_cooldowns"("tenant_id", "customer_id");

CREATE INDEX "workflow_rule_cooldowns_tenant_id_rule_id_idx"
    ON "workflow_rule_cooldowns"("tenant_id", "rule_id");

ALTER TABLE "workflow_rule_cooldowns"
    ADD CONSTRAINT "workflow_rule_cooldowns_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_rule_cooldowns"
    ADD CONSTRAINT "workflow_rule_cooldowns_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_rule_cooldowns"
    ADD CONSTRAINT "workflow_rule_cooldowns_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
