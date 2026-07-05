import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.FACTORY_ENGINE_WORKSPACE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const TENANT_ID = process.env.FACTORY_ENGINE_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'ten_remote_test';
const API_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_API_URL ?? process.env.VITE_API_URL ?? 'http://127.0.0.1:4120/api/v1');
const ADMIN_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_ADMIN_URL ?? 'http://127.0.0.1:5173');
const ACCOUNTS_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_ACCOUNTS_URL ?? 'http://127.0.0.1:5175');
const RUN_ID = process.env.FACTORY_ENGINE_EVIDENCE_RUN_ID ?? timestamp();
const EVIDENCE_DIR = path.resolve(
  ROOT,
  process.env.FACTORY_ENGINE_EVIDENCE_DIR ?? path.join('docs', 'evidence', 'mail-rollout', RUN_ID),
);
const SKIP_BROWSER = process.env.FACTORY_ENGINE_SKIP_BROWSER_PROOF === '1';
const BROWSER_TIMEOUT_MS = Number(process.env.FACTORY_ENGINE_BROWSER_TIMEOUT_MS ?? 30000);

const adminSession = readSession('FACTORY_ENGINE_ADMIN_SESSION_JSON', 'FACTORY_ENGINE_ADMIN_ACCESS_TOKEN', 'FACTORY_ENGINE_ADMIN_REFRESH_TOKEN');
const accountsSession = readSession('FACTORY_ENGINE_ACCOUNTS_SESSION_JSON', 'FACTORY_ENGINE_ACCOUNTS_ACCESS_TOKEN', 'FACTORY_ENGINE_ACCOUNTS_REFRESH_TOKEN');
const customerAccountSession = readSession(
  'FACTORY_ENGINE_CUSTOMER_ACCOUNT_SESSION_JSON',
  'FACTORY_ENGINE_SHOPIFY_CUSTOMER_ACCOUNT_SESSION_TOKEN',
  'FACTORY_ENGINE_CUSTOMER_ACCOUNT_REFRESH_TOKEN',
);

const apiProbes = [
  section('system_mail', 'admin', [
    ['settings', '/mail/settings'],
    ['health', '/mail/health'],
    ['delivery_log', '/mail/delivery-log?limit=10'],
    ['provider_events', '/mail/provider-events?limit=10', {
      minCount: 1,
      reason: 'Real Resend webhook signoff requires at least one stored mail_provider_events row for this tenant.',
    }],
    ['suppression', '/mail/suppression?active=true&limit=10'],
    ['dlq', '/mail/dlq?status=pending&limit=10'],
  ]),
  section('mail_template', 'admin', [
    ['workspace', '/email-templates/workspace'],
    ['templates', '/mail-marketing/templates?limit=10'],
  ]),
  section('mail_marketing', 'admin', [
    ['overview', '/mail-marketing/overview'],
    ['settings', '/mail-marketing/settings'],
    ['audiences', '/mail-marketing/audiences'],
    ['campaigns', '/mail-marketing/campaigns?limit=10'],
    ['flows', '/mail-marketing/flows'],
    ['webhook_destinations', '/mail-marketing/flows/webhook-destinations'],
    ['analytics_funnel', '/mail-marketing/analytics/funnel?days=30&limit=10'],
    ['analytics_cohorts', '/mail-marketing/analytics/cohorts?days=30&limit=10'],
  ]),
  section('customer_portal', 'accounts', [
    ['orders', '/accounts/orders?limit=10', { customerSafePayload: true }],
    ['invoices', '/accounts/invoices?limit=10', { customerSafePayload: true }],
    ['reorder_templates', '/accounts/reorder-templates', { customerSafePayload: true }],
    ['active_cart', '/accounts/cart/active', { customerSafePayload: true }],
    ['documents', '/accounts/documents?limit=10', { customerSafePayload: true }],
  ]),
  section('shopify_customer_account', 'shopify_customer_account', [
    ['customer_account_context', '/customer-account/context', { customerSafePayload: true }],
  ]),
].flat();

