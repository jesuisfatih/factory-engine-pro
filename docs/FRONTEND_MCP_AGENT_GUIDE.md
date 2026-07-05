# Frontend MCP Agent Guide

This guide is for external engineering agents connected through Factory Engine MCP.

The agent may help improve allowed frontend surfaces, but it must work inside explicit product, security, and verification boundaries.

## Operating Model

1. Read this guide.
2. List frontend surfaces.
3. Read the target surface contract.
4. List existing frontend customizations for the surface.
5. For runtime UI changes, use the frontend customization DSL first.
6. Preview the customization.
7. Apply it only after preview warnings are clean and the user approves activation.
8. Use list/get/rollback tools for audit and recovery.
9. Use source-file patching only through the maintainer source patch lane when the runtime DSL cannot express the requested change.

The agent must not directly edit production source files or deploy without a separate publish tool and human approval.

## MCP Frontend Tools

- `read_frontend_agent_guide`
- `list_frontend_surfaces`
- `get_frontend_surface_contract`
- `preview_frontend_customization`
- `apply_frontend_customization`
- `list_frontend_customizations`
- `get_frontend_customization`
- `rollback_frontend_customization`
- `preview_frontend_source_patch`
- `validate_frontend_source_patch_proof`

Required order for runtime overlays:

1. Read this guide.
2. Read the target surface contract.
3. List existing frontend customizations for the surface.
4. Preview the customization.
5. Explain warnings and expected UI effect.
6. Apply as `draft` for review or `active` only with explicit approval.
7. Verify through the staff UI.

Required order for source patch plans:

1. Read this guide.
2. Read the target surface contract.
3. Use `preview_frontend_source_patch` with the exact allowlisted files and patch intent.
4. Explain warnings and expected UI effect.
5. A maintainer applies code outside MCP only after preview is clean.
6. Run typecheck/build and capture required screenshots.
7. Use `validate_frontend_source_patch_proof`.
8. Deploy only after explicit human approval.

## Runtime Customization DSL

Runtime customization is the preferred MVP mechanism. It does not edit React files. It stores a tenant-scoped layout overlay in the database and the staff UI renders it from the live API response.

Allowed surface:

```json
"staff.queue"
```

Allowed slots:

```json
[
  "kpi.before",
  "kpi.after",
  "focus.before",
  "focus.after",
  "daily.header",
  "daily.before_list",
  "daily.card.after_brief",
  "daily.card.footer",
  "priority.header",
  "priority.group.header",
  "priority.card.after_summary",
  "priority.card.footer",
  "modal.hero",
  "modal.after_steps",
  "modal.customer_context"
]
```

Allowed block types:

- `stat_tile`
- `message`
- `field`
- `badge`
- `checklist`
- `section`

Allowed data sources:

- `summary`
- `dailyCall`
- `priorityCustomer`
- `taskBrief`
- `customerDetail`

Allowed visibility operators:

- `exists`
- `not_exists`
- `eq`
- `neq`
- `gte`
- `lte`
- `contains`
- `in`

Templates may use live data tokens:

```text
Call {{dailyCall.phone}} now. Customer has {{dailyCall.performance30d.orders}} orders in 30 days.
```

Do not use raw HTML, script tags, arbitrary CSS, iframe embeds, or remote assets.

## What The Patron Can Change Now

The current MCP frontend system has five safe runtime layers:

- overlay blocks in approved slots
- sanitized `contentBlocks` in approved slots
- typed `elementOverrides` for approved native elements
- typed `navigationOverrides` for the staff sidebar
- bounded `themeOverrides` for tone, density, spacing, radius, and font weight

It cannot freely restyle every existing React element, and it never accepts raw HTML or CSS from prompts.

Allowed now:

- add KPI tiles before or after the native KPI row
- add call action banners above the Daily Call List
- add business-language explanations to daily call cards
- add customer warning or opportunity blocks inside priority customer cards
- add checklist steps to the call-detail modal
- add customer context blocks inside the modal
- add sanitized Markdown or limited HTML content blocks
- use live API data tokens in text
- show or hide an overlay block based on live data conditions
- show or hide approved fields on approved native elements
- rename approved labels and short button copy
- rename, reorder, regroup, badge, or default staff sidebar items without changing routes
- set card/modal density: `comfortable` or `compact`
- set global staff UI density/spacing/font weight/card tone through bounded theme tokens
- set emphasis: `normal`, `high`, or `quiet`
- set tone by urgency with `toneRule: "urgency"`
- reorder approved call-detail modal sections with `sectionOrder`
- target variants by `memberIds`, `memberEmails`, or `roleNames`
- set block tone: `neutral`, `info`, `success`, `warning`, `danger`, `accent`
- keep changes as `draft`, activate them, list history, and rollback

