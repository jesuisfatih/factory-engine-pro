import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  activateEmailTemplateSchema,
  approveEmailTemplateRevisionSchema,
  MEMBER_PERMISSIONS,
  mailTemplateBlockQuerySchema,
  mailTemplateQuerySchema,
  mailTemplatePreviewProfileQuerySchema,
  mailTemplateSnippetQuerySchema,
  patchMailTemplateBlockSchema,
  patchMailTemplatePreviewProfileSchema,
  patchEmailTemplateSchema,
  patchMailTemplateSnippetSchema,
  previewEmailTemplateSchema,
  proposeEmailTemplateAiEditSchema,
  saveMailTemplateBlockSchema,
  saveEmailTemplateSchema,
  saveMailTemplatePreviewProfileSchema,
  saveMailTemplateSnippetSchema,
  testEmailTemplateRevisionSchema,
  updateEmailTemplateRevisionSourceSchema,
  type ActivateEmailTemplateInput,
  type ApproveEmailTemplateRevisionInput,
  type MailTemplateBlockQuery,
  type MailTemplateQuery,
  type MailTemplatePreviewProfileQuery,
  type MailTemplateSnippetQuery,
  type PatchMailTemplateBlockInput,
  type PatchMailTemplatePreviewProfileInput,
  type PatchEmailTemplateInput,
  type PatchMailTemplateSnippetInput,
  type PreviewEmailTemplateInput,
  type ProposeEmailTemplateAiEditInput,
  type SaveMailTemplateBlockInput,
  type SaveEmailTemplateInput,
  type SaveMailTemplatePreviewProfileInput,
  type SaveMailTemplateSnippetInput,
  type TestEmailTemplateRevisionInput,
  type UpdateEmailTemplateRevisionSourceInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { EmailTemplatesService } from './email-templates.service.js';

