import { ForbiddenException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  MEMBER_PERMISSIONS,
  type WorkflowMcpCreateDraftRuleInput,
  type WorkflowMcpDraftRuleInput,
  type WorkflowMcpSimulateDeferredWorkflowRuleInput,
  type WorkflowMcpSimulateRuleInput,
  type WorkflowMcpValidateRuleInput,
  type WorkflowRuleDto,
} from '@factory-engine-pro/contracts';
import { AircallService } from '../aircall/aircall.service.js';
import { RulesService } from '../rules/rules.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

const workflowRuleStatusSchema = z.enum(['draft', 'shadow', 'active', 'archived']);
const workflowRuleInputSchema = z.union([
  z.object({
    name: z.string().trim().min(2),
    definition: z.object({}).passthrough(),
    comment: z.string().trim().max(500).optional(),
  }).passthrough(),
  z.string().trim().min(2).max(250_000),
]);

@Injectable()
export class WorkflowMcpHttpService implements OnModuleDestroy {
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    private readonly rules: RulesService,
    private readonly aircall: AircallService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async handlePost(req: Request, res: Response) {
    const sessionId = headerValue(req.headers['mcp-session-id']);
    try {
      let transport = sessionId ? this.transports.get(sessionId) : undefined;
      if (!transport) {
        if (sessionId || !isInitializeRequest(req.body)) {
          this.badRequest(res, 'Bad Request: No valid MCP session id provided.');
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            this.transports.set(newSessionId, transport!);
            this.logger.log('mcp', 'workflow.session_initialized', 'Workflow MCP HTTP session initialized', {
              session_id: newSessionId,
              tenant_id: this.tenantContext.get()?.tenantId,
            });
          },
        });
        transport.onclose = () => this.removeTransport(transport!);
        const server = this.createServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error('mcp', 'workflow.request_failed', 'Workflow MCP HTTP request failed', {
        session_id: sessionId ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  async handleGet(req: Request, res: Response) {
    const transport = this.transportForSession(req, res);
    if (!transport) return;
    await transport.handleRequest(req, res);
  }

  async handleDelete(req: Request, res: Response) {
    const transport = this.transportForSession(req, res);
    if (!transport) return;
    await transport.handleRequest(req, res);
  }

  async onModuleDestroy() {
    await Promise.all(Array.from(this.transports.values()).map((transport) => transport.close().catch(() => undefined)));
    this.transports.clear();
  }

  private createServer() {
    const server = new McpServer({
      name: 'factory-engine-workflow-remote',
      version: '0.2.0',
    });

    server.registerTool(
      'list_workflow_capabilities',
      {
        title: 'List workflow capabilities',
        description: 'List allowed workflow DSL triggers, conditions, actions, axes, operational intents, and MCP safeguards.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.mcpCapabilities())),
    );

    server.registerTool(
      'read_workflow_agent_guide',
      {
        title: 'Read workflow agent guide',
        description: 'Read the Factory Engine rule authoring guide markdown before drafting complex workflow rules.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.mcpAgentGuide())),
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
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, async () => (
        filterWorkflowRules(await this.rules.listRules(), input)
      ))),
    );

    server.registerTool(
      'get_workflow_rule',
      {
        title: 'Get workflow rule',
        description: 'Read one stored workflow rule by id, including its deterministic DSL definition.',
        inputSchema: { ruleId: z.string().trim().min(1) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.getRule(input.ruleId))),
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
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsWrite,
        () => this.updateRuleStatus(input.ruleId, 'archived', input.comment ?? 'Archived through remote MCP rule management.'),
      )),
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
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsWrite,
        () => this.updateRuleStatus(input.ruleId, input.status, input.comment ?? `Restored to ${input.status} through remote MCP rule management.`),
      )),
    );