Not allowed in the runtime customization DSL:

- arbitrary raw HTML from prompts
- arbitrary raw CSS from prompts
- changing auth, tenant, RBAC, API, or backend behavior
- hiding required business fields such as phone, action, latest order, latest call, open follow-up, or notes
- replacing the real API response with invented content
- adding remote scripts, tracking pixels, iframes, or external assets
- changing source files through the runtime customization tools

When the patron asks for "CSS" or "HTML", translate the request into safe blocks, sanitized `contentBlocks`, bounded `themeOverrides`, typed `elementOverrides`, tones, density, copy, visibility, navigation overrides, and section ordering. If the requested result needs true source-file editing, use the separate source patch lane and require build plus screenshot verification.

## Agent Decision Tree

Use this decision tree before answering any staff UI request.

| Patron request | Correct lane | Current MCP action | Do not do |
| --- | --- | --- | --- |
| "Add a warning, KPI, instruction, checklist, or customer context" | Runtime overlay | Use `blocks` in an approved slot. | Do not edit React files for simple informational blocks. |
| "Hide/show a field on Daily cards, Priority cards, or call modal" | Runtime native override | Use typed `elementOverrides` if the field is listed in the surface contract and is not required. | Do not hide phone, required action, latest order, latest call, open follow-up, latest note, or modal hero. |
| "Rename short labels or button text" | Runtime native override | Use `copyOverrides` on an approved element. | Do not expose internal words such as rule, workflow, axis, support case, ticket, AI, or raw tag names to staff. |
| "Make Linda see a different layout than Ihsan" | Runtime audience variant | Use `audience.memberEmails`, `audience.memberIds`, or `audience.roleNames`. | Do not fork source files per person. |
| "Change Daily card density, emphasis, urgency tone" | Runtime native override | Use `density`, `emphasis`, and `toneRule`. | Do not ship unreadable dark-mode cards or color-only meaning. |
| "Move sections inside the call modal" | Runtime native override | Use `sectionOrder` on `task.modal`. | Do not remove the phone, main action, steps, or history from reachable modal content. |
| "Change sidebar names, order, groups, badges, or default landing page" | Runtime navigation lane | Use typed `navigationOverrides` with known `navId` values and screenshot proof. | Do not fake this with overlay blocks or arbitrary CSS. Do not change route ids casually. |
| "Insert HTML/CSS from a prompt" | Controlled content/theme lane | Translate CSS to `themeOverrides` and HTML/Markdown to sanitized `contentBlocks` with allowlisted tags/classes. | Do not store scripts, inline CSS, iframes, remote assets, event handlers, or tracking pixels. |
| "Patch React or CSS source directly" | Maintainer source patch lane | Use `preview_frontend_source_patch`, run typecheck/build/screenshots, then `validate_frontend_source_patch_proof`; deploy only after human approval. | Do not let MCP apply files, touch backend/env/auth/tenant/RBAC, or deploy without approval. |
| "Change backend data, Aircall behavior, Shopify sync, tokens, RBAC, or task generation" | Backend/product lane | Explain that frontend MCP cannot do this. | Do not mask backend bugs with UI-only copy. |

If the request touches navigation, first decide whether it is only a label/order/group request or a real route/permission/product behavior change. Label/order/group changes can become a typed navigation override. Route, permission, data, or workflow changes are not frontend customization.

## Sidebar / Navigation Requests

The patron often asks to change the staff sidebar: names, order, grouping, badges, and which item opens first. This is a real product control, but it is separate from `staff.queue` card/modal customization.

Current truth:

- Sidebar items are source-defined in `apps/person/src/types.ts` as `NAV`.
- Sidebar rendering is source-defined in `apps/person/src/components/Sidebar.tsx`.
- Page titles and route switching are source-defined in `apps/person/src/App.tsx`.
- Runtime `preview_frontend_customization` accepts `blocks`, sanitized `contentBlocks`, typed `elementOverrides`, typed `navigationOverrides`, and bounded `themeOverrides`.
- Runtime navigation overrides can change visible labels, sort order, group labels, badge mode, emphasis, hidden state for safe items, and default landing nav id.
- Runtime navigation overrides cannot change `navId`, routes, permissions, icons, backend data, or page behavior.

