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

## Reference Backend Footprint Decision Matrix

This section is the guardrail for the patron UIX migration. The reference UI is
allowed to teach product intent, but its backend implementation is not copied.
Each backend footprint below is mapped to the Factory Engine Pro production
contract that must satisfy the same UI intent without leaking internal concepts
or changing the tenant/user model.

| Reference footprint | What the reference code actually does | Patron UI intent | Factory Engine Pro implementation lane | Do not port |
| --- | --- | --- | --- | --- |
| `person-workspace.controller.ts` exposes `summary`, `queue`, `daily-operations`, task archive/reorder/sync, customer detail, notes, calendar, messages, cases, training, requests | A single person workspace controller owns most staff-panel actions | Staff should work from one operational panel, not jump between unrelated apps | Keep `person-workspace` as the staff-safe facade. It may orchestrate customers, Aircall, Shopify, rules, notes, and mail services, but React receives one display contract per surface | Do not let modules speak to each other's tables from React. Do not expose admin/debug endpoints to staff |
| `dailyOperationsFor()` joins `SegmentOwnership`, `SegmentCustomerMembership`, `ServiceRequest`, `personDailyTaskOrder`, Aircall stats, pins, and open case counts | It builds the whole command center response in one service method | Patron wants the first screen to have Daily Call List, Priority Kanban, pinned board, sync/KPI status, and action counts | Keep one `PersonDailyOperationsDto` response, but keep query semantics separate: Daily = staff follow-ups from calls; Priority = owned Shopify segment customers | Do not merge Daily and Priority queries. Do not fill Priority from follow-up rows or Daily from segment rows |
| `dailyWorkflowRows()` selects `ServiceRequest` rows by assigned member, `sourceCallId`/`sourceEmailId`/matched workflow metadata, `axis in sales/account`, date window, and member archive metadata | It makes call-generated work visible in Daily Call List | Staff sees recent call follow-ups scoped to them, sorted by date and custom order | Keep this as internal query logic only. Public card contract is `displayTitle`, `displayReason`, `displayConcern`, `displayOutcome`, `displayActions`, snapshots, phone, order, call, pin/archive/transfer actions | Do not display `axis`, `workflow`, `rule`, source ids, matched rule ids, prompt names, or raw task snapshots |
| `syncTasks()` calls `aircall.backfillRecentCalls({ recentDays: 7 })` and `aircall.reprocessResolver({ recentDays: 7, limit: 500 })` together | Staff refresh can reprocess resolver work broadly | Staff wants latest calls without waiting for an admin | Staff sync may pull new/missing recent Aircall calls and enqueue missing resolver work only. Broad version repair/reprocess belongs to admin repair tooling | Do not burn tokens by re-reading old transcripts on every staff refresh. Do not tie page refresh to resolver reprocess |
| `taskBrief()` reads service request, orders, activity logs, related service requests, Aircall rows, matched rule, and returns `aiPsychAnalysis`, `rule`, `customerDetailUrl` | The modal receives both useful customer context and internal rule/debug context | Staff needs a direct call plan, context, history, notes, schedule, and call/email actions | Keep order/call/history/note/schedule data, but expose it as staff-safe call plan sections. Staff contract returns `callSummary`; raw rule/trace links stay out of the personnel response | Do not show rule canvas links, prompt key/version/model/confidence, matched rule ids, raw condition traces, or source labels in staff UI |
| `queueCard()` builds `aiBrief`, `workflowTrace`, badges, urgency, call/customer/product context, then returns card fields | The reference card object mixes internal production inputs with visible UI copy | Cards need rich display text and action badges | Use internal inputs only to produce public display fields. `publicPersonQueueCard()` strips internal brief/trace/snapshot/matched id before response validation | Do not make React infer copy from raw metadata. Do not add new UI fields unless backend provides staff-safe display equivalents |
| `customers()` uses `customerAssignment` axis ownership and returns a 120-row staff customer table | Staff wants a regular calling portfolio | The staff "Routine Call List" is assigned/owned contacts, not a full CRM dump. It may use assignments/segments depending on product semantics, but must remain scoped to the member | Do not call this "generic Customers" when it is a work list. Do not show commission or internal ownership labels |
| `customerArchive()` returns active Shopify customers with `take: 1000`; reference UI filters in memory | Staff wants a full Shopify customer lookup | Keep `customerArchive({ limit, offset, search })`, default 10, page-size options 50/100/150, and server-side search over name/email/phone/Shopify id | Do not preload thousands of customers. Do not client-filter 6000+ records |
| `customerArchiveDetail()` only checks active Shopify customer and then calls `customersService.detail()` | Archive detail is a Shopify customer file, even outside assigned portfolio | Staff can open any Shopify customer file from archive with real Shopify/Aircall/history tabs | Keep a separate archive detail endpoint and separate archive note endpoint. It must still be tenant-scoped and permission-checked | Do not reuse the assigned-customer note endpoint for archive rows. Do not bypass tenant context |
| Reference `Customers.tsx` calls commission request APIs and renders a `%` action plus commission KPI | Staff can request commission from customer rows | User explicitly removed commission from staff UI | No staff commission route, KPI, column, action, modal, or API call. Commission remains admin/organization-only if ever used | Do not port the commission UI or its backend calls |
| `cases()` returns `openCaseWhere()` rows where source is customer self-service/admin/customer-facing OR `axis = support` | Reference cases page mixes real customer requests with support-axis work | Staff should see real customer requests when humans create or customers submit them | Count/list only manual customer-facing, customer self-service, and admin-created customer requests. Keep automatic call/rule work as follow-ups | Do not count workflow/rule/call generated rows as customer requests. Do not auto-create support cases |
| `AtRiskCadenceService` daily worker creates rows via `support.create()` with `metadata.category = at_risk_cadence` and `aiSource = segment` | Risk signals become support-created service requests | Staff should get risk-based future call work | Model this as scheduled/materialized staff follow-up work or rule output, with support/customer request untouched | Do not call `support.create()` for automated risk cadence |
| Reference schedule form updates existing task `dueAt` immediately | Snooze/follow-up date is visible as a due date on already-visible work | User asked for "show this call 15 days later", not "due in 15 days but visible now" | Use deferred materialization: store scheduled action, revalidate when time arrives, then create/show the follow-up | Do not expose future follow-ups early unless explicitly pinned/scheduled by human |
| Reference UI detail `mainContent` embeds task brief in Customer 360 | Customer detail opens with immediate operational context | Customer 360 should start with why this customer matters right now | Keep typed `CustomerDetailMainInfo` / `mainContent` supplied by live Daily/Priority/Archive row context | Do not embed rule/debug/task trace panels in Customer 360 |
| Source sidebar is static in `Sidebar.tsx`; our system adds runtime customization | Patron wants sidebar names, order, group labels, badges, and default route controlled later | Use typed `navigationOverrides` with stable `navId`; use source patch lane only when runtime customization cannot express the change | Do not let MCP change route ids, permissions, auth, backend behavior, or deploy source directly |

