import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { AccountsCheckoutService } from './accounts-checkout.service.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { CustomerAccountStatusController } from './customer-account-status.controller.js';
import { CustomerAccountController } from './customer-account.controller.js';
import { ShopifyCustomerSessionGuard } from './shopify-customer-session.guard.js';
import { ShopifyCustomerSessionService } from './shopify-customer-session.service.js';

@Module({
  imports: [SyncModule, RulesModule],
  controllers: [AccountsController, CustomerAccountController, CustomerAccountStatusController],
  providers: [AccountsCheckoutService, AccountsService, ShopifyCustomerSessionGuard, ShopifyCustomerSessionService],
})
export class AccountsModule {}
