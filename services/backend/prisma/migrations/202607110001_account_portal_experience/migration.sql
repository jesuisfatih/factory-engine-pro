ALTER TABLE "tenant_configs"
ADD COLUMN "account_portal_experience" JSONB NOT NULL DEFAULT '{}'::jsonb;
