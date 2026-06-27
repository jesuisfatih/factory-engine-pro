import { Module } from '@nestjs/common';
import { MailController } from './mail.controller.js';
import { MailOutboundWorker } from './mail-outbound.worker.js';
import { MailRepository } from './mail.repository.js';
import { MailService } from './mail.service.js';

@Module({
  controllers: [MailController],
  providers: [MailRepository, MailService, MailOutboundWorker],
  exports: [MailService],
})
export class MailModule {}
