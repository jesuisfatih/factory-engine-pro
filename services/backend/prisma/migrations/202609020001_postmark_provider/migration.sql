-- Postmark provider support (inactive until a tenant selects it).
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "mail_provider" TEXT;
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "postmark_server_token_encrypted" TEXT;
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "postmark_webhook_secret_encrypted" TEXT;