### Current Staff Sidebar Inventory

Keep `navId` stable unless a maintainer intentionally changes source code, routes, and analytics together.

| navId | Current label | Route | Group | Badge source | Can rename safely? | Can hide safely? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `queue` | `Call Queue` | `/staff/queue` | `Workspace` | `summary.queue` | Yes, with `navigationOverrides`. | No, except explicit maintenance mode. | Primary staff workbench. Must stay easy to find. |
| `daily-archive` | `Daily Archive` | `/staff/daily-archive` | `Workspace` | none | Yes. | Usually yes, if archive is reachable elsewhere. | Old call work beyond active window. |
| `customers` | `Routine Call List` | `/staff/customers` | `Workspace` | `summary.customers` | Yes. | Usually no for purchase/follow-up staff. | This is the assigned calling portfolio, not generic CRM browsing. |
| `customer-archive` | `Customer Archive` | `/staff/customer-archive` | `Workspace` | none | Yes, with `navigationOverrides`. | Usually no for staff who need Shopify customer lookup. | Must stay paginated/searchable; do not preload all customers. |
| `email` | `E-mail` | `/staff/email` | `Workspace` | none | Yes. | Role-dependent. | Must not imply marketing blast tools. |
| `calendar` | `Calendar` | `/staff/calendar` | `Workspace` | none | Yes. | Role-dependent. | Staff follow-up scheduling surface. |
| `notes` | `Notes` | `/staff/notes` | `Workspace` | none | Yes. | Role-dependent. | Personnel notes, not internal engineering notes. |
| `training` | `Training` | `/staff/training` | `Knowledge` | none | Yes. | Yes for roles that do not use training. | Knowledge surface. |
| `announcements` | `Announcements` | `/staff/announcements` | `Knowledge` | none | Yes. | Yes for roles that do not use announcements. | Internal announcements only. |
| `messaging` | `Messaging` | `/staff/messaging` | `Knowledge` | none | Yes. | Role-dependent. | Staff messaging; not customer support case automation. |
| `requests` | `Submit Request` | `/staff/requests` | `Account` | none | Yes. | Role-dependent. | Internal personnel request. Do not rename to commission request unless product explicitly reintroduces commissions. |
| `notifications` | `Notifications` | `/staff/notifications` | `Account` | `summary.notifications` | Yes. | Usually no if unread notifications exist. | Keep badge readable in light and dark mode. |

### Sidebar Language Rules

Use customer-facing and staff-action language, not implementation language.

Allowed examples:

- `Call Queue`
- `Daily Archive`
- `Routine Call List`
- `Customer Archive`
- `E-mail`
- `Calendar`
- `Notes`
- `Training`
- `Announcements`
- `Messaging`
- `Submit Request`
- `Notifications`
- `Purchase Intent`
- `Customer Request`
- `Customer Care`
- `Follow-up`

Avoid in the staff sidebar:

- `Sales`
- `Support`
- `Workflow`
- `Rule`
- `Axis`
- `AI`
- `Transcript resolver`
- `Commission`
- `Ticket`
- `Support Case`
- `Debug`
- `Internal source`

If the patron asks "Customers should be named something else because this is the list staff must call", use `Routine Call List` or another action-oriented label. Do not use a generic CRM label when the page is a work list.

### Sidebar Change Safety Rules

For navigation changes, the agent must preserve these rules:

- Do not change `navId` strings through MCP runtime customization.
- Do not change routes through runtime customization.
- Do not create arbitrary external links in the staff sidebar.
- Do not move staff out of `/staff/*` routes with a nav click.
- Do not hide `queue` from a person who has active queue work.
- Do not hide `customer-archive` if the user specifically uses it to search Shopify customers.
- Do not hide notification badges unless there is a product rule for where they move.
- Do not make one long ungrouped sidebar unless desktop and mobile screenshots prove it remains scannable.
- Do not rename `requests` into commission language. Commission UI is not part of the staff surface unless the product owner explicitly reintroduces it.
- Do not use source labels that imply automatic support case creation. Customer service opens customer requests manually when the customer actually asks.
- Keep the active item visually obvious in light and dark mode.
- Keep long labels from clipping on collapsed and expanded sidebar states.

### Maintainer Source Patch Lane For Sidebar

Use this lane only when the current runtime tools cannot satisfy the request and a maintainer has permission to change source code.

Files that usually change together:

