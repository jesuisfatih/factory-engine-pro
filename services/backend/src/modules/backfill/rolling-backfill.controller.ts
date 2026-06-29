import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  rollingBackfillTriggerSchema,
  type RollingBackfillTriggerInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { RollingBackfillService } from './rolling-backfill.service.js';

@Controller('backfill')
export class RollingBackfillController {
  constructor(private readonly backfill: RollingBackfillService) {}

  @Get('rolling-7d/status')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  status() {
    return this.backfill.status();
  }

  @Post('rolling-7d')
  @RequirePermission(
    MEMBER_PERMISSIONS.syncTrigger,
    MEMBER_PERMISSIONS.segmentsWrite,
    MEMBER_PERMISSIONS.customersWrite,
    MEMBER_PERMISSIONS.membersRead,
    MEMBER_PERMISSIONS.aircallUsersWrite,
  )
  trigger(
    @Body(new ZodValidationPipe(rollingBackfillTriggerSchema)) body: RollingBackfillTriggerInput,
  ) {
    return this.backfill.trigger(body, 'manual');
  }
}
