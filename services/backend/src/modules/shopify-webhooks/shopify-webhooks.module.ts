import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { ShopifyWebhookController } from './shopify-webhook.controller.js';
import { ShopifyWebhookIngestService } from './shopify-webhook-ingest.service.js';

@Module({
  imports: [SyncModule, MailModule],
  controllers: [ShopifyWebhookController],
  providers: [ShopifyWebhookIngestService],
})
export class ShopifyWebhooksModule {}
