import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createDirectOrderSchema,
  accountInvoiceQuerySchema,
  MEMBER_PERMISSIONS,
  orderListQuerySchema,
  recordAccountInvoicePaymentSchema,
  resolveReorderSchema,
  saveAccountInvoiceSchema,
  transferOrderToMemberSchema,
  updateAccountInvoiceFileSchema,
  updateAccountInvoiceStatusSchema,
  type AccountInvoiceQuery,
  type CreateDirectOrderInput,
  type OrderListQuery,
  type RecordAccountInvoicePaymentInput,
  type ResolveReorderInput,
  type SaveAccountInvoiceInput,
  type TransferOrderToMemberInput,
  type UpdateAccountInvoiceFileInput,
  type UpdateAccountInvoiceStatusInput,
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

  @Get('invoices')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  invoices(@Query(new ZodValidationPipe(accountInvoiceQuerySchema)) query: AccountInvoiceQuery) {
    return this.orders.invoices(query);
  }

  @Post('invoices')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  createInvoice(@Body(new ZodValidationPipe(saveAccountInvoiceSchema)) body: SaveAccountInvoiceInput) {
    return this.orders.createInvoice(body);
  }

  @Post('invoices/mark-overdue')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  markOverdueInvoices() {
    return this.orders.markOverdueInvoices();
  }

  @Get('invoices/:invoiceId')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  invoice(@Param('invoiceId') invoiceId: string) {
    return this.orders.invoice(invoiceId);
  }

  @Post('invoices/:invoiceId/status')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  updateInvoiceStatus(
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodValidationPipe(updateAccountInvoiceStatusSchema)) body: UpdateAccountInvoiceStatusInput,
  ) {
    return this.orders.updateInvoiceStatus(invoiceId, body);
  }

  @Post('invoices/:invoiceId/file')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  updateInvoiceFile(
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodValidationPipe(updateAccountInvoiceFileSchema)) body: UpdateAccountInvoiceFileInput,
  ) {
    return this.orders.updateInvoiceFile(invoiceId, body);
  }

  @Post('invoices/:invoiceId/record-payment')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  recordInvoicePayment(
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodValidationPipe(recordAccountInvoicePaymentSchema)) body: RecordAccountInvoicePaymentInput,
  ) {
    return this.orders.recordInvoicePayment(invoiceId, body);
  }

  @Post('invoices/:invoiceId/duplicate')
  @RequirePermission(MEMBER_PERMISSIONS.ordersWrite)
  duplicateInvoice(@Param('invoiceId') invoiceId: string) {
    return this.orders.duplicateInvoice(invoiceId);
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

  @Get(':id/invoices')
  @RequirePermission(MEMBER_PERMISSIONS.ordersRead)
  orderInvoices(@Param('id') id: string) {
    return this.orders.orderInvoices(id);
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