### Backend Semantics That Must Stay Separate

- Daily Call List is staff follow-up work from recent call/email/routing signals.
  It is date-windowed and staff-orderable.
- Priority Kanban is the staff member's assigned Shopify segment portfolio. It
  is segment-grouped and changes as Shopify segment membership changes.
- Routine Call List is the staff member's regular calling portfolio. It is not
  the full Shopify archive.
- Customer Archive is full Shopify customer lookup with server-side pagination
  and search. It is not a work queue.
- Customer Requests are human/customer/admin-created request records only.
  Automated call/routing output stays as follow-up work.
- Future follow-ups that should appear later are materialized later. A future
  visibility rule is not the same thing as setting `dueAt` on an already-visible
  row.

## Staff Queue UIX Parity Step - 2026-07-05

This step aligns our real staff queue composition with the patron/reference UIX
without using the reference backend.

| Reference UIX element | Our implemented surface | Backend/data rule |
| --- | --- | --- |
| Command-center top focus band | `today-focus` with daily focus items, urgent follow-ups, missed work, risk review, open request count, and calls made today | Uses `PersonDailyOperationsDto.summary` and live Daily Call List counts only |
| Icon KPI strip | KPI cards with colored icons for incoming calls, outbound calls, open requests, follow-ups, pinned, priority customers, and sync | Counts come from live summary, Daily Call List, pin board, and segment groups |
| Missed work block | `missed-v2` expandable list with avatar, note, phone, and action copy | Only cards with `unreached` or `missedNote`; no invented rows |
| At-risk block | `churn-v2` expandable list for customer risk notes | Only cards with live `customerRisk` / `customerRiskNote` flags |
| Follow-up list with filter chips | `followup-v2` panel with All / Urgent / Not reached / At risk filters and date separators | Filters operate on live Daily Call List rows already scoped to current staff |
| Reference card-v2 visual language | Daily cards now use avatar, title row, action badge, staff brief, card meta row, phone/order/activity/owner/focus, and pin/archive/transfer actions | Card text reads `display*` contract first. Fallbacks are staff-safe and do not expose internal terms |
| Segment portfolio navigation | `kanban-v2` panel with All lists / List N chips and previous/next list navigation | Priority customers still come only from `SegmentOwnership -> SegmentCustomerMembership -> Customer` |
| Segment customer cards | `segment-customer-card card-v2` with avatar, phone/email, latest note, latest order, latest call, open follow-up summary, call/note/pin actions | Uses live `segmentGroups` items. Clicking opens Customer 360 popup with real detail API data |
| Dark/light theme parity layer | Shared parity CSS plus dark overrides for focus, missed work, filters, cards, priority groups, and customer cards | Pure frontend presentation; no data semantics changed |
| Base theme density | Root tokens, body size, content padding, and KPI card density now match the patron/reference staff UIX baseline more closely | Pure frontend presentation; prevents the personnel panel from drifting into a heavier custom visual system |

