import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  approveMailFlowWebhookDestinationSchema,
  createMailAudienceSnapshotSchema,
  mailAudienceFilterSchema,
  mailAudienceSnapshotMemberQuerySchema,
  mailAudienceSnapshotQuerySchema,
  mailCampaignQuerySchema,
  mailMarketingAnalyticsQuerySchema,
  mailMarketingContactQuerySchema,
  mailMarketingSettingsSchema,
  patchMailAudienceSchema,
  patchMailFlowSchema,
  patchMailFlowWebhookDestinationSchema,
  saveMailCampaignSchema,
  saveEmailTemplateSchema,
  saveMailAudienceSchema,
  saveMailFlowSchema,
  saveMailFlowWebhookDestinationSchema,
  simulateMailFlowSchema,
  testEmailTemplateRevisionSchema,
  triggerMailFlowEventSchema,
  upsertMailContactConsentSchema,
  validateMailFlowSchema,
  type ApproveMailFlowWebhookDestinationInput,
  type CreateMailAudienceSnapshotInput,
  type MailAudienceFilterInput,
  type MailAudienceSnapshotMemberQuery,
  type MailAudienceSnapshotQuery,
  type MailCampaignQuery,
  type MailMarketingAnalyticsQuery,
  type MailMarketingContactQuery,
  type MailMarketingSettingsInput,
  type PatchMailAudienceInput,
  type PatchMailFlowInput,
  type PatchMailFlowWebhookDestinationInput,
  type SaveEmailTemplateInput,
  type SaveMailAudienceInput,
  type SaveMailCampaignInput,
  type SaveMailFlowInput,
  type SaveMailFlowWebhookDestinationInput,
  type SimulateMailFlowInput,
  type TestEmailTemplateRevisionInput,
  type TriggerMailFlowEventInput,
  type UpsertMailContactConsentInput,
  type ValidateMailFlowInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { Public } from '../../shared/public.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { MailMarketingService } from './mail-marketing.service.js';

@Controller('mail-marketing')
export class MailMarketingController {
  constructor(
    private readonly marketing: MailMarketingService,
    private readonly templates: EmailTemplatesService,
  ) {}

  @Get('preferences')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  publicPreferenceCenter(@Query('t') token?: string) {
    return this.marketing.publicPreferenceCenter(token);
  }

  @Get('preferences/unsubscribe')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  publicUnsubscribe(@Query('t') token?: string) {
    return this.marketing.publicUnsubscribe(token);
  }

