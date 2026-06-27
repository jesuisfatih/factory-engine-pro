import type {
  AcceptInvitationInput,
  AuthSession,
  BootstrapTenantInput,
  CalculatePricesInput,
  CreateCustomerUserInput,
  CreateDirectOrderInput,
  CreateMemberInput,
  CreateMemberRoleInput,
  CreateB2BAccessRequestInput,
  CreatePricingRuleInput,
  CreateSegmentInput,
  CreateServiceRequestInput,
  CreateSubUserInput,
  CustomerLoginInput,
  CustomerRegisterInput,
  ForgotPasswordInput,
  MemberLoginInput,
  ResolveReorderInput,
  ResetPasswordInput,
  TenantConfigInput,
  UpdateSegmentInput,
  UpdateServiceRequestInput,
  UpdateMemberInput,
  UpdateMemberRoleInput,
  UpdatePricingRuleInput,
  UpsertSegmentOwnershipInput,
  AssignServiceRequestInput,
  AddServiceRequestCommentInput,
  BulkServiceRequestsInput,
  ChangeServiceRequestStatusInput,
  CloseServiceRequestInput,
  RejectB2BAccessInput,
  PreviewSegmentInput,
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

  orders(query = '') {
    return this.get(`/orders${query}`);
  }

  orderStats(query = '') {
    return this.get(`/orders/stats${query}`);
  }

  order(id: string) {
    return this.get(`/orders/${id}`);
  }

  createDirectOrder(input: CreateDirectOrderInput) {
    return this.post('/orders', input);
  }

  resolveReorder(input: ResolveReorderInput) {
    return this.post('/orders/reorder/resolve', input);
  }

  commerceCustomers(query = '') {
    return this.get(`/customers${query}`);
  }

  commerceCustomerStats(query = '') {
    return this.get(`/customers/stats${query}`);
  }

  customerLists() {
    return this.get('/customers/lists');
  }

  recalculateCustomerInsights() {
    return this.post('/customers/insights/calculate', {});
  }

  generateCustomerAlarms() {
    return this.post('/customers/alarms/generate', {});
  }

  pricingRules(query = '') {
    return this.get(`/pricing/rules${query}`);
  }

  pricingRule(id: string) {
    return this.get(`/pricing/rules/${id}`);
  }

  createPricingRule(input: CreatePricingRuleInput) {
    return this.post('/pricing/rules', input);
  }

  updatePricingRule(id: string, input: UpdatePricingRuleInput) {
    return this.put(`/pricing/rules/${id}`, input);
  }

  deletePricingRule(id: string) {
    return this.delete(`/pricing/rules/${id}`);
  }

  togglePricingRule(id: string, isActive: boolean) {
    return this.put(`/pricing/rules/${id}/toggle`, { isActive });
  }

  resyncPricingRule(id: string) {
    return this.post(`/pricing/rules/${id}/resync`, {});
  }

  calculatePrices(input: CalculatePricesInput) {
    return this.post('/pricing/calculate', input);
  }

  shopifyDiscounts() {
    return this.get('/pricing/shopify-discounts');
  }

  segments() {
    return this.get('/segments');
  }

  segment(id: string) {
    return this.get(`/segments/${id}`);
  }

  segmentStats() {
    return this.get('/segments/stats');
  }

  createSegment(input: CreateSegmentInput) {
    return this.post('/segments', input);
  }

  updateSegment(id: string, input: UpdateSegmentInput) {
    return this.put(`/segments/${id}`, input);
  }

  deleteSegment(id: string) {
    return this.delete(`/segments/${id}`);
  }

  previewSegment(input: PreviewSegmentInput) {
    return this.post('/segments/preview', input);
  }

  evaluateSegment(id: string) {
    return this.post(`/segments/${id}/evaluate`, {});
  }

  evaluateAllSegments() {
    return this.post('/segments/evaluate-all', {});
  }

  upsertSegmentOwnership(segmentId: string, input: UpsertSegmentOwnershipInput) {
    return this.put(`/segments/${segmentId}/ownership`, input);
  }

  removeSegmentOwnership(segmentId: string, ownershipId?: string) {
    return this.delete(`/segments/${segmentId}/ownership${ownershipId ? `?ownershipId=${encodeURIComponent(ownershipId)}` : ''}`);
  }

  supportRequests(query = '') {
    return this.get(`/support${query}`);
  }

  supportStats(query = '') {
    return this.get(`/support/stats/overview${query}`);
  }

  supportCustomers(query = '') {
    return this.get(`/support/customers${query}`);
  }

  supportRequest(id: string) {
    return this.get(`/support/${id}`);
  }

  createSupportRequest(input: CreateServiceRequestInput) {
    return this.post('/support', input);
  }

  updateSupportRequest(id: string, input: UpdateServiceRequestInput) {
    return this.patch(`/support/${id}`, input);
  }

  assignSupportRequest(id: string, input: AssignServiceRequestInput) {
    return this.post(`/support/${id}/assign`, input);
  }

  changeSupportStatus(id: string, input: ChangeServiceRequestStatusInput) {
    return this.patch(`/support/${id}/status`, input);
  }

  addSupportComment(id: string, input: AddServiceRequestCommentInput) {
    return this.post(`/support/${id}/comments`, input);
  }

  closeSupportRequest(id: string, input: CloseServiceRequestInput) {
    return this.post(`/support/${id}/close`, input);
  }

  bulkSupportRequests(input: BulkServiceRequestsInput) {
    return this.post('/support/bulk', input);
  }

  b2bAccessRequests(query = '') {
    return this.get(`/b2b-access${query}`);
  }

  b2bAccessRequest(id: string) {
    return this.get(`/b2b-access/${id}`);
  }

  submitB2BAccessRequest(input: CreateB2BAccessRequestInput, taxCertificate?: Blob) {
    if (taxCertificate) {
      const form = new FormData();
      Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined && value !== null) form.set(key, String(value));
      });
      form.set('taxCertificate', taxCertificate);
      return this.requestForm<{ success: true; message: string; requestId: string }>('POST', '/b2b-access', form, false);
    }
    return this.post<{ success: true; message: string; requestId: string }>('/b2b-access', input, false);
  }

  approveB2BAccessRequest(id: string) {
    return this.post(`/b2b-access/${id}/approve`, {});
  }

  rejectB2BAccessRequest(id: string, input: RejectB2BAccessInput) {
    return this.post(`/b2b-access/${id}/reject`, input);
  }

  b2bAccessCertificate(id: string) {
    return this.requestBlob(`/b2b-access/${id}/certificate`);
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

  private delete<T>(path: string, auth = true) {
    return this.request<T>('DELETE', path, undefined, auth);
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

  private async requestForm<T>(
    method: string,
    path: string,
    body: FormData,
    auth = true,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...extraHeaders,
    };
    if (this.options.tenantId) headers['x-tenant-id'] = this.options.tenantId;
    const accessToken = this.options.tokenStore?.getAccessToken();
    if (auth && accessToken) headers.authorization = `Bearer ${accessToken}`;

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      body,
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

  private async requestBlob(path: string, auth = true): Promise<Blob> {
    const headers: Record<string, string> = { accept: '*/*' };
    if (this.options.tenantId) headers['x-tenant-id'] = this.options.tenantId;
    const accessToken = this.options.tokenStore?.getAccessToken();
    if (auth && accessToken) headers.authorization = `Bearer ${accessToken}`;

    const response = await fetch(`${this.options.baseUrl}${path}`, { method: 'GET', headers });
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id') ?? '';
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      throw new ApiClientError(
        payload?.message ?? `Request failed with ${response.status}`,
        response.status,
        payload?.request_id ?? requestId,
        payload?.code ?? 'api_error',
        payload?.details,
      );
    }
    return response.blob();
  }
}