- `apps/person/src/types.ts`: `NavId`, `NavItem`, and `NAV` labels/order/groups.
- `apps/person/src/App.tsx`: page titles, route selection, initial route behavior, and `renderView`.
- `apps/person/src/components/Sidebar.tsx`: icons, badge mapping, grouping, collapsed labels, and account card behavior.
- `apps/person/src/styles.css`: sidebar spacing, readable light/dark colors, badge contrast, and long-label handling.

Patch rules:

- Change the smallest set of files.
- Keep route ids stable unless the route itself is intentionally migrated.
- Update `TITLES` when a visible label changes.
- Update icon mapping only when the new label meaning changes.
- Keep badge sources tied to real summary data.
- Do not create mock counts.
- Do not create a fake sidebar link that opens a modal instead of the real route.
- Preserve `loading`, `empty`, `error`, and `populated` states for the target pages.
- Build before shipping.
- Capture screenshots after build, not before build.

Source patch proof package:

- route table: old label/order/group -> new label/order/group
- code diff summary with touched files
- build result
- desktop light screenshot
- desktop dark screenshot
- mobile or narrow screenshot
- click proof for each changed route
- badge proof for each changed badge
- rollback plan

Example source patch report:

```text
Changed staff sidebar wording only.
- `customers`: "Customers" -> "Routine Call List"; route stayed `/staff/customers`; badge stayed `summary.customers`.
- Workspace order: Call Queue, Routine Call List, Daily Archive, Customer Archive, E-mail, Calendar, Notes.
- No routes, permissions, API calls, or task logic changed.
- Verified light, dark, collapsed sidebar, and route clicks.
```

### Navigation Overrides: Active Typed Contract

Use this schema when the product wants remote agents to change sidebar labels/order/groups/badges/default landing without source-file edits. It is accepted by `preview_frontend_customization` and `apply_frontend_customization` under the `staff.queue` surface.

```json
{
  "surfaceId": "staff.queue",
  "schemaVersion": 1,
  "blocks": [],
  "contentBlocks": [],
  "elementOverrides": [],
  "navigationOverrides": [
    {
      "id": "staff_sidebar_purchase_team",
      "target": "sidebar",
      "audience": {
        "memberEmails": ["linda@dtfbank.com"],
        "roleNames": ["Customer Service"]
      },
      "defaultNavId": "queue",
      "groups": [
        { "id": "workspace", "label": "Workspace", "order": 10 },
        { "id": "knowledge", "label": "Knowledge", "order": 20 },
        { "id": "account", "label": "Account", "order": 30 }
      ],
      "items": [
        { "navId": "queue", "label": "Call Queue", "group": "workspace", "order": 10, "hidden": false, "badgeMode": "count", "emphasis": "high", "required": true },
        { "navId": "customers", "label": "Routine Call List", "group": "workspace", "order": 20, "hidden": false, "badgeMode": "count", "emphasis": "normal", "required": true },
        { "navId": "daily-archive", "label": "Daily Archive", "group": "workspace", "order": 30, "hidden": false, "badgeMode": "none", "emphasis": "quiet" },
        { "navId": "customer-archive", "label": "Customer Archive", "group": "workspace", "order": 40, "hidden": false, "badgeMode": "none", "emphasis": "normal" }
      ],
      "requireScreenshotProof": true
    }
  ],
  "themeOverrides": {}
}
```

Allowed typed navigation fields:

- `target`: currently only `sidebar`.
- `audience.memberIds`, `audience.memberEmails`, `audience.roleNames`.
- `defaultNavId`: first route after login or refresh, only from known `navId` values.
- `groups[].id`: stable override group id.
- `groups[].label`: visible group label.
- `groups[].order`: numeric sort.
- `items[].navId`: must be one of the existing nav ids.
- `items[].label`: visible label.
- `items[].group`: override group id.
- `items[].order`: numeric sort inside group.
- `items[].hidden`: hide the item only when the safety rules allow it.
- `items[].badgeMode`: `count`, `dot`, or `none`.
- `items[].emphasis`: `high`, `normal`, or `quiet`.
- `items[].required`: blocks accidental hiding of primary work routes.
- `requireScreenshotProof`: must be `true`.

Validation rules for `navigationOverrides`:

- Reject unknown `navId`.
- Reject duplicate `navId` entries in one override.
- Reject duplicate group ids in one override.
- Reject `defaultNavId` when the referenced item is hidden.
- Reject hiding `queue` when the audience includes active call-queue users.
- Reject hiding all items in a group unless the group itself is removed.
- Reject labels containing forbidden implementation terms.
- Reject labels longer than the sidebar can display without clipping.
- Reject `badgeMode: "none"` for `queue`, `customers`, or `notifications` unless the product owner explicitly approves the badge removal.
- Reject changes with `requireScreenshotProof: false`.

