import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  calculatePricesSchema,
  createPricingRuleSchema,
  MEMBER_PERMISSIONS,
  pricingRulesQuerySchema,
  togglePricingRuleSchema,
  updatePricingRuleSchema,
  type CalculatePricesInput,
  type CreatePricingRuleInput,
  type PricingRulesQuery,
  type TogglePricingRuleInput,
  type UpdatePricingRuleInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { PricingService } from './pricing.service.js';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('calculate')
  @RequirePermission(MEMBER_PERMISSIONS.pricingRead)
  calculate(@Body(new ZodValidationPipe(calculatePricesSchema)) body: CalculatePricesInput) {
    return this.pricing.calculate(body);
  }

  @Get('rules')
  @RequirePermission(MEMBER_PERMISSIONS.pricingRead)
  listRules(@Query(new ZodValidationPipe(pricingRulesQuerySchema)) query: PricingRulesQuery) {
    return this.pricing.listRules(query);
  }

  @Get('shopify-discounts')
  @RequirePermission(MEMBER_PERMISSIONS.pricingRead)
  shopifyDiscounts() {
    return this.pricing.listShopifyDiscounts();
  }

  @Get('rules/:id')
  @RequirePermission(MEMBER_PERMISSIONS.pricingRead)
  getRule(@Param('id') id: string) {
    return this.pricing.getRule(id);
  }

  @Post('rules')
  @RequirePermission(MEMBER_PERMISSIONS.pricingWrite)
  createRule(@Body(new ZodValidationPipe(createPricingRuleSchema)) body: CreatePricingRuleInput) {
    return this.pricing.createRule(body);
  }

  @Put('rules/:id')
  @RequirePermission(MEMBER_PERMISSIONS.pricingWrite)
  updateRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePricingRuleSchema)) body: UpdatePricingRuleInput,
  ) {
    return this.pricing.updateRule(id, body);
  }

  @Delete('rules/:id')
  @RequirePermission(MEMBER_PERMISSIONS.pricingWrite)
  deleteRule(@Param('id') id: string) {
    return this.pricing.deleteRule(id);
  }

  @Put('rules/:id/toggle')
  @RequirePermission(MEMBER_PERMISSIONS.pricingWrite)
  toggleRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(togglePricingRuleSchema)) body: TogglePricingRuleInput,
  ) {
    return this.pricing.toggleRule(id, body);
  }

  @Post('rules/:id/resync')
  @RequirePermission(MEMBER_PERMISSIONS.pricingWrite)
  resyncRule(@Param('id') id: string) {
    return this.pricing.resyncRule(id);
  }
}
