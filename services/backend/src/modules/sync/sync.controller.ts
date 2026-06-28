import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  shopifyInitialSyncSchema,
  type ShopifyInitialSyncInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { SyncService } from './sync.service.js';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('status')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  status() {
    return this.sync.status();
  }

  @Get('connection-test')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  connectionTest() {
    return this.sync.testConnection();
  }

  @Post('initial')
  @RequirePermission(MEMBER_PERMISSIONS.syncTrigger)
  initial(@Body(new ZodValidationPipe(shopifyInitialSyncSchema)) body: ShopifyInitialSyncInput) {
    return this.sync.triggerInitialSync(body);
  }
}
