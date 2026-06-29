import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  reviewCommissionRequestSchema,
  submitCommissionRequestSchema,
  upsertCommissionProfileSchema,
  type ReviewCommissionRequestInput,
  type SubmitCommissionRequestInput,
  type UpsertCommissionProfileInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { CommissionsService } from './commissions.service.js';

@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get('profiles')
  @RequirePermission(MEMBER_PERMISSIONS.membersRead)
  profiles() {
    return this.commissions.listProfiles();
  }

  @Get('requests')
  @RequirePermission(MEMBER_PERMISSIONS.membersRead)
  requests() {
    return this.commissions.listRequests('all');
  }

  @Get('requests/mine')
  @RequirePermission(MEMBER_PERMISSIONS.commissionSubmit)
  myRequests() {
    return this.commissions.listRequests('mine');
  }

  @Post('requests')
  @RequirePermission(MEMBER_PERMISSIONS.commissionSubmit)
  submitRequest(@Body(new ZodValidationPipe(submitCommissionRequestSchema)) body: SubmitCommissionRequestInput) {
    return this.commissions.submitRequest(body);
  }

  @Post('requests/:id/review')
  @RequirePermission(MEMBER_PERMISSIONS.membersWrite)
  reviewRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewCommissionRequestSchema)) body: ReviewCommissionRequestInput,
  ) {
    return this.commissions.reviewRequest(id, body);
  }

  @Put('profiles/:id')
  @RequirePermission(MEMBER_PERMISSIONS.membersWrite)
  upsertProfile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertCommissionProfileSchema)) body: UpsertCommissionProfileInput,
  ) {
    return this.commissions.upsertProfile(id, body);
  }

  @Delete('profiles/:id')
  @RequirePermission(MEMBER_PERMISSIONS.membersWrite)
  deleteProfile(@Param('id') id: string) {
    return this.commissions.deleteProfile(id);
  }
}
