CREATE TABLE "algorithm_strategies" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "surface_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "definition" JSONB NOT NULL,
  "reason" TEXT,
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_member_id" TEXT,
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "algorithm_strategies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "algorithm_strategy_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "strategy_id" TEXT NOT NULL,
  "surface_id" TEXT NOT NULL,
  "version_no" INTEGER NOT NULL,
  "json_snapshot" JSONB NOT NULL,
  "edited_by_member_id" TEXT,
  "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comment" TEXT,
  CONSTRAINT "algorithm_strategy_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "algorithm_strategy_simulations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "strategy_id" TEXT,
  "surface_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'passed',
  "window_start" TIMESTAMP(3),
  "window_end" TIMESTAMP(3),
  "sample_size" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB NOT NULL DEFAULT '{}',
  "created_by_member_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "algorithm_strategy_simulations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "algorithm_strategies_tenant_id_surface_id_status_idx" ON "algorithm_strategies"("tenant_id", "surface_id", "status");
CREATE INDEX "algorithm_strategies_tenant_id_created_by_member_id_idx" ON "algorithm_strategies"("tenant_id", "created_by_member_id");
CREATE INDEX "algorithm_strategies_tenant_id_activated_at_idx" ON "algorithm_strategies"("tenant_id", "activated_at");

CREATE UNIQUE INDEX "algorithm_strategy_versions_tenant_id_strategy_id_version_no_key" ON "algorithm_strategy_versions"("tenant_id", "strategy_id", "version_no");
CREATE INDEX "algorithm_strategy_versions_tenant_id_surface_id_edited_at_idx" ON "algorithm_strategy_versions"("tenant_id", "surface_id", "edited_at");
CREATE INDEX "algorithm_strategy_versions_tenant_id_edited_by_member_id_idx" ON "algorithm_strategy_versions"("tenant_id", "edited_by_member_id");

CREATE INDEX "algorithm_strategy_simulations_tenant_id_surface_id_created_at_idx" ON "algorithm_strategy_simulations"("tenant_id", "surface_id", "created_at");
CREATE INDEX "algorithm_strategy_simulations_tenant_id_strategy_id_idx" ON "algorithm_strategy_simulations"("tenant_id", "strategy_id");
CREATE INDEX "algorithm_strategy_simulations_tenant_id_created_by_member_id_idx" ON "algorithm_strategy_simulations"("tenant_id", "created_by_member_id");

ALTER TABLE "algorithm_strategies"
  ADD CONSTRAINT "algorithm_strategies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategies"
  ADD CONSTRAINT "algorithm_strategies_created_by_member_id_fkey"
  FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategy_versions"
  ADD CONSTRAINT "algorithm_strategy_versions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategy_versions"
  ADD CONSTRAINT "algorithm_strategy_versions_strategy_id_fkey"
  FOREIGN KEY ("strategy_id") REFERENCES "algorithm_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategy_versions"
  ADD CONSTRAINT "algorithm_strategy_versions_edited_by_member_id_fkey"
  FOREIGN KEY ("edited_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategy_simulations"
  ADD CONSTRAINT "algorithm_strategy_simulations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategy_simulations"
  ADD CONSTRAINT "algorithm_strategy_simulations_strategy_id_fkey"
  FOREIGN KEY ("strategy_id") REFERENCES "algorithm_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "algorithm_strategy_simulations"
  ADD CONSTRAINT "algorithm_strategy_simulations_created_by_member_id_fkey"
  FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
