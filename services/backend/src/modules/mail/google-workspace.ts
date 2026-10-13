export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

export interface GoogleWorkspaceCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
}

export interface GoogleWorkspaceMailInput {
  fromName: string;
  senderEmail: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
}

export function googleOAuthRefreshBody(credentials: Pick<GoogleWorkspaceCredentials, 'clientId' | 'clientSecret' | 'refreshToken'>) {
  return new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token',
  });
}

export function buildGoogleWorkspaceRawMessage(input: GoogleWorkspaceMailInput) {
  const boundary = `factory-engine-${cryptoSafeToken(input.to, input.subject)}`;
  const text = input.text?.trim() || stripHtml(input.html);
  const headers = [
    `From: ${encodedDisplayName(input.fromName)} <${safeHeader(input.senderEmail)}>`,
    `To: ${safeHeader(input.to)}`,
    ...(input.replyTo ? [`Reply-To: ${safeHeader(input.replyTo)}`] : []),
    `Subject: ${encodedHeader(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(input.html, 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from([...headers, '', ...body].join('\r\n'), 'utf8').toString('base64url');
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodedHeader(value: string) {
  const safe = safeHeader(value);
  return /[^\x20-\x7E]/.test(safe) ? `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=` : safe;
}

function encodedDisplayName(value: string) {
  const safe = safeHeader(value).replace(/"/g, '\\"');
  return /[^\x20-\x7E]/.test(safe)
    ? `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`
    : `"${safe}"`;
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function stripHtml(value: string) {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cryptoSafeToken(...parts: string[]) {
  return Buffer.from(parts.join('|'), 'utf8').toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'message';
}
