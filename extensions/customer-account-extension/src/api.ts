function normalizeApiBase(url?: string) {
  if (!url || !url.startsWith('https://')) return '';
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/customer-account')
    ? trimmed
    : `${trimmed}/api/v1/customer-account`;
}

export function apiBaseError(url?: string) {
  if (!url?.trim()) return 'Account services are not configured yet.';
  if (!normalizeApiBase(url)) return 'Account services must use a secure https API URL.';
  return '';
}

export async function apiFetch<T>(baseUrl: string | undefined, path: string, sessionToken: string): Promise<T> {
  const apiBase = normalizeApiBase(baseUrl);
  if (!apiBase) throw new Error(apiBaseError(baseUrl));
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${sessionToken}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(customerSafeError(response.status, text));
  }
  return text ? JSON.parse(text) as T : null as T;
}

function customerSafeError(status: number, text: string) {
  if (status === 401 || status === 403) {
    return 'This Shopify account is not linked to an active customer portal account yet.';
  }
  if (status >= 500) return 'Account services are temporarily unavailable.';
  return text.slice(0, 240) || 'Account services could not load.';
}
