import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.FACTORY_ENGINE_WORKSPACE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const RUN_ID = process.env.FACTORY_ENGINE_EVIDENCE_RUN_ID ?? null;
const EVIDENCE_BASE = path.resolve(ROOT, 'docs', 'evidence', 'mail-rollout');
const EVIDENCE_DIR = await resolveEvidenceDir();
const SKIP_RESEND = process.env.FACTORY_ENGINE_SIGNOFF_SKIP_RESEND_WEBHOOK === '1';
const SKIP_WEBHOOK_READINESS = process.env.FACTORY_ENGINE_SIGNOFF_SKIP_WEBHOOK_READINESS === '1';
const REQUIRE_RESEND = !SKIP_RESEND;
const REQUIRE_WEBHOOK_READINESS = !SKIP_WEBHOOK_READINESS;
const REQUIRE_OUTBOUND_WEBHOOK_READY = process.env.FACTORY_ENGINE_SIGNOFF_REQUIRE_OUTBOUND_WEBHOOK_READY === '1';
const REQUIRED_BROWSER_THEMES = ['light', 'dark'];
const REQUIRED_BROWSER_VIEWPORTS = ['desktop', 'mobile'];
const DEFAULT_TEST_TENANTS = new Set(['ten_remote_test', 'ten_test', 'ten_local']);
const RESEND_WEBHOOK_DEFERRAL = readDeferral(
  'resend-webhook-proof',
  'FACTORY_ENGINE_SIGNOFF_RESEND_WEBHOOK_DEFER_REASON',
  'FACTORY_ENGINE_SIGNOFF_RESEND_WEBHOOK_DEFER_APPROVED_BY',
);
const WEBHOOK_READINESS_DEFERRAL = readDeferral(
  'mail-webhook-readiness-proof',
  'FACTORY_ENGINE_SIGNOFF_WEBHOOK_READINESS_DEFER_REASON',
  'FACTORY_ENGINE_SIGNOFF_WEBHOOK_READINESS_DEFER_APPROVED_BY',
);

const signoff = {
  generatedAt: new Date().toISOString(),
  status: 'pending',
  evidenceDir: EVIDENCE_DIR,
  config: {
    requireResendWebhookProof: REQUIRE_RESEND,
    requireWebhookReadinessProof: REQUIRE_WEBHOOK_READINESS,
    requireOutboundWebhookReady: REQUIRE_OUTBOUND_WEBHOOK_READY,
    resendWebhookDeferred: SKIP_RESEND,
    webhookReadinessDeferred: SKIP_WEBHOOK_READINESS,
  },
  checks: [],
  summary: {
    passed: 0,
    failed: 0,
  },
};

await main();

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await checkRolloutManifest();
  if (REQUIRE_RESEND) await checkResendWebhookProof();
  else addDeferralCheck(RESEND_WEBHOOK_DEFERRAL);
  if (REQUIRE_WEBHOOK_READINESS) await checkWebhookReadinessProof();
  else addDeferralCheck(WEBHOOK_READINESS_DEFERRAL);
  summarize();
  const outputPath = path.join(EVIDENCE_DIR, 'mail-rollout-signoff.json');
  await writeFile(outputPath, `${JSON.stringify(signoff, null, 2)}\n`, 'utf8');
  console.log(`Mail rollout signoff manifest: ${outputPath}`);
  console.log(`Status: ${signoff.status}`);
  if (signoff.status !== 'passed') process.exitCode = 1;
}

