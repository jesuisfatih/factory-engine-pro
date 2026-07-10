import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  activeWorkflowRuleStatsQuerySchema,
  algorithmMcpCompareVersionsSchema,
  algorithmMcpDraftChangeSchema,
  algorithmMcpExplainCustomerRankingSchema,
  algorithmMcpExplainTaskVisibilitySchema,
  algorithmMcpPublishVersionSchema,
  algorithmMcpRollbackVersionSchema,
  algorithmMcpSimulateChangeSchema,
  algorithmMcpValidateChangeSchema,
  backfillWorkflowRuleSchema,
  bootstrapWorkflowDefaultsSchema,
  fireWorkflowTriggerSchema,
  frontendMcpApplyCustomizationSchema,
  frontendMcpListCustomizationsSchema,
  frontendMcpPreviewCustomizationSchema,
  frontendMcpPreviewSourcePatchSchema,
  frontendMcpRollbackCustomizationSchema,
  frontendMcpValidateSourcePatchProofSchema,
  MEMBER_PERMISSIONS,
  rollbackWorkflowRuleSchema,
  saveWorkflowRuleSchema,
  workflowMcpCreateDraftRuleSchema,
  workflowMcpDraftRuleSchema,
  workflowMcpListScheduledWorkflowActionsSchema,
  workflowMcpPublishRuleSchema,
  workflowMcpSimulateDeferredWorkflowRuleSchema,
  workflowMcpSimulateRuleSchema,
  workflowMcpUpdateRuleSchema,
  workflowMcpValidateRuleSchema,
  type ActiveWorkflowRuleStatsQuery,
  type AlgorithmMcpCompareVersionsInput,
  type AlgorithmMcpDraftChangeInput,
  type AlgorithmMcpExplainCustomerRankingInput,
  type AlgorithmMcpExplainTaskVisibilityInput,
  type AlgorithmMcpPublishVersionInput,
  type AlgorithmMcpRollbackVersionInput,
  type AlgorithmMcpSimulateChangeInput,
  type AlgorithmMcpValidateChangeInput,
  type BackfillWorkflowRuleInput,
  type BootstrapWorkflowDefaultsInput,
  type FrontendMcpApplyCustomizationInput,
  type FrontendMcpListCustomizationsInput,
  type FrontendMcpPreviewCustomizationInput,
  type FrontendMcpPreviewSourcePatchInput,
  type FrontendMcpRollbackCustomizationInput,
  type FrontendMcpValidateSourcePatchProofInput,
  type RollbackWorkflowRuleInput,
  type SaveWorkflowRuleInput,
  type WorkflowTriggerFireInput,
  type WorkflowMcpCreateDraftRuleInput,
  type WorkflowMcpDraftRuleInput,
  type WorkflowMcpListScheduledWorkflowActionsInput,
  type WorkflowMcpPublishRuleInput,
  type WorkflowMcpSimulateDeferredWorkflowRuleInput,
  type WorkflowMcpSimulateRuleInput,
  type WorkflowMcpUpdateRuleInput,
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

  @Get('operational-contract')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  operationalContractProbe() {
    return this.rules.operationalContractProbe();
  }

  @Get('mcp/capabilities')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpCapabilities() {
    return this.rules.mcpCapabilities();
  }

  @Get('mcp/agent-guide')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpAgentGuide() {
    return this.rules.mcpAgentGuide();
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

  @Post('mcp/update')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpUpdate(@Body(new ZodValidationPipe(workflowMcpUpdateRuleSchema)) body: WorkflowMcpUpdateRuleInput) {
    return this.rules.updateWorkflowRuleFromMcp(body);
  }

  @Post('mcp/publish')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpPublish(@Body(new ZodValidationPipe(workflowMcpPublishRuleSchema)) body: WorkflowMcpPublishRuleInput) {
    return this.rules.publishWorkflowRuleFromMcp(body);
  }

  @Get('mcp/scheduled-actions')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpScheduledActions(
    @Query(new ZodValidationPipe(workflowMcpListScheduledWorkflowActionsSchema)) query: WorkflowMcpListScheduledWorkflowActionsInput,
  ) {
    return this.rules.listScheduledWorkflowActions(query);
  }

  @Get('mcp/scheduled-actions/:scheduledActionId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpScheduledAction(@Param('scheduledActionId') scheduledActionId: string) {
    return this.rules.getScheduledWorkflowAction({ scheduledActionId });
  }

  @Post('mcp/scheduled-actions/:scheduledActionId/cancel')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpCancelScheduledAction(@Param('scheduledActionId') scheduledActionId: string) {
    return this.rules.cancelScheduledWorkflowAction({ scheduledActionId });
  }

  @Get('mcp/scheduled-actions/:scheduledActionId/explain')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpExplainScheduledAction(@Param('scheduledActionId') scheduledActionId: string) {
    return this.rules.explainScheduledWorkflowAction({ scheduledActionId });
  }

  @Post('mcp/simulate-deferred')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpSimulateDeferred(
    @Body(new ZodValidationPipe(workflowMcpSimulateDeferredWorkflowRuleSchema)) body: WorkflowMcpSimulateDeferredWorkflowRuleInput,
  ) {
    return this.rules.simulateDeferredWorkflowRuleFromMcp(body);
  }

  @Get('mcp/frontend/agent-guide')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpFrontendAgentGuide() {
    return this.rules.frontendAgentGuide();
  }

  @Get('mcp/frontend/surfaces')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpFrontendSurfaces() {
    return this.rules.frontendSurfaces();
  }

  @Get('mcp/frontend/surfaces/:surfaceId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpFrontendSurface(@Param('surfaceId') surfaceId: string) {
    return this.rules.frontendSurfaceContract(surfaceId);
  }

  @Post('mcp/frontend/customizations/preview')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpPreviewFrontendCustomization(
    @Body(new ZodValidationPipe(frontendMcpPreviewCustomizationSchema)) body: FrontendMcpPreviewCustomizationInput,
  ) {
    return this.rules.previewFrontendCustomization(body);
  }

  @Post('mcp/frontend/customizations')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpApplyFrontendCustomization(
    @Body(new ZodValidationPipe(frontendMcpApplyCustomizationSchema)) body: FrontendMcpApplyCustomizationInput,
  ) {
    return this.rules.applyFrontendCustomization(body);
  }

  @Get('mcp/frontend/customizations')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpListFrontendCustomizations(
    @Query(new ZodValidationPipe(frontendMcpListCustomizationsSchema)) query: FrontendMcpListCustomizationsInput,
  ) {
    return this.rules.listFrontendCustomizations(query);
  }

  @Get('mcp/frontend/customizations/:customizationId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpGetFrontendCustomization(@Param('customizationId') customizationId: string) {
    return this.rules.getFrontendCustomization({ customizationId });
  }

  @Post('mcp/frontend/customizations/rollback')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpRollbackFrontendCustomization(
    @Body(new ZodValidationPipe(frontendMcpRollbackCustomizationSchema)) body: FrontendMcpRollbackCustomizationInput,
  ) {
    return this.rules.rollbackFrontendCustomization(body);
  }

  @Post('mcp/frontend/source-patches/preview')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpPreviewFrontendSourcePatch(
    @Body(new ZodValidationPipe(frontendMcpPreviewSourcePatchSchema)) body: FrontendMcpPreviewSourcePatchInput,
  ) {
    return this.rules.previewFrontendSourcePatch(body);
  }

  @Post('mcp/frontend/source-patches/proof')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpValidateFrontendSourcePatchProof(
    @Body(new ZodValidationPipe(frontendMcpValidateSourcePatchProofSchema)) body: FrontendMcpValidateSourcePatchProofInput,
  ) {
    return this.rules.validateFrontendSourcePatchProof(body);
  }

  @Get('mcp/algorithms/surfaces')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpAlgorithmSurfaces() {
    return this.rules.algorithmSurfaces();
  }

  @Get('mcp/algorithms/surfaces/:surfaceId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpAlgorithmContract(@Param('surfaceId') surfaceId: string) {
    return this.rules.algorithmSurfaceContract(surfaceId);
  }

  @Post('mcp/algorithms/draft')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpDraftAlgorithmChange(
    @Body(new ZodValidationPipe(algorithmMcpDraftChangeSchema)) body: AlgorithmMcpDraftChangeInput,
  ) {
    return this.rules.draftAlgorithmChangeFromMcp(body);
  }

  @Post('mcp/algorithms/validate')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpValidateAlgorithmChange(
    @Body(new ZodValidationPipe(algorithmMcpValidateChangeSchema)) body: AlgorithmMcpValidateChangeInput,
  ) {
    return this.rules.validateAlgorithmChangeFromMcp(body);
  }

  @Post('mcp/algorithms/simulate')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpSimulateAlgorithmChange(
    @Body(new ZodValidationPipe(algorithmMcpSimulateChangeSchema)) body: AlgorithmMcpSimulateChangeInput,
  ) {
    return this.rules.simulateAlgorithmChangeFromMcp(body);
  }

  @Post('mcp/algorithms/compare')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpCompareAlgorithmVersions(
    @Body(new ZodValidationPipe(algorithmMcpCompareVersionsSchema)) body: AlgorithmMcpCompareVersionsInput,
  ) {
    return this.rules.compareAlgorithmVersionsFromMcp(body);
  }

  @Post('mcp/algorithms/publish')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpPublishAlgorithmVersion(
    @Body(new ZodValidationPipe(algorithmMcpPublishVersionSchema)) body: AlgorithmMcpPublishVersionInput,
  ) {
    return this.rules.publishAlgorithmVersionFromMcp(body);
  }

  @Post('mcp/algorithms/rollback')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  mcpRollbackAlgorithmVersion(
    @Body(new ZodValidationPipe(algorithmMcpRollbackVersionSchema)) body: AlgorithmMcpRollbackVersionInput,
  ) {
    return this.rules.rollbackAlgorithmVersionFromMcp(body);
  }

  @Post('mcp/algorithms/explain-customer-ranking')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpExplainCustomerRanking(
    @Body(new ZodValidationPipe(algorithmMcpExplainCustomerRankingSchema)) body: AlgorithmMcpExplainCustomerRankingInput,
  ) {
    return this.rules.explainCustomerRankingFromMcp(body);
  }

  @Post('mcp/algorithms/explain-task-visibility')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpExplainTaskVisibility(
    @Body(new ZodValidationPipe(algorithmMcpExplainTaskVisibilitySchema)) body: AlgorithmMcpExplainTaskVisibilityInput,
  ) {
    return this.rules.explainTaskVisibilityFromMcp(body);
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
