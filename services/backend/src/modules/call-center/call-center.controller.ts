import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  callCenterCreateCustomerTaskSchema,
  callCenterReplyNoteSchema,
  callCenterSaveCustomerNoteSchema,
  callCenterSendMessageSchema,
  callCenterTransferTaskSchema,
  assignUnmatchedTranscriptReviewSchema,
  dismissUnmatchedTranscriptReviewSchema,
  MEMBER_PERMISSIONS,
  type CallCenterCreateCustomerTaskInput,
  type CallCenterReplyNoteInput,
  type CallCenterSaveCustomerNoteInput,
  type CallCenterSendMessageInput,
  type CallCenterTransferTaskInput,
  type AssignUnmatchedTranscriptReviewInput,
  type DismissUnmatchedTranscriptReviewInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { CallCenterService } from './call-center.service.js';

@Controller('call-center')
export class CallCenterController {
  constructor(private readonly callCenter: CallCenterService) {}

  @Get('overview')
  @RequirePermission(MEMBER_PERMISSIONS.membersRead, MEMBER_PERMISSIONS.taskAssign)
  overview() {
    return this.callCenter.overview();
  }

  @Post('transcript-reviews/:id/assign')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  assignTranscriptReview(@Param('id') id: string, @Body(new ZodValidationPipe(assignUnmatchedTranscriptReviewSchema)) body: AssignUnmatchedTranscriptReviewInput) {
    return this.callCenter.assignTranscriptReview(id, body);
  }

  @Post('transcript-reviews/:id/dismiss')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  dismissTranscriptReview(@Param('id') id: string, @Body(new ZodValidationPipe(dismissUnmatchedTranscriptReviewSchema)) body: DismissUnmatchedTranscriptReviewInput) {
    return this.callCenter.dismissTranscriptReview(id, body);
  }

  @Post('tasks/sync')
  @RequirePermission(MEMBER_PERMISSIONS.aircallUsersWrite)
  syncTasks() {
    return this.callCenter.syncTasks();
  }

  @Get('customers/:id/detail')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customerDetail(@Param('id') id: string) {
    return this.callCenter.customerDetail(id);
  }

  @Post('customers/:id/notes')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite, MEMBER_PERMISSIONS.taskAssign)
  saveCustomerNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(callCenterSaveCustomerNoteSchema)) body: CallCenterSaveCustomerNoteInput,
  ) {
    return this.callCenter.saveCustomerNote(id, body);
  }

  @Post('notes/:id/replies')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite, MEMBER_PERMISSIONS.taskAssign)
  replyNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(callCenterReplyNoteSchema)) body: CallCenterReplyNoteInput,
  ) {
    return this.callCenter.replyNote(id, body);
  }

  @Post('messages')
  @RequirePermission(MEMBER_PERMISSIONS.messagingWrite)
  sendMessage(@Body(new ZodValidationPipe(callCenterSendMessageSchema)) body: CallCenterSendMessageInput) {
    return this.callCenter.sendMessage(body);
  }

  @Post('tasks/:id/transfer')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  transferTask(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(callCenterTransferTaskSchema)) body: CallCenterTransferTaskInput,
  ) {
    return this.callCenter.transferTask(id, body);
  }

  @Post('customers/:id/tasks')
  @RequirePermission(MEMBER_PERMISSIONS.taskAssign)
  createCustomerTask(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(callCenterCreateCustomerTaskSchema)) body: CallCenterCreateCustomerTaskInput,
  ) {
    return this.callCenter.createCustomerTask(id, body);
  }
}
