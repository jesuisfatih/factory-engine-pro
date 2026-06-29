import { Controller, Get } from '@nestjs/common';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { CallCenterService } from './call-center.service.js';

@Controller('call-center')
export class CallCenterController {
  constructor(private readonly callCenter: CallCenterService) {}

  @Get('overview')
  @RequirePermission(MEMBER_PERMISSIONS.membersRead, MEMBER_PERMISSIONS.taskAssign)
  overview() {
    return this.callCenter.overview();
  }
}
