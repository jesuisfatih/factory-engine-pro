import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  aircallDialSchema,
  createPersonRequestSchema,
  MEMBER_PERMISSIONS,
  movePersonQueueCardSchema,
  personDailyOperationsQuerySchema,
  reorderPersonDailyCallSchema,
  savePersonCustomerNoteSchema,
  savePersonEmailDraftSchema,
  sendPersonEmailSchema,
  savePersonNoteSchema,
  replyPersonNoteSchema,
  savePersonTaskNoteSchema,
  schedulePersonTaskFollowUpSchema,
  sendPersonMessageSchema,
  togglePersonQueuePinSchema,
  transferPersonTaskSchema,
  type AircallDialInput,
  type CreatePersonRequestInput,
  type MovePersonQueueCardInput,
  type PersonDailyOperationsQuery,
  type ReorderPersonDailyCallInput,
  type ReplyPersonNoteInput,
  type SavePersonCustomerNoteInput,
  type SavePersonEmailDraftInput,
  type SendPersonEmailInput,
  type SavePersonNoteInput,
  type SavePersonTaskNoteInput,
  type SchedulePersonTaskFollowUpInput,
  type SendPersonMessageInput,
  type TogglePersonQueuePinInput,
  type TransferPersonTaskInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { PersonWorkspaceService } from './person-workspace.service.js';

@Controller('person/workspace')
export class PersonWorkspaceController {
  constructor(private readonly workspace: PersonWorkspaceService) {}

  @Get('summary')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  summary() {
    return this.workspace.summary();
  }

  @Get('queue')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  queue() {
    return this.workspace.queue();
  }

  @Get('daily-operations')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  dailyOperations(
    @Query(new ZodValidationPipe(personDailyOperationsQuerySchema)) query: PersonDailyOperationsQuery,
  ) {
    return this.workspace.dailyOperations(query);
  }

  @Patch('queue/:id/move')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  moveQueueCard(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(movePersonQueueCardSchema)) body: MovePersonQueueCardInput,
  ) {
    return this.workspace.moveQueueCard(id, body);
  }

  @Patch('daily-call-order')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  reorderDailyCalls(
    @Body(new ZodValidationPipe(reorderPersonDailyCallSchema)) body: ReorderPersonDailyCallInput,
  ) {
    return this.workspace.reorderDailyCalls(body);
  }

  @Post('tasks/:id/archive')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  archiveDailyCall(@Param('id') id: string) {
    return this.workspace.archiveDailyCall(id);
  }

  @Post('tasks/sync')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  syncTasks() {
    return this.workspace.syncTasks();
  }

  @Post('aircall/dial')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  dialCustomer(
    @Body(new ZodValidationPipe(aircallDialSchema)) body: AircallDialInput,
  ) {
    return this.workspace.dialCustomer(body);
  }

  @Post('queue/:id/pin')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  toggleQueuePin(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(togglePersonQueuePinSchema)) body: TogglePersonQueuePinInput,
  ) {
    return this.workspace.toggleQueuePin(id, body);
  }

  @Post('customers/:id/pin')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  toggleCustomerPin(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(togglePersonQueuePinSchema)) body: TogglePersonQueuePinInput,
  ) {
    return this.workspace.toggleCustomerPin(id, body);
  }

  @Get('transfer-targets')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  transferTargets() {
    return this.workspace.transferTargets();
  }

  @Get('customers/:id/detail')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customerDetail(@Param('id') id: string) {
    return this.workspace.customerDetail(id);
  }

  @Post('customers/:id/notes')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  saveCustomerNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePersonCustomerNoteSchema)) body: SavePersonCustomerNoteInput,
  ) {
    return this.workspace.saveCustomerNote(id, body);
  }

  @Get('tasks/:id/brief')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  taskBrief(@Param('id') id: string) {
    return this.workspace.taskBrief(id);
  }

  @Post('tasks/:id/transfer')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  transferTask(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transferPersonTaskSchema)) body: TransferPersonTaskInput,
  ) {
    return this.workspace.transferTask(id, body);
  }

  @Post('tasks/:id/notes')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  saveTaskNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePersonTaskNoteSchema)) body: SavePersonTaskNoteInput,
  ) {
    return this.workspace.saveTaskNote(id, body);
  }

  @Post('tasks/:id/calendar')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  scheduleTaskFollowUp(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(schedulePersonTaskFollowUpSchema)) body: SchedulePersonTaskFollowUpInput,
  ) {
    return this.workspace.scheduleTaskFollowUp(id, body);
  }

  @Get('customers')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customers() {
    return this.workspace.customers();
  }

  @Get('customer-archive')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customerArchive() {
    return this.workspace.customerArchive();
  }

  @Get('calendar')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  calendar() {
    return this.workspace.calendar();
  }

  @Get('messages/teammates')
  @RequirePermission(MEMBER_PERMISSIONS.messagingRead)
  teammates() {
    return this.workspace.teammates();
  }

  @Get('messages/threads/:threadId')
  @RequirePermission(MEMBER_PERMISSIONS.messagingRead)
  thread(@Param('threadId') threadId: string) {
    return this.workspace.thread(threadId);
  }

  @Post('messages')
  @RequirePermission(MEMBER_PERMISSIONS.messagingWrite)
  sendMessage(@Body(new ZodValidationPipe(sendPersonMessageSchema)) body: SendPersonMessageInput) {
    return this.workspace.sendMessage(body);
  }

  @Get('notes')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  notes() {
    return this.workspace.notes();
  }

  @Post('notes')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  saveNote(@Body(new ZodValidationPipe(savePersonNoteSchema)) body: SavePersonNoteInput) {
    return this.workspace.saveNote(body);
  }

  @Post('notes/:id/replies')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  replyNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replyPersonNoteSchema)) body: ReplyPersonNoteInput,
  ) {
    return this.workspace.replyNote(id, body);
  }

  @Get('customer-archive/:id/detail')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customerArchiveDetail(@Param('id') id: string) {
    return this.workspace.customerArchiveDetail(id);
  }

  @Get('emails')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  emails() {
    return this.workspace.emails();
  }

  @Get('emails/contacts')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  emailContacts() {
    return this.workspace.emailContacts();
  }

  @Post('emails/drafts')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  saveEmailDraft(@Body(new ZodValidationPipe(savePersonEmailDraftSchema)) body: SavePersonEmailDraftInput) {
    return this.workspace.saveEmailDraft(body);
  }

  @Post('emails/send')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  sendEmail(@Body(new ZodValidationPipe(sendPersonEmailSchema)) body: SendPersonEmailInput) {
    return this.workspace.sendEmail(body);
  }

  @Get('announcements')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  announcements() {
    return this.workspace.announcements();
  }

  @Get('notifications')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  notifications() {
    return this.workspace.notifications();
  }

  @Get('training')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  training() {
    return this.workspace.training();
  }

  @Get('requests')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  requests() {
    return this.workspace.requests();
  }

  @Post('requests')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  createRequest(@Body(new ZodValidationPipe(createPersonRequestSchema)) body: CreatePersonRequestInput) {
    return this.workspace.createRequest(body);
  }
}
