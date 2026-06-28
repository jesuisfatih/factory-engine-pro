import type { AuthSession } from '@factory-engine-pro/contracts';
import { ApiClient, type TokenStore } from '@factory-engine-pro/api-client';

const SESSION_KEY = 'factory-engine-pro.person.session';
const ADMIN_SESSION_KEY = 'factory-engine-pro.admin.session';

export const personTokenStore: TokenStore = {
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

export const personApi = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4100/api/v1',
  tenantId: import.meta.env.VITE_TENANT_ID ?? 'ten_local',
  tokenStore: personTokenStore,
});

export function readSession() {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    personTokenStore.clear();
    return null;
  }
}

export function readAdminSession() {
  const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

export function handOffToAdmin(session: AuthSession, target = '/dashboard') {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  personTokenStore.clear();
  window.location.assign(target);
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof Error && 'requestId' in error) {
    const requestId = String((error as { requestId?: string }).requestId ?? '');
    return `${error.message}${requestId ? ` (request_id: ${requestId})` : ''}`;
  }
  return error instanceof Error ? error.message : 'Request failed';
}
