-- CreateEnum
CREATE TYPE "MailDeliveryStatus" AS ENUM ('queued', 'sending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "mail_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'system',
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "status" "MailDeliveryStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "mail_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_deliveries_tenant_id_status_created_at_idx" ON "mail_deliveries"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_tenant_id_event_key_created_at_idx" ON "mail_deliveries"("tenant_id", "event_key", "created_at");

-- CreateIndex
CREATE INDEX "mail_deliveries_tenant_id_recipient_email_idx" ON "mail_deliveries"("tenant_id", "recipient_email");

-- AddForeignKey
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
