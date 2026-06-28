import { Body, Controller, Get, Header, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  addServiceRequestCommentSchema,
  assignServiceRequestSchema,
  bulkServiceRequestsSchema,
  changeServiceRequestStatusSchema,
  closeServiceRequestSchema,
  createServiceRequestSchema,
  MEMBER_PERMISSIONS,
  sweepOverdueServiceRequestsSchema,
  supportQuerySchema,
  updateServiceRequestSchema,
  type AddServiceRequestCommentInput,
  type AssignServiceRequestInput,
  type BulkServiceRequestsInput,
  type ChangeServiceRequestStatusInput,
  type CloseServiceRequestInput,
  type CreateServiceRequestInput,
  type SweepOverdueServiceRequestsInput,
  type SupportQuery,
  type UpdateServiceRequestInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { SupportService } from './support.service.js';

@Controller(['support', 'service-requests'])
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  list(@Query(new ZodValidationPipe(supportQuerySchema)) query: SupportQuery) {
    return this.support.list(query);
  }

  @Get('stats')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  stats(@Query(new ZodValidationPipe(supportQuerySchema.partial())) query: Partial<SupportQuery>) {
    return this.support.stats(query);
  }

  @Get('stats/overview')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  statsOverview(@Query(new ZodValidationPipe(supportQuerySchema.partial())) query: Partial<SupportQuery>) {
    return this.support.stats(query);
  }

  @Get('customers')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  customers(@Query('search') search?: string) {
    return this.support.listCustomers(search);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="service-requests.csv"')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  exportCsv(@Query(new ZodValidationPipe(supportQuerySchema)) query: SupportQuery) {
    return this.support.exportCsv(query);
  }

  @Post()
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  create(@Body(new ZodValidationPipe(createServiceRequestSchema)) body: CreateServiceRequestInput) {
    return this.support.create(body);
  }

  @Post('bulk')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  bulk(@Body(new ZodValidationPipe(bulkServiceRequestsSchema)) body: BulkServiceRequestsInput) {
    return this.support.bulk(body);
  }

  @Post('overdue/sweep')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  sweepOverdue(@Body(new ZodValidationPipe(sweepOverdueServiceRequestsSchema)) body: SweepOverdueServiceRequestsInput) {
    return this.support.sweepOverdue(body);
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  getById(@Param('id') id: string) {
    return this.support.getById(id);
  }

  @Patch(':id')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceRequestSchema)) body: UpdateServiceRequestInput,
  ) {
    return this.support.update(id, body);
  }

  @Post(':id/assign')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignServiceRequestSchema)) body: AssignServiceRequestInput,
  ) {
    return this.support.assign(id, body);
  }

  @Put(':id/status')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  changeStatusPut(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeServiceRequestStatusSchema)) body: ChangeServiceRequestStatusInput,
  ) {
    return this.support.changeStatus(id, body);
  }

  @Patch(':id/status')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  changeStatusPatch(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeServiceRequestStatusSchema)) body: ChangeServiceRequestStatusInput,
  ) {
    return this.support.changeStatus(id, body);
  }

  @Post(':id/comments')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  addComment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addServiceRequestCommentSchema)) body: AddServiceRequestCommentInput,
  ) {
    return this.support.addComment(id, body);
  }

  @Post(':id/close')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  close(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeServiceRequestSchema)) body: CloseServiceRequestInput,
  ) {
    return this.support.close(id, body);
  }

  @Post(':id/reopen')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  reopen(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.support.reopen(id, reason);
  }
}
