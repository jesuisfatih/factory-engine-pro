import { Module } from '@nestjs/common';
import { AircallController } from './aircall.controller.js';
import { AircallService } from './aircall.service.js';

@Module({
  controllers: [AircallController],
  providers: [AircallService],
  exports: [AircallService],
})
export class AircallModule {}
