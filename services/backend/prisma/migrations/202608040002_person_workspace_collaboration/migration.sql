CREATE TABLE "person_workspace_pins" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_workspace_pins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "person_workspace_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "linked_customer_id" TEXT,
    "linked_service_request_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_workspace_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "person_workspace_note_replies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_workspace_note_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_contact_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "member_id" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'phone',
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "external_call_id" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_contact_activities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "person_workspace_pins" ADD CONSTRAINT "person_workspace_pins_target_kind_check"
CHECK ("target_kind" IN ('customer', 'service_request'));
ALTER TABLE "person_workspace_notes" ADD CONSTRAINT "person_workspace_notes_kind_check"
CHECK ("kind" IN ('scratch', 'queue'));
ALTER TABLE "customer_contact_activities" ADD CONSTRAINT "customer_contact_activities_status_check"
CHECK ("status" IN ('calling', 'attempted', 'connected', 'no_answer', 'voicemail', 'follow_up_scheduled', 'completed'));

CREATE UNIQUE INDEX "person_workspace_pins_tenant_id_member_id_target_kind_target_id_key"
ON "person_workspace_pins"("tenant_id", "member_id", "target_kind", "target_id");
CREATE INDEX "person_workspace_pins_tenant_id_member_id_target_kind_created_at_idx"
ON "person_workspace_pins"("tenant_id", "member_id", "target_kind", "created_at");
CREATE INDEX "person_workspace_pins_tenant_id_target_kind_target_id_idx"
ON "person_workspace_pins"("tenant_id", "target_kind", "target_id");

CREATE INDEX "person_workspace_notes_tenant_id_kind_updated_at_idx"
ON "person_workspace_notes"("tenant_id", "kind", "updated_at");
CREATE INDEX "person_workspace_notes_tenant_id_author_member_id_updated_at_idx"
ON "person_workspace_notes"("tenant_id", "author_member_id", "updated_at");
CREATE INDEX "person_workspace_notes_tenant_id_linked_customer_id_updated_at_idx"
ON "person_workspace_notes"("tenant_id", "linked_customer_id", "updated_at");
CREATE INDEX "person_workspace_notes_tenant_id_linked_service_request_id_idx"
ON "person_workspace_notes"("tenant_id", "linked_service_request_id");
CREATE INDEX "person_workspace_notes_tenant_id_deleted_at_idx"
ON "person_workspace_notes"("tenant_id", "deleted_at");

CREATE INDEX "person_workspace_note_replies_tenant_id_note_id_created_at_idx"
ON "person_workspace_note_replies"("tenant_id", "note_id", "created_at");
CREATE INDEX "person_workspace_note_replies_tenant_id_author_member_id_created_at_idx"
ON "person_workspace_note_replies"("tenant_id", "author_member_id", "created_at");

CREATE UNIQUE INDEX "customer_contact_activities_tenant_id_external_call_id_key"
ON "customer_contact_activities"("tenant_id", "external_call_id");
CREATE INDEX "customer_contact_activities_tenant_id_customer_id_started_at_idx"
ON "customer_contact_activities"("tenant_id", "customer_id", "started_at");
CREATE INDEX "customer_contact_activities_tenant_id_member_id_started_at_idx"
ON "customer_contact_activities"("tenant_id", "member_id", "started_at");
CREATE INDEX "customer_contact_activities_tenant_id_status_expires_at_idx"
ON "customer_contact_activities"("tenant_id", "status", "expires_at");

