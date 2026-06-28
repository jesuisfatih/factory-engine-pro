ALTER TABLE "tenant_configs"
  ADD COLUMN "urgency_scoring_config" JSONB NOT NULL DEFAULT '{}';
