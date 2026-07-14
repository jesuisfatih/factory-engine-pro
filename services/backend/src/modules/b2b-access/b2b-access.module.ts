import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { B2BAccessController } from './b2b-access.controller.js';
import { B2BAccessRepository } from './b2b-access.repository.js';
import { B2BAccessService } from './b2b-access.service.js';
import { TaxExemptionLifecycleService } from './tax-exemption-lifecycle.service.js';
import { TaxExemptionLifecycleWorker } from './tax-exemption-lifecycle.worker.js';

@Module({
  imports: [SharedModule, MailModule, SyncModule],
  controllers: [B2BAccessController],
  providers: [B2BAccessRepository, B2BAccessService, TaxExemptionLifecycleService, TaxExemptionLifecycleWorker],
  exports: [B2BAccessService, TaxExemptionLifecycleService],
})
export class B2BAccessModule {}