Guardrails kept in this step:
- No reference backend code was copied.
- Daily Call List and Priority Kanban remain separate queries and separate UI
  semantics.
- Person-facing labels still pass through staff-safe text normalization.
- Runtime customization remains typed through `frontendCustomization`; raw
  script/html injection is still not allowed.
- MCP frontend customization changes runtime presentation or validates source
  patch plans. It does not silently change backend behavior, permissions, env,
  tenant data, or deployment state.

### Required Backend Contract Shape For Staff UIX

Every staff UI section must consume display-ready fields from backend contracts:

- `displayTitle`
- `displayReason`
- `displayConcern`
- `displayOutcome`
- `displayActions`
- `displayBadges`
- `displayCustomerSummary`
- `displayCommerceSnapshot`
- `displayCallSnapshot`
- `callExcerpt`
- typed customer/order/call/note/history arrays

Internal derivation inputs may include resolver output, rule execution metadata,
service request metadata, Aircall event payloads, Shopify order data, segment
membership, and urgency scoring, but those inputs are not a staff-facing API.
If a future UI element needs new wording or a new metric, add it to the backend
display contract first. React must not invent it from raw metadata.

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
| Customer 360 Main tab | `packages/ui/src/customer-detail-panel.tsx` `main` / `mainContent` props | Customer opens with immediate operational context, not a cold profile table | Personnel | Priority/customer row context and, when present, the matching Daily/Priority follow-up card | Implemented as typed shared UI prop fed by live priority/customer rows; matching follow-up cards embed the same `TaskBriefContent` used by the popup modal | Keep sourcing from `segmentGroups` or matching live cards; do not show rule trace | Main | tab order/copy/theme later | Popup screenshot opened from Priority Kanban and Customer Archive |
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
6. Customer 360 "Main" can now embed the same live `TaskBriefContent` used by
   the call-plan popup when the opened customer has a matching Daily/Priority
   card. This keeps the reference UIX behavior without duplicating or inventing
   staff copy in React.

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
- Task Brief detail now exposes staff-safe `callSummary` instead of the older
  internal `aiPsychAnalysis` response key, and the personnel response contract
  no longer includes a `rule` link field. The backend can still derive the
  summary from resolver/routing inputs internally, but the staff API only
  receives call-plan language.
- Unused public personnel contract exports for workflow trace, task state
  snapshot, and internal brief metadata were removed. Backend derivation may
  still keep prompt/model/trace data privately, but shared client contracts only
  describe staff-safe response shapes.
- Staff urgency breakdown and workspace scoring config now use
  `signalUrgency` / `signalUrgencyWeight` / `signalUrgencyScores` instead of
  `aiUrgency` names. Older stored config and metadata keys are still normalized
  on read so live tenant settings do not break.
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
- Customer Archive search remains server-side through `limit`, `offset`, and
  submitted `search`. Backend search also expands phone input into normalized
  phone variants, so pasted formats such as `(831) 319-1837`, `8313191837`, or
  `+18313191837` can match the same Shopify customer without client-side
  filtering thousands of rows.
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
- The staff queue top focus area was realigned to the reference `today-focus`
  composition so the first band uses the same compact focus-chip structure
  while keeping staff-safe follow-up/customer-request language.
- Daily Call List cards now expose a real staff Call action wired to the
  Aircall dial endpoint with source `daily_card`. MCP `elementOverrides` can
  show, hide, or rename the approved `callButton` field without raw CSS/HTML.
- Daily card Archive now opens a staff-safe completion dialog before hiding the
  follow-up. Optional notes are saved through the real note endpoint first, then
  the follow-up is archived, matching the reference completion intent without
  exposing "task" language to staff.
