-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('member', 'customer_user', 'sub_user');

-- CreateEnum
CREATE TYPE "PrincipalStatus" AS ENUM ('invited', 'active', 'disabled', 'archived');

-- CreateEnum
CREATE TYPE "AuthTokenKind" AS ENUM ('refresh', 'password_reset', 'invitation');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "shopify_domain" TEXT,
    "shopify_admin_token_encrypted" TEXT,
    "shopify_api_key_encrypted" TEXT,
    "shopify_api_secret_encrypted" TEXT,
    "webhook_hmac_key_encrypted" TEXT,
    "aircall_api_id_encrypted" TEXT,
    "aircall_api_token_encrypted" TEXT,
    "aircall_webhook_secret_encrypted" TEXT,
    "anthropic_api_key_encrypted" TEXT,
    "resend_api_key_encrypted" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT,
    "status" "PrincipalStatus" NOT NULL DEFAULT 'invited',
    "last_login_at" TIMESTAMP(3),
    "invitation_accepted_at" TIMESTAMP(3),
    "aircall_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_role_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "shopify_customer_id" TEXT,
    "company_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "billing_address" JSONB,
    "shipping_address" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT,
    "status" "PrincipalStatus" NOT NULL DEFAULT 'invited',
    "spending_limit_cents" INTEGER,
    "spending_used_cents" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "parent_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT,
    "status" "PrincipalStatus" NOT NULL DEFAULT 'invited',
    "spending_limit_cents" INTEGER,
    "spending_used_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_user_role_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_user_role_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sub_user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "AuthTokenKind" NOT NULL,
    "principal_type" "PrincipalType" NOT NULL,
    "principal_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "principal_type" "PrincipalType",
    "principal_id" TEXT,
    "email" TEXT,
    "action" TEXT NOT NULL,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configs_tenant_id_key" ON "tenant_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "members_tenant_id_status_idx" ON "members"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "members_tenant_id_aircall_user_id_idx" ON "members"("tenant_id", "aircall_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_tenant_id_email_key" ON "members"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "member_roles_tenant_id_idx" ON "member_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_roles_tenant_id_slug_key" ON "member_roles"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "member_role_assignments_tenant_id_member_id_idx" ON "member_role_assignments"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "member_role_assignments_tenant_id_role_id_idx" ON "member_role_assignments"("tenant_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_role_assignments_tenant_id_member_id_role_id_key" ON "member_role_assignments"("tenant_id", "member_id", "role_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_status_idx" ON "customers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "customers_tenant_id_email_idx" ON "customers"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_shopify_customer_id_key" ON "customers"("tenant_id", "shopify_customer_id");

-- CreateIndex
CREATE INDEX "customer_users_tenant_id_customer_id_idx" ON "customer_users"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_users_tenant_id_status_idx" ON "customer_users"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_users_tenant_id_email_key" ON "customer_users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "sub_users_tenant_id_customer_id_idx" ON "sub_users"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "sub_users_tenant_id_parent_user_id_idx" ON "sub_users"("tenant_id", "parent_user_id");

-- CreateIndex
CREATE INDEX "sub_users_tenant_id_status_idx" ON "sub_users"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_users_tenant_id_email_key" ON "sub_users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "customer_roles_tenant_id_idx" ON "customer_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_roles_tenant_id_slug_key" ON "customer_roles"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "customer_user_role_assignments_tenant_id_customer_user_id_idx" ON "customer_user_role_assignments"("tenant_id", "customer_user_id");

-- CreateIndex
CREATE INDEX "customer_user_role_assignments_tenant_id_role_id_idx" ON "customer_user_role_assignments"("tenant_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_user_role_assignments_tenant_id_customer_user_id_r_key" ON "customer_user_role_assignments"("tenant_id", "customer_user_id", "role_id");

-- CreateIndex
CREATE INDEX "sub_user_role_assignments_tenant_id_sub_user_id_idx" ON "sub_user_role_assignments"("tenant_id", "sub_user_id");

-- CreateIndex
CREATE INDEX "sub_user_role_assignments_tenant_id_role_id_idx" ON "sub_user_role_assignments"("tenant_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_user_role_assignments_tenant_id_sub_user_id_role_id_key" ON "sub_user_role_assignments"("tenant_id", "sub_user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_tenant_id_kind_principal_type_principal_id_idx" ON "auth_tokens"("tenant_id", "kind", "principal_type", "principal_id");

-- CreateIndex
CREATE INDEX "auth_tokens_tenant_id_expires_at_idx" ON "auth_tokens"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "auth_audit_logs_tenant_id_action_created_at_idx" ON "auth_audit_logs"("tenant_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "auth_audit_logs_tenant_id_email_idx" ON "auth_audit_logs"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "tenant_configs" ADD CONSTRAINT "tenant_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_role_assignments" ADD CONSTRAINT "member_role_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_role_assignments" ADD CONSTRAINT "member_role_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_role_assignments" ADD CONSTRAINT "member_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "member_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_users" ADD CONSTRAINT "customer_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_users" ADD CONSTRAINT "customer_users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_users" ADD CONSTRAINT "sub_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_users" ADD CONSTRAINT "sub_users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_users" ADD CONSTRAINT "sub_users_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_roles" ADD CONSTRAINT "customer_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_user_role_assignments" ADD CONSTRAINT "customer_user_role_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_user_role_assignments" ADD CONSTRAINT "customer_user_role_assignments_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_user_role_assignments" ADD CONSTRAINT "customer_user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "customer_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_user_role_assignments" ADD CONSTRAINT "sub_user_role_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_user_role_assignments" ADD CONSTRAINT "sub_user_role_assignments_sub_user_id_fkey" FOREIGN KEY ("sub_user_id") REFERENCES "sub_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_user_role_assignments" ADD CONSTRAINT "sub_user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "customer_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_logs" ADD CONSTRAINT "auth_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

