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
  AssignDefaultCustomerAxisInput,
  AssignDefaultCustomerAxisResponse,
  AuthSession,
  BootstrapWorkflowDefaultsResponse,
  BootstrapTenantInput,
  CalculatePricesInput,
  CallCenterActionResult,
  CallCenterCreateCustomerTaskInput,
  CallCenterOverview,
  CallCenterReplyNoteInput,
  CallCenterSaveCustomerNoteInput,
  CallCenterSyncResult,
  CallCenterTransferTaskInput,
  CommissionProfileDto,
  CommissionRequestDto,
  CustomerAxisAssignmentsResponse,
  CustomerDetailPanelDto,
  CreateCustomerUserInput,
  CreateDirectOrderInput,
  TransferOrderToMemberInput,
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
  LogoutInput,
  MemberLoginInput,
  ResolveReorderInput,
  ResetPasswordInput,
  ReviewCommissionRequestInput,
  RollbackWorkflowRuleInput,
  RollingBackfillRunResponse,
  RollingBackfillStatusResponse,
  RollingBackfillTriggerInput,
  SaveWorkflowRuleInput,
  TenantConfigInput,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
  UpdateSegmentInput,
  UpdateServiceRequestInput,
  UpdateMemberInput,
  UpdateMemberRoleInput,
  UpdatePricingRuleInput,
  UpsertCommissionProfileInput,
  UpsertSegmentOwnershipInput,
  WorkflowEnumCatalogResponse,
  WorkflowEnumChainProbeResponse,
  WorkflowTriggerFireInput,
  WorkflowTriggerFireResponse,
  WorkflowRuleDto,
  WorkflowRuleBackfillReportsResponse,
  WorkflowRuleBackfillRunResponse,
  WorkflowRuleExecutionsResponse,
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
  MailMarketingContactQuery,
  MailMarketingSettingsInput,
  MailTemplateQuery,
  PatchEmailTemplateInput,
  PatchMailAudienceInput,
  PatchMailFlowInput,
  MovePersonQueueCardInput,
  PersonDailyOperationRange,
  ArchivePersonDailyCallResult,
  ReorderPersonDailyCallInput,
  ReorderPersonDailyCallResult,
  ReplyPersonNoteInput,
  SendPersonMessageInput,
  SendTestMailInput,
  ShopifyConnectionTestResponse,
  ShopifyInitialSyncInput,
  ShopifyInitialSyncResponse,
  ShopifySyncStatus,
  SyncShopifySegmentsInput,
  SyncShopifySegmentsResponse,
  SavePersonNoteInput,
  SavePersonCustomerNoteInput,
  SavePersonTaskNoteInput,
  SaveEmailTemplateInput,
  SaveMailAudienceInput,
  SaveMailFlowInput,
  SavePersonEmailDraftInput,
  SubmitCommissionRequestInput,
  SchedulePersonTaskFollowUpInput,
  SweepOverdueServiceRequestsInput,
  SweepOverdueServiceRequestsResponse,
  TogglePersonQueuePinInput,
  CreatePersonRequestInput,
  PersonTaskBriefDetail,
  PersonEmailContact,
  PersonTaskSyncResult,
  PersonTaskTransferResult,
  PersonTransferTarget,
  TransferPersonTaskInput,
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
  private refreshPromise?: Promise<boolean>;
  private authEpoch = 0;

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

  async logout(input: LogoutInput = {}) {
    const tokenStore = this.options.tokenStore;
    const accessToken = tokenStore?.getAccessToken();
    const refreshToken = input.refreshToken ?? tokenStore?.getRefreshToken() ?? undefined;
    this.authEpoch += 1;
    this.refreshPromise = undefined;
    tokenStore?.clear();

    try {
      const headers = this.buildHeaders(false, {}, 'application/json');
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
      const parsed = await this.parseJsonResponse(await fetch(`${this.options.baseUrl}/auth/logout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refreshToken }),
      }));

      if (!parsed.ok) {
        throw new ApiClientError(
          parsed.payload?.message ?? `Request failed with ${parsed.status}`,
          parsed.status,
          parsed.payload?.request_id ?? parsed.requestId,
          parsed.payload?.code ?? 'api_error',
          parsed.payload?.details,
        );
      }

      return parsed.payload as { ok: true };
    } finally {
      tokenStore?.clear();
    }
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

  orderDetail(id: string) {
    return this.get(`/orders/${encodeURIComponent(id)}/detail`);
  }

  transferOrder(id: string, input: TransferOrderToMemberInput) {
    return this.post(`/orders/${encodeURIComponent(id)}/transfer`, input);
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

  customerDetail(customerId: string) {
    return this.get<CustomerDetailPanelDto>(`/customers/${encodeURIComponent(customerId)}/detail`);
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

  assignDefaultCustomerAxis(input: Partial<AssignDefaultCustomerAxisInput> = {}) {
    return this.post<AssignDefaultCustomerAxisResponse>('/customers/assign-default-axis', input);
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

  shopifyCustomerSegments(query = '') {
    return this.get(`/shopify-customers/segments${query}`);
  }

  syncShopifyCustomerSegment(id: string) {
    return this.post(`/shopify-customers/segments/sync?id=${encodeURIComponent(id)}`, {});
  }

  syncShopifySegments(input: SyncShopifySegmentsInput = {}) {
    return this.post<SyncShopifySegmentsResponse>('/segments/sync-shopify', input);
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

  callCenterOverview() {
    return this.get<CallCenterOverview>('/call-center/overview');
  }

  syncCallCenterTasks() {
    return this.post<CallCenterSyncResult>('/call-center/tasks/sync', {});
  }

  callCenterCustomerDetail(customerId: string) {
    return this.get<CustomerDetailPanelDto>(`/call-center/customers/${encodeURIComponent(customerId)}/detail`);
  }

  callCenterSaveCustomerNote(customerId: string, input: CallCenterSaveCustomerNoteInput) {
    return this.post<CustomerDetailPanelDto>(`/call-center/customers/${encodeURIComponent(customerId)}/notes`, input);
  }

  callCenterReplyNote(noteTaskId: string, input: CallCenterReplyNoteInput) {
    return this.post<{ ok: true; taskId: string }>(`/call-center/notes/${encodeURIComponent(noteTaskId)}/replies`, input);
  }

  callCenterTransferTask(id: string, input: CallCenterTransferTaskInput) {
    return this.post<CallCenterActionResult>(`/call-center/tasks/${encodeURIComponent(id)}/transfer`, input);
  }

  callCenterCreateCustomerTask(customerId: string, input: CallCenterCreateCustomerTaskInput) {
    return this.post<CallCenterActionResult>(`/call-center/customers/${encodeURIComponent(customerId)}/tasks`, input);
  }

  commissionProfiles() {
    return this.get<CommissionProfileDto[]>('/commissions/profiles');
  }

  commissionRequests() {
    return this.get<CommissionRequestDto[]>('/commissions/requests');
  }

  myCommissionRequests() {
    return this.get<CommissionRequestDto[]>('/commissions/requests/mine');
  }

  submitCommissionRequest(input: SubmitCommissionRequestInput) {
    return this.post<CommissionRequestDto>('/commissions/requests', input);
  }

  reviewCommissionRequest(id: string, input: ReviewCommissionRequestInput) {
    return this.post<CommissionRequestDto>(`/commissions/requests/${encodeURIComponent(id)}/review`, input);
  }

  upsertCommissionProfile(id: string, input: UpsertCommissionProfileInput) {
    return this.put<CommissionProfileDto>(`/commissions/profiles/${encodeURIComponent(id)}`, input);
  }

  deleteCommissionProfile(id: string) {
    return this.delete<{ ok: boolean }>(`/commissions/profiles/${encodeURIComponent(id)}`);
  }

  personWorkspaceSummary() {
    return this.get('/person/workspace/summary');
  }

  personQueueCards() {
    return this.get('/person/workspace/queue');
  }

  personDailyOperations(range: PersonDailyOperationRange = 'last7d') {
    const query = range === 'last7d' ? '' : `?range=${encodeURIComponent(range)}`;
    return this.get(`/person/workspace/daily-operations${query}`);
  }

  movePersonQueueCard(id: string, input: MovePersonQueueCardInput) {
    return this.patch(`/person/workspace/queue/${encodeURIComponent(id)}/move`, input);
  }

  reorderPersonDailyCalls(input: ReorderPersonDailyCallInput) {
    return this.patch<ReorderPersonDailyCallResult>('/person/workspace/daily-call-order', input);
  }

  archivePersonDailyCall(id: string) {
    return this.post<ArchivePersonDailyCallResult>(`/person/workspace/tasks/${encodeURIComponent(id)}/archive`, {});
  }

  syncPersonTasks() {
    return this.post<PersonTaskSyncResult>('/person/workspace/tasks/sync', {});
  }

  togglePersonQueuePin(id: string, input: TogglePersonQueuePinInput = {}) {
    return this.post(`/person/workspace/queue/${encodeURIComponent(id)}/pin`, input);
  }

  togglePersonCustomerPin(customerId: string, input: TogglePersonQueuePinInput = {}) {
    return this.post(`/person/workspace/customers/${encodeURIComponent(customerId)}/pin`, input);
  }

  personTransferTargets() {
    return this.get<PersonTransferTarget[]>('/person/workspace/transfer-targets');
  }

  transferPersonTask(id: string, input: TransferPersonTaskInput) {
    return this.post<PersonTaskTransferResult>(`/person/workspace/tasks/${encodeURIComponent(id)}/transfer`, input);
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

  personCustomerArchive() {
    return this.get('/person/workspace/customer-archive');
  }

  personCustomerDetail(customerId: string) {
    return this.get<CustomerDetailPanelDto>(`/person/workspace/customers/${encodeURIComponent(customerId)}/detail`);
  }

  personCustomerArchiveDetail(customerId: string) {
    return this.get<CustomerDetailPanelDto>(`/person/workspace/customer-archive/${encodeURIComponent(customerId)}/detail`);
  }

  savePersonCustomerNote(customerId: string, input: SavePersonCustomerNoteInput) {
    return this.post<CustomerDetailPanelDto>(`/person/workspace/customers/${encodeURIComponent(customerId)}/notes`, input);
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

  replyPersonNote(id: string, input: ReplyPersonNoteInput) {
    return this.post(`/person/workspace/notes/${encodeURIComponent(id)}/replies`, input);
  }

  personEmails() {
    return this.get('/person/workspace/emails');
  }

  personEmailContacts() {
    return this.get<PersonEmailContact[]>('/person/workspace/emails/contacts');
  }

  savePersonEmailDraft(input: SavePersonEmailDraftInput) {
    return this.post('/person/workspace/emails/drafts', input);
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

  emailTemplateWorkspace() {
    return this.get('/email-templates/workspace');
  }

  emailTemplates(query = '') {
    return this.get(`/email-templates${query}`);
  }

  emailTemplate(id: string) {
    return this.get(`/email-templates/variants/${encodeURIComponent(id)}`);
  }

  createEmailTemplate(input: SaveEmailTemplateInput) {
    return this.post('/email-templates/events/' + encodeURIComponent(input.eventKey) + '/variants', input);
  }

  updateEmailTemplate(id: string, input: PatchEmailTemplateInput) {
    return this.patch(`/email-templates/variants/${encodeURIComponent(id)}`, input);
  }

  mailMarketingOverview() {
    return this.get('/mail-marketing/overview');
  }

  mailMarketingSettingsBootstrap() {
    return this.get('/mail-marketing/settings/bootstrap');
  }

  mailMarketingSettings() {
    return this.get('/mail-marketing/settings');
  }

  updateMailMarketingSettings(input: MailMarketingSettingsInput) {
    return this.patch('/mail-marketing/settings', input);
  }

  mailMarketingContacts(input: MailMarketingContactQuery = { limit: 50 }) {
    const params = new URLSearchParams();
    if (input.search) params.set('search', input.search);
    if (input.sendable !== undefined) params.set('sendable', String(input.sendable));
    params.set('limit', String(input.limit ?? 50));
    return this.get(`/mail-marketing/contacts?${params.toString()}`);
  }

  mailMarketingTemplates(query: string | MailTemplateQuery = '') {
    if (typeof query === 'string') return this.get(`/mail-marketing/templates${query}`);
    const params = new URLSearchParams();
    if (query.type) params.set('type', query.type);
    if (query.status) params.set('status', query.status);
    if (query.search) params.set('search', query.search);
    params.set('limit', String(query.limit ?? 100));
    return this.get(`/mail-marketing/templates?${params.toString()}`);
  }

  createMailMarketingTemplate(input: SaveEmailTemplateInput) {
    return this.post('/mail-marketing/templates', input);
  }

  updateMailMarketingTemplate(id: string, input: PatchEmailTemplateInput) {
    return this.patch(`/mail-marketing/templates/${encodeURIComponent(id)}`, input);
  }

  mailMarketingAudiences() {
    return this.get('/mail-marketing/audiences');
  }

  createMailMarketingAudience(input: SaveMailAudienceInput) {
    return this.post('/mail-marketing/audiences', input);
  }

  updateMailMarketingAudience(id: string, input: PatchMailAudienceInput) {
    return this.patch(`/mail-marketing/audiences/${encodeURIComponent(id)}`, input);
  }

  mailMarketingFlows() {
    return this.get('/mail-marketing/flows');
  }

  createMailMarketingFlow(input: SaveMailFlowInput) {
    return this.post('/mail-marketing/flows', input);
  }

  updateMailMarketingFlow(id: string, input: PatchMailFlowInput) {
    return this.patch(`/mail-marketing/flows/${encodeURIComponent(id)}`, input);
  }

  publishMailMarketingFlow(id: string) {
    return this.post(`/mail-marketing/flows/${encodeURIComponent(id)}/publish`, {});
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

  reprocessResolvedAircall(input: Partial<AircallResolverReprocessInput> = {}) {
    return this.post<AircallResolverReprocessResponse>('/aircall/reprocess-resolved', input);
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

  bootstrapDefaultWorkflowRules() {
    return this.post<BootstrapWorkflowDefaultsResponse>('/rules/defaults/bootstrap', {});
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

  workflowRuleExecutions(id: string) {
    return this.get<WorkflowRuleExecutionsResponse>(`/rules/${encodeURIComponent(id)}/executions`);
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

  rollingBackfillStatus() {
    return this.get<RollingBackfillStatusResponse>('/backfill/rolling-7d/status');
  }

  triggerRollingBackfill(input: Partial<RollingBackfillTriggerInput> = {}) {
    return this.post<RollingBackfillRunResponse>('/backfill/rolling-7d', input);
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
    let parsed = await this.parseJsonResponse(await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers: this.buildHeaders(auth, extraHeaders, 'application/json'),
      body: body === undefined ? undefined : JSON.stringify(body),
    }));

    if (parsed.status === 401 && auth && await this.refreshStoredSession()) {
      parsed = await this.parseJsonResponse(await fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: this.buildHeaders(auth, extraHeaders, 'application/json'),
        body: body === undefined ? undefined : JSON.stringify(body),
      }));
    }

    if (!parsed.ok) {
      throw new ApiClientError(
        parsed.payload?.message ?? `Request failed with ${parsed.status}`,
        parsed.status,
        parsed.payload?.request_id ?? parsed.requestId,
        parsed.payload?.code ?? 'api_error',
        parsed.payload?.details,
      );
    }

    return parsed.payload as T;
  }

  private async requestForm<T>(
    method: string,
    path: string,
    body: FormData,
    auth = true,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    let parsed = await this.parseJsonResponse(await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers: this.buildHeaders(auth, extraHeaders),
      body,
    }));

    if (parsed.status === 401 && auth && await this.refreshStoredSession()) {
      parsed = await this.parseJsonResponse(await fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: this.buildHeaders(auth, extraHeaders),
        body,
      }));
    }

    if (!parsed.ok) {
      throw new ApiClientError(
        parsed.payload?.message ?? `Request failed with ${parsed.status}`,
        parsed.status,
        parsed.payload?.request_id ?? parsed.requestId,
        parsed.payload?.code ?? 'api_error',
        parsed.payload?.details,
      );
    }

    return parsed.payload as T;
  }

  private async requestBlob(path: string, auth = true): Promise<Blob> {
    let response = await fetch(`${this.options.baseUrl}${path}`, { method: 'GET', headers: this.buildHeaders(auth, {}, '*/*') });
    if (response.status === 401 && auth && await this.refreshStoredSession()) {
      response = await fetch(`${this.options.baseUrl}${path}`, { method: 'GET', headers: this.buildHeaders(auth, {}, '*/*') });
    }
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

  private buildHeaders(auth: boolean, extraHeaders: Record<string, string>, contentType?: string) {
    const headers: Record<string, string> = {
      accept: contentType === '*/*' ? '*/*' : 'application/json',
      ...extraHeaders,
    };
    if (contentType && contentType !== '*/*') headers['content-type'] = contentType;
    if (this.options.tenantId) headers['x-tenant-id'] = this.options.tenantId;
    const accessToken = this.options.tokenStore?.getAccessToken();
    if (auth && accessToken) headers.authorization = `Bearer ${accessToken}`;
    return headers;
  }

  private async parseJsonResponse(response: Response) {
    const requestId = response.headers.get('x-request-id') ?? '';
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    return {
      ok: response.ok,
      status: response.status,
      requestId,
      payload,
    };
  }

  private async refreshStoredSession() {
    const tokenStore = this.options.tokenStore;
    const refreshToken = tokenStore?.getRefreshToken();
    if (!tokenStore || !refreshToken) return false;
    const epoch = this.authEpoch;
    this.refreshPromise ??= this.fetchRefreshSession(refreshToken, epoch).finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async fetchRefreshSession(refreshToken: string, epoch: number) {
    const response = await fetch(`${this.options.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: this.buildHeaders(false, {}, 'application/json'),
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      this.options.tokenStore?.clear();
      return false;
    }
    const session = await response.json() as AuthSession;
    if (epoch !== this.authEpoch) {
      this.options.tokenStore?.clear();
      return false;
    }
    this.options.tokenStore?.setSession(session);
    return true;
  }
}
