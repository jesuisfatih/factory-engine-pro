export interface AircallCredentials {
  apiId: string;
  apiToken: string;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
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

export class AircallClient {
  private static readonly baseUrl = 'https://api.aircall.io/v1';

  constructor(private readonly credentials: AircallCredentials) {}

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
    const response = await fetch(`${AircallClient.baseUrl}${path}${queryString}`, {
      headers: {
        accept: 'application/json',
        authorization: `Basic ${Buffer.from(`${this.credentials.apiId}:${this.credentials.apiToken}`).toString('base64')}`,
        'user-agent': 'factory-engine-pro/1.0',
      },
    });
    const text = await response.text();
    if (!response.ok) throw new AircallApiError(response.status, text, path);
    return (text ? JSON.parse(text) : {}) as T;
  }
}
