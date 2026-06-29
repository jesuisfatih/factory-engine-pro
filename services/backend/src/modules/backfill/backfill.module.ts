import { Module } from '@nestjs/common';
import { AircallModule } from '../aircall/aircall.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { SegmentsModule } from '../segments/segments.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { RollingBackfillController } from './rolling-backfill.controller.js';
import { RollingBackfillService } from './rolling-backfill.service.js';
import { RollingBackfillWorker } from './rolling-backfill.worker.js';

@Module({
  imports: [SyncModule, SegmentsModule, AircallModule, CustomersModule],
  controllers: [RollingBackfillController],
  providers: [RollingBackfillService, RollingBackfillWorker],
})
export class BackfillModule {}