const browserSurfaces = [
  {
    id: 'admin-system-mail',
    app: 'admin',
    module: 'System Mail',
    url: `${ADMIN_URL}/system-mail`,
    requiredText: ['System', 'Mail'],
  },
  {
    id: 'admin-mail-template-release-lane',
    app: 'admin',
    module: 'Mail Template',
    url: `${ADMIN_URL}/mail-marketing`,
    tabText: 'Templates',
    requiredText: ['Templates'],
  },
  {
    id: 'admin-mail-marketing-recipient-room',
    app: 'admin',
    module: 'Mail Marketing',
    url: `${ADMIN_URL}/mail-marketing`,
    tabText: 'Audiences',
    requiredText: ['Audiences'],
  },
  {
    id: 'accounts-orders',
    app: 'accounts',
    module: 'Customer Portal',
    url: `${ACCOUNTS_URL}/orders`,
    requiredText: ['Orders'],
  },
  {
    id: 'accounts-reorder',
    app: 'accounts',
    module: 'Customer Portal',
    url: `${ACCOUNTS_URL}/reorder`,
    requiredText: ['Reorder'],
  },
  {
    id: 'accounts-invoices',
    app: 'accounts',
    module: 'Customer Portal',
    url: `${ACCOUNTS_URL}/invoices`,
    requiredText: ['Invoices'],
  },
  {
    id: 'accounts-cart',
    app: 'accounts',
    module: 'Customer Portal',
    url: `${ACCOUNTS_URL}/cart`,
    requiredText: ['Cart'],
  },
  {
    id: 'accounts-documents',
    app: 'accounts',
    module: 'Customer Portal',
    url: `${ACCOUNTS_URL}/documents`,
    requiredText: ['Documents'],
  },
];

const viewports = [
  { id: 'desktop', width: 1440, height: 1000 },
  { id: 'mobile', width: 390, height: 844 },
];

const themes = ['light', 'dark'];

const manifest = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  config: {
    apiUrl: API_URL,
    adminUrl: ADMIN_URL,
    accountsUrl: ACCOUNTS_URL,
    tenantId: TENANT_ID,
    evidenceDir: EVIDENCE_DIR,
    hasAdminSession: Boolean(adminSession),
    hasAccountsSession: Boolean(accountsSession),
    hasCustomerAccountSession: Boolean(customerAccountSession),
    browserProofSkipped: SKIP_BROWSER,
  },
  api: [],
  copy: [],
  contract: [],
  browser: [],
  summary: {
    status: 'pending',
    apiPassed: 0,
    apiFailed: 0,
    apiSkipped: 0,
    copyPassed: 0,
    copyFailed: 0,
    copyWarnings: 0,
    contractPassed: 0,
    contractFailed: 0,
    browserPassed: 0,
    browserFailed: 0,
    browserSkipped: 0,
  },
};

