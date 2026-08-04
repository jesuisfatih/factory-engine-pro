# DTFBank staff collaboration live acceptance

Date: 2026-08-04

Production scope: DTFBank only

Implementation commit: `1ae7c6d Add shared customer contact collaboration`

## Acceptance results

### 1. Dashboard pins persist

- Pinned a real follow-up for Angela Ocampo.
- Reloaded the production dashboard.
- The counter remained `Pinned 1`, the card remained pinned, and the same customer remained on the pinned board.
- The temporary acceptance pin was removed after the screenshot.

Evidence: `01-pin-persists-after-refresh.png`

### 2. Notes can be deleted

- Created a temporary personal note as the signed-in Charlette member.
- Verified the author-only delete control and explicit confirmation state.
- Deleted the note and searched for the exact title.
- Production returned the empty state, proving the note no longer existed.

Evidence:

- `02-note-delete-control-live.png`
- `03-note-delete-confirmation-live.png`
- `04-note-deleted-live.png`

### 3. Shared customer notes and contact context

- Added a temporary internal note to a real customer from the production staff dashboard.
- Reopened the same customer in Customer 360.
- Verified the author, timestamp, internal-only label, customer match, Shopify customer id, purchase context, and Aircall history in one popup.
- The Shopify abandoned-checkout Admin block uses the same tenant-safe customer resolver and reads the latest internal note plus the latest shared contact state.
- The temporary acceptance note was deleted by its exact tenant, body, and row id after the screenshot; the remaining exact-match count is `0`.

Evidence:

- `05-customer-shared-note-and-call-history-live.png`
- `06-customer-internal-note-live.png`

## Production verification

- API: `https://api.dtfbank.com/api/v1/health` returned `{ "ok": true, "service": "factory-engine-pro-backend" }`.
- Database: Vultr managed PostgreSQL reports 80 migrations and `Database schema is up to date!`.
- Migration: `202608040002_person_workspace_collaboration` is applied.
- Shopify extension target: `admin.abandoned-checkout-details.block.render`.
- Shopify extension version: `factory-engine-dtf-bank-27`.
- Shopify version: https://dev.shopify.com/dashboard/129018466/apps/330121805825/versions/1076477231105

## Automated verification

Seven focused tests pass:

1. Author-only note soft deletion.
2. Pin/unpin idempotency without duplicate state.
3. Abandoned-checkout context returns latest contact and internal note.
4. Active dial creates a ten-minute collision window.
5. Aircall ended events produce completed shared contact state.
6. Older ringing webhooks cannot regress a completed call.
7. Active calls remain visible ahead of scheduled follow-ups.

The Shopify Admin surface itself requires an authenticated Shopify Admin session. The extension was deployed and its service contract was tested; the live in-app browser session did not contain Shopify Admin authentication, so this package does not include a fabricated Shopify screenshot.
