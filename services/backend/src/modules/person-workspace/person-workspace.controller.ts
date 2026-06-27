import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createPersonRequestSchema,
  MEMBER_PERMISSIONS,
  movePersonQueueCardSchema,
  savePersonNoteSchema,
  sendPersonMessageSchema,
  togglePersonQueuePinSchema,
  type CreatePersonRequestInput,
  type MovePersonQueueCardInput,
  type SavePersonNoteInput,
  type SendPersonMessageInput,
  type TogglePersonQueuePinInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { PersonWorkspaceService } from './person-workspace.service.js';

@Controller('person/workspace')
export class PersonWorkspaceController {
  constructor(private readonly workspace: PersonWorkspaceService) {}

  @Get('summary')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  summary() {
    return this.workspace.summary();
  }

  @Get('queue')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  queue() {
    return this.workspace.queue();
  }

  @Patch('queue/:id/move')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  moveQueueCard(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(movePersonQueueCardSchema)) body: MovePersonQueueCardInput,
  ) {
    return this.workspace.moveQueueCard(id, body);
  }

  @Post('queue/:id/pin')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
  toggleQueuePin(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(togglePersonQueuePinSchema)) body: TogglePersonQueuePinInput,
  ) {
    return this.workspace.toggleQueuePin(id, body);
  }

  @Get('customers')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customers() {
    return this.workspace.customers();
  }

  @Get('calendar')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  calendar() {
    return this.workspace.calendar();
  }

  @Get('messages/teammates')
  @RequirePermission(MEMBER_PERMISSIONS.identityRead)
  teammates() {
    return this.workspace.teammates();
  }

  @Get('messages/threads/:threadId')
  @RequirePermission(MEMBER_PERMISSIONS.identityRead)
  thread(@Param('threadId') threadId: string) {
    return this.workspace.thread(threadId);
  }

  @Post('messages')
  @RequirePermission(MEMBER_PERMISSIONS.supportWrite)
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

  @Get('emails')
  @RequirePermission(MEMBER_PERMISSIONS.supportRead)
  emails() {
    return this.workspace.emails();
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
