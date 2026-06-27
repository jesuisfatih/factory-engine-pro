import { Module } from '@nestjs/common';
import { AircallController } from './aircall.controller.js';
import { AircallIngestService } from './aircall-ingest.service.js';
import { AircallIngestWorker } from './aircall-ingest.worker.js';
import { AircallRepository } from './aircall.repository.js';
import { AircallService } from './aircall.service.js';
import { AircallWebhookController } from './aircall-webhook.controller.js';

@Module({
  controllers: [AircallController, AircallWebhookController],
  providers: [AircallRepository, AircallService, AircallIngestService, AircallIngestWorker],
  exports: [AircallService, AircallIngestService],
})
export class AircallModule {}
