import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  MEMBER_PERMISSIONS,
  mailTemplateQuerySchema,
  patchEmailTemplateSchema,
  previewEmailTemplateSchema,
  saveEmailTemplateSchema,
  type MailTemplateQuery,
  type PatchEmailTemplateInput,
  type PreviewEmailTemplateInput,
  type SaveEmailTemplateInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { EmailTemplatesService } from './email-templates.service.js';

@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Get('workspace')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  workspace() {
    return this.templates.workspace();
  }

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  list(@Query(new ZodValidationPipe(mailTemplateQuerySchema)) query: MailTemplateQuery) {
    return this.templates.list(query);
  }

  @Get('events/:eventKey')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  event(@Param('eventKey') eventKey: string) {
    return this.templates.getEvent(eventKey);
  }

  @Get('variants/:variantId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  variant(@Param('variantId') variantId: string) {
    return this.templates.get(variantId);
  }

  @Post('events/:eventKey/variants')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  createVariant(
    @Param('eventKey') eventKey: string,
    @Body(new ZodValidationPipe(saveEmailTemplateSchema)) body: SaveEmailTemplateInput,
  ) {
    return this.templates.create({ ...body, eventKey });
  }

  @Patch('variants/:variantId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateVariant(
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(patchEmailTemplateSchema)) body: PatchEmailTemplateInput,
  ) {
    return this.templates.update(variantId, body);
  }

  @Post('revisions/:revisionId/publish')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  publishRevision(@Param('revisionId') revisionId: string) {
    return this.templates.publishRevision(revisionId);
  }

  @Post('revisions/:revisionId/preview')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  previewRevision(
    @Param('revisionId') revisionId: string,
    @Body(new ZodValidationPipe(previewEmailTemplateSchema)) body: PreviewEmailTemplateInput,
  ) {
    return this.templates.previewRevision(revisionId, body);
  }

  @Post('revisions/:revisionId/test-send')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  testSend(@Param('revisionId') revisionId: string) {
    return this.templates.testSend(revisionId);
  }

  @Delete('revisions/:revisionId')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  deleteRevision(@Param('revisionId') revisionId: string) {
    return {
      revisionId,
      deleted: false,
      message: 'Revision delete is not enabled in the transfer foundation; archive the template instead.',
    };
  }
}
