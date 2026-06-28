import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module.js';
import { AircallController } from './aircall.controller.js';
import { AircallIngestService } from './aircall-ingest.service.js';
import { AircallIngestWorker } from './aircall-ingest.worker.js';
import { AircallRepository } from './aircall.repository.js';
import { AircallService } from './aircall.service.js';
import { AircallWebhookController } from './aircall-webhook.controller.js';

@Module({
  imports: [RulesModule],
  controllers: [AircallController, AircallWebhookController],
  providers: [AircallRepository, AircallService, AircallIngestService, AircallIngestWorker],
  exports: [AircallService, AircallIngestService],
})
export class AircallModule {}
