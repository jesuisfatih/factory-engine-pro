import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { SegmentEvaluationWorker } from './segment-evaluation.worker.js';
import { SegmentsController } from './segments.controller.js';
import { SegmentsRepository } from './segments.repository.js';
import { SegmentsService } from './segments.service.js';

@Module({
  imports: [SharedModule, RulesModule],
  controllers: [SegmentsController],
  providers: [SegmentsRepository, SegmentsService, SegmentEvaluationWorker],
  exports: [SegmentsService],
})
export class SegmentsModule {}