  @Get('overview')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingContactRead)
  overview() {
    return this.marketing.overview();
  }

  @Get('settings/bootstrap')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsRead)
  settingsBootstrap() {
    return this.marketing.settingsBootstrap();
  }

  @Get('settings')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsRead)
  settings() {
    return this.marketing.settings();
  }

  @Patch('settings')
  @RequirePermission(MEMBER_PERMISSIONS.mailSettingsWrite)
  updateSettings(@Body(new ZodValidationPipe(mailMarketingSettingsSchema)) body: MailMarketingSettingsInput) {
    return this.marketing.updateSettings(body);
  }

  @Get('contacts')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingContactRead)
  contacts(@Query(new ZodValidationPipe(mailMarketingContactQuerySchema)) query: MailMarketingContactQuery) {
    return this.marketing.contacts(query);
  }

  @Get('contacts/:contactId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingContactRead)
  contact(@Param('contactId') contactId: string) {
    return this.marketing.contact(contactId);
  }

  @Post('contacts/:contactId/consent')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingContactWrite)
  updateContactConsent(
    @Param('contactId') contactId: string,
    @Body(new ZodValidationPipe(upsertMailContactConsentSchema)) body: UpsertMailContactConsentInput,
  ) {
    return this.marketing.updateContactConsent(contactId, body);
  }

  @Get('audiences')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  audiences() {
    return this.marketing.audiences();
  }

  @Post('audiences/preview')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  previewAudience(@Body(new ZodValidationPipe(mailAudienceFilterSchema)) body: MailAudienceFilterInput) {
    return this.marketing.previewAudience(body);
  }

  @Post('audiences')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceWrite)
  createAudience(@Body(new ZodValidationPipe(saveMailAudienceSchema)) body: SaveMailAudienceInput) {
    return this.marketing.createAudience(body);
  }

  @Get('audiences/snapshots/:snapshotId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  audienceSnapshotMembers(
    @Param('snapshotId') snapshotId: string,
    @Query(new ZodValidationPipe(mailAudienceSnapshotMemberQuerySchema)) query: MailAudienceSnapshotMemberQuery,
  ) {
    return this.marketing.audienceSnapshotMembers(snapshotId, query);
  }

  @Get('audiences/snapshots/:snapshotId/diff')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  audienceSnapshotDiff(
    @Param('snapshotId') snapshotId: string,
    @Query(new ZodValidationPipe(mailAudienceSnapshotMemberQuerySchema)) query: MailAudienceSnapshotMemberQuery,
  ) {
    return this.marketing.audienceSnapshotDiff(snapshotId, query);
  }

  @Get('audiences/:audienceId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  audience(@Param('audienceId') audienceId: string) {
    return this.marketing.getAudience(audienceId);
  }

  @Patch('audiences/:audienceId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceWrite)
  updateAudience(
    @Param('audienceId') audienceId: string,
    @Body(new ZodValidationPipe(patchMailAudienceSchema)) body: PatchMailAudienceInput,
  ) {
    return this.marketing.updateAudience(audienceId, body);
  }

  @Get('audiences/:audienceId/snapshots')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  audienceSnapshots(
    @Param('audienceId') audienceId: string,
    @Query(new ZodValidationPipe(mailAudienceSnapshotQuerySchema)) query: MailAudienceSnapshotQuery,
  ) {
    return this.marketing.audienceSnapshots(audienceId, query);
  }

  @Post('audiences/:audienceId/snapshots')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceWrite)
  createAudienceSnapshot(
    @Param('audienceId') audienceId: string,
    @Body(new ZodValidationPipe(createMailAudienceSnapshotSchema)) body: CreateMailAudienceSnapshotInput,
  ) {
    return this.marketing.createAudienceSnapshot(audienceId, body);
  }

  @Get('campaigns')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignRead)
  campaigns(@Query(new ZodValidationPipe(mailCampaignQuerySchema)) query: MailCampaignQuery) {
    return this.marketing.campaigns(query);
  }

  @Post('campaigns')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignWrite)
  createCampaign(@Body(new ZodValidationPipe(saveMailCampaignSchema)) body: SaveMailCampaignInput) {
    return this.marketing.createCampaign(body);
  }

  @Post('campaigns/:campaignId/queue')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignPublish)
  queueCampaign(@Param('campaignId') campaignId: string) {
    return this.marketing.queueCampaign(campaignId);
  }

  @Post('campaigns/:campaignId/approve')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignApprove)
  approveCampaign(@Param('campaignId') campaignId: string) {
    return this.marketing.approveCampaign(campaignId);
  }

  @Post('campaigns/:campaignId/pause')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignWrite)
  pauseCampaign(@Param('campaignId') campaignId: string) {
    return this.marketing.pauseCampaign(campaignId);
  }

  @Post('campaigns/:campaignId/cancel')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignWrite)
  cancelCampaign(@Param('campaignId') campaignId: string) {
    return this.marketing.cancelCampaign(campaignId);
  }

  @Get('analytics/overview')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignRead)
  analyticsOverview(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsOverview(query);
  }

  @Get('analytics/campaigns')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignRead)
  analyticsCampaigns(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsCampaigns(query);
  }

  @Get('analytics/templates')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  analyticsTemplates(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsTemplates(query);
  }

  @Get('analytics/audiences')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingAudienceRead)
  analyticsAudiences(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsAudiences(query);
  }

  @Get('analytics/flows')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  analyticsFlows(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsFlows(query);
  }

  @Get('analytics/funnel')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignRead)
  analyticsFunnel(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsFunnel(query);
  }

  @Get('analytics/cohorts')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingCampaignRead)
  analyticsCohorts(@Query(new ZodValidationPipe(mailMarketingAnalyticsQuerySchema)) query: MailMarketingAnalyticsQuery) {
    return this.marketing.analyticsCohorts(query);
  }

  @Get('templates')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  templatesList() {
    return this.templates.list({ limit: 200 });
  }

  @Post('templates')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  createTemplate(@Body(new ZodValidationPipe(saveEmailTemplateSchema)) body: SaveEmailTemplateInput) {
    return this.templates.create(body);
  }

  @Get('templates/:templateId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  template(@Param('templateId') templateId: string) {
    return this.templates.get(templateId);
  }

  @Patch('templates/:templateId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  updateTemplate(
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(saveEmailTemplateSchema.partial())) body: Partial<SaveEmailTemplateInput>,
  ) {
    return this.templates.update(templateId, body);
  }

  @Post('templates/:templateId/test-send')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  testSend(
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(testEmailTemplateRevisionSchema)) body: TestEmailTemplateRevisionInput,
  ) {
    return this.templates.testSendTemplate(templateId, body);
  }

  @Get('flows')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  flows() {
    return this.marketing.flows();
  }

  @Get('flows/webhook-destinations')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  webhookDestinations() {
    return this.marketing.webhookDestinations();
  }

  @Post('flows/webhook-destinations')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowWrite)
  createWebhookDestination(
    @Body(new ZodValidationPipe(saveMailFlowWebhookDestinationSchema)) body: SaveMailFlowWebhookDestinationInput,
  ) {
    return this.marketing.createWebhookDestination(body);
  }

  @Patch('flows/webhook-destinations/:destinationId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowWrite)
  updateWebhookDestination(
    @Param('destinationId') destinationId: string,
    @Body(new ZodValidationPipe(patchMailFlowWebhookDestinationSchema)) body: PatchMailFlowWebhookDestinationInput,
  ) {
    return this.marketing.updateWebhookDestination(destinationId, body);
  }

  @Post('flows/webhook-destinations/:destinationId/approve-live')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowPublish)
  approveWebhookDestinationLive(
    @Param('destinationId') destinationId: string,
    @Body(new ZodValidationPipe(approveMailFlowWebhookDestinationSchema)) body: ApproveMailFlowWebhookDestinationInput,
  ) {
    return this.marketing.approveWebhookDestinationLive(destinationId, body);
  }

  @Post('flows/webhook-destinations/:destinationId/revoke-live')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowPublish)
  revokeWebhookDestinationLive(@Param('destinationId') destinationId: string) {
    return this.marketing.revokeWebhookDestinationLive(destinationId);
  }

  @Post('flows')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowWrite)
  createFlow(@Body(new ZodValidationPipe(saveMailFlowSchema)) body: SaveMailFlowInput) {
    return this.marketing.createFlow(body);
  }

  @Post('flows/events')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowPublish)
  triggerFlowEvent(@Body(new ZodValidationPipe(triggerMailFlowEventSchema)) body: TriggerMailFlowEventInput) {
    return this.marketing.handleDomainEvent(body.triggerType, body.payload);
  }

  @Get('flows/:flowId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  flow(@Param('flowId') flowId: string) {
    return this.marketing.getFlow(flowId);
  }

  @Patch('flows/:flowId')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowWrite)
  updateFlow(@Param('flowId') flowId: string, @Body(new ZodValidationPipe(patchMailFlowSchema)) body: PatchMailFlowInput) {
    return this.marketing.updateFlow(flowId, body);
  }

  @Post('flows/:flowId/validate')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  validateFlow(
    @Param('flowId') flowId: string,
    @Body(new ZodValidationPipe(validateMailFlowSchema)) body: ValidateMailFlowInput,
  ) {
    return this.marketing.validateFlow(flowId, body);
  }

  @Post('flows/:flowId/simulate')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  simulateFlow(
    @Param('flowId') flowId: string,
    @Body(new ZodValidationPipe(simulateMailFlowSchema)) body: SimulateMailFlowInput,
  ) {
    return this.marketing.simulateFlow(flowId, body);
  }

  @Post('flows/:flowId/publish')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowPublish)
  publishFlow(@Param('flowId') flowId: string) {
    return this.marketing.publishFlow(flowId);
  }

  @Post('flows/:flowId/pause')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowWrite)
  pauseFlow(@Param('flowId') flowId: string) {
    return this.marketing.pauseFlow(flowId);
  }

  @Post('flows/:flowId/resume')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowPublish)
  resumeFlow(@Param('flowId') flowId: string) {
    return this.marketing.resumeFlow(flowId);
  }

  @Post('flows/:flowId/enrollments/:enrollmentId/replay')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowPublish)
  replayEnrollment(@Param('flowId') flowId: string, @Param('enrollmentId') enrollmentId: string) {
    return this.marketing.replayEnrollment(flowId, enrollmentId);
  }

  @Get('flows/:flowId/runs')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  flowRuns(@Param('flowId') flowId: string) {
    return this.marketing.flowRuns(flowId);
  }

  @Get('flows/:flowId/events')
  @RequirePermission(MEMBER_PERMISSIONS.mailMarketingFlowRead)
  flowEvents(@Param('flowId') flowId: string) {
    return this.marketing.flowEvents(flowId);
  }
}
