#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

type ApiMethod = 'GET' | 'POST' | 'PUT';

const SERVER_NAME = 'factory-engine-workflow-mcp';
const SERVER_VERSION = '0.1.0';
const workflowRuleStatusSchema = z.enum(['draft', 'shadow', 'active', 'archived']);
const workflowRuleInputSchema = z.union([
  z.object({
    name: z.string().trim().min(2),
    definition: z.object({}).passthrough(),
    comment: z.string().trim().max(500).optional(),
  }).passthrough(),
  z.string().trim().min(2).max(250_000),
]);

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
  'read_workflow_agent_guide',
  {
    title: 'Read workflow agent guide',
    description: 'Read the Factory Engine rule authoring guide markdown before drafting complex workflow rules.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => jsonTool(await requestApi('GET', '/rules/mcp/agent-guide')),
);

server.registerTool(
  'list_workflow_rules',
  {
    title: 'List workflow rules',
    description: 'List stored workflow rules with optional status/search/trigger filters before editing, simulating, or archiving.',
    inputSchema: {
      status: workflowRuleStatusSchema.optional(),
      trigger: z.string().trim().min(1).max(120).optional(),
      search: z.string().trim().min(1).max(160).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(filterWorkflowRules(await requestApi('GET', '/rules'), input)),
);

server.registerTool(
  'get_workflow_rule',
  {
    title: 'Get workflow rule',
    description: 'Read one stored workflow rule by id, including its deterministic DSL definition.',
    inputSchema: {
      ruleId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('GET', `/rules/${encodeURIComponent(input.ruleId)}`)),
);

server.registerTool(
  'archive_workflow_rule',
  {
    title: 'Archive workflow rule',
    description: 'Safely remove a stored workflow rule from runtime by changing status to archived. This does not hard-delete audit history.',
    inputSchema: {
      ruleId: z.string().trim().min(1),
      comment: z.string().trim().max(500).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  async (input) => jsonTool(await updateWorkflowRuleStatus(input.ruleId, 'archived', input.comment ?? 'Archived through MCP rule management.')),
);

server.registerTool(
  'restore_workflow_rule',
  {
    title: 'Restore workflow rule',
    description: 'Restore an archived workflow rule to draft or shadow. Publishing active rules still requires publish_workflow_rule.',
    inputSchema: {
      ruleId: z.string().trim().min(1),
      status: z.enum(['draft', 'shadow']).default('draft'),
      comment: z.string().trim().max(500).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  async (input) => jsonTool(await updateWorkflowRuleStatus(input.ruleId, input.status, input.comment ?? `Restored to ${input.status} through MCP rule management.`)),
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
      draftId: z.string().trim().min(1).optional(),
      rule: workflowRuleInputSchema.optional(),
      ruleJson: z.string().trim().min(2).max(250_000).optional(),
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
      draftId: z.string().trim().min(1).optional(),
      rule: workflowRuleInputSchema.optional(),
      ruleJson: z.string().trim().min(2).max(250_000).optional(),
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
      draftId: z.string().trim().min(1).optional(),
      rule: workflowRuleInputSchema.optional(),
      ruleJson: z.string().trim().min(2).max(250_000).optional(),
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

server.registerTool(
  'list_aircall_transcripts',
  {
    title: 'List Aircall transcripts',
    description: 'List transcript metadata without full transcript text. Use this before downloading a specific transcript.',
    inputSchema: {
      recentDays: z.number().int().min(1).max(365).optional(),
      limit: z.number().int().min(1).max(500).default(50),
      q: z.string().trim().min(1).max(160).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('GET', `/aircall/calls/transcripts${queryString(input)}`)),
);

server.registerTool(
  'download_aircall_transcript',
  {
    title: 'Download Aircall transcript',
    description: 'Download one Aircall transcript and resolver output by call event id.',
    inputSchema: {
      callEventId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('GET', `/aircall/calls/${encodeURIComponent(input.callEventId)}/transcript`)),
);

server.registerTool(
  'export_aircall_transcripts',
  {
    title: 'Export Aircall transcripts',
    description: 'Export a bounded set of transcripts as markdown or jsonl. Keep limits narrow to control token use.',
    inputSchema: {
      recentDays: z.number().int().min(1).max(365).optional(),
      limit: z.number().int().min(1).max(500).default(20),
      q: z.string().trim().min(1).max(160).optional(),
      format: z.enum(['markdown', 'jsonl']).default('markdown'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (input) => jsonTool(await requestApi('GET', `/aircall/calls/transcripts/export${queryString(input)}`)),
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
            '1. read_workflow_agent_guide and list_workflow_capabilities before drafting complex rules.',
            '2. list_workflow_rules to check whether a matching active/draft rule already exists.',
            '3. draft_workflow_rule from the customer natural-language goal.',
            '4. validate_workflow_rule against the deterministic DSL. If object input fails in an MCP client, pass the same JSON as ruleJson.',
            '5. simulate_workflow_rule as a draft to estimate recent matches.',
            '6. create_workflow_rule_draft only after validation is clean.',
            '7. simulate_workflow_rule again using the stored ruleId; this stored simulation report is required for publish.',
            '8. publish_workflow_rule only when the user explicitly approves and supplies the stored simulation report id.',
            '',
            'Use archive_workflow_rule for removal; never hard-delete rules or audit history.',
            'Use list_aircall_transcripts before download_aircall_transcript so you only fetch the transcript needed for the rule/debug task.',
            'Never create support cases, tickets, customer requests, raw SQL, or unsupported actions.',
            'Rules must stay in the deterministic workflow DSL and target sales/account/personnel operations.',
            'Create-task assignment resolves explicit member, Aircall call owner, customer axis primary, then axis primary role.',
            'Use the operational intent registry from list_workflow_capabilities instead of inventing intents, conditions, or actions.',
            'When the goal asks for a staff decision, draft a task/note/pin workflow and leave any support case creation to the staff member.',
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
      ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${accessToken}`,
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
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

async function updateWorkflowRuleStatus(ruleId: string, status: 'draft' | 'shadow' | 'archived', comment: string) {
  const rule = await requestApi('GET', `/rules/${encodeURIComponent(ruleId)}`);
  if (!isRecord(rule) || !isRecord(rule.definition)) return rule;
  const body = {
    name: String(rule.name ?? ''),
    definition: {
      ...rule.definition,
      status,
    },
    comment,
  };
  return requestApi('PUT', `/rules/${encodeURIComponent(ruleId)}`, body);
}

function filterWorkflowRules(payload: unknown, input: {
  status?: string;
  trigger?: string;
  search?: string;
  limit?: number;
}) {
  if (!isRecord(payload) || !Array.isArray(payload.rules)) return payload;
  const search = input.search?.trim().toLowerCase();
  const trigger = input.trigger?.trim();
  const filtered = payload.rules
    .filter(isRecord)
    .filter((rule) => !input.status || rule.status === input.status)
    .filter((rule) => !trigger || rule.trigger === trigger || (isRecord(rule.definition) && rule.definition.trigger === trigger))
    .filter((rule) => {
      if (!search) return true;
      return [rule.id, rule.name, rule.trigger]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(search));
    });
  const limit = input.limit ?? 50;
  return {
    rules: filtered.slice(0, limit),
    count: Math.min(filtered.length, limit),
    totalMatched: filtered.length,
    totalRules: payload.rules.length,
    hasMore: filtered.length > limit,
  };
}

function queryString(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