### Sidebar Examples

Good typed navigation request:

```text
For Customer Service, order Workspace as Call Queue, Routine Call List, Daily Archive, Customer Archive, E-mail, Calendar, Notes. Keep Call Queue and Routine Call List badges visible.
```

Good source-patch request only when runtime nav is not enough:

```text
Add a brand-new staff sidebar route with a new icon and real page component. Use the source patch lane, run build, capture light/dark/mobile screenshots, and wait for human deploy approval.
```

Bad request:

```text
Hide Call Queue with CSS and make Customers link to an external CRM page.
```

Correct answer:

```text
That is not allowed through frontend MCP. Call Queue is a primary work route, and the staff sidebar cannot navigate to arbitrary external pages. I can draft a safe label/order change with `navigationOverrides`, or a maintainer source patch when a real new route is required.
```

### Sidebar Screenshot Proof

Any sidebar source patch or navigation override must include:

- desktop light mode, expanded sidebar
- desktop dark mode, expanded sidebar
- mobile or narrow viewport with collapsed behavior
- active item state
- badge state with nonzero counts
- long-label overflow check
- account/user card visible at the bottom
- route click proof for every moved or renamed item

## Staff Queue Element Map

Surface id:

```text
staff.queue
```

Main files:

- `apps/person/src/views/CallQueue.tsx`
- `apps/person/src/components/Card.tsx`
- `apps/person/src/components/TaskBriefModal.tsx`
- `apps/person/src/components/FrontendCustomization.tsx`
- `apps/person/src/styles.css`
- `packages/ui/src/customer-detail-panel.tsx`
- `packages/contracts/src/person.ts`

Element map:

| Element | Native class or slot | Current MCP action | Notes |
| --- | --- | --- | --- |
| KPI row | `kpi.before`, `kpi.after`, `elementId: "kpi.row"` | add blocks; override density/copy | Good for incoming calls, outbound calls, open requests, daily calls, priority customers, pinned, high intent, and sync status. |
| Today focus | `focus.before`, `focus.after` | add staff instructions or stat blocks around the native command center | Bind only to live `summary` fields such as `missedFollowUpCount`, `atRiskCustomerCount`, `openRequestsCount`, `incomingCallsToday`, `outboundCallsToday`, and `callsMadeToday`. Do not fake counts. |
| Daily header | `daily.header`, `daily.before_list` | add guidance or filters explanation | Do not add segment grouping here. Daily list remains recent call work. |
| Daily call card | `daily.card.after_brief`, `daily.card.footer`, `elementId: "daily.card"` | add short blocks; override fields, copy, density, emphasis, urgency tone, call button copy/visibility | Required fields: `title`, `requiredAction`, `phone`. Do not expose internal rule names. |
| Priority group header | `priority.group.header` | add owner/group context | Priority is assigned customer groups, not recent calls. |
| Priority customer card | `priority.card.after_summary`, `priority.card.footer`, `elementId: "priority.card"` | add customer blocks; override fields, copy, density, urgency tone | Required fields: `customerName`, `phone`, `latestOrder`, `latestCall`, `openFollowUp`, `latestNote`. |
| Call modal | `modal.hero`, `modal.after_steps`, `modal.customer_context`, `elementId: "task.modal"` | add modal blocks; override labels and approved section order | Required fields: `title`, `phone`, `hero`, `steps`. |
| Customer detail popup | `elementId: "customer.detail.popup"` | source patch lane for now; contract exposes required fields | Keep centered popup; never reintroduce right drawer. |
| Staff sidebar | source: `NAV`, `Sidebar.tsx`, `App.tsx`; runtime: `navigationOverrides` | typed `navigationOverrides` for labels/order/groups/badges/default nav; source patch lane for new routes/icons/shell behavior | Rename/order/group requests are valid product requests and should not be faked with CSS or overlay blocks. |

## Element Overrides

Use `elementOverrides` when the patron asks to change native card/modal behavior without source editing.

Supported element ids:

- `kpi.row`
- `daily.card`
- `priority.card`
- `task.modal`
- `customer.detail.popup`

Supported override fields:

