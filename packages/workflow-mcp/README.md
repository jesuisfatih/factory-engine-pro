# Factory Engine Workflow MCP

Stdio MCP server for Claude Desktop or another local MCP client. It exposes only the safe workflow authoring tools and proxies every request to the Factory Engine API.

## Environment

```bash
FACTORY_ENGINE_API_URL=https://api.dtfbank.com/api/v1
FACTORY_ENGINE_ACCESS_TOKEN=<member access token>
FACTORY_ENGINE_TENANT_ID=ten_dtfbank
```

The token must belong to a member with:

- `settings.read` for capabilities, guide reads, frontend contracts, draft, validate, simulate, and scheduled-action inspection.
- `settings.write` for creating drafts, publishing, and cancelling pending scheduled actions.
- `aircall.users.read` for transcript listing, download, and export tools.

The server never connects to Postgres or Redis directly.

## Claude Desktop Example

```json
{
  "mcpServers": {
    "factory-engine-workflow": {
      "command": "node",
      "args": [
        "C:/Users/mhmmd/Desktop/factory-engine-pro/packages/workflow-mcp/dist/index.js"
      ],
      "env": {
        "FACTORY_ENGINE_API_URL": "https://api.dtfbank.com/api/v1",
        "FACTORY_ENGINE_ACCESS_TOKEN": "<member access token>",
        "FACTORY_ENGINE_TENANT_ID": "ten_dtfbank"
      }
    }
  }
}
```

## Tool Contract

Use tools in this order:

1. `list_workflow_capabilities` and inspect `registry.operationalIntents`, `registry.conditions`, and `registry.actions`.
2. `draft_workflow_rule` from the customer natural-language goal.
3. `validate_workflow_rule` against the deterministic DSL.
4. `simulate_workflow_rule` as a draft to estimate recent matches.
5. `create_workflow_rule_draft` only after validation is clean.
6. `simulate_workflow_rule` again using the stored `ruleId`; this stored report is the publish proof.
7. `publish_workflow_rule` only after explicit user approval and a completed stored simulation report.

For delayed staff work:

1. Use natural-language goals like: "If a customer asks for Hydro1620 spare parts and still has not purchased after 15 days, show a follow-up task to Ihsan on that day."
2. `draft_workflow_rule` should compile this into `create_task.timing.mode = deferred_materialization`.
3. `simulate_deferred_workflow_rule` must show hidden scheduled actions and projected run times before publish.
4. `list_scheduled_workflow_actions`, `get_scheduled_workflow_action`, and `explain_scheduled_workflow_action` inspect hidden pending work.
5. `cancel_scheduled_workflow_action` cancels pending hidden work before it appears to staff.

For frontend work:

1. `read_frontend_agent_guide` first.
2. `list_frontend_surfaces`.
3. `get_frontend_surface_contract` for the exact surface, currently `staff.queue`.
4. `list_frontend_customizations` for the surface before proposing changes.
5. `preview_frontend_customization` with safe slot blocks and/or typed `elementOverrides`.
6. Explain every preview warning and the expected staff UI effect in business language.
7. `apply_frontend_customization` only after preview warnings are clean and the user approves activation.
8. `list_frontend_customizations`, `get_frontend_customization`, and `rollback_frontend_customization` provide audit and rollback.

Frontend customization does not accept raw scripts, arbitrary CSS, unsafe HTML, or source-file writes. It changes the staff UI through controlled slots such as `kpi.after`, `daily.card.after_brief`, `priority.card.after_summary`, and `modal.hero`, plus sanitized `contentBlocks`, bounded `themeOverrides`, typed `elementOverrides`, and typed `navigationOverrides`. Blocks can bind to live response data and use visibility conditions, so agents can express "show this field only when open requests are greater than zero" without editing React code.

The staff UI contract includes an element map. Treat it as the source of truth for what can be changed today:

- current MVP: add safe overlay blocks into approved slots;
- current MVP: add sanitized Markdown/limited HTML through `contentBlocks` with allowlisted tags/classes only;
- current MVP: use bounded `themeOverrides` for density, spacing, card tone, radius, and font weight;
- current MVP: use typed `elementOverrides` for field visibility, copy overrides, density, emphasis, tone rules, modal section order, and role/person variants;
- current MVP: use typed `navigationOverrides` for sidebar names, order, groups, badges, emphasis, safe hidden state, and default route;
- maintainer-only: use `preview_frontend_source_patch` and `validate_frontend_source_patch_proof` for React/CSS source patches that runtime DSL cannot express;
- not allowed: raw prompted HTML, raw CSS, hidden required business fields, scripts, external assets, auth changes, backend changes, or source-file edits through the runtime customization tools.

Sidebar and navigation requests must be handled separately from card/modal overlays. Rename/reorder/group/badge/default-route changes now use the typed `navigationOverrides` contract with known `navId` values, allowed labels, group order, badge mode, audience targeting, and `requireScreenshotProof: true`. Do not fake sidebar changes with CSS or overlay blocks. Use the maintainer-only source patch lane only for new routes, icons, route behavior, or shell code that runtime navigation cannot express.

