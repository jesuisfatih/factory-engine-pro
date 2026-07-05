import { Controller, HttpCode, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../shared/public.decorator.js';
import { MailService } from './mail.service.js';

@Controller('webhooks/resend')
export class MailWebhookController {
  constructor(private readonly mail: MailService) {}

  @Public()
  @Post(':tenantSlug')
  @HttpCode(200)
  receive(@Param('tenantSlug') tenantSlug: string, @Req() request: RawBodyRequest<Request>) {
    const rawBody = request.rawBody?.toString('utf8');
    return this.mail.receiveResendWebhook({
      tenantSlug,
      rawBody: rawBody ?? JSON.stringify(request.body ?? {}),
      headers: normalizeHeaders(request.headers),
    });
  }
}

function normalizeHeaders(headers: Request['headers']) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : value ?? '']),
  );
}
