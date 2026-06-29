#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

type ApiMethod = 'GET' | 'POST';

const SERVER_NAME = 'factory-engine-workflow-mcp';
const SERVER_VERSION = '0.1.0';

const apiBaseUrl = normalizeBaseUrl(process.env.FACTORY_ENGINE_API_URL);
const accessToken = process.env.FACTORY_ENGINE_ACCESS_TOKEN?.trim() ?? '';
const tenantId = process.env.FACTORY_ENGINE_TENANT_ID?.trim() ?? '';

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

server.registerTool(
  'list_workflow_capabilities',
  {
    title: 'List workflow capabilities',
    description: 'List allowed workflow DSL triggers, conditions, actions, axes, operational intents, and MCP safeguards.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => jsonTool(await requestApi('GET', '/rules/mcp/capabilities')),
);

server.registerTool(
  'draft_workflow_rule',
  {
    title: 'Draft workflow rule',
    description: 'Compile a natural-language sales/personnel workflow goal into a safe deterministic workflow rule draft.',
    inputSchema: {
      naturalLanguageGoal: z.string().trim().min(8).max(1200),
      preferredStatus: z.enum(['draft', 'shadow', 'active', 'archived']).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('POST', '/rules/mcp/draft', input)),
);

server.registerTool(
  'validate_workflow_rule',
  {
    title: 'Validate workflow rule',
    description: 'Validate a workflow rule against Factory Engine safe DSL constraints before storing or simulating it.',
    inputSchema: {
      rule: z.unknown(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('POST', '/rules/mcp/validate', input)),
);

server.registerTool(
  'simulate_workflow_rule',
  {
    title: 'Simulate workflow rule',
    description: 'Dry-run a stored rule or draft rule against recent transcript operational signals. This does not create tasks.',
    inputSchema: {
      ruleId: z.string().trim().min(1).optional(),
      rule: z.unknown().optional(),
      recentDays: z.number().int().min(1).max(90).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('POST', '/rules/mcp/simulate', input)),
);

server.registerTool(
  'create_workflow_rule_draft',
  {
    title: 'Create workflow rule draft',
    description: 'Persist a validated workflow rule as draft. This never publishes the rule.',
    inputSchema: {
      rule: z.unknown(),
      sourceGoal: z.string().trim().max(1200).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('POST', '/rules/mcp/drafts', input)),
);

server.registerTool(
  'publish_workflow_rule',
  {
    title: 'Publish workflow rule',
    description: 'Publish a stored draft/shadow workflow rule after a completed simulation report. Requires settings.write permission.',
    inputSchema: {
      ruleId: z.string().trim().min(1),
      backfillReportId: z.string().trim().min(1),
      comment: z.string().trim().max(500).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('POST', '/rules/mcp/publish', input)),
);

server.registerPrompt(
  'workflow_rule_authoring_playbook',
  {
    title: 'Workflow rule authoring playbook',
    description: 'How Claude should safely create Factory Engine sales/personnel workflow rules.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Use Factory Engine workflow tools in this order:',
            '1. list_workflow_capabilities',
            '2. draft_workflow_rule',
            '3. validate_workflow_rule',
            '4. simulate_workflow_rule',
            '5. create_workflow_rule_draft',
            '6. simulate_workflow_rule again using the stored ruleId',
            '7. publish_workflow_rule only when the user explicitly approves.',
            '',
            'Never create support cases, tickets, customer requests, raw SQL, or unsupported actions.',
            'Rules must stay in the deterministic workflow DSL and target sales/account/personnel operations.',
          ].join('\n'),
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

function jsonTool(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function requestApi(method: ApiMethod, path: string, body?: unknown) {
  const configError = configurationError();
  if (configError) return { ok: false, error: configError };

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${accessToken}`,
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const text = await response.text();
  const payload = parsePayload(text);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      requestId: response.headers.get('x-request-id') ?? null,
      error: apiErrorMessage(payload, response.status),
      details: payload,
    };
  }
  return payload;
}

function configurationError() {
  if (!apiBaseUrl) return 'FACTORY_ENGINE_API_URL is required, for example https://api.dtfbank.com/api/v1';
  if (!accessToken) return 'FACTORY_ENGINE_ACCESS_TOKEN is required. Use a member access token with settings.read/settings.write as needed.';
  return null;
}

function normalizeBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, '') ?? '';
  return normalized || null;
}

function parsePayload(text: string) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function apiErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return `Factory Engine API request failed with HTTP ${status}`;
}
