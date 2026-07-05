# Personnel UIX Adaptation Inventory

This document maps the patron-authored personnel UIX in `ibaysal/factory-engine-pro`
to the real Factory Engine Pro backend, rule engine, tenant-safe data model, and
MCP editable layer.

Rules for this adaptation:
- The reference backend is not used.
- Reference UIX elements are not removed or dismissed.
- Every visible staff value must come from live API data.
- Staff UI must not expose implementation terms: AI, workflow, rule, axis, sales,
  support, commission, debug, resolver.
- Admin/debug traces stay out of staff screens.

## Reference Backend Trace Semantics

Reference snapshot inspected locally:
`C:/tmp/ibaysal-factory-engine-pro-readonly` at commit
`3752e75 Complete staff dashboard live wiring: backend counters, cases, churn signals, at-risk cadence, reminders`.
Refreshing from GitHub was attempted but DNS resolution for `github.com` failed in
this environment, so this table only claims what is visible in that local
reference checkout.

| Reference trace | Observed backend/API source | UI intent behind it | Factory Engine Pro target semantics | Required decision |
| --- | --- | --- | --- | --- |
| Command center / Daily Operations | `GET /person/workspace/daily-operations`, `personDailyOperationsSchema`, `PersonWorkspaceService.dailyOperationsFor` | One staff page should carry current-call work, assigned portfolio, pins, and top counters | Keep one staff-safe `PersonDailyOperationsDto` contract. React reads `display*` fields first and never derives staff wording from raw metadata | Preserve in our backend; continue expanding only through typed staff-safe fields |
| Daily Call List | Reference daily task rows come from `ServiceRequest` rows with source call/email links and Aircall member scoping | Staff sees recent call-generated follow-ups, not segment customers | Our Daily Call List remains last 7 days / today / archive call work. Source is Aircall/transcript/rule-created staff tasks scoped to the current member | Keep distinct from Priority Kanban; no segment grouping in Daily list |
| Priority Kanban | `SegmentOwnership -> SegmentCustomerMembership -> Customer` plus latest order/call/note context | Staff sees their owned customer portfolio grouped by assigned segment | Our `segmentGroups` and `priorityKanban` remain the portfolio source. Cards need phone, email, latest order, latest call, open work, latest note, call/note/pin/detail actions | Preserve; never populate Priority from Daily task query |
| Task Brief | Reference `personTaskBrief` includes `aiBrief`, `workflowTrace`, `matchedRuleId`, prompt key/version/model/confidence | Staff needs a direct call plan and customer context | Backend may keep raw trace internally, but staff contract must expose `displayReason`, `displayConcern`, `displayOutcome`, `displayActions`, history, and commerce snapshots | Hide raw `aiBrief`, prompt/model, rule trace, matched ids from staff UI |
| Customer Archive | Reference `personCustomerArchive()` returns active Shopify customers with `take: 1000`; reference UI filters client-side | Staff wants Shopify customer lookup, not the routine calling list | Our archive must stay server-side paginated/searchable with `limit/offset/search`, default 10, options 50/100/150 | Do not regress to all-customer client filtering |
| Customer notes from archive | Reference shares customer note flow between list and archive | Staff must add notes from either assigned customers or Shopify archive detail | Our archive note endpoint must accept only real Shopify customers and write through staff note permissions, while assigned-list notes keep workspace scope | Preserve split endpoints |
| Cases page | `GET /person/workspace/cases`, `personCaseRowSchema`, `openCaseWhere()` includes customer self-service/admin/customer-facing and also support-axis rows | Patron wants customer issues visible, but automatic support case creation is forbidden | Staff surface should be "Customer Requests" only when source is manual, customer self-service, or admin-created. Rule-generated/support-axis work must not be counted as customer request work | Do not port `CasesView` as-is; remove support-axis/source leakage from request counts |
| Commission request | Reference Customers UI calls `fetchMyCommissionRequests` and `submitCommissionRequest` and renders a `%` action | User explicitly banned commission request/commission UI in staff | No staff commission column, action, modal, route, or API call | Keep out of staff UI completely |
| At-risk cadence worker | Reference `AtRiskCadenceService` creates follow-up service requests through `support.create` and adds `metadata.aiSource` | Staff needs risk-based customer work, but not automatic support cases | Our equivalent must be rule/scheduled-workflow driven staff work with staff-safe display text, not support-case automation | Use scheduled workflow action/materialization, not `support.create` |
| "15 days later show this call" | Reference cadence is daily sweep; our rules module has `deferred_materialization` timing and scheduled-action MCP endpoints | Staff should not see the item until the future date arrives | The create-task action should materialize at `runAt`/delay time after revalidation. It is not merely a `dueAt` on an already visible task | Keep/extend scheduled workflow actions; prove visible only after materialization |
| Staff sync | Reference `syncTasks` calls backfill plus resolver reprocess for recent 7 days | Staff wants latest calls, but token/cost must not be re-burned for old transcripts | Staff sync should backfill/pull recent calls and queue only new/missing resolver work. Version repair/reprocess belongs to admin repair tooling, not every staff refresh | Preserve our cheaper sync behavior; do not call broad reprocess from staff sync |
| Dev fallback fixtures | Reference `apps/person/src/api/live.ts` has DEV fallback comments and `dev-fixture` imports | UI authors wanted local visual work without auth | Production Factory Engine Pro cannot show fallback, seed, mock, fixture, or invented data | Do not import this pattern |
| Navigation and frontend customization | Reference has source-defined sidebar; our system has `navigationOverrides`, `elementOverrides`, `contentBlocks`, `themeOverrides`, source patch lane | Patron wants sidebar names/order/groups/badges/default route and safe visual control | Runtime customization stays typed and sanitized. Source patch lane can validate plans only; maintainer applies after proof | Preserve strict MCP boundary |

