import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller.js';
import { StorefrontService } from './storefront.service.js';

@Module({
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