- `visibleFields`
- `hiddenFields`
- `copyOverrides`
- `density`
- `emphasis`
- `toneRule`
- `tone`
- `sectionOrder` for `task.modal` only
- `audience.memberIds`
- `audience.memberEmails`
- `audience.roleNames`

Every active element override must keep `requireScreenshotProof: true`. Before activation, capture or require desktop light, desktop dark, and mobile screenshots for `/staff/queue`.

Example:

```json
{
  "surfaceId": "staff.queue",
  "schemaVersion": 1,
  "blocks": [],
  "elementOverrides": [
    {
      "id": "linda_compact_daily_calls",
      "elementId": "daily.card",
      "audience": { "memberEmails": ["linda@dtfbank.com"] },
      "density": "compact",
      "emphasis": "high",
      "toneRule": "urgency",
      "visibleFields": ["title", "requiredAction", "phone", "assignee", "focus", "latestOrder", "performance30d", "callButton", "pinButton", "archiveButton", "transferButton", "urgencyScore"],
      "copyOverrides": {
        "actionLabel": "Call priority",
        "requiredAction": "Call now, confirm the exact next step, and save the outcome."
      },
      "requireScreenshotProof": true
    },
    {
      "id": "modal_order_history_first",
      "elementId": "task.modal",
      "toneRule": "urgency",
      "sectionOrder": ["hero", "snapshotGrid", "purchaseHistory", "reasonField", "moodField", "outcomeField", "timeline", "noteForm", "scheduleForm"],
      "copyOverrides": {
        "heroKicker": "Handle this now",
        "timelineLabel": "Customer history before calling"
      },
      "requireScreenshotProof": true
    }
  ]
}
```

Preview rejects hidden required fields, unsupported fields, forbidden staff terminology, and disabled screenshot proof.

Do not implement arbitrary freeform CSS as the main path. It will let agents break readability, hide business fields, or inject unsafe content. Use source patch tools only for maintainers, not routine patron styling.

## Content Blocks And Theme Overrides

Use `contentBlocks` when the patron wants a small Markdown or HTML-like block in an approved slot. The renderer sanitizes content and supports only these tags:

- `p`
- `strong`, `b`
- `em`, `i`
- `ul`, `ol`, `li`
- `br`
- `span`, `div`

Allowed classes are fixed tokens, not arbitrary CSS:

- `callout`
- `metric`
- `checklist`
- `muted`
- `strong`
- `compact`
- `stack`
- `inline`
- `two-column`
- `accent-border`

Rejected content:

- `<script>`
- `<iframe>`
- inline `style`
- event handlers such as `onclick`
- `javascript:` URLs
- external images, fonts, embeds, or tracking pixels

Use `themeOverrides` for bounded visual changes:

- `accent`: `neutral`, `info`, `success`, `warning`, `danger`, `accent`
- `cardTone`: same tone list
- `spacing`: `compact`, `normal`, `roomy`
- `density`: `comfortable`, `compact`
- `fontWeight`: `normal`, `medium`, `semibold`
- `radius`: `tight`, `standard`, `soft`

Example safe content/theme payload:

```json
{
  "surfaceId": "staff.queue",
  "name": "Customer call coaching block",
  "definition": {
    "surfaceId": "staff.queue",
    "schemaVersion": 1,
    "description": "Add a safe coaching block and slightly denser cards.",
    "theme": { "density": "comfortable", "accent": "warning" },
    "themeOverrides": {
      "spacing": "compact",
      "density": "compact",
      "fontWeight": "medium",
      "cardTone": "info",
      "radius": "standard"
    },
    "blocks": [],
    "contentBlocks": [
      {
        "id": "daily_call_coach",
        "slot": "daily.header",
        "format": "markdown",
        "label": "Call focus",
        "content": "**Start with the customer question.** Confirm order context, next step, and callback time before closing.",
        "allowedClasses": ["callout", "compact"],
        "tone": "info",
        "priority": 10
      }
    ],
    "elementOverrides": [],
    "navigationOverrides": []
  },
  "reason": "Give staff a short business-language reminder without raw CSS or scripts."
}
```

## Source Patch Lane

Use this only when runtime `blocks`, `contentBlocks`, `elementOverrides`, `navigationOverrides`, and `themeOverrides` cannot express the change. The MCP tool validates the patch plan; it does not apply files or deploy code.

Allowed source paths:

- `apps/person/src/**`
- `packages/ui/src/**`

Allowed source extensions:

- `.ts`
- `.tsx`
- `.css`
- `.md`

Denied areas:

