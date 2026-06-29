import { Module } from '@nestjs/common';
import { AircallModule } from '../aircall/aircall.module.js';
import { SharedModule } from '../../shared/shared.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { CallCenterController } from './call-center.controller.js';
import { CallCenterService } from './call-center.service.js';

@Module({
  imports: [SharedModule, CustomersModule, AircallModule],
  controllers: [CallCenterController],
  providers: [CallCenterService],
})
export class CallCenterModule {}
