import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { BillingAccessGuard } from './billing-access.guard.js';
import { BillingController, StripeBillingWebhookController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

@Module({
  imports: [SharedModule],
  controllers: [BillingController, StripeBillingWebhookController],
  providers: [BillingService, BillingAccessGuard],
  exports: [BillingService, BillingAccessGuard],
})
export class BillingModule {}
