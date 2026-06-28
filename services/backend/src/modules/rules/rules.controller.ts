import { Controller, Get } from '@nestjs/common';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { RulesService } from './rules.service.js';

@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

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
}
