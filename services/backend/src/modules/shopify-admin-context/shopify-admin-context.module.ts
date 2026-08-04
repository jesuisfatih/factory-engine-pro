import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ShopifyAdminContextController } from './shopify-admin-context.controller.js';
import { ShopifyAdminContextService } from './shopify-admin-context.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [ShopifyAdminContextController],
  providers: [ShopifyAdminContextService],
})
export class ShopifyAdminContextModule {}
