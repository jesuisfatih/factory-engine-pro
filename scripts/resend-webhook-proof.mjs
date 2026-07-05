import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.FACTORY_ENGINE_WORKSPACE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const API_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_API_URL ?? process.env.VITE_API_URL ?? 'http://127.0.0.1:4120/api/v1');
const TENANT_ID = requiredEnv('FACTORY_ENGINE_TENANT_ID');
const TENANT_SLUG = requiredEnv('FACTORY_ENGINE_TENANT_SLUG');
const WEBHOOK_SECRET = requiredEnv('FACTORY_ENGINE_RESEND_WEBHOOK_SECRET');
const RUN_ID = process.env.FACTORY_ENGINE_EVIDENCE_RUN_ID ?? timestamp();
const EVIDENCE_DIR = path.resolve(
  ROOT,
  process.env.FACTORY_ENGINE_EVIDENCE_DIR ?? path.join('docs', 'evidence', 'mail-rollout', RUN_ID),
);
const ADMIN_SESSION = readSession('FACTORY_ENGINE_ADMIN_SESSION_JSON', 'FACTORY_ENGINE_ADMIN_ACCESS_TOKEN', 'FACTORY_ENGINE_ADMIN_REFRESH_TOKEN');
const EVENT_TYPE = process.env.FACTORY_ENGINE_RESEND_PROOF_EVENT_TYPE ?? 'email.delivered';
const DELIVERY_ID = optionalEnv('FACTORY_ENGINE_RESEND_PROOF_DELIVERY_ID');
const PROVIDER_MESSAGE_ID = optionalEnv('FACTORY_ENGINE_RESEND_PROOF_PROVIDER_MESSAGE_ID');
const PROVIDER_EVENT_ID = process.env.FACTORY_ENGINE_RESEND_PROOF_EVENT_ID ?? `msg_factory_engine_${RUN_ID}`;
const RECIPIENT_EMAIL = process.env.FACTORY_ENGINE_RESEND_PROOF_RECIPIENT_EMAIL ?? 'resend-proof@example.com';
const SUBJECT = process.env.FACTORY_ENGINE_RESEND_PROOF_SUBJECT ?? 'Factory Engine Pro Resend webhook proof';
const ALLOW_UNMATCHED = process.env.FACTORY_ENGINE_RESEND_PROOF_ALLOW_UNMATCHED === '1';
const POLL_ATTEMPTS = Number(process.env.FACTORY_ENGINE_RESEND_PROOF_POLL_ATTEMPTS ?? 8);
const POLL_INTERVAL_MS = Number(process.env.FACTORY_ENGINE_RESEND_PROOF_POLL_INTERVAL_MS ?? 750);
const REQUEST_TIMEOUT_MS = Number(process.env.FACTORY_ENGINE_RESEND_PROOF_REQUEST_TIMEOUT_MS ?? 10000);

const manifest = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  status: 'pending',
  config: {
    apiUrl: API_URL,
    tenantId: TENANT_ID,
    tenantSlug: TENANT_SLUG,
    eventType: EVENT_TYPE,
    providerEventId: PROVIDER_EVENT_ID,
    providerMessageId: PROVIDER_MESSAGE_ID,
    deliveryId: DELIVERY_ID,
    allowUnmatched: ALLOW_UNMATCHED,
    evidenceDir: EVIDENCE_DIR,
    hasAdminSession: Boolean(ADMIN_SESSION?.accessToken),
    hasWebhookSecret: Boolean(WEBHOOK_SECRET),
  },
  post: null,
  verification: null,
  errors: [],
};

