import { Module } from '@nestjs/common';
import { PersonWorkspaceController } from './person-workspace.controller.js';
import { PersonWorkspaceService } from './person-workspace.service.js';
import { UrgencyScoringService } from './urgency-scoring.service.js';

@Module({
  controllers: [PersonWorkspaceController],
  providers: [PersonWorkspaceService, UrgencyScoringService],
})
export class PersonWorkspaceModule {}
