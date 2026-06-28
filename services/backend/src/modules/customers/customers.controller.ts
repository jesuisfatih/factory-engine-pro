import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  assignDefaultCustomerAxisSchema,
  assignCustomerAxisPrimarySchema,
  createCustomerListSchema,
  customerCommerceQuerySchema,
  customerListCustomersSchema,
  MEMBER_PERMISSIONS,
  recordCustomerAxisNoAutoReassignSchema,
  updateCustomerListItemNoteSchema,
  updateCustomerListSchema,
  type AssignCustomerAxisPrimaryInput,
  type AssignDefaultCustomerAxisInput,
  type CreateCustomerListInput,
  type CustomerCommerceQuery,
  type CustomerListCustomersInput,
  type RecordCustomerAxisNoAutoReassignInput,
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

  @Post('assign-default-axis')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite, MEMBER_PERMISSIONS.membersRead)
  assignDefaultAxis(
    @Body(new ZodValidationPipe(assignDefaultCustomerAxisSchema)) body: AssignDefaultCustomerAxisInput,
  ) {
    return this.customers.assignDefaultAxis(body);
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

  @Get(':id/assignments')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  assignments(@Param('id') id: string) {
    return this.customers.assignments(id);
  }

  @Get(':id/detail')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  detail(@Param('id') id: string) {
    return this.customers.detail(id);
  }

  @Put(':id/assignments/:axis/primary')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  assignAxisPrimary(
    @Param('id') id: string,
    @Param('axis') axis: string,
    @Body(new ZodValidationPipe(assignCustomerAxisPrimarySchema)) body: AssignCustomerAxisPrimaryInput,
  ) {
    return this.customers.assignAxisPrimary(id, axis, body);
  }

  @Post(':id/assignments/:axis/no-auto-reassign')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  recordNoAutoReassign(
    @Param('id') id: string,
    @Param('axis') axis: string,
    @Body(new ZodValidationPipe(recordCustomerAxisNoAutoReassignSchema)) body: RecordCustomerAxisNoAutoReassignInput,
  ) {
    return this.customers.recordNoAutoReassign(id, axis, body);
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }
}
