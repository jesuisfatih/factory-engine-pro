import { Module } from '@nestjs/common';
import { SegmentsModule } from '../segments/segments.module.js';
import { ShopifyClientService } from './shopify-client.service.js';
import { ShopifySyncStateService } from './shopify-sync-state.service.js';
import { ShopifySyncWorker } from './shopify-sync.worker.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { ShopifyAbandonedCheckoutService } from './shopify-abandoned-checkout.service.js';
import { ShopifyAbandonedCheckoutWorker } from './shopify-abandoned-checkout.worker.js';

@Module({
  imports: [SegmentsModule],
  controllers: [SyncController],
  providers: [ShopifyClientService, ShopifySyncStateService, SyncService, ShopifySyncWorker, ShopifyAbandonedCheckoutService, ShopifyAbandonedCheckoutWorker],
  exports: [ShopifyClientService, ShopifySyncStateService, SyncService, ShopifyAbandonedCheckoutService],
})
export class SyncModule {}
