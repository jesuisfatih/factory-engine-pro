import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../shared/public.decorator.js';
import { ShopifyWebhookIngestService } from './shopify-webhook-ingest.service.js';

@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  constructor(private readonly ingest: ShopifyWebhookIngestService) {}

  @Public()
  @Post('orders/create')
  @HttpCode(200)
  receiveOrderCreate(@Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.ingest.receive({ topic: 'orders/create', rawBody: rawBody(request), headers: normalizeHeaders(headers) });
  }

  @Public()
  @Post('orders/updated')
  @HttpCode(200)
  receiveOrderUpdate(@Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.ingest.receive({ topic: 'orders/updated', rawBody: rawBody(request), headers: normalizeHeaders(headers) });
  }
}

function rawBody(request: RawBodyRequest<Request>) {
  return request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : value ?? '']),
  );
}
