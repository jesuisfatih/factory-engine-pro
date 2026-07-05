import { ForbiddenException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  algorithmMcpCompareVersionsSchema,
  algorithmMcpDraftChangeSchema,
  algorithmMcpExplainCustomerRankingSchema,
  algorithmMcpExplainTaskVisibilitySchema,
  algorithmMcpPublishVersionSchema,
  algorithmMcpRollbackVersionSchema,
  algorithmMcpSimulateChangeSchema,
  algorithmMcpValidateChangeSchema,
  MEMBER_PERMISSIONS,
  type FrontendMcpApplyCustomizationInput,
  type FrontendMcpListCustomizationsInput,
  type FrontendMcpPreviewCustomizationInput,
  type FrontendMcpPreviewSourcePatchInput,
  type FrontendMcpRollbackCustomizationInput,
  type FrontendMcpValidateSourcePatchProofInput,
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

const frontendSourcePatchFileInput = z.object({
  path: z.string().trim().min(1).max(220),
  purpose: z.string().trim().min(1).max(240),
  patch: z.string().trim().min(1).max(16000),
});

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

    this.registerAlgorithmTools(server);

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

    server.registerTool(
      'preview_frontend_customization',
      {
        title: 'Preview frontend customization',
        description: 'Validate and preview a tenant UI customization DSL without changing staff UI.',
        inputSchema: {
          surfaceId: z.literal('staff.queue'),
          name: z.string().trim().min(2).max(120),
          definition: z.object({}).passthrough(),
          reason: z.string().trim().max(800).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.previewFrontendCustomization(input as FrontendMcpPreviewCustomizationInput),
      )),
    );

    server.registerTool(
      'apply_frontend_customization',
      {
        title: 'Apply frontend customization',
        description: 'Store a tenant UI customization as draft or activate it for the allowlisted staff surface.',
        inputSchema: {
          surfaceId: z.literal('staff.queue'),
          name: z.string().trim().min(2).max(120),
          definition: z.object({}).passthrough(),
          reason: z.string().trim().max(800).optional(),
          status: z.enum(['draft', 'active', 'archived']).default('active'),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsWrite,
        () => this.rules.applyFrontendCustomization(input as FrontendMcpApplyCustomizationInput),
      )),
    );

    server.registerTool(
      'list_frontend_customizations',
      {
        title: 'List frontend customizations',
        description: 'List stored tenant UI customizations for audit and rollback.',
        inputSchema: {
          surfaceId: z.literal('staff.queue').optional(),
          status: z.enum(['draft', 'active', 'archived']).optional(),
          limit: z.number().int().min(1).max(100).default(25),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.listFrontendCustomizations(input as FrontendMcpListCustomizationsInput),
      )),
    );

    server.registerTool(
      'get_frontend_customization',
      {
        title: 'Get frontend customization',
        description: 'Read one stored tenant UI customization by id.',
        inputSchema: { customizationId: z.string().trim().min(1) },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.getFrontendCustomization(input))),
    );

    server.registerTool(
      'rollback_frontend_customization',
      {
        title: 'Rollback frontend customization',
        description: 'Archive the current active UI customization or reactivate a previous one.',
        inputSchema: {
          surfaceId: z.literal('staff.queue'),
          targetCustomizationId: z.string().trim().min(1).optional(),
          reason: z.string().trim().max(800).optional(),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsWrite,
        () => this.rules.rollbackFrontendCustomization(input as FrontendMcpRollbackCustomizationInput),
      )),
    );

    server.registerTool(
      'preview_frontend_source_patch',
      {
        title: 'Preview frontend source patch',
        description: 'Validate a maintainer-only React/CSS source patch plan against allowlists without applying it.',
        inputSchema: {
          surfaceId: z.literal('staff.queue'),
          name: z.string().trim().min(2).max(120),
          files: z.array(frontendSourcePatchFileInput).min(1).max(12),
          reason: z.string().trim().min(1).max(800),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.previewFrontendSourcePatch(input as FrontendMcpPreviewSourcePatchInput),
      )),
    );

    server.registerTool(
      'validate_frontend_source_patch_proof',
      {
        title: 'Validate frontend source patch proof',
        description: 'Validate typecheck/build/screenshot proof for a source patch plan before human-approved deploy.',
        inputSchema: {
          surfaceId: z.literal('staff.queue'),
          name: z.string().trim().min(2).max(120),
          files: z.array(frontendSourcePatchFileInput).min(1).max(12),
          reason: z.string().trim().min(1).max(800),
          typecheckCommand: z.string().trim().min(1).max(220),
          typecheckPassed: z.boolean(),
          buildCommand: z.string().trim().min(1).max(220),
          buildPassed: z.boolean(),
          screenshots: z.array(z.object({
            viewport: z.enum(['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark']),
            path: z.string().trim().min(1).max(260),
          })).min(3).max(8),
          humanApproval: z.boolean().default(false),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(
        MEMBER_PERMISSIONS.settingsRead,
        () => this.rules.validateFrontendSourcePatchProof(input as FrontendMcpValidateSourcePatchProofInput),
      )),
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
                'For algorithm changes, use list_algorithm_surfaces, then get_algorithm_contract for the exact surface. Draft with draft_algorithm_change, validate with validate_algorithm_change, simulate with simulate_algorithm_change, and compare with compare_algorithm_versions before publish.',
                'Use publish_algorithm_version only after explicit human approval and a passed simulation report for the same stored strategy. Use rollback_algorithm_version to recover.',
                'Use explain_customer_ranking and explain_task_visibility when the user asks why a customer or task appears, disappears, or moves in rank.',
                'Algorithm strategy JSON may change weights, conditions, sort, visibility, cooldown, scoreBands, CTA priority, and modal action order only. It must not change auth, tenant scope, RBAC, checkout/payment, webhook secrets, raw SQL, Prisma tenant extension, or destructive queue behavior.',
                'For frontend work, read_frontend_agent_guide first, then list_frontend_surfaces and get_frontend_surface_contract.',
                'Before proposing a frontend change, list_frontend_customizations for the target surface so you know whether an active tenant overlay already exists.',
                'Use preview_frontend_customization before apply_frontend_customization. The customization DSL changes staff UI through safe slots, blocks, sanitized contentBlocks, bounded themeOverrides, data bindings, visibility conditions, typed elementOverrides, and typed navigationOverrides; it never accepts scripts, secrets, arbitrary CSS, or source edits.',
                'If the user asks for HTML or CSS, translate HTML/Markdown into sanitized contentBlocks and CSS intent into themeOverrides, tones, density, copy, and visibility rules. Reject scripts, iframes, inline style, event handlers, external assets, and hidden auth/data access.',
                'Use the staff.queue element map from get_frontend_surface_contract: current MVP supports overlay slots, contentBlocks, themeOverrides, typed elementOverrides, and typed navigationOverrides for known sidebar nav ids.',
                'If the user asks to change the staff sidebar, nav item names, nav order, groups, badges, or default route, use navigationOverrides with known nav ids and screenshot proof. Do not fake navigation changes with CSS or overlay blocks, and never change routes or permissions through runtime customization.',
                'If the user asks to patch React/CSS source directly, use preview_frontend_source_patch first. Source patch lane is maintainer-only, limited to apps/person/src/** and packages/ui/src/**, and needs typecheck/build/light-dark-mobile screenshots plus validate_frontend_source_patch_proof before human-approved deploy.',
                'Staff UI customizations must preserve real API data, loading/empty/error/populated states, light/dark readability, and business terminology. Never hide phone, required action, latest order, latest call, open follow-up, or notes.',
                'Never create support cases, tickets, customer requests, raw SQL, or unsupported actions.',
              ].join('\n'),
            },
          },
        ],
      }),
    );

    return server;
  }

  private registerAlgorithmTools(server: McpServer) {
    const surfaceId = z.enum([
      'staff.daily_call_list.ranking',
      'staff.priority_kanban.customer_score',
      'staff.task_visibility',
      'staff.customer_next_action',
      'staff.call_brief_generation',
      'customer_portal.reorder_eligibility',
      'mail_marketing.audience_eligibility',
      'mail_marketing.send_safety',
    ]);
    const strategyStatus = z.enum(['draft', 'shadow', 'active', 'archived']);
    const strategyInput = z.union([
      z.object({
        surfaceId,
        name: z.string().trim().min(2).max(140),
        definition: z.object({}).passthrough(),
        status: strategyStatus.optional(),
        reason: z.string().trim().max(1000).optional(),
      }).passthrough(),
      z.string().trim().min(2).max(250_000),
    ]);

    server.registerTool(
      'list_algorithm_surfaces',
      {
        title: 'List algorithm surfaces',
        description: 'List safe strategy-engine surfaces that can be changed through JSON/DSL.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.algorithmSurfaces())),
    );

    server.registerTool(
      'get_algorithm_contract',
      {
        title: 'Get algorithm contract',
        description: 'Read a strategy surface contract, active strategy, allowed fields, simulation evidence, and red lines.',
        inputSchema: { surfaceId },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.algorithmSurfaceContract(input.surfaceId))),
    );

    server.registerTool(
      'draft_algorithm_change',
      {
        title: 'Draft algorithm change',
        description: 'Draft and persist a versioned algorithm strategy from a natural-language business goal.',
        inputSchema: {
          surfaceId,
          naturalLanguageGoal: z.string().trim().min(8).max(1600),
          preferredStatus: strategyStatus.optional(),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.draftAlgorithmChangeFromMcp(algorithmMcpDraftChangeSchema.parse(input)))),
    );

    server.registerTool(
      'validate_algorithm_change',
      {
        title: 'Validate algorithm change',
        description: 'Validate a stored or JSON strategy against the surface contract.',
        inputSchema: {
          strategyId: z.string().trim().min(1).optional(),
          strategy: strategyInput.optional(),
          strategyJson: z.string().trim().min(2).max(250_000).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.validateAlgorithmChangeFromMcp(algorithmMcpValidateChangeSchema.parse(input)))),
    );

    server.registerTool(
      'simulate_algorithm_change',
      {
        title: 'Simulate algorithm change',
        description: 'Run a no-mutation strategy simulation against bounded live data and store the diff report.',
        inputSchema: {
          surfaceId,
          strategyId: z.string().trim().min(1).optional(),
          strategy: strategyInput.optional(),
          strategyJson: z.string().trim().min(2).max(250_000).optional(),
          memberEmail: z.string().email().optional(),
          recentDays: z.number().int().min(1).max(90).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.simulateAlgorithmChangeFromMcp(algorithmMcpSimulateChangeSchema.parse(input)))),
    );

    server.registerTool(
      'compare_algorithm_versions',
      {
        title: 'Compare algorithm versions',
        description: 'Compare baseline and candidate strategy outcomes before publish.',
        inputSchema: {
          surfaceId,
          baseStrategyId: z.string().trim().min(1).optional(),
          candidateStrategyId: z.string().trim().min(1).optional(),
          candidateStrategy: strategyInput.optional(),
          candidateStrategyJson: z.string().trim().min(2).max(250_000).optional(),
          memberEmail: z.string().email().optional(),
          recentDays: z.number().int().min(1).max(90).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.compareAlgorithmVersionsFromMcp(algorithmMcpCompareVersionsSchema.parse(input)))),
    );

    server.registerTool(
      'publish_algorithm_version',
      {
        title: 'Publish algorithm version',
        description: 'Activate a stored strategy only after a passed simulation report for the same strategy.',
        inputSchema: {
          strategyId: z.string().trim().min(1),
          simulationId: z.string().trim().min(1),
          comment: z.string().trim().max(800).optional(),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.publishAlgorithmVersionFromMcp(algorithmMcpPublishVersionSchema.parse(input)))),
    );

    server.registerTool(
      'rollback_algorithm_version',
      {
        title: 'Rollback algorithm version',
        description: 'Rollback one strategy surface to a previous strategy/version without source edits.',
        inputSchema: {
          surfaceId,
          targetStrategyId: z.string().trim().min(1).optional(),
          versionNo: z.number().int().min(1).optional(),
          comment: z.string().trim().max(800).optional(),
        },
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsWrite, () => this.rules.rollbackAlgorithmVersionFromMcp(algorithmMcpRollbackVersionSchema.parse(input)))),
    );

    server.registerTool(
      'explain_customer_ranking',
      {
        title: 'Explain customer ranking',
        description: 'Explain why a customer ranks where they do under a strategy.',
        inputSchema: {
          surfaceId: surfaceId.optional(),
          customerId: z.string().trim().min(1),
          strategyId: z.string().trim().min(1).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.explainCustomerRankingFromMcp(algorithmMcpExplainCustomerRankingSchema.parse(input)))),
    );

    server.registerTool(
      'explain_task_visibility',
      {
        title: 'Explain task visibility',
        description: 'Explain why a task is visible, hidden, or delayed under a strategy.',
        inputSchema: {
          surfaceId: surfaceId.optional(),
          serviceRequestId: z.string().trim().min(1),
          strategyId: z.string().trim().min(1).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => this.jsonTool(await this.withPermission(MEMBER_PERMISSIONS.settingsRead, () => this.rules.explainTaskVisibilityFromMcp(algorithmMcpExplainTaskVisibilitySchema.parse(input)))),
    );
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
