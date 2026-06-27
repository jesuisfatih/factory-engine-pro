-- CreateTable
CREATE TABLE "aircall_users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "aircall_user_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "extension" TEXT,
    "available_status" TEXT,
    "timezone" TEXT,
    "language" TEXT,
    "default_number_id" TEXT,
    "numbers" JSONB NOT NULL DEFAULT '[]',
    "raw_payload" JSONB,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircall_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircall_numbers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "aircall_number_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "digits" TEXT NOT NULL,
    "country" TEXT,
    "timezone" TEXT,
    "is_ivr" BOOLEAN NOT NULL DEFAULT false,
    "tenant_slug" TEXT,
    "raw_payload" JSONB,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircall_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircall_webhook_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "aircall_webhook_id" TEXT,
    "custom_name" TEXT,
    "url" TEXT,
    "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "last_ping_at" TIMESTAMP(3),
    "last_event_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_failure_reason" TEXT,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircall_webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircall_webhook_inbox" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "tenant_slug" TEXT,
    "raw_body" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "signature" TEXT,
    "token_claim" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "rejection_reason" TEXT,
    "event_type" TEXT,
    "external_call_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "aircall_webhook_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircall_call_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_call_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_timestamp" TIMESTAMP(3) NOT NULL,
    "direction" TEXT,
    "status" TEXT,
    "duration_seconds" INTEGER,
    "number_id" TEXT,
    "aircall_user_id" TEXT,
    "contact_phone" TEXT,
    "contact_phone_e164" TEXT,
    "contact_email" TEXT,
    "recording_url" TEXT,
    "voicemail_url" TEXT,
    "transcript_raw" TEXT,
    "transcript_version" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "comments" JSONB NOT NULL DEFAULT '[]',
    "raw_payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,

    CONSTRAINT "aircall_call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "aircall_call_id" TEXT,
    "customer_id" TEXT,
    "customer_user_id" TEXT,
    "current_operator_id" TEXT,
    "direction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "caller_number" TEXT,
    "caller_number_e164" TEXT,
    "caller_email" TEXT,
    "started_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "transcript_raw" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "call_id" TEXT,
    "aircall_call_id" TEXT,
    "source_event_id" TEXT,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircall_sync_states" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircall_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aircall_users_tenant_id_aircall_user_id_key" ON "aircall_users"("tenant_id", "aircall_user_id");
CREATE INDEX "aircall_users_tenant_id_idx" ON "aircall_users"("tenant_id");
CREATE INDEX "aircall_users_tenant_id_email_idx" ON "aircall_users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "aircall_numbers_tenant_id_aircall_number_id_key" ON "aircall_numbers"("tenant_id", "aircall_number_id");
CREATE INDEX "aircall_numbers_tenant_id_idx" ON "aircall_numbers"("tenant_id");
CREATE INDEX "aircall_numbers_tenant_id_digits_idx" ON "aircall_numbers"("tenant_id", "digits");
CREATE INDEX "aircall_numbers_tenant_slug_idx" ON "aircall_numbers"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "aircall_webhook_configs_tenant_id_key" ON "aircall_webhook_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "aircall_webhook_inbox_tenant_id_idx" ON "aircall_webhook_inbox"("tenant_id");
CREATE INDEX "aircall_webhook_inbox_status_idx" ON "aircall_webhook_inbox"("status");
CREATE INDEX "aircall_webhook_inbox_received_at_idx" ON "aircall_webhook_inbox"("received_at");
CREATE INDEX "aircall_webhook_inbox_tenant_slug_idx" ON "aircall_webhook_inbox"("tenant_slug");
CREATE INDEX "aircall_webhook_inbox_external_call_id_idx" ON "aircall_webhook_inbox"("external_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "aircall_call_events_tenant_id_external_call_id_event_type_event_timestamp_key" ON "aircall_call_events"("tenant_id", "external_call_id", "event_type", "event_timestamp");
CREATE INDEX "aircall_call_events_tenant_id_idx" ON "aircall_call_events"("tenant_id");
CREATE INDEX "aircall_call_events_external_call_id_idx" ON "aircall_call_events"("external_call_id");
CREATE INDEX "aircall_call_events_event_type_idx" ON "aircall_call_events"("event_type");
CREATE INDEX "aircall_call_events_received_at_idx" ON "aircall_call_events"("received_at");
CREATE INDEX "aircall_call_events_contact_phone_e164_idx" ON "aircall_call_events"("contact_phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "calls_tenant_id_aircall_call_id_key" ON "calls"("tenant_id", "aircall_call_id");
CREATE INDEX "calls_tenant_id_idx" ON "calls"("tenant_id");
CREATE INDEX "calls_aircall_call_id_idx" ON "calls"("aircall_call_id");
CREATE INDEX "calls_customer_id_idx" ON "calls"("customer_id");
CREATE INDEX "calls_customer_user_id_idx" ON "calls"("customer_user_id");
CREATE INDEX "calls_current_operator_id_idx" ON "calls"("current_operator_id");
CREATE INDEX "calls_status_idx" ON "calls"("status");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_source_event_id_key" ON "call_events"("source_event_id");
CREATE INDEX "call_events_tenant_id_idx" ON "call_events"("tenant_id");
CREATE INDEX "call_events_call_id_idx" ON "call_events"("call_id");
CREATE INDEX "call_events_aircall_call_id_idx" ON "call_events"("aircall_call_id");
CREATE INDEX "call_events_event_type_idx" ON "call_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "aircall_sync_states_tenant_id_resource_key" ON "aircall_sync_states"("tenant_id", "resource");
CREATE INDEX "aircall_sync_states_tenant_id_idx" ON "aircall_sync_states"("tenant_id");

-- CreateIndex
CREATE INDEX "sync_logs_tenant_id_service_created_at_idx" ON "sync_logs"("tenant_id", "service", "created_at");
CREATE INDEX "sync_logs_tenant_id_status_idx" ON "sync_logs"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "aircall_users" ADD CONSTRAINT "aircall_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aircall_numbers" ADD CONSTRAINT "aircall_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aircall_webhook_configs" ADD CONSTRAINT "aircall_webhook_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aircall_webhook_inbox" ADD CONSTRAINT "aircall_webhook_inbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "aircall_call_events" ADD CONSTRAINT "aircall_call_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calls" ADD CONSTRAINT "calls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "aircall_sync_states" ADD CONSTRAINT "aircall_sync_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
