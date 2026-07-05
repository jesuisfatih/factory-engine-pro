UPDATE "mail_campaigns" AS campaign
SET "created_by_member_id" = NULL
WHERE "created_by_member_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "members" AS member
    WHERE member."id" = campaign."created_by_member_id"
      AND member."tenant_id" = campaign."tenant_id"
  );

UPDATE "mail_campaigns" AS campaign
SET "approved_by_member_id" = NULL
WHERE "approved_by_member_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "members" AS member
    WHERE member."id" = campaign."approved_by_member_id"
      AND member."tenant_id" = campaign."tenant_id"
  );

CREATE INDEX IF NOT EXISTS "mail_campaigns_tenant_id_created_by_member_id_idx"
  ON "mail_campaigns"("tenant_id", "created_by_member_id");

CREATE INDEX IF NOT EXISTS "mail_campaigns_tenant_id_approved_by_member_id_idx"
  ON "mail_campaigns"("tenant_id", "approved_by_member_id");

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_created_by_member_id_fkey"
  FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mail_campaigns"
  ADD CONSTRAINT "mail_campaigns_approved_by_member_id_fkey"
  FOREIGN KEY ("approved_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
