import { Module } from '@nestjs/common';
import { EmailTemplatesController } from './email-templates.controller.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { MailController } from './mail.controller.js';
import { MailMarketingController } from './mail-marketing.controller.js';
import { MailMarketingRepository } from './mail-marketing.repository.js';
import { MailMarketingService } from './mail-marketing.service.js';
import { MailOutboundWorker } from './mail-outbound.worker.js';
import { MailRepository } from './mail.repository.js';
import { MailService } from './mail.service.js';

@Module({
  controllers: [MailController, EmailTemplatesController, MailMarketingController],
  providers: [
    EmailTemplatesRepository,
    EmailTemplatesService,
    MailMarketingRepository,
    MailMarketingService,
    MailRepository,
    MailService,
    MailOutboundWorker,
  ],
  exports: [EmailTemplatesService, MailMarketingService, MailService],
})
export class MailModule {}
