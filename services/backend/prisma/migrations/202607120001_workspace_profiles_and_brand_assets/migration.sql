ALTER TABLE "tenant_configs"
ADD COLUMN "company_profile" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "brand_assets" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "members"
ADD COLUMN "job_title" TEXT,
ADD COLUMN "avatar_url" TEXT,
ADD COLUMN "timezone" TEXT;
