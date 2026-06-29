import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createDirectOrderSchema,
  MEMBER_PERMISSIONS,
  orderListQuerySchema,
  resolveReorderSchema,
  transferOrderToMemberSchema,
  type CreateDirectOrderInput,
  type OrderListQuery,
  type ResolveReorderInput,
  type TransferOrderToMemberInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  createDirectOrder(@Body(new ZodValidationPipe(createDirectOrderSchema)) body: CreateDirectOrderInput) {
    return this.orders.createDirectOrder(body);
  }

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  list(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(query);
  }

  @Get('stats')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  stats(@Query(new ZodValidationPipe(orderListQuerySchema.partial())) query: Partial<OrderListQuery>) {
    return this.orders.stats(query);
  }

  @Get('journey-funnel')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  journeyFunnel() {
    return this.orders.journeyFunnel();
  }

  @Get('journey/:shopifyCustomerId')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  customerJourney(@Param('shopifyCustomerId') shopifyCustomerId: string) {
    return this.orders.customerJourney(shopifyCustomerId);
  }

  @Get(':id/detail')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  detail(@Param('id') id: string) {
    return this.orders.detail(id);
  }

  @Post(':id/transfer')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  transferToMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transferOrderToMemberSchema)) body: TransferOrderToMemberInput,
  ) {
    return this.orders.transferToMember(id, body);
  }

  @Post('reorder/resolve')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  resolveReorder(@Body(new ZodValidationPipe(resolveReorderSchema)) body: ResolveReorderInput) {
    return this.orders.resolveReorder(body);
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }
}
