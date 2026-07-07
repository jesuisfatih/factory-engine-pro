import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../../shared/public.decorator.js';
import { StorefrontFormsService, type StorefrontUploadFile } from './storefront-forms.service.js';

@Public()
@Controller(['storefront-forms/public', 'storefront/forms/public'])
export class StorefrontFormsPublicController {
  constructor(private readonly storefrontForms: StorefrontFormsService) {}

  @Get(':handle')
  getForm(@Param('handle') handle: string, @Query('shop') shop?: string) {
    return this.storefrontForms.getPublicForm(handle, { shop });
  }

  @Post(':handle/submit')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024 } }))
  async submitForm(
    @Param('handle') handle: string,
    @Query('shop') shop: string | undefined,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: StorefrontUploadFile[] | undefined,
    @Res() response: Response,
  ) {
    try {
      const result = await this.storefrontForms.submitPublicForm(handle, { shop }, body, files ?? []);
      return response.json(result);
    } catch (error) {
      const status = statusCode(error);
      return response.status(status).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to submit form',
      });
    }
  }
}

function statusCode(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; getStatus?: () => unknown };
    if (typeof candidate.status === 'number') return candidate.status;
    if (typeof candidate.getStatus === 'function') {
      const status = candidate.getStatus();
      if (typeof status === 'number') return status;
    }
  }
  return HttpStatus.BAD_REQUEST;
}