try {
  assertValidSecret(WEBHOOK_SECRET);
  if (!ADMIN_SESSION?.accessToken) {
    throw new Error('Admin session is required. Set FACTORY_ENGINE_ADMIN_SESSION_JSON or FACTORY_ENGINE_ADMIN_ACCESS_TOKEN.');
  }

  const deliveryProof = await resolveDeliveryProof();
  const providerMessageId = PROVIDER_MESSAGE_ID ?? deliveryProof?.providerMessageId;
  if (!providerMessageId) {
    throw new Error('Set FACTORY_ENGINE_RESEND_PROOF_PROVIDER_MESSAGE_ID, or set FACTORY_ENGINE_RESEND_PROOF_DELIVERY_ID for a delivery with providerMessageId.');
  }

  const rawBody = JSON.stringify({
    type: EVENT_TYPE,
    created_at: new Date().toISOString(),
    data: {
      email_id: providerMessageId,
      to: [RECIPIENT_EMAIL],
      subject: SUBJECT,
    },
  });
  const headers = signedSvixHeaders(rawBody, PROVIDER_EVENT_ID, WEBHOOK_SECRET);
  const postResult = await postWebhook(rawBody, headers);
  manifest.post = redactPost(postResult);
  if (!postResult.ok) {
    throw new Error(`Webhook POST failed with HTTP ${postResult.status}: ${safeError(postResult.bodyText, postResult.body)}`);
  }

  const eventProof = await pollProviderEvent(providerMessageId);
  manifest.verification = eventProof;
  const row = eventProof?.row;
  if (!row) {
    throw new Error(`Provider event row was not found for providerMessageId=${providerMessageId}.`);
  }
  if (row.providerEventId !== PROVIDER_EVENT_ID) {
    throw new Error(`Provider event id mismatch. Expected ${PROVIDER_EVENT_ID}, received ${row.providerEventId}.`);
  }
  if (row.eventType !== EVENT_TYPE) {
    throw new Error(`Provider event type mismatch. Expected ${EVENT_TYPE}, received ${row.eventType}.`);
  }
  if (!ALLOW_UNMATCHED && !row.proof?.matchedDelivery) {
    throw new Error('Provider event was stored but did not match a MailDelivery. Set FACTORY_ENGINE_RESEND_PROOF_ALLOW_UNMATCHED=1 only for storage-only proof.');
  }
  if (DELIVERY_ID && row.deliveryId !== DELIVERY_ID) {
    throw new Error(`Provider event matched delivery ${row.deliveryId ?? 'null'} instead of expected ${DELIVERY_ID}.`);
  }

  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const outputPath = path.join(EVIDENCE_DIR, 'resend-webhook-proof.json');
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Resend webhook proof manifest: ${outputPath}`);
  console.log(`Status: ${manifest.status}`);
  if (manifest.errors.length) {
    for (const error of manifest.errors) console.error(`- ${error}`);
  }
}

async function resolveDeliveryProof() {
  if (!DELIVERY_ID) return null;
  const response = await adminGet(`/mail/deliveries/${encodeURIComponent(DELIVERY_ID)}`);
  if (!response.ok) {
    throw new Error(`Delivery lookup failed for ${DELIVERY_ID}: HTTP ${response.status} ${safeError(response.bodyText, response.body)}`);
  }
  const providerMessageId = typeof response.body?.providerMessageId === 'string' && response.body.providerMessageId.trim()
    ? response.body.providerMessageId.trim()
    : null;
  return {
    id: response.body?.id ?? DELIVERY_ID,
    providerMessageId,
    status: response.body?.status ?? null,
    eventKey: response.body?.eventKey ?? null,
    category: response.body?.category ?? null,
  };
}

async function postWebhook(rawBody, headers) {
  const response = await fetch(`${API_URL}/webhooks/resend/${encodeURIComponent(TENANT_SLUG)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...headers,
      'content-type': 'application/json',
      'user-agent': 'factory-engine-resend-webhook-proof/1.0',
    },
    body: rawBody,
  });
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? null,
    bodyText,
    body: parseMaybeJson(bodyText),
  };
}

async function pollProviderEvent(providerMessageId) {
  let last = null;
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const response = await adminGet(`/mail/provider-events?providerMessageId=${encodeURIComponent(providerMessageId)}&limit=10`);
    if (!response.ok) {
      throw new Error(`Provider event verification failed: HTTP ${response.status} ${safeError(response.bodyText, response.body)}`);
    }
    const rows = Array.isArray(response.body?.data) ? response.body.data : [];
    const row = rows.find((entry) => entry?.providerEventId === PROVIDER_EVENT_ID) ?? null;
    last = {
      attempt,
      httpStatus: response.status,
      meta: response.body?.meta ?? null,
      row: row ? publicProviderEvent(row) : null,
    };
    if (row) return last;
    await sleep(POLL_INTERVAL_MS);
  }
  return last;
}

async function adminGet(requestPath) {
  const response = await fetch(`${API_URL}${requestPath}`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${ADMIN_SESSION.accessToken}`,
      'x-tenant-id': TENANT_ID,
    },
  });
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    bodyText,
    body: parseMaybeJson(bodyText),
  };
}

function signedSvixHeaders(rawBody, svixId, webhookSecret) {
  const timestampSeconds = String(Math.floor(Date.now() / 1000));
  const secretPart = webhookSecret.slice('whsec_'.length);
  const signature = createHmac('sha256', Buffer.from(secretPart, 'base64'))
    .update(`${svixId}.${timestampSeconds}.${rawBody}`)
    .digest('base64');
  return {
    'svix-id': svixId,
    'svix-timestamp': timestampSeconds,
    'svix-signature': `v1,${signature}`,
  };
}

function publicProviderEvent(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    providerMessageId: row.providerMessageId,
    deliveryId: row.deliveryId,
    eventType: row.eventType,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    ignoredReason: row.ignoredReason,
    delivery: row.delivery
      ? {
        id: row.delivery.id,
        status: row.delivery.status,
        eventKey: row.delivery.eventKey,
        category: row.delivery.category,
        providerMessageId: row.delivery.providerMessageId,
      }
      : null,
    proof: row.proof,
  };
}

function redactPost(result) {
  return {
    ok: result.ok,
    status: result.status,
    requestId: result.requestId,
    body: result.body,
  };
}

function readSession(sessionEnv, accessEnv, refreshEnv) {
  const rawSession = process.env[sessionEnv];
  if (rawSession) {
    try {
      const parsed = JSON.parse(rawSession);
      if (typeof parsed?.accessToken === 'string') return parsed;
    } catch (error) {
      throw new Error(`${sessionEnv} must be valid JSON with accessToken. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const accessToken = process.env[accessEnv];
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: process.env[refreshEnv] ?? '',
  };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function assertValidSecret(secret) {
  if (!secret.startsWith('whsec_')) throw new Error('FACTORY_ENGINE_RESEND_WEBHOOK_SECRET must start with whsec_.');
  const secretPart = secret.slice('whsec_'.length);
  if (!secretPart) throw new Error('FACTORY_ENGINE_RESEND_WEBHOOK_SECRET is missing the base64 secret body.');
  const decoded = Buffer.from(secretPart, 'base64');
  if (decoded.length === 0) throw new Error('FACTORY_ENGINE_RESEND_WEBHOOK_SECRET base64 body is invalid.');
}

function parseMaybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeError(text, body) {
  if (body && typeof body === 'object') {
    const message = body.message ?? body.error ?? body.reason;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return String(text ?? '').slice(0, 500);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}
