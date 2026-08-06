export interface AircallCredentials {
  apiId: string;
  apiToken: string;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

interface AircallClientOptions {
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  maxGetAttempts?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
}

export class AircallApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`Aircall ${status} on ${path}: ${body.slice(0, 200)}`);
  }
}

export class AircallTransportError extends Error {
  constructor(
    public readonly kind: 'network' | 'timeout',
    public readonly path: string,
    public readonly cause: unknown,
  ) {
    super(kind === 'timeout'
      ? `Aircall request timed out on ${path}`
      : `Aircall network request failed on ${path}`);
  }
}

export class AircallClient {
  private static readonly baseUrl = 'https://api.aircall.io/v1';
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxGetAttempts: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(
    private readonly credentials: AircallCredentials,
    options: AircallClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.random = options.random ?? Math.random;
    this.timeoutMs = positiveInt(options.timeoutMs, 20_000);
    this.maxGetAttempts = positiveInt(options.maxGetAttempts, 3);
    this.baseRetryDelayMs = positiveInt(options.baseRetryDelayMs, 500);
    this.maxRetryDelayMs = positiveInt(options.maxRetryDelayMs, 10_000);
  }

  listUsers(page = 1, perPage = 50) {
    return this.request<{ users?: unknown[]; meta?: { next_page_link?: string | null } }>('/users', {
      query: { page, per_page: perPage },
    });
  }

  listNumbers(page = 1, perPage = 50) {
    return this.request<{ numbers?: unknown[]; meta?: { next_page_link?: string | null } }>('/numbers', {
      query: { page, per_page: perPage },
    });
  }

  listCalls(params: {
    from?: number;
    to?: number;
    page?: number;
    per_page?: number;
    fetch_contact?: boolean;
    fetch_short_urls?: boolean;
    fetch_call_timeline?: boolean;
    order?: 'asc' | 'desc';
  }) {
    return this.request<{ calls?: unknown[]; meta?: { next_page_link?: string | null } }>('/calls', {
      query: params,
    });
  }

  getCallTranscription(id: string | number) {
    return this.request<Record<string, unknown>>(`/calls/${id}/transcription`);
  }

  dialUser(userId: string | number, to: string) {
    return this.request<Record<string, unknown>>(`/users/${encodeURIComponent(String(userId))}/dial`, {
      method: 'POST',
      body: { to },
    });
  }

  listWebhooks() {
    return this.request<{ webhooks?: unknown[]; meta?: { next_page_link?: string | null } }>('/webhooks');
  }

  ping() {
    return this.request<{ ping?: string }>('/ping');
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const queryString = options.query
      ? `?${Object.entries(options.query)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join('&')}`
      : '';
    const method = options.method ?? 'GET';
    const maxAttempts = method === 'GET' ? this.maxGetAttempts : 1;
    const url = `${AircallClient.baseUrl}${path}${queryString}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      let responseText: string;
      try {
        ({ response, responseText } = await this.fetchResponseWithTimeout(url, path, {
          method,
          headers: {
            accept: 'application/json',
            ...(options.body ? { 'content-type': 'application/json' } : {}),
            authorization: `Basic ${Buffer.from(`${this.credentials.apiId}:${this.credentials.apiToken}`).toString('base64')}`,
            'user-agent': 'factory-engine-pro/1.0',
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        }));
      } catch (error) {
        if (attempt >= maxAttempts || !(error instanceof AircallTransportError)) throw error;
        await this.sleep(this.retryDelay(attempt));
        continue;
      }

      if (response.ok) return (responseText ? JSON.parse(responseText) : {}) as T;

      const apiError = new AircallApiError(response.status, responseText, path);
      if (attempt >= maxAttempts || !isRetryableStatus(response.status)) throw apiError;
      await this.sleep(retryAfterMs(response.headers.get('retry-after')) ?? this.retryDelay(attempt));
    }

    throw new AircallTransportError('network', path, new Error('Aircall retry loop exhausted'));
  }

  private async fetchResponseWithTimeout(url: string, path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      const responseText = await response.text();
      return { response, responseText };
    } catch (error) {
      throw new AircallTransportError(controller.signal.aborted ? 'timeout' : 'network', path, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private retryDelay(attempt: number) {
    const exponential = Math.min(this.maxRetryDelayMs, this.baseRetryDelayMs * (2 ** (attempt - 1)));
    return Math.round(exponential * (1 + this.random() * 0.25));
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, Math.round(seconds * 1000));
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(30_000, Math.max(0, timestamp - Date.now()));
}

function positiveInt(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
