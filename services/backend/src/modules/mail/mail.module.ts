import { Module, forwardRef } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module.js';
import { EmailTemplatesController } from './email-templates.controller.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { MailController } from './mail.controller.js';
import { MailMarketingCampaignWorker } from './mail-marketing-campaign.worker.js';
import { MailMarketingController } from './mail-marketing.controller.js';
import { MailMarketingFlowWorker } from './mail-marketing-flow.worker.js';
import { MailMarketingRepository } from './mail-marketing.repository.js';
import { MailMarketingService } from './mail-marketing.service.js';
import { MailOutboundWorker } from './mail-outbound.worker.js';
import { MailRepository } from './mail.repository.js';
import { MailService } from './mail.service.js';
import { MailWebhookController } from './mail-webhook.controller.js';

@Module({
  imports: [forwardRef(() => RulesModule)],
  controllers: [MailController, EmailTemplatesController, MailMarketingController, MailWebhookController],
  providers: [
    EmailTemplatesRepository,
    EmailTemplatesService,
    MailMarketingRepository,
    MailMarketingService,
    MailRepository,
    MailService,
    MailMarketingCampaignWorker,
    MailMarketingFlowWorker,
    MailOutboundWorker,
  ],
  exports: [EmailTemplatesService, MailMarketingService, MailService],
})
export class MailModule {}
