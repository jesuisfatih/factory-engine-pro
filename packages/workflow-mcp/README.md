# Factory Engine Workflow MCP

Stdio MCP server for Claude Desktop or another local MCP client. It exposes only the safe workflow authoring tools and proxies every request to the Factory Engine API.

## Environment

```bash
FACTORY_ENGINE_API_URL=https://api.dtfbank.com/api/v1
FACTORY_ENGINE_ACCESS_TOKEN=<member access token>
FACTORY_ENGINE_TENANT_ID=ten_dtfbank
```

The token must belong to a member with:

- `settings.read` for capabilities, draft, validate, and simulate.
- `settings.write` for creating drafts and publishing.

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

1. `list_workflow_capabilities`
2. `draft_workflow_rule`
3. `validate_workflow_rule`
4. `simulate_workflow_rule`
5. `create_workflow_rule_draft`
6. `simulate_workflow_rule` again using the stored `ruleId`
7. `publish_workflow_rule` only after explicit user approval

Unsupported actions such as automatic support case creation, raw SQL, destructive segment changes, and direct email sends are rejected by the backend.

Create-task assignment is deterministic: explicit member, Aircall call owner, customer axis primary, then axis primary role. Omit an explicit member when the rule should follow the person who handled the call.

Domain goals should be phrased around operational signals such as DTF supply reorder, heat press pricing or purchase intent, quote request, callback, financing, product-fit consultation, sample request, machine upgrade, and training or installation. When a staff decision is required, create a task, note, pin, or route action; staff opens any customer support case manually.
