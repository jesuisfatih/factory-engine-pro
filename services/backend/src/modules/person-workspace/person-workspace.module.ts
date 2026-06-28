import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { PersonWorkspaceController } from './person-workspace.controller.js';
import { PersonWorkspaceService } from './person-workspace.service.js';
import { UrgencyScoringService } from './urgency-scoring.service.js';

@Module({
  imports: [CustomersModule],
  controllers: [PersonWorkspaceController],
  providers: [PersonWorkspaceService, UrgencyScoringService],
})
export class PersonWorkspaceModule {}