    server.registerTool(
      'draft_workflow_rule',
      {
        title: 'Draft workflow rule',
        description: 'Compile a natural-language sales/personnel workflow goal into a safe deterministic workflow rule draft.',
        inputSchema: {
          naturalLanguageGoal: z.string().trim().min(8).max(1200),
          preferredStatus: workflowRuleStatusSchema.optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.draftWorkflowRuleFromMcp({
        naturalLanguageGoal: input.naturalLanguageGoal,
        preferredStatus: input.preferredStatus ?? 'draft',
      } satisfies WorkflowMcpDraftRuleInput))),
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
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.validateWorkflowRuleFromMcp(input as WorkflowMcpValidateRuleInput),
      )),
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
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.simulateWorkflowRuleFromMcp({
          ...input,
          recentDays: input.recentDays ?? 7,
          limit: input.limit ?? 100,
        } as WorkflowMcpSimulateRuleInput),
      )),
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
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsWrite,
        () => this.rules.createWorkflowRuleDraftFromMcp(input as WorkflowMcpCreateDraftRuleInput),
      )),
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
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.publishWorkflowRuleFromMcp(input))),
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
          agent: z.string().trim().min(1).max(160).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.aircallUsersRead, () => this.aircall.listTranscripts(input))),
    );

    server.registerTool(
      'download_aircall_transcript',
      {
        title: 'Download Aircall transcript',
        description: 'Download one Aircall transcript and resolver output by call event id.',
        inputSchema: { callEventId: z.string().trim().min(1) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.aircallUsersRead, () => this.aircall.getTranscript(input.callEventId))),
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
          agent: z.string().trim().min(1).max(160).optional(),
          format: z.enum(['markdown', 'jsonl']).default('markdown'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.aircallUsersRead, () => this.aircall.exportTranscripts(input))),
    );

    server.registerTool(
      'list_scheduled_workflow_actions',
      {
        title: 'List scheduled workflow actions',
        description: 'List hidden deferred workflow actions before they materialize into visible staff work.',
        inputSchema: {
          status: z.enum(['pending', 'executing', 'executed', 'skipped', 'cancelled', 'failed']).optional(),
          ruleId: z.string().trim().min(1).optional(),
          customerId: z.string().trim().min(1).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.listScheduledWorkflowActions(input))),
    );

    server.registerTool(
      'get_scheduled_workflow_action',
      {
        title: 'Get scheduled workflow action',
        description: 'Read one deferred workflow action including runAt, revalidation policy, and execution state.',
        inputSchema: { scheduledActionId: z.string().trim().min(1) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.getScheduledWorkflowAction(input))),
    );

    server.registerTool(
      'cancel_scheduled_workflow_action',
      {
        title: 'Cancel scheduled workflow action',
        description: 'Cancel a pending deferred workflow action before it creates visible staff work.',
        inputSchema: { scheduledActionId: z.string().trim().min(1) },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.cancelScheduledWorkflowAction(input))),
    );

    server.registerTool(
      'simulate_deferred_workflow_rule',
      {
        title: 'Simulate deferred workflow rule',
        description: 'Dry-run a stored or draft rule and summarize deferred materialization actions.',
        inputSchema: {
          ruleId: z.string().trim().min(1).optional(),
          draftId: z.string().trim().min(1).optional(),
          rule: workflowRuleInputSchema.optional(),
          ruleJson: z.string().trim().min(2).max(250_000).optional(),
          recentDays: z.number().int().min(1).max(90).optional(),
          limit: z.number().int().min(1).max(500).optional(),
          now: z.string().datetime().optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.simulateDeferredWorkflowRuleFromMcp({
          ...input,
          recentDays: input.recentDays ?? 7,
          limit: input.limit ?? 100,
        } as WorkflowMcpSimulateDeferredWorkflowRuleInput),
      )),
    );

    server.registerTool(
      'explain_scheduled_workflow_action',
      {
        title: 'Explain scheduled workflow action',
        description: 'Explain when a hidden deferred workflow action will become visible or why it was skipped.',
        inputSchema: { scheduledActionId: z.string().trim().min(1) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.explainScheduledWorkflowAction(input))),
    );

    server.registerTool(
      'read_frontend_agent_guide',
      {
        title: 'Read frontend agent guide',
        description: 'Read the frontend engineering MCP guide before changing staff or admin UI.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.frontendAgentGuide())),
    );

    server.registerTool(
      'list_frontend_surfaces',
      {
        title: 'List frontend surfaces',
        description: 'List allowlisted frontend surfaces and their high-level boundaries.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.frontendSurfaces())),
    );

    server.registerTool(
      'get_frontend_surface_contract',
      {
        title: 'Get frontend surface contract',
        description: 'Read one frontend surface contract including files, endpoints, states, terminology, and smoke checklist.',
        inputSchema: { surfaceId: z.string().trim().min(1).default('staff.queue') },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.frontendSurfaceContract(input.surfaceId))),
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
              ].join('\n'),
            },
          },
        ],
      }),
    );

    return server;
  }

  private async updateRuleStatus(ruleId: string, status: 'draft' | 'shadow' | 'archived', comment: string) {
    const rule = await this.rules.getRule(ruleId);
    return this.rules.updateRule(ruleId, {
      name: rule.name,
      definition: { ...rule.definition, status },
      comment,
    });
  }

  private async withPermission<T>(permission: string, callback: () => Promise<T> | T): Promise<T> {
    const permissions = new Set(this.tenantContext.require().permissions);
    if (!permissions.has(permission)) {
      throw new ForbiddenException({
        message: 'You do not have permission to use this MCP tool.',
        code: 'mcp_permission_denied',
        details: { missing: [permission] },
      });
    }
    return callback();
  }

  private jsonTool(value: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(value, null, 2),
        },
      ],
    };
  }

  private transportForSession(req: Request, res: Response) {
    const sessionId = headerValue(req.headers['mcp-session-id']);
    const transport = sessionId ? this.transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send('Invalid or missing MCP session id');
      return null;
    }
    return transport;
  }

  private badRequest(res: Response, message: string) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      id: null,
    });
  }

  private removeTransport(transport: StreamableHTTPServerTransport) {
    const sessionId = transport.sessionId;
    if (!sessionId) return;
    this.transports.delete(sessionId);
    this.logger.log('mcp', 'workflow.session_closed', 'Workflow MCP HTTP session closed', {
      session_id: sessionId,
    });
  }
}

function filterWorkflowRules(payload: { rules: WorkflowRuleDto[] }, input: {
  status?: string;
  trigger?: string;
  search?: string;
  limit?: number;
}) {
  const search = input.search?.trim().toLowerCase();
  const trigger = input.trigger?.trim();
  const filtered = payload.rules
    .filter((rule) => !input.status || rule.status === input.status)
    .filter((rule) => !trigger || rule.trigger === trigger || rule.definition.trigger === trigger)
    .filter((rule) => {
      if (!search) return true;
      return [rule.id, rule.name, rule.trigger]
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

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