@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Get('workspace')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  workspace() {
    return this.templates.workspace();
  }

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  list(@Query(new ZodValidationPipe(mailTemplateQuerySchema)) query: MailTemplateQuery) {
    return this.templates.list(query);
  }

  @Get('preview-profiles')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  previewProfiles(@Query(new ZodValidationPipe(mailTemplatePreviewProfileQuerySchema)) query: MailTemplatePreviewProfileQuery) {
    return this.templates.previewProfiles(query);
  }

  @Post('preview-profiles')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  createPreviewProfile(
    @Body(new ZodValidationPipe(saveMailTemplatePreviewProfileSchema)) body: SaveMailTemplatePreviewProfileInput,
  ) {
    return this.templates.createPreviewProfile(body);
  }

  @Patch('preview-profiles/:profileId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  updatePreviewProfile(
    @Param('profileId') profileId: string,
    @Body(new ZodValidationPipe(patchMailTemplatePreviewProfileSchema)) body: PatchMailTemplatePreviewProfileInput,
  ) {
    return this.templates.updatePreviewProfile(profileId, body);
  }

  @Delete('preview-profiles/:profileId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  deletePreviewProfile(@Param('profileId') profileId: string) {
    return this.templates.deletePreviewProfile(profileId);
  }

  @Get('snippets')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  snippets(@Query(new ZodValidationPipe(mailTemplateSnippetQuerySchema)) query: MailTemplateSnippetQuery) {
    return this.templates.snippets(query);
  }

  @Post('snippets')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  createSnippet(
    @Body(new ZodValidationPipe(saveMailTemplateSnippetSchema)) body: SaveMailTemplateSnippetInput,
  ) {
    return this.templates.createSnippet(body);
  }

  @Patch('snippets/:snippetId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  updateSnippet(
    @Param('snippetId') snippetId: string,
    @Body(new ZodValidationPipe(patchMailTemplateSnippetSchema)) body: PatchMailTemplateSnippetInput,
  ) {
    return this.templates.updateSnippet(snippetId, body);
  }

  @Delete('snippets/:snippetId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  deleteSnippet(@Param('snippetId') snippetId: string) {
    return this.templates.deleteSnippet(snippetId);
  }

  @Get('blocks')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  blocks(@Query(new ZodValidationPipe(mailTemplateBlockQuerySchema)) query: MailTemplateBlockQuery) {
    return this.templates.blocks(query);
  }

  @Post('blocks')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  createBlock(
    @Body(new ZodValidationPipe(saveMailTemplateBlockSchema)) body: SaveMailTemplateBlockInput,
  ) {
    return this.templates.createBlock(body);
  }

  @Patch('blocks/:blockId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  updateBlock(
    @Param('blockId') blockId: string,
    @Body(new ZodValidationPipe(patchMailTemplateBlockSchema)) body: PatchMailTemplateBlockInput,
  ) {
    return this.templates.updateBlock(blockId, body);
  }

  @Delete('blocks/:blockId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  deleteBlock(@Param('blockId') blockId: string) {
    return this.templates.deleteBlock(blockId);
  }

  @Get('events/:eventKey')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  event(@Param('eventKey') eventKey: string) {
    return this.templates.getEvent(eventKey);
  }

  @Get('variants/:variantId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  variant(@Param('variantId') variantId: string) {
    return this.templates.get(variantId);
  }

  @Post('events/:eventKey/variants')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  createVariant(
    @Param('eventKey') eventKey: string,
    @Body(new ZodValidationPipe(saveEmailTemplateSchema)) body: SaveEmailTemplateInput,
  ) {
    return this.templates.create({ ...body, eventKey });
  }

  @Patch('variants/:variantId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  updateVariant(
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(patchEmailTemplateSchema)) body: PatchEmailTemplateInput,
  ) {
    return this.templates.update(variantId, body);
  }

  @Post('variants/:variantId/duplicate')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  duplicateVariant(@Param('variantId') variantId: string) {
    return this.templates.duplicateVariant(variantId);
  }

  @Post('events/:eventKey/activate')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplatePublish)
  activateVariant(
    @Param('eventKey') eventKey: string,
    @Body(new ZodValidationPipe(activateEmailTemplateSchema)) body: ActivateEmailTemplateInput,
  ) {
    return this.templates.activateVariant(eventKey, body);
  }

  @Post('revisions/:revisionId/duplicate')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  duplicateRevision(@Param('revisionId') revisionId: string) {
    return this.templates.duplicateRevision(revisionId);
  }

  @Patch('revisions/:revisionId/source')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  updateRevisionSource(
    @Param('revisionId') revisionId: string,
    @Body(new ZodValidationPipe(updateEmailTemplateRevisionSourceSchema)) body: UpdateEmailTemplateRevisionSourceInput,
  ) {
    return this.templates.updateRevisionSource(revisionId, body);
  }

  @Post('revisions/:revisionId/approve')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateApprove)
  approveRevision(
    @Param('revisionId') revisionId: string,
    @Body(new ZodValidationPipe(approveEmailTemplateRevisionSchema)) body: ApproveEmailTemplateRevisionInput,
  ) {
    return this.templates.approveRevision(revisionId, body);
  }

  @Post('revisions/:revisionId/publish')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplatePublish)
  publishRevision(@Param('revisionId') revisionId: string) {
    return this.templates.publishRevision(revisionId);
  }

  @Post('revisions/:revisionId/preview')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateRead)
  previewRevision(
    @Param('revisionId') revisionId: string,
    @Body(new ZodValidationPipe(previewEmailTemplateSchema)) body: PreviewEmailTemplateInput,
  ) {
    return this.templates.previewRevision(revisionId, body);
  }

  @Post('revisions/:revisionId/test-send')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  testSend(
    @Param('revisionId') revisionId: string,
    @Body(new ZodValidationPipe(testEmailTemplateRevisionSchema)) body: TestEmailTemplateRevisionInput,
  ) {
    return this.templates.testSend(revisionId, body);
  }

  @Post('revisions/:revisionId/assistant/propose')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  proposeAiEdit(
    @Param('revisionId') revisionId: string,
    @Body(new ZodValidationPipe(proposeEmailTemplateAiEditSchema)) body: ProposeEmailTemplateAiEditInput,
  ) {
    return this.templates.proposeAiEdit(revisionId, body);
  }

  @Delete('revisions/:revisionId')
  @RequirePermission(MEMBER_PERMISSIONS.mailTemplateWrite)
  deleteRevision(@Param('revisionId') revisionId: string) {
    return this.templates.deleteRevision(revisionId);
  }
}
