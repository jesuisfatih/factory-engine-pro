import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../shared/public.decorator.js';
import { BillingService } from './billing.service.js';

@Injectable()
export class BillingAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly billing: BillingService) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (isBillingExemptPath(request.originalUrl || request.url)) return true;
    const decision = await this.billing.accessDecision();
    if (decision.allowed) return true;
    throw new HttpException({
      message: 'Workspace subscription payment is required.',
      code: 'subscription_payment_required',
      details: { billingPath: '/settings/billing', gracePeriodDays: 7 },
    }, 402);
  }
}

function isBillingExemptPath(path: string) {
  return ['/api/v1/billing', '/api/v1/auth', '/api/v1/health', '/api/v1/webhooks/stripe'].some((prefix) => path.startsWith(prefix));
}
