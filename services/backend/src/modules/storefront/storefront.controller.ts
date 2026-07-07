import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../shared/public.decorator.js';
import { StorefrontService } from './storefront.service.js';

@Public()
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('handoff')
  async handoff(@Query() query: StorefrontQuery, @Res() response: Response) {
    const target = await this.storefront.handoffUrl(query);
    return response.redirect(302, target);
  }

  @Get('features/b2b-context')
  b2bContext(@Query() query: StorefrontQuery) {
    return this.storefront.b2bContext(query);
  }

  @Get('session')
  session(@Query() query: StorefrontQuery) {
    return this.storefront.session(query);
  }

  @Get('dashboard')
  dashboard(@Query() query: StorefrontQuery) {
    return this.storefront.dashboard(query);
  }

  @Post('link-customer')
  linkCustomer(@Query() query: StorefrontQuery, @Body() body: StorefrontLinkCustomerBody) {
    return this.storefront.linkCustomer(query, body);
  }
}

export interface StorefrontQuery {
  shop?: string;
  email?: string;
  customer_email?: string;
  customerEmail?: string;
  shopify_customer_id?: string;
  shopifyCustomerId?: string;
  return_to?: string;
  returnTo?: string;
}

export interface StorefrontLinkCustomerBody {
  email?: string;
  customer_email?: string;
  customerEmail?: string;
  shopifyCustomerId?: string;
  shopify_customer_id?: string;
}
