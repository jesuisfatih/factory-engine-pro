import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { CallCenterController } from './call-center.controller.js';
import { CallCenterService } from './call-center.service.js';

@Module({
  imports: [SharedModule],
  controllers: [CallCenterController],
  providers: [CallCenterService],
})
export class CallCenterModule {}