- backend services
- environment files
- auth, tenant, RBAC, token, permission, or Prisma files
- API base URL or Authorization logic
- arbitrary script/HTML injection paths

Source patch flow:

1. `preview_frontend_source_patch` with file path, purpose, and patch summary.
2. Confirm the response has `appliesPatch: false`, `deploysCode: false`, `maintainerMustApplyPatch: true`, and `humanApprovalRequired: true`.
3. Human/maintainer applies the patch outside MCP if preview is clean.
4. Run typecheck and build.
5. Capture desktop light, desktop dark, and mobile screenshots.
6. `validate_frontend_source_patch_proof`.
7. Deploy only after explicit human approval.

Example preview payload:

```json
{
  "surfaceId": "staff.queue",
  "name": "Staff queue source patch preview",
  "reason": "Add a native compact card variant that runtime overrides cannot express.",
  "files": [
    {
      "path": "apps/person/src/components/Card.tsx",
      "purpose": "Add a native compact card layout controlled by existing runtime element override state.",
      "patch": "Small React diff summary or unified patch text goes here."
    },
    {
      "path": "apps/person/src/styles.css",
      "purpose": "Add bounded readable light/dark styles for the new compact card class.",
      "patch": "Small CSS diff summary or unified patch text goes here."
    }
  ]
}
```

## Example Customization

```json
{
  "surfaceId": "staff.queue",
  "name": "Show urgent payment/refund calls",
  "definition": {
    "surfaceId": "staff.queue",
    "schemaVersion": 1,
    "description": "Highlight payment and refund follow-ups on daily call cards.",
    "theme": { "density": "comfortable", "accent": "warning" },
    "blocks": [
      {
        "id": "payment_call_banner",
        "slot": "daily.card.after_brief",
        "type": "message",
        "label": "Payment or refund",
        "template": "Clarify the exact payment, pricing, or refund issue before promising a next step.",
        "tone": "danger",
        "priority": 10,
        "visibility": {
          "any": [
            { "source": "dailyCall", "path": "summary", "operator": "contains", "value": "refund" },
            { "source": "dailyCall", "path": "summary", "operator": "contains", "value": "payment" }
          ],
          "all": []
        }
      },
      {
        "id": "high_intent_kpi",
        "slot": "kpi.after",
        "type": "stat_tile",
        "label": "Needs fast call",
        "value": { "source": "summary", "path": "highUrgencyCount", "format": "count", "fallback": "0" },
        "text": "high priority follow-ups",
        "tone": "warning",
        "priority": 20
      }
    ]
  },
  "reason": "Make urgent customer follow-up intent visible without exposing internal system terms."
}
```

Use `preview_frontend_customization` with that payload first. Use `apply_frontend_customization` only after review.

## High Value Staff Queue Examples

Show a stronger daily call warning only when the call summary mentions refund or payment:

```json
{
  "surfaceId": "staff.queue",
  "name": "Refund calls need exact next step",
  "definition": {
    "surfaceId": "staff.queue",
    "schemaVersion": 1,
    "description": "Make payment and refund calls harder to miss.",
    "theme": { "density": "comfortable", "accent": "warning" },
    "blocks": [
      {
        "id": "refund_next_step",
        "slot": "daily.card.after_brief",
        "type": "message",
        "label": "Payment/refund",
        "title": "Payment or refund - clarify next step",
        "template": "Ask for the order number and exact issue. Save the promised next step before closing.",
        "tone": "danger",
        "priority": 10,
        "visibility": {
          "any": [
            { "source": "dailyCall", "path": "summary", "operator": "contains", "value": "refund" },
            { "source": "dailyCall", "path": "summary", "operator": "contains", "value": "payment" }
          ],
          "all": []
        }
      }
    ]
  },
  "reason": "Help staff handle money-sensitive calls without internal terminology."
}
```

Add a modal checklist for high urgency calls:

```json
{
  "surfaceId": "staff.queue",
  "name": "High urgency call checklist",
  "definition": {
    "surfaceId": "staff.queue",
    "schemaVersion": 1,
    "blocks": [
      {
        "id": "urgent_call_steps",
        "slot": "modal.after_steps",
        "type": "checklist",
        "label": "Call steps",
        "title": "Before closing this call",
        "items": [
          "Confirm the customer question in one sentence.",
          "Check latest order and latest call before promising a date.",
          "Save the outcome note and next callback time."
        ],
        "tone": "warning",
        "priority": 20,
        "visibility": {
          "all": [
            { "source": "dailyCall", "path": "urgencyScore", "operator": "gte", "value": 7 }
          ],
          "any": []
        }
      }
    ]
  },
  "reason": "High urgency calls need a consistent operator checklist."
}
```

