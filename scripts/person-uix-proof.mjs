import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(process.env.FACTORY_ENGINE_WORKSPACE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const API_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_API_URL ?? process.env.VITE_API_URL ?? 'https://api.dtfbank.com/api/v1');
const PERSON_URL = trimTrailingSlash(process.env.FACTORY_ENGINE_PERSON_URL ?? 'https://app.dtfbank.com/staff');
const TENANT_ID = process.env.FACTORY_ENGINE_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'ten_dtfbank';
const RUN_ID = process.env.FACTORY_ENGINE_EVIDENCE_RUN_ID ?? timestamp();
const EVIDENCE_DIR = path.resolve(ROOT, process.env.FACTORY_ENGINE_EVIDENCE_DIR ?? path.join('docs', 'evidence', 'person-uix', RUN_ID));
const BROWSER_TIMEOUT_MS = Number(process.env.FACTORY_ENGINE_BROWSER_TIMEOUT_MS ?? 45000);
const HEADFUL = process.env.FACTORY_ENGINE_HEADFUL_BROWSER === '1';

const SESSION_KEY = 'factory-engine-pro.person.session';
const THEME_KEY = 'factory-engine-person-theme';
const forbiddenStaffTerms = ['AI', 'workflow', 'rule', 'axis', 'sales', 'support', 'commission', 'debug', 'resolver'];

const manifest = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  config: {
    apiUrl: API_URL,
    personUrl: PERSON_URL,
    tenantId: TENANT_ID,
    evidenceDir: EVIDENCE_DIR,
    hasSessionJson: Boolean(process.env.FACTORY_ENGINE_PERSON_SESSION_JSON),
    hasAccessToken: Boolean(process.env.FACTORY_ENGINE_PERSON_ACCESS_TOKEN),
    hasLoginCredentials: Boolean(process.env.FACTORY_ENGINE_PERSON_EMAIL && process.env.FACTORY_ENGINE_PERSON_PASSWORD),
  },
  browser: [],
  summary: {
    status: 'pending',
    passed: 0,
    failed: 0,
    skipped: 0,
  },
};

await main();

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const playwright = await loadPlaywright();
  if (!playwright) {
    manifest.browser.push({
      id: 'playwright',
      status: 'skipped',
      reason: 'Playwright is not installed in this workspace.',
    });
    return finish();
  }

  const session = await resolvePersonSession();
  if (!session?.accessToken) {
    manifest.browser.push({
      id: 'auth',
      status: 'failed',
      reason: 'Authenticated person session is required. Set FACTORY_ENGINE_PERSON_SESSION_JSON, FACTORY_ENGINE_PERSON_ACCESS_TOKEN, or FACTORY_ENGINE_PERSON_EMAIL and FACTORY_ENGINE_PERSON_PASSWORD.',
    });
    return finish();
  }

  const browser = await playwright.chromium.launch({ headless: !HEADFUL });
  try {
    for (const viewport of [
      { id: 'desktop', width: 1440, height: 1000 },
      { id: 'mobile', width: 390, height: 844 },
    ]) {
      for (const theme of ['light', 'dark']) {
        manifest.browser.push(await captureQueue(browser, session, viewport, theme));
      }
    }

    for (const theme of ['light', 'dark']) {
      manifest.browser.push(await captureTaskModal(browser, session, theme));
      manifest.browser.push(await captureCustomerDetail(browser, session, theme));
    }

    manifest.browser.push(await captureCustomerArchive(browser, session, 'light'));
    manifest.browser.push(await captureCustomerArchive(browser, session, 'dark'));
  } finally {
    await browser.close();
  }

  return finish();
}

async function captureQueue(browser, session, viewport, theme) {
  return withPage(browser, session, viewport, theme, async (page) => {
    await gotoStaff(page, '/queue');
    const queue = page.locator('.queue-wrap');
    await queue.waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await waitForSettledStaffSurface(page);
    const proof = await staffTextProof(page);
    const screenshot = await screenshot(page, `staff-queue-${theme}-${viewport.id}.png`);
    return {
      id: `staff-queue-${theme}-${viewport.id}`,
      surface: '/staff/queue',
      theme,
      viewport: viewport.id,
      status: proof.passed ? 'passed' : 'failed',
      screenshot,
      proof,
    };
  });
}

