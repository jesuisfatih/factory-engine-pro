import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  b2bAccessQuerySchema,
  createB2BAccessRequestSchema,
  MEMBER_PERMISSIONS,
  rejectB2BAccessSchema,
  type B2BAccessQuery,
  type CreateB2BAccessRequestInput,
  type RejectB2BAccessInput,
} from '@factory-engine-pro/contracts';
import { Public } from '../../shared/public.decorator.js';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { B2BAccessService } from './b2b-access.service.js';

@Controller(['b2b-access', 'b2b-access-requests'])
export class B2BAccessController {
  constructor(private readonly service: B2BAccessService) {}

  @Public()
  @Post()
  @UseInterceptors(FileInterceptor('taxCertificate', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      callback(allowed.includes(file.mimetype) ? null : new Error('Only PDF, JPEG, PNG and WebP files are allowed'), allowed.includes(file.mimetype));
    },
  }))
  create(
    @Body(new ZodValidationPipe(createB2BAccessRequestSchema)) body: CreateB2BAccessRequestInput,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer?: Buffer },
  ) {
    return this.service.create(body, file);
  }

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.b2bAccessRead)
  list(@Query(new ZodValidationPipe(b2bAccessQuerySchema)) query: B2BAccessQuery) {
    return this.service.list(query.status);
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.b2bAccessRead)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/approve')
  @RequirePermission(MEMBER_PERMISSIONS.b2bAccessWrite)
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @Post(':id/reject')
  @RequirePermission(MEMBER_PERMISSIONS.b2bAccessWrite)
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectB2BAccessSchema)) body: RejectB2BAccessInput,
  ) {
    return this.service.reject(id, body);
  }

  @Get(':id/certificate')
  @RequirePermission(MEMBER_PERMISSIONS.b2bAccessRead)
  async certificate(@Param('id') id: string, @Res() res: Response) {
    const file = await this.service.certificate(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.send(file.buffer);
  }
}
