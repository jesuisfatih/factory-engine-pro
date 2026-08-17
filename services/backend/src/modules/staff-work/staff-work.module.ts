import { Module } from '@nestjs/common';
import { StaffWorkRepository } from './staff-work.repository.js';
import { StaffWorkService } from './staff-work.service.js';
import { TranscriptReviewService } from './transcript-review.service.js';

@Module({
  providers: [StaffWorkRepository, StaffWorkService, TranscriptReviewService],
  exports: [StaffWorkService, TranscriptReviewService],
})
export class StaffWorkModule {}