Controlled content/theme requests:

- Translate "HTML" to sanitized `contentBlocks`; allowed tags are `p`, `strong`, `b`, `em`, `i`, `ul`, `ol`, `li`, `br`, `span`, and `div`.
- Allowed content classes are `callout`, `metric`, `checklist`, `muted`, `strong`, `compact`, `stack`, `inline`, `two-column`, and `accent-border`.
- Translate "CSS" to `themeOverrides`: `accent`, `cardTone`, `spacing`, `density`, `fontWeight`, and `radius`.
- Reject scripts, iframes, inline style, event handlers, external assets, tracking pixels, and hidden auth/data access.

Source patch lane:

1. `preview_frontend_source_patch` checks file allowlists and dangerous tokens without applying changes.
2. Allowed paths are `apps/person/src/**` and `packages/ui/src/**`.
3. Backend/env/auth/tenant/RBAC/Prisma/API-token files are forbidden.
4. A maintainer applies the patch outside MCP only after preview passes.
5. Run typecheck/build and capture desktop light, desktop dark, and mobile screenshots.
6. `validate_frontend_source_patch_proof` checks the proof package.
7. Deploy only after explicit human approval.

Known staff nav ids:

- `queue` -> `Call Queue` -> `/staff/queue`
- `daily-archive` -> `Daily Archive` -> `/staff/daily-archive`
- `customers` -> `Routine Call List` -> `/staff/customers`
- `customer-archive` -> `Customer Archive` -> `/staff/customer-archive`
- `email` -> `E-mail` -> `/staff/email`
- `calendar` -> `Calendar` -> `/staff/calendar`
- `notes` -> `Notes` -> `/staff/notes`
- `training` -> `Training` -> `/staff/training`
- `announcements` -> `Announcements` -> `/staff/announcements`
- `messaging` -> `Messaging` -> `/staff/messaging`
- `requests` -> `Submit Request` -> `/staff/requests`
- `notifications` -> `Notifications` -> `/staff/notifications`

Navigation safety rules:

- keep `navId` and `/staff/*` routes stable unless source code is intentionally patched;
- never hide `queue` from users with active queue work;
- never hide `customer-archive` when staff use it for Shopify customer lookup;
- keep `queue`, `customers`, and `notifications` badges visible unless the product owner explicitly approves a badge move/removal;
- avoid implementation terms in staff labels: `workflow`, `rule`, `axis`, `AI`, `support case`, `ticket`, `commission`, `debug`;
- do not rename `Submit Request` into commission language unless commissions are intentionally reintroduced;
- verify desktop light, desktop dark, mobile/collapsed, active item, badge overflow, and route click behavior.

Example `elementOverrides` payload:

```json
{
  "surfaceId": "staff.queue",
  "schemaVersion": 1,
  "blocks": [],
  "elementOverrides": [
    {
      "id": "compact_linda_daily_cards",
      "elementId": "daily.card",
      "audience": { "memberEmails": ["linda@dtfbank.com"] },
      "density": "compact",
      "emphasis": "high",
      "toneRule": "urgency",
      "visibleFields": ["title", "requiredAction", "phone", "assignee", "focus", "latestOrder", "performance30d", "pinButton", "archiveButton", "transferButton", "urgencyScore"],
      "copyOverrides": {
        "actionLabel": "Call priority",
        "requiredAction": "Call now, confirm the exact next step, and save the outcome."
      },
      "requireScreenshotProof": true
    },
    {
      "id": "task_modal_history_first",
      "elementId": "task.modal",
      "toneRule": "urgency",
      "sectionOrder": ["hero", "snapshotGrid", "purchaseHistory", "reasonField", "moodField", "outcomeField", "timeline", "noteForm", "scheduleForm"],
      "requireScreenshotProof": true
    }
  ],
  "theme": { "density": "comfortable", "accent": "accent" }
}
```

If a user asks for HTML or CSS, translate it into the DSL first. If the request truly requires source-file edits, say it belongs to a separate maintainer-only patch lane with build and screenshot proof.

Unsupported actions such as automatic support case creation, raw SQL, destructive segment changes, and direct email sends are rejected by the backend.

MCP-authored rules are limited to `call.operational_signal.detected` with an `operational_intent` condition. Routing, watcher, and escalation actions must follow a `create_task` action in the same rule so they have a concrete personnel task target.

Create-task assignment is deterministic: explicit member, Aircall call owner, customer axis primary, then axis primary role. Omit an explicit member when the rule should follow the person who handled the call.

Domain goals must compile to the operational intent registry returned by `list_workflow_capabilities`. The registry exposes each intent's default axis, expected outcome, task title, matching keywords, and examples. When a staff decision is required, create a task, note, pin, or route action; staff opens any customer support case manually.
