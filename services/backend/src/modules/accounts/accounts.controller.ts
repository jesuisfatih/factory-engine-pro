import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  accountAddressSchema,
  accountAddressTypeSchema,
  accountCartAddItemSchema,
  accountCartCheckoutSchema,
  accountCartCreateSchema,
  accountCartUpdateItemSchema,
  accountDocumentListQuerySchema,
  accountInvoiceListQuerySchema,
  accountOrderListQuerySchema,
  accountReorderSchema,
  accountSupportCloseSchema,
  accountSupportReopenSchema,
  accountSupportReplySchema,
  accountTaxExemptionRenewalSchema,
  createAccountSupportTicketSchema,
  CUSTOMER_PERMISSIONS,
  updateAccountPasswordSchema,
  updateAccountProfileSchema,
  type AccountAddressInput,
  type AccountAddressType,
  type AccountCartAddItemInput,
  type AccountCartCheckoutInput,
  type AccountCartCreateInput,
  type AccountCartUpdateItemInput,
  type AccountDocumentListQuery,
  type AccountInvoiceListQuery,
  type AccountOrderListQuery,
  type AccountReorderInput,
  type AccountSupportCloseInput,
  type AccountSupportReopenInput,
  type AccountSupportReplyInput,
  type AccountTaxExemptionRenewalInput,
  type CreateAccountSupportTicketInput,
  type UpdateAccountPasswordInput,
  type UpdateAccountProfileInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { AccountsService } from './accounts.service.js';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('profile')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  profile() {
    return this.accounts.profile();
  }

  @Patch('profile')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  updateProfile(@Body(new ZodValidationPipe(updateAccountProfileSchema)) body: UpdateAccountProfileInput) {
    return this.accounts.updateProfile(body);
  }

  @Post('password')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  updatePassword(@Body(new ZodValidationPipe(updateAccountPasswordSchema)) body: UpdateAccountPasswordInput) {
    return this.accounts.updatePassword(body);
  }

  @Post('tax-exemption/renewal')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  @UseInterceptors(FileInterceptor('taxCertificate', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      const accepted = allowed.includes(file.mimetype);
      callback(accepted ? null : new Error('Only PDF, JPEG, PNG and WebP files are allowed'), accepted);
    },
  }))
  requestTaxExemptionRenewal(
    @Body(new ZodValidationPipe(accountTaxExemptionRenewalSchema)) body: AccountTaxExemptionRenewalInput,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer?: Buffer },
  ) {
    return this.accounts.requestTaxExemptionRenewal(body, file);
  }

  @Get('addresses')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  addresses() {
    return this.accounts.addresses();
  }

  @Put('addresses/:type')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  saveAddress(
    @Param('type', new ZodValidationPipe(accountAddressTypeSchema)) type: AccountAddressType,
    @Body(new ZodValidationPipe(accountAddressSchema)) body: AccountAddressInput,
  ) {
    return this.accounts.saveAddress(type, body);
  }

  @Delete('addresses/:type')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  deleteAddress(@Param('type', new ZodValidationPipe(accountAddressTypeSchema)) type: AccountAddressType) {
    return this.accounts.deleteAddress(type);
  }

  @Get('orders')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersRead)
  orders(@Query(new ZodValidationPipe(accountOrderListQuerySchema)) query: AccountOrderListQuery) {
    return this.accounts.orders(query);
  }

  @Get('orders/:orderId')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersRead)
  order(@Param('orderId') orderId: string) {
    return this.accounts.orderDetail(orderId);
  }

  @Post('orders/:orderId/reorder')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersReorder)
  reorderOrder(
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(accountReorderSchema)) body: AccountReorderInput,
  ) {
    return this.accounts.reorderOrder(orderId, body);
  }

  @Post('orders/:orderId/line-items/:lineItemId/reorder')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersReorder)
  reorderLineItem(
    @Param('orderId') orderId: string,
    @Param('lineItemId') lineItemId: string,
    @Body(new ZodValidationPipe(accountReorderSchema)) body: AccountReorderInput,
  ) {
    return this.accounts.reorderLineItem(orderId, lineItemId, body);
  }

  @Get('cart/active')
  @RequirePermission(CUSTOMER_PERMISSIONS.cartWrite)
  activeCart() {
    return this.accounts.activeCart();
  }

  @Post('cart')
  @RequirePermission(CUSTOMER_PERMISSIONS.cartWrite)
  createCart(@Body(new ZodValidationPipe(accountCartCreateSchema)) body: AccountCartCreateInput) {
    return this.accounts.createCart(body);
  }

  @Post('cart/:cartId/items')
  @RequirePermission(CUSTOMER_PERMISSIONS.cartWrite)
  addCartItem(
    @Param('cartId') cartId: string,
    @Body(new ZodValidationPipe(accountCartAddItemSchema)) body: AccountCartAddItemInput,
  ) {
    return this.accounts.addCartItem(cartId, body);
  }

  @Patch('cart/:cartId/items/:itemId')
  @RequirePermission(CUSTOMER_PERMISSIONS.cartWrite)
  updateCartItem(
    @Param('cartId') cartId: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(accountCartUpdateItemSchema)) body: AccountCartUpdateItemInput,
  ) {
    return this.accounts.updateCartItem(cartId, itemId, body);
  }

  @Delete('cart/:cartId/items/:itemId')
  @RequirePermission(CUSTOMER_PERMISSIONS.cartWrite)
  removeCartItem(@Param('cartId') cartId: string, @Param('itemId') itemId: string) {
    return this.accounts.removeCartItem(cartId, itemId);
  }

  @Post('cart/:cartId/checkout')
  @RequirePermission(CUSTOMER_PERMISSIONS.cartWrite)
  checkoutCart(
    @Param('cartId') cartId: string,
    @Body(new ZodValidationPipe(accountCartCheckoutSchema)) body: AccountCartCheckoutInput,
  ) {
    return this.accounts.checkoutCart(cartId, body);
  }

  @Get('reorder-templates')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersRead)
  reorderTemplates() {
    return this.accounts.reorderTemplates();
  }

  @Get('products')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  products() {
    return this.accounts.products();
  }

  @Get('tracking')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersRead)
  tracking() {
    return this.accounts.tracking();
  }

  @Get('pickup')
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersRead)
  pickup() {
    return this.accounts.pickup();
  }

  @Get('invoices')
  @RequirePermission(CUSTOMER_PERMISSIONS.invoicesRead)
  invoices(@Query(new ZodValidationPipe(accountInvoiceListQuerySchema)) query: AccountInvoiceListQuery) {
    return this.accounts.invoices(query);
  }

  @Get('invoices/:invoiceId/download')
  @RequirePermission(CUSTOMER_PERMISSIONS.invoicesRead)
  invoiceDownload(@Param('invoiceId') invoiceId: string) {
    return this.accounts.invoiceDownload(invoiceId);
  }

  @Post('invoices/:invoiceId/pay')
  @RequirePermission(CUSTOMER_PERMISSIONS.invoicesRead)
  invoicePay(@Param('invoiceId') invoiceId: string) {
    return this.accounts.invoicePay(invoiceId);
  }

  @Get('invoices/:invoiceId')
  @RequirePermission(CUSTOMER_PERMISSIONS.invoicesRead)
  invoice(@Param('invoiceId') invoiceId: string) {
    return this.accounts.invoiceDetail(invoiceId);
  }

  @Get('documents')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  documents(@Query(new ZodValidationPipe(accountDocumentListQuerySchema)) query: AccountDocumentListQuery) {
    return this.accounts.documents(query);
  }

  @Get('documents/:id/download')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  async downloadDocument(@Param('id') id: string, @Res() res: Response) {
    const file = await this.accounts.documentFile(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.send(file.buffer);
  }

  @Get('support')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  supportTickets() {
    return this.accounts.supportTickets();
  }

  @Post('support')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  createSupportTicket(@Body(new ZodValidationPipe(createAccountSupportTicketSchema)) body: CreateAccountSupportTicketInput) {
    return this.accounts.createSupportTicket(body);
  }

  @Post('support/:id/replies')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  replySupportTicket(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountSupportReplySchema)) body: AccountSupportReplyInput,
  ) {
    return this.accounts.replySupportTicket(id, body);
  }

  @Post('support/:id/close')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  closeSupportTicket(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountSupportCloseSchema)) body: AccountSupportCloseInput,
  ) {
    return this.accounts.closeSupportTicket(id, body);
  }

  @Post('support/:id/reopen')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountWrite)
  reopenSupportTicket(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountSupportReopenSchema)) body: AccountSupportReopenInput,
  ) {
    return this.accounts.reopenSupportTicket(id, body);
  }
}
