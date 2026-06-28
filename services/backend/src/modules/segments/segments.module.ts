import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { ShopifyClientService } from '../sync/shopify-client.service.js';
import { SegmentEvaluationWorker } from './segment-evaluation.worker.js';
import { SegmentsController } from './segments.controller.js';
import { SegmentsRepository } from './segments.repository.js';
import { SegmentsService } from './segments.service.js';
import { ShopifyCustomerSegmentsController } from './shopify-customer-segments.controller.js';
import { ShopifyCustomerSegmentsService } from './shopify-customer-segments.service.js';

@Module({
  imports: [SharedModule, RulesModule],
  controllers: [SegmentsController, ShopifyCustomerSegmentsController],
  providers: [SegmentsRepository, SegmentsService, SegmentEvaluationWorker, ShopifyClientService, ShopifyCustomerSegmentsService],
  exports: [SegmentsService],
})
export class SegmentsModule {}
