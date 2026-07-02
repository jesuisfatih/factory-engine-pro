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
9. Source-file patching is a later, separate capability and must stay behind stricter allowlists.

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

Required order:

1. Read this guide.
2. Read the target surface contract.
3. Preview the customization.
4. Explain warnings and expected UI effect.
5. Apply as `draft` for review or `active` with explicit approval.
6. Verify through the staff UI.

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

The current MCP frontend system is an overlay system. It can add safe, data-bound blocks into approved slots. It cannot freely restyle every existing React element yet.

Allowed now:

- add KPI tiles before or after the native KPI row
- add call action banners above the Daily Call List
- add business-language explanations to daily call cards
- add customer warning or opportunity blocks inside priority customer cards
- add checklist steps to the call-detail modal
- add customer context blocks inside the modal
- use live API data tokens in text
- show or hide an overlay block based on live data conditions
- set block tone: `neutral`, `info`, `success`, `warning`, `danger`, `accent`
- keep changes as `draft`, activate them, list history, and rollback

Not allowed in the current overlay DSL:

- arbitrary HTML from prompts
- arbitrary CSS from prompts
- changing auth, tenant, RBAC, API, or backend behavior
- hiding required business fields such as phone, action, latest order, latest call, open follow-up, or notes
- replacing the real API response with invented content
- adding remote scripts, tracking pixels, iframes, or external assets
- changing source files through the runtime customization tools

When the patron asks for "CSS" or "HTML", translate the request into safe blocks, tones, density, copy, and visibility rules. If the requested result needs true source-file editing, say that it requires the separate source patch lane and must include build plus screenshot verification.

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
| KPI row | `kpi.before`, `kpi.after` | add `stat_tile`, `message`, `badge`, `field`, `section` | Good for "must call", refund, purchase intent, unmatched caller stats. |
| Daily header | `daily.header`, `daily.before_list` | add guidance or filters explanation | Do not add segment grouping here. Daily list remains recent call work. |
| Daily call card | `daily.card.after_brief`, `daily.card.footer` | add short instruction, warning, badge, checklist | Keep phone/action visible. Do not expose internal rule names. |
| Priority group header | `priority.group.header` | add owner/group context | Priority is assigned customer groups, not recent calls. |
| Priority customer card | `priority.card.after_summary`, `priority.card.footer` | add customer opportunity, risk, note reminders | Use customer/order/call facts only. |
| Call modal top | `modal.hero` | add the strongest "do this now" block | First viewport must tell staff what happened and what to do. |
| Call modal steps | `modal.after_steps` | add checklist or decision path | Keep it short enough for a call center operator. |
| Modal customer context | `modal.customer_context` | add customer/order/call context | Do not duplicate long transcript text. |
| Customer detail popup | native popup, no overlay slot yet | source patch lane only | Keep centered popup; never reintroduce right drawer. |

## Recommended Next Expansion

To let the patron control more of the staff panel without unsafe raw CSS, add a second MCP layer called element overrides. This should be typed, allowlisted, and previewed before activation.

Recommended schema direction:

```json
{
  "surfaceId": "staff.queue",
  "elementOverrides": [
    {
      "elementId": "daily.card",
      "label": "Daily call card",
      "density": "comfortable",
      "emphasis": "high",
      "toneRule": "urgency",
      "visibleFields": ["phone", "requiredAction", "assignee", "purchaseIntent", "latestOrder"],
      "hiddenFields": ["internalSource", "ruleName", "axis"],
      "copyOverrides": {
        "callSummary": "Call summary",
        "purchaseIntent": "Purchase intent",
        "customerConcern": "Customer concern"
      }
    }
  ]
}
```

That next layer should support:

- safe design tokens instead of raw CSS
- per-element field visibility
- per-element label/copy overrides
- per-element density and emphasis
- role/person variants, for example Linda versus Ihsan
- light/dark preview checks
- screenshot proof before publish
- rollback to the previous active customization

Do not implement arbitrary freeform CSS as the main path. It will let agents break readability, hide business fields, or inject unsafe content. Use source patch tools only for maintainers, not routine patron styling.

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
- `apps/person/src/styles/**`
- `apps/admin/src/features/**`
- `apps/admin/src/routes/**`
- `apps/*/src/styles/**`

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
