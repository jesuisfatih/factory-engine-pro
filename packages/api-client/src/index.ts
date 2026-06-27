import type {
  AcceptInvitationInput,
  AuthSession,
  BootstrapTenantInput,
  CreateCustomerUserInput,
  CreateMemberInput,
  CreateMemberRoleInput,
  CreateSubUserInput,
  CustomerLoginInput,
  CustomerRegisterInput,
  ForgotPasswordInput,
  MemberLoginInput,
  ResetPasswordInput,
  TenantConfigInput,
  UpdateMemberInput,
  UpdateMemberRoleInput,
} from '@factory-engine-pro/contracts';

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setSession(session: AuthSession): void;
  clear(): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  tenantId?: string;
  tokenStore?: TokenStore;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  memberLogin(input: MemberLoginInput) {
    return this.post<AuthSession>('/auth/member/login', input, false);
  }

  personLogin(input: MemberLoginInput) {
    return this.post<AuthSession>('/auth/person/login', input, false);
  }

  customerLogin(input: CustomerLoginInput) {
    return this.post<AuthSession>('/auth/customer/login', input, false);
  }

  customerRegister(input: CustomerRegisterInput) {
    return this.post<AuthSession>('/auth/customer/register', input, false);
  }

  forgotPassword(input: ForgotPasswordInput) {
    return this.post<{ ok: true; request_id: string; devToken?: string }>('/auth/forgot-password', input, false);
  }

  resetPassword(input: ResetPasswordInput) {
    return this.post<{ ok: true }>('/auth/reset-password', input, false);
  }

  acceptInvitation(input: AcceptInvitationInput) {
    return this.post<AuthSession>('/auth/invitations/accept', input, false);
  }

  bootstrapTenant(input: BootstrapTenantInput, bootstrapToken: string) {
    return this.post<AuthSession>('/auth/bootstrap', input, false, { 'x-bootstrap-token': bootstrapToken });
  }

  me() {
    return this.get<AuthSession['principal']>('/auth/me');
  }

  members(query = '') {
    return this.get(`/identity/members${query}`);
  }

  createMember(input: CreateMemberInput) {
    return this.post('/identity/members', input);
  }

  updateMember(id: string, input: UpdateMemberInput) {
    return this.patch(`/identity/members/${id}`, input);
  }

  memberRoles() {
    return this.get('/identity/member-roles');
  }

  createMemberRole(input: CreateMemberRoleInput) {
    return this.post('/identity/member-roles', input);
  }

  updateMemberRole(id: string, input: UpdateMemberRoleInput) {
    return this.patch(`/identity/member-roles/${id}`, input);
  }

  customerUsers() {
    return this.get('/identity/customer-users');
  }

  createCustomerUser(input: CreateCustomerUserInput) {
    return this.post('/identity/customer-users', input);
  }

  subUsers() {
    return this.get('/identity/sub-users');
  }

  createSubUser(input: CreateSubUserInput) {
    return this.post('/identity/sub-users', input);
  }

  tenantConfig() {
    return this.get('/identity/tenant-config');
  }

  updateTenantConfig(input: TenantConfigInput) {
    return this.put('/identity/tenant-config', input);
  }

  private get<T>(path: string, auth = true) {
    return this.request<T>('GET', path, undefined, auth);
  }

  private post<T>(path: string, body: unknown, auth = true, extraHeaders?: Record<string, string>) {
    return this.request<T>('POST', path, body, auth, extraHeaders);
  }

  private patch<T>(path: string, body: unknown, auth = true) {
    return this.request<T>('PATCH', path, body, auth);
  }

  private put<T>(path: string, body: unknown, auth = true) {
    return this.request<T>('PUT', path, body, auth);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    auth = true,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...extraHeaders,
    };
    if (this.options.tenantId) headers['x-tenant-id'] = this.options.tenantId;
    const accessToken = this.options.tokenStore?.getAccessToken();
    if (auth && accessToken) headers.authorization = `Bearer ${accessToken}`;

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const requestId = response.headers.get('x-request-id') ?? '';
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new ApiClientError(
        payload?.message ?? `Request failed with ${response.status}`,
        response.status,
        payload?.request_id ?? requestId,
        payload?.code ?? 'api_error',
        payload?.details,
      );
    }

    return payload as T;
  }
}
