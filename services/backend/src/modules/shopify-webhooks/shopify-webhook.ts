import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function verifyShopifyWebhookHmac(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature?.trim()) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const actualBuffer = Buffer.from(signature.trim(), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function shopifyWebhookDedupeKey(topic: string, rawBody: string, webhookId?: string | null) {
  const id = webhookId?.trim();
  return id
    ? `shopify:${topic}:${id}`
    : `shopify:${topic}:sha256:${createHash('sha256').update(rawBody).digest('hex')}`;
}

export function safeShopifyWebhookHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !['authorization', 'cookie', 'x-shopify-hmac-sha256'].includes(name.toLowerCase())),
  );
}
