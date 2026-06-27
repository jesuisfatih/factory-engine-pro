import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { SupportController } from './support.controller.js';
import { SupportRepository } from './support.repository.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [SharedModule],
  controllers: [SupportController],
  providers: [SupportRepository, SupportService],
})
export class SupportModule {}