await main();

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  manifest.copy.push(await runCustomerFacingCopyProof());
  manifest.contract.push(await runCustomerResponseContractProof());

  for (const probe of apiProbes) {
    manifest.api.push(await runApiProbe(probe));
  }

  if (SKIP_BROWSER) {
    manifest.browser.push({
      status: 'skipped',
      reason: 'FACTORY_ENGINE_SKIP_BROWSER_PROOF=1',
    });
  } else {
    manifest.browser.push(...await runBrowserProof());
  }

  summarize();
  await writeFile(path.join(EVIDENCE_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Mail rollout proof manifest: ${path.join(EVIDENCE_DIR, 'manifest.json')}`);

  if (manifest.summary.status !== 'passed') {
    process.exitCode = 1;
  }
}

async function runApiProbe(probe) {
  const session = sessionForAuth(probe.auth);
  if (!session?.accessToken) {
    return {
      ...probe,
      status: 'skipped',
      reason: sessionRequirement(probe.auth),
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${API_URL}${probe.path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.accessToken}`,
        'x-tenant-id': TENANT_ID,
      },
    });
    const text = await response.text();
    const parsed = parseMaybeJson(text);
    const shape = response.ok ? payloadShape(parsed) : undefined;
    const assertion = response.ok ? validateApiProbe(probe, parsed) : null;
    const followUps = response.ok ? await runDependentApiProbes(probe, parsed, session) : [];
    const failedFollowUps = followUps.filter((entry) => entry.status !== 'passed');
    return {
      ...probe,
      status: response.ok && assertion?.passed !== false && failedFollowUps.length === 0 ? 'passed' : 'failed',
      httpStatus: response.status,
      requestId: response.headers.get('x-request-id') ?? null,
      durationMs: Date.now() - startedAt,
      shape,
      assertion: assertion?.proof ?? undefined,
      followUps: followUps.length > 0 ? followUps : undefined,
      error: !response.ok
        ? safeError(parsed, text)
        : assertion?.passed === false
          ? { message: 'Proof assertion failed', failures: assertion.failures }
          : failedFollowUps.length > 0
            ? { message: 'Dependent proof failed', failures: failedFollowUps.map((entry) => `${entry.name}: ${entry.error?.message ?? entry.error ?? entry.status}`) }
          : undefined,
    };
  } catch (error) {
    return {
      ...probe,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runBrowserProof() {
  const playwright = await loadPlaywright();
  if (!playwright) {
    return [{
      status: 'skipped',
      reason: 'Playwright is not installed in this workspace. Install it or run in an environment that provides the playwright package.',
    }];
  }

  const browser = await playwright.chromium.launch({ headless: process.env.FACTORY_ENGINE_HEADFUL_BROWSER !== '1' });
  const results = [];
  try {
    for (const surface of browserSurfaces) {
      for (const theme of themes) {
        for (const viewport of viewports) {
          results.push(await captureSurface(browser, surface, theme, viewport));
        }
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function captureSurface(browser, surface, theme, viewport) {
  const session = surface.app === 'admin' ? adminSession : accountsSession;
  if (!session?.accessToken) {
    return {
      surface: surface.id,
      module: surface.module,
      app: surface.app,
      theme,
      viewport: viewport.id,
      status: 'skipped',
      reason: `${surface.app} session is required for browser proof.`,
    };
  }

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const screenshotName = `${surface.id}-${theme}-${viewport.id}.png`;
  const screenshotPath = path.join(EVIDENCE_DIR, screenshotName);
  const sessionKey = surface.app === 'admin' ? 'factory-engine-pro.admin.session' : 'factory-engine-pro.accounts.session';
  const themeKey = surface.app === 'admin' ? 'fe-admin-theme' : 'fe-accounts-theme';

  await page.addInitScript(({ sessionKey: key, session: value, theme: selectedTheme, themeKey: selectedThemeKey }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.localStorage.setItem(selectedThemeKey, selectedTheme);
    document.documentElement.dataset.theme = selectedTheme;
  }, { sessionKey, session: publicSession(session), theme, themeKey });

  const startedAt = Date.now();
  try {
    await page.goto(surface.url, { waitUntil: 'networkidle', timeout: BROWSER_TIMEOUT_MS });
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme;
    }, theme);

    let tabStatus = 'not_required';
    if (surface.tabText) {
      tabStatus = await clickTab(page, surface.tabText);
    }

    await page.waitForTimeout(350);
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const title = await page.title().catch(() => '');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const missingText = surface.requiredText.filter((needle) => !bodyText.toLowerCase().includes(needle.toLowerCase()));
    const hasAuthProblem = /log in|sign in|unauthorized|forbidden/i.test(bodyText);
    const hasLoadProblem = /could not load|request failed|failed to fetch/i.test(bodyText);
    const visibleCopyIssues = surface.app === 'accounts' ? customerFacingVisibleTextIssues(bodyText) : [];
    const passed = missingText.length === 0 && !hasAuthProblem && !hasLoadProblem && tabStatus !== 'failed' && visibleCopyIssues.length === 0;

    return {
      surface: surface.id,
      module: surface.module,
      app: surface.app,
      theme,
      viewport: viewport.id,
      url: surface.url,
      tab: surface.tabText ?? null,
      tabStatus,
      status: passed ? 'passed' : 'failed',
      title,
      durationMs: Date.now() - startedAt,
      screenshot: path.relative(ROOT, screenshotPath).replace(/\\/g, '/'),
      missingText,
      customerFacingCopy: surface.app === 'accounts'
        ? {
          checked: true,
          violationCount: visibleCopyIssues.length,
          violations: visibleCopyIssues.slice(0, 20),
        }
        : undefined,
      flags: {
        authProblem: hasAuthProblem,
        loadProblem: hasLoadProblem,
        customerCopyProblem: visibleCopyIssues.length > 0,
      },
    };
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    return {
      surface: surface.id,
      module: surface.module,
      app: surface.app,
      theme,
      viewport: viewport.id,
      url: surface.url,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      screenshot: path.relative(ROOT, screenshotPath).replace(/\\/g, '/'),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

async function clickTab(page, tabText) {
  try {
    await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(tabText)}$`, 'i') }).click({ timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    return 'clicked';
  } catch {
    return 'failed';
  }
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      const testPackage = await import('@playwright/test');
      return testPackage;
    } catch {
      return null;
    }
  }
}

function section(module, auth, entries) {
  return entries.map(([name, requestPath, assertions]) => ({ module, auth, name, path: requestPath, assertions: assertions ?? {} }));
}

function sessionForAuth(auth) {
  switch (auth) {
    case 'admin':
      return adminSession;
    case 'shopify_customer_account':
      return customerAccountSession;
    case 'accounts':
    default:
      return accountsSession;
  }
}

function sessionRequirement(auth) {
  switch (auth) {
    case 'admin':
      return 'admin session is required. Set FACTORY_ENGINE_ADMIN_SESSION_JSON or FACTORY_ENGINE_ADMIN_ACCESS_TOKEN.';
    case 'shopify_customer_account':
      return 'Shopify Customer Account session token is required. Set FACTORY_ENGINE_CUSTOMER_ACCOUNT_SESSION_JSON or FACTORY_ENGINE_SHOPIFY_CUSTOMER_ACCOUNT_SESSION_TOKEN.';
    case 'accounts':
    default:
      return 'accounts session is required. Set FACTORY_ENGINE_ACCOUNTS_SESSION_JSON or FACTORY_ENGINE_ACCOUNTS_ACCESS_TOKEN.';
  }
}

async function runDependentApiProbes(probe, payload, session) {
  if (probe.module !== 'customer_portal') return [];
  if (probe.name !== 'orders' && probe.name !== 'invoices') return [];
  const record = firstPayloadRecord(payload);
  const count = payloadCount(payload);
  const id = typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : null;
  const name = probe.name === 'orders' ? 'order_detail' : 'invoice_detail';
  if (!id) {
    return [{
      name,
      path: null,
      status: 'failed',
      reason: count > 0
        ? `The ${probe.name} list reported ${count} record(s), but no customer-facing id was available for detail proof.`
        : `The ${probe.name} list has no live customer record to prove the detail endpoint.`,
    }];
  }
  const requestPath = probe.name === 'orders'
    ? `/accounts/orders/${encodeURIComponent(id)}`
    : `/accounts/invoices/${encodeURIComponent(id)}`;
  return [await runJsonFollowUpProbe({ module: probe.module, auth: probe.auth, name, path: requestPath, assertions: { customerSafePayload: true } }, session)];
}

async function runJsonFollowUpProbe(probe, session) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${API_URL}${probe.path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.accessToken}`,
        'x-tenant-id': TENANT_ID,
      },
    });
    const text = await response.text();
    const parsed = parseMaybeJson(text);
    const assertion = response.ok ? validateApiProbe(probe, parsed) : null;
    return {
      name: probe.name,
      path: probe.path,
      status: response.ok && assertion?.passed !== false ? 'passed' : 'failed',
      httpStatus: response.status,
      requestId: response.headers.get('x-request-id') ?? null,
      durationMs: Date.now() - startedAt,
      shape: response.ok ? payloadShape(parsed) : undefined,
      assertion: assertion?.proof ?? undefined,
      error: !response.ok
        ? safeError(parsed, text)
        : assertion?.passed === false
          ? { message: 'Proof assertion failed', failures: assertion.failures }
          : undefined,
    };
  } catch (error) {
    return {
      name: probe.name,
      path: probe.path,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

function publicSession(session) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? '',
    expiresAt: session.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    principal: session.principal ?? null,
    tenant: session.tenant ?? null,
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

function payloadShape(payload) {
  if (Array.isArray(payload)) return { type: 'array', count: payload.length };
  if (!payload || typeof payload !== 'object') return { type: typeof payload };
  const keys = Object.keys(payload).slice(0, 20);
  const count = typeof payload.total === 'number'
    ? payload.total
    : Array.isArray(payload.data)
      ? payload.data.length
      : Array.isArray(payload.items)
        ? payload.items.length
        : undefined;
  return { type: 'object', keys, count };
}

function validateApiProbe(probe, payload) {
  const assertions = probe.assertions ?? {};
  const failures = [];
  const proof = {};

  if (typeof assertions.minCount === 'number') {
    const count = payloadCount(payload);
    proof.count = count;
    proof.minCount = assertions.minCount;
    proof.reason = assertions.reason;
    if (count < assertions.minCount) {
      failures.push(assertions.reason ?? `Expected at least ${assertions.minCount} records, got ${count}.`);
    }
  }

  if (assertions.customerSafePayload) {
    const leaks = customerPayloadLeaks(payload);
    proof.customerSafePayload = {
      checked: true,
      leakCount: leaks.length,
      sample: leaks.slice(0, 20),
      reason: 'Customer portal payloads must not expose raw Shopify payloads, tenant/provider/workflow internals, staff-only data, secrets, or debug fields.',
    };
    if (leaks.length > 0) {
      failures.push(`Customer-facing payload contains ${leaks.length} forbidden internal/raw field(s).`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    proof: Object.keys(proof).length > 0 ? proof : undefined,
  };
}

function payloadCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return 0;
  if (payload.meta && typeof payload.meta === 'object' && typeof payload.meta.count === 'number') return payload.meta.count;
  if (typeof payload.total === 'number') return payload.total;
  if (Array.isArray(payload.data)) return payload.data.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  return 0;
}

function firstPayloadRecord(payload) {
  if (Array.isArray(payload)) return objectRecord(payload[0]);
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.data)) return objectRecord(payload.data[0]);
  if (Array.isArray(payload.items)) return objectRecord(payload.items[0]);
  return null;
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function customerPayloadLeaks(payload) {
  const leaks = [];
  visitCustomerPayload(payload, '$', leaks, 0);
  return leaks;
}

async function runCustomerFacingCopyProof() {
  const startedAt = Date.now();
  const files = await collectCustomerCopyFiles();
  const scanned = [];
  const missing = files.filter((file) => file.missing);
  const violations = [];
  const warnings = [];

  for (const file of files.filter((entry) => !entry.missing)) {
    const content = await readFile(file.path, 'utf8');
    const entries = file.kind === 'json'
      ? extractJsonCopyEntries(file.path, content)
      : extractCodeCopyEntries(file.path, content);
    scanned.push({
      file: path.relative(ROOT, file.path).replace(/\\/g, '/'),
      kind: file.kind,
      strings: entries.length,
    });

    for (const entry of entries) {
      const issue = customerFacingCopyIssue(entry.text);
      if (!issue) continue;
      const record = {
        file: path.relative(ROOT, file.path).replace(/\\/g, '/'),
        location: entry.location,
        term: issue.term,
        reason: issue.reason,
        excerpt: entry.text.slice(0, 180),
      };
      if (issue.severity === 'warning') warnings.push(record);
      else violations.push(record);
    }
  }

  return {
    id: 'customer-facing-copy',
    module: 'customer_portal',
    status: missing.length === 0 && violations.length === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    proof: {
      scope: [
        'apps/accounts/src/i18n string values',
        'apps/accounts/src route/component visible JSX copy',
        'extensions/customer-account-extension/src visible copy and customer-safe errors',
      ],
      scanned,
      missing: missing.map((file) => path.relative(ROOT, file.path).replace(/\\/g, '/')),
      warnings: warnings.slice(0, 50),
      warningCount: warnings.length,
      violationCount: violations.length,
      violations: violations.slice(0, 50),
      reason: 'Customer-facing screens must use business-clear copy and must not expose tenant/provider/workflow/routing/source/raw-payload/debug vocabulary.',
    },
    error: missing.length > 0 || violations.length > 0
      ? {
        message: 'Customer-facing copy proof failed',
        failures: [
          ...missing.map((file) => `Missing customer-facing copy source: ${path.relative(ROOT, file.path).replace(/\\/g, '/')}`),
          ...violations.slice(0, 20).map((issue) => `${issue.file} ${issue.location}: ${issue.reason}`),
        ],
      }
      : undefined,
  };
}

async function runCustomerResponseContractProof() {
  const startedAt = Date.now();
  const files = [
    {
      path: path.join(ROOT, 'apps', 'accounts', 'src', 'lib', 'portal.ts'),
      scope: 'Customer Portal frontend response helpers and exported buyer-facing types',
    },
    {
      path: path.join(ROOT, 'packages', 'contracts', 'src', 'accounts.ts'),
      scope: 'Customer Portal shared account contracts',
    },
    {
      path: path.join(ROOT, 'extensions', 'customer-account-extension', 'src', 'CustomerAccountPage.tsx'),
      scope: 'Shopify Customer Account context response type',
    },
  ];
  const scanned = [];
  const missing = [];
  const violations = [];

  for (const file of files) {
    try {
      const content = await readFile(file.path, 'utf8');
      const entries = extractContractKeyEntries(file.path, content);
      scanned.push({
        file: path.relative(ROOT, file.path).replace(/\\/g, '/'),
        scope: file.scope,
        properties: entries.length,
      });
      for (const entry of entries) {
        const reason = forbiddenCustomerKeyReason(entry.key);
        if (!reason) continue;
        violations.push({
          file: path.relative(ROOT, file.path).replace(/\\/g, '/'),
          line: entry.line,
          key: entry.key,
          reason,
          excerpt: entry.excerpt,
        });
      }
    } catch {
      missing.push(file);
    }
  }

  return {
    id: 'customer-response-contract',
    module: 'customer_portal',
    status: missing.length === 0 && violations.length === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    proof: {
      scope: [
        'Customer Portal public TypeScript response surface',
        'Customer Account extension context response surface',
        'Shared account contract surface',
      ],
      scanned,
      missing: missing.map((file) => path.relative(ROOT, file.path).replace(/\\/g, '/')),
      violationCount: violations.length,
      violations: violations.slice(0, 50),
      reason: 'Customer-facing response contracts must not accept source-prefixed fields, tenant/provider/workflow/routing/source internals, raw payloads, secrets, debug fields, staff-only notes, or request ids.',
    },
    error: missing.length > 0 || violations.length > 0
      ? {
        message: 'Customer response contract proof failed',
        failures: [
          ...missing.map((file) => `Missing customer response contract source: ${path.relative(ROOT, file.path).replace(/\\/g, '/')}`),
          ...violations.slice(0, 20).map((issue) => `${issue.file}:${issue.line} ${issue.key}: ${issue.reason}`),
        ],
      }
      : undefined,
  };
}

async function collectCustomerCopyFiles() {
  const expected = [
    { path: path.join(ROOT, 'apps', 'accounts', 'src', 'i18n', 'en.json'), kind: 'json' },
  ];
  const discovered = [
    ...await collectFiles(path.join(ROOT, 'apps', 'accounts', 'src', 'routes'), ['.tsx', '.ts']),
    ...await collectFiles(path.join(ROOT, 'apps', 'accounts', 'src', 'components'), ['.tsx', '.ts']),
    ...await collectFiles(path.join(ROOT, 'extensions', 'customer-account-extension', 'src'), ['.tsx', '.ts']),
  ].map((filePath) => ({
    path: filePath,
    kind: filePath.endsWith('.json') ? 'json' : 'code',
  }));
  const all = [...expected, ...discovered];
  const seen = new Set();
  return Promise.all(all
    .filter((file) => {
      const key = file.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(async (file) => {
      try {
        await readFile(file.path, 'utf8');
        return file;
      } catch {
        return { ...file, missing: true };
      }
    }));
}

async function collectFiles(dir, extensions) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectFiles(fullPath, extensions));
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

function extractJsonCopyEntries(filePath, content) {
  try {
    const parsed = JSON.parse(content);
    const entries = [];
    visitJsonStrings(parsed, '$', entries);
    return entries;
  } catch (error) {
    return [{
      location: '$',
      text: `Invalid JSON in customer-facing copy file: ${filePath}. ${error instanceof Error ? error.message : String(error)}`,
    }];
  }
}

function visitJsonStrings(value, currentPath, entries) {
  if (typeof value === 'string') {
    entries.push({ location: currentPath, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitJsonStrings(item, `${currentPath}[${index}]`, entries));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    visitJsonStrings(nested, `${currentPath}.${key}`, entries);
  }
}

function extractCodeCopyEntries(filePath, content) {
  const entries = [];
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '');

  const jsxTextPattern = />\s*([^<>{}`][^<>{}]*)\s*</g;
  let match;
  while ((match = jsxTextPattern.exec(withoutComments))) {
    const text = normalizeCopyText(match[1]);
    if (isLikelyVisibleCopy(text)) {
      entries.push({ location: `offset:${match.index}`, text });
    }
  }

  const visiblePropPattern = /\b(title|label|placeholder|aria-label|alt|description|subtitle|helpText)\s*=\s*["']([^"']+)["']/g;
  while ((match = visiblePropPattern.exec(withoutComments))) {
    const text = normalizeCopyText(match[2]);
    if (isLikelyVisibleCopy(text)) {
      entries.push({ location: `${match[1]}@offset:${match.index}`, text });
    }
  }

  const humanStringPattern = /(['"])([^'"\n]{3,})\1/g;
  while ((match = humanStringPattern.exec(withoutComments))) {
    const text = normalizeCopyText(match[2]);
    if (isLikelyHumanStringCopy(text)) {
      entries.push({ location: `string@offset:${match.index}`, text });
    }
  }

  return dedupeCopyEntries(entries);
}

function normalizeCopyText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isLikelyVisibleCopy(value) {
  if (!value || value.length < 2) return false;
  if (/^[{}()[\].,:;|+\-*/\s]+$/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

function isLikelyHumanStringCopy(value) {
  if (!isLikelyVisibleCopy(value)) return false;
  if (/^(https?:|\/|\.\/|\.\.\/|#|[a-z0-9_.-]+\/[a-z0-9_.-]+)/i.test(value)) return false;
  if (/^[a-z0-9_.:-]+$/i.test(value)) return false;
  if (/^[A-Z0-9_]+$/.test(value)) return false;
  return /\s/.test(value) || /[a-z][A-Z]/.test(value) || /[A-Z][a-z]/.test(value);
}

function dedupeCopyEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.location}:${entry.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractContractKeyEntries(filePath, content) {
  const lines = content.split(/\r?\n/);
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '');
  const entries = [];
  const propertyPattern = /\b([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:/g;
  let match;
  while ((match = propertyPattern.exec(withoutComments))) {
    const key = match[1];
    const line = lineNumberAtOffset(withoutComments, match.index);
    const excerpt = normalizeCopyText(lines[line - 1] ?? '');
    entries.push({
      file: filePath,
      line,
      key,
      excerpt: excerpt.slice(0, 220),
    });
  }
  return dedupeContractEntries(entries);
}

function lineNumberAtOffset(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function dedupeContractEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.file}:${entry.line}:${entry.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function customerFacingCopyIssue(text) {
  const errorPatterns = [
    ['tenant', /\btenant\b/i, 'tenant vocabulary is internal'],
    ['provider', /\bprovider\b/i, 'provider vocabulary is internal'],
    ['workflow', /\bworkflow\b/i, 'workflow vocabulary is internal'],
    ['queue', /\bqueue\b/i, 'queue vocabulary is internal'],
    ['routing', /\brouting\b/i, 'routing vocabulary is internal'],
    ['source', /\bsource\b/i, 'source vocabulary is internal'],
    ['axis', /\baxis\b/i, 'axis vocabulary is internal'],
    ['rule', /\brule\b/i, 'rule vocabulary is internal'],
    ['suppression', /\bsuppression\b/i, 'suppression vocabulary is internal'],
    ['raw payload', /\braw\s+(payload|json|data)\b/i, 'raw payload vocabulary is internal'],
    ['provider payload', /\bprovider\s+payload\b/i, 'provider payload vocabulary is internal'],
    ['admin graphql', /\badmin[_\s-]*graphql[_\s-]*api[_\s-]*id\b/i, 'Shopify admin GraphQL id must never be visible'],
    ['metadata', /\bmetadata\b/i, 'metadata vocabulary is internal'],
    ['internal', /\binternal\b/i, 'internal vocabulary is not customer-facing'],
    ['debug', /\bdebug\b|\bstack trace\b/i, 'debug vocabulary is internal'],
    ['staff notes', /\bstaff\s+notes?\b/i, 'staff-only notes must not be visible'],
    ['campaign membership', /\bcampaign\b|\baudience\b|\bflow\b/i, 'marketing campaign/audience internals must not be customer-facing'],
  ];
  for (const [term, pattern, reason] of errorPatterns) {
    if (pattern.test(text)) return { severity: 'error', term, reason };
  }

  const warningPatterns = [
    ['hashing detail', /\bPBKDF2\b|\bhashed\b|\bsha512\b|\bplaintext\b/i, 'security implementation detail may confuse customer-facing UI'],
  ];
  for (const [term, pattern, reason] of warningPatterns) {
    if (pattern.test(text)) return { severity: 'warning', term, reason };
  }
  return null;
}

function customerFacingVisibleTextIssues(bodyText) {
  const issues = [];
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => normalizeCopyText(line))
    .filter((line) => line.length > 0);
  for (const [index, line] of lines.entries()) {
    const issue = customerFacingCopyIssue(line);
    if (!issue || issue.severity !== 'error') continue;
    issues.push({
      line: index + 1,
      term: issue.term,
      reason: issue.reason,
      excerpt: line.slice(0, 160),
    });
    if (issues.length >= 50) break;
  }
  return issues;
}

function visitCustomerPayload(value, currentPath, leaks, depth) {
  if (depth > 8 || leaks.length >= 100) return;
  if (Array.isArray(value)) {
    value.slice(0, 50).forEach((item, index) => visitCustomerPayload(item, `${currentPath}[${index}]`, leaks, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') inspectCustomerStringValue(value, currentPath, leaks);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    const reason = forbiddenCustomerKeyReason(key);
    if (reason) leaks.push({ path: childPath, key, reason });
    inspectCustomerSourceValue(key, nested, childPath, leaks);
    visitCustomerPayload(nested, childPath, leaks, depth + 1);
    if (leaks.length >= 100) return;
  }
}

function forbiddenCustomerKeyReason(key) {
  const normalized = key.replace(/[_\-\s]/g, '').toLowerCase();
  if (normalized.startsWith('source')) return 'source-prefixed internal field';
  const exact = {
    tenantid: 'tenant internal id',
    provider: 'provider internal field',
    providerid: 'provider internal id',
    providerpayload: 'provider raw payload',
    providerresponse: 'provider raw response',
    providerheaders: 'provider raw headers',
    raw: 'raw payload field',
    rawjson: 'raw JSON field',
    rawdata: 'raw data field',
    rawpayload: 'raw payload field',
    originalpayload: 'raw source payload',
    requestpayload: 'raw request payload',
    responsepayload: 'raw response payload',
    source: 'source internal field',
    sourcetype: 'source internal field',
    shopifypayload: 'raw Shopify payload',
    shopifyraw: 'raw Shopify payload',
    admingraphqlapiid: 'Shopify admin GraphQL id',
    graphqladminid: 'Shopify admin GraphQL id',
    adminid: 'admin/internal id',
    metadata: 'internal metadata',
    internalmetadata: 'internal metadata',
    workflow: 'workflow internal field',
    workflowid: 'workflow internal id',
    workflowruleid: 'workflow rule internal id',
    ruleid: 'rule internal id',
    routing: 'routing internal field',
    routingkey: 'routing internal key',
    axis: 'staff routing axis',
    assignedmemberid: 'staff assignment internal id',
    ownermemberid: 'staff ownership internal id',
    staffnotes: 'staff-only notes',
    internalnotes: 'internal notes',
    adminnotes: 'admin-only notes',
    supportinternalnotes: 'support internal notes',
    suppression: 'marketing suppression internal field',
    suppressionid: 'marketing suppression internal id',
    campaignid: 'marketing campaign internal id',
    audienceid: 'marketing audience internal id',
    flowid: 'marketing flow internal id',
    fulfillments: 'raw Shopify fulfillments array',
    refunds: 'raw Shopify refunds array',
    headers: 'raw headers',
    requestid: 'request/debug id',
    authorization: 'authorization header',
    accesstoken: 'access token field',
    refreshtoken: 'refresh token field',
    sessiontoken: 'session token field',
    secret: 'secret field',
    token: 'token field',
    password: 'password field',
    passwordhash: 'password hash field',
    stack: 'debug stack',
    debug: 'debug field',
    debugtrace: 'debug trace',
  };
  return exact[normalized] ?? null;
}

function inspectCustomerSourceValue(key, value, currentPath, leaks) {
  if (leaks.length >= 100 || typeof value !== 'string') return;
  const normalizedKey = key.replace(/[_\-\s]/g, '').toLowerCase();
  if (normalizedKey !== 'source' && normalizedKey !== 'sourcetype') return;
  const normalizedValue = value.replace(/[_\-\s]/g, '').toLowerCase();
  leaks.push({ path: currentPath, key, reason: `customer-facing source value is internal: ${normalizedValue}` });
}

function inspectCustomerStringValue(value, currentPath, leaks) {
  if (leaks.length >= 100 || value.length < 5) return;
  const unsafeValueIssue = customerUnsafeStringValueIssue(value);
  if (unsafeValueIssue) {
    leaks.push({ path: currentPath, key: '(string)', reason: unsafeValueIssue });
    return;
  }
  const sample = value.slice(0, 400).toLowerCase();
  const rawMarkers = [
    'admin_graphql_api_id',
    'adminGraphqlApiId'.toLowerCase(),
    'providerpayload',
    'rawpayload',
    'tenantid',
    '"fulfillments"',
    '"refunds"',
    'authorization:',
    'bearer ',
  ];
  if (rawMarkers.some((marker) => sample.includes(marker))) {
    leaks.push({ path: currentPath, key: '(string)', reason: 'string value appears to contain raw/internal payload text' });
  }
}

function customerUnsafeStringValueIssue(value) {
  const text = value.slice(0, 500);
  const patterns = [
    [/\btenant\b/i, 'string value exposes tenant terminology'],
    [/\bprovider\b/i, 'string value exposes provider terminology'],
    [/\bworkflow\b/i, 'string value exposes workflow terminology'],
    [/\bqueue\b/i, 'string value exposes queue terminology'],
    [/\brouting\b/i, 'string value exposes routing terminology'],
    [/\bsource\b/i, 'string value exposes source terminology'],
    [/\baxis\b/i, 'string value exposes axis terminology'],
    [/\brule\b/i, 'string value exposes rule terminology'],
    [/\bsuppression\b/i, 'string value exposes marketing suppression terminology'],
    [/\bmetadata\b/i, 'string value exposes metadata terminology'],
    [/\braw\s+(payload|json|data)\b/i, 'string value exposes raw payload terminology'],
    [/\bstaff\s+notes?\b/i, 'string value exposes staff-only notes terminology'],
    [/\b(campaign|audience|flow)\b/i, 'string value exposes marketing internals'],
    [/\bshopify\s+admin\b/i, 'string value exposes Shopify admin terminology'],
    [/\badmin\s+credentials?\b/i, 'string value exposes credential/configuration terminology'],
    [/\bvariant\s+id\b/i, 'string value exposes implementation id terminology'],
    [/\bdraft\s+order\b/i, 'string value exposes Shopify draft-order terminology'],
    [/gid:\/\/shopify\//i, 'string value exposes raw Shopify gid'],
    [/\brequest[_\s-]*id\b/i, 'string value exposes request/debug id'],
    [/\b(token|authorization|secret|passwordhash)\b/i, 'string value exposes secret/auth terminology'],
    [/\bdebug\b|\bstack trace\b/i, 'string value exposes debug terminology'],
  ];
  const matched = patterns.find(([pattern]) => pattern.test(text));
  return matched?.[1] ?? null;
}

function safeError(payload, fallback) {
  if (payload && typeof payload === 'object') {
    return {
      message: payload.message ?? payload.error ?? 'Request failed',
      code: payload.code ?? undefined,
      requestId: payload.request_id ?? undefined,
    };
  }
  return fallback.slice(0, 400);
}

function summarize() {
  for (const entry of manifest.api) {
    if (entry.status === 'passed') manifest.summary.apiPassed += 1;
    else if (entry.status === 'skipped') manifest.summary.apiSkipped += 1;
    else manifest.summary.apiFailed += 1;
  }
  for (const entry of manifest.copy) {
    if (entry.status === 'passed') manifest.summary.copyPassed += 1;
    else manifest.summary.copyFailed += 1;
    manifest.summary.copyWarnings += entry.proof?.warningCount ?? 0;
  }
  for (const entry of manifest.contract) {
    if (entry.status === 'passed') manifest.summary.contractPassed += 1;
    else manifest.summary.contractFailed += 1;
  }
  for (const entry of manifest.browser) {
    if (entry.status === 'passed') manifest.summary.browserPassed += 1;
    else if (entry.status === 'skipped') manifest.summary.browserSkipped += 1;
    else manifest.summary.browserFailed += 1;
  }
  manifest.summary.status = manifest.summary.apiFailed === 0
    && manifest.summary.copyFailed === 0
    && manifest.summary.contractFailed === 0
    && manifest.summary.browserFailed === 0
    && manifest.summary.apiSkipped === 0
    && manifest.summary.browserSkipped === 0
    ? 'passed'
    : 'incomplete';
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
