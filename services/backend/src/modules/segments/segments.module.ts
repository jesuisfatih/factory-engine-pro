import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { SegmentsController } from './segments.controller.js';
import { SegmentsRepository } from './segments.repository.js';
import { SegmentsService } from './segments.service.js';

@Module({
  imports: [SharedModule],
  controllers: [SegmentsController],
  providers: [SegmentsRepository, SegmentsService],
  exports: [SegmentsService],
})
export class SegmentsModule {}
