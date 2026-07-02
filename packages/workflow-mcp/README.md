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
5. `preview_frontend_customization` with a safe slot/block/data-binding definition.
6. Explain every preview warning and the expected staff UI effect in business language.
7. `apply_frontend_customization` only after preview warnings are clean and the user approves activation.
8. `list_frontend_customizations`, `get_frontend_customization`, and `rollback_frontend_customization` provide audit and rollback.

Frontend customization does not accept raw HTML, scripts, arbitrary CSS, or source-file writes. It changes the staff UI through controlled slots such as `kpi.after`, `daily.card.after_brief`, `priority.card.after_summary`, and `modal.hero`. Blocks can bind to live response data and use visibility conditions, so agents can express "show this field only when open requests are greater than zero" without editing React code.

The staff UI contract includes an element map. Treat it as the source of truth for what can be changed today:

- current MVP: add safe overlay blocks into approved slots;
- next safe expansion: typed `elementOverrides` for field visibility, copy overrides, density, emphasis, tone rules, and role/person variants;
- not allowed: raw prompted HTML, raw CSS, hidden required business fields, scripts, external assets, auth changes, backend changes, or source-file edits through the runtime customization tools.

If a user asks for HTML or CSS, translate it into the DSL first. If the request truly requires source-file edits, say it belongs to a separate maintainer-only patch lane with build and screenshot proof.

Unsupported actions such as automatic support case creation, raw SQL, destructive segment changes, and direct email sends are rejected by the backend.

MCP-authored rules are limited to `call.operational_signal.detected` with an `operational_intent` condition. Routing, watcher, and escalation actions must follow a `create_task` action in the same rule so they have a concrete personnel task target.

Create-task assignment is deterministic: explicit member, Aircall call owner, customer axis primary, then axis primary role. Omit an explicit member when the rule should follow the person who handled the call.

Domain goals must compile to the operational intent registry returned by `list_workflow_capabilities`. The registry exposes each intent's default axis, expected outcome, task title, matching keywords, and examples. When a staff decision is required, create a task, note, pin, or route action; staff opens any customer support case manually.