async function captureTaskModal(browser, session, theme) {
  const viewport = { id: 'desktop', width: 1440, height: 1000 };
  return withPage(browser, session, viewport, theme, async (page) => {
    await gotoStaff(page, '/queue');
    await page.locator('[data-daily-task-id]').first().waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('[data-daily-task-id] .card').first().click({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('.brief-modal').waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await expectVisibleText(page, ['Do this now', 'Reason for this call', 'Customer mood or issue', 'Outcome required']);
    const proof = await staffTextProof(page);
    const screenshot = await screenshot(page, `task-brief-modal-${theme}.png`);
    return {
      id: `task-brief-modal-${theme}`,
      surface: '/staff/queue task modal',
      theme,
      viewport: viewport.id,
      status: proof.passed ? 'passed' : 'failed',
      screenshot,
      proof,
    };
  });
}

async function captureCustomerDetail(browser, session, theme) {
  const viewport = { id: 'desktop', width: 1440, height: 1000 };
  return withPage(browser, session, viewport, theme, async (page) => {
    await gotoStaff(page, '/queue');
    await page.locator('[data-priority-customer-id]').first().waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('[data-priority-customer-id]').first().click({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('.customer-detail-panel').waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await expectVisibleText(page, ['Customer 360', 'Profile', 'Shopify Orders', 'Aircall Calls', 'Customer Requests', 'Notes']);
    const proof = await staffTextProof(page);
    const screenshot = await screenshot(page, `customer-detail-popup-${theme}.png`);
    return {
      id: `customer-detail-popup-${theme}`,
      surface: '/staff/queue customer detail popup',
      theme,
      viewport: viewport.id,
      status: proof.passed ? 'passed' : 'failed',
      screenshot,
      proof,
    };
  });
}

async function captureCustomerArchive(browser, session, theme) {
  const viewport = { id: 'desktop', width: 1440, height: 1000 };
  return withPage(browser, session, viewport, theme, async (page) => {
    await gotoStaff(page, '/customer-archive');
    await page.locator('.archive-toolbar').waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('.archive-toolbar select').selectOption('10');
    const searchValue = process.env.FACTORY_ENGINE_PERSON_ARCHIVE_SEARCH ?? 'owner';
    await page.locator('.archive-toolbar input').fill(searchValue);
    await page.locator('.archive-toolbar button[type="submit"]').click();
    await page.waitForLoadState('networkidle', { timeout: BROWSER_TIMEOUT_MS }).catch(() => undefined);
    await page.locator('.data-table tbody tr').first().waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('.data-table tbody tr').first().dblclick({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('.customer-detail-panel').waitFor({ timeout: BROWSER_TIMEOUT_MS });
    await expectVisibleText(page, ['Shopify customers', 'Search archive', 'Customer 360', 'Shopify Orders']);
    const proof = await staffTextProof(page);
    const screenshot = await screenshot(page, `customer-archive-search-${theme}.png`);
    return {
      id: `customer-archive-search-${theme}`,
      surface: '/staff/customer-archive search and popup',
      theme,
      viewport: viewport.id,
      status: proof.passed ? 'passed' : 'failed',
      screenshot,
      proof,
    };
  });
}

async function withPage(browser, session, viewport, theme, fn) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript(({ sessionKey, sessionValue, themeKey, selectedTheme }) => {
    window.localStorage.setItem(sessionKey, JSON.stringify(sessionValue));
    window.localStorage.setItem(themeKey, selectedTheme);
    document.documentElement.dataset.theme = selectedTheme;
  }, {
    sessionKey: SESSION_KEY,
    sessionValue: publicSession(session),
    themeKey: THEME_KEY,
    selectedTheme: theme,
  });

  const startedAt = Date.now();
  try {
    const result = await fn(page);
    return {
      ...result,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const failureShot = await screenshot(page, `failed-${Date.now()}-${theme}-${viewport.id}.png`).catch(() => null);
    return {
      id: `failed-${theme}-${viewport.id}-${Date.now()}`,
      theme,
      viewport: viewport.id,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      screenshot: failureShot,
      error: error instanceof Error ? error.message : String(error),
      currentUrl: page.url(),
    };
  } finally {
    await context.close();
  }
}

async function gotoStaff(page, pathName) {
  await page.goto(`${PERSON_URL}${pathName}`, { waitUntil: 'networkidle', timeout: BROWSER_TIMEOUT_MS });
  if (/\/staff\/login\b/.test(page.url())) {
    throw new Error('The person session did not authenticate; browser was redirected to /staff/login.');
  }
}

async function waitForSettledStaffSurface(page) {
  await page.waitForTimeout(700);
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (/Welcome back|Sign in with your member account|Password is required/i.test(body)) {
    throw new Error('The browser is on the person login surface, not the authenticated staff UI.');
  }
  if (/Request failed|Failed to fetch|Unauthorized|Forbidden/i.test(body)) {
    throw new Error('Authenticated staff UI contains a load/auth error.');
  }
}

async function staffTextProof(page) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const matches = [];
  for (const term of forbiddenStaffTerms) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(term)}([^A-Za-z0-9]|$)`, 'i');
    if (pattern.test(bodyText)) matches.push(term);
  }
  return {
    passed: matches.length === 0,
    checkedTerms: forbiddenStaffTerms,
    visibleForbiddenTerms: matches,
    authSurface: !/Welcome back|Sign in/i.test(bodyText),
    textLength: bodyText.length,
  };
}

async function expectVisibleText(page, terms) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const missing = terms.filter((term) => !bodyText.toLowerCase().includes(term.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`Missing expected visible text: ${missing.join(', ')}`);
  }
}

async function screenshot(page, filename) {
  const output = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: output, fullPage: true });
  return path.relative(ROOT, output).replace(/\\/g, '/');
}

async function resolvePersonSession() {
  const envSession = readSession('FACTORY_ENGINE_PERSON_SESSION_JSON', 'FACTORY_ENGINE_PERSON_ACCESS_TOKEN', 'FACTORY_ENGINE_PERSON_REFRESH_TOKEN');
  if (envSession) return envSession;
  const email = process.env.FACTORY_ENGINE_PERSON_EMAIL;
  const password = process.env.FACTORY_ENGINE_PERSON_PASSWORD;
  if (!email || !password) return null;

  const response = await fetch(`${API_URL}/auth/person/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-tenant-id': TENANT_ID,
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  const payload = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(`Person login failed (${response.status}): ${payload?.message ?? payload?.error ?? text.slice(0, 180)}`);
  }
  if (!payload?.accessToken) {
    throw new Error('Person login did not return an accessToken.');
  }
  return payload;
}

function readSession(sessionEnv, accessEnv, refreshEnv) {
  const rawSession = process.env[sessionEnv];
  if (rawSession) {
    const parsed = JSON.parse(rawSession);
    if (typeof parsed?.accessToken === 'string') return parsed;
    throw new Error(`${sessionEnv} must contain an accessToken.`);
  }
  const accessToken = process.env[accessEnv];
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: process.env[refreshEnv] ?? '',
    tenantId: TENANT_ID,
    principal: null,
  };
}

function publicSession(session) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? '',
    tenantId: session.tenantId ?? TENANT_ID,
    principal: session.principal ?? {
      id: 'proof-person',
      type: 'member',
      email: 'proof-person@dtfbank.com',
      firstName: 'Proof',
      lastName: 'Person',
      permissions: ['person.workspace.read'],
    },
  };
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      return await import('@playwright/test');
    } catch {
      const bundledRoot = process.env.FACTORY_ENGINE_NODE_MODULES_DIR
        ?? 'C:\\Users\\mhmmd\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
      try {
        return await import(pathToFileURL(path.join(bundledRoot, 'playwright', 'index.mjs')).href);
      } catch {
        return null;
      }
    }
  }
}

function parseMaybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function finish() {
  summarize();
  await writeFile(path.join(EVIDENCE_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Person UIX proof manifest: ${path.join(EVIDENCE_DIR, 'manifest.json')}`);
  if (manifest.summary.status !== 'passed') process.exitCode = 1;
}

function summarize() {
  for (const entry of manifest.browser) {
    if (entry.status === 'passed') manifest.summary.passed += 1;
    else if (entry.status === 'skipped') manifest.summary.skipped += 1;
    else manifest.summary.failed += 1;
  }
  manifest.summary.status = manifest.summary.failed === 0 && manifest.summary.skipped === 0 ? 'passed' : 'incomplete';
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