async function checkRolloutManifest() {
  const manifest = await readEvidenceJson('manifest.json', true);
  if (!manifest) return;
  const requiredApi = [
    ['system_mail', 'settings'],
    ['system_mail', 'health'],
    ['system_mail', 'delivery_log'],
    ['system_mail', 'provider_events'],
    ['system_mail', 'suppression'],
    ['system_mail', 'dlq'],
    ['mail_template', 'workspace'],
    ['mail_template', 'templates'],
    ['mail_marketing', 'overview'],
    ['mail_marketing', 'settings'],
    ['mail_marketing', 'audiences'],
    ['mail_marketing', 'campaigns'],
    ['mail_marketing', 'flows'],
    ['mail_marketing', 'webhook_destinations'],
    ['mail_marketing', 'analytics_funnel'],
    ['mail_marketing', 'analytics_cohorts'],
    ['customer_portal', 'orders'],
    ['customer_portal', 'invoices'],
    ['customer_portal', 'reorder_templates'],
    ['customer_portal', 'active_cart'],
    ['customer_portal', 'documents'],
    ['shopify_customer_account', 'customer_account_context'],
  ];
  const requiredBrowser = [
    'admin-system-mail',
    'admin-mail-template-release-lane',
    'admin-mail-marketing-recipient-room',
    'accounts-orders',
    'accounts-reorder',
    'accounts-invoices',
    'accounts-cart',
    'accounts-documents',
  ];
  const failures = [];
  if (manifest.summary?.status !== 'passed') failures.push(`rollout manifest status is ${manifest.summary?.status ?? 'missing'}`);
  failures.push(...liveEvidenceConfigFailures(manifest.config));
  const customerCopy = manifest.copy?.find((entry) => entry.id === 'customer-facing-copy');
  if (!customerCopy) {
    failures.push('missing customer-facing copy proof');
  } else if (customerCopy.status !== 'passed') {
    failures.push(`customer-facing copy proof is ${customerCopy.status}`);
  } else if ((customerCopy.proof?.violationCount ?? 0) !== 0) {
    failures.push(`customer-facing copy proof found ${customerCopy.proof.violationCount} forbidden visible term(s)`);
  }
  const customerContract = manifest.contract?.find((entry) => entry.id === 'customer-response-contract');
  if (!customerContract) {
    failures.push('missing customer response contract proof');
  } else if (customerContract.status !== 'passed') {
    failures.push(`customer response contract proof is ${customerContract.status}`);
  } else if ((customerContract.proof?.violationCount ?? 0) !== 0) {
    failures.push(`customer response contract proof found ${customerContract.proof.violationCount} forbidden field(s)`);
  }
  for (const [module, name] of requiredApi) {
    const probe = manifest.api?.find((entry) => entry.module === module && entry.name === name);
    if (!probe) failures.push(`missing API probe ${module}.${name}`);
    else if (probe.status !== 'passed') failures.push(`API probe ${module}.${name} is ${probe.status}`);
    else if (module === 'customer_portal' || module === 'shopify_customer_account') {
      const safety = probe.assertion?.customerSafePayload;
      if (!safety?.checked) {
        failures.push(`API probe ${module}.${name} is missing customer-safe payload assertion`);
      } else if (safety.leakCount !== 0) {
        failures.push(`API probe ${module}.${name} found ${safety.leakCount} customer payload leak(s)`);
      }
      if (module === 'customer_portal' && (name === 'orders' || name === 'invoices')) {
        const expectedFollowUp = name === 'orders' ? 'order_detail' : 'invoice_detail';
        const followUp = probe.followUps?.find((entry) => entry.name === expectedFollowUp);
        if (!followUp) {
          failures.push(`API probe ${module}.${name} is missing dependent ${expectedFollowUp} proof`);
        } else if (followUp.status !== 'passed') {
          failures.push(`API probe ${module}.${name} dependent ${expectedFollowUp} proof is ${followUp.status}`);
        } else {
          const detailSafety = followUp.assertion?.customerSafePayload;
          if (!detailSafety?.checked) {
            failures.push(`API probe ${module}.${name} dependent ${expectedFollowUp} is missing customer-safe payload assertion`);
          } else if (detailSafety.leakCount !== 0) {
            failures.push(`API probe ${module}.${name} dependent ${expectedFollowUp} found ${detailSafety.leakCount} customer payload leak(s)`);
          }
        }
      }
    }
  }
  for (const surface of requiredBrowser) {
    const captures = manifest.browser?.filter((entry) => entry.surface === surface) ?? [];
    if (captures.length === 0) {
      failures.push(`missing browser proof ${surface}`);
    } else {
      for (const theme of REQUIRED_BROWSER_THEMES) {
        for (const viewport of REQUIRED_BROWSER_VIEWPORTS) {
          const capture = captures.find((entry) => entry.theme === theme && entry.viewport === viewport);
          const combo = `${surface}.${theme}.${viewport}`;
          if (!capture) {
            failures.push(`missing browser proof ${combo}`);
            continue;
          }
          if (capture.status !== 'passed') failures.push(`browser proof ${combo} is ${capture.status}`);
          if (!await screenshotExists(capture.screenshot)) failures.push(`browser proof ${combo} screenshot is missing`);
          if (surface.startsWith('accounts-')) {
            if (!capture.customerFacingCopy?.checked) failures.push(`browser proof ${combo} is missing rendered customer-facing copy check`);
            if ((capture.customerFacingCopy?.violationCount ?? 0) > 0) failures.push(`browser proof ${combo} found rendered customer-facing copy violations`);
          }
        }
      }
    }
  }
  addCheck({
    id: 'mail-rollout-manifest',
    file: 'manifest.json',
    status: failures.length === 0 ? 'passed' : 'failed',
    proof: {
      summary: manifest.summary ?? null,
      liveEvidence: liveEvidenceProof(manifest.config),
      apiCount: Array.isArray(manifest.api) ? manifest.api.length : 0,
      copyCount: Array.isArray(manifest.copy) ? manifest.copy.length : 0,
      contractCount: Array.isArray(manifest.contract) ? manifest.contract.length : 0,
      browserCount: Array.isArray(manifest.browser) ? manifest.browser.length : 0,
      requiredBrowserCaptures: requiredBrowser.length * REQUIRED_BROWSER_THEMES.length * REQUIRED_BROWSER_VIEWPORTS.length,
    },
    failures,
  });
}