## Element Inventory

| UI element | Reference location | Patron intent | Owner surface | Live data required | Current backend support | Required work | Staff-safe name | MCP editable | Acceptance proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today focus | `apps/person/src/views/CallQueue.tsx` | Staff opens the panel and immediately knows what matters today | Personnel | Daily follow-ups, missed work, at-risk customers, request count, call count | Partial: daily list and summary exist; today focus fields are not first-class | Add summary contract fields and render command center | Today's focus | copy/theme/section order | `/staff/queue` screenshot with focus items from API |
| Incoming/Outbound call KPIs | `CallQueue.tsx` | Show current day call activity | Personnel | Aircall events for current member today | Partial: Aircall events exist; summary lacks fields | Add backend summary counts by mapped Aircall user | Incoming calls, Outbound calls | label/order/theme | API response + screenshot |
| Open cases/request KPI | `CallQueue.tsx` | Show customer work waiting for staff | Personnel | Open manual/customer-created requests scoped to staff | Partial: request rows exist | Add staff-safe open request count | Open requests | label/order/theme | API response + screenshot |
| Missed tasks | `CallQueue.tsx` | Separate old/unreached follow-ups from normal daily list | Personnel | Daily follow-up cards older than today or marked unreached | Partial: card createdAt exists | Render collapsible missed section from live cards | Missed follow-ups | section visibility/order | Screenshot with count or empty state |
| At-risk customers | `CallQueue.tsx` | Surface customers likely to leave | Personnel | Priority customer churn/urgency signals | Partial: customer insight influences score; no explicit field | Add optional customer risk fields to priority cards | At-risk customers | section visibility/order | API response + screenshot |
| Follow-up list | `CallQueue.tsx` | Main last-7-days call work list | Personnel | ServiceRequest rows created by call signals, scoped to member | Exists | Preserve drag/drop, archive, transfer, call plan | Follow-up list | fields/copy/theme | Screenshot + reorder proof |
| Priority kanban | `CallQueue.tsx` | Staff's assigned customer portfolio by segment | Personnel | SegmentOwnership -> SegmentCustomerMembership -> Customer | Exists | Preserve segment grouping and enrich with risk fields | Priority customers | fields/copy/theme | Screenshot with segment groups |
| Priority customer actions | `CallQueue.tsx` | Call, note, pin, open customer history from each customer card | Personnel | Phone, customer note write, pinned state, detail endpoint | Exists | Keep actions and validate Aircall source | Call, Note, Pin | labels/visibility | Screenshot + API mutation proof |
| Pinned board | `PinPanel.tsx` | Persistent staff board for important work/customers | Personnel | Person pinned task/customer state | Exists | Preserve | Pinned board | label/order/theme | Screenshot |
| Task brief playbook | `TaskBriefModal.tsx` | Staff sees what to do now in clear steps | Personnel | `person_brief`, orders, calls, notes, timeline, performance | Exists | Ensure internal labels are hidden and sections are ordered | Call plan | section order/copy/theme | Modal screenshot |
| Customer purchase history in modal | `TaskBriefModal.tsx` | Staff can confirm order context before calling | Personnel | Shopify customer match and recent orders | Exists | Preserve and keep live-only | Customer purchase history | fields/copy | Modal screenshot |
| Call summary in modal | `TaskBriefModal.tsx` | Staff sees mood, issue, motivators, objections | Personnel | Resolver output/person brief | Exists | Keep staff-safe language only | Call summary | fields/copy | Modal screenshot |
| Order/call/follow-up history | `TaskBriefModal.tsx` | Full recent customer timeline inside the call plan | Personnel | Orders, Aircall calls, notes, follow-up activity | Exists | Preserve | Order, call, and follow-up history | section order | Modal screenshot |
| Customer 360 popup | `packages/ui/src/customer-detail-panel.tsx` | Customer opens as a popup, not a right drawer | Personnel | Customer detail aggregate | Exists; component uses modal backdrop/panel | Preserve popup behavior | Customer 360 | tab labels/order later | Screenshot |
| Customer 360 Main tab | `packages/ui/src/customer-detail-panel.tsx` `main` / `mainContent` props | Customer opens with immediate operational context, not a cold profile table | Personnel | Priority/customer row context: reason, segment, urgency, phone, email, latest order, latest call, open work, latest note | Implemented as typed shared UI prop fed by live priority/customer rows; no reference backend port | Keep sourcing from `segmentGroups` or customer archive rows; do not show rule trace | Main | tab order/copy/theme later | Popup screenshot opened from Priority Kanban and Customer Archive |
| Customer 360 tabs | `customer-detail-panel.tsx` | Profile, Shopify Orders, Aircall Calls, Customer Requests, Email, Messages, Notes, follow-up history | Personnel | Customer aggregate tabs | Exists; commission filtered | Preserve; hide internal rule names for staff | Profile / orders / calls / requests / notes / follow-ups | tab visibility/order later | Screenshot |
| Customer archive | `apps/person/src/views/Customers.tsx` | Search full Shopify customer archive without freezing | Personnel | Server-side paginated Shopify customers | Exists: limit/offset/search | Preserve 10 default and 50/100/150 choices | Shopify customers | label/theme | Search/pagination screenshot |
| Sidebar/navigation | `Sidebar.tsx`, `FrontendCustomization.tsx` | Patron can rename/reorder/group/badge/default route safely | Personnel/MCP | Navigation override contract | Exists | Preserve and document | Staff workspace navigation | navigationOverrides | MCP preview/list proof |

