import { Body, Controller, Get, Post } from '@nestjs/common';
import { MEMBER_PERMISSIONS, transcriptResolverTestSchema, type TranscriptResolverTestInput } from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { AiService } from './ai.service.js';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  health() {
    return this.ai.health();
  }

  @Get('resolver-prompt')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  resolverPrompt() {
    return this.ai.resolverPromptPreview();
  }

  @Post('transcript-resolver/test')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  resolveTranscriptTest(@Body(new ZodValidationPipe(transcriptResolverTestSchema)) body: TranscriptResolverTestInput) {
    return this.ai.resolveTranscriptTest(body);
  }
}
