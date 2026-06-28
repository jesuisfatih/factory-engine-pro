CREATE TABLE "aircall_member_map" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "aircall_user_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircall_member_map_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "aircall_member_map_tenant_id_aircall_user_id_key" ON "aircall_member_map"("tenant_id", "aircall_user_id");
CREATE UNIQUE INDEX "aircall_member_map_tenant_id_member_id_key" ON "aircall_member_map"("tenant_id", "member_id");
CREATE INDEX "aircall_member_map_tenant_id_member_id_idx" ON "aircall_member_map"("tenant_id", "member_id");

ALTER TABLE "aircall_member_map" ADD CONSTRAINT "aircall_member_map_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aircall_member_map" ADD CONSTRAINT "aircall_member_map_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "aircall_member_map" ("id", "tenant_id", "aircall_user_id", "member_id", "source", "created_at", "updated_at")
SELECT
    CONCAT('acmap_', md5("tenant_id" || ':' || "aircall_user_id")),
    "tenant_id",
    "aircall_user_id",
    "id",
    'member_legacy',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "members"
WHERE "aircall_user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
