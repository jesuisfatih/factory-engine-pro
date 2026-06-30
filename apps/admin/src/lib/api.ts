import type { AuthSession } from '@factory-engine-pro/contracts';
import { ApiClient, type TokenStore } from '@factory-engine-pro/api-client';

const SESSION_KEY = 'factory-engine-pro.admin.session';
const PERSON_SESSION_KEY = 'factory-engine-pro.person.session';
const SESSION_CHANGED_EVENT = 'factory-engine-pro.admin.session.changed';
export const ADMIN_API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4120/api/v1';
export const ADMIN_TENANT_ID = import.meta.env.VITE_TENANT_ID ?? 'ten_remote_test';

function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export const adminTokenStore: TokenStore = {
  getAccessToken() {
    return readSession()?.accessToken ?? null;
  },
  getRefreshToken() {
    return readSession()?.refreshToken ?? null;
  },
  setSession(session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notifySessionChanged();
  },
  clear() {
    window.localStorage.removeItem(SESSION_KEY);
    notifySessionChanged();
  },
};

export const adminApi = new ApiClient({
  baseUrl: ADMIN_API_BASE_URL,
  tenantId: ADMIN_TENANT_ID,
  tokenStore: adminTokenStore,
});

export function readSession() {
  const raw = readSessionSnapshot();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    adminTokenStore.clear();
    return null;
  }
}

export function readPersonSession() {
  const raw = window.localStorage.getItem(PERSON_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(PERSON_SESSION_KEY);
    return null;
  }
}

export function readSessionSnapshot() {
  return window.localStorage.getItem(SESSION_KEY);
}

export function handOffToPerson(session: AuthSession, target = '/staff/queue') {
  window.localStorage.setItem(PERSON_SESSION_KEY, JSON.stringify(session));
  adminTokenStore.clear();
  window.location.assign(target);
}

export function clearSurfaceSessions() {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(PERSON_SESSION_KEY);
  notifySessionChanged();
}

export function subscribeSession(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) callback();
  };
  window.addEventListener(SESSION_CHANGED_EVENT, callback);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof Error && 'requestId' in error) {
    const requestId = String((error as { requestId?: string }).requestId ?? '');
    return `${error.message}${requestId ? ` (request_id: ${requestId})` : ''}`;
  }
  return error instanceof Error ? error.message : 'Request failed';
}
