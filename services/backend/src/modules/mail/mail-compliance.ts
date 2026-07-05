import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

export type MarketingComplianceContext = {
  brandName: string;
  physicalAddress: string;
  preferenceCenterUrl: string;
  unsubscribeBaseUrl: string;
  tenantId: string;
  tokenSecret: string;
  tokenTtlSeconds: number;
};

export type MarketingComplianceLinkInput = {
  email: string;
  contactId?: string | null;
  customerId?: string | null;
  source: string;
};

export type MailPreferenceTokenPayload = {
  v: 1;
  tenantId: string;
  email: string;
  contactId?: string;
  customerId?: string;
  source: string;
  iat: number;
  exp: number;
};

export function marketingComplianceLinks(
  context: MarketingComplianceContext,
  input: MarketingComplianceLinkInput,
): Record<string, string> {
  const token = signMailPreferenceToken(context, input);
  const params = { t: token };
  const preferences = withQuery(context.preferenceCenterUrl, params);
  return {
    unsubscribe: withQuery(context.unsubscribeBaseUrl || context.preferenceCenterUrl, params),
    preferenceCenter: preferences,
    preference_center: preferences,
  };
}

export function verifyMailPreferenceToken(token: string, secret: string): MailPreferenceTokenPayload | null {
  const cleanToken = token.trim();
  if (!cleanToken || !secret) return null;
  const [encodedPayload, signature] = cleanToken.split('.');
  if (!encodedPayload || !signature) return null;
  const expected = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isMailPreferencePayload(payload)) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function resolveMailPreferenceSecret(config: ConfigService) {
  const configured = [
    config.get<string>('MAIL_UNSUBSCRIBE_SECRET'),
    config.get<string>('MAIL_COMPLIANCE_SECRET'),
    config.get<string>('JWT_REFRESH_SECRET'),
    config.get<string>('JWT_ACCESS_SECRET'),
    config.get<string>('JWT_SECRET'),
  ].map(textValue).find(Boolean);
  if (configured) return configured;
  return textValue(config.get<string>('NODE_ENV')) === 'production'
    ? ''
    : 'factory-engine-pro-dev-mail-compliance-secret';
}

export function resolveMailPreferenceTtlSeconds(config: ConfigService) {
  const raw = Number(config.get<string>('MAIL_UNSUBSCRIBE_TOKEN_TTL_SECONDS') ?? '');
  if (Number.isFinite(raw) && raw >= 3600) return Math.floor(raw);
  return 60 * 60 * 24 * 365;
}

export function ensureApiV1BaseUrl(baseUrl: string) {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!clean) return '';
  try {
    const parsed = new URL(clean);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (!path.endsWith('/api/v1')) {
      parsed.pathname = `${path}/api/v1`.replace(/\/{2,}/g, '/');
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  }
}

export function mailPreferenceHtmlPage(input: {
  title: string;
  heading: string;
  message: string;
  email?: string | null;
  state?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
}) {
  const emailLine = input.email
    ? `<p class="muted">Email: <strong>${escapeHtml(input.email)}</strong></p>`
    : '';
  const stateLine = input.state
    ? `<p class="muted">Current preference: <strong>${escapeHtml(input.state)}</strong></p>`
    : '';
  const action = input.actionUrl && input.actionLabel
    ? `<a class="button" href="${escapeHtml(input.actionUrl)}">${escapeHtml(input.actionLabel)}</a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f4f7fb; color: #111827; }
    main { max-width: 640px; margin: 64px auto; padding: 32px; border: 1px solid #d8e2ef; border-radius: 16px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.25; }
    p { font-size: 15px; line-height: 1.6; }
    .muted { color: #526071; }
    .button { display: inline-block; margin-top: 18px; padding: 12px 16px; border-radius: 10px; background: #0f766e; color: #fff; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(input.heading)}</h1>
    <p>${escapeHtml(input.message)}</p>
    ${emailLine}
    ${stateLine}
    ${action}
  </main>
</body>
</html>`;
}

function signMailPreferenceToken(
  context: MarketingComplianceContext,
  input: MarketingComplianceLinkInput,
) {
  if (!context.tenantId || !context.tokenSecret) {
    throw new Error('Signed mail preference links require tenant id and signing secret');
  }
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('Signed mail preference links require recipient email');
  const now = Math.floor(Date.now() / 1000);
  const payload: MailPreferenceTokenPayload = {
    v: 1,
    tenantId: context.tenantId,
    email,
    ...(input.contactId && { contactId: input.contactId }),
    ...(input.customerId && { customerId: input.customerId }),
    source: input.source || 'mail',
    iat: now,
    exp: now + context.tokenTtlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', context.tokenSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function isMailPreferencePayload(value: unknown): value is MailPreferenceTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return payload.v === 1
    && typeof payload.tenantId === 'string'
    && Boolean(payload.tenantId)
    && typeof payload.email === 'string'
    && Boolean(normalizeEmail(payload.email))
    && (payload.contactId === undefined || typeof payload.contactId === 'string')
    && (payload.customerId === undefined || typeof payload.customerId === 'string')
    && typeof payload.source === 'string'
    && Number.isFinite(payload.iat)
    && Number.isFinite(payload.exp);
}

function withQuery(url: string, params: Record<string, string>) {
  if (!url) return '';
  try {
    const next = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (value) next.searchParams.set(key, value);
    }
    return next.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    const query = new URLSearchParams(params).toString();
    return query ? `${url}${separator}${query}` : url;
  }
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
