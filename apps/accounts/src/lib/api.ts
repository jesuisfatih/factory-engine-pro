import type { AuthSession } from '@factory-engine-pro/contracts';
import { ApiClient, type TokenStore } from '@factory-engine-pro/api-client';

const SESSION_KEY = 'factory-engine-pro.accounts.session';

export const accountsTokenStore: TokenStore = {
  getAccessToken() {
    return readSession()?.accessToken ?? null;
  },
  getRefreshToken() {
    return readSession()?.refreshToken ?? null;
  },
  setSession(session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },
  clear() {
    window.localStorage.removeItem(SESSION_KEY);
  },
};

export const accountsApi = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4120/api/v1',
  tenantId: import.meta.env.VITE_TENANT_ID ?? 'ten_remote_test',
  tokenStore: accountsTokenStore,
});

export function readSession() {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    accountsTokenStore.clear();
    return null;
  }
}

export function apiErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  const message = error instanceof Error ? error.message : '';
  if (!message || unsafeCustomerErrorCopy(message)) {
    return customerFallbackError(status);
  }
  return message;
}

function customerFallbackError(status: number) {
  if (status === 401 || status === 403) {
    return 'Please sign in again or ask the account owner for access.';
  }
  if (status === 404) {
    return 'That record is no longer available for this account.';
  }
  if (status === 409) {
    return 'This changed while you were working. Refresh the page and try again.';
  }
  if (status >= 400 && status < 500) {
    return 'Please check the information and try again.';
  }
  if (status >= 500) {
    return 'Account services are temporarily unavailable. Please try again shortly.';
  }
  return 'Request failed. Please try again.';
}

function unsafeCustomerErrorCopy(message: string) {
  return /\b(tenant|provider|workflow|queue|routing|source|axis|rule|suppression|metadata|debug|stack trace|raw payload|raw json|admin[_\s-]*graphql|staff note|campaign|audience|flow)\b/i.test(message)
    || /\b(token|authorization|secret|passwordhash|request_id)\b/i.test(message);
}
