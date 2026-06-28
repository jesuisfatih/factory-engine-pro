# Segment Deep Inventory

Date: 2026-06-28

Status: implementation baseline. The original approval gate is closed by ROADMAP 23b1; this document now records old-system parity and the remaining implementation gaps.

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

The new system is now close to old-system parity for the segment engine core:

- Contracts expose the old 31 segment fields, 9 operators, `all/any` match mode, 3 audience types, timeframe, and `all/product/collection` scope.
- Backend evaluates over `Customer`, `CustomerUser`, linked Shopify customer signals, Shopify customer segment snapshots, behavior metrics, and period order metrics.
- Shopify segment metadata and membership snapshots are tenant-scoped in `shopify_customer_segments` and `shopify_customer_segment_members`.
- `shopifyCustomerSegmentIds` calls Shopify Admin segment membership sync before preview/evaluate, then uses the snapshot membership map for matching.
- `preview` returns separate company, customer user, Shopify customer, and unlinked Shopify customer counts plus match samples.
- `evaluate`, `evaluateForCustomer`, and `evaluateAll` persist current memberships, assignment history, current winner rows, and new workflow triggers for `segment.member_added` / `segment.member_removed`.
- Segment membership rows now keep `source='auto'` plus `shopify_segment_ref` when the match came through a real Shopify segment condition.
- Ownership maps to new `Member`, keeps old-style priority/importance/daily cap/auto assignment fields, and has a `team_id` compatibility column for old team ownership semantics.
- Admin `SegmentsPage` is real API-bound with loading, empty, and error states; it includes all 31 fields, operator filtering, period scope controls, preview before save, evaluate one/all, and a live Shopify segment selector.

Known remaining gaps:

- Old mail marketing `segment_enter` / `segment_exit` side effects are not directly imported. The new system intentionally fires workflow triggers and must wire mail enrollment through the new mail/rules pipeline, not old dittofeed/event-bus modules.
- Ownership team semantics are stored as `team_id`, but there is no separate new team assignment UI yet.
- RFM/CLV rows must remain computed from synced Shopify/customer data. The old 8 seeded RFM rows must not be restored.

## Resolved Transfer Decisions

1. Candidate model
   - `Customer` is the old account/company candidate.
   - `CustomerUser` is the old company-user candidate.
   - Shopify customer signals come from synced Shopify fields plus tenant-scoped Shopify segment snapshots.
   - Do not add old `Company` or `CompanyUser` tables.

2. Shopify segment snapshots
   - Keep tenant-scoped `shopify_customer_segments` and `shopify_customer_segment_members`.
   - Use new tenant Shopify config credentials and no old merchant model.

3. Assignment history
   - Keep `segment_customer_memberships` as canonical current membership.
   - Keep `segment_customer_assignments` for historical/current winner assignment state.

4. Ownership behavior
   - Keep new `Member` ownership, not old `selleruser`.
   - Persist optional `team_id` only as compatibility metadata until the new identity/team UX is explicit.

5. Mail/workflow side effects
   - Use new workflow triggers now.
   - Wire marketing/mail enrollment through the new mail pipeline later; do not import old dittofeed/event-bus modules.

6. UI builder
   - Use the old field/operator/scope grammar adapted to new contracts.
   - Use the live Shopify segment selector backed by the new Shopify segment endpoint.

7. Seed rule
   - Segment data is never seeded as customer/business data.
   - Shopify customers, Shopify segment memberships, orders, and RFM/CLV outcomes must come from sync/evaluation only.

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
