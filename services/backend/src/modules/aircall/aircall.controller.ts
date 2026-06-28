import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  aircallBackfillRecentSchema,
  aircallLinkUserSchema,
  aircallResolverReprocessSchema,
  MEMBER_PERMISSIONS,
  type AircallBackfillRecentInput,
  type AircallLinkUserInput,
  type AircallResolverReprocessInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { AircallService } from './aircall.service.js';

@Controller('aircall')
export class AircallController {
  constructor(private readonly aircall: AircallService) {}

  @Get('users')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersRead)
  users() {
    return this.aircall.listUsers();
  }

  @Post('users/sync')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  syncUsers() {
    return this.aircall.syncUsers();
  }

  @Get('numbers')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersRead)
  numbers() {
    return this.aircall.listNumbers();
  }

  @Post('numbers/sync')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  syncNumbers() {
    return this.aircall.syncNumbers();
  }

  @Get('webhooks/status')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersRead)
  webhookStatus() {
    return this.aircall.webhookStatus();
  }

  @Get('connection-test')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersRead)
  connectionTest() {
    return this.aircall.testConnection();
  }

  @Get('sync-logs')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersRead)
  syncLogs() {
    return this.aircall.syncLogs();
  }

  @Get('calls')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersRead)
  calls() {
    return this.aircall.callEvents();
  }

  @Post('calls/backfill-recent')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  backfillRecentCalls(
    @Body(new ZodValidationPipe(aircallBackfillRecentSchema)) body: AircallBackfillRecentInput,
  ) {
    return this.aircall.backfillRecentCalls(body);
  }

  @Post('calls/resolver/reprocess')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  reprocessResolver(
    @Body(new ZodValidationPipe(aircallResolverReprocessSchema)) body: AircallResolverReprocessInput,
  ) {
    return this.aircall.reprocessResolver(body);
  }

  @Post('reprocess-resolved')
  @RequirePermission(MEMBER_PERMISSIONS.syncTrigger)
  reprocessResolvedAlias(
    @Body(new ZodValidationPipe(aircallResolverReprocessSchema)) body: AircallResolverReprocessInput,
  ) {
    return this.aircall.reprocessResolver(body);
  }

  @Post('users/:aircallUserId/link')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  linkUser(
    @Param('aircallUserId') aircallUserId: string,
    @Body(new ZodValidationPipe(aircallLinkUserSchema)) body: AircallLinkUserInput,
  ) {
    return this.aircall.linkUser(aircallUserId, body.memberId);
  }

  @Delete('users/:aircallUserId/link')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  unlinkUser(@Param('aircallUserId') aircallUserId: string) {
    return this.aircall.unlinkUser(aircallUserId);
  }
}
