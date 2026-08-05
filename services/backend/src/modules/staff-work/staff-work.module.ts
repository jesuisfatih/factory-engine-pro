import { Module } from '@nestjs/common';
import { StaffWorkRepository } from './staff-work.repository.js';
import { StaffWorkService } from './staff-work.service.js';

@Module({
  providers: [StaffWorkRepository, StaffWorkService],
  exports: [StaffWorkService],
})
export class StaffWorkModule {}
