import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  addMailSuppressionSchema,
  mailDeliveryLogQuerySchema,
  mailDlqListQuerySchema,
  mailListQuerySchema,
  mailProviderEventQuerySchema,
  mailSettingsAuditQuerySchema,
  mailSuppressionListQuerySchema,
  patchMailCenterSettingsSchema,
  resetMailCenterSettingsSchema,
  sendTestMailSchema,
  type AddMailSuppressionInput,
  type MailDeliveryLogQuery,
  type MailDlqListQuery,
  type MailListQuery,
  type MailProviderEventQuery,
  type MailSettingsAuditQuery,
  type MailSuppressionListQuery,
  type PatchMailCenterSettingsInput,
  type ResetMailCenterSettingsInput,
  type SendTestMailInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { MailService } from './mail.service.js';

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('health')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  health() {
    return this.mail.health();
  }

  @Get('deliveries')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  deliveries(@Query(new ZodValidationPipe(mailListQuerySchema)) query: MailListQuery) {
    return this.mail.list(query);
  }

  @Get('delivery-log')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  deliveryLog(@Query(new ZodValidationPipe(mailDeliveryLogQuerySchema)) query: MailDeliveryLogQuery) {
    return this.mail.deliveryLog(query);
  }

  @Get('provider-events')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  providerEvents(@Query(new ZodValidationPipe(mailProviderEventQuerySchema)) query: MailProviderEventQuery) {
    return this.mail.providerEvents(query);
  }

  @Get('deliveries/:id')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  delivery(@Param('id') id: string) {
    return this.mail.findOne(id);
  }

  @Get('delivery-log/:id')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  deliveryLogDetail(@Param('id') id: string) {
    return this.mail.findOne(id);
  }

  @Post('deliveries/:id/retry')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRetry)
  retry(@Param('id') id: string) {
    return this.mail.retryDelivery(id);
  }

  @Get('suppression')
  @RequirePermission(MEMBER_PERMISSIONS.mailSuppressionRead)
  suppression(@Query(new ZodValidationPipe(mailSuppressionListQuerySchema)) query: MailSuppressionListQuery) {
    return this.mail.listSuppression(query);
  }

  @Post('suppression')
  @RequirePermission(MEMBER_PERMISSIONS.mailSuppressionWrite)
  addSuppression(@Body(new ZodValidationPipe(addMailSuppressionSchema)) body: AddMailSuppressionInput) {
    return this.mail.addSuppression(body);
  }

  @Post('suppression/:id/unsuppress')
  @RequirePermission(MEMBER_PERMISSIONS.mailSuppressionWrite)
  unsuppress(@Param('id') id: string) {
    return this.mail.unsuppress(id);
  }

  @Get('dlq')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRead)
  dlq(@Query(new ZodValidationPipe(mailDlqListQuerySchema)) query: MailDlqListQuery) {
    return this.mail.listDlq(query);
  }

  @Post('dlq/:id/retry')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRetry)
  retryDlq(@Param('id') id: string) {
    return this.mail.retryDlq(id);
  }

  @Post('dlq/:id/discard')
  @RequirePermission(MEMBER_PERMISSIONS.mailDeliveryRetry)
  discardDlq(@Param('id') id: string) {
    return this.mail.discardDlq(id);
  }

  @Get('settings')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsRead)
  settings() {
    return this.mail.mailCenterSettings();
  }

  @Patch('settings')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsWrite)
  patchSettings(@Body(new ZodValidationPipe(patchMailCenterSettingsSchema)) body: PatchMailCenterSettingsInput) {
    return this.mail.patchMailCenterSettings(body);
  }

  @Post('settings/reset')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsWrite)
  resetSettings(@Body(new ZodValidationPipe(resetMailCenterSettingsSchema)) _body: ResetMailCenterSettingsInput) {
    return this.mail.resetMailCenterSettings();
  }

  @Get('settings/audit')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsRead)
  settingsAudit(@Query(new ZodValidationPipe(mailSettingsAuditQuerySchema)) query: MailSettingsAuditQuery) {
    return this.mail.settingsAudit(query);
  }

  @Post('test')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  test(@Body(new ZodValidationPipe(sendTestMailSchema)) body: SendTestMailInput) {
    return this.mail.sendTest(body.to, body.subject);
  }
}