ALTER TABLE "person_workspace_pins" ADD CONSTRAINT "person_workspace_pins_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_workspace_pins" ADD CONSTRAINT "person_workspace_pins_member_id_fkey"
FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_workspace_notes" ADD CONSTRAINT "person_workspace_notes_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_workspace_notes" ADD CONSTRAINT "person_workspace_notes_author_member_id_fkey"
FOREIGN KEY ("author_member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_workspace_notes" ADD CONSTRAINT "person_workspace_notes_deleted_by_member_id_fkey"
FOREIGN KEY ("deleted_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "person_workspace_notes" ADD CONSTRAINT "person_workspace_notes_linked_customer_id_fkey"
FOREIGN KEY ("linked_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "person_workspace_notes" ADD CONSTRAINT "person_workspace_notes_linked_service_request_id_fkey"
FOREIGN KEY ("linked_service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "person_workspace_note_replies" ADD CONSTRAINT "person_workspace_note_replies_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_workspace_note_replies" ADD CONSTRAINT "person_workspace_note_replies_note_id_fkey"
FOREIGN KEY ("note_id") REFERENCES "person_workspace_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_workspace_note_replies" ADD CONSTRAINT "person_workspace_note_replies_author_member_id_fkey"
FOREIGN KEY ("author_member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_contact_activities" ADD CONSTRAINT "customer_contact_activities_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_contact_activities" ADD CONSTRAINT "customer_contact_activities_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_contact_activities" ADD CONSTRAINT "customer_contact_activities_member_id_fkey"
FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing task and customer pins before removing metadata-backed state.
INSERT INTO "person_workspace_pins" ("id", "tenant_id", "member_id", "target_kind", "target_id", "created_at", "updated_at")
SELECT
  'pwp_' || md5(sr.id || pin.member_id || clock_timestamp()::text),
  sr.tenant_id,
  pin.member_id,
  'service_request',
  sr.id,
  to_timestamp((pin.pinned_at #>> '{}')::double precision / 1000.0),
  sr.updated_at
FROM service_requests sr
CROSS JOIN LATERAL jsonb_each(COALESCE(sr.metadata->'personPinnedBy', '{}'::jsonb)) AS pin(member_id, pinned_at)
JOIN members m ON m.id = pin.member_id AND m.tenant_id = sr.tenant_id
WHERE jsonb_typeof(pin.pinned_at) = 'number'
ON CONFLICT ("tenant_id", "member_id", "target_kind", "target_id") DO NOTHING;

INSERT INTO "person_workspace_pins" ("id", "tenant_id", "member_id", "target_kind", "target_id", "created_at", "updated_at")
SELECT
  'pwp_' || md5(sr.id || sr.assigned_member_id || clock_timestamp()::text),
  sr.tenant_id,
  sr.assigned_member_id,
  'customer',
  sr.customer_id,
  sr.created_at,
  sr.updated_at
FROM service_requests sr
WHERE sr.metadata->>'personWorkspaceKind' = 'customer_pin'
  AND sr.assigned_member_id IS NOT NULL
  AND sr.customer_id IS NOT NULL
  AND sr.status NOT IN ('closed', 'resolved', 'transferred')
ON CONFLICT ("tenant_id", "member_id", "target_kind", "target_id") DO NOTHING;

-- Move personal and queue notes out of the task table while preserving ids, authors and replies.
INSERT INTO "person_workspace_notes" (
  "id", "tenant_id", "author_member_id", "kind", "title", "body",
  "linked_customer_id", "linked_service_request_id", "created_at", "updated_at"
)
SELECT
  sr.id,
  sr.tenant_id,
  sr.created_by_actor_id,
  CASE WHEN sr.metadata->>'noteKind' = 'queue' THEN 'queue' ELSE 'scratch' END,
  sr.title,
  COALESCE(sr.description, ''),
  linked_customer.id,
  linked_request.id,
  sr.created_at,
  sr.updated_at
FROM service_requests sr
JOIN members author ON author.id = sr.created_by_actor_id AND author.tenant_id = sr.tenant_id
LEFT JOIN customers linked_customer
  ON linked_customer.id = sr.metadata->>'linkedCustomer' AND linked_customer.tenant_id = sr.tenant_id
LEFT JOIN service_requests linked_request
  ON linked_request.id = sr.metadata->>'linkedQueueId' AND linked_request.tenant_id = sr.tenant_id
WHERE sr.metadata->>'personWorkspaceKind' = 'note'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "person_workspace_note_replies" ("id", "tenant_id", "note_id", "author_member_id", "body", "created_at")
SELECT c.id, c.tenant_id, c.service_request_id, c.actor_id, c.body, c.created_at
FROM service_request_comments c
JOIN person_workspace_notes n ON n.id = c.service_request_id AND n.tenant_id = c.tenant_id
JOIN members author ON author.id = c.actor_id AND author.tenant_id = c.tenant_id
WHERE c.internal = TRUE
ON CONFLICT ("id") DO NOTHING;

UPDATE service_requests
SET metadata = metadata - 'personPinnedBy'
WHERE metadata ? 'personPinnedBy';

DELETE FROM service_requests
WHERE metadata->>'personWorkspaceKind' IN ('customer_pin', 'note');
