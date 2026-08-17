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

  @Get('reorder')
  async reorder(@Query() query: StorefrontQuery, @Res() response: Response) {
    const html = await this.storefront.reorderCartPage(query);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'self'");
    return response.status(200).send(html);
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
  cart?: string;
  token?: string;
  signature?: string;
  timestamp?: string;
  path_prefix?: string;
  logged_in_customer_id?: string;
}

export interface StorefrontLinkCustomerBody {
  email?: string;
  customer_email?: string;
  customerEmail?: string;
  shopifyCustomerId?: string;
  shopify_customer_id?: string;
}
