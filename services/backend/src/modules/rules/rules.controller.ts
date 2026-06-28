import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  fireWorkflowTriggerSchema,
  MEMBER_PERMISSIONS,
  saveWorkflowRuleSchema,
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
