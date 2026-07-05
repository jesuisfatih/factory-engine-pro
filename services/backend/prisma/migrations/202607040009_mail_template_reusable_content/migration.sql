CREATE TABLE "mail_template_snippets" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template_type" TEXT,
  "subject" TEXT,
  "html" TEXT,
  "css" TEXT,
  "text" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "is_system" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mail_template_snippets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_template_blocks" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "description" TEXT,
  "html" TEXT NOT NULL,
  "css" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "is_system" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mail_template_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_template_snippets_tenant_id_key_key"
ON "mail_template_snippets"("tenant_id", "key");

CREATE INDEX "mail_template_snippets_tenant_id_template_type_is_archived_updated_at_idx"
ON "mail_template_snippets"("tenant_id", "template_type", "is_archived", "updated_at");

CREATE UNIQUE INDEX "mail_template_blocks_tenant_id_key_key"
ON "mail_template_blocks"("tenant_id", "key");

CREATE INDEX "mail_template_blocks_tenant_id_category_is_archived_updated_at_idx"
ON "mail_template_blocks"("tenant_id", "category", "is_archived", "updated_at");

ALTER TABLE "mail_template_snippets"
ADD CONSTRAINT "mail_template_snippets_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mail_template_blocks"
ADD CONSTRAINT "mail_template_blocks_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
