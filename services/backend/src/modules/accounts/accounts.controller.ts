import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  accountAddressSchema,
  accountAddressTypeSchema,
  createAccountSupportTicketSchema,
  CUSTOMER_PERMISSIONS,
  updateAccountPasswordSchema,
  updateAccountProfileSchema,
  type AccountAddressInput,
  type AccountAddressType,
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
  orders() {
    return this.accounts.orders();
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
  @RequirePermission(CUSTOMER_PERMISSIONS.ordersRead)
  invoices() {
    return this.accounts.invoices();
  }

  @Get('documents')
  @RequirePermission(CUSTOMER_PERMISSIONS.accountRead)
  documents() {
    return this.accounts.documents();
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
}
