-- Google Workspace / Gmail API mail provider support.
-- Provider selection remains tenant-scoped and inactive until configured.
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "google_workspace_client_id_encrypted" TEXT;
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "google_workspace_client_secret_encrypted" TEXT;
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "google_workspace_refresh_token_encrypted" TEXT;
ALTER TABLE "tenant_configs" ADD COLUMN IF NOT EXISTS "google_workspace_sender_email" TEXT;