async function checkResendWebhookProof() {
  const proof = await readEvidenceJson('resend-webhook-proof.json', true);
  if (!proof) return;
  const failures = [];
  const matchedDelivery = Boolean(proof.verification?.row?.proof?.matchedDelivery);
  if (proof.status !== 'passed') failures.push(`resend webhook proof status is ${proof.status ?? 'missing'}`);
  if (!proof.post?.ok) failures.push('signed Resend webhook POST did not succeed');
  if (!proof.verification?.row) failures.push('stored provider event row is missing');
  if (!matchedDelivery) failures.push('stored provider event is not matched to a MailDelivery');
  addCheck({
    id: 'resend-webhook-proof',
    file: 'resend-webhook-proof.json',
    status: failures.length === 0 ? 'passed' : 'failed',
    proof: {
      eventType: proof.config?.eventType ?? proof.verification?.row?.eventType ?? null,
      providerEventId: proof.config?.providerEventId ?? proof.verification?.row?.providerEventId ?? null,
      deliveryId: proof.verification?.row?.deliveryId ?? null,
      matchedDelivery,
    },
    failures,
  });
}

async function checkWebhookReadinessProof() {
  const proof = await readEvidenceJson('mail-webhook-readiness-proof.json', true);
  if (!proof) return;
  const failures = [];
  if (proof.status !== 'passed') failures.push(`webhook readiness proof status is ${proof.status ?? 'missing'}`);
  if (REQUIRE_OUTBOUND_WEBHOOK_READY && (proof.summary?.blockedLiveRequests ?? 0) > 0) {
    failures.push(`${proof.summary.blockedLiveRequests} live-requested webhook destination(s) are blocked`);
  }
  if (REQUIRE_OUTBOUND_WEBHOOK_READY && (proof.summary?.readyForLiveConnector ?? 0) === 0) {
    failures.push('no webhook destination is ready for live connector');
  }
  addCheck({
    id: 'mail-webhook-readiness-proof',
    file: 'mail-webhook-readiness-proof.json',
    status: failures.length === 0 ? 'passed' : 'failed',
    proof: {
      summary: proof.summary ?? null,
      outboundKillSwitchEnabled: proof.config?.outboundKillSwitchEnabled ?? null,
    },
    failures,
  });
}

function addDeferralCheck(deferral) {
  const failures = [];
  if (!deferral.reason || deferral.reason.length < 12) failures.push(`${deferral.id} deferral reason is missing or too short`);
  if (!deferral.approvedBy) failures.push(`${deferral.id} deferral approved_by is missing`);
  addCheck({
    id: `${deferral.id}-deferred`,
    file: null,
    status: failures.length === 0 ? 'passed' : 'failed',
    proof: {
      deferred: true,
      reason: deferral.reason || null,
      approvedBy: deferral.approvedBy || null,
      requiredEnv: {
        reason: deferral.reasonEnv,
        approvedBy: deferral.approvedByEnv,
      },
    },
    failures,
  });
}

