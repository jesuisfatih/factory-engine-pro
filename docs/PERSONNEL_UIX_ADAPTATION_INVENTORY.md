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
| Order/call/task history | `TaskBriefModal.tsx` | Full recent customer timeline inside task | Personnel | Orders, Aircall calls, notes, tasks/activity | Exists | Preserve | Order, call, and task history | section order | Modal screenshot |
| Customer 360 popup | `packages/ui/src/customer-detail-panel.tsx` | Customer opens as a popup, not a right drawer | Personnel | Customer detail aggregate | Exists; component uses modal backdrop/panel | Preserve popup behavior | Customer 360 | tab labels/order later | Screenshot |
| Customer 360 tabs | `customer-detail-panel.tsx` | Profile, Shopify Orders, Aircall Calls, Customer Requests, Email, Messages, Notes, Tasks | Personnel | Customer aggregate tabs | Exists; commission filtered | Preserve; hide internal rule names for staff | Same labels | tab visibility/order later | Screenshot |
| Customer archive | `apps/person/src/views/Customers.tsx` | Search full Shopify customer archive without freezing | Personnel | Server-side paginated Shopify customers | Exists: limit/offset/search | Preserve 10 default and 50/100/150 choices | Shopify customers | label/theme | Search/pagination screenshot |
| Sidebar/navigation | `Sidebar.tsx`, `FrontendCustomization.tsx` | Patron can rename/reorder/group/badge/default route safely | Personnel/MCP | Navigation override contract | Exists | Preserve and document | Staff workspace navigation | navigationOverrides | MCP preview/list proof |

## Current Gaps To Close First

1. `PersonDailyOperationsDto.summary` does not expose first-class command-center
   fields for today calls, open requests, missed follow-ups, and at-risk customers.
2. `CallQueueView` lacks the reference UIX command-center layout: Today focus,
   incoming/outbound KPIs, missed section, and at-risk section.
3. Priority customer cards need explicit risk metadata so at-risk lists do not
   rely on frontend guessing.
4. Some CSS class names still use historical internal names. They are not visible,
   but new staff UI must avoid adding visible internal text.
5. Evidence must be collected after implementation through real API/build/UI proof.

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
- Daily cards, missed-work rows, priority customer cards, and the task brief
  modal read those display fields first. Raw internal task metadata stays as
  fallback data only, not as the normal staff-facing copy source.
- Customer 360 popup keeps the staff-safe terminology switch for call summaries,
  customer request descriptions, and call tags while preserving admin-capable
  raw tab keys internally.