## Current Completion And Evidence Status

Closed in source:

1. `PersonDailyOperationsDto.summary` exposes command-center fields for today
   calls, open requests, missed follow-ups, and at-risk customers.
2. `CallQueueView` renders the command-center layout with Today focus,
   incoming/outbound KPIs, missed work, at-risk customers, sync status, Daily
   Call List, Priority Kanban, and Pinned board.
3. Priority customer cards receive `customerRisk` and `customerRiskNote` from
   backend service logic, so at-risk presentation is not guessed in React.
4. Staff-facing copy paths now normalize forbidden implementation terms before
   rendering native surfaces, Customer 360 tab content, and MCP blocks.
5. Customer 360 is implemented as a centered popup (`customer-detail-backdrop`
   with centered `customer-detail-panel`), not as a right-side drawer.

Still requiring live evidence before final sign-off:

1. Authenticated `/staff/queue` screenshot with real Daily Call List,
   command-center KPIs, Priority Kanban, and Pinned board.
2. Task Brief modal screenshot proving the first viewport shows phone, reason,
   issue, outcome, and direct next steps without internal terms.
3. Customer 360 popup screenshot proving Shopify orders, Aircall calls, requests,
   email, messages, notes, and tasks are real API data.
4. Customer Archive search/pagination screenshot proving default 10 rows,
   50/100/150 row choices, and server-side search against the full Shopify
   archive without locking the page.
5. MCP proof: preview/apply/list for a safe navigation or element override, plus
   proof that source patch lane only validates allowlisted person/UI files and
   does not apply or deploy source code.

## Implementation Order

1. Extend person contracts with command-center summary fields and customer risk
   metadata.
2. Populate the fields in `PersonWorkspaceService.dailyOperationsFor` from live
   ServiceRequest, Aircall, Segment, and CustomerInsight data.
3. Render staff command-center sections in `CallQueueView` using the new fields.
4. Keep TaskBriefModal, CustomerDetailPanel, CustomerArchive, and MCP customization
   behavior intact; only expand where the inventory requires it.
5. Run typecheck/build, then collect API and UI evidence.

## Implementation Notes

- `PersonDailyOperationsDto.summary` now exposes live command-center fields:
  `incomingCallsToday`, `outboundCallsToday`, `callsMadeToday`,
  `openRequestsCount`, `missedFollowUpCount`, and `atRiskCustomerCount`.
- Daily follow-up cards now carry `unreached`, `missedNote`, `customerRisk`,
  and `customerRiskNote` metadata from backend logic.
- Priority customer items now carry `customerRisk` and `customerRiskNote` so
  the at-risk section is not guessed in React.
- `staff.queue` MCP customization now has `focus.before` and `focus.after`
  slots around the native Today focus command center.
- `PersonQueueCardDto` and `PersonDailyCallItem` now expose staff-safe display
  fields: `displayTitle`, `displayReason`, `displayConcern`,
  `displayOutcome`, `displayActions`, `displayBadges`,
  `displayCustomerSummary`, `displayCommerceSnapshot`, and
  `displayCallSnapshot`.
