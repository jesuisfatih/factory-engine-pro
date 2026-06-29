import { Module } from '@nestjs/common';
import { AircallModule } from '../aircall/aircall.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SupportModule } from '../support/support.module.js';
import { PersonWorkspaceController } from './person-workspace.controller.js';
import { PersonWorkspaceService } from './person-workspace.service.js';
import { UrgencyScoringService } from './urgency-scoring.service.js';

@Module({
  imports: [CustomersModule, SupportModule, AircallModule, MailModule],
  controllers: [PersonWorkspaceController],
  providers: [PersonWorkspaceService, UrgencyScoringService],
})
export class PersonWorkspaceModule {}
