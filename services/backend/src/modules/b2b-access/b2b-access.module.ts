import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { MailModule } from '../mail/mail.module.js';
import { B2BAccessController } from './b2b-access.controller.js';
import { B2BAccessRepository } from './b2b-access.repository.js';
import { B2BAccessService } from './b2b-access.service.js';

@Module({
  imports: [SharedModule, MailModule],
  controllers: [B2BAccessController],
  providers: [B2BAccessRepository, B2BAccessService],
})
export class B2BAccessModule {}
