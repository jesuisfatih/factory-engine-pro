import { Controller, Get, Headers, HttpCode, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { Public } from '../../shared/public.decorator.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  summary() { return this.billing.summary(); }

  @Post('checkout')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  checkout() { return this.billing.createCheckoutSession(); }

  @Post('portal')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  portal() { return this.billing.createPortalSession(); }

  @Post('sync')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  sync() { return this.billing.syncSubscription(); }
}

@Controller('webhooks/stripe')
export class StripeBillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Post(':tenantSlug')
  @HttpCode(200)
  receive(
    @Param('tenantSlug') tenantSlug: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    return this.billing.receiveWebhook(tenantSlug, rawBody, signature);
  }
}
