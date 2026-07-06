import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import type {
  AcceptInvitationInput,
  AccountAddressInput,
  AccountCartAddItemInput,
  AccountCartCheckoutInput,
  AccountCartCreateInput,
  AccountCartUpdateItemInput,
  AccountDocumentListQuery,
  AccountInvoiceListQuery,
  AccountInvoiceDownloadAction,
  AccountInvoicePayAction,
  AccountOrderListQuery,
  AccountInvoiceQuery,
  AccountReorderInput,
  AiHealthResponse,
  AircallBackfillRecentInput,
  AircallBackfillRecentResponse,
  AircallCallEventsResponse,
  AircallDialInput,
  AircallDialResponse,
  AssignCustomerAxisPrimaryInput,
  TranscriptResolverTestInput,
  TranscriptResolverTestResponse,
  AircallLinkUserInput,
  AircallConnectionTestResponse,
  AircallNumbersResponse,
  AircallResolverReprocessInput,
  AircallResolverReprocessResponse,
  AircallSyncLogsResponse,
  AircallTranscriptExportQuery,
  AircallTranscriptExportResponse,
  AircallTranscriptListQuery,
  AircallTranscriptListResponse,
  AircallTranscriptResponse,
  AircallUsersResponse,
  AircallWebhookStatusResponse,
  AircallWorkflowCoverageQuery,
  AircallWorkflowCoverageResponse,
  AircallWorkflowRepairInput,
  AircallWorkflowRepairResponse,
  AssignDefaultCustomerAxisInput,
  AssignDefaultCustomerAxisResponse,
  AuthSession,
  BootstrapWorkflowDefaultsResponse,
  BootstrapTenantInput,
  CalculatePricesInput,
  CallCenterActionResult,
  CallCenterCreateCustomerTaskInput,
  CallCenterMessage,
  CallCenterOverview,
  CallCenterReplyNoteInput,
  CallCenterSaveCustomerNoteInput,
  CallCenterSendMessageInput,
  CallCenterSyncResult,
  CallCenterTransferTaskInput,
  CommissionProfileDto,
  CommissionRequestDto,
  CustomerAxisAssignmentsResponse,
  CustomerDetailPanelDto,
  CreateCustomerUserInput,
  CreateMcpTokenInput,
  CreateMcpTokenResponse,
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
  McpTokensResponse,
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
  FrontendMcpApplyCustomizationInput,
  FrontendMcpApplyCustomizationResponse,
  FrontendMcpCustomizationResponse,
  FrontendMcpListCustomizationsInput,
  FrontendMcpListCustomizationsResponse,
  FrontendMcpPreviewCustomizationInput,
  FrontendMcpPreviewCustomizationResponse,
  FrontendMcpRollbackCustomizationInput,
  FrontendMcpRollbackCustomizationResponse,
  WorkflowEnumCatalogResponse,
  WorkflowEnumChainProbeResponse,
  WorkflowMcpCapabilitiesResponse,
  WorkflowMcpCreateDraftRuleInput,
  WorkflowMcpCreateDraftRuleResponse,
  WorkflowMcpDraftRuleInput,
  WorkflowMcpDraftRuleResponse,
  WorkflowMcpPublishRuleInput,
  WorkflowMcpPublishRuleResponse,
  WorkflowMcpSimulateRuleInput,
  WorkflowMcpSimulateRuleResponse,
  WorkflowMcpValidateRuleInput,
  WorkflowMcpValidateRuleResponse,
  WorkflowOperationalContractProbeResponse,
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
  RecordAccountInvoicePaymentInput,
  RecordCustomerAxisNoAutoReassignInput,
  MailProviderHealthResponse,
  MailProviderEventLogResponse,
  MailProviderEventQuery,
  MailMarketingContactQuery,
  MailMarketingAnalyticsQuery,
  MailMarketingAnalyticsCohortResponse,
  MailMarketingAnalyticsDimensionResponse,
  MailMarketingAnalyticsFunnelResponse,
  MailMarketingAnalyticsOverviewResponse,
  MailContactDetailDto,
  MailAudienceSnapshotDiffResponse,
  MailAudienceFilterInput,
  MailAudiencePreviewResponse,
  MailAudienceSnapshotMemberQuery,
  MailAudienceSnapshotMembersResponse,
  MailAudienceSnapshotQuery,
  MailCampaignDto,
  MailCampaignQuery,
  MailFlowEventsResponse,
  MailFlowRunsResponse,
  MailFlowSimulationResponse,
  MailFlowValidationResponse,
  MailFlowWebhookDestinationDto,
  MailMarketingFlowDto,
  MailMarketingSettingsInput,
  ApproveMailFlowWebhookDestinationInput,
  UpsertMailContactConsentInput,
  CreateMailAudienceSnapshotInput,
  AddMailSuppressionInput,
  MailDeliveryLogQuery,
  MailDlqListQuery,
  MailListQuery,
  MailSettingsAuditQuery,
  MailSuppressionListQuery,
  PatchMailCenterSettingsInput,
  ResetMailCenterSettingsInput,
  ActivateEmailTemplateInput,
  ApproveEmailTemplateRevisionInput,
  MailTemplateBlockDto,
  MailTemplateBlockQuery,
  MailTemplateQuery,
  MailTemplatePreviewProfileDto,
  MailTemplatePreviewProfileQuery,
  MailTemplateSnippetDto,
  MailTemplateSnippetQuery,
  PatchEmailTemplateInput,
  PatchMailTemplateBlockInput,
  PatchMailTemplatePreviewProfileInput,
  PatchMailTemplateSnippetInput,
  ProposeEmailTemplateAiEditInput,
  PatchMailAudienceInput,
  PatchMailFlowInput,
  PatchMailFlowWebhookDestinationInput,
  MovePersonQueueCardInput,
  PersonDailyOperationRange,
  PersonFrontendCustomizationRuntime,
  PersonCustomerArchiveQuery,
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
  SaveMailTemplateBlockInput,
  SaveMailTemplatePreviewProfileInput,
  SaveMailTemplateSnippetInput,
  EmailTemplateAiEditProposalResponse,
  SaveAccountInvoiceInput,
  SaveMailAudienceInput,
  SaveMailCampaignInput,
  SaveMailFlowInput,
  SaveMailFlowWebhookDestinationInput,
  TestEmailTemplateRevisionInput,
  SimulateMailFlowInput,
  TriggerMailFlowEventInput,
  ValidateMailFlowInput,
  UpdateAccountInvoiceFileInput,
  UpdateAccountInvoiceStatusInput,
  UpdateEmailTemplateRevisionSourceInput,
  SavePersonEmailDraftInput,
  SendPersonEmailInput,
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

function analyticsParams(input: MailMarketingAnalyticsQuery) {
  const params = new URLSearchParams();
  params.set('days', String(input.days ?? 30));
  params.set('limit', String(input.limit ?? 25));
  if (input.campaignId) params.set('campaignId', input.campaignId);
  if (input.templateId) params.set('templateId', input.templateId);
  if (input.audienceId) params.set('audienceId', input.audienceId);
  if (input.flowId) params.set('flowId', input.flowId);
  return params.toString();
}

function queryString(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
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

  async refreshSession() {
    return this.refreshStoredSession();
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

  customerRoleOptions() {
    return this.get('/identity/customer-role-options');
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

  mcpTokens() {
    return this.get<McpTokensResponse>('/auth/mcp-tokens');
  }

  createMcpToken(input: CreateMcpTokenInput) {
    return this.post<CreateMcpTokenResponse>('/auth/mcp-tokens', input);
  }

  revokeMcpToken(id: string) {
    return this.delete<{ ok: true }>(`/auth/mcp-tokens/${id}`);
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

  accountOrders(input: Partial<AccountOrderListQuery> = {}) {
    return this.get(`/accounts/orders${queryString(input)}`);
  }

  accountOrder(id: string) {
    return this.get(`/accounts/orders/${encodeURIComponent(id)}`);
  }

  accountOrderReorder(id: string, input: AccountReorderInput = {}) {
    return this.post(`/accounts/orders/${encodeURIComponent(id)}/reorder`, input);
  }

  accountOrderLineItemReorder(orderId: string, lineItemId: string, input: AccountReorderInput = {}) {
    return this.post(`/accounts/orders/${encodeURIComponent(orderId)}/line-items/${encodeURIComponent(lineItemId)}/reorder`, input);
  }

  accountActiveCart() {
    return this.get('/accounts/cart/active');
  }

  accountCreateCart(input: AccountCartCreateInput = {}) {
    return this.post('/accounts/cart', input);
  }

  accountCartAddItem(cartId: string, input: AccountCartAddItemInput) {
    return this.post(`/accounts/cart/${encodeURIComponent(cartId)}/items`, input);
  }

  accountCartUpdateItem(cartId: string, itemId: string, input: AccountCartUpdateItemInput) {
    return this.patch(`/accounts/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`, input);
  }

  accountCartRemoveItem(cartId: string, itemId: string) {
    return this.delete(`/accounts/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`);
  }

  accountCartCheckout(cartId: string, input: AccountCartCheckoutInput = {}) {
    return this.post(`/accounts/cart/${encodeURIComponent(cartId)}/checkout`, input);
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

  accountInvoices(input: Partial<AccountInvoiceListQuery> = {}) {
    return this.get(`/accounts/invoices${queryString(input)}`);
  }

  accountInvoice(id: string) {
    return this.get(`/accounts/invoices/${encodeURIComponent(id)}`);
  }

  accountInvoiceDownload(id: string) {
    return this.get<AccountInvoiceDownloadAction>(`/accounts/invoices/${encodeURIComponent(id)}/download`);
  }

  accountInvoicePay(id: string) {
    return this.post<AccountInvoicePayAction>(`/accounts/invoices/${encodeURIComponent(id)}/pay`, {});
  }

  accountDocuments(input: Partial<AccountDocumentListQuery> = {}) {
    return this.get(`/accounts/documents${queryString(input)}`);
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

  orderInvoices(id: string) {
    return this.get(`/orders/${encodeURIComponent(id)}/invoices`);
  }

  invoices(input: Partial<AccountInvoiceQuery> = {}) {
    const params = new URLSearchParams();
    if (input.customerId) params.set('customerId', input.customerId);
    if (input.orderId) params.set('orderId', input.orderId);
    if (input.status) params.set('status', input.status);
    if (input.search) params.set('search', input.search);
    params.set('limit', String(input.limit ?? 50));
    return this.get(`/orders/invoices?${params.toString()}`);
  }

  invoice(id: string) {
    return this.get(`/orders/invoices/${encodeURIComponent(id)}`);
  }

  createInvoice(input: SaveAccountInvoiceInput) {
    return this.post('/orders/invoices', input);
  }

  updateInvoiceStatus(id: string, input: UpdateAccountInvoiceStatusInput) {
    return this.post(`/orders/invoices/${encodeURIComponent(id)}/status`, input);
  }

  updateInvoiceFile(id: string, input: UpdateAccountInvoiceFileInput) {
    return this.post(`/orders/invoices/${encodeURIComponent(id)}/file`, input);
  }

  recordInvoicePayment(id: string, input: RecordAccountInvoicePaymentInput) {
    return this.post(`/orders/invoices/${encodeURIComponent(id)}/record-payment`, input);
  }

  duplicateInvoice(id: string) {
    return this.post(`/orders/invoices/${encodeURIComponent(id)}/duplicate`, {});
  }

  markOverdueInvoices() {
    return this.post('/orders/invoices/mark-overdue', {});
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

  callCenterSendMessage(input: CallCenterSendMessageInput) {
    return this.post<CallCenterMessage>('/call-center/messages', input);
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

  personFrontendCustomization() {
    return this.get<PersonFrontendCustomizationRuntime>('/person/workspace/frontend-customization');
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

  dialPersonAircall(input: AircallDialInput) {
    return this.post<AircallDialResponse>('/person/workspace/aircall/dial', input);
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

  personCustomerArchive(query: Partial<PersonCustomerArchiveQuery> = {}) {
    const params = new URLSearchParams();
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));
    if (query.search) params.set('search', query.search);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/person/workspace/customer-archive${suffix}`);
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

  savePersonCustomerArchiveNote(customerId: string, input: SavePersonCustomerNoteInput) {
    return this.post<CustomerDetailPanelDto>(`/person/workspace/customer-archive/${encodeURIComponent(customerId)}/notes`, input);
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

  sendPersonEmail(input: SendPersonEmailInput) {
    return this.post('/person/workspace/emails/send', input);
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

  mailDeliveries(query: string | MailListQuery = '') {
    if (typeof query === 'string') return this.get(`/mail/deliveries${query}`);
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.eventKey) params.set('eventKey', query.eventKey);
    if (query.recipient) params.set('recipient', query.recipient);
    if (query.category) params.set('category', query.category);
    if (query.templateId) params.set('templateId', query.templateId);
    if (query.templateVersionId) params.set('templateVersionId', query.templateVersionId);
    if (query.source) params.set('source', query.source);
    params.set('limit', String(query.limit ?? 50));
    return this.get(`/mail/deliveries?${params.toString()}`);
  }

  mailDeliveryLog(query: Partial<MailDeliveryLogQuery> = {}) {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.eventKey) params.set('eventKey', query.eventKey);
    if (query.recipient) params.set('recipient', query.recipient);
    if (query.category) params.set('category', query.category);
    if (query.templateId) params.set('templateId', query.templateId);
    if (query.templateVersionId) params.set('templateVersionId', query.templateVersionId);
    if (query.source) params.set('source', query.source);
    if (query.search) params.set('search', query.search);
    if (query.cursor) params.set('cursor', query.cursor);
    params.set('limit', String(query.limit ?? 10));
    return this.get(`/mail/delivery-log?${params.toString()}`);
  }

  mailProviderEvents(query: Partial<MailProviderEventQuery> = {}) {
    const params = new URLSearchParams();
    if (query.eventType) params.set('eventType', query.eventType);
    if (query.recipient) params.set('recipient', query.recipient);
    if (query.deliveryId) params.set('deliveryId', query.deliveryId);
    if (query.providerMessageId) params.set('providerMessageId', query.providerMessageId);
    if (query.search) params.set('search', query.search);
    if (query.cursor) params.set('cursor', query.cursor);
    params.set('limit', String(query.limit ?? 10));
    return this.get<MailProviderEventLogResponse>(`/mail/provider-events?${params.toString()}`);
  }

  mailDelivery(id: string) {
    return this.get(`/mail/deliveries/${id}`);
  }

  retryMailDelivery(id: string) {
    return this.post(`/mail/deliveries/${id}/retry`, {});
  }

  mailSuppression(input: MailSuppressionListQuery = { limit: 100 }) {
    const params = new URLSearchParams();
    if (input.active !== undefined) params.set('active', String(input.active));
    if (input.scope) params.set('scope', input.scope);
    if (input.category) params.set('category', input.category);
    if (input.campaignId) params.set('campaignId', input.campaignId);
    if (input.flowId) params.set('flowId', input.flowId);
    if (input.templateId) params.set('templateId', input.templateId);
    params.set('limit', String(input.limit ?? 100));
    return this.get(`/mail/suppression?${params.toString()}`);
  }

  addMailSuppression(input: AddMailSuppressionInput) {
    return this.post('/mail/suppression', input);
  }

  unsuppressMail(id: string) {
    return this.post(`/mail/suppression/${encodeURIComponent(id)}/unsuppress`, {});
  }

  mailDlq(input: MailDlqListQuery = { status: 'pending', limit: 100 }) {
    const params = new URLSearchParams();
    params.set('status', input.status ?? 'pending');
    params.set('limit', String(input.limit ?? 100));
    return this.get(`/mail/dlq?${params.toString()}`);
  }

  retryMailDlq(id: string) {
    return this.post(`/mail/dlq/${encodeURIComponent(id)}/retry`, {});
  }

  discardMailDlq(id: string) {
    return this.post(`/mail/dlq/${encodeURIComponent(id)}/discard`, {});
  }

  mailSettings() {
    return this.get('/mail/settings');
  }

  updateMailSettings(input: PatchMailCenterSettingsInput) {
    return this.patch('/mail/settings', input);
  }

  resetMailSettings(input: ResetMailCenterSettingsInput) {
    return this.post('/mail/settings/reset', input);
  }

  mailSettingsAudit(input: MailSettingsAuditQuery = { limit: 50 }) {
    const params = new URLSearchParams();
    params.set('limit', String(input.limit ?? 50));
    return this.get(`/mail/settings/audit?${params.toString()}`);
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

  emailTemplatePreviewProfiles(input: MailTemplatePreviewProfileQuery = { limit: 50 }) {
    const params = new URLSearchParams();
    if (input.templateId) params.set('templateId', input.templateId);
    if (input.eventKey) params.set('eventKey', input.eventKey);
    params.set('limit', String(input.limit ?? 50));
    return this.get<MailTemplatePreviewProfileDto[]>(`/email-templates/preview-profiles?${params.toString()}`);
  }

  createEmailTemplatePreviewProfile(input: SaveMailTemplatePreviewProfileInput) {
    return this.post<MailTemplatePreviewProfileDto>('/email-templates/preview-profiles', input);
  }

  updateEmailTemplatePreviewProfile(profileId: string, input: PatchMailTemplatePreviewProfileInput) {
    return this.patch<MailTemplatePreviewProfileDto>(`/email-templates/preview-profiles/${encodeURIComponent(profileId)}`, input);
  }

  deleteEmailTemplatePreviewProfile(profileId: string) {
    return this.delete<{ ok: true }>(`/email-templates/preview-profiles/${encodeURIComponent(profileId)}`);
  }

  emailTemplateSnippets(input: MailTemplateSnippetQuery = { includeArchived: false, limit: 50 }) {
    const params = new URLSearchParams();
    if (input.templateType) params.set('templateType', input.templateType);
    if (input.includeArchived !== undefined) params.set('includeArchived', String(input.includeArchived));
    params.set('limit', String(input.limit ?? 50));
    return this.get<MailTemplateSnippetDto[]>(`/email-templates/snippets?${params.toString()}`);
  }

  createEmailTemplateSnippet(input: SaveMailTemplateSnippetInput) {
    return this.post<MailTemplateSnippetDto>('/email-templates/snippets', input);
  }

  updateEmailTemplateSnippet(snippetId: string, input: PatchMailTemplateSnippetInput) {
    return this.patch<MailTemplateSnippetDto>(`/email-templates/snippets/${encodeURIComponent(snippetId)}`, input);
  }

  deleteEmailTemplateSnippet(snippetId: string) {
    return this.delete<{ ok: true }>(`/email-templates/snippets/${encodeURIComponent(snippetId)}`);
  }

  emailTemplateBlocks(input: MailTemplateBlockQuery = { includeArchived: false, limit: 50 }) {
    const params = new URLSearchParams();
    if (input.category) params.set('category', input.category);
    if (input.includeArchived !== undefined) params.set('includeArchived', String(input.includeArchived));
    params.set('limit', String(input.limit ?? 50));
    return this.get<MailTemplateBlockDto[]>(`/email-templates/blocks?${params.toString()}`);
  }

  createEmailTemplateBlock(input: SaveMailTemplateBlockInput) {
    return this.post<MailTemplateBlockDto>('/email-templates/blocks', input);
  }

  updateEmailTemplateBlock(blockId: string, input: PatchMailTemplateBlockInput) {
    return this.patch<MailTemplateBlockDto>(`/email-templates/blocks/${encodeURIComponent(blockId)}`, input);
  }

  deleteEmailTemplateBlock(blockId: string) {
    return this.delete<{ ok: true }>(`/email-templates/blocks/${encodeURIComponent(blockId)}`);
  }

  createEmailTemplate(input: SaveEmailTemplateInput) {
    return this.post('/email-templates/events/' + encodeURIComponent(input.eventKey) + '/variants', input);
  }

  updateEmailTemplate(id: string, input: PatchEmailTemplateInput) {
    return this.patch(`/email-templates/variants/${encodeURIComponent(id)}`, input);
  }

  duplicateEmailTemplate(id: string) {
    return this.post(`/email-templates/variants/${encodeURIComponent(id)}/duplicate`, {});
  }

  activateEmailTemplate(eventKey: string, input: ActivateEmailTemplateInput) {
    return this.post(`/email-templates/events/${encodeURIComponent(eventKey)}/activate`, input);
  }

  duplicateEmailTemplateRevision(revisionId: string) {
    return this.post(`/email-templates/revisions/${encodeURIComponent(revisionId)}/duplicate`, {});
  }

  updateEmailTemplateRevisionSource(revisionId: string, input: UpdateEmailTemplateRevisionSourceInput) {
    return this.patch(`/email-templates/revisions/${encodeURIComponent(revisionId)}/source`, input);
  }

  proposeEmailTemplateAiEdit(revisionId: string, input: ProposeEmailTemplateAiEditInput) {
    return this.post<EmailTemplateAiEditProposalResponse>(`/email-templates/revisions/${encodeURIComponent(revisionId)}/assistant/propose`, input);
  }

  approveEmailTemplateRevision(revisionId: string, input: ApproveEmailTemplateRevisionInput = {}) {
    return this.post(`/email-templates/revisions/${encodeURIComponent(revisionId)}/approve`, input);
  }

  publishEmailTemplateRevision(revisionId: string) {
    return this.post(`/email-templates/revisions/${encodeURIComponent(revisionId)}/publish`, {});
  }

  previewEmailTemplateRevision(revisionId: string, variables: Record<string, unknown> = {}) {
    return this.post(`/email-templates/revisions/${encodeURIComponent(revisionId)}/preview`, { variables });
  }

  testEmailTemplateRevision(revisionId: string, input: TestEmailTemplateRevisionInput) {
    return this.post(`/email-templates/revisions/${encodeURIComponent(revisionId)}/test-send`, input);
  }

  deleteEmailTemplateRevision(revisionId: string) {
    return this.delete(`/email-templates/revisions/${encodeURIComponent(revisionId)}`);
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

  mailMarketingContact(contactId: string) {
    return this.get<MailContactDetailDto>(`/mail-marketing/contacts/${encodeURIComponent(contactId)}`);
  }

  updateMailMarketingContactConsent(contactId: string, input: UpsertMailContactConsentInput) {
    return this.post(`/mail-marketing/contacts/${encodeURIComponent(contactId)}/consent`, input);
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

  previewMailMarketingAudience(input: MailAudienceFilterInput) {
    return this.post<MailAudiencePreviewResponse>('/mail-marketing/audiences/preview', input);
  }

  createMailMarketingAudience(input: SaveMailAudienceInput) {
    return this.post('/mail-marketing/audiences', input);
  }

  updateMailMarketingAudience(id: string, input: PatchMailAudienceInput) {
    return this.patch(`/mail-marketing/audiences/${encodeURIComponent(id)}`, input);
  }

  mailMarketingAudienceSnapshots(audienceId: string, input: MailAudienceSnapshotQuery = { limit: 25 }) {
    const params = new URLSearchParams();
    params.set('limit', String(input.limit ?? 25));
    return this.get(`/mail-marketing/audiences/${encodeURIComponent(audienceId)}/snapshots?${params.toString()}`);
  }

  createMailMarketingAudienceSnapshot(audienceId: string, input: CreateMailAudienceSnapshotInput = {}) {
    return this.post(`/mail-marketing/audiences/${encodeURIComponent(audienceId)}/snapshots`, input);
  }

  mailMarketingAudienceSnapshotMembers(snapshotId: string, input: MailAudienceSnapshotMemberQuery = { limit: 50 }) {
    const params = new URLSearchParams();
    if (input.search) params.set('search', input.search);
    params.set('limit', String(input.limit ?? 50));
    return this.get<MailAudienceSnapshotMembersResponse>(`/mail-marketing/audiences/snapshots/${encodeURIComponent(snapshotId)}?${params.toString()}`);
  }

  mailMarketingAudienceSnapshotDiff(snapshotId: string, input: MailAudienceSnapshotMemberQuery = { limit: 50 }) {
    const params = new URLSearchParams();
    if (input.search) params.set('search', input.search);
    params.set('limit', String(input.limit ?? 50));
    return this.get<MailAudienceSnapshotDiffResponse>(`/mail-marketing/audiences/snapshots/${encodeURIComponent(snapshotId)}/diff?${params.toString()}`);
  }

  mailMarketingCampaigns(input: MailCampaignQuery = { limit: 50 }) {
    const params = new URLSearchParams();
    if (input.status) params.set('status', input.status);
    params.set('limit', String(input.limit ?? 50));
    return this.get<MailCampaignDto[]>(`/mail-marketing/campaigns?${params.toString()}`);
  }

  createMailMarketingCampaign(input: SaveMailCampaignInput) {
    return this.post<MailCampaignDto>('/mail-marketing/campaigns', input);
  }

  queueMailMarketingCampaign(id: string) {
    return this.post<MailCampaignDto>(`/mail-marketing/campaigns/${encodeURIComponent(id)}/queue`, {});
  }

  approveMailMarketingCampaign(id: string) {
    return this.post<MailCampaignDto>(`/mail-marketing/campaigns/${encodeURIComponent(id)}/approve`, {});
  }

  pauseMailMarketingCampaign(id: string) {
    return this.post<MailCampaignDto>(`/mail-marketing/campaigns/${encodeURIComponent(id)}/pause`, {});
  }

  cancelMailMarketingCampaign(id: string) {
    return this.post<MailCampaignDto>(`/mail-marketing/campaigns/${encodeURIComponent(id)}/cancel`, {});
  }

  mailMarketingAnalyticsOverview(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsOverviewResponse>(`/mail-marketing/analytics/overview?${analyticsParams(input)}`);
  }

  mailMarketingAnalyticsCampaigns(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsDimensionResponse>(`/mail-marketing/analytics/campaigns?${analyticsParams(input)}`);
  }

  mailMarketingAnalyticsTemplates(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsDimensionResponse>(`/mail-marketing/analytics/templates?${analyticsParams(input)}`);
  }

  mailMarketingAnalyticsAudiences(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsDimensionResponse>(`/mail-marketing/analytics/audiences?${analyticsParams(input)}`);
  }

  mailMarketingAnalyticsFlows(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsDimensionResponse>(`/mail-marketing/analytics/flows?${analyticsParams(input)}`);
  }

  mailMarketingAnalyticsFunnel(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsFunnelResponse>(`/mail-marketing/analytics/funnel?${analyticsParams(input)}`);
  }

  mailMarketingAnalyticsCohorts(input: MailMarketingAnalyticsQuery = { days: 30, limit: 25 }) {
    return this.get<MailMarketingAnalyticsCohortResponse>(`/mail-marketing/analytics/cohorts?${analyticsParams(input)}`);
  }

  mailMarketingWebhookDestinations() {
    return this.get<MailFlowWebhookDestinationDto[]>('/mail-marketing/flows/webhook-destinations');
  }

  createMailMarketingWebhookDestination(input: SaveMailFlowWebhookDestinationInput) {
    return this.post<MailFlowWebhookDestinationDto>('/mail-marketing/flows/webhook-destinations', input);
  }

  updateMailMarketingWebhookDestination(id: string, input: PatchMailFlowWebhookDestinationInput) {
    return this.patch<MailFlowWebhookDestinationDto>(`/mail-marketing/flows/webhook-destinations/${encodeURIComponent(id)}`, input);
  }

  approveMailMarketingWebhookDestination(id: string, input: ApproveMailFlowWebhookDestinationInput) {
    return this.post<MailFlowWebhookDestinationDto>(`/mail-marketing/flows/webhook-destinations/${encodeURIComponent(id)}/approve-live`, input);
  }

  revokeMailMarketingWebhookDestinationApproval(id: string) {
    return this.post<MailFlowWebhookDestinationDto>(`/mail-marketing/flows/webhook-destinations/${encodeURIComponent(id)}/revoke-live`, {});
  }

  mailMarketingFlows() {
    return this.get<MailMarketingFlowDto[]>('/mail-marketing/flows');
  }

  mailMarketingFlow(id: string) {
    return this.get<MailMarketingFlowDto>(`/mail-marketing/flows/${encodeURIComponent(id)}`);
  }

  createMailMarketingFlow(input: SaveMailFlowInput) {
    return this.post<MailMarketingFlowDto>('/mail-marketing/flows', input);
  }

  updateMailMarketingFlow(id: string, input: PatchMailFlowInput) {
    return this.patch<MailMarketingFlowDto>(`/mail-marketing/flows/${encodeURIComponent(id)}`, input);
  }

  validateMailMarketingFlow(id: string, input: ValidateMailFlowInput = { version: 'latest' }) {
    return this.post<MailFlowValidationResponse>(`/mail-marketing/flows/${encodeURIComponent(id)}/validate`, input);
  }

  simulateMailMarketingFlow(id: string, input: SimulateMailFlowInput = { version: 'latest', payload: {}, target: {} }) {
    return this.post<MailFlowSimulationResponse>(`/mail-marketing/flows/${encodeURIComponent(id)}/simulate`, input);
  }

  publishMailMarketingFlow(id: string) {
    return this.post<MailMarketingFlowDto>(`/mail-marketing/flows/${encodeURIComponent(id)}/publish`, {});
  }

  pauseMailMarketingFlow(id: string) {
    return this.post<MailMarketingFlowDto>(`/mail-marketing/flows/${encodeURIComponent(id)}/pause`, {});
  }

  resumeMailMarketingFlow(id: string) {
    return this.post<MailMarketingFlowDto>(`/mail-marketing/flows/${encodeURIComponent(id)}/resume`, {});
  }

  mailMarketingFlowRuns(id: string) {
    return this.get<MailFlowRunsResponse>(`/mail-marketing/flows/${encodeURIComponent(id)}/runs`);
  }

  mailMarketingFlowEvents(id: string) {
    return this.get<MailFlowEventsResponse>(`/mail-marketing/flows/${encodeURIComponent(id)}/events`);
  }

  triggerMailMarketingFlowEvent(input: TriggerMailFlowEventInput) {
    return this.post('/mail-marketing/flows/events', input);
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

  aircallTranscripts(query: Partial<AircallTranscriptListQuery> = {}) {
    const suffix = queryString(query);
    return this.get<AircallTranscriptListResponse>(`/aircall/calls/transcripts${suffix}`);
  }

  aircallTranscript(id: string) {
    return this.get<AircallTranscriptResponse>(`/aircall/calls/${encodeURIComponent(id)}/transcript`);
  }

  exportAircallTranscripts(query: Partial<AircallTranscriptExportQuery> = {}) {
    const suffix = queryString(query);
    return this.get<AircallTranscriptExportResponse>(`/aircall/calls/transcripts/export${suffix}`);
  }

  aircallWorkflowCoverage(query: Partial<AircallWorkflowCoverageQuery> = {}) {
    const params = new URLSearchParams();
    if (query.scope) params.set('scope', query.scope);
    if (query.recentDays !== undefined) params.set('recentDays', String(query.recentDays));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.get<AircallWorkflowCoverageResponse>(`/aircall/calls/workflow-coverage${suffix}`);
  }

  repairAircallWorkflowEvaluations(input: AircallWorkflowRepairInput = { targetVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION, scope: 'recent', recentDays: 7, limit: 1000 }) {
    return this.post<AircallWorkflowRepairResponse>('/aircall/calls/workflow-repair', input);
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

  workflowMcpCapabilities() {
    return this.get<WorkflowMcpCapabilitiesResponse>('/rules/mcp/capabilities');
  }

  workflowOperationalContract() {
    return this.get<WorkflowOperationalContractProbeResponse>('/rules/operational-contract');
  }

  draftWorkflowRuleFromMcp(input: WorkflowMcpDraftRuleInput) {
    return this.post<WorkflowMcpDraftRuleResponse>('/rules/mcp/draft', input);
  }

  validateWorkflowRuleFromMcp(input: WorkflowMcpValidateRuleInput) {
    return this.post<WorkflowMcpValidateRuleResponse>('/rules/mcp/validate', input);
  }

  simulateWorkflowRuleFromMcp(input: WorkflowMcpSimulateRuleInput) {
    return this.post<WorkflowMcpSimulateRuleResponse>('/rules/mcp/simulate', input);
  }

  createWorkflowRuleDraftFromMcp(input: WorkflowMcpCreateDraftRuleInput) {
    return this.post<WorkflowMcpCreateDraftRuleResponse>('/rules/mcp/drafts', input);
  }

  publishWorkflowRuleFromMcp(input: WorkflowMcpPublishRuleInput) {
    return this.post<WorkflowMcpPublishRuleResponse>('/rules/mcp/publish', input);
  }

  previewFrontendCustomizationFromMcp(input: FrontendMcpPreviewCustomizationInput) {
    return this.post<FrontendMcpPreviewCustomizationResponse>('/rules/mcp/frontend/customizations/preview', input);
  }

  applyFrontendCustomizationFromMcp(input: FrontendMcpApplyCustomizationInput) {
    return this.post<FrontendMcpApplyCustomizationResponse>('/rules/mcp/frontend/customizations', input);
  }

  listFrontendCustomizationsFromMcp(input: Partial<FrontendMcpListCustomizationsInput> = {}) {
    return this.get<FrontendMcpListCustomizationsResponse>(`/rules/mcp/frontend/customizations${queryString(input)}`);
  }

  getFrontendCustomizationFromMcp(customizationId: string) {
    return this.get<FrontendMcpCustomizationResponse>(`/rules/mcp/frontend/customizations/${encodeURIComponent(customizationId)}`);
  }

  rollbackFrontendCustomizationFromMcp(input: FrontendMcpRollbackCustomizationInput) {
    return this.post<FrontendMcpRollbackCustomizationResponse>('/rules/mcp/frontend/customizations/rollback', input);
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
