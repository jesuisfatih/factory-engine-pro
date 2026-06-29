import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { CommissionsController } from './commissions.controller.js';
import { CommissionsService } from './commissions.service.js';

@Module({
  imports: [SharedModule],
  controllers: [CommissionsController],
  providers: [CommissionsService],
})
export class CommissionsModule {}
