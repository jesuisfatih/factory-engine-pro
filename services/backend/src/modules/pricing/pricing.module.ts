import { Module } from '@nestjs/common';
import { PricingCalculatorService } from './pricing-calculator.service.js';
import { PricingController } from './pricing.controller.js';
import { PricingRepository } from './pricing.repository.js';
import { PricingService } from './pricing.service.js';
import { PricingSyncWorker } from './pricing-sync.worker.js';

@Module({
  controllers: [PricingController],
  providers: [PricingRepository, PricingCalculatorService, PricingService, PricingSyncWorker],
  exports: [PricingRepository, PricingCalculatorService, PricingService],
})
export class PricingModule {}
