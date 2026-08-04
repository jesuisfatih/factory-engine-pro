CREATE TABLE "customer_internal_notes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "author_member_id" TEXT,
  "body" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'person_workspace',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_internal_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_internal_notes_tenant_id_customer_id_created_at_idx"
ON "customer_internal_notes"("tenant_id", "customer_id", "created_at");

CREATE INDEX "customer_internal_notes_tenant_id_author_member_id_created_at_idx"
ON "customer_internal_notes"("tenant_id", "author_member_id", "created_at");

ALTER TABLE "customer_internal_notes"
ADD CONSTRAINT "customer_internal_notes_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_internal_notes"
ADD CONSTRAINT "customer_internal_notes_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_internal_notes"
ADD CONSTRAINT "customer_internal_notes_author_member_id_fkey"
FOREIGN KEY ("author_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
