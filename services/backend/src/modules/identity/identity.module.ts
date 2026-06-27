import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { IdentityController } from './identity.controller.js';
import { IdentityRepository } from './identity.repository.js';
import { IdentityService } from './identity.service.js';

@Module({
  imports: [MailModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, IdentityService],
  exports: [IdentityRepository, IdentityService],
})
export class IdentityModule {}
