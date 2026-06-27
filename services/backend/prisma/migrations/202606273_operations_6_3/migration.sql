-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2f80ed',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "priority_global" INTEGER NOT NULL DEFAULT 0,
    "audience_type" TEXT NOT NULL DEFAULT 'customer',
    "lifecycle_stage" TEXT,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "rules_hash" TEXT,
    "match_mode" TEXT NOT NULL DEFAULT 'all',
    "customer_count" INTEGER NOT NULL DEFAULT 0,
    "last_evaluated_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_ownerships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "importance" TEXT NOT NULL DEFAULT 'normal',
    "daily_cap" INTEGER,
    "auto_assign_new" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "visual_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_customer_memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DECIMAL(12,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_customer_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_user_id" TEXT,
    "assigned_member_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "surface" TEXT NOT NULL DEFAULT 'internal',
    "source_call_id" TEXT,
    "source_email_id" TEXT,
    "source_form_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "created_by_actor_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "resolution_code" TEXT,
    "resolution_note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request_comments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "attachments_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_access_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "company_name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "estimated_monthly_volume" TEXT,
    "message" TEXT,
    "password_hash" TEXT NOT NULL,
    "shopify_customer_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_member_id" TEXT,
    "review_notes" TEXT,
    "resolved_customer_id" TEXT,
    "resolved_customer_user_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "b2b_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_access_request_files" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_base64" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_access_request_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "segments_tenant_id_is_active_idx" ON "segments"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "segments_tenant_id_priority_idx" ON "segments"("tenant_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "segment_ownerships_tenant_id_segment_id_member_id_key" ON "segment_ownerships"("tenant_id", "segment_id", "member_id");

-- CreateIndex
CREATE INDEX "segment_ownerships_tenant_id_segment_id_idx" ON "segment_ownerships"("tenant_id", "segment_id");

-- CreateIndex
CREATE INDEX "segment_ownerships_tenant_id_member_id_idx" ON "segment_ownerships"("tenant_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "segment_customer_memberships_tenant_id_segment_id_customer_id_key" ON "segment_customer_memberships"("tenant_id", "segment_id", "customer_id");

-- CreateIndex
CREATE INDEX "segment_customer_memberships_tenant_id_customer_id_idx" ON "segment_customer_memberships"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "segment_customer_memberships_tenant_id_segment_id_idx" ON "segment_customer_memberships"("tenant_id", "segment_id");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_customer_id_idx" ON "service_requests"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_customer_user_id_idx" ON "service_requests"("tenant_id", "customer_user_id");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_assigned_member_id_idx" ON "service_requests"("tenant_id", "assigned_member_id");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_status_idx" ON "service_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_surface_idx" ON "service_requests"("tenant_id", "surface");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_updated_at_idx" ON "service_requests"("tenant_id", "updated_at");

-- CreateIndex
CREATE INDEX "service_request_comments_tenant_id_service_request_id_idx" ON "service_request_comments"("tenant_id", "service_request_id");

-- CreateIndex
CREATE INDEX "service_request_comments_tenant_id_actor_id_idx" ON "service_request_comments"("tenant_id", "actor_id");

-- CreateIndex
CREATE INDEX "b2b_access_requests_tenant_id_status_submitted_at_idx" ON "b2b_access_requests"("tenant_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "b2b_access_requests_tenant_id_email_status_idx" ON "b2b_access_requests"("tenant_id", "email", "status");

-- CreateIndex
CREATE INDEX "b2b_access_request_files_tenant_id_request_id_idx" ON "b2b_access_request_files"("tenant_id", "request_id");

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_ownerships" ADD CONSTRAINT "segment_ownerships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_ownerships" ADD CONSTRAINT "segment_ownerships_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_ownerships" ADD CONSTRAINT "segment_ownerships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_customer_memberships" ADD CONSTRAINT "segment_customer_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_customer_memberships" ADD CONSTRAINT "segment_customer_memberships_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_customer_memberships" ADD CONSTRAINT "segment_customer_memberships_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_comments" ADD CONSTRAINT "service_request_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_comments" ADD CONSTRAINT "service_request_comments_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_access_requests" ADD CONSTRAINT "b2b_access_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_access_request_files" ADD CONSTRAINT "b2b_access_request_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_access_request_files" ADD CONSTRAINT "b2b_access_request_files_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "b2b_access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 6.3 operation permissions into existing system roles.
UPDATE "member_roles"
SET "permissions" = "permissions" || jsonb_build_object(
    'segments.read', true,
    'segments.write', true,
    'support.read', true,
    'support.write', true,
    'b2b_access.read', true,
    'b2b_access.write', true
)
WHERE "slug" IN ('owner', 'admin');

UPDATE "member_roles"
SET "permissions" = "permissions" || jsonb_build_object(
    'segments.read', true,
    'support.read', true,
    'support.write', true,
    'b2b_access.read', true
)
WHERE "slug" = 'agent';
