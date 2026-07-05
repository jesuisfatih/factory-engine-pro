import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  accountCartCheckoutSchema,
  accountInvoiceListQuerySchema,
  accountOrderListQuerySchema,
  accountReorderSchema,
  type AccountCartCheckoutInput,
  type AccountInvoiceListQuery,
  type AccountOrderListQuery,
  type AccountReorderInput,
} from '@factory-engine-pro/contracts';
import { Public } from '../../shared/public.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { AccountsService } from './accounts.service.js';
import { ShopifyCustomerSessionGuard } from './shopify-customer-session.guard.js';

@Controller('customer-account')
@Public()
@UseGuards(ShopifyCustomerSessionGuard)
export class CustomerAccountController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('context')
  async context() {
    const [profile, orders, invoices, reorderTemplates, activeCart] = await Promise.all([
      this.accounts.profile(),
      this.accounts.orders({ limit: 3, status: 'all' }),
      this.accounts.invoices({ limit: 3, status: 'all' }),
      this.accounts.reorderTemplates(),
      this.accounts.activeCart(),
    ]);
    return {
      profile,
      orders: orders.data,
      invoices: invoices.data,
      reorderTemplates: reorderTemplates.slice(0, 5),
      activeCart,
      summary: {
        recentOrders: orders.meta.count,
        openInvoices: invoices.data.filter((invoice) => invoice.status !== 'paid').length,
        reorderReady: reorderTemplates.filter((template) => template.canReorder).length,
        hasActiveCart: Boolean(activeCart),
      },
    };
  }

  @Get('orders')
  orders(@Query(new ZodValidationPipe(accountOrderListQuerySchema)) query: AccountOrderListQuery) {
    return this.accounts.orders(query);
  }

  @Get('orders/:orderId')
  order(@Param('orderId') orderId: string) {
    return this.accounts.orderDetail(orderId);
  }

  @Post('orders/:orderId/reorder')
  reorderOrder(
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(accountReorderSchema)) body: AccountReorderInput,
  ) {
    return this.accounts.reorderOrder(orderId, body);
  }

  @Post('orders/:orderId/line-items/:lineItemId/reorder')
  reorderLineItem(
    @Param('orderId') orderId: string,
    @Param('lineItemId') lineItemId: string,
    @Body(new ZodValidationPipe(accountReorderSchema)) body: AccountReorderInput,
  ) {
    return this.accounts.reorderLineItem(orderId, lineItemId, body);
  }

  @Get('invoices')
  invoices(@Query(new ZodValidationPipe(accountInvoiceListQuerySchema)) query: AccountInvoiceListQuery) {
    return this.accounts.invoices(query);
  }

  @Get('invoices/:invoiceId')
  invoice(@Param('invoiceId') invoiceId: string) {
    return this.accounts.invoiceDetail(invoiceId);
  }

  @Get('invoices/:invoiceId/download')
  invoiceDownload(@Param('invoiceId') invoiceId: string) {
    return this.accounts.invoiceDownload(invoiceId);
  }

  @Post('invoices/:invoiceId/pay')
  invoicePay(@Param('invoiceId') invoiceId: string) {
    return this.accounts.invoicePay(invoiceId);
  }

  @Get('reorder-templates')
  reorderTemplates() {
    return this.accounts.reorderTemplates();
  }

  @Get('cart/active')
  activeCart() {
    return this.accounts.activeCart();
  }

  @Post('cart/:cartId/checkout')
  checkoutCart(
    @Param('cartId') cartId: string,
    @Body(new ZodValidationPipe(accountCartCheckoutSchema)) body: AccountCartCheckoutInput,
  ) {
    return this.accounts.checkoutCart(cartId, body);
  }
}
