# Frontend MCP Agent Guide

This guide is for external engineering agents connected through Factory Engine MCP.

The agent may help improve allowed frontend surfaces, but it must work inside explicit product, security, and verification boundaries.

## Operating Model

1. Read this guide.
2. List frontend surfaces.
3. Read the target surface contract.
4. Read only relevant allowlisted files.
5. Prepare a small patch.
6. Validate state coverage, terminology, light mode, dark mode, and responsive layout.
7. Run typecheck/build/smoke tools when those tools are enabled.
8. Capture screenshots before asking a human to publish.

The agent must not directly edit production or deploy without a separate publish tool and human approval.

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

- `apps/person/src/routes/queue.tsx`
- `apps/person/src/components/TaskBriefModal.tsx`
- `apps/person/src/components/CustomerDetailModal.tsx`
- `apps/person/src/lib/api.ts`
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
