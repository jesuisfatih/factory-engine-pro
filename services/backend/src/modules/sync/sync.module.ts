import { Module } from '@nestjs/common';
import { ShopifyClientService } from './shopify-client.service.js';
import { ShopifySyncStateService } from './shopify-sync-state.service.js';
import { ShopifySyncWorker } from './shopify-sync.worker.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  controllers: [SyncController],
  providers: [ShopifyClientService, ShopifySyncStateService, SyncService, ShopifySyncWorker],
  exports: [ShopifyClientService, ShopifySyncStateService, SyncService],
})
export class SyncModule {}
