import { Controller, Get } from '@nestjs/common';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { AiService } from './ai.service.js';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  health() {
    return this.ai.health();
  }
}