async function readEvidenceJson(file, required) {
  const filePath = path.join(EVIDENCE_DIR, file);
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (required) {
      addCheck({
        id: file.replace(/\.json$/, ''),
        file,
        status: 'failed',
        proof: null,
        failures: [`${file} is missing or invalid: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
    return null;
  }
}

function readDeferral(id, reasonEnv, approvedByEnv) {
  return {
    id,
    reasonEnv,
    approvedByEnv,
    reason: (process.env[reasonEnv] ?? '').trim(),
    approvedBy: (process.env[approvedByEnv] ?? '').trim(),
  };
}

async function screenshotExists(screenshot) {
  if (typeof screenshot !== 'string' || screenshot.trim().length === 0) return false;
  const filePath = path.isAbsolute(screenshot) ? screenshot : path.resolve(ROOT, screenshot);
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function liveEvidenceConfigFailures(config) {
  const failures = [];
  if (!config || typeof config !== 'object') return ['manifest config is missing'];
  const tenantId = typeof config.tenantId === 'string' ? config.tenantId.trim() : '';
  if (!tenantId) failures.push('manifest tenantId is missing');
  else if (DEFAULT_TEST_TENANTS.has(tenantId)) failures.push(`manifest tenantId ${tenantId} is a default test tenant`);
  for (const [key, label] of [
    ['apiUrl', 'API URL'],
    ['adminUrl', 'Admin URL'],
    ['accountsUrl', 'Accounts URL'],
  ]) {
    const reason = liveUrlFailure(config[key]);
    if (reason) failures.push(`manifest ${label} is not live evidence: ${reason}`);
  }
  if (config.browserProofSkipped === true) failures.push('browser proof was skipped');
  if (config.hasAdminSession !== true) failures.push('admin session was not present during rollout proof');
  if (config.hasAccountsSession !== true) failures.push('accounts session was not present during rollout proof');
  if (config.hasCustomerAccountSession !== true) failures.push('Shopify Customer Account session was not present during rollout proof');
  return failures;
}

function liveEvidenceProof(config) {
  if (!config || typeof config !== 'object') return { checked: false };
  return {
    checked: true,
    tenantId: config.tenantId ?? null,
    apiUrl: redactUrl(config.apiUrl),
    adminUrl: redactUrl(config.adminUrl),
    accountsUrl: redactUrl(config.accountsUrl),
    browserProofSkipped: config.browserProofSkipped ?? null,
    hasAdminSession: config.hasAdminSession === true,
    hasAccountsSession: config.hasAccountsSession === true,
    hasCustomerAccountSession: config.hasCustomerAccountSession === true,
  };
}

function liveUrlFailure(value) {
  if (typeof value !== 'string' || !value.trim()) return 'missing URL';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return 'invalid URL';
  }
  if (parsed.protocol !== 'https:') return 'URL must use https';
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '[::1]' || hostname === '::1') return 'local hostname';
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) {
    return 'private/local network hostname';
  }
  if (hostname.endsWith('.local') || hostname.endsWith('.test') || hostname.endsWith('.localhost')) return 'local/test hostname';
  return null;
}

function redactUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '(invalid URL)';
  }
}

function addCheck(check) {
  signoff.checks.push(check);
}

function summarize() {
  signoff.summary.passed = signoff.checks.filter((check) => check.status === 'passed').length;
  signoff.summary.failed = signoff.checks.filter((check) => check.status !== 'passed').length;
  signoff.status = signoff.summary.failed === 0 ? 'passed' : 'incomplete';
}

async function resolveEvidenceDir() {
  if (process.env.FACTORY_ENGINE_EVIDENCE_DIR) {
    return path.resolve(ROOT, process.env.FACTORY_ENGINE_EVIDENCE_DIR);
  }
  if (RUN_ID) return path.resolve(EVIDENCE_BASE, RUN_ID);
  const latest = await latestEvidenceRun();
  if (latest) return latest;
  return path.resolve(EVIDENCE_BASE, timestamp());
}

async function latestEvidenceRun() {
  try {
    const entries = await readdir(EVIDENCE_BASE, { withFileTypes: true });
    const directories = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(EVIDENCE_BASE, entry.name);
      try {
        const info = await stat(path.join(directory, 'manifest.json'));
        directories.push({ directory, mtimeMs: info.mtimeMs });
      } catch {
        // Not a rollout evidence directory.
      }
    }
    directories.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return directories[0]?.directory ?? null;
  } catch {
    return null;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}
