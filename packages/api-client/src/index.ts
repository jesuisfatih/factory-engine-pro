import type {
  AcceptInvitationInput,
  AccountAddressInput,
  AiHealthResponse,
  AircallBackfillRecentInput,
  AircallBackfillRecentResponse,
  AircallCallEventsResponse,
  AssignCustomerAxisPrimaryInput,
  TranscriptResolverTestInput,
  TranscriptResolverTestResponse,
  AircallLinkUserInput,
  AircallConnectionTestResponse,
  AircallNumbersResponse,
  AircallResolverReprocessInput,
  AircallResolverReprocessResponse,
  AircallSyncLogsResponse,
  AircallUsersResponse,
  AircallWebhookStatusResponse,
  AuthSession,
  BootstrapTenantInput,
  CalculatePricesInput,
  CustomerAxisAssignmentsResponse,
  CreateCustomerUserInput,
  CreateDirectOrderInput,
  CreateMemberInput,
  CreateMemberRoleInput,
  CreateB2BAccessRequestInput,
  CreateAccountSupportTicketInput,
  CreatePricingRuleInput,
  CreateSegmentInput,
  CreateServiceRequestInput,
  CreateSubUserInput,
  BackfillWorkflowRuleInput,
  ActiveWorkflowRuleStatsResponse,
  CustomerLoginInput,
  CustomerRegisterInput,
  ForgotPasswordInput,
  MemberLoginInput,
  ResolveReorderInput,
  ResetPasswordInput,
  RollbackWorkflowRuleInput,
  SaveWorkflowRuleInput,
  TenantConfigInput,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
  UpdateSegmentInput,
  UpdateServiceRequestInput,
  UpdateMemberInput,
  UpdateMemberRoleInput,
  UpdatePricingRuleInput,
  UpsertSegmentOwnershipInput,
  WorkflowEnumCatalogResponse,
  WorkflowEnumChainProbeResponse,
  WorkflowTriggerFireInput,
  WorkflowTriggerFireResponse,
  WorkflowRuleDto,
  WorkflowRuleBackfillReportsResponse,
  WorkflowRuleBackfillRunResponse,
  WorkflowRuleVersionsResponse,
  WorkflowRulesResponse,
  AssignServiceRequestInput,
  AddServiceRequestCommentInput,
  BulkServiceRequestsInput,
  ChangeServiceRequestStatusInput,
  CloseServiceRequestInput,
  RejectB2BAccessInput,
  PreviewSegmentInput,
  RecordCustomerAxisNoAutoReassignInput,
  MailProviderHealthResponse,
  MovePersonQueueCardInput,
  SendPersonMessageInput,
  SendTestMailInput,
  ShopifyConnectionTestResponse,
  ShopifyInitialSyncInput,
  ShopifyInitialSyncResponse,
  ShopifySyncStatus,
  SavePersonNoteInput,
  SavePersonTaskNoteInput,
  SchedulePersonTaskFollowUpInput,
  SweepOverdueServiceRequestsInput,
  SweepOverdueServiceRequestsResponse,
  TogglePersonQueuePinInput,
  CreatePersonRequestInput,
  PersonTaskBriefDetail,
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

  deleteMemberRole(id: string) {
    return this.delete(`/identity/member-roles/${id}`);
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

  workspaceBrand() {
    return this.get<{ workspaceName: string | null; brandBadge: string | null; brandLogo: string | null }>('/identity/workspace-brand', false);
  }

  updateTenantConfig(input: TenantConfigInput) {
    return this.patch('/identity/tenant-config', input);
  }

  accountProfile() {
    return this.get('/accounts/profile');
  }

  updateAccountProfile(input: UpdateAccountProfileInput) {
    return this.patch('/accounts/profile', input);
  }

  updateAccountPassword(input: UpdateAccountPasswordInput) {
    return this.post('/accounts/password', input);
  }

  accountAddresses() {
    return this.get('/accounts/addresses');
  }

  saveAccountAddress(input: AccountAddressInput) {
    return this.put(`/accounts/addresses/${encodeURIComponent(input.type)}`, input);
  }

  deleteAccountAddress(type: string) {
    return this.delete(`/accounts/addresses/${encodeURIComponent(type)}`);
  }

  accountOrders() {
    return this.get('/accounts/orders');
  }

  accountReorderTemplates() {
    return this.get('/accounts/reorder-templates');
  }

  accountProducts() {
    return this.get('/accounts/products');
  }

  accountTracking() {
    return this.get('/accounts/tracking');
  }

  accountPickups() {
    return this.get('/accounts/pickup');
  }

  accountInvoices() {
    return this.get('/accounts/invoices');
  }

  accountDocuments() {
    return this.get('/accounts/documents');
  }

  accountDocumentDownload(id: string) {
    return this.requestBlob(`/accounts/documents/${encodeURIComponent(id)}/download`);
  }

  accountSupportTickets() {
    return this.get('/accounts/support');
  }

  createAccountSupportTicket(input: CreateAccountSupportTicketInput) {
    return this.post('/accounts/support', input);
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

  customerAssignments(customerId: string) {
    return this.get<CustomerAxisAssignmentsResponse>(`/customers/${encodeURIComponent(customerId)}/assignments`);
  }

  assignCustomerAxisPrimary(customerId: string, axis: string, input: AssignCustomerAxisPrimaryInput) {
    return this.put<CustomerAxisAssignmentsResponse>(
      `/customers/${encodeURIComponent(customerId)}/assignments/${encodeURIComponent(axis)}/primary`,
      input,
    );
  }

  recordCustomerAxisNoAutoReassign(customerId: string, axis: string, input: RecordCustomerAxisNoAutoReassignInput) {
    return this.post<CustomerAxisAssignmentsResponse>(
      `/customers/${encodeURIComponent(customerId)}/assignments/${encodeURIComponent(axis)}/no-auto-reassign`,
      input,
    );
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

  personWorkspaceSummary() {
    return this.get('/person/workspace/summary');
  }

  personQueueCards() {
    return this.get('/person/workspace/queue');
  }

  personDailyOperations() {
    return this.get('/person/workspace/daily-operations');
  }

  movePersonQueueCard(id: string, input: MovePersonQueueCardInput) {
    return this.patch(`/person/workspace/queue/${encodeURIComponent(id)}/move`, input);
  }

  togglePersonQueuePin(id: string, input: TogglePersonQueuePinInput = {}) {
    return this.post(`/person/workspace/queue/${encodeURIComponent(id)}/pin`, input);
  }

  togglePersonCustomerPin(customerId: string, input: TogglePersonQueuePinInput = {}) {
    return this.post(`/person/workspace/customers/${encodeURIComponent(customerId)}/pin`, input);
  }

  personTaskBrief(id: string) {
    return this.get<PersonTaskBriefDetail>(`/person/workspace/tasks/${encodeURIComponent(id)}/brief`);
  }

  savePersonTaskNote(id: string, input: SavePersonTaskNoteInput) {
    return this.post<PersonTaskBriefDetail>(`/person/workspace/tasks/${encodeURIComponent(id)}/notes`, input);
  }

  schedulePersonTaskFollowUp(id: string, input: SchedulePersonTaskFollowUpInput) {
    return this.post<PersonTaskBriefDetail>(`/person/workspace/tasks/${encodeURIComponent(id)}/calendar`, input);
  }

  personCustomers() {
    return this.get('/person/workspace/customers');
  }

  personCalendarEvents() {
    return this.get('/person/workspace/calendar');
  }

  personTeammates() {
    return this.get('/person/workspace/messages/teammates');
  }

  personThread(threadId: string) {
    return this.get(`/person/workspace/messages/threads/${encodeURIComponent(threadId)}`);
  }

  sendPersonMessage(input: SendPersonMessageInput) {
    return this.post('/person/workspace/messages', input);
  }

  personNotes() {
    return this.get('/person/workspace/notes');
  }

  savePersonNote(input: SavePersonNoteInput) {
    return this.post('/person/workspace/notes', input);
  }

  personEmails() {
    return this.get('/person/workspace/emails');
  }

  personAnnouncements() {
    return this.get('/person/workspace/announcements');
  }

  personNotifications() {
    return this.get('/person/workspace/notifications');
  }

  personTraining() {
    return this.get('/person/workspace/training');
  }

  personRequests() {
    return this.get('/person/workspace/requests');
  }

  createPersonRequest(input: CreatePersonRequestInput) {
    return this.post('/person/workspace/requests', input);
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

  sweepOverdueSupportRequests(input: SweepOverdueServiceRequestsInput = { limit: 100 }) {
    return this.post<SweepOverdueServiceRequestsResponse>('/support/overdue/sweep', input);
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

  mailDeliveries(query = '') {
    return this.get(`/mail/deliveries${query}`);
  }

  mailDelivery(id: string) {
    return this.get(`/mail/deliveries/${id}`);
  }

  retryMailDelivery(id: string) {
    return this.post(`/mail/deliveries/${id}/retry`, {});
  }

  mailHealth() {
    return this.get<MailProviderHealthResponse>('/mail/health');
  }

  sendTestMail(input: SendTestMailInput) {
    return this.post('/mail/test', input);
  }

  aircallUsers() {
    return this.get<AircallUsersResponse>('/aircall/users');
  }

  syncAircallUsers() {
    return this.post<AircallUsersResponse>('/aircall/users/sync', {});
  }

  linkAircallUser(aircallUserId: string, input: AircallLinkUserInput) {
    return this.post<AircallUsersResponse>(`/aircall/users/${aircallUserId}/link`, input);
  }

  unlinkAircallUser(aircallUserId: string) {
    return this.delete<AircallUsersResponse>(`/aircall/users/${aircallUserId}/link`);
  }

  aircallNumbers() {
    return this.get<AircallNumbersResponse>('/aircall/numbers');
  }

  syncAircallNumbers() {
    return this.post<AircallNumbersResponse>('/aircall/numbers/sync', {});
  }

  aircallWebhookStatus() {
    return this.get<AircallWebhookStatusResponse>('/aircall/webhooks/status');
  }

  testAircallConnection() {
    return this.get<AircallConnectionTestResponse>('/aircall/connection-test');
  }

  aircallSyncLogs() {
    return this.get<AircallSyncLogsResponse>('/aircall/sync-logs');
  }

  aircallCallEvents() {
    return this.get<AircallCallEventsResponse>('/aircall/calls');
  }

  backfillRecentAircallCalls(input: AircallBackfillRecentInput = { recentDays: 3, maxPages: 20 }) {
    return this.post<AircallBackfillRecentResponse>('/aircall/calls/backfill-recent', input);
  }

  reprocessAircallResolver(input: AircallResolverReprocessInput) {
    return this.post<AircallResolverReprocessResponse>('/aircall/calls/resolver/reprocess', input);
  }

  aiHealth() {
    return this.get<AiHealthResponse>('/ai/health');
  }

  aiResolverPrompt() {
    return this.get<{ promptKey: string; promptVersion: string; prompt: string }>('/ai/resolver-prompt');
  }

  aiTranscriptResolverTest(input: TranscriptResolverTestInput) {
    return this.post<TranscriptResolverTestResponse>('/ai/transcript-resolver/test', input);
  }

  workflowEnumCatalog() {
    return this.get<WorkflowEnumCatalogResponse>('/rules/catalog');
  }

  workflowEnumChainProbe() {
    return this.get<WorkflowEnumChainProbeResponse>('/rules/enum-chain');
  }

  workflowRules() {
    return this.get<WorkflowRulesResponse>('/rules');
  }

  workflowRule(id: string) {
    return this.get<WorkflowRuleDto>(`/rules/${encodeURIComponent(id)}`);
  }

  createWorkflowRule(input: SaveWorkflowRuleInput) {
    return this.post<WorkflowRuleDto>('/rules', input);
  }

  updateWorkflowRule(id: string, input: SaveWorkflowRuleInput) {
    return this.put<WorkflowRuleDto>(`/rules/${encodeURIComponent(id)}`, input);
  }

  workflowRuleVersions(id: string) {
    return this.get<WorkflowRuleVersionsResponse>(`/rules/${encodeURIComponent(id)}/versions`);
  }

  rollbackWorkflowRule(id: string, input: RollbackWorkflowRuleInput) {
    return this.post<WorkflowRuleDto>(`/rules/${encodeURIComponent(id)}/rollback`, input);
  }

  backfillWorkflowRule(id: string, input: BackfillWorkflowRuleInput) {
    return this.post<WorkflowRuleBackfillRunResponse>(`/rules/${encodeURIComponent(id)}/backfill`, input);
  }

  workflowRuleBackfills(id: string) {
    return this.get<WorkflowRuleBackfillReportsResponse>(`/rules/${encodeURIComponent(id)}/backfills`);
  }

  workflowRuleActiveStats(query = '?days=7') {
    return this.get<ActiveWorkflowRuleStatsResponse>(`/rules/stats/active${query}`);
  }

  fireWorkflowTrigger(input: WorkflowTriggerFireInput) {
    return this.post<WorkflowTriggerFireResponse>('/rules/events/fire', input);
  }

  shopifySyncStatus() {
    return this.get<ShopifySyncStatus>('/sync/status');
  }

  testShopifyConnection() {
    return this.get<ShopifyConnectionTestResponse>('/sync/connection-test');
  }

  triggerShopifyInitialSync(input: ShopifyInitialSyncInput = {}) {
    return this.post<ShopifyInitialSyncResponse>('/sync/initial', input);
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
