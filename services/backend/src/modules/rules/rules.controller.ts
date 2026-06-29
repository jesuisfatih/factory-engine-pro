import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  activeWorkflowRuleStatsQuerySchema,
  backfillWorkflowRuleSchema,
  bootstrapWorkflowDefaultsSchema,
  fireWorkflowTriggerSchema,
  MEMBER_PERMISSIONS,
  rollbackWorkflowRuleSchema,
  saveWorkflowRuleSchema,
  workflowMcpCreateDraftRuleSchema,
  workflowMcpDraftRuleSchema,
  workflowMcpPublishRuleSchema,
  workflowMcpSimulateRuleSchema,
  workflowMcpValidateRuleSchema,
  type ActiveWorkflowRuleStatsQuery,
  type BackfillWorkflowRuleInput,
  type BootstrapWorkflowDefaultsInput,
  type RollbackWorkflowRuleInput,
  type SaveWorkflowRuleInput,
  type WorkflowTriggerFireInput,
  type WorkflowMcpCreateDraftRuleInput,
  type WorkflowMcpDraftRuleInput,
  type WorkflowMcpPublishRuleInput,
  type WorkflowMcpSimulateRuleInput,
  type WorkflowMcpValidateRuleInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { RulesService } from './rules.service.js';

@Controller(['rules', 'workflow/rules'])
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  listRules() {
    return this.rules.listRules();
  }

  @Post()
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  createRule(@Body(new ZodValidationPipe(saveWorkflowRuleSchema)) body: SaveWorkflowRuleInput) {
    return this.rules.createRule(body);
  }

  @Post('defaults/bootstrap')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  bootstrapDefaults(@Body(new ZodValidationPipe(bootstrapWorkflowDefaultsSchema)) _body: BootstrapWorkflowDefaultsInput) {
    return this.rules.bootstrapDefaults();
  }

  @Post('events/fire')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  fireTrigger(@Body(new ZodValidationPipe(fireWorkflowTriggerSchema)) body: WorkflowTriggerFireInput) {
    return this.rules.fireTrigger(body);
  }

  @Get('catalog')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  catalog() {
    return this.rules.catalog();
  }

  @Get('enum-chain')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  enumChainProbe() {
    return this.rules.enumChainProbe();
  }

  @Get('mcp/capabilities')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpCapabilities() {
    return this.rules.mcpCapabilities();
  }

  @Post('mcp/draft')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpDraft(@Body(new ZodValidationPipe(workflowMcpDraftRuleSchema)) body: WorkflowMcpDraftRuleInput) {
    return this.rules.draftWorkflowRuleFromMcp(body);
  }

  @Post('mcp/validate')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpValidate(@Body(new ZodValidationPipe(workflowMcpValidateRuleSchema)) body: WorkflowMcpValidateRuleInput) {
    return this.rules.validateWorkflowRuleFromMcp(body);
  }

  @Post('mcp/simulate')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpSimulate(@Body(new ZodValidationPipe(workflowMcpSimulateRuleSchema)) body: WorkflowMcpSimulateRuleInput) {
    return this.rules.simulateWorkflowRuleFromMcp(body);
  }

  @Post('mcp/drafts')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpCreateDraft(@Body(new ZodValidationPipe(workflowMcpCreateDraftRuleSchema)) body: WorkflowMcpCreateDraftRuleInput) {
    return this.rules.createWorkflowRuleDraftFromMcp(body);
  }

  @Post('mcp/publish')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpPublish(@Body(new ZodValidationPipe(workflowMcpPublishRuleSchema)) body: WorkflowMcpPublishRuleInput) {
    return this.rules.publishWorkflowRuleFromMcp(body);
  }

  @Get('stats/active')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  activeStats(@Query(new ZodValidationPipe(activeWorkflowRuleStatsQuerySchema)) query: ActiveWorkflowRuleStatsQuery) {
    return this.rules.activeStats(query);
  }

  @Get(':id/versions')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  versions(@Param('id') id: string) {
    return this.rules.listRuleVersions(id);
  }

  @Post(':id/rollback')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  rollback(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rollbackWorkflowRuleSchema)) body: RollbackWorkflowRuleInput,
  ) {
    return this.rules.rollbackRule(id, body);
  }

  @Get(':id/backfills')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  backfills(@Param('id') id: string) {
    return this.rules.listBackfillReports(id);
  }

  @Get(':id/executions')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  executions(@Param('id') id: string) {
    return this.rules.listExecutions(id);
  }

  @Post(':id/backfill')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  backfill(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(backfillWorkflowRuleSchema)) body: BackfillWorkflowRuleInput,
  ) {
    return this.rules.runBackfill(id, body);
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  getRule(@Param('id') id: string) {
    return this.rules.getRule(id);
  }

  @Put(':id')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveWorkflowRuleSchema)) body: SaveWorkflowRuleInput,
  ) {
    return this.rules.updateRule(id, body);
  }
}
