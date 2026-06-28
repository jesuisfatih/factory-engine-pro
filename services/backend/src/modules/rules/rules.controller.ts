import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  backfillWorkflowRuleSchema,
  fireWorkflowTriggerSchema,
  MEMBER_PERMISSIONS,
  rollbackWorkflowRuleSchema,
  saveWorkflowRuleSchema,
  type BackfillWorkflowRuleInput,
  type RollbackWorkflowRuleInput,
  type SaveWorkflowRuleInput,
  type WorkflowTriggerFireInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { RulesService } from './rules.service.js';

@Controller('rules')
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
