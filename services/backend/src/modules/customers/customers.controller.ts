import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createCustomerListSchema,
  customerCommerceQuerySchema,
  customerListCustomersSchema,
  MEMBER_PERMISSIONS,
  updateCustomerListItemNoteSchema,
  updateCustomerListSchema,
  type CreateCustomerListInput,
  type CustomerCommerceQuery,
  type CustomerListCustomersInput,
  type UpdateCustomerListInput,
  type UpdateCustomerListItemNoteInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  list(@Query(new ZodValidationPipe(customerCommerceQuerySchema)) query: CustomerCommerceQuery) {
    return this.customers.list(query);
  }

  @Get('stats')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  stats(@Query(new ZodValidationPipe(customerCommerceQuerySchema.partial())) query: Partial<CustomerCommerceQuery>) {
    return this.customers.stats(query);
  }

  @Post('insights/calculate')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  calculateInsights() {
    return this.customers.calculateInsights();
  }

  @Get('lists')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  lists() {
    return this.customers.lists();
  }

  @Post('lists')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  createList(@Body(new ZodValidationPipe(createCustomerListSchema)) body: CreateCustomerListInput) {
    return this.customers.createList(body);
  }

  @Get('lists/:id')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  getList(@Param('id') id: string) {
    return this.customers.getList(id);
  }

  @Patch('lists/:id')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  updateList(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerListSchema)) body: UpdateCustomerListInput,
  ) {
    return this.customers.updateList(id, body);
  }

  @Delete('lists/:id')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  deleteList(@Param('id') id: string) {
    return this.customers.deleteList(id);
  }

  @Post('lists/:id/customers')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  addCustomersToList(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(customerListCustomersSchema)) body: CustomerListCustomersInput,
  ) {
    return this.customers.addCustomersToList(id, body);
  }

  @Delete('lists/:id/customers')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  removeCustomersFromList(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(customerListCustomersSchema)) body: CustomerListCustomersInput,
  ) {
    return this.customers.removeCustomersFromList(id, body);
  }

  @Patch('lists/items/:itemId/note')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  updateListItemNote(
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateCustomerListItemNoteSchema)) body: UpdateCustomerListItemNoteInput,
  ) {
    return this.customers.updateListItemNote(itemId, body.notes);
  }

  @Get('alarms/summary')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  alarmsSummary() {
    return this.customers.alarmsSummary();
  }

  @Post('alarms/generate')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  generateAlarms() {
    return this.customers.generateAlarms();
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }
}
