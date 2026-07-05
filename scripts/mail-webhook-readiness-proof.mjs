import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.FACTORY_ENGINE_WORKSPACE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const API_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_API_URL ?? process.env.VITE_API_URL ?? 'http://127.0.0.1:4120/api/v1');
const TENANT_ID = process.env.FACTORY_ENGINE_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'ten_remote_test';
const RUN_ID = process.env.FACTORY_ENGINE_EVIDENCE_RUN_ID ?? timestamp();
const EVIDENCE_DIR = path.resolve(
  ROOT,
  process.env.FACTORY_ENGINE_EVIDENCE_DIR ?? path.join('docs', 'evidence', 'mail-rollout', RUN_ID),
);
const ADMIN_SESSION = readSession('FACTORY_ENGINE_ADMIN_SESSION_JSON', 'FACTORY_ENGINE_ADMIN_ACCESS_TOKEN', 'FACTORY_ENGINE_ADMIN_REFRESH_TOKEN');
const OUTBOUND_KILL_SWITCH = enabled(process.env.MAIL_MARKETING_OUTBOUND_WEBHOOKS_ENABLED);
const STRICT_READY = process.env.FACTORY_ENGINE_WEBHOOK_READINESS_REQUIRE_READY === '1';
const REQUEST_TIMEOUT_MS = Number(process.env.FACTORY_ENGINE_WEBHOOK_READINESS_TIMEOUT_MS ?? 10000);

const manifest = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  status: 'pending',
  config: {
    apiUrl: API_URL,
    tenantId: TENANT_ID,
    evidenceDir: EVIDENCE_DIR,
    hasAdminSession: Boolean(ADMIN_SESSION?.accessToken),
    outboundKillSwitchEnabled: OUTBOUND_KILL_SWITCH,
    strictReadyRequired: STRICT_READY,
  },
  destinations: [],
  summary: {
    total: 0,
    readyForLiveConnector: 0,
    blockedLiveRequests: 0,
    proofOnly: 0,
    disabled: 0,
    missingSecret: 0,
    invalidApproval: 0,
  },
  errors: [],
};

try {
  if (!ADMIN_SESSION?.accessToken) {
    throw new Error('Admin session is required. Set FACTORY_ENGINE_ADMIN_SESSION_JSON or FACTORY_ENGINE_ADMIN_ACCESS_TOKEN.');
  }
  const response = await adminGet('/mail-marketing/flows/webhook-destinations');
  if (!response.ok) {
    throw new Error(`Webhook destination lookup failed: HTTP ${response.status} ${safeError(response.bodyText, response.body)}`);
  }
  const rows = Array.isArray(response.body) ? response.body : [];
  manifest.destinations = rows.map(classifyDestination);
  manifest.summary = summarize(manifest.destinations);
  const failures = readinessFailures(manifest.destinations);
  if (STRICT_READY && failures.length > 0) {
    throw new Error(`Webhook readiness failed: ${failures.join('; ')}`);
  }
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const outputPath = path.join(EVIDENCE_DIR, 'mail-webhook-readiness-proof.json');
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Mail webhook readiness proof manifest: ${outputPath}`);
  console.log(`Status: ${manifest.status}`);
  if (manifest.errors.length) {
    for (const error of manifest.errors) console.error(`- ${error}`);
  }
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

function classifyDestination(row) {
  const executionMode = row.executionMode === 'live_requested' ? 'live_requested' : 'proof_only';
  const status = row.status === 'active' ? 'active' : 'disabled';
  const exactApproval = Boolean(row.liveApproved && row.liveAllowlistedUrl && row.liveAllowlistedUrl === row.url);
  const headerSecretReady = row.authType !== 'header' || Boolean(row.hasSecret && row.secretHeaderName);
  const readyForLiveConnector = status === 'active'
    && executionMode === 'live_requested'
    && exactApproval
    && headerSecretReady
    && OUTBOUND_KILL_SWITCH;
  const blockers = [];
  if (status !== 'active') blockers.push('destination_disabled');
  if (executionMode !== 'live_requested') blockers.push('proof_only_mode');
  if (!exactApproval && executionMode === 'live_requested') blockers.push('exact_live_approval_missing_or_stale');
  if (!headerSecretReady) blockers.push('header_secret_missing');
  if (!OUTBOUND_KILL_SWITCH && executionMode === 'live_requested' && exactApproval) blockers.push('runtime_kill_switch_disabled');
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    urlHash: typeof row.url === 'string' ? hashString(row.url) : null,
    status,
    authType: row.authType === 'header' ? 'header' : 'none',
    hasSecret: Boolean(row.hasSecret),
    secretHeaderNamePresent: Boolean(row.secretHeaderName),
    executionMode,
    liveApproved: Boolean(row.liveApproved),
    liveApprovedAt: row.liveApprovedAt ?? null,
    liveAllowlistedUrlHash: typeof row.liveAllowlistedUrl === 'string' ? hashString(row.liveAllowlistedUrl) : null,
    exactApproval,
    timeoutMs: row.timeoutMs ?? null,
    readyForLiveConnector,
    readiness: readyForLiveConnector
      ? 'ready'
      : status !== 'active'
        ? 'disabled'
        : executionMode === 'proof_only'
          ? 'proof_only'
          : 'blocked',
    blockers,
  };
}

function summarize(destinations) {
  return {
    total: destinations.length,
    readyForLiveConnector: destinations.filter((item) => item.readyForLiveConnector).length,
    blockedLiveRequests: destinations.filter((item) => item.readiness === 'blocked').length,
    proofOnly: destinations.filter((item) => item.readiness === 'proof_only').length,
    disabled: destinations.filter((item) => item.readiness === 'disabled').length,
    missingSecret: destinations.filter((item) => item.blockers.includes('header_secret_missing')).length,
    invalidApproval: destinations.filter((item) => item.blockers.includes('exact_live_approval_missing_or_stale')).length,
  };
}

function readinessFailures(destinations) {
  return destinations
    .filter((item) => item.executionMode === 'live_requested' && !item.readyForLiveConnector)
    .map((item) => `${item.slug || item.id}: ${item.blockers.join(', ') || 'not ready'}`);
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

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

function enabled(value) {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}
