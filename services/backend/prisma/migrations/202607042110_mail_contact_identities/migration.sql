CREATE TABLE IF NOT EXISTS "mail_contact_identities" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_key" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_user_id" TEXT,
  "shopify_customer_id" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_contact_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_entity_type_entity_key_key"
  ON "mail_contact_identities"("tenant_id", "entity_type", "entity_key");

CREATE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_contact_id_idx"
  ON "mail_contact_identities"("tenant_id", "contact_id");

CREATE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_customer_id_idx"
  ON "mail_contact_identities"("tenant_id", "customer_id");

CREATE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_customer_user_id_idx"
  ON "mail_contact_identities"("tenant_id", "customer_user_id");

CREATE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_shopify_customer_id_idx"
  ON "mail_contact_identities"("tenant_id", "shopify_customer_id");

CREATE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_email_idx"
  ON "mail_contact_identities"("tenant_id", "email");

CREATE INDEX IF NOT EXISTS "mail_contact_identities_tenant_id_phone_idx"
  ON "mail_contact_identities"("tenant_id", "phone");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mail_contact_identities_tenant_id_fkey'
  ) THEN
    ALTER TABLE "mail_contact_identities"
      ADD CONSTRAINT "mail_contact_identities_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mail_contact_identities_contact_id_fkey'
  ) THEN
    ALTER TABLE "mail_contact_identities"
      ADD CONSTRAINT "mail_contact_identities_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "mail_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "mail_contact_identities" (
  "id", "tenant_id", "contact_id", "entity_type", "entity_key", "customer_id", "email", "phone", "metadata", "created_at", "updated_at"
)
SELECT
  'mcid_' || md5(mc."tenant_id" || ':mail_contact:' || mc."id"),
  mc."tenant_id",
  mc."id",
  'mail_contact',
  mc."id",
  mc."customer_id",
  mc."normalized_email",
  mc."phone",
  jsonb_build_object('source', 'migration_backfill'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "mail_contacts" mc
ON CONFLICT ("tenant_id", "entity_type", "entity_key") DO NOTHING;

INSERT INTO "mail_contact_identities" (
  "id", "tenant_id", "contact_id", "entity_type", "entity_key", "customer_id", "email", "phone", "metadata", "created_at", "updated_at"
)
SELECT
  'mcid_' || md5(mc."tenant_id" || ':email:' || mc."normalized_email"),
  mc."tenant_id",
  mc."id",
  'email',
  mc."normalized_email",
  mc."customer_id",
  mc."normalized_email",
  mc."phone",
  jsonb_build_object('source', 'migration_backfill'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "mail_contacts" mc
WHERE mc."normalized_email" IS NOT NULL AND mc."normalized_email" <> ''
ON CONFLICT ("tenant_id", "entity_type", "entity_key") DO NOTHING;

INSERT INTO "mail_contact_identities" (
  "id", "tenant_id", "contact_id", "entity_type", "entity_key", "customer_id", "email", "phone", "metadata", "created_at", "updated_at"
)
SELECT
  'mcid_' || md5(mc."tenant_id" || ':phone:' || mc."id" || ':' || mc."phone"),
  mc."tenant_id",
  mc."id",
  'phone',
  mc."id" || ':' || mc."phone",
  mc."customer_id",
  mc."normalized_email",
  mc."phone",
  jsonb_build_object('source', 'migration_backfill'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "mail_contacts" mc
WHERE mc."phone" IS NOT NULL AND mc."phone" <> ''
ON CONFLICT ("tenant_id", "entity_type", "entity_key") DO NOTHING;

INSERT INTO "mail_contact_identities" (
  "id", "tenant_id", "contact_id", "entity_type", "entity_key", "customer_id", "email", "phone", "metadata", "created_at", "updated_at"
)
SELECT
  'mcid_' || md5(mc."tenant_id" || ':customer:' || mc."customer_id"),
  mc."tenant_id",
  mc."id",
  'customer',
  mc."customer_id",
  mc."customer_id",
  mc."normalized_email",
  mc."phone",
  jsonb_build_object('source', 'migration_backfill'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "mail_contacts" mc
WHERE mc."customer_id" IS NOT NULL
ON CONFLICT ("tenant_id", "entity_type", "entity_key") DO NOTHING;

INSERT INTO "mail_contact_identities" (
  "id", "tenant_id", "contact_id", "entity_type", "entity_key", "customer_id", "customer_user_id", "email", "phone", "metadata", "created_at", "updated_at"
)
SELECT
  'mcid_' || md5(mc."tenant_id" || ':customer_user:' || cu."id"),
  mc."tenant_id",
  mc."id",
  'customer_user',
  cu."id",
  mc."customer_id",
  cu."id",
  lower(cu."email"),
  cu."phone",
  jsonb_build_object(
    'source', 'migration_backfill',
    'customerUserName', nullif(trim(concat_ws(' ', cu."first_name", cu."last_name")), ''),
    'status', cu."status"
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "mail_contacts" mc
JOIN "customer_users" cu
  ON cu."tenant_id" = mc."tenant_id"
 AND cu."customer_id" = mc."customer_id"
WHERE mc."customer_id" IS NOT NULL
ON CONFLICT ("tenant_id", "entity_type", "entity_key") DO NOTHING;

INSERT INTO "mail_contact_identities" (
  "id", "tenant_id", "contact_id", "entity_type", "entity_key", "customer_id", "shopify_customer_id", "email", "phone", "metadata", "created_at", "updated_at"
)
SELECT
  'mcid_' || md5(mc."tenant_id" || ':shopify_customer:' || c."shopify_customer_id"),
  mc."tenant_id",
  mc."id",
  'shopify_customer',
  c."shopify_customer_id",
  mc."customer_id",
  c."shopify_customer_id",
  mc."normalized_email",
  mc."phone",
  jsonb_build_object('source', 'migration_backfill'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "mail_contacts" mc
JOIN "customers" c
  ON c."tenant_id" = mc."tenant_id"
 AND c."id" = mc."customer_id"
WHERE c."shopify_customer_id" IS NOT NULL AND c."shopify_customer_id" <> ''
ON CONFLICT ("tenant_id", "entity_type", "entity_key") DO NOTHING;