## Allowed Surfaces

Current MVP surface:

- `staff.queue`: personnel call queue, Daily Call List, Priority Kanban, pinned customers, call-detail modal, and customer detail popup.

Future surfaces may be added through `list_frontend_surfaces`.

## Allowed Paths

Frontend patch tools may operate only inside explicit allowlists:

- `apps/person/src/**`
- `packages/ui/src/**`

Contract changes require separate approval:

- `packages/contracts/src/**`

## Denied Paths

Do not edit:

- auth core
- token handling
- tenant context
- RBAC/permission guards
- API client auth interceptors
- backend services
- Prisma schema or migrations
- `.env` or secret files
- deploy scripts
- Docker/Caddy/infra files

## Staff UI Language

Personnel users should see business language, not internal system language.

Forbidden staff-facing terms:

- AI
- workflow rule
- sales axis
- support axis
- internal resolver

Preferred terms:

- Call summary
- Purchase intent
- Customer concern
- Account follow-up
- Call now
- Needs attention
- Previous call
- No purchase since last call

Do not describe implementation details in staff UI.

## Required States

Every staff surface must have:

- loading state
- empty state
- error state with useful message
- populated state

Empty state must explain the next business action. It must not be a blank panel.

## Data Rules

- No mock data.
- No seed data.
- No static demo cards.
- Use live API data.
- Do not invent customers, orders, calls, transcripts, or notes.
- Do not hide missing data by filling placeholders that look real.

## Theme Rules

Light and dark mode are both required.

Dark mode must not contain white-only cards or unreadable pale text.

Critical information must stay legible:

- phone number
- customer name
- latest order
- latest call
- required action
- note count
- open follow-up count

Color may support meaning but must not be the only meaning carrier.

## Staff Queue Contract

Surface id:

```text
staff.queue
```

Route:

```text
https://app.dtfbank.com/staff/queue
```

Main source files:

- `apps/person/src/views/CallQueue.tsx`
- `apps/person/src/components/Card.tsx`
- `apps/person/src/components/TaskBriefModal.tsx`
- `apps/person/src/components/FrontendCustomization.tsx`
- `apps/person/src/lib/api.ts`
- `apps/person/src/styles.css`
- `packages/ui/src/customer-detail-panel.tsx`
- `packages/contracts/src/person.ts`

Primary endpoints:

- `GET /api/v1/person/workspace/daily-operations`
- `POST /api/v1/person/workspace/daily-calls/reorder`
- `POST /api/v1/person/workspace/daily-calls/:id/archive`
- `GET /api/v1/person/workspace/tasks/:id`
- `POST /api/v1/person/workspace/tasks/:id/notes`

Required behavior:

- Daily Call List and Priority Kanban must be visually and logically distinct.
- Daily Call List is recent call follow-up work.
- Priority Kanban is assigned customer groups.
- Call cards must show the phone number or matched customer name clearly.
- Call modal first viewport must show what happened, what to do now, and what outcome to save.
- Customer detail must open as a centered popup, not a right-side drawer.
- Commission request UI must not appear in staff customer surfaces unless explicitly reintroduced.

Smoke checklist:

- Open `/staff/queue`.
- Confirm no forbidden staff terms appear.
- Open a Daily Call List card.
- Confirm modal shows concrete action steps before long history.
- Open a Priority Kanban customer.
- Confirm customer history and orders are readable.
- Toggle light and dark mode.
- Capture desktop and mobile screenshots.

## Security Rules

Do not add:

- `dangerouslySetInnerHTML`
- remote script tags
- arbitrary remote CSS
- inline untrusted HTML rendering
- secrets in source files
- direct production shell commands
- arbitrary SQL

Patch tools must enforce file allowlists, file count limits, patch size limits, and command allowlists.

Build tools may run only approved commands such as typecheck, frontend build, and surface smoke tests.

Publish tools are closed by default in the MVP.

## Good Agent Request

```text
Read the frontend guide. For staff.queue, improve call cards so phone numbers and required action are readable in light and dark mode. Remove internal terms. Use Purchase intent, Customer concern, and Call now labels. Validate loading, empty, error, and populated states. Run typecheck/build and capture desktop/mobile screenshots.
```

## Bad Agent Request

```text
Inject this HTML into the modal and deploy it now.
```

Reject that request.
