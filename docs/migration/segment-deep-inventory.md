# Segment Deep Inventory

Date: 2026-06-28

Status: approval gate. This document is an inventory only. Segment transfer must not start until the owner approves the target decisions below.

## Source Files Read

Old system, read-only source:

- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/segments/segments.service.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/segments/segments.controller.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/segments/dto/segments.dto.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/shopify-customers/shopify-customer-segments.service.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/shopify-customers/shopify-customers.controller.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/shopify-customers/shopify-customers.service.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/src/customers/customer-intelligence.service.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/prisma/schema.prisma`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/prisma/migrations/20260326223000_add_shopify_customer_segment_snapshots/migration.sql`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/backend/prisma/migrations/20260626083000_phase5_segment_system/migration.sql`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/admin/lib/segment-rules.ts`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/admin/app/segments/page.tsx`
- `C:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/admin/components/ShopifySegmentImportSelect.tsx`

New system comparison:

- `C:/Users/mhmmd/Desktop/factory-engine-pro/packages/contracts/src/operations.ts`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/services/backend/src/modules/segments/segments.service.ts`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/services/backend/src/modules/segments/segments.controller.ts`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/services/backend/src/modules/segments/segments.repository.ts`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/services/backend/src/modules/segments/segment-evaluation.worker.ts`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/apps/admin/src/features/operations/SegmentsPage.tsx`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/apps/admin/src/components/SegmentModal.tsx`
- `C:/Users/mhmmd/Desktop/factory-engine-pro/apps/admin/src/lib/live-data.ts`

## Old System Runtime Shape

The old segment module is not an 8-item RFM seed list. It is a dynamic rule engine with these layers:

- Segment CRUD, preview, evaluate-one, evaluate-all.
- Rule grammar over company, company user, Shopify customer, behavioral metrics, and period order metrics.
- Shopify segment catalog import from the Shopify Admin GraphQL `segments` API.
- Shopify segment membership snapshot tables used by preview/evaluation.
- Company assignment persistence with current winner segment and historical matched/unmatched states.
- Segment ownership mapped to sales assignment behavior.
- Domain events for segment enter/exit, consumed by marketing/mail flows.

The old public backend endpoints are:

- `GET /segments`
- `GET /segments/:id`
- `POST /segments/preview`
- `POST /segments/evaluate-all`
- `POST /segments/:id/evaluate`
- `POST /segments`
- `PUT /segments/:id`
- `DELETE /segments/:id`
- `GET /segments/:id/ownership`
- `PUT /segments/:id/ownership`
- `DELETE /segments/:id/ownership`
- `GET /shopify-customers/segments`
- `GET /shopify-customers/tags`
- `POST /shopify-customers/insights/calculate`
- `GET /shopify-customers/insights/summary`
- `GET /shopify-customers/insights/at-risk`
- `GET /shopify-customers/insights/segment/:segment`

## Old Data Model Footprint

Core segment tables:

- `segments`: rule definition, `conditions`, `rules`, `rules_hash`, `match_mode`, `priority`, `priority_global`, `audience_type`, `lifecycle_stage`, cached count, last evaluated timestamp.
- `segment_company_memberships`: canonical segment membership per company.
- `company_segment_assignments`: current and historical match state, winner marker, lifecycle stage, match counters, metrics snapshot.
- `segment_ownerships`: segment owner mapping to `selleruser_id` or team, importance, daily cap, visual token.

Shopify segment snapshot tables:

- `shopify_customer_segments`: Shopify Admin segment metadata, query, count, sync status, last sync.
- `shopify_customer_segment_members`: Shopify segment member snapshots by Shopify customer id.

Signal tables used by evaluation:

- `companies`: account/company candidate and current segment cache.
- `company_users`: role, active state, email, direct Shopify customer id link.
- `shopify_customers`: tags, marketing consent, account state, locale, order count, total spent.
- `company_intelligence`: behavioral aggregates, buyer intent, churn risk, upsell potential, engagement score, current behavior segment.
- `orders_local`: period revenue/order/quantity metrics.
- `catalog_products`: collection lookup for scoped period rules.

Sales ownership side effects:

- `sales_segment_ownerships`
- `sales_assignments`
- `company.settings.salesManagement.assignedOwner`

Important boundary: the new project must not wholesale-transfer old `sales`, `sellerusers`, or forbidden modules. Only the segment ownership semantics should be translated to the new `Member` model and the new task/assignment model when approved.

## Old Rule Grammar

Match mode:

- `all`
- `any`

Operators:

- `gt`
- `gte`
- `lt`
- `lte`
- `eq`
- `neq`
- `contains`
- `in`
- `notIn`

Audience/group families:

- Company
- Company User
- Shopify Customer
- Existing Metrics/Behavior

Old fields:

- Company: `companyStatus`, `companyGroup`, `companyEmail`, `companyPhone`, `companyTaxId`, `currentLifecycleStage`
- Company user: `teamCount`, `companyUserRole`, `companyUserIsActive`
- Shopify customer: `shopifyCustomerTags`, `shopifyCustomerSegmentIds`, `shopifyCustomerAcceptsMarketing`, `shopifyCustomerState`, `shopifyCustomerLocale`, `shopifyCustomerOrdersCount`, `shopifyCustomerTotalSpent`
- Behavior/metrics: `buyerIntent`, `segment`, `totalRevenue`, `totalOrders`, `avgOrderValue`, `daysSinceLastOrder`, `engagementScore`, `churnRisk`, `upsellPotential`, `totalSessions`, `totalProductViews`, `totalAddToCarts`
- Period metrics: `periodRevenue`, `periodOrders`, `periodQuantity`

Scope support:

- `all`
- `product`
- `collection`

Period fields support `timeframeDays` and optional product/collection `scopeValues`. Collection scope needs catalog product collection metadata.

## Old Evaluation Flow

1. Normalize conditions.
2. Extract requested Shopify segment ids from `shopifyCustomerSegmentIds` conditions.
3. Ensure Shopify segment membership snapshots are fresh. Snapshot freshness threshold is 15 minutes.
4. Load candidates:
   - companies
   - company intelligence
   - company users
   - linked Shopify customers by direct `companyUser.shopifyCustomerId`
   - linked Shopify customers by normalized email match
5. Build preview signals:
   - company matches
   - company user matches
   - Shopify customer matches
   - linked vs unlinked Shopify customers
   - primary entity group: `company`, `company_user`, `shopify_customer`, or `mixed`
6. For period metrics, load matching orders and optionally catalog collections.
7. Apply `all` or `any` logic:
   - company conditions evaluate against the company candidate.
   - company user conditions match if at least one linked user satisfies the user condition group.
   - Shopify customer conditions match if at least one linked Shopify customer satisfies the Shopify condition group.
8. Persist assignments:
   - sort matched segments by priority, then name.
   - winner becomes company current segment.
   - upsert `company_segment_assignments`.
   - update unmatched historical assignments to `is_matched=false`.
   - sync canonical memberships.
   - update segment count and last evaluated timestamp.
9. Side effects:
   - update sales owner if segment ownership has an active direct owner and the company is not manually owned.
   - clear old segment-owned sales assignment when a company exits that segment.
   - emit `mail-marketing.domain.segment_enter` and `mail-marketing.domain.segment_exit`.

## Old Admin UI Behavior

Old `admin/app/segments/page.tsx` is a full builder, not a static modal.

Expected UI behaviors:

- List segments with search, active/inactive chips, rules count, match mode, company count.
- Empty state when no segments exist.
- Detail pane with preview cards and last evaluated timestamp.
- Create/edit side sheet with condition builder.
- Rule field groups and operator filtering.
- Shopify segment live search selector for `shopifyCustomerSegmentIds`.
- Tag multi-select behavior for `shopifyCustomerTags`.
- Preview before save.
- Separate preview result sections:
  - company results
  - company user matches
  - Shopify customer matches
  - unlinked Shopify customers
- Evaluate one and evaluate all buttons.
- Ownership assignment to selleruser/sales rep in the old system.
- Clear UI error messages when segment load, preview, save, evaluate, delete, or ownership save fails.

## New System Current State

The new system already has a segment module, but it is materially shallower:

- Backend uses `Customer` as the only candidate pool.
- `preview` returns only total customers, match count, total revenue, average orders, at-risk count, and a flat match sample.
- It does not model company user signals separately.
- It does not model Shopify customer segment snapshot tables.
- It does not call Shopify Admin segment APIs.
- It does not support `shopifyCustomerSegmentIds`.
- It does not support `shopifyCustomerAcceptsMarketing`, `shopifyCustomerState`, `shopifyCustomerLocale`, `shopifyCustomerOrdersCount`, `shopifyCustomerTotalSpent`.
- It does not support `periodRevenue`, `periodOrders`, `periodQuantity`, `timeframeDays`, product scope, or collection scope in the evaluator, even though the contract has partial scope fields.
- It does not persist `company_segment_assignments` equivalent history.
- It does not emit old mail marketing `segment_enter` / `segment_exit` events. It fires new workflow triggers for member added/removed only.
- Ownership maps to new `Member`, which is correct for the new identity model, but old sales assignment behavior still needs a new-system decision.
- `apps/admin/src/features/operations/SegmentsPage.tsx` is real API-bound and has loading/empty/error states, but its builder field list is reduced.
- `apps/admin/src/components/SegmentModal.tsx` and `apps/admin/src/lib/live-data.ts` present preview counts as if there are Shopify/unlinked counts, but those are derived from the same backend match count and are not old-system parity.

## Required Transfer Decisions

Before code transfer, these decisions need explicit approval:

1. Candidate model
   - Recommended: adapt old `CompanyCandidate` to the new 5-layer model:
     - `Customer` = old company/account candidate
     - `CustomerUser` = old company user candidate
     - Shopify customer signals = data inside/synced onto `Customer` plus a new Shopify segment snapshot table
   - Do not add old `Company` or `CompanyUser` tables.

2. Shopify segment snapshots
   - Recommended: add new tenant-scoped tables equivalent to:
     - `shopify_customer_segments`
     - `shopify_customer_segment_members`
   - Use new `tenant_id`, new Shopify tenant config credentials, and no old merchant model.

3. Assignment history
   - Recommended: add a new `segment_customer_assignments` or equivalent history table instead of only `segment_customer_memberships`.
   - Keep current `segments.customer_count` and `segment_customer_memberships` as canonical current membership.

4. Ownership behavior
   - Recommended: keep new `Member` ownership, not old `selleruser`.
   - Translate old auto owner behavior into the new customer assignment/task axis model only after deciding how it interacts with `customer_assignments`.

5. Mail/workflow side effects
   - Recommended: emit both new workflow triggers and a mail-domain event equivalent for marketing flow enrollment.
   - Do not import old dittofeed/event-bus modules.

6. UI builder
   - Recommended: replace the current reduced field picker with the old grouped builder behavior adapted to new contracts.
   - Add Shopify segment live-search component backed by the new `/shopify-customers/segments` endpoint.

7. RFM
   - Old RFM has 11 segments: `champions`, `loyal`, `potential_loyalist`, `new_customers`, `promising`, `need_attention`, `about_to_sleep`, `at_risk`, `cant_lose`, `hibernating`, `lost`, plus fallback `other`.
   - The previous 8 seeded RFM rows were incomplete and should not be restored as seed data.
   - RFM/CLV metrics must be calculated from synced Shopify orders/customers, not seeded rows.

## Proposed Transfer Sequence After Approval

1. Expand contracts:
   - add old segment field set
   - add `shopifyCustomerSegmentIds`
   - keep scope/timeframe in contract
   - keep zod validation strict

2. Add Prisma migration:
   - Shopify segment snapshot tables
   - segment assignment/history table if approved
   - any indexes needed for tenant, segment, customer lookup

3. Port backend services:
   - Shopify segment catalog/snapshot service
   - segment candidate loader over new `Customer` and `CustomerUser`
   - period metrics over `CommerceOrder.lineItems` and `CatalogProduct.collections`
   - evaluator group semantics
   - assignment persistence and membership events

4. Port admin UI:
   - grouped field selector
   - Shopify segment import selector
   - separate preview sections
   - evaluate all/evaluate one
   - ownership management with `Member`
   - empty/full/error states

5. Add bulk actions:
   - `POST /api/v1/segments/evaluate-all`
   - `POST /api/v1/aircall/reprocess-resolved`
   - `POST /api/v1/customers/assign-default-axis`

6. Run live sequence:
   - Shopify sync complete
   - segment evaluate-all
   - Aircall reprocess
   - assign default axis
   - Linda `/staff` UI verification

## Approval Needed

Approve or change these target decisions:

- Use new `Customer`/`CustomerUser` model instead of old `Company`/`CompanyUser`.
- Add Shopify segment snapshot tables.
- Add assignment history table.
- Translate old `selleruser` ownership to new `Member`.
- Emit new workflow plus mail-domain segment events, without transferring forbidden old event-bus/dittofeed modules.

Until these are approved, no segment transfer implementation should start.
