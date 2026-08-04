import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  shopifyAbandonedCheckoutContextInputSchema,
  type ShopifyAbandonedCheckoutContextInput,
} from '@factory-engine-pro/contracts';
import type { Request } from 'express';
import { Public } from '../../shared/public.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { ShopifyAdminContextService } from './shopify-admin-context.service.js';

@Public()
@Controller('shopify-admin')
export class ShopifyAdminContextController {
  constructor(private readonly context: ShopifyAdminContextService) {}

  @Post('abandoned-checkout/context')
  abandonedCheckout(
    @Req() request: Request,
    @Body(new ZodValidationPipe(shopifyAbandonedCheckoutContextInputSchema)) body: ShopifyAbandonedCheckoutContextInput,
  ) {
    return this.context.abandonedCheckout(request, body);
  }
}