- Daily cards, missed-work rows, priority customer cards, and the call plan
  modal read those display fields first. Raw internal task metadata stays as
  fallback data only, not as the normal staff-facing copy source.
- Staff customer-request counts now only accept real customer-request sources:
  `manual` customer-facing rows, `customer_self_service`, `admin_created`, or
  explicit `customer_request` categories. Support-axis/workflow artifacts from
  the reference backend are not counted as staff customer requests.
- Daily queue cards and Task Brief API responses no longer return rule canvas
  links, workflow traces, matched rule ids, raw task state snapshots, workflow
  triggers, actions, or axis metadata to the personnel panel. Admin can keep
  traceability; staff receives only call/task history in operational language.
- Daily card, Task Brief modal, Call Queue filters, and Calendar call-plan
  rendering now read staff-safe display fields and `callExcerpt`; they do not
  derive labels, steps, ordering, or statistics from raw brief metadata.
- Calendar events now use the same staff-safe display contract
  (`displayReason`, `displayConcern`, `displayOutcome`, `displayActions`,
  `callExcerpt`) instead of returning prompt/model/confidence brief objects to
  the personnel frontend.
- `personQueueCardSchema` no longer accepts raw brief, workflow trace, task
  snapshot, or matched-rule fields. Those values may exist only as backend
  internal inputs while producing the staff-safe display contract.
- Reference `support.create` cadence semantics are intentionally mapped to our
  scheduled workflow/materialized staff-work model. Future follow-ups should
  appear when materialized, not as early visible tasks with a later due date.
- Customer 360 popup keeps the staff-safe terminology switch for call summaries,
  customer request descriptions, and call tags while preserving admin-capable
  raw tab keys internally.
- Customer 360 now supports a typed `Main` tab. Priority Kanban opens it from
  live `segmentGroups` item context; Customer Archive / Routine Call List open
  it from live customer row context. The reference `mainContent` / `main`
  backend trace is therefore semantized as staff-safe operational context, not
  copied as backend code.
- Staff-visible person workspace errors no longer mention workspace axis,
  call-analysis task internals, or raw transfer axis values. Transfer failures
  use focus labels such as Purchase intent / Customer care.
- Customer 360 no longer exposes the reference panel's staff-facing "Tasks"
  wording as a cold technical tab. Staff sees "Follow-ups" and the summary
  metric also reads "Follow-ups"; internal task ids can still exist in backend
  history, but the personnel UI presents them as customer follow-up work.
- Customer 360 Main tab values are passed through the same staff-safe text
  normalization used by the rest of the personnel surface. This keeps future
  `main`/`mainContent` suppliers from leaking internal words if an upstream
  contract accidentally contains them.
- Task Brief and Customer 360 use "follow-up" / "call" for personnel-visible
  work language. The reference backend's raw task/transcript terminology may
  still exist in internal schemas, but staff-visible titles, instructions,
  timeline labels, note placeholders, and generated fallback actions must not
  surface those raw names.
- Customer Archive notes now use a dedicated archive endpoint. The routine
  calling-list note endpoint still enforces assigned-workspace customer scope;
  the archive endpoint only accepts real Shopify customers and preserves the
  same staff note write permission used by the existing personnel note flow.
- Customer Archive and Routine Call List share the same React view component,
  but their table semantics are separate. Column definitions now recompute when
  `archive` mode changes so archive headers/actions cannot retain routine-list
  wording after a route switch.
- Task Brief modal call summary no longer labels raw analysis fields as
  `Intent` or `Urgency`. Staff now sees display-contract language: issue,
  next step, checks, signals, and friction.
- Staff-safe text filtering now covers native calendar/transfer surfaces,
  Customer 360 tab content, and MCP-rendered copy/content blocks. Runtime
  customization can still change labels and blocks, but forbidden internal
  terms are normalized before rendering.
- Runtime navigation override labels and sidebar group labels are normalized
  again at render time. This keeps old or manually inserted customization
  records from leaking internal terms into staff navigation while preserving
  stable nav ids, routes, permissions, and default route behavior.
- Pinned board rows and daily-card accessibility labels now use the same
  staff-safe display path as the visible Daily Call List and modal surfaces, so
  fallback task titles, segment labels, and tooltip metadata cannot leak
  internal terminology through secondary UI affordances.
- Frontend source patch preview/proof responses now expose machine-readable
  safety flags: `appliesPatch: false`, `deploysCode: false`,
  `maintainerMustApplyPatch: true`, and `humanApprovalRequired: true`. This
  makes it explicit that MCP validates source patch plans and proof packages
  but does not apply files or deploy code.
