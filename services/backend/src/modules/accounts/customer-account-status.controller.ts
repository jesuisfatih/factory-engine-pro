import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../shared/public.decorator.js';
import { ShopifyCustomerSessionService } from './shopify-customer-session.service.js';

@Controller('customer-account')
@Public()
export class CustomerAccountStatusController {
  constructor(private readonly sessions: ShopifyCustomerSessionService) {}

  @Get('link-status')
  async linkStatus(@Req() request: Request) {
    const session = await this.sessions.inspect(request);
    const hasPortalAccount = Boolean(session.customerUser);
    return {
      shopDomain: session.shopDomain,
      shopifyCustomerId: session.shopifyCustomerId,
      hasPortalAccount,
      status: hasPortalAccount
        ? 'portal_ready'
        : session.customer
          ? 'portal_account_required'
          : 'customer_sync_required',
      customer: session.customer ? {
        id: session.customer.id,
        email: session.customer.email,
        companyName: session.customer.companyName,
        firstName: session.customer.firstName,
        lastName: session.customer.lastName,
        phone: session.customer.phone,
        status: session.customer.status,
      } : null,
      customerUser: session.customerUser ? {
        id: session.customerUser.id,
        email: session.customerUser.email,
        status: session.customerUser.status,
      } : null,
      b2bAccessRequest: session.b2bAccessRequest ? {
        id: session.b2bAccessRequest.id,
        status: session.b2bAccessRequest.status,
        submittedAt: session.b2bAccessRequest.submittedAt.toISOString(),
        reviewedAt: session.b2bAccessRequest.reviewedAt?.toISOString() ?? null,
      } : null,
      message: hasPortalAccount
        ? 'This Shopify customer is linked to an active customer portal account.'
        : 'This Shopify customer is not linked to an active customer portal account yet.',
    };
  }
}
