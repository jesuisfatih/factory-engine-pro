import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  mailListQuerySchema,
  sendTestMailSchema,
  type MailListQuery,
  type SendTestMailInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { MailService } from './mail.service.js';

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('health')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  health() {
    return this.mail.health();
  }

  @Get('deliveries')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  deliveries(@Query(new ZodValidationPipe(mailListQuerySchema)) query: MailListQuery) {
    return this.mail.list(query);
  }

  @Get('deliveries/:id')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  delivery(@Param('id') id: string) {
    return this.mail.findOne(id);
  }

  @Post('deliveries/:id/retry')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  retry(@Param('id') id: string) {
    return this.mail.retryDelivery(id);
  }

  @Post('test')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  test(@Body(new ZodValidationPipe(sendTestMailSchema)) body: SendTestMailInput) {
    return this.mail.sendTest(body.to, body.subject);
  }
}
