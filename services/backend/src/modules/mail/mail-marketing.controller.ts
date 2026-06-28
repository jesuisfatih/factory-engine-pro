import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  mailAudienceFilterSchema,
  mailMarketingContactQuerySchema,
  mailMarketingSettingsSchema,
  patchMailAudienceSchema,
  patchMailFlowSchema,
  saveEmailTemplateSchema,
  saveMailAudienceSchema,
  saveMailFlowSchema,
  type MailAudienceFilterInput,
  type MailMarketingContactQuery,
  type MailMarketingSettingsInput,
  type PatchMailAudienceInput,
  type PatchMailFlowInput,
  type SaveEmailTemplateInput,
  type SaveMailAudienceInput,
  type SaveMailFlowInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { MailMarketingService } from './mail-marketing.service.js';

@Controller('mail-marketing')
export class MailMarketingController {
  constructor(
    private readonly marketing: MailMarketingService,
    private readonly templates: EmailTemplatesService,
  ) {}

  @Get('overview')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  overview() {
    return this.marketing.overview();
  }

  @Get('settings/bootstrap')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  settingsBootstrap() {
    return this.marketing.settingsBootstrap();
  }

  @Get('settings')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  settings() {
    return this.marketing.settings();
  }

  @Patch('settings')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateSettings(@Body(new ZodValidationPipe(mailMarketingSettingsSchema)) body: MailMarketingSettingsInput) {
    return this.marketing.updateSettings(body);
  }

  @Get('contacts')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  contacts(@Query(new ZodValidationPipe(mailMarketingContactQuerySchema)) query: MailMarketingContactQuery) {
    return this.marketing.contacts(query);
  }

  @Get('audiences')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  audiences() {
    return this.marketing.audiences();
  }

  @Post('audiences/preview')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  previewAudience(@Body(new ZodValidationPipe(mailAudienceFilterSchema)) body: MailAudienceFilterInput) {
    return this.marketing.previewAudience(body);
  }

  @Post('audiences')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  createAudience(@Body(new ZodValidationPipe(saveMailAudienceSchema)) body: SaveMailAudienceInput) {
    return this.marketing.createAudience(body);
  }

  @Get('audiences/:audienceId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  audience(@Param('audienceId') audienceId: string) {
    return this.marketing.getAudience(audienceId);
  }

  @Patch('audiences/:audienceId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateAudience(
    @Param('audienceId') audienceId: string,
    @Body(new ZodValidationPipe(patchMailAudienceSchema)) body: PatchMailAudienceInput,
  ) {
    return this.marketing.updateAudience(audienceId, body);
  }

  @Post('audiences/:audienceId/snapshot')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  snapshotAudience(@Param('audienceId') audienceId: string) {
    return {
      audienceId,
      status: 'skipped',
      message: 'Audience snapshots are not active yet; live preview/count is available.',
    };
  }

  @Get('templates')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  templatesList() {
    return this.templates.list({ limit: 200 });
  }

  @Post('templates')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  createTemplate(@Body(new ZodValidationPipe(saveEmailTemplateSchema)) body: SaveEmailTemplateInput) {
    return this.templates.create(body);
  }

  @Get('templates/:templateId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  template(@Param('templateId') templateId: string) {
    return this.templates.get(templateId);
  }

  @Patch('templates/:templateId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateTemplate(
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(saveEmailTemplateSchema.partial())) body: Partial<SaveEmailTemplateInput>,
  ) {
    return this.templates.update(templateId, body);
  }

  @Post('templates/:templateId/test-send')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  testSend(@Param('templateId') templateId: string) {
    return this.templates.testSend(templateId);
  }

  @Get('flows')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  flows() {
    return this.marketing.flows();
  }

  @Post('flows')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  createFlow(@Body(new ZodValidationPipe(saveMailFlowSchema)) body: SaveMailFlowInput) {
    return this.marketing.createFlow(body);
  }

  @Get('flows/:flowId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  flow(@Param('flowId') flowId: string) {
    return this.marketing.getFlow(flowId);
  }

  @Patch('flows/:flowId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateFlow(@Param('flowId') flowId: string, @Body(new ZodValidationPipe(patchMailFlowSchema)) body: PatchMailFlowInput) {
    return this.marketing.updateFlow(flowId, body);
  }

  @Post('flows/:flowId/publish')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  publishFlow(@Param('flowId') flowId: string) {
    return this.marketing.publishFlow(flowId);
  }

  @Post('flows/:flowId/pause')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  pauseFlow(@Param('flowId') flowId: string) {
    return this.marketing.pauseFlow(flowId);
  }

  @Post('flows/:flowId/resume')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  resumeFlow(@Param('flowId') flowId: string) {
    return this.marketing.resumeFlow(flowId);
  }

  @Post('flows/:flowId/enrollments/:enrollmentId/replay')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  replayEnrollment(@Param('flowId') flowId: string, @Param('enrollmentId') enrollmentId: string) {
    return this.marketing.replayEnrollment(flowId, enrollmentId);
  }

  @Get('flows/:flowId/runs')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  flowRuns(@Param('flowId') flowId: string) {
    return { flowId, runs: [], sendingEnabled: false };
  }

  @Get('flows/:flowId/events')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  flowEvents(@Param('flowId') flowId: string) {
    return { flowId, events: [], sendingEnabled: false };
  }
}
