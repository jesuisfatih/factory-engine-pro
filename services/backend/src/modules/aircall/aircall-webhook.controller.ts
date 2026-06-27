import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { Public } from '../../shared/public.decorator.js';
import { AircallIngestService } from './aircall-ingest.service.js';

@Controller('webhooks/aircall')
export class AircallWebhookController {
  constructor(private readonly ingest: AircallIngestService) {}

  @Public()
  @Post(':tenantSlug')
  @HttpCode(200)
  receive(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.ingest.receiveWebhook({
      tenantSlug,
      payload: body ?? {},
      headers: normalizeHeaders(headers),
      signature: headerValue(headers['x-aircall-signature']) ?? null,
    });
  }
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, headerValue(value) ?? '']),
  );
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(',') : value;
}
