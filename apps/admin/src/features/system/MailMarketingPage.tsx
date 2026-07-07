import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, FileText, Mail, PlayCircle, RefreshCw, Send, Users, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import type { EmailTemplateAiEditMode, EmailTemplateAiEditProposalResponse, EmailTemplateDto, EmailTemplateWorkspaceResponse, MailAudienceFilterInput, MailAudiencePreviewResponse, MailAudienceSnapshotDiffResponse, MailAudienceSnapshotDto, MailAudienceSnapshotMembersResponse, MailCampaignDto, MailContactDetailDto, MailFlowSimulationResponse, MailFlowValidationResponse, MailFlowWebhookDestinationDto, MailMarketingAnalyticsCohortResponse, MailMarketingAnalyticsFunnelResponse, MailMarketingAnalyticsOverviewResponse, MailMarketingFlowDto, MailMarketingOverviewResponse, MailMarketingSettingsInput, MailProviderMode, MailTemplateBlockDto, MailTemplatePreviewProfileDto, MailTemplateSnippetDto, SaveEmailTemplateInput, SaveMailAudienceInput, SaveMailCampaignInput, SaveMailFlowInput, SaveMailFlowWebhookDestinationInput } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

type Tab = 'overview' | 'contacts' | 'templates' | 'audiences' | 'campaigns' | 'flows' | 'settings';
const MAIL_MARKETING_TABS: Tab[] = ['overview', 'contacts', 'templates', 'audiences', 'campaigns', 'flows', 'settings'];

interface MailContact {
  id: string;
  customerId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  tags: string[];
  buyerIntent: string | null;
  lifecycleStage: string | null;
  isSendable: boolean;
  consentState: string;
  lastActivityAt: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  eventKey: string;
  templateType: 'transactional' | 'marketing';
  subject: string;
  status: string;
  approvalState: string;
  publishedVersionId: string | null;
  activeBinding: { id: string; eventKey: string; templateVersionId: string; isEnabled: boolean } | null;
  versionCount: number;
  updatedAt: string;
}

interface EmailTemplateVersion {
  id: string;
  versionNumber: number;
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: string[];
  metadata: Record<string, unknown>;
  status: string;
  approvalState: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface EmailTemplatePreviewResult {
  revisionId: string;
  subject: string;
  previewText: string | null;
  html: string;
  text: string | null;
  unresolvedVariables: string[];
}

type MailDeliveryStatus = 'draft' | 'queued' | 'queued_disabled' | 'sending' | 'sent' | 'failed' | 'skipped';

interface MailDeliveryProof {
  id: string;
  eventKey: string;
  category: string;
  templateId: string | null;
  templateVersionId: string | null;
  recipientEmail: string;
  subject: string;
  status: MailDeliveryStatus;
  provider: string | null;
  errorMessage: string | null;
  attemptCount: number;
  metadata: unknown;
  createdAt: string;
  sentAt: string | null;
}

type EmailTemplateDetail = EmailTemplateDto & { versions: EmailTemplateVersion[] };
type MailTemplateWorkspaceEvent = EmailTemplateWorkspaceResponse['events'][number];

interface MailAudience {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  contactCount: number;
  isArchived: boolean;
  lastCalculatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AudienceDraft {
  name: string;
  description: string;
  localSegments: string;
  shopifySegments: string;
  manualLists: string;
  emails: string;
  tags: string;
  ownerMemberIds: string;
  productQuery: string;
  productSkus: string;
  productFamilies: string;
  orderCountMin: string;
  totalSpentMin: string;
  lastOrderAfter: string;
  includeUnknownConsent: boolean;
  includeSuppressed: boolean;
}

interface TemplateDraft {
  name: string;
  eventKey: string;
  templateType: 'transactional' | 'marketing';
  folderKey: string;
  subject: string;
  previewText: string;
  html: string;
  text: string;
  variables: string;
}

interface TemplateAssistantDraft {
  mode: EmailTemplateAiEditMode;
  instruction: string;
  audience: string;
  brandVoice: string;
}

type MailFlow = MailMarketingFlowDto;

type FlowProof =
  | { type: 'validation'; flowId: string; result: MailFlowValidationResponse }
  | { type: 'simulation'; flowId: string; result: MailFlowSimulationResponse };

type FlowBuilderActionType =
  | 'send_email'
  | 'create_follow_up_task'
  | 'update_contact_tag'
  | 'add_to_audience'
  | 'remove_from_audience'
  | 'webhook'
  | 'emit_internal_event';

interface FlowDraft {
  name: string;
  triggerType: string;
  actionType: FlowBuilderActionType;
  templateId: string;
  audienceId: string;
  webhookDestinationId: string;
  tag: string;
  eventName: string;
  taskAxis: 'sales' | 'account';
  taskTitle: string;
  taskDescription: string;
  taskPriority: 'low' | 'medium' | 'high' | 'urgent';
  conditionEnabled: boolean;
  conditionField: string;
  conditionOperator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  conditionValue: string;
  delayMode: 'none' | 'minutes' | 'scheduled_at';
  delayMinutes: string;
  delayScheduledAt: string;
}

type MailCampaign = MailCampaignDto;

interface WebhookDestinationDraft {
  name: string;
  url: string;
  status: 'disabled' | 'active';
  authType: 'none' | 'header';
  executionMode: 'proof_only' | 'live_requested';
  secretHeaderName: string;
  secretValue: string;
  timeoutMs: string;
}

interface ApprovalPolicyDraft {
  maxReachableRecipients: string;
  maxSnapshotMembers: string;
  maxEstimatedAudienceSpendUsd: string;
}

interface ApprovalPolicy {
  maxReachableRecipients: number;
  maxSnapshotMembers: number;
  maxEstimatedAudienceSpendUsd: number;
}

const QK = {
  overview: ['mail-marketing', 'overview'] as const,
  contacts: ['mail-marketing', 'contacts'] as const,
  templates: ['mail-marketing', 'templates'] as const,
  templateWorkspace: ['mail-templates', 'workspace'] as const,
  audiences: ['mail-marketing', 'audiences'] as const,
  campaigns: ['mail-marketing', 'campaigns'] as const,
  analytics: ['mail-marketing', 'analytics', 'overview'] as const,
  analyticsFunnel: ['mail-marketing', 'analytics', 'funnel'] as const,
  analyticsCohorts: ['mail-marketing', 'analytics', 'cohorts'] as const,
  flows: ['mail-marketing', 'flows'] as const,
  webhookDestinations: ['mail-marketing', 'webhook-destinations'] as const,
  bootstrap: ['mail-marketing', 'bootstrap'] as const,
};
const DEFAULT_PREVIEW_VARIABLES = JSON.stringify({
  customer: { name: 'Preview Customer' },
  order: { number: '1001' },
}, null, 2);
const DEFAULT_TEMPLATE_DRAFT: TemplateDraft = {
  name: 'Customer follow-up email',
  eventKey: 'mail.marketing.follow_up',
  templateType: 'marketing',
  folderKey: 'marketing',
  subject: 'A quick follow-up from {{brand.name}}',
  previewText: 'A short follow-up from our team.',
  html: '<p>Hello {{customer.name}},</p><p>Our team wanted to follow up with you.</p><p><a href="{{urls.unsubscribe}}">Unsubscribe</a></p>',
  text: 'Hello {{customer.name}}, our team wanted to follow up with you.\n\nUnsubscribe: {{urls.unsubscribe}}',
  variables: 'customer.name, brand.name, urls.unsubscribe',
};
const DEFAULT_TEMPLATE_ASSISTANT_DRAFT: TemplateAssistantDraft = {
  mode: 'rewrite_all',
  instruction: '',
  audience: '',
  brandVoice: '',
};
const DEFAULT_FLOW_DRAFT: FlowDraft = {
  name: 'Purchase follow-up flow',
  triggerType: 'segment_enter',
  actionType: 'send_email',
  templateId: '',
  audienceId: '',
  webhookDestinationId: '',
  tag: '',
  eventName: 'mail.marketing.follow_up_requested',
  taskAxis: 'sales',
  taskTitle: 'Customer purchase follow-up',
  taskDescription: 'Follow up with this customer from the Mail Marketing flow.',
  taskPriority: 'medium',
  conditionEnabled: false,
  conditionField: 'event.buyerIntent',
  conditionOperator: 'equals',
  conditionValue: '',
  delayMode: 'none',
  delayMinutes: '',
  delayScheduledAt: '',
};

export function MailMarketingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routeTab = useRouterState({
    select: (state) => normalizeMailTab((state.location.search as Record<string, unknown>).tab),
  });
  const canTemplateWrite = useCan(MEMBER_PERMISSIONS.mailTemplateWrite);
  const canTemplateApprove = useCan(MEMBER_PERMISSIONS.mailTemplateApprove);
  const canTemplatePublish = useCan(MEMBER_PERMISSIONS.mailTemplatePublish);
  const canAudienceWrite = useCan(MEMBER_PERMISSIONS.mailMarketingAudienceWrite);
  const canCampaignWrite = useCan(MEMBER_PERMISSIONS.mailMarketingCampaignWrite);
  const canCampaignApprove = useCan(MEMBER_PERMISSIONS.mailMarketingCampaignApprove);
  const canCampaignPublish = useCan(MEMBER_PERMISSIONS.mailMarketingCampaignPublish);
  const canFlowWrite = useCan(MEMBER_PERMISSIONS.mailMarketingFlowWrite);
  const canFlowPublish = useCan(MEMBER_PERMISSIONS.mailMarketingFlowPublish);
  const canSettingsWrite = useCan(MEMBER_PERMISSIONS.mailSettingsWrite);
  const [tab, setTabState] = useState<Tab>(() => normalizeMailTab(new URLSearchParams(window.location.search).get('tab')) ?? 'overview');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(DEFAULT_TEMPLATE_DRAFT);
  const [testRecipient, setTestRecipient] = useState('');
  const [selectedPreviewProfileId, setSelectedPreviewProfileId] = useState('');
  const [previewProfileName, setPreviewProfileName] = useState('');
  const [previewProfileVariables, setPreviewProfileVariables] = useState(DEFAULT_PREVIEW_VARIABLES);
  const [selectedSnippetId, setSelectedSnippetId] = useState('');
  const [snippetForm, setSnippetForm] = useState({ key: '', name: '', subject: '', html: '' });
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [blockForm, setBlockForm] = useState({ key: '', name: '', category: 'general', html: '' });
  const [editingRevisionId, setEditingRevisionId] = useState('');
  const [revisionSource, setRevisionSource] = useState({ subject: '', previewText: '', html: '', css: '', text: '' });
  const [revisionSourceDirty, setRevisionSourceDirty] = useState(false);
  const [revisionPreview, setRevisionPreview] = useState<EmailTemplatePreviewResult | null>(null);
  const [templateAssistantDraft, setTemplateAssistantDraft] = useState<TemplateAssistantDraft>(DEFAULT_TEMPLATE_ASSISTANT_DRAFT);
  const [templateAssistantProposal, setTemplateAssistantProposal] = useState<EmailTemplateAiEditProposalResponse | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignAudienceId, setCampaignAudienceId] = useState('');
  const [campaignSnapshotId, setCampaignSnapshotId] = useState('');
  const [campaignTemplateId, setCampaignTemplateId] = useState('');
  const [campaignSubjectOverride, setCampaignSubjectOverride] = useState('');
  const [campaignScheduledAt, setCampaignScheduledAt] = useState('');
  const [flowProof, setFlowProof] = useState<FlowProof | null>(null);
  const [flowDraft, setFlowDraft] = useState<FlowDraft>(DEFAULT_FLOW_DRAFT);
  const [webhookDestinationDraft, setWebhookDestinationDraft] = useState<WebhookDestinationDraft>({
    name: '',
    url: '',
    status: 'disabled',
    authType: 'none',
    executionMode: 'proof_only',
    secretHeaderName: '',
    secretValue: '',
    timeoutMs: '5000',
  });
  const [approvalPolicyDraft, setApprovalPolicyDraft] = useState<ApprovalPolicyDraft>({
    maxReachableRecipients: '1000',
    maxSnapshotMembers: '1500',
    maxEstimatedAudienceSpendUsd: '0',
  });
  const [selectedAudienceId, setSelectedAudienceId] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [snapshotSearch, setSnapshotSearch] = useState('');
  const [audienceDraft, setAudienceDraft] = useState<AudienceDraft>({
    name: 'Purchase follow-up audience',
    description: 'Customers selected by Shopify, order, product, and owner signals.',
    localSegments: '',
    shopifySegments: '',
    manualLists: '',
    emails: '',
    tags: '',
    ownerMemberIds: '',
    productQuery: '',
    productSkus: '',
    productFamilies: '',
    orderCountMin: '',
    totalSpentMin: '',
    lastOrderAfter: '',
    includeUnknownConsent: true,
    includeSuppressed: false,
  });

  const overview = useQuery({
    queryKey: QK.overview,
    queryFn: () => adminApi.mailMarketingOverview() as Promise<MailMarketingOverviewResponse>,
    retry: false,
  });
  const contacts = useQuery({
    queryKey: QK.contacts,
    queryFn: () => adminApi.mailMarketingContacts({ limit: 75 }) as Promise<MailContact[]>,
    retry: false,
  });
  const contactDetail = useQuery({
    queryKey: ['mail-marketing', 'contact-detail', selectedContactId],
    queryFn: () => adminApi.mailMarketingContact(selectedContactId || ''),
    enabled: Boolean(selectedContactId),
    retry: false,
  });
  const templates = useQuery({
    queryKey: QK.templates,
    queryFn: () => adminApi.mailMarketingTemplates({ limit: 100 }) as Promise<EmailTemplate[]>,
    retry: false,
  });
  const templateWorkspace = useQuery({
    queryKey: QK.templateWorkspace,
    queryFn: () => adminApi.emailTemplateWorkspace() as Promise<EmailTemplateWorkspaceResponse>,
    retry: false,
  });
  const templateDetail = useQuery({
    queryKey: ['mail-marketing', 'template-detail', selectedTemplateId],
    queryFn: () => adminApi.emailTemplate(selectedTemplateId || '') as Promise<EmailTemplateDetail>,
    enabled: Boolean(selectedTemplateId),
    retry: false,
  });
  const templateDeliveries = useQuery({
    queryKey: ['mail-marketing', 'template-deliveries', selectedTemplateId],
    queryFn: () => adminApi.mailDeliveries({ templateId: selectedTemplateId || '', limit: 12 }) as Promise<MailDeliveryProof[]>,
    enabled: Boolean(selectedTemplateId),
    retry: false,
  });
  const previewProfiles = useQuery({
    queryKey: ['mail-marketing', 'template-preview-profiles', selectedTemplateId],
    queryFn: () => adminApi.emailTemplatePreviewProfiles({ templateId: selectedTemplateId || '', limit: 50 }) as Promise<MailTemplatePreviewProfileDto[]>,
    enabled: Boolean(selectedTemplateId),
    retry: false,
  });
  const reusableSnippets = useQuery({
    queryKey: ['mail-marketing', 'template-snippets', selectedTemplateId, templateDetail.data?.templateType],
    queryFn: () => adminApi.emailTemplateSnippets({ templateType: templateDetail.data?.templateType, includeArchived: false, limit: 50 }) as Promise<MailTemplateSnippetDto[]>,
    enabled: Boolean(selectedTemplateId),
    retry: false,
  });
  const reusableBlocks = useQuery({
    queryKey: ['mail-marketing', 'template-blocks', selectedTemplateId],
    queryFn: () => adminApi.emailTemplateBlocks({ includeArchived: false, limit: 50 }) as Promise<MailTemplateBlockDto[]>,
    enabled: Boolean(selectedTemplateId),
    retry: false,
  });
  const audiences = useQuery({
    queryKey: QK.audiences,
    queryFn: () => adminApi.mailMarketingAudiences() as Promise<MailAudience[]>,
    retry: false,
  });
  const audienceSnapshots = useQuery({
    queryKey: ['mail-marketing', 'audience-snapshots', selectedAudienceId],
    queryFn: () => adminApi.mailMarketingAudienceSnapshots(selectedAudienceId, { limit: 25 }) as Promise<MailAudienceSnapshotDto[]>,
    enabled: Boolean(selectedAudienceId),
    retry: false,
  });
  const campaignSnapshots = useQuery({
    queryKey: ['mail-marketing', 'campaign-audience-snapshots', campaignAudienceId],
    queryFn: () => adminApi.mailMarketingAudienceSnapshots(campaignAudienceId, { limit: 25 }) as Promise<MailAudienceSnapshotDto[]>,
    enabled: Boolean(campaignAudienceId),
    retry: false,
  });
  const snapshotMembers = useQuery({
    queryKey: ['mail-marketing', 'audience-snapshot-members', selectedSnapshotId, snapshotSearch],
    queryFn: () => adminApi.mailMarketingAudienceSnapshotMembers(selectedSnapshotId, { limit: 50, search: snapshotSearch.trim() || undefined }) as Promise<MailAudienceSnapshotMembersResponse>,
    enabled: Boolean(selectedSnapshotId),
    retry: false,
  });
  const snapshotDiff = useQuery({
    queryKey: ['mail-marketing', 'audience-snapshot-diff', selectedSnapshotId, snapshotSearch],
    queryFn: () => adminApi.mailMarketingAudienceSnapshotDiff(selectedSnapshotId, { limit: 25, search: snapshotSearch.trim() || undefined }) as Promise<MailAudienceSnapshotDiffResponse>,
    enabled: Boolean(selectedSnapshotId),
    retry: false,
  });
  const campaigns = useQuery({
    queryKey: QK.campaigns,
    queryFn: () => adminApi.mailMarketingCampaigns({ limit: 75 }) as Promise<MailCampaign[]>,
    retry: false,
  });
  const analytics = useQuery({
    queryKey: QK.analytics,
    queryFn: () => adminApi.mailMarketingAnalyticsOverview({ days: 30, limit: 10 }) as Promise<MailMarketingAnalyticsOverviewResponse>,
    retry: false,
  });

  useEffect(() => {
    if (routeTab && routeTab !== tab) setTabState(routeTab);
  }, [routeTab, tab]);

  const setTab = (next: Tab) => {
    setTabState(next);
    void navigate({ to: '/mail-marketing', search: { tab: next } as never, replace: true });
  };
  const analyticsFunnel = useQuery({
    queryKey: QK.analyticsFunnel,
    queryFn: () => adminApi.mailMarketingAnalyticsFunnel({ days: 30, limit: 10 }) as Promise<MailMarketingAnalyticsFunnelResponse>,
    retry: false,
  });
  const analyticsCohorts = useQuery({
    queryKey: QK.analyticsCohorts,
    queryFn: () => adminApi.mailMarketingAnalyticsCohorts({ days: 30, limit: 10 }) as Promise<MailMarketingAnalyticsCohortResponse>,
    retry: false,
  });
  const flows = useQuery({
    queryKey: QK.flows,
    queryFn: () => adminApi.mailMarketingFlows() as Promise<MailFlow[]>,
    retry: false,
  });
  const webhookDestinations = useQuery({
    queryKey: QK.webhookDestinations,
    queryFn: () => adminApi.mailMarketingWebhookDestinations() as Promise<MailFlowWebhookDestinationDto[]>,
    retry: false,
  });
  const bootstrap = useQuery({
    queryKey: QK.bootstrap,
    queryFn: () => adminApi.mailMarketingSettingsBootstrap() as Promise<{ settings: Record<string, unknown>; triggerTypes: string[]; nodeTypes: string[] }>,
    retry: false,
  });
  const audienceFilters = useMemo(() => buildAudienceFilters(audienceDraft), [audienceDraft]);

  const refresh = () => {
    [overview, contacts, contactDetail, templates, templateWorkspace, audiences, audienceSnapshots, campaignSnapshots, campaigns, analytics, analyticsFunnel, analyticsCohorts, flows, webhookDestinations, bootstrap, previewProfiles, reusableSnippets, reusableBlocks, templateDeliveries].forEach((query) => query.refetch());
  };

  useEffect(() => {
    setSelectedPreviewProfileId('');
    setPreviewProfileName('');
    setPreviewProfileVariables(DEFAULT_PREVIEW_VARIABLES);
    setSelectedSnippetId('');
    setSnippetForm({ key: '', name: '', subject: '', html: '' });
    setSelectedBlockId('');
    setBlockForm({ key: '', name: '', category: 'general', html: '' });
    setEditingRevisionId('');
    setRevisionSource({ subject: '', previewText: '', html: '', css: '', text: '' });
    setRevisionSourceDirty(false);
    setRevisionPreview(null);
    setTemplateAssistantDraft(DEFAULT_TEMPLATE_ASSISTANT_DRAFT);
    setTemplateAssistantProposal(null);
  }, [selectedTemplateId]);

  useEffect(() => {
    const rows = previewProfiles.data ?? [];
    if (selectedPreviewProfileId || rows.length === 0) return;
    const profile = rows.find((row) => row.isDefault) ?? rows[0];
    setSelectedPreviewProfileId(profile.id);
    setPreviewProfileName(profile.name);
    setPreviewProfileVariables(JSON.stringify(profile.variables, null, 2));
  }, [previewProfiles.data, selectedPreviewProfileId]);

  useEffect(() => {
    setCampaignSnapshotId('');
  }, [campaignAudienceId]);

  useEffect(() => {
    const rows = campaignSnapshots.data ?? [];
    if (campaignSnapshotId || rows.length === 0) return;
    setCampaignSnapshotId(rows[0].id);
  }, [campaignSnapshots.data, campaignSnapshotId]);

  useEffect(() => {
    if (!bootstrap.data?.settings) return;
    setApprovalPolicyDraft(toApprovalPolicyDraft(approvalPolicyFromSettings(bootstrap.data.settings)));
  }, [bootstrap.data?.settings]);

  const createTemplate = useMutation({
    mutationFn: () => {
      const input = buildTemplateInputFromDraft(templateDraft);
      return adminApi.createMailMarketingTemplate(input);
    },
    onSuccess: async () => {
      toast.success('Template created');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templates }),
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: QK.overview }),
      ]);
    },
    onError: (error) => toast.error('Template create failed', { description: apiErrorMessage(error) }),
  });

  const previewAudience = useMutation({
    mutationFn: () => adminApi.previewMailMarketingAudience(audienceFilters) as Promise<MailAudiencePreviewResponse>,
    onError: (error) => toast.error('Audience preview failed', { description: apiErrorMessage(error) }),
  });

  const createAudience = useMutation({
    mutationFn: () => {
      const input: SaveMailAudienceInput = {
        name: audienceDraft.name.trim() || 'Purchase follow-up audience',
        description: audienceDraft.description.trim() || null,
        filters: audienceFilters,
        isArchived: false,
      };
      return adminApi.createMailMarketingAudience(input);
    },
    onSuccess: async () => {
      toast.success('Audience created');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.audiences }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Audience create failed', { description: apiErrorMessage(error) }),
  });

  const createAudienceSnapshot = useMutation({
    mutationFn: (audienceId: string) => adminApi.createMailMarketingAudienceSnapshot(audienceId, { name: `Frozen send list ${new Date().toLocaleString('en-US')}` }) as Promise<MailAudienceSnapshotDto>,
    onSuccess: async (snapshot) => {
      toast.success('Frozen audience snapshot created');
      setSelectedSnapshotId(snapshot.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['mail-marketing', 'audience-snapshots'] }),
        qc.invalidateQueries({ queryKey: QK.overview }),
      ]);
    },
    onError: (error) => toast.error('Snapshot failed', { description: apiErrorMessage(error) }),
  });

  const createFlow = useMutation({
    mutationFn: () => {
      const input: SaveMailFlowInput = {
        name: flowDraft.name.trim(),
        triggerType: flowDraft.triggerType,
        status: 'draft',
        graph: buildFlowGraphFromDraft(flowDraft),
        metadata: { source: 'admin_mail_marketing_flow_builder', actionType: flowDraft.actionType },
      };
      return adminApi.createMailMarketingFlow(input);
    },
    onSuccess: async () => {
      toast.success('Draft flow created');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.flows }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Flow create failed', { description: apiErrorMessage(error) }),
  });

  const updateApprovalPolicy = useMutation({
    mutationFn: () => {
      const settings = bootstrap.data?.settings ?? {};
      const input: MailMarketingSettingsInput = {
        sendingEnabled: false,
        providerMode: providerModeValue(settings.providerMode),
        defaultSenderName: String(settings.defaultSenderName ?? 'Factory Engine Pro'),
        defaultSenderEmail: typeof settings.defaultSenderEmail === 'string' ? settings.defaultSenderEmail : null,
        quietHours: quietHoursFromSettings(settings),
        dailySendCap: Number(settings.dailySendCap ?? 0) || 0,
        approvalPolicy: approvalPolicyFromDraft(approvalPolicyDraft),
        metadata: recordValue(settings.metadata),
      };
      return adminApi.updateMailMarketingSettings(input);
    },
    onSuccess: async () => {
      toast.success('Campaign approval policy saved');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.bootstrap }), qc.invalidateQueries({ queryKey: QK.campaigns })]);
    },
    onError: (error) => toast.error('Approval policy save failed', { description: apiErrorMessage(error) }),
  });

  const createWebhookDestination = useMutation({
    mutationFn: () => {
      const input: SaveMailFlowWebhookDestinationInput = {
        name: webhookDestinationDraft.name.trim(),
        url: webhookDestinationDraft.url.trim(),
        status: webhookDestinationDraft.status,
        authType: webhookDestinationDraft.authType,
        executionMode: webhookDestinationDraft.status === 'active' ? webhookDestinationDraft.executionMode : 'proof_only',
        clearSecret: false,
        secretHeaderName: webhookDestinationDraft.authType === 'header' ? webhookDestinationDraft.secretHeaderName.trim() : null,
        secretValue: webhookDestinationDraft.authType === 'header' ? webhookDestinationDraft.secretValue.trim() : null,
        timeoutMs: Number(webhookDestinationDraft.timeoutMs) || 5000,
        metadata: { source: 'admin_mail_marketing_settings' },
      };
      return adminApi.createMailMarketingWebhookDestination(input);
    },
    onSuccess: async () => {
      toast.success('Webhook destination saved');
      setWebhookDestinationDraft({ name: '', url: '', status: 'disabled', authType: 'none', executionMode: 'proof_only', secretHeaderName: '', secretValue: '', timeoutMs: '5000' });
      await qc.invalidateQueries({ queryKey: QK.webhookDestinations });
    },
    onError: (error) => toast.error('Webhook destination failed', { description: apiErrorMessage(error) }),
  });

  const approveWebhookDestination = useMutation({
    mutationFn: (destination: MailFlowWebhookDestinationDto) => adminApi.approveMailMarketingWebhookDestination(destination.id, { allowlistedUrl: destination.url }),
    onSuccess: async () => {
      toast.success('Webhook destination approved for exact target');
      await qc.invalidateQueries({ queryKey: QK.webhookDestinations });
    },
    onError: (error) => toast.error('Webhook approval failed', { description: apiErrorMessage(error) }),
  });

  const revokeWebhookDestination = useMutation({
    mutationFn: (destinationId: string) => adminApi.revokeMailMarketingWebhookDestinationApproval(destinationId),
    onSuccess: async () => {
      toast.success('Webhook live approval revoked');
      await qc.invalidateQueries({ queryKey: QK.webhookDestinations });
    },
    onError: (error) => toast.error('Webhook revoke failed', { description: apiErrorMessage(error) }),
  });

  const createCampaign = useMutation({
    mutationFn: () => {
      const input: SaveMailCampaignInput = {
        name: campaignName.trim(),
        audienceId: campaignAudienceId,
        snapshotId: campaignSnapshotId,
        templateId: campaignTemplateId,
        subjectOverride: campaignSubjectOverride.trim() || null,
        scheduledAt: campaignScheduledAt ? new Date(campaignScheduledAt).toISOString() : null,
        metadata: { source: 'admin_mail_marketing_campaign_tab' },
      };
      return adminApi.createMailMarketingCampaign(input);
    },
    onSuccess: async () => {
      toast.success('Campaign created');
      setCampaignName('');
      setCampaignSnapshotId('');
      setCampaignSubjectOverride('');
      setCampaignScheduledAt('');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.campaigns }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Campaign create failed', { description: apiErrorMessage(error) }),
  });

  const queueCampaign = useMutation({
    mutationFn: (campaignId: string) => adminApi.queueMailMarketingCampaign(campaignId),
    onSuccess: async () => {
      toast.success('Disabled campaign deliveries recorded');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.campaigns }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Campaign queue failed', { description: apiErrorMessage(error) }),
  });

  const approveCampaign = useMutation({
    mutationFn: (campaignId: string) => adminApi.approveMailMarketingCampaign(campaignId),
    onSuccess: async () => {
      toast.success('Campaign approved');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.campaigns }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Campaign approval failed', { description: apiErrorMessage(error) }),
  });

  const pauseCampaign = useMutation({
    mutationFn: (campaignId: string) => adminApi.pauseMailMarketingCampaign(campaignId),
    onSuccess: async () => {
      toast.success('Campaign paused');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.campaigns }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Campaign pause failed', { description: apiErrorMessage(error) }),
  });

  const cancelCampaign = useMutation({
    mutationFn: (campaignId: string) => adminApi.cancelMailMarketingCampaign(campaignId),
    onSuccess: async () => {
      toast.success('Campaign canceled');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.campaigns }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Campaign cancel failed', { description: apiErrorMessage(error) }),
  });

  const publishFlow = useMutation({
    mutationFn: (flowId: string) => adminApi.publishMailMarketingFlow(flowId),
    onSuccess: async () => {
      toast.success('Flow published with delivery disabled');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.flows }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Flow publish failed', { description: apiErrorMessage(error) }),
  });

  const pauseFlow = useMutation({
    mutationFn: (flowId: string) => adminApi.pauseMailMarketingFlow(flowId),
    onSuccess: async () => {
      toast.success('Flow paused');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.flows }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Flow pause failed', { description: apiErrorMessage(error) }),
  });

  const resumeFlow = useMutation({
    mutationFn: (flowId: string) => adminApi.resumeMailMarketingFlow(flowId),
    onSuccess: async () => {
      toast.success('Flow resumed with delivery disabled');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.flows }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Flow resume failed', { description: apiErrorMessage(error) }),
  });

  const validateFlow = useMutation({
    mutationFn: (flowId: string) => adminApi.validateMailMarketingFlow(flowId, { version: 'latest' }),
    onSuccess: (result) => {
      setFlowProof({ type: 'validation', flowId: result.flowId, result });
      toast.success(result.valid ? 'Flow validation passed' : 'Flow validation needs work', {
        description: result.valid ? `${result.summary.nodeCount} nodes checked` : result.issues[0],
      });
    },
    onError: (error) => toast.error('Flow validation failed', { description: apiErrorMessage(error) }),
  });

  const simulateFlow = useMutation({
    mutationFn: (flowId: string) => adminApi.simulateMailMarketingFlow(flowId, { version: 'latest', payload: { source: 'admin_flow_simulation' }, target: {} }),
    onSuccess: (result) => {
      setFlowProof({ type: 'simulation', flowId: result.flowId, result });
      toast.success(result.blocked ? 'Flow simulation blocked' : 'Flow simulation proof ready', {
        description: result.blocked ? result.issues[0] : `${result.steps.length} proof-only steps`,
      });
    },
    onError: (error) => toast.error('Flow simulation failed', { description: apiErrorMessage(error) }),
  });

  const duplicateTemplate = useMutation({
    mutationFn: (templateId: string) => adminApi.duplicateEmailTemplate(templateId),
    onSuccess: async () => {
      toast.success('Template duplicated');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templates }),
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: QK.overview }),
      ]);
    },
    onError: (error) => toast.error('Duplicate failed', { description: apiErrorMessage(error) }),
  });

  const duplicateRevision = useMutation({
    mutationFn: (revisionId: string) => adminApi.duplicateEmailTemplateRevision(revisionId),
    onSuccess: async () => {
      toast.success('Draft revision created');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templates }),
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-detail', selectedTemplateId] }),
      ]);
    },
    onError: (error) => toast.error('Draft create failed', { description: apiErrorMessage(error) }),
  });

  const approveRevision = useMutation({
    mutationFn: (revisionId: string) => adminApi.approveEmailTemplateRevision(revisionId, { comment: 'Approved from Mail Marketing workspace' }),
    onSuccess: async () => {
      toast.success('Revision approved');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-detail', selectedTemplateId] }),
      ]);
    },
    onError: (error) => toast.error('Approve failed', { description: apiErrorMessage(error) }),
  });

  const publishRevision = useMutation({
    mutationFn: (revisionId: string) => adminApi.publishEmailTemplateRevision(revisionId),
    onSuccess: async () => {
      toast.success('Revision published');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templates }),
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-detail', selectedTemplateId] }),
      ]);
    },
    onError: (error) => toast.error('Publish failed', { description: apiErrorMessage(error) }),
  });

  const activateRevision = useMutation({
    mutationFn: ({ template, revision }: { template: EmailTemplateDetail; revision: EmailTemplateVersion }) => adminApi.activateEmailTemplate(template.eventKey, { variantId: template.id, revisionId: revision.id }),
    onSuccess: async () => {
      toast.success('Template activated');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templates }),
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-detail', selectedTemplateId] }),
      ]);
    },
    onError: (error) => toast.error('Activate failed', { description: apiErrorMessage(error) }),
  });

  const updateRevisionSource = useMutation({
    mutationFn: (revisionId: string) => {
      const blockedReason = revisionSourceBlockedReason(revisionSource);
      if (blockedReason) throw new Error(blockedReason);
      return adminApi.updateEmailTemplateRevisionSource(revisionId, {
        subject: revisionSource.subject,
        previewText: revisionSource.previewText.trim() || null,
        html: revisionSource.html,
        css: revisionSource.css.trim() || null,
        text: revisionSource.text.trim() || null,
      });
    },
    onSuccess: async () => {
      toast.success('Revision source saved');
      setRevisionSourceDirty(false);
      setRevisionPreview(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.templates }),
        qc.invalidateQueries({ queryKey: QK.templateWorkspace }),
        qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-detail', selectedTemplateId] }),
      ]);
    },
    onError: (error) => toast.error('Revision save failed', { description: apiErrorMessage(error) }),
  });

  const proposeTemplateEdit = useMutation({
    mutationFn: (revisionId: string) => adminApi.proposeEmailTemplateAiEdit(revisionId, {
      mode: templateAssistantDraft.mode,
      instruction: templateAssistantDraft.instruction,
      audience: templateAssistantDraft.audience.trim() || null,
      brandVoice: templateAssistantDraft.brandVoice.trim() || null,
    }),
    onSuccess: (proposal) => {
      setTemplateAssistantProposal(proposal);
      toast.success('Draft proposal is ready', { description: proposal.changedFields.length ? proposal.changedFields.join(', ') : 'No source changes proposed' });
    },
    onError: (error) => toast.error('Draft proposal failed', { description: apiErrorMessage(error) }),
  });

  const previewRevision = useMutation({
    mutationFn: ({ revisionId, variables }: { revisionId: string; variables: Record<string, unknown> }) => adminApi.previewEmailTemplateRevision(revisionId, variables) as Promise<Omit<EmailTemplatePreviewResult, 'revisionId'>>,
    onSuccess: (preview, variables) => {
      setRevisionPreview({ revisionId: variables.revisionId, ...preview });
      toast.success('Preview rendered');
    },
    onError: (error) => toast.error('Preview failed', { description: apiErrorMessage(error) }),
  });

  const createPreviewProfile = useMutation({
    mutationFn: ({ name, variablesText }: { name: string; variablesText: string }) => {
      if (!selectedTemplateId) throw new Error('Select a template before saving a preview profile.');
      return adminApi.createEmailTemplatePreviewProfile({
        templateId: selectedTemplateId,
        eventKey: templateDetail.data?.eventKey ?? null,
        name: name.trim(),
        description: 'Saved from the Mail Marketing template test workspace.',
        variables: parsePreviewVariables(variablesText),
        isDefault: (previewProfiles.data ?? []).length === 0,
      });
    },
    onSuccess: async (profile) => {
      toast.success('Preview profile saved');
      setSelectedPreviewProfileId(profile.id);
      setPreviewProfileName(profile.name);
      setPreviewProfileVariables(JSON.stringify(profile.variables, null, 2));
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-preview-profiles', selectedTemplateId] });
    },
    onError: (error) => toast.error('Preview profile save failed', { description: apiErrorMessage(error) }),
  });

  const updatePreviewProfile = useMutation({
    mutationFn: ({ profileId, name, variablesText }: { profileId: string; name: string; variablesText: string }) => adminApi.updateEmailTemplatePreviewProfile(profileId, {
      name: name.trim(),
      variables: parsePreviewVariables(variablesText),
    }),
    onSuccess: async (profile) => {
      toast.success('Preview profile updated');
      setPreviewProfileName(profile.name);
      setPreviewProfileVariables(JSON.stringify(profile.variables, null, 2));
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-preview-profiles', selectedTemplateId] });
    },
    onError: (error) => toast.error('Preview profile update failed', { description: apiErrorMessage(error) }),
  });

  const deletePreviewProfile = useMutation({
    mutationFn: (profileId: string) => adminApi.deleteEmailTemplatePreviewProfile(profileId),
    onSuccess: async () => {
      toast.success('Preview profile deleted');
      setSelectedPreviewProfileId('');
      setPreviewProfileName('');
      setPreviewProfileVariables(DEFAULT_PREVIEW_VARIABLES);
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-preview-profiles', selectedTemplateId] });
    },
    onError: (error) => toast.error('Preview profile delete failed', { description: apiErrorMessage(error) }),
  });

  const createSnippet = useMutation({
    mutationFn: () => adminApi.createEmailTemplateSnippet({
      key: snippetForm.key.trim(),
      name: snippetForm.name.trim(),
      templateType: templateDetail.data?.templateType ?? null,
      subject: snippetForm.subject.trim() || null,
      html: snippetForm.html.trim() || null,
      text: null,
      css: null,
      metadata: { source: 'admin_template_workspace' },
      isArchived: false,
    }),
    onSuccess: async () => {
      toast.success('Reusable snippet saved');
      setSnippetForm({ key: '', name: '', subject: '', html: '' });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-snippets'] });
    },
    onError: (error) => toast.error('Snippet save failed', { description: apiErrorMessage(error) }),
  });

  const updateSnippet = useMutation({
    mutationFn: (snippetId: string) => adminApi.updateEmailTemplateSnippet(snippetId, {
      key: snippetForm.key.trim(),
      name: snippetForm.name.trim(),
      subject: snippetForm.subject.trim() || null,
      html: snippetForm.html.trim() || null,
      text: null,
      css: null,
      metadata: { source: 'admin_template_workspace' },
    }),
    onSuccess: async (snippet) => {
      toast.success('Reusable snippet updated');
      setSelectedSnippetId(snippet.id);
      setSnippetForm({ key: snippet.key, name: snippet.name, subject: snippet.subject ?? '', html: snippet.html ?? snippet.text ?? '' });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-snippets'] });
    },
    onError: (error) => toast.error('Snippet update failed', { description: apiErrorMessage(error) }),
  });

  const archiveSnippet = useMutation({
    mutationFn: (snippetId: string) => adminApi.deleteEmailTemplateSnippet(snippetId),
    onSuccess: async () => {
      toast.success('Reusable snippet archived');
      setSelectedSnippetId('');
      setSnippetForm({ key: '', name: '', subject: '', html: '' });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-snippets'] });
    },
    onError: (error) => toast.error('Snippet archive failed', { description: apiErrorMessage(error) }),
  });

  const createBlock = useMutation({
    mutationFn: () => adminApi.createEmailTemplateBlock({
      key: blockForm.key.trim(),
      name: blockForm.name.trim(),
      category: blockForm.category.trim() || 'general',
      html: blockForm.html.trim(),
      css: null,
      metadata: { source: 'admin_template_workspace' },
      isArchived: false,
    }),
    onSuccess: async () => {
      toast.success('Reusable block saved');
      setBlockForm({ key: '', name: '', category: 'general', html: '' });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-blocks'] });
    },
    onError: (error) => toast.error('Block save failed', { description: apiErrorMessage(error) }),
  });

  const updateBlock = useMutation({
    mutationFn: (blockId: string) => adminApi.updateEmailTemplateBlock(blockId, {
      key: blockForm.key.trim(),
      name: blockForm.name.trim(),
      category: blockForm.category.trim() || 'general',
      html: blockForm.html.trim(),
      css: null,
      metadata: { source: 'admin_template_workspace' },
    }),
    onSuccess: async (block) => {
      toast.success('Reusable block updated');
      setSelectedBlockId(block.id);
      setBlockForm({ key: block.key, name: block.name, category: block.category, html: block.html });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-blocks'] });
    },
    onError: (error) => toast.error('Block update failed', { description: apiErrorMessage(error) }),
  });

  const archiveBlock = useMutation({
    mutationFn: (blockId: string) => adminApi.deleteEmailTemplateBlock(blockId),
    onSuccess: async () => {
      toast.success('Reusable block archived');
      setSelectedBlockId('');
      setBlockForm({ key: '', name: '', category: 'general', html: '' });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-blocks'] });
    },
    onError: (error) => toast.error('Block archive failed', { description: apiErrorMessage(error) }),
  });

  const testRevision = useMutation({
    mutationFn: ({ revisionId, to, variables }: { revisionId: string; to: string; variables: Record<string, unknown> }) => adminApi.testEmailTemplateRevision(revisionId, {
      to,
      variables,
    }),
    onSuccess: async (result) => {
      const deliveryId = typeof result === 'object' && result && 'deliveryId' in result ? String(result.deliveryId) : undefined;
      toast.success('Disabled delivery recorded', { description: deliveryId });
      await qc.invalidateQueries({ queryKey: ['mail-marketing', 'template-deliveries', selectedTemplateId] });
    },
    onError: (error) => toast.error('Test send failed', { description: apiErrorMessage(error) }),
  });

  const handlePreviewProfileSelect = (profileId: string) => {
    setSelectedPreviewProfileId(profileId);
    const profile = (previewProfiles.data ?? []).find((row) => row.id === profileId);
    if (!profile) return;
    setPreviewProfileName(profile.name);
    setPreviewProfileVariables(JSON.stringify(profile.variables, null, 2));
  };

  const handleTestRevision = (revisionId: string) => {
    try {
      testRevision.mutate({
        revisionId,
        to: testRecipient,
        variables: parsePreviewVariables(previewProfileVariables),
      });
    } catch (error) {
      toast.error('Preview data is invalid', { description: apiErrorMessage(error) });
    }
  };

  const handleEditRevision = (version: EmailTemplateVersion) => {
    setEditingRevisionId(version.id);
    setRevisionSource({
      subject: version.subject,
      previewText: version.previewText ?? '',
      html: version.html,
      css: version.css ?? '',
      text: version.text ?? '',
    });
    setRevisionPreview(null);
    setRevisionSourceDirty(false);
    setTemplateAssistantDraft(DEFAULT_TEMPLATE_ASSISTANT_DRAFT);
    setTemplateAssistantProposal(null);
  };

  const handleRevisionSourceChange = (value: { subject: string; previewText: string; html: string; css: string; text: string }) => {
    setRevisionSource(value);
    setRevisionSourceDirty(true);
    setRevisionPreview(null);
    setTemplateAssistantProposal(null);
  };

  const handleProposeTemplateEdit = (revisionId: string) => {
    if (templateAssistantDraft.instruction.trim().length < 8) {
      toast.error('Describe the draft change first');
      return;
    }
    proposeTemplateEdit.mutate(revisionId);
  };

  const handleUseTemplateProposal = (proposal: EmailTemplateAiEditProposalResponse) => {
    if (proposal.revisionId !== editingRevisionId) {
      toast.error('Open the matching revision editor first.');
      return;
    }
    setRevisionSource({
      subject: proposal.draft.subject,
      previewText: proposal.draft.previewText ?? '',
      html: proposal.draft.html,
      css: proposal.draft.css ?? '',
      text: proposal.draft.text ?? '',
    });
    setRevisionSourceDirty(true);
    setRevisionPreview(null);
    toast.success('Proposal copied to source editor', { description: 'Save, render, and record test proof before release.' });
  };

  const handlePreviewRevision = (revisionId: string) => {
    try {
      previewRevision.mutate({
        revisionId,
        variables: parsePreviewVariables(previewProfileVariables),
      });
    } catch (error) {
      toast.error('Preview data is invalid', { description: apiErrorMessage(error) });
    }
  };

  const handleCreatePreviewProfile = () => {
    try {
      createPreviewProfile.mutate({ name: previewProfileName, variablesText: previewProfileVariables });
    } catch (error) {
      toast.error('Preview profile is invalid', { description: apiErrorMessage(error) });
    }
  };

  const handleUpdatePreviewProfile = () => {
    if (!selectedPreviewProfileId) return;
    try {
      updatePreviewProfile.mutate({
        profileId: selectedPreviewProfileId,
        name: previewProfileName,
        variablesText: previewProfileVariables,
      });
    } catch (error) {
      toast.error('Preview profile is invalid', { description: apiErrorMessage(error) });
    }
  };

  const handleSelectSnippet = (snippet: MailTemplateSnippetDto) => {
    setSelectedSnippetId(snippet.id);
    setSnippetForm({
      key: snippet.key,
      name: snippet.name,
      subject: snippet.subject ?? '',
      html: snippet.html ?? snippet.text ?? '',
    });
  };

  const handleSelectBlock = (block: MailTemplateBlockDto) => {
    setSelectedBlockId(block.id);
    setBlockForm({
      key: block.key,
      name: block.name,
      category: block.category,
      html: block.html,
    });
  };

  const counts = overview.data?.counts;
  const hasError = overview.isError || contacts.isError || templates.isError || templateWorkspace.isError || audiences.isError || campaigns.isError || analytics.isError || analyticsFunnel.isError || analyticsCohorts.isError || flows.isError || bootstrap.isError;

  useEffect(() => {
    if (!selectedAudienceId && audiences.data?.[0]) setSelectedAudienceId(audiences.data[0].id);
  }, [audiences.data, selectedAudienceId]);

  useEffect(() => {
    if (!contacts.data?.length) {
      if (selectedContactId) setSelectedContactId(null);
      return;
    }
    if (!selectedContactId || !contacts.data.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId(contacts.data[0].id);
    }
  }, [contacts.data, selectedContactId]);

  useEffect(() => {
    setSelectedSnapshotId('');
    setSnapshotSearch('');
  }, [selectedAudienceId]);

  useEffect(() => {
    if (!selectedSnapshotId && audienceSnapshots.data?.[0]) setSelectedSnapshotId(audienceSnapshots.data[0].id);
  }, [audienceSnapshots.data, selectedSnapshotId]);

  const deliveryMode = overview.data?.provider.mode ?? providerModeValue(bootstrap.data?.settings?.providerMode);

  return (
    <>
      <PageHeader
        titleI18nKey="mail_marketing.title"
        subtitleI18nKey="mail_marketing.subtitle"
        actions={<button className="btn" type="button" onClick={refresh}><RefreshCw size={14} /> Refresh</button>}
      />

      <div className="sr-kpi-row">
        <Kpi label="Contacts" value={counts?.contacts ?? 0} tone="" icon={<Users size={15} />} />
        <Kpi label="Sendable" value={counts?.sendableContacts ?? 0} tone="success" icon={<Send size={15} />} />
        <Kpi label="Templates" value={counts?.templates ?? 0} tone="info" icon={<FileText size={15} />} />
        <Kpi label="Campaigns" value={counts?.campaigns ?? 0} tone="info" icon={<Mail size={15} />} />
        <Kpi label="Flows" value={counts?.flows ?? 0} tone="warn" icon={<PlayCircle size={15} />} />
      </div>

      {overview.data && (
        <div className="section" style={{ marginBottom: 16 }}>
          <h3>
            <span>Delivery mode</span>
            <span className={`pill ${providerModeTone(deliveryMode)}`}>{providerModeLabel(deliveryMode)}</span>
          </h3>
          <div className="muted">{overview.data.provider.message}</div>
        </div>
      )}

      <div className="orders-toolbar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {MAIL_MARKETING_TABS.map((entry) => (
          <button key={entry} type="button" className={`btn ${tab === entry ? 'primary' : ''}`} onClick={() => setTab(entry)}>
            {label(entry)}
          </button>
        ))}
      </div>

      {hasError && (
        <StateBlock
          title="Mail Marketing data could not load"
          body={[overview.error, contacts.error, templates.error, templateWorkspace.error, audiences.error, campaigns.error, analytics.error, analyticsFunnel.error, analyticsCohorts.error, flows.error, bootstrap.error].filter(Boolean).map(apiErrorMessage)[0] ?? 'Request failed'}
          action={<button className="btn" type="button" onClick={refresh}><RefreshCw size={14} /> Retry</button>}
        />
      )}

      {!hasError && tab === 'overview' && (
        <OverviewPanel
          loading={overview.isLoading}
          overview={overview.data}
          analytics={analytics.data}
          analyticsFunnel={analyticsFunnel.data}
          analyticsCohorts={analyticsCohorts.data}
          analyticsLoading={analytics.isLoading || analyticsFunnel.isLoading || analyticsCohorts.isLoading}
          providerMode={deliveryMode}
          canTemplateWrite={canTemplateWrite}
          canAudienceWrite={canAudienceWrite}
          canFlowWrite={canFlowWrite}
          onOpenTemplates={() => setTab('templates')}
          onOpenAudiences={() => setTab('audiences')}
          onOpenFlows={() => setTab('flows')}
        />
      )}
      {!hasError && tab === 'contacts' && (
        <ContactsPanel
          loading={contacts.isLoading}
          rows={contacts.data ?? []}
          selectedId={selectedContactId}
          onSelect={setSelectedContactId}
          detail={contactDetail.data}
          detailLoading={contactDetail.isFetching}
          detailError={contactDetail.error ? apiErrorMessage(contactDetail.error) : null}
          onRefreshDetail={() => contactDetail.refetch()}
        />
      )}
      {!hasError && tab === 'templates' && (
        <TemplatesPanel
          loading={templates.isLoading || templateWorkspace.isLoading}
          rows={(templateWorkspace.data?.templates ?? templates.data ?? []) as EmailTemplate[]}
          events={templateWorkspace.data?.events ?? []}
          canTemplateWrite={canTemplateWrite}
          canTemplateApprove={canTemplateApprove}
          canTemplatePublish={canTemplatePublish}
          templateDraft={templateDraft}
          onTemplateDraftChange={setTemplateDraft}
          onCreate={() => createTemplate.mutate()}
          creating={createTemplate.isPending}
          selectedId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          detail={templateDetail.data}
          detailLoading={templateDetail.isFetching}
          detailError={templateDetail.error ? apiErrorMessage(templateDetail.error) : null}
          deliveryRows={templateDeliveries.data ?? []}
          deliveriesLoading={templateDeliveries.isFetching}
          deliveriesError={templateDeliveries.error ? apiErrorMessage(templateDeliveries.error) : null}
          onRefreshDeliveries={() => templateDeliveries.refetch()}
          testRecipient={testRecipient}
          onTestRecipientChange={setTestRecipient}
          previewProfiles={previewProfiles.data ?? []}
          previewProfilesLoading={previewProfiles.isFetching}
          previewProfilesError={previewProfiles.error ? apiErrorMessage(previewProfiles.error) : null}
          selectedPreviewProfileId={selectedPreviewProfileId}
          onPreviewProfileSelect={handlePreviewProfileSelect}
          previewProfileName={previewProfileName}
          onPreviewProfileNameChange={setPreviewProfileName}
          previewProfileVariables={previewProfileVariables}
          onPreviewProfileVariablesChange={setPreviewProfileVariables}
          onCreatePreviewProfile={handleCreatePreviewProfile}
          onUpdatePreviewProfile={handleUpdatePreviewProfile}
          onDeletePreviewProfile={(profileId) => deletePreviewProfile.mutate(profileId)}
          snippets={reusableSnippets.data ?? []}
          snippetsLoading={reusableSnippets.isFetching}
          snippetsError={reusableSnippets.error ? apiErrorMessage(reusableSnippets.error) : null}
          selectedSnippetId={selectedSnippetId}
          snippetForm={snippetForm}
          onSnippetFormChange={setSnippetForm}
          onSelectSnippet={handleSelectSnippet}
          onCreateSnippet={() => createSnippet.mutate()}
          onUpdateSnippet={() => selectedSnippetId && updateSnippet.mutate(selectedSnippetId)}
          onArchiveSnippet={(snippetId) => archiveSnippet.mutate(snippetId)}
          blocks={reusableBlocks.data ?? []}
          blocksLoading={reusableBlocks.isFetching}
          blocksError={reusableBlocks.error ? apiErrorMessage(reusableBlocks.error) : null}
          selectedBlockId={selectedBlockId}
          blockForm={blockForm}
          onBlockFormChange={setBlockForm}
          onSelectBlock={handleSelectBlock}
          onCreateBlock={() => createBlock.mutate()}
          onUpdateBlock={() => selectedBlockId && updateBlock.mutate(selectedBlockId)}
          onArchiveBlock={(blockId) => archiveBlock.mutate(blockId)}
          onDuplicateTemplate={(templateId) => duplicateTemplate.mutate(templateId)}
          onDuplicateRevision={(revisionId) => duplicateRevision.mutate(revisionId)}
          onApproveRevision={(revisionId) => approveRevision.mutate(revisionId)}
          onPublishRevision={(revisionId) => publishRevision.mutate(revisionId)}
          onActivateRevision={(template, revision) => activateRevision.mutate({ template, revision })}
          onTestRevision={handleTestRevision}
          editingRevisionId={editingRevisionId}
          revisionSource={revisionSource}
          revisionSourceDirty={revisionSourceDirty}
          onRevisionSourceChange={handleRevisionSourceChange}
          revisionPreview={revisionPreview}
          templateAssistantDraft={templateAssistantDraft}
          templateAssistantProposal={templateAssistantProposal}
          templateAssistantPending={proposeTemplateEdit.isPending}
          templateAssistantError={proposeTemplateEdit.error ? apiErrorMessage(proposeTemplateEdit.error) : null}
          onTemplateAssistantDraftChange={setTemplateAssistantDraft}
          onProposeTemplateEdit={handleProposeTemplateEdit}
          onUseTemplateProposal={handleUseTemplateProposal}
          onEditRevision={handleEditRevision}
          onSaveRevisionSource={(revisionId) => updateRevisionSource.mutate(revisionId)}
          onPreviewRevision={handlePreviewRevision}
          providerMode={deliveryMode}
          actionPending={duplicateTemplate.isPending || duplicateRevision.isPending || approveRevision.isPending || publishRevision.isPending || activateRevision.isPending || testRevision.isPending || updateRevisionSource.isPending || previewRevision.isPending || proposeTemplateEdit.isPending || createPreviewProfile.isPending || updatePreviewProfile.isPending || deletePreviewProfile.isPending || createSnippet.isPending || updateSnippet.isPending || archiveSnippet.isPending || createBlock.isPending || updateBlock.isPending || archiveBlock.isPending}
        />
      )}
      {!hasError && tab === 'audiences' && (
        <AudiencesPanel
          loading={audiences.isLoading}
          rows={audiences.data ?? []}
          canAudienceWrite={canAudienceWrite}
          onCreate={() => createAudience.mutate()}
          creating={createAudience.isPending}
          draft={audienceDraft}
          onDraftChange={setAudienceDraft}
          onPreview={() => previewAudience.mutate()}
          preview={previewAudience.data}
          previewing={previewAudience.isPending}
          previewError={previewAudience.error ? apiErrorMessage(previewAudience.error) : null}
          selectedAudienceId={selectedAudienceId}
          onSelectAudience={setSelectedAudienceId}
          snapshots={audienceSnapshots.data ?? []}
          snapshotsLoading={audienceSnapshots.isFetching}
          snapshotsError={audienceSnapshots.error ? apiErrorMessage(audienceSnapshots.error) : null}
          onCreateSnapshot={() => selectedAudienceId && createAudienceSnapshot.mutate(selectedAudienceId)}
          creatingSnapshot={createAudienceSnapshot.isPending}
          selectedSnapshotId={selectedSnapshotId}
          onSelectSnapshot={setSelectedSnapshotId}
          snapshotSearch={snapshotSearch}
          onSnapshotSearchChange={setSnapshotSearch}
          snapshotMembers={snapshotMembers.data}
          snapshotMembersLoading={snapshotMembers.isFetching}
          snapshotMembersError={snapshotMembers.error ? apiErrorMessage(snapshotMembers.error) : null}
          snapshotDiff={snapshotDiff.data}
          snapshotDiffLoading={snapshotDiff.isFetching}
          snapshotDiffError={snapshotDiff.error ? apiErrorMessage(snapshotDiff.error) : null}
          providerMode={deliveryMode}
          onOpenContactDetail={(contactId) => {
            setSelectedContactId(contactId);
            setTab('contacts');
          }}
        />
      )}
      {!hasError && tab === 'campaigns' && (
        <CampaignsPanel
          loading={campaigns.isLoading}
          rows={campaigns.data ?? []}
          audiences={audiences.data ?? []}
          templates={templates.data ?? []}
          approvalPolicy={approvalPolicyFromSettings(bootstrap.data?.settings)}
          canCampaignWrite={canCampaignWrite}
          canCampaignApprove={canCampaignApprove}
          canCampaignPublish={canCampaignPublish}
          campaignName={campaignName}
          audienceId={campaignAudienceId}
          snapshotId={campaignSnapshotId}
          snapshots={campaignSnapshots.data ?? []}
          snapshotsLoading={campaignSnapshots.isFetching}
          snapshotsError={campaignSnapshots.error ? apiErrorMessage(campaignSnapshots.error) : null}
          templateId={campaignTemplateId}
          subjectOverride={campaignSubjectOverride}
          scheduledAt={campaignScheduledAt}
          onCampaignNameChange={setCampaignName}
          onAudienceChange={setCampaignAudienceId}
          onSnapshotChange={setCampaignSnapshotId}
          onTemplateChange={setCampaignTemplateId}
          onSubjectOverrideChange={setCampaignSubjectOverride}
          onScheduledAtChange={setCampaignScheduledAt}
          onCreate={() => createCampaign.mutate()}
          onQueue={(id) => queueCampaign.mutate(id)}
          onApprove={(id) => approveCampaign.mutate(id)}
          onPause={(id) => pauseCampaign.mutate(id)}
          onCancel={(id) => cancelCampaign.mutate(id)}
          creating={createCampaign.isPending}
          actionPending={queueCampaign.isPending || approveCampaign.isPending || pauseCampaign.isPending || cancelCampaign.isPending}
        />
      )}
      {!hasError && tab === 'flows' && (
        <FlowsPanel
          loading={flows.isLoading}
          rows={flows.data ?? []}
          triggerTypes={bootstrap.data?.triggerTypes ?? []}
          templates={templates.data ?? []}
          audiences={audiences.data ?? []}
          destinations={webhookDestinations.data ?? []}
          canFlowWrite={canFlowWrite}
          canFlowPublish={canFlowPublish}
          draft={flowDraft}
          onDraftChange={setFlowDraft}
          onCreate={() => createFlow.mutate()}
          creating={createFlow.isPending}
          onPublish={(flowId) => publishFlow.mutate(flowId)}
          onPause={(flowId) => pauseFlow.mutate(flowId)}
          onResume={(flowId) => resumeFlow.mutate(flowId)}
          onValidate={(flowId) => validateFlow.mutate(flowId)}
          onSimulate={(flowId) => simulateFlow.mutate(flowId)}
          proof={flowProof}
          actionPending={publishFlow.isPending || pauseFlow.isPending || resumeFlow.isPending || validateFlow.isPending || simulateFlow.isPending}
        />
      )}
      {!hasError && tab === 'settings' && (
        <SettingsPanel
          loading={bootstrap.isLoading}
          data={bootstrap.data}
          destinations={webhookDestinations.data ?? []}
          destinationsLoading={webhookDestinations.isLoading}
          destinationsError={webhookDestinations.error ? apiErrorMessage(webhookDestinations.error) : null}
          approvalPolicyDraft={approvalPolicyDraft}
          onApprovalPolicyDraftChange={setApprovalPolicyDraft}
          onSaveApprovalPolicy={() => updateApprovalPolicy.mutate()}
          savingApprovalPolicy={updateApprovalPolicy.isPending}
          canSettingsWrite={canSettingsWrite}
          canFlowWrite={canFlowWrite}
          canFlowPublish={canFlowPublish}
          draft={webhookDestinationDraft}
          onDraftChange={setWebhookDestinationDraft}
          onCreateDestination={() => createWebhookDestination.mutate()}
          creatingDestination={createWebhookDestination.isPending}
          onApproveDestination={(destination) => approveWebhookDestination.mutate(destination)}
          onRevokeDestination={(destinationId) => revokeWebhookDestination.mutate(destinationId)}
          destinationApprovalPending={approveWebhookDestination.isPending || revokeWebhookDestination.isPending}
        />
      )}
    </>
  );
}

function OverviewPanel({
  loading,
  overview,
  analytics,
  analyticsFunnel,
  analyticsCohorts,
  analyticsLoading,
  providerMode,
  canTemplateWrite,
  canAudienceWrite,
  canFlowWrite,
  onOpenTemplates,
  onOpenAudiences,
  onOpenFlows,
}: {
  loading: boolean;
  overview?: MailMarketingOverviewResponse;
  analytics?: MailMarketingAnalyticsOverviewResponse;
  analyticsFunnel?: MailMarketingAnalyticsFunnelResponse;
  analyticsCohorts?: MailMarketingAnalyticsCohortResponse;
  analyticsLoading: boolean;
  providerMode: MailProviderMode;
  canTemplateWrite: boolean;
  canAudienceWrite: boolean;
  canFlowWrite: boolean;
  onOpenTemplates: () => void;
  onOpenAudiences: () => void;
  onOpenFlows: () => void;
}) {
  if (loading) return <StateBlock title="Loading Mail Marketing" body="Reading live tenant mail state." />;
  if (!overview) return null;
  const empty = overview.counts.templates === 0 && overview.counts.audiences === 0 && overview.counts.flows === 0;
  if (empty) {
    return (
      <StateBlock
        title="No marketing assets yet"
        body="Open the guided builders to create a configured template draft, a sendable audience, and a proof-first flow from tenant data."
        action={canTemplateWrite || canAudienceWrite || canFlowWrite ? (
          <div className="orders-toolbar" style={{ justifyContent: 'center' }}>
            {canTemplateWrite && <button className="btn primary" type="button" onClick={onOpenTemplates}><FileText size={14} /> Template builder</button>}
            {canAudienceWrite && <button className="btn" type="button" onClick={onOpenAudiences}><Users size={14} /> Audience builder</button>}
            {canFlowWrite && <button className="btn" type="button" onClick={onOpenFlows}><PlayCircle size={14} /> Flow builder</button>}
          </div>
        ) : undefined}
      />
    );
  }
  return (
    <div className="row-stack">
      <section className="section">
        <h3>
          <span>Operational proof</span>
          <span className={`pill ${providerModeTone(analytics?.providerMode ?? providerMode)}`}>{providerModeLabel(analytics?.providerMode ?? providerMode)}</span>
        </h3>
        {analyticsLoading ? (
          <StateBlock title="Loading proof analytics" body="Reading stored delivery, blocker, campaign, and flow records." />
        ) : analytics ? (
          <>
            <div className="sr-kpi-row" style={{ marginBottom: 14 }}>
              <Kpi label="Delivery proof" value={analytics.totals.deliveries} tone="info" icon={<Mail size={15} />} />
              <Kpi label="Blocked / skipped" value={analytics.totals.skipped + analytics.totals.activeSuppressions} tone="warn" icon={<AlertTriangle size={15} />} />
              <Kpi label="Verified opens / clicks" value={analytics.totals.openedEvents + analytics.totals.clickedEvents} tone="info" icon={<Send size={15} />} />
              <Kpi label="Safe revenue link" value={formatMoney(analytics.totals.conservativeRevenue)} tone="success" icon={<Send size={15} />} />
              <Kpi label="Flow actions" value={analytics.totals.flowActions} tone="" icon={<PlayCircle size={15} />} />
            </div>
            {analytics.topCampaigns.length === 0 ? (
              <StateBlock title="No campaign proof yet" body="Create an audience snapshot, approve a campaign, then record disabled delivery proof before analytics appears here." />
            ) : (
              <div className="data-card">
                <table className="data-table">
                  <thead><tr><th>Campaign</th><th>Proof</th><th>Blocked</th><th>Safe attribution</th></tr></thead>
                  <tbody>
                    {analytics.topCampaigns.slice(0, 5).map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="name">{row.name}</div>
                          <div className="muted">{row.notes[0]}</div>
                        </td>
                        <td>{row.deliveryCount} record(s)</td>
                        <td><span className={`pill ${row.skippedCount || row.suppressedCount ? 'warn' : 'success'}`}>{row.skippedCount + row.suppressedCount}</span></td>
                        <td>{row.conservativeOrders} order(s) · {formatMoney(row.conservativeRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="muted" style={{ marginTop: 10 }}>{analytics.proofNotes[0]}</div>
            <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, .8fr)', marginTop: 14 }}>
              <div className="data-card">
                <div className="card-title-row">
                  <strong>Proof funnel</strong>
                  <span className="muted">real records only</span>
                </div>
                {!analyticsFunnel || analyticsFunnel.stages.every((stage) => stage.count === 0) ? (
                  <StateBlock title="No funnel proof yet" body="Freeze an audience and record delivery proof before the funnel can show where customers stopped." />
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Stage</th><th>Count</th><th>Rate</th></tr></thead>
                    <tbody>
                      {analyticsFunnel.stages.map((stage) => (
                        <tr key={stage.key}>
                          <td>
                            <div className="name">{stage.label}</div>
                            <div className="muted">{stage.note}</div>
                          </td>
                          <td>{stage.count}</td>
                          <td>{stage.conversionRate === null ? '-' : `${stage.conversionRate}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="data-card">
                <div className="card-title-row">
                  <strong>Customer/order cohorts</strong>
                  <span className="muted">customerId match</span>
                </div>
                {!analyticsCohorts || analyticsCohorts.rows.length === 0 ? (
                  <StateBlock title="No conservative order links" body="Orders appear here only when the customer id matches a delivery proof row and the order happened after that delivery." />
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Customers</th><th>Orders</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {analyticsCohorts.rows.slice(0, 5).map((row) => (
                        <tr key={row.cohortKey}>
                          <td>
                            <div className="name">{row.label}</div>
                            <div className="muted">{row.deliveryProofCount} matched delivery proof</div>
                          </td>
                          <td>{row.customerCount}</td>
                          <td>{row.orderCount}</td>
                          <td>{formatMoney(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : (
          <StateBlock title="No proof analytics" body="Analytics endpoint returned no data for this tenant." />
        )}
      </section>
      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, .7fr)' }}>
        <section className="section">
          <h3>Recent mail events</h3>
          {overview.recentEvents.length === 0 ? (
            <StateBlock title="No events recorded" body="Mail Marketing events will appear here after audiences or flows are changed." />
          ) : (
            <div className="data-card">
              <table className="data-table">
                <thead><tr><th>Event</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {overview.recentEvents.map((event) => (
                    <tr key={event.id}><td>{event.eventType}</td><td><span className="pill info">{event.status}</span></td><td className="muted">{fmtDate(event.createdAt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="section">
          <h3>Guided builders</h3>
          <div className="muted" style={{ marginBottom: 12 }}>
            These shortcuts open the correct builder first. They do not create hidden drafts or duplicate records from the overview.
          </div>
          <div className="row-stack">
            <button className="btn" type="button" disabled={!canTemplateWrite} onClick={onOpenTemplates}><FileText size={14} /> Template draft composer</button>
            <button className="btn" type="button" disabled={!canAudienceWrite} onClick={onOpenAudiences}><Users size={14} /> Sendable audience builder</button>
            <button className="btn" type="button" disabled={!canFlowWrite} onClick={onOpenFlows}><PlayCircle size={14} /> Proof-first flow builder</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ContactsPanel({
  loading,
  rows,
  selectedId,
  onSelect,
  detail,
  detailLoading,
  detailError,
  onRefreshDetail,
}: {
  loading: boolean;
  rows: MailContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  detail?: MailContactDetailDto;
  detailLoading: boolean;
  detailError: string | null;
  onRefreshDetail: () => void;
}) {
  if (loading) return <StateBlock title="Loading contacts" body="Importing live customer emails into mail contacts." />;
  if (rows.length === 0) return <StateBlock title="No contacts" body="No customer email addresses are available for this tenant yet." />;
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(420px, .8fr) minmax(0, 1.2fr)' }}>
      <section className="section">
        <h3>
          <span>Contacts</span>
          <span className="pill info">{rows.length} loaded</span>
        </h3>
        <div className="muted" style={{ marginBottom: 10 }}>Search-first contact graph imported from live customers. Select a row to inspect reachability, consent, audience, and proof.</div>
        <Table headers={['Contact', 'Consent', 'Reachability', 'Last activity']}>
          {rows.map((row) => (
            <tr key={row.id} className={selectedId === row.id ? 'selected-row' : undefined} onClick={() => onSelect(row.id)} style={{ cursor: 'pointer' }}>
              <td>
                <div className="name">{row.name ?? row.email}</div>
                <div className="muted">{row.email}</div>
                {row.phone && <div className="muted">{row.phone}</div>}
              </td>
              <td>
                <span className={`pill ${row.consentState === 'subscribed' ? 'success' : row.consentState === 'unsubscribed' ? 'warn' : 'info'}`}>
                  {humanizeKey(row.consentState || 'unknown')}
                </span>
              </td>
              <td>
                <span className={`pill ${row.isSendable ? 'success' : 'warn'}`}>{row.isSendable ? 'Reachable' : 'Blocked'}</span>
                <div className="muted">{row.buyerIntent ? humanizeKey(row.buyerIntent) : row.tags.slice(0, 2).join(', ') || 'No tag context'}</div>
              </td>
              <td className="muted">{fmtDate(row.lastActivityAt)}</td>
            </tr>
          ))}
        </Table>
      </section>
      <ContactDetailPanel
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onRefresh={onRefreshDetail}
      />
    </div>
  );
}

function ContactDetailPanel({
  detail,
  loading,
  error,
  onRefresh,
}: {
  detail?: MailContactDetailDto;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading) return <StateBlock title="Loading contact detail" body="Reading identities, consent, audience memberships, delivery proof, and recent events." />;
  if (error) return <StateBlock title="Contact detail could not load" body={error} action={<button className="btn" type="button" onClick={onRefresh}><RefreshCw size={14} /> Retry</button>} />;
  if (!detail) return <StateBlock title="Select a contact" body="Choose a contact to inspect identity, consent, suppression, audience membership, and proof." />;

  const activeSuppression = detail.suppressionHistory.find((row) => row.isActive);
  const reachable = detail.contact.isSendable && detail.contact.consentState !== 'unsubscribed' && !activeSuppression;

  return (
    <section className="section">
      <h3>
        <span>Contact decision panel</span>
        <span className={`pill ${reachable ? 'success' : 'warn'}`}>{reachable ? 'Reachable' : 'Blocked'}</span>
      </h3>
      <div className="data-card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="name">{detail.contact.name ?? detail.contact.email}</div>
            <div className="muted">{detail.contact.email}{detail.contact.phone ? ` · ${detail.contact.phone}` : ''}</div>
            {detail.customer && <div className="muted">{detail.customer.companyName} · {detail.customer.ordersCount} orders · {formatMoney(detail.customer.totalSpent)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className={`pill ${detail.contact.consentState === 'subscribed' ? 'success' : detail.contact.consentState === 'unsubscribed' ? 'warn' : 'info'}`}>{humanizeKey(detail.contact.consentState)}</span>
            {activeSuppression && <span className="pill warn">{humanizeKey(activeSuppression.reason)}</span>}
            <span className="pill info">{detail.audienceMemberships.length} audience proofs</span>
          </div>
        </div>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <section className="data-card" style={{ padding: 12 }}>
          <h3><span>Identities</span></h3>
          {detail.identities.length === 0 ? <div className="muted">No explicit identity is linked yet.</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {detail.identities.slice(0, 8).map((identity) => (
                <DetailLine key={`${identity.type}:${identity.value}`} label={identity.label} value={identity.value} />
              ))}
            </div>
          )}
        </section>

        <section className="data-card" style={{ padding: 12 }}>
          <h3><span>Consent and blockers</span></h3>
          {detail.consentHistory.length === 0 && detail.suppressionHistory.length === 0 ? (
            <div className="muted">No consent or suppression record is stored yet.</div>
          ) : (
            <>
              {detail.consentHistory.slice(0, 4).map((row) => (
                <DetailLine key={row.id} label={`${humanizeKey(row.category)} consent`} value={`${humanizeKey(row.state)} · ${fmtDate(row.updatedAt)}`} />
              ))}
              {detail.suppressionHistory.slice(0, 3).map((row) => (
                <DetailLine key={row.id} label={row.isActive ? 'Active blocker' : 'Released blocker'} value={`${humanizeKey(row.reason)} · ${fmtDate(row.updatedAt)}`} />
              ))}
            </>
          )}
        </section>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginTop: 12 }}>
        <section className="data-card" style={{ padding: 12 }}>
          <h3><span>Audience memberships</span></h3>
          {detail.audienceMemberships.length === 0 ? <div className="muted">No frozen audience membership is attached yet.</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {detail.audienceMemberships.slice(0, 6).map((row) => (
                <div key={row.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <div className="name">{row.audienceName ?? row.snapshotName}</div>
                  <div className="muted">{row.isSendable ? 'Eligible in snapshot' : row.suppressionReason ? `Blocked: ${humanizeKey(row.suppressionReason)}` : 'Blocked in snapshot'} · {fmtDate(row.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="data-card" style={{ padding: 12 }}>
          <h3><span>Recent delivery proof</span></h3>
          {detail.recentDeliveries.length === 0 ? <div className="muted">No delivery proof has been recorded for this contact.</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {detail.recentDeliveries.slice(0, 6).map((row) => (
                <div key={row.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <div className="name">{row.subject}</div>
                  <div className="muted">{deliveryLabel(row.status as MailDeliveryStatus)} · {humanizeKey(row.category)} · {fmtDate(row.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="data-card" style={{ padding: 12, marginTop: 12 }}>
        <h3><span>Recent activity</span></h3>
        {detail.recentEvents.length === 0 && detail.flowActivity.length === 0 ? (
          <div className="muted">No marketing event or flow activity is attached to this contact yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.recentEvents.slice(0, 5).map((row) => (
              <div key={row.id} className="muted">{humanizeKey(row.eventType)} · {humanizeKey(row.status)} · {fmtDate(row.createdAt)}</div>
            ))}
            {detail.flowActivity.slice(0, 5).map((row) => (
              <div key={row.id} className="muted">{row.flowName} · {humanizeKey(row.status)} · {fmtDate(row.createdAt)}</div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function TemplateReleaseLane({
  detail,
  deliveryRows,
  testRecipient,
  revisionPreview,
  revisionSourceDirty,
  canTemplateWrite,
  canTemplateApprove,
  canTemplatePublish,
  actionPending,
  onTestRevision,
  onPreviewRevision,
  onDuplicateRevision,
  onApproveRevision,
  onPublishRevision,
  onActivateRevision,
}: {
  detail: EmailTemplateDetail;
  deliveryRows: MailDeliveryProof[];
  testRecipient: string;
  revisionPreview: EmailTemplatePreviewResult | null;
  revisionSourceDirty: boolean;
  canTemplateWrite: boolean;
  canTemplateApprove: boolean;
  canTemplatePublish: boolean;
  actionPending: boolean;
  onTestRevision: (revisionId: string) => void;
  onPreviewRevision: (revisionId: string) => void;
  onDuplicateRevision: (revisionId: string) => void;
  onApproveRevision: (revisionId: string) => void;
  onPublishRevision: (revisionId: string) => void;
  onActivateRevision: (template: EmailTemplateDetail, revision: EmailTemplateVersion) => void;
}) {
  const versions = detail.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber);
  const activeVersion = versions.find((version) => version.id === detail.activeBinding?.templateVersionId) ?? null;
  const publishedVersion = versions.find((version) => version.id === detail.publishedVersionId) ?? versions.find((version) => version.status === 'published') ?? null;
  const draftVersion = versions.find((version) => version.status !== 'published' && version.id !== activeVersion?.id) ?? null;
  const candidate = draftVersion ?? (publishedVersion?.id !== activeVersion?.id ? publishedVersion : null) ?? activeVersion ?? versions[0] ?? null;

  const candidateProof = candidate
    ? deliveryRows.find((row) => row.templateVersionId === candidate.id && isTemplateReleaseProof(row))
    : null;
  const candidateApproved = candidate
    ? ['approved', 'published'].includes(candidate.approvalState) || candidate.status === 'published'
    : false;
  const candidatePublished = candidate ? candidate.status === 'published' || detail.publishedVersionId === candidate.id : false;
  const candidateActive = candidate ? detail.activeBinding?.templateVersionId === candidate.id : false;
  const hasTestRecipient = testRecipient.trim().length > 0;
  const candidatePreview = candidate && revisionPreview?.revisionId === candidate.id ? revisionPreview : null;
  const candidatePreviewReady = Boolean(candidatePreview && candidatePreview.unresolvedVariables.length === 0);

  let nextAction: ReactNode = null;
  let nextReason = 'No revision is available yet.';
  if (candidate) {
    if (candidateActive) {
      nextReason = 'Active version is live. Create a draft copy before changing customer-facing email.';
      nextAction = (
        <button className="btn primary" type="button" disabled={!canTemplateWrite || actionPending} onClick={() => onDuplicateRevision(candidate.id)}>
          Create draft copy
        </button>
      );
    } else if (!candidatePreviewReady) {
      nextReason = revisionSourceDirty
        ? 'Save the source editor before rendering the release preview.'
        : candidatePreview?.unresolvedVariables.length
          ? `Resolve missing preview values before test proof: ${candidatePreview.unresolvedVariables.join(', ')}.`
          : 'Render this revision with the selected preview profile before test proof.';
      nextAction = (
        <button className="btn primary" type="button" disabled={actionPending || revisionSourceDirty} onClick={() => onPreviewRevision(candidate.id)}>
          Render preview
        </button>
      );
    } else if (!candidateProof) {
      nextReason = hasTestRecipient
        ? 'Record disabled delivery proof before approval or publish review.'
        : 'Enter a test recipient before recording disabled delivery proof.';
      nextAction = (
        <button className="btn primary" type="button" disabled={!canTemplateWrite || actionPending || !hasTestRecipient || !candidatePreviewReady} onClick={() => onTestRevision(candidate.id)}>
          <Send size={14} /> Record test proof
        </button>
      );
    } else if (!candidateApproved) {
      nextReason = 'Test proof exists. Approval is the next release gate.';
      nextAction = (
        <button className="btn primary" type="button" disabled={!canTemplateApprove || actionPending} onClick={() => onApproveRevision(candidate.id)}>
          Approve revision
        </button>
      );
    } else if (!candidatePublished) {
      nextReason = 'Revision is approved. Publish it before activation can change the event binding.';
      nextAction = (
        <button className="btn primary" type="button" disabled={!canTemplatePublish || actionPending} onClick={() => onPublishRevision(candidate.id)}>
          Publish revision
        </button>
      );
    } else {
      nextReason = 'Published revision is ready. Activation changes the live event binding.';
      nextAction = (
        <button className="btn primary" type="button" disabled={!canTemplatePublish || actionPending} onClick={() => onActivateRevision(detail, candidate)}>
          Activate binding
        </button>
      );
    }
  }

  return (
    <div className="data-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div className="name">Release lane</div>
          <div className="muted">Draft changes do not affect customer email until a published revision is activated.</div>
        </div>
        {nextAction}
      </div>
      <div className="sr-kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 12 }}>
        <ReleaseStageCard
          label="Active email"
          value={activeVersion ? `Version ${activeVersion.versionNumber}` : 'No active binding'}
          tone={activeVersion ? 'success' : 'warn'}
          detail={activeVersion ? activeVersion.subject : 'Customer email will not use this template until activated.'}
        />
        <ReleaseStageCard
          label="Work revision"
          value={candidate ? `Version ${candidate.versionNumber}` : 'No revision'}
          tone={candidateActive ? 'info' : candidate ? 'warn' : 'danger'}
          detail={candidate ? candidate.subject : 'Create a template revision first.'}
        />
        <ReleaseStageCard
          label="Preview"
          value={candidatePreviewReady ? 'Rendered' : candidatePreview ? 'Missing values' : 'Required'}
          tone={candidatePreviewReady ? 'success' : 'warn'}
          detail={candidatePreviewReady ? 'Desktop and mobile preview were rendered with selected data.' : 'Render a saved preview before recording test proof.'}
        />
        <ReleaseStageCard
          label="Test proof"
          value={candidateProof ? deliveryLabel(candidateProof.status) : 'Missing'}
          tone={candidateProof ? deliveryTone(candidateProof.status) || 'info' : 'warn'}
          detail={candidateProof ? `${candidateProof.recipientEmail} - ${fmtDate(candidateProof.createdAt)}` : 'Record disabled delivery proof before release.'}
        />
        <ReleaseStageCard
          label="Approval"
          value={candidateApproved ? 'Approved' : 'Required'}
          tone={candidateApproved ? 'success' : 'warn'}
          detail={candidate ? humanizeKey(candidate.approvalState) : 'No candidate revision.'}
        />
        <ReleaseStageCard
          label="Publish"
          value={candidatePublished ? 'Published' : 'Not published'}
          tone={candidatePublished ? 'success' : 'warn'}
          detail={publishedVersion ? `Published version ${publishedVersion.versionNumber}` : 'Publish after approval.'}
        />
        <ReleaseStageCard
          label="Provider mode"
          value="Disabled proof"
          tone="warn"
          detail="Test and campaign actions write proof rows; they do not imply external delivery."
        />
      </div>
      <div className="modal-section" style={{ marginBottom: 0 }}>
        <strong>Next safe action</strong>
        <div className="muted" style={{ marginTop: 6 }}>{nextReason}</div>
      </div>
    </div>
  );
}

function ReleaseStageCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: 16 }}>{value}</div>
      <div className="muted" style={{ marginTop: 6, minHeight: 34 }}>{detail}</div>
      <span className={`pill ${tone}`} style={{ marginTop: 8 }}>{tone === 'success' ? 'Ready' : tone === 'danger' ? 'Blocked' : 'Review'}</span>
    </div>
  );
}

function TemplateDraftComposer({
  draft,
  onDraftChange,
  canCreate,
  creating,
  blockedReason,
  onCreate,
}: {
  draft: TemplateDraft;
  onDraftChange: (draft: TemplateDraft) => void;
  canCreate: boolean;
  creating: boolean;
  blockedReason: string | null;
  onCreate: () => void;
}) {
  const disabled = !canCreate || creating || Boolean(blockedReason);
  return (
    <div className="data-card" style={{ padding: 12, marginBottom: 12 }}>
      <div className="orders-toolbar" style={{ justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div>
          <div className="name">Create configured draft</div>
          <div className="muted">Draft only. Customer-facing release still requires preview, test proof, approval, publish, and activation.</div>
        </div>
        <button className="btn primary" type="button" disabled={disabled} onClick={onCreate}>
          <FileText size={14} /> Create draft
        </button>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Template name</span>
          <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} />
        </label>
        <label className="field">
          <span>Business event</span>
          <input value={draft.eventKey} onChange={(event) => onDraftChange({ ...draft, eventKey: event.target.value })} placeholder="mail.marketing.follow_up" />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Template type</span>
          <select value={draft.templateType} onChange={(event) => onDraftChange({ ...draft, templateType: event.target.value as TemplateDraft['templateType'] })}>
            <option value="marketing">Marketing</option>
            <option value="transactional">Transactional</option>
          </select>
        </label>
        <label className="field">
          <span>Folder</span>
          <input value={draft.folderKey} onChange={(event) => onDraftChange({ ...draft, folderKey: event.target.value })} placeholder="marketing" />
        </label>
      </div>
      <label className="field">
        <span>Subject</span>
        <input value={draft.subject} onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })} />
      </label>
      <label className="field">
        <span>Preview text</span>
        <input value={draft.previewText} onChange={(event) => onDraftChange({ ...draft, previewText: event.target.value })} />
      </label>
      <label className="field">
        <span>Variables</span>
        <input value={draft.variables} onChange={(event) => onDraftChange({ ...draft, variables: event.target.value })} placeholder="customer.name, urls.unsubscribe" />
        <div className="hint">Comma-separated variable names. Marketing drafts should include `urls.unsubscribe`.</div>
      </label>
      <label className="field">
        <span>HTML body</span>
        <textarea rows={6} value={draft.html} onChange={(event) => onDraftChange({ ...draft, html: event.target.value })} />
      </label>
      <label className="field">
        <span>Text body</span>
        <textarea rows={4} value={draft.text} onChange={(event) => onDraftChange({ ...draft, text: event.target.value })} />
      </label>
      {!canCreate && <div className="hint" style={{ color: 'var(--danger)' }}>You do not have permission to create templates.</div>}
      {blockedReason && <div className="hint" style={{ color: 'var(--danger)' }}>{blockedReason}</div>}
    </div>
  );
}

function TemplateEventCatalog({
  events,
  rowsByEvent,
  canCreate,
  onOpen,
  onCreateDraft,
}: {
  events: MailTemplateWorkspaceEvent[];
  rowsByEvent: Map<string, EmailTemplate[]>;
  canCreate: boolean;
  onOpen: (templateId: string) => void;
  onCreateDraft: (event: MailTemplateWorkspaceEvent) => void;
}) {
  const sorted = [...events].sort((left, right) => {
    const leftKey = `${eventFolderRank(left.folderKey)}:${left.eventKey}`;
    const rightKey = `${eventFolderRank(right.folderKey)}:${right.eventKey}`;
    return leftKey.localeCompare(rightKey);
  });
  if (sorted.length === 0) {
    return (
      <div className="data-card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="name">Transactional event catalog</div>
        <div className="muted" style={{ marginTop: 4 }}>No event catalog is available yet.</div>
      </div>
    );
  }
  return (
    <div className="data-card" style={{ padding: 12, marginBottom: 12 }}>
      <div className="orders-toolbar" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div>
          <div className="name">Transactional event catalog</div>
          <div className="muted">Edit auth, user invitation, B2B, tax exemption, support, storefront form, discount, invoice, and order templates by business event.</div>
        </div>
        <span className="pill info">{sorted.length} events</span>
      </div>
      <div className="template-event-grid">
        {sorted.map((event) => {
          const rows = rowsByEvent.get(event.eventKey) ?? [];
          const active = rows.find((row) => row.activeBinding) ?? rows.find((row) => row.publishedVersionId) ?? rows[0] ?? null;
          const tone = active?.activeBinding ? 'success' : active?.publishedVersionId ? 'info' : rows.length > 0 ? 'warn' : 'danger';
          return (
            <button
              key={event.eventKey}
              type="button"
              className={`template-event-card ${tone}`}
              onClick={() => active ? onOpen(active.id) : onCreateDraft(event)}
            >
              <span className="event-top">
                <span className="event-title">{event.title || humanizeKey(event.eventKey)}</span>
                <span className={`pill ${tone}`}>{active?.activeBinding ? 'Active' : active?.publishedVersionId ? 'Published' : rows.length > 0 ? 'Draft' : 'Missing'}</span>
              </span>
              <span className="event-key">{event.eventKey}</span>
              <span className="event-desc">{event.description || 'Transactional customer email.'}</span>
              <span className="event-bottom">
                <span>{event.templateCount} variants</span>
                <span>{event.publishedCount} published</span>
                <span>{active ? 'Open' : canCreate ? 'Create draft' : 'No access'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateAssistantPanel({
  revisionId,
  draft,
  proposal,
  pending,
  error,
  disabled,
  onDraftChange,
  onGenerate,
  onUseProposal,
}: {
  revisionId: string;
  draft: TemplateAssistantDraft;
  proposal: EmailTemplateAiEditProposalResponse | null;
  pending: boolean;
  error: string | null;
  disabled: boolean;
  onDraftChange: (value: TemplateAssistantDraft) => void;
  onGenerate: (revisionId: string) => void;
  onUseProposal: (proposal: EmailTemplateAiEditProposalResponse) => void;
}) {
  const blocked = proposal ? proposal.validation.blockingIssues.length > 0 : false;
  return (
    <div className="data-card" style={{ padding: 12, marginBottom: 12 }}>
      <div className="orders-toolbar" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div className="name"><Wand2 size={14} /> Draft assistant</div>
          <div className="muted">Proposal only. It does not save, approve, publish, activate, or send this template.</div>
        </div>
        <button
          className="btn primary"
          type="button"
          disabled={disabled || pending || draft.instruction.trim().length < 8}
          onClick={() => onGenerate(revisionId)}
        >
          <Wand2 size={14} /> Generate proposal
        </button>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Change scope</span>
          <select value={draft.mode} disabled={pending} onChange={(event) => onDraftChange({ ...draft, mode: event.target.value as EmailTemplateAiEditMode })}>
            <option value="rewrite_all">Rewrite copy and source</option>
            <option value="html_css_only">HTML and CSS only</option>
            <option value="subject_variants">Subject and preview only</option>
            <option value="template_critique">Critique only</option>
          </select>
        </label>
        <label className="field">
          <span>Audience</span>
          <input value={draft.audience} disabled={pending} placeholder="Wholesale heat press buyers, reorder customers..." onChange={(event) => onDraftChange({ ...draft, audience: event.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Instruction</span>
        <textarea rows={3} value={draft.instruction} disabled={pending} placeholder="Make this email clearer for repeat DTF supply buyers. Keep unsubscribe and existing variables." onChange={(event) => onDraftChange({ ...draft, instruction: event.target.value })} />
      </label>
      <label className="field">
        <span>Brand voice</span>
        <input value={draft.brandVoice} disabled={pending} placeholder="Direct, helpful, B2B, no hype" onChange={(event) => onDraftChange({ ...draft, brandVoice: event.target.value })} />
      </label>
      {disabled && <div className="hint">Save current source changes before generating a proposal. The assistant reads the saved revision.</div>}
      {pending && <StateBlock title="Generating proposal" body="Reading the saved revision and returning a draft suggestion." />}
      {error && <div className="error-state">{error}</div>}
      {!pending && !error && !proposal && (
        <StateBlock title="No proposal yet" body="Generate a proposal, review changed fields and release blockers, then copy it into the editor only if it fits this template." />
      )}
      {proposal && (
        <div className="modal-section" style={{ margin: 0 }}>
          <div className="orders-toolbar" style={{ justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div>
              <div className="name">Proposal review</div>
              <div className="muted">{proposal.summary}</div>
            </div>
            <button className="btn" type="button" disabled={pending} onClick={() => onUseProposal(proposal)}>Use proposal in editor</button>
          </div>
          <div className="orders-toolbar" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <span className={`pill ${blocked ? 'danger' : 'success'}`}>{blocked ? 'Release blockers found' : 'No release blockers'}</span>
            <span className="pill info">{proposal.mode}</span>
            <span className="pill">{proposal.model}</span>
            {proposal.changedFields.length === 0 ? <span className="pill warn">No source changes</span> : proposal.changedFields.map((field) => <span key={field} className="pill info">{field}</span>)}
          </div>
          {proposal.validation.blockingIssues.length > 0 && (
            <div className="error-state" style={{ marginBottom: 8 }}>
              {proposal.validation.blockingIssues.join(' ')}
            </div>
          )}
          {[...proposal.warnings, ...proposal.validation.warnings].length > 0 && (
            <div className="hint" style={{ marginBottom: 8 }}>
              {[...proposal.warnings, ...proposal.validation.warnings].join(' ')}
            </div>
          )}
          <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <div className="modal-section" style={{ margin: 0, padding: 10 }}>
              <div className="muted">Subject</div>
              <div className="name">{proposal.draft.subject}</div>
              {proposal.draft.previewText && <div className="muted" style={{ marginTop: 6 }}>{proposal.draft.previewText}</div>}
            </div>
            <div className="modal-section" style={{ margin: 0, padding: 10 }}>
              <div className="muted">Variables</div>
              <div className="orders-toolbar" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                {proposal.draft.variables.length === 0 ? <span className="pill warn">No variables declared</span> : proposal.draft.variables.map((variable) => <span key={variable} className="pill">{variable}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplatesPanel({
  loading,
  rows,
  events,
  canTemplateWrite,
  canTemplateApprove,
  canTemplatePublish,
  templateDraft,
  onTemplateDraftChange,
  onCreate,
  creating,
  selectedId,
  onSelect,
  detail,
  detailLoading,
  detailError,
  deliveryRows,
  deliveriesLoading,
  deliveriesError,
  onRefreshDeliveries,
  testRecipient,
  onTestRecipientChange,
  previewProfiles,
  previewProfilesLoading,
  previewProfilesError,
  selectedPreviewProfileId,
  onPreviewProfileSelect,
  previewProfileName,
  onPreviewProfileNameChange,
  previewProfileVariables,
  onPreviewProfileVariablesChange,
  onCreatePreviewProfile,
  onUpdatePreviewProfile,
  onDeletePreviewProfile,
  snippets,
  snippetsLoading,
  snippetsError,
  selectedSnippetId,
  snippetForm,
  onSnippetFormChange,
  onSelectSnippet,
  onCreateSnippet,
  onUpdateSnippet,
  onArchiveSnippet,
  blocks,
  blocksLoading,
  blocksError,
  selectedBlockId,
  blockForm,
  onBlockFormChange,
  onSelectBlock,
  onCreateBlock,
  onUpdateBlock,
  onArchiveBlock,
  onDuplicateTemplate,
  onDuplicateRevision,
  onApproveRevision,
  onPublishRevision,
  onActivateRevision,
  onTestRevision,
  editingRevisionId,
  revisionSource,
  revisionSourceDirty,
  onRevisionSourceChange,
  revisionPreview,
  templateAssistantDraft,
  templateAssistantProposal,
  templateAssistantPending,
  templateAssistantError,
  onTemplateAssistantDraftChange,
  onProposeTemplateEdit,
  onUseTemplateProposal,
  onEditRevision,
  onSaveRevisionSource,
  onPreviewRevision,
  providerMode,
  actionPending,
}: {
  loading: boolean;
  rows: EmailTemplate[];
  events: MailTemplateWorkspaceEvent[];
  canTemplateWrite: boolean;
  canTemplateApprove: boolean;
  canTemplatePublish: boolean;
  templateDraft: TemplateDraft;
  onTemplateDraftChange: (draft: TemplateDraft) => void;
  onCreate: () => void;
  creating: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  detail?: EmailTemplateDetail;
  detailLoading: boolean;
  detailError: string | null;
  deliveryRows: MailDeliveryProof[];
  deliveriesLoading: boolean;
  deliveriesError: string | null;
  onRefreshDeliveries: () => void;
  testRecipient: string;
  onTestRecipientChange: (value: string) => void;
  previewProfiles: MailTemplatePreviewProfileDto[];
  previewProfilesLoading: boolean;
  previewProfilesError: string | null;
  selectedPreviewProfileId: string;
  onPreviewProfileSelect: (profileId: string) => void;
  previewProfileName: string;
  onPreviewProfileNameChange: (value: string) => void;
  previewProfileVariables: string;
  onPreviewProfileVariablesChange: (value: string) => void;
  onCreatePreviewProfile: () => void;
  onUpdatePreviewProfile: () => void;
  onDeletePreviewProfile: (profileId: string) => void;
  snippets: MailTemplateSnippetDto[];
  snippetsLoading: boolean;
  snippetsError: string | null;
  selectedSnippetId: string;
  snippetForm: { key: string; name: string; subject: string; html: string };
  onSnippetFormChange: (value: { key: string; name: string; subject: string; html: string }) => void;
  onSelectSnippet: (snippet: MailTemplateSnippetDto) => void;
  onCreateSnippet: () => void;
  onUpdateSnippet: () => void;
  onArchiveSnippet: (snippetId: string) => void;
  blocks: MailTemplateBlockDto[];
  blocksLoading: boolean;
  blocksError: string | null;
  selectedBlockId: string;
  blockForm: { key: string; name: string; category: string; html: string };
  onBlockFormChange: (value: { key: string; name: string; category: string; html: string }) => void;
  onSelectBlock: (block: MailTemplateBlockDto) => void;
  onCreateBlock: () => void;
  onUpdateBlock: () => void;
  onArchiveBlock: (blockId: string) => void;
  onDuplicateTemplate: (templateId: string) => void;
  onDuplicateRevision: (revisionId: string) => void;
  onApproveRevision: (revisionId: string) => void;
  onPublishRevision: (revisionId: string) => void;
  onActivateRevision: (template: EmailTemplateDetail, revision: EmailTemplateVersion) => void;
  onTestRevision: (revisionId: string) => void;
  editingRevisionId: string;
  revisionSource: { subject: string; previewText: string; html: string; css: string; text: string };
  revisionSourceDirty: boolean;
  onRevisionSourceChange: (value: { subject: string; previewText: string; html: string; css: string; text: string }) => void;
  revisionPreview: EmailTemplatePreviewResult | null;
  templateAssistantDraft: TemplateAssistantDraft;
  templateAssistantProposal: EmailTemplateAiEditProposalResponse | null;
  templateAssistantPending: boolean;
  templateAssistantError: string | null;
  onTemplateAssistantDraftChange: (value: TemplateAssistantDraft) => void;
  onProposeTemplateEdit: (revisionId: string) => void;
  onUseTemplateProposal: (proposal: EmailTemplateAiEditProposalResponse) => void;
  onEditRevision: (version: EmailTemplateVersion) => void;
  onSaveRevisionSource: (revisionId: string) => void;
  onPreviewRevision: (revisionId: string) => void;
  providerMode: MailProviderMode;
  actionPending: boolean;
}) {
  if (loading) return <StateBlock title="Loading templates" body="Reading live email template workspace." />;
  const createBlockedReason = templateDraftBlockedReason(templateDraft);
  const rowsByEvent = new Map<string, EmailTemplate[]>();
  for (const row of rows) rowsByEvent.set(row.eventKey, [...(rowsByEvent.get(row.eventKey) ?? []), row]);
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, .9fr) minmax(420px, 1.1fr)' }}>
      <section className="section">
        <h3>
          <span>Template library</span>
        </h3>
        <TemplateEventCatalog
          events={events}
          rowsByEvent={rowsByEvent}
          canCreate={canTemplateWrite}
          onOpen={(templateId) => onSelect(templateId)}
          onCreateDraft={(event) => onTemplateDraftChange(draftFromTemplateEvent(event))}
        />
        <TemplateDraftComposer
          draft={templateDraft}
          onDraftChange={onTemplateDraftChange}
          canCreate={canTemplateWrite}
          creating={creating}
          blockedReason={createBlockedReason}
          onCreate={onCreate}
        />
        {rows.length === 0 ? (
          <StateBlock title="No templates yet" body="Create a configured draft above. Release actions stay blocked until preview, test proof, approval, publish, and activation gates are complete." />
        ) : (
          <Table headers={['Template', 'Event', 'Readiness', 'Updated']}>
            {rows.map((row) => {
              const ready = row.activeBinding ? 'Active' : row.publishedVersionId ? 'Published' : row.status;
              return (
                <tr key={row.id} className={selectedId === row.id ? 'selected-row' : undefined} onClick={() => onSelect(row.id)} style={{ cursor: 'pointer' }}>
                  <td><div className="name">{row.name}</div><div className="muted">{row.subject}</div></td>
                  <td>{row.eventKey}</td>
                  <td><span className={`pill ${row.activeBinding ? 'success' : row.publishedVersionId ? 'info' : 'warn'}`}>{ready}</span></td>
                  <td className="muted">{fmtDate(row.updatedAt)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
      <section className="section">
        <h3>
          <span>Lifecycle</span>
          {detail && <span className="pill info">{detail.versionCount} versions</span>}
        </h3>
        {!selectedId && <StateBlock title="Select a template" body="Choose a template to test, approve, publish, or activate a revision." />}
        {selectedId && detailLoading && <StateBlock title="Loading lifecycle" body="Reading active binding and revisions." />}
        {detailError && <StateBlock title="Template detail could not load" body={detailError} />}
        {detail && !detailLoading && (
          <div className="row-stack">
            <div className="data-card" style={{ padding: 14 }}>
              <div className="name">{detail.name}</div>
              <div className="muted" style={{ marginTop: 4 }}>{detail.eventKey}</div>
              <div className="orders-toolbar" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                <span className={`pill ${detail.activeBinding ? 'success' : 'warn'}`}>{detail.activeBinding ? 'Active email bound' : 'No active binding'}</span>
                <span className={`pill ${detail.publishedVersionId ? 'info' : 'warn'}`}>{detail.publishedVersionId ? 'Published version ready' : 'No published version'}</span>
                <span className={`pill ${providerModeTone(providerMode)}`}>{providerModeLabel(providerMode)}</span>
              </div>
              {canTemplateWrite && (
                <div className="orders-toolbar" style={{ marginTop: 12 }}>
                  <button className="btn" type="button" disabled={actionPending} onClick={() => onDuplicateTemplate(detail.id)}>Duplicate template</button>
                </div>
              )}
            </div>
            <TemplateReleaseLane
              detail={detail}
              deliveryRows={deliveryRows}
              testRecipient={testRecipient}
              revisionPreview={revisionPreview}
              revisionSourceDirty={revisionSourceDirty}
              canTemplateWrite={canTemplateWrite}
              canTemplateApprove={canTemplateApprove}
              canTemplatePublish={canTemplatePublish}
              actionPending={actionPending}
              onTestRevision={onTestRevision}
              onPreviewRevision={onPreviewRevision}
              onDuplicateRevision={onDuplicateRevision}
              onApproveRevision={onApproveRevision}
              onPublishRevision={onPublishRevision}
              onActivateRevision={onActivateRevision}
            />
            <div className="data-card" style={{ padding: 14 }}>
              <div className="name" style={{ marginBottom: 8 }}>Test delivery</div>
              <div className="muted" style={{ marginBottom: 10 }}>{providerModeTemplateDetail(providerMode)}</div>
              <div className="two-col" style={{ gridTemplateColumns: 'minmax(220px, .8fr) minmax(0, 1.2fr)', gap: 12 }}>
                <div className="row-stack">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Test recipient</label>
                    <input
                      type="email"
                      placeholder="operator@example.com"
                      value={testRecipient}
                      onChange={(event) => onTestRecipientChange(event.target.value)}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Preview data profile</label>
                    <select value={selectedPreviewProfileId} onChange={(event) => onPreviewProfileSelect(event.target.value)} disabled={previewProfilesLoading}>
                      <option value="">{previewProfiles.length === 0 ? 'No saved profile' : 'Choose profile'}</option>
                      {previewProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>{profile.name}{profile.isDefault ? ' · default' : ''}</option>
                      ))}
                    </select>
                  </div>
                  {previewProfilesError && <div className="error-state">{previewProfilesError}</div>}
                  {!previewProfilesError && previewProfiles.length === 0 && (
                    <div className="hint">Save one tested customer/order payload so future test sends use the same proof data.</div>
                  )}
                </div>
                <div className="row-stack">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Profile name</label>
                    <input
                      type="text"
                      placeholder="Purchase follow-up sample"
                      value={previewProfileName}
                      onChange={(event) => onPreviewProfileNameChange(event.target.value)}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Preview data</label>
                    <textarea
                      value={previewProfileVariables}
                      onChange={(event) => onPreviewProfileVariablesChange(event.target.value)}
                      rows={6}
                      spellCheck={false}
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                    />
                  </div>
                  <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
                    <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || previewProfileName.trim().length < 2} onClick={onCreatePreviewProfile}>Save new profile</button>
                    <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || !selectedPreviewProfileId || previewProfileName.trim().length < 2} onClick={onUpdatePreviewProfile}>Update profile</button>
                    <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || !selectedPreviewProfileId} onClick={() => onDeletePreviewProfile(selectedPreviewProfileId)}>Delete profile</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="data-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div>
                  <div className="name">Delivery proof</div>
                  <div className="muted">Recent delivery records linked to this template. Test sends must appear here before release review.</div>
                </div>
                <button className="btn" type="button" disabled={deliveriesLoading} onClick={onRefreshDeliveries}>
                  <RefreshCw size={14} /> Refresh proof
                </button>
              </div>
              {deliveriesLoading && <StateBlock title="Loading delivery proof" body="Reading recent delivery records for this template." />}
              {deliveriesError && <StateBlock title="Delivery proof could not load" body={deliveriesError} />}
              {!deliveriesLoading && !deliveriesError && deliveryRows.length === 0 && (
                <StateBlock
                  title="No delivery proof yet"
                  body="Record a test delivery from a revision. The backend will create a proof-only delivery record while provider sending is disabled."
                />
              )}
              {!deliveriesLoading && !deliveriesError && deliveryRows.length > 0 && (
                <div className="row-stack">
                  {deliveryRows.map((row) => {
                    const meta = deliveryMetadata(row.metadata);
                    const revisionLabel = row.templateVersionId
                      ? `Revision ${textMeta(meta.revisionNumber) || row.templateVersionId.slice(0, 8)}`
                      : 'No revision link';
                    return (
                      <div key={row.id} className="modal-section" style={{ margin: 0, padding: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
                          <div>
                            <div className="name">{row.subject}</div>
                            <div className="muted">{row.recipientEmail} - {revisionLabel} - {fmtDate(row.createdAt)}</div>
                          </div>
                          <span className={`pill ${deliveryTone(row.status)}`}>{deliveryLabel(row.status)}</span>
                        </div>
                        <div className="orders-toolbar" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                          <span className="pill info">{row.provider ?? 'provider pending'}</span>
                          <span className="pill">{textMeta(meta.source) || row.eventKey}</span>
                          <span className="pill">{row.id}</span>
                          {row.attemptCount > 0 && <span className="pill warn">{row.attemptCount} attempts</span>}
                        </div>
                        {row.errorMessage && <div className="hint" style={{ marginTop: 8 }}>{row.errorMessage}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <section className="section">
              <div className="name" style={{ marginBottom: 8 }}>Reusable content</div>
              <div className="muted" style={{ marginBottom: 12 }}>Save approved subject/body fragments and reusable HTML blocks for future template drafts.</div>
              <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                <div className="modal-section" style={{ margin: 0 }}>
                  <h3>Snippets</h3>
                  <div className="row-stack">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Key</label>
                      <input value={snippetForm.key} placeholder="purchase.followup" onChange={(event) => onSnippetFormChange({ ...snippetForm, key: event.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Name</label>
                      <input value={snippetForm.name} placeholder="Purchase follow-up intro" onChange={(event) => onSnippetFormChange({ ...snippetForm, name: event.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Subject</label>
                      <input value={snippetForm.subject} placeholder="Your reorder request" onChange={(event) => onSnippetFormChange({ ...snippetForm, subject: event.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>HTML or text fragment</label>
                      <textarea rows={5} value={snippetForm.html} onChange={(event) => onSnippetFormChange({ ...snippetForm, html: event.target.value })} />
                    </div>
                    <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
                      <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || snippetForm.key.trim().length < 2 || snippetForm.name.trim().length < 2 || (!snippetForm.subject.trim() && !snippetForm.html.trim())} onClick={onCreateSnippet}>Save new snippet</button>
                      <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || !selectedSnippetId || snippetForm.key.trim().length < 2 || snippetForm.name.trim().length < 2 || (!snippetForm.subject.trim() && !snippetForm.html.trim())} onClick={onUpdateSnippet}>Update selected</button>
                    </div>
                    {snippetsError && <div className="error-state">{snippetsError}</div>}
                    {snippetsLoading && <div className="muted">Loading reusable snippets...</div>}
                    {!snippetsLoading && snippets.length === 0 && <div className="hint">No snippets yet. Save a tested phrase or content fragment to reuse later.</div>}
                    {snippets.map((snippet) => (
                      <div key={snippet.id} className="modal-section" style={{ padding: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <div className="name">{snippet.name}</div>
                            <div className="muted">{snippet.key}{snippet.templateType ? ` - ${snippet.templateType}` : ''}{selectedSnippetId === snippet.id ? ' - editing' : ''}</div>
                          </div>
                          <div className="orders-toolbar" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn" type="button" disabled={actionPending} onClick={() => onSelectSnippet(snippet)}>Edit</button>
                            <button className="btn" type="button" disabled={!canTemplateWrite || actionPending} onClick={() => onArchiveSnippet(snippet.id)}>Archive</button>
                          </div>
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>{snippet.subject || snippet.text || stripHtml(snippet.html || '').slice(0, 120) || 'Reusable fragment'}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-section" style={{ margin: 0 }}>
                  <h3>Blocks</h3>
                  <div className="row-stack">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Key</label>
                      <input value={blockForm.key} placeholder="footer.shipping" onChange={(event) => onBlockFormChange({ ...blockForm, key: event.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Name</label>
                      <input value={blockForm.name} placeholder="Shipping promise" onChange={(event) => onBlockFormChange({ ...blockForm, name: event.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Category</label>
                      <input value={blockForm.category} placeholder="footer" onChange={(event) => onBlockFormChange({ ...blockForm, category: event.target.value })} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>HTML block</label>
                      <textarea rows={5} value={blockForm.html} onChange={(event) => onBlockFormChange({ ...blockForm, html: event.target.value })} />
                    </div>
                    <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
                      <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || blockForm.key.trim().length < 2 || blockForm.name.trim().length < 2 || !blockForm.html.trim()} onClick={onCreateBlock}>Save new block</button>
                      <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || !selectedBlockId || blockForm.key.trim().length < 2 || blockForm.name.trim().length < 2 || !blockForm.html.trim()} onClick={onUpdateBlock}>Update selected</button>
                    </div>
                    {blocksError && <div className="error-state">{blocksError}</div>}
                    {blocksLoading && <div className="muted">Loading reusable blocks...</div>}
                    {!blocksLoading && blocks.length === 0 && <div className="hint">No reusable blocks yet. Save approved HTML sections for future drafts.</div>}
                    {blocks.map((block) => (
                      <div key={block.id} className="modal-section" style={{ padding: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <div className="name">{block.name}</div>
                            <div className="muted">{block.key} - {block.category}{selectedBlockId === block.id ? ' - editing' : ''}</div>
                          </div>
                          <div className="orders-toolbar" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn" type="button" disabled={actionPending} onClick={() => onSelectBlock(block)}>Edit</button>
                            <button className="btn" type="button" disabled={!canTemplateWrite || actionPending} onClick={() => onArchiveBlock(block.id)}>Archive</button>
                          </div>
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>{stripHtml(block.html).slice(0, 120) || 'Reusable block'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <div className="row-stack">
              {detail.versions.map((version) => {
                const isActive = detail.activeBinding?.templateVersionId === version.id;
                const isPublished = version.status === 'published';
                const versionPreviewReady = revisionPreview?.revisionId === version.id && revisionPreview.unresolvedVariables.length === 0;
                const versionProof = deliveryRows.find((row) => row.templateVersionId === version.id && isTemplateReleaseProof(row));
                const canApprove = canTemplateApprove && Boolean(versionProof) && !isPublished && version.approvalState !== 'approved';
                const canPublish = canTemplatePublish && Boolean(versionProof) && !isPublished && version.status === 'approved' && version.approvalState === 'approved';
                const canActivate = canTemplatePublish && isPublished && !isActive;
                return (
                  <div key={version.id} className="data-card" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <div className="name">Version {version.versionNumber}</div>
                        <div className="muted">{version.subject}</div>
                        {version.previewText && <div className="muted" style={{ marginTop: 4 }}>{version.previewText}</div>}
                      </div>
                      <div className="orders-toolbar" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <span className={`pill ${isActive ? 'success' : isPublished ? 'info' : 'warn'}`}>{isActive ? 'Active' : version.status}</span>
                        <span className={`pill ${version.approvalState === 'approved' || version.approvalState === 'published' ? 'success' : 'warn'}`}>{version.approvalState}</span>
                      </div>
                    </div>
                    <div className="orders-toolbar" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn" type="button" disabled={!canTemplateWrite || actionPending || !testRecipient.trim() || !versionPreviewReady} onClick={() => onTestRevision(version.id)}>
                        <Send size={14} /> Record test
                      </button>
                      <button className="btn" type="button" disabled={actionPending} onClick={() => onEditRevision(version)}>Edit source</button>
                      <button className="btn" type="button" disabled={!canTemplateWrite || actionPending} onClick={() => onDuplicateRevision(version.id)}>Create draft copy</button>
                      <button className="btn" type="button" disabled={!canApprove || actionPending} onClick={() => onApproveRevision(version.id)}>Approve</button>
                      <button className="btn" type="button" disabled={!canPublish || actionPending} onClick={() => onPublishRevision(version.id)}>Publish</button>
                      <button className="btn primary" type="button" disabled={!canActivate || actionPending} onClick={() => onActivateRevision(detail, version)}>Activate</button>
                    </div>
                    {editingRevisionId === version.id && (
                      <div className="modal-section" style={{ marginTop: 12 }}>
                        <h3>
                          <span>Source editor and rendered preview</span>
                          <span className="pill info">Uses selected preview profile</span>
                        </h3>
                        <TemplateAssistantPanel
                          revisionId={version.id}
                          draft={templateAssistantDraft}
                          proposal={templateAssistantProposal?.revisionId === version.id ? templateAssistantProposal : null}
                          pending={templateAssistantPending}
                          error={templateAssistantError}
                          disabled={!canTemplateWrite || actionPending || revisionSourceDirty}
                          onDraftChange={onTemplateAssistantDraftChange}
                          onGenerate={onProposeTemplateEdit}
                          onUseProposal={onUseTemplateProposal}
                        />
                        <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                          <div className="row-stack">
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>Subject</label>
                              <input
                                value={revisionSource.subject}
                                onChange={(event) => onRevisionSourceChange({ ...revisionSource, subject: event.target.value })}
                              />
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>Preview text</label>
                              <input
                                value={revisionSource.previewText}
                                onChange={(event) => onRevisionSourceChange({ ...revisionSource, previewText: event.target.value })}
                              />
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>HTML</label>
                              <textarea
                                rows={10}
                                value={revisionSource.html}
                                spellCheck={false}
                                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                                onChange={(event) => onRevisionSourceChange({ ...revisionSource, html: event.target.value })}
                              />
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>CSS</label>
                              <textarea
                                rows={5}
                                value={revisionSource.css}
                                spellCheck={false}
                                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                                onChange={(event) => onRevisionSourceChange({ ...revisionSource, css: event.target.value })}
                              />
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>Text fallback</label>
                              <textarea
                                rows={5}
                                value={revisionSource.text}
                                onChange={(event) => onRevisionSourceChange({ ...revisionSource, text: event.target.value })}
                              />
                            </div>
                            <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
                              <button className="btn primary" type="button" disabled={!canTemplateWrite || actionPending || Boolean(revisionSourceBlockedReason(revisionSource))} onClick={() => onSaveRevisionSource(version.id)}>Save source</button>
                              <button className="btn" type="button" disabled={actionPending || revisionSourceDirty || revisionSource.html.trim().length < 1} onClick={() => onPreviewRevision(version.id)}>Render saved preview</button>
                            </div>
                            {revisionSourceBlockedReason(revisionSource) && <div className="hint" style={{ color: 'var(--danger)' }}>{revisionSourceBlockedReason(revisionSource)}</div>}
                            {revisionSourceDirty && <div className="hint">Save the source before rendering. Preview always uses the saved revision, not unsaved editor text.</div>}
                          </div>
                          <div className="row-stack">
                            {revisionPreview?.revisionId !== version.id && (
                              <StateBlock
                                title="No rendered preview yet"
                                body="Render this revision with the selected preview data profile before test delivery or publish review."
                              />
                            )}
                            {revisionPreview?.revisionId === version.id && (
                              <>
                                <div className="data-card" style={{ padding: 12 }}>
                                  <div className="name">{revisionPreview.subject}</div>
                                  {revisionPreview.previewText && <div className="muted" style={{ marginTop: 4 }}>{revisionPreview.previewText}</div>}
                                  {revisionPreview.unresolvedVariables.length > 0 && (
                                    <div className="error-state" style={{ marginTop: 10 }}>
                                      Missing preview values: {revisionPreview.unresolvedVariables.join(', ')}
                                    </div>
                                  )}
                                </div>
                                <div className="data-card" style={{ padding: 12 }}>
                                  <div className="name" style={{ marginBottom: 8 }}>Desktop preview</div>
                                  <iframe
                                    title={`Email version ${version.versionNumber} desktop preview`}
                                    sandbox=""
                                    srcDoc={revisionPreview.html}
                                    style={{ width: '100%', minHeight: 320, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
                                  />
                                </div>
                                <div className="data-card" style={{ padding: 12 }}>
                                  <div className="name" style={{ marginBottom: 8 }}>Mobile preview</div>
                                  <div style={{ maxWidth: 390, margin: '0 auto' }}>
                                    <iframe
                                      title={`Email version ${version.versionNumber} mobile preview`}
                                      sandbox=""
                                      srcDoc={revisionPreview.html}
                                      style={{ width: '100%', minHeight: 420, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
                                    />
                                  </div>
                                </div>
                                {revisionPreview.text && (
                                  <div className="modal-section" style={{ margin: 0 }}>
                                    <h3>Text fallback</h3>
                                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{revisionPreview.text}</pre>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="muted" style={{ marginTop: 8 }}>Updated {fmtDate(version.updatedAt)}{version.publishedAt ? ` · Published ${fmtDate(version.publishedAt)}` : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function AudiencesPanel({
  loading,
  rows,
  canAudienceWrite,
  onCreate,
  creating,
  draft,
  onDraftChange,
  onPreview,
  preview,
  previewing,
  previewError,
  selectedAudienceId,
  onSelectAudience,
  snapshots,
  snapshotsLoading,
  snapshotsError,
  onCreateSnapshot,
  creatingSnapshot,
  selectedSnapshotId,
  onSelectSnapshot,
  snapshotSearch,
  onSnapshotSearchChange,
  snapshotMembers,
  snapshotMembersLoading,
  snapshotMembersError,
  snapshotDiff,
  snapshotDiffLoading,
  snapshotDiffError,
  providerMode,
  onOpenContactDetail,
}: {
  loading: boolean;
  rows: MailAudience[];
  canAudienceWrite: boolean;
  onCreate: () => void;
  creating: boolean;
  draft: AudienceDraft;
  onDraftChange: (draft: AudienceDraft) => void;
  onPreview: () => void;
  preview?: MailAudiencePreviewResponse;
  previewing: boolean;
  previewError: string | null;
  selectedAudienceId: string;
  onSelectAudience: (id: string) => void;
  snapshots: MailAudienceSnapshotDto[];
  snapshotsLoading: boolean;
  snapshotsError: string | null;
  onCreateSnapshot: () => void;
  creatingSnapshot: boolean;
  selectedSnapshotId: string;
  onSelectSnapshot: (id: string) => void;
  snapshotSearch: string;
  onSnapshotSearchChange: (value: string) => void;
  snapshotMembers?: MailAudienceSnapshotMembersResponse;
  snapshotMembersLoading: boolean;
  snapshotMembersError: string | null;
  snapshotDiff?: MailAudienceSnapshotDiffResponse;
  snapshotDiffLoading: boolean;
  snapshotDiffError: string | null;
  providerMode: MailProviderMode;
  onOpenContactDetail: (contactId: string) => void;
}) {
  if (loading) return <StateBlock title="Loading audiences" body="Reading live audience definitions." />;
  const selectedAudience = rows.find((row) => row.id === selectedAudienceId) ?? rows[0];
  const updateDraft = (patch: Partial<AudienceDraft>) => onDraftChange({ ...draft, ...patch });
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(360px, .75fr) minmax(0, 1.25fr)' }}>
      <section className="section">
        <h3>
          <span>Audience library</span>
          {canAudienceWrite && <button className="btn" type="button" disabled={creating} onClick={onCreate}><Users size={14} /> Create</button>}
        </h3>
        <div className="muted" style={{ marginBottom: 10 }}>Live audience counts move as contacts, consent, and suppression change. Campaigns should be queued from a frozen snapshot.</div>
        <div className="data-card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="name" style={{ marginBottom: 4 }}>Define live audience</div>
          <div className="muted" style={{ marginBottom: 12 }}>Use real Shopify/customer/order signals. Preview is live; freeze creates the campaign send list.</div>
          <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <div className="field">
              <label>Audience name</label>
              <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Heat press reorder audience" />
            </div>
            <div className="field">
              <label>Description</label>
              <input value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Why this recipient group exists" />
            </div>
            <div className="field">
              <label>Local segments</label>
              <input value={draft.localSegments} onChange={(event) => updateDraft({ localSegments: event.target.value })} placeholder="Segment names or ids, comma separated" />
            </div>
            <div className="field">
              <label>Shopify segments</label>
              <input value={draft.shopifySegments} onChange={(event) => updateDraft({ shopifySegments: event.target.value })} placeholder="Shopify segment names or ids" />
            </div>
            <div className="field">
              <label>Manual lists</label>
              <input value={draft.manualLists} onChange={(event) => updateDraft({ manualLists: event.target.value })} placeholder="Customer list names or ids" />
            </div>
            <div className="field">
              <label>Direct emails</label>
              <input value={draft.emails} onChange={(event) => updateDraft({ emails: event.target.value })} placeholder="customer@example.com, second@example.com" />
            </div>
            <div className="field">
              <label>Product or family</label>
              <input value={draft.productQuery} onChange={(event) => updateDraft({ productQuery: event.target.value })} placeholder="Hydro1620, DTF ink, heat press" />
            </div>
            <div className="field">
              <label>SKU filters</label>
              <input value={draft.productSkus} onChange={(event) => updateDraft({ productSkus: event.target.value })} placeholder="SKU values, comma separated" />
            </div>
            <div className="field">
              <label>Minimum orders</label>
              <input type="number" min="0" value={draft.orderCountMin} onChange={(event) => updateDraft({ orderCountMin: event.target.value })} placeholder="2" />
            </div>
            <div className="field">
              <label>Minimum spend</label>
              <input type="number" min="0" value={draft.totalSpentMin} onChange={(event) => updateDraft({ totalSpentMin: event.target.value })} placeholder="500" />
            </div>
            <div className="field">
              <label>Owner member ids</label>
              <input value={draft.ownerMemberIds} onChange={(event) => updateDraft({ ownerMemberIds: event.target.value })} placeholder="Member ids, optional" />
            </div>
            <div className="field">
              <label>Customer tags</label>
              <input value={draft.tags} onChange={(event) => updateDraft({ tags: event.target.value })} placeholder="wholesale, heat press" />
            </div>
          </div>
          <div className="orders-toolbar" style={{ marginTop: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={draft.includeUnknownConsent} onChange={(event) => updateDraft({ includeUnknownConsent: event.target.checked })} />
              Include unknown consent in preview
            </label>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={draft.includeSuppressed} onChange={(event) => updateDraft({ includeSuppressed: event.target.checked })} />
              Include blocked contacts for review
            </label>
          </div>
          <div className="orders-toolbar" style={{ marginTop: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              {previewing && <span className="pill info">Reading live audience</span>}
              {previewError && <span className="pill warn">{previewError}</span>}
              {preview && <span className="pill success">{preview.matchedContacts} live contacts matched</span>}
            </div>
            <div className="orders-toolbar">
              <button className="btn" type="button" disabled={previewing} onClick={onPreview}><RefreshCw size={14} /> Preview live audience</button>
              <button className="btn primary" type="button" disabled={!canAudienceWrite || creating || draft.name.trim().length < 2} onClick={onCreate}><Users size={14} /> Save audience</button>
            </div>
          </div>
        </div>
        {rows.length === 0 ? (
          <StateBlock title="No saved audiences" body="Define and save an audience before freezing a campaign send list." />
        ) : (
          <Table headers={['Audience', 'Live preview', 'State']}>
            {rows.map((row) => (
              <tr key={row.id} className={selectedAudience?.id === row.id ? 'selected-row' : undefined} onClick={() => onSelectAudience(row.id)} style={{ cursor: 'pointer' }}>
                <td><div className="name">{row.name}</div><div className="muted">{row.description || row.slug}</div></td>
                <td><strong>{row.contactCount}</strong><div className="muted">live contacts</div></td>
                <td><span className={`pill ${row.isArchived ? 'warn' : 'success'}`}>{row.isArchived ? 'Archived' : 'Active'}</span></td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section className="section">
        <h3>
          <span>Freeze and review send list</span>
          <span className={`pill ${providerModeTone(providerMode)}`}>{providerModeLabel(providerMode)}</span>
        </h3>
        <div className="data-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <div className="name">{selectedAudience?.name}</div>
              <div className="muted">Live preview: {selectedAudience?.contactCount ?? 0} contacts. Snapshot is the frozen list campaigns use.</div>
            </div>
            <button className="btn primary" type="button" disabled={!canAudienceWrite || creatingSnapshot || !selectedAudience} onClick={onCreateSnapshot}>
              <FileText size={14} /> Freeze snapshot
            </button>
          </div>
        </div>
        {snapshotsError && <StateBlock title="Snapshots could not load" body={snapshotsError} />}
        {!snapshotsError && snapshotsLoading && <StateBlock title="Loading snapshots" body="Reading frozen audience lists." />}
        {!snapshotsError && !snapshotsLoading && snapshots.length === 0 && (
          <StateBlock title="No frozen snapshots" body="Freeze this audience before using it for a campaign. Live preview counts are not a send list." />
        )}
        {snapshots.length > 0 && (
          <div className="two-col" style={{ gridTemplateColumns: 'minmax(260px, .65fr) minmax(0, 1.35fr)', gap: 12, marginTop: 12 }}>
            <div className="row-stack">
              {snapshots.map((snapshot) => (
                <button
                  key={snapshot.id}
                  type="button"
                  className={`data-card ${selectedSnapshotId === snapshot.id ? 'selected-row' : ''}`}
                  style={{ padding: 12, textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => onSelectSnapshot(snapshot.id)}
                >
                  <div className="name">{snapshot.name}</div>
                  <div className="muted">{fmtDate(snapshot.createdAt)}</div>
                  <div className="orders-toolbar" style={{ marginTop: 8 }}>
                    <span className="pill info">{snapshot.memberCount} frozen</span>
                    <span className="pill success">{snapshot.reachableCount} eligible</span>
                    <span className={`pill ${snapshot.memberCount - snapshot.reachableCount > 0 ? 'warn' : 'success'}`}>
                      {snapshot.memberCount - snapshot.reachableCount} blocked
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="row-stack">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Search frozen members</label>
                <input value={snapshotSearch} onChange={(event) => onSnapshotSearchChange(event.target.value)} placeholder="Email or customer name" />
              </div>
              {snapshotDiffError && <StateBlock title="Snapshot drift could not load" body={snapshotDiffError} />}
              {!snapshotDiffError && snapshotDiffLoading && <StateBlock title="Checking drift" body="Comparing frozen snapshot to the current live audience." />}
              {snapshotDiff && (
                <div className="data-card" style={{ padding: 12 }}>
                  <div className="orders-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <span className={`pill ${snapshotDiff.diff.driftDetected ? 'warn' : 'success'}`}>
                      {snapshotDiff.diff.driftDetected ? 'Drift detected' : 'No drift'}
                    </span>
                    <span className="muted">Current live match: {snapshotDiff.current.matchedContacts}</span>
                  </div>
                  <div className="sr-kpi-row" style={{ marginTop: 10 }}>
                    <Kpi label="Added since freeze" value={snapshotDiff.diff.added} tone="warn" icon={<Users size={15} />} />
                    <Kpi label="Removed since freeze" value={snapshotDiff.diff.removed} tone="warn" icon={<Users size={15} />} />
                    <Kpi label="Still matched" value={snapshotDiff.diff.stayed} tone="success" icon={<Users size={15} />} />
                  </div>
                </div>
              )}
              {snapshotMembersError && <StateBlock title="Snapshot members could not load" body={snapshotMembersError} />}
              {!snapshotMembersError && snapshotMembersLoading && <StateBlock title="Loading frozen members" body="Reading snapshot member evidence." />}
              {snapshotMembers && (
                <Table headers={['Frozen member', 'Reachability', 'Intent', 'Last activity', 'Detail']}>
                  {snapshotMembers.members.length === 0 ? (
                    <tr><td colSpan={5}>No members match this search.</td></tr>
                  ) : snapshotMembers.members.map((member) => (
                    <tr key={member.id}>
                      <td><div className="name">{member.name || member.email}</div><div className="muted">{member.email}</div></td>
                      <td>
                        <span className={`pill ${member.isSendable ? 'success' : 'warn'}`}>{member.isSendable ? 'Reachable' : 'Blocked'}</span>
                        {!member.isSendable && <div className="muted">{member.suppressionReason || member.consentState}</div>}
                      </td>
                      <td>{member.buyerIntent || '-'}</td>
                      <td className="muted">{fmtDate(member.lastActivityAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={!member.contactDetailAvailable}
                          onClick={() => onOpenContactDetail(member.contactId)}
                        >
                          Open contact detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CampaignsPanel({
  loading,
  rows,
  audiences,
  templates,
  approvalPolicy,
  canCampaignWrite,
  canCampaignApprove,
  canCampaignPublish,
  campaignName,
  audienceId,
  snapshotId,
  snapshots,
  snapshotsLoading,
  snapshotsError,
  templateId,
  subjectOverride,
  scheduledAt,
  onCampaignNameChange,
  onAudienceChange,
  onSnapshotChange,
  onTemplateChange,
  onSubjectOverrideChange,
  onScheduledAtChange,
  onCreate,
  onQueue,
  onApprove,
  onPause,
  onCancel,
  creating,
  actionPending,
}: {
  loading: boolean;
  rows: MailCampaign[];
  audiences: MailAudience[];
  templates: EmailTemplate[];
  approvalPolicy: ApprovalPolicy;
  canCampaignWrite: boolean;
  canCampaignApprove: boolean;
  canCampaignPublish: boolean;
  campaignName: string;
  audienceId: string;
  snapshotId: string;
  snapshots: MailAudienceSnapshotDto[];
  snapshotsLoading: boolean;
  snapshotsError: string | null;
  templateId: string;
  subjectOverride: string;
  scheduledAt: string;
  onCampaignNameChange: (value: string) => void;
  onAudienceChange: (value: string) => void;
  onSnapshotChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onSubjectOverrideChange: (value: string) => void;
  onScheduledAtChange: (value: string) => void;
  onCreate: () => void;
  onQueue: (id: string) => void;
  onApprove: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  creating: boolean;
  actionPending: boolean;
}) {
  if (loading) return <StateBlock title="Loading campaigns" body="Reading live campaign drafts and disabled delivery evidence." />;
  const sendableTemplates = templates.filter((template) => template.publishedVersionId || template.status === 'published');
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null;
  const canCreate = canCampaignWrite && campaignName.trim().length > 1 && Boolean(audienceId) && Boolean(snapshotId) && Boolean(templateId);
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(360px, .65fr) minmax(0, 1fr)' }}>
      <section className="section">
        <h3>Create campaign</h3>
        <div className="field">
          <label>Campaign name</label>
          <input value={campaignName} onChange={(event) => onCampaignNameChange(event.target.value)} placeholder="July reorder reminder" />
        </div>
        <div className="field">
          <label>Audience</label>
          <select value={audienceId} onChange={(event) => onAudienceChange(event.target.value)}>
            <option value="">Choose audience</option>
            {audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name} ({audience.contactCount})</option>)}
          </select>
          <div className="hint">This is only the live audience definition. Freeze a snapshot before creating a campaign.</div>
        </div>
        <div className="field">
          <label>Frozen send list</label>
          <select value={snapshotId} disabled={!audienceId || snapshotsLoading} onChange={(event) => onSnapshotChange(event.target.value)}>
            <option value="">{audienceId ? 'Choose frozen snapshot' : 'Choose audience first'}</option>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.name} ({snapshotEligibilitySummary(snapshot)})
              </option>
            ))}
          </select>
          {snapshotsError && <div className="error-state">{snapshotsError}</div>}
          {!snapshotsError && audienceId && snapshotsLoading && <div className="hint">Loading frozen snapshots...</div>}
          {!snapshotsError && audienceId && !snapshotsLoading && snapshots.length === 0 && (
            <div className="hint">No frozen snapshots for this audience. Open Audiences and freeze the live preview before creating a campaign.</div>
          )}
          {selectedSnapshot && (
            <div className="hint">
              Frozen {fmtDate(selectedSnapshot.createdAt)}. {snapshotEligibilitySummary(selectedSnapshot)}.
            </div>
          )}
        </div>
        <div className="field">
          <label>Published template</label>
          <select value={templateId} onChange={(event) => onTemplateChange(event.target.value)}>
            <option value="">Choose template</option>
            {sendableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          {sendableTemplates.length === 0 && <div className="hint">Publish a template before creating a campaign.</div>}
        </div>
        <div className="field">
          <label>Subject override</label>
          <input value={subjectOverride} onChange={(event) => onSubjectOverrideChange(event.target.value)} placeholder="Leave blank to use the approved template subject" />
        </div>
        <div className="field">
          <label>Schedule after approval</label>
          <input type="datetime-local" value={scheduledAt} onChange={(event) => onScheduledAtChange(event.target.value)} />
          <div className="hint">After approval, scheduled campaigns record marketing proof at this time. Marketing delivery stays proof-only until the send gate is explicitly enabled.</div>
        </div>
        <button className="btn primary" type="button" disabled={!canCreate || creating} onClick={onCreate}>
          <Mail size={14} /> Create draft campaign
        </button>
        <div className="muted" style={{ marginTop: 10 }}>Campaigns move through frozen snapshot selection, draft, approval, scheduled proof, then disabled delivery proof. Live preview is never used as the send list.</div>
      </section>
      <section className="section">
        <h3>Campaigns</h3>
        {rows.length === 0 ? (
          <StateBlock title="No campaigns" body="Create a campaign from a real audience and published template." />
        ) : (
          <Table headers={['Campaign', 'Audience', 'Template', 'Readiness', 'Proof']}>
            {rows.map((row) => {
              const threshold = campaignThresholdDecision(row, approvalPolicy);
              const decision = campaignDecision(row, threshold);
              const canApprove = canCampaignApprove && Boolean(row.snapshotId) && Boolean(row.templateVersionId) && !threshold.blocked && ['draft', 'needs_approval', 'paused'].includes(row.status);
              const canQueue = canCampaignPublish && Boolean(row.snapshotId) && Boolean(row.templateVersionId) && Boolean(row.approvedAt) && ['approved', 'scheduled'].includes(row.status);
              const canPause = canCampaignWrite && ['draft', 'needs_approval', 'approved', 'scheduled'].includes(row.status);
              const canCancel = canCampaignWrite && !['queued_disabled', 'sent', 'completed', 'canceled', 'archived'].includes(row.status);
              const creatorLabel = row.createdByMember?.name ?? row.createdByMember?.email ?? 'System';
              const approverLabel = row.approvedByMember?.name ?? row.approvedByMember?.email ?? (row.approvedAt ? 'Archived member' : null);
              return (
                <tr key={row.id}>
                  <td>
                    <div className="name">{row.name}</div>
                    <div className="muted">
                      Updated {fmtDate(row.updatedAt)}
                      <span> - Draft owner: {creatorLabel}</span>
                      {row.scheduledAt ? ` - Scheduled ${fmtDate(row.scheduledAt)}` : ''}
                    </div>
                  </td>
                  <td>
                    <div>{row.audience?.name ?? row.audienceId ?? '-'}</div>
                    <div className="muted">{row.snapshot ? snapshotEligibilitySummary(row.snapshot) : 'Blocked: no frozen snapshot selected'}</div>
                  </td>
                  <td>
                    <div>{row.template?.name ?? row.templateId ?? '-'}</div>
                    <div className="muted">
                      {row.templateVersion ? `Revision ${row.templateVersion.versionNumber} pinned` : 'Blocked: no approved revision pinned'}
                      {row.subjectOverride ? ' - custom subject' : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${campaignStatusTone(row.status)}`}>{businessCampaignStatus(row.status)}</span>
                    <div className="muted">
                      {decision.primary}
                      {row.status === 'scheduled' && row.scheduledAt ? ` - Worker will record proof at ${fmtDate(row.scheduledAt)}` : ''}
                    </div>
                    <div className="muted">
                      {decision.secondary}
                      {approverLabel ? ` - Approver: ${approverLabel}` : ''}
                    </div>
                  </td>
                  <td>
                    <div className="orders-toolbar" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span className="muted">{campaignProofSummary(row)}</span>
                      {canApprove && (
                        <button className="btn" type="button" disabled={actionPending} onClick={() => onApprove(row.id)}>
                          Approve
                        </button>
                      )}
                      {!canApprove && threshold.blocked && ['draft', 'needs_approval', 'paused'].includes(row.status) && (
                        <span className="pill danger">Approval blocked</span>
                      )}
                      {canQueue && (
                        <button className="btn" type="button" disabled={actionPending} onClick={() => onQueue(row.id)}>
                          {row.status === 'scheduled' ? 'Record proof now' : 'Record disabled proof'}
                        </button>
                      )}
                      {canPause && (
                        <button className="btn" type="button" disabled={actionPending} onClick={() => onPause(row.id)}>
                          Pause
                        </button>
                      )}
                      {canCancel && (
                        <button className="btn" type="button" disabled={actionPending} onClick={() => onCancel(row.id)}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}

function FlowsPanel({
  loading,
  rows,
  triggerTypes,
  templates,
  audiences,
  destinations,
  canFlowWrite,
  canFlowPublish,
  draft,
  onDraftChange,
  onCreate,
  creating,
  onPublish,
  onPause,
  onResume,
  onValidate,
  onSimulate,
  proof,
  actionPending,
}: {
  loading: boolean;
  rows: MailFlow[];
  triggerTypes: string[];
  templates: EmailTemplate[];
  audiences: MailAudience[];
  destinations: MailFlowWebhookDestinationDto[];
  canFlowWrite: boolean;
  canFlowPublish: boolean;
  draft: FlowDraft;
  onDraftChange: (draft: FlowDraft) => void;
  onCreate: () => void;
  creating: boolean;
  onPublish: (flowId: string) => void;
  onPause: (flowId: string) => void;
  onResume: (flowId: string) => void;
  onValidate: (flowId: string) => void;
  onSimulate: (flowId: string) => void;
  proof: FlowProof | null;
  actionPending: boolean;
}) {
  const sendableTemplates = templates.filter((template) => template.publishedVersionId || template.status === 'published');
  const activeDestinations = destinations.filter((destination) => destination.status === 'active');
  const createBlockedReason = flowDraftBlockedReason(draft, sendableTemplates, audiences, activeDestinations);
  const createDisabled = !canFlowWrite || creating || Boolean(createBlockedReason);
  const availableTriggers = triggerTypes.length > 0
    ? triggerTypes
    : [
      'segment_enter',
      'segment_exit',
      'shopify_order_placed',
      'order_completed',
      'customer_created',
      'abandoned_cart',
      'form_submitted',
      'high_buyer_intent',
      'viewed_product_n_times',
      'no_order_for_n_days',
      'clicked_campaign_no_convert',
      'sales_handoff_signal',
      'manual',
    ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="section">
        <h3>
          <span>Flow builder</span>
          <span className="pill warn">Proof-first draft</span>
        </h3>
        <div className="muted" style={{ marginBottom: 12 }}>
          Build a publishable draft from real references. The graph stays simple on purpose: trigger, optional delay, one business action, then validation and simulation proof.
        </div>
        <div className="field-row">
          <label className="field">
            <span>Flow name</span>
            <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Trigger</span>
            <select value={draft.triggerType} onChange={(event) => onDraftChange({ ...draft, triggerType: event.target.value })}>
              {availableTriggers.map((trigger) => <option key={trigger} value={trigger}>{businessTrigger(trigger)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Business action</span>
            <select value={draft.actionType} onChange={(event) => onDraftChange({ ...draft, actionType: event.target.value as FlowBuilderActionType })}>
              <option value="send_email">Send approved email</option>
              <option value="create_follow_up_task">Create follow-up task</option>
              <option value="update_contact_tag">Update contact tag</option>
              <option value="add_to_audience">Add to audience</option>
              <option value="remove_from_audience">Remove from audience</option>
              <option value="webhook">Record webhook action</option>
              <option value="emit_internal_event">Emit internal event</option>
            </select>
          </label>
          <label className="field">
            <span>Delay before action</span>
            <select value={draft.delayMode} onChange={(event) => onDraftChange({ ...draft, delayMode: event.target.value as FlowDraft['delayMode'] })}>
              <option value="none">No delay</option>
              <option value="minutes">Wait for a duration</option>
              <option value="scheduled_at">Wait until a date/time</option>
            </select>
          </label>
          {draft.delayMode === 'minutes' && (
            <label className="field">
              <span>Delay minutes</span>
              <input
                value={draft.delayMinutes}
                onChange={(event) => onDraftChange({ ...draft, delayMinutes: event.target.value })}
                inputMode="numeric"
                placeholder="Example: 1440"
              />
            </label>
          )}
          {draft.delayMode === 'scheduled_at' && (
            <label className="field">
              <span>Scheduled date</span>
              <input
                type="datetime-local"
                value={draft.delayScheduledAt}
                onChange={(event) => onDraftChange({ ...draft, delayScheduledAt: event.target.value })}
              />
            </label>
          )}
        </div>

        <div className="data-card" style={{ padding: 12, marginTop: 12 }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.conditionEnabled}
              onChange={(event) => onDraftChange({ ...draft, conditionEnabled: event.target.checked })}
            />
            <span>Only continue when a customer/event condition is true</span>
          </label>
          {draft.conditionEnabled && (
            <div className="field-row" style={{ marginTop: 10 }}>
              <label className="field">
                <span>Condition field</span>
                <input
                  value={draft.conditionField}
                  onChange={(event) => onDraftChange({ ...draft, conditionField: event.target.value })}
                  placeholder="event.buyerIntent"
                />
              </label>
              <label className="field">
                <span>Operator</span>
                <select
                  value={draft.conditionOperator}
                  onChange={(event) => onDraftChange({ ...draft, conditionOperator: event.target.value as FlowDraft['conditionOperator'] })}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Does not equal</option>
                  <option value="contains">Contains</option>
                  <option value="in">In comma list</option>
                  <option value="gt">Greater than</option>
                  <option value="gte">Greater than or equal</option>
                  <option value="lt">Less than</option>
                  <option value="lte">Less than or equal</option>
                </select>
              </label>
              <label className="field">
                <span>Expected value</span>
                <input
                  value={draft.conditionValue}
                  onChange={(event) => onDraftChange({ ...draft, conditionValue: event.target.value })}
                  placeholder="purchase_intent"
                />
              </label>
            </div>
          )}
          <div className="hint">
            False branch stops the flow. True branch continues to the selected business action.
          </div>
        </div>

        {draft.actionType === 'send_email' && (
          <label className="field">
            <span>Approved template</span>
            <select value={draft.templateId} onChange={(event) => onDraftChange({ ...draft, templateId: event.target.value })}>
              <option value="">Select a published template...</option>
              {sendableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} - {template.eventKey}</option>)}
            </select>
            <div className="hint">Publish validation rejects draft-only templates, matching the old flow publish gate.</div>
          </label>
        )}

        {draft.actionType === 'create_follow_up_task' && (
          <div className="field-row">
            <label className="field">
              <span>Task lane</span>
              <select value={draft.taskAxis} onChange={(event) => onDraftChange({ ...draft, taskAxis: event.target.value as FlowDraft['taskAxis'] })}>
                <option value="sales">Purchase intent</option>
                <option value="account">Account help</option>
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select value={draft.taskPriority} onChange={(event) => onDraftChange({ ...draft, taskPriority: event.target.value as FlowDraft['taskPriority'] })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="field">
              <span>Task title</span>
              <input value={draft.taskTitle} onChange={(event) => onDraftChange({ ...draft, taskTitle: event.target.value })} />
            </label>
            <label className="field">
              <span>Task instruction</span>
              <input value={draft.taskDescription} onChange={(event) => onDraftChange({ ...draft, taskDescription: event.target.value })} />
            </label>
          </div>
        )}

        {draft.actionType === 'update_contact_tag' && (
          <label className="field">
            <span>Contact tag</span>
            <input value={draft.tag} onChange={(event) => onDraftChange({ ...draft, tag: event.target.value })} placeholder="purchase_follow_up" />
          </label>
        )}

        {(draft.actionType === 'add_to_audience' || draft.actionType === 'remove_from_audience') && (
          <label className="field">
            <span>Audience</span>
            <select value={draft.audienceId} onChange={(event) => onDraftChange({ ...draft, audienceId: event.target.value })}>
              <option value="">Select an audience...</option>
              {audiences.filter((audience) => !audience.isArchived).map((audience) => <option key={audience.id} value={audience.id}>{audience.name} ({audience.contactCount})</option>)}
            </select>
          </label>
        )}

        {draft.actionType === 'webhook' && (
          <label className="field">
            <span>Webhook destination</span>
            <select value={draft.webhookDestinationId} onChange={(event) => onDraftChange({ ...draft, webhookDestinationId: event.target.value })}>
              <option value="">Select an active destination...</option>
              {activeDestinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name} - {destination.executionMode === 'live_requested' ? 'live requested' : 'proof-only'}</option>)}
            </select>
            <div className="hint">The graph stores destinationId only. Raw URL and secrets stay in the guarded registry.</div>
          </label>
        )}

        {draft.actionType === 'emit_internal_event' && (
          <label className="field">
            <span>Internal event name</span>
            <input value={draft.eventName} onChange={(event) => onDraftChange({ ...draft, eventName: event.target.value })} placeholder="mail.marketing.follow_up_requested" />
            <div className="hint">Letters, numbers, dots, dashes, underscores, and colons only. Secrets are rejected by backend validation.</div>
          </label>
        )}

        <div className="data-card" style={{ padding: 12, marginTop: 12 }}>
          <div className="orders-toolbar" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="name">{businessTrigger(draft.triggerType)} {'->'} {flowActionLabel(draft.actionType)}</div>
              <div className="muted">{flowDraftSummary(draft)}</div>
            </div>
            <button className="btn primary" type="button" disabled={createDisabled} onClick={onCreate}>
              <PlayCircle size={14} /> Create publishable draft
            </button>
          </div>
          {!canFlowWrite && <div className="hint" style={{ color: 'var(--danger)' }}>You do not have permission to create Mail Marketing flows.</div>}
          {createBlockedReason && <div className="hint" style={{ color: 'var(--danger)' }}>{createBlockedReason}</div>}
        </div>
      </section>

      {loading && <StateBlock title="Loading flows" body="Reading live Mail Marketing flows." />}
      {proof && <FlowProofPanel proof={proof} />}
      {!loading && rows.length === 0 ? (
        <StateBlock title="No flows" body="Create a configured draft from a real trigger and business action. Publish is blocked until validation references are complete." />
      ) : !loading ? (
        <Table headers={['Flow', 'Version', 'Runtime evidence', 'Status', 'Action']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="name">{row.name}</div>
                <div className="muted">{businessTrigger(row.triggerType)} - updated {fmtDate(row.updatedAt)}</div>
              </td>
              <td>
                <div className="name">{row.activeVersion ? `v${row.activeVersion.versionNumber} active` : row.latestVersion ? `v${row.latestVersion.versionNumber} draft` : 'No version'}</div>
                <div className="muted">{row.nodeCount} nodes / {row.versionCount} versions</div>
              </td>
              <td>
                <div className="name">{row.runCount} runs / {row.eventCount} events</div>
                <div className="muted">{row.runSummary.completed} completed, {row.runSummary.failed} failed, {row.runSummary.skipped} skipped</div>
              </td>
              <td>
                <span className={`pill ${row.status === 'published' ? 'success' : row.status === 'paused' ? 'warn' : 'info'}`}>{businessFlowStatus(row.status)}</span>
                <span className="pill warn" style={{ marginLeft: 6 }}>Proof-only</span>
              </td>
              <td>
                <div className="orders-toolbar" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn" type="button" disabled={actionPending || !row.latestVersion} onClick={() => onValidate(row.id)}>Validate</button>
                  <button className="btn" type="button" disabled={actionPending || !row.latestVersion} onClick={() => onSimulate(row.id)}>Simulate</button>
                  {row.status === 'published' ? (
                    <button className="btn" type="button" disabled={!canFlowWrite || actionPending} onClick={() => onPause(row.id)}>Pause</button>
                  ) : row.status === 'paused' ? (
                    <button className="btn" type="button" disabled={!canFlowPublish || actionPending || !row.activeVersion} onClick={() => onResume(row.id)}>Resume</button>
                  ) : (
                    <button className="btn primary" type="button" disabled={!canFlowPublish || actionPending || !row.latestVersion} onClick={() => onPublish(row.id)}>Publish proof mode</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : null}
    </div>
  );
}

function FlowProofPanel({ proof }: { proof: FlowProof }) {
  const result = proof.result;
  const ok = proof.type === 'validation' ? proof.result.valid : !proof.result.blocked;
  return (
    <div className="data-card" style={{ marginBottom: 14, padding: 16 }}>
      <div className="orders-toolbar" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div className="name">{proof.type === 'validation' ? 'Flow validation proof' : 'Flow simulation proof'}</div>
          <div className="muted">{result.flowName} - {result.versionNumber ? `v${result.versionNumber}` : 'no version'} - {result.providerMode} mode</div>
        </div>
        <span className={`pill ${ok ? 'success' : 'danger'}`}>{ok ? 'Ready proof' : 'Blocked'}</span>
      </div>
      {result.issues.length > 0 && (
        <div style={{ marginBottom: 10, border: '1px solid var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 8, padding: 10 }}>
          {result.issues.map((issue) => <div key={issue}>{issue}</div>)}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div style={{ marginBottom: 10, border: '1px solid var(--warn)', background: 'var(--warn-soft)', color: 'var(--text)', borderRadius: 8, padding: 10 }}>
          {result.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      )}
      {proof.type === 'validation' ? (
        <div className="muted">
          {proof.result.summary.nodeCount} nodes checked, {proof.result.summary.actionCount} action nodes, {proof.result.summary.sendEmailNodes} email nodes.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {proof.result.steps.map((step) => (
            <div key={`${step.nodeKey}:${step.outcome}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div className="orders-toolbar" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <strong>{step.label}</strong>
                <span className="pill info">{step.outcome}</span>
              </div>
              <div className="muted">{step.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  loading,
  data,
  destinations,
  destinationsLoading,
  destinationsError,
  approvalPolicyDraft,
  onApprovalPolicyDraftChange,
  onSaveApprovalPolicy,
  savingApprovalPolicy,
  canSettingsWrite,
  canFlowWrite,
  canFlowPublish,
  draft,
  onDraftChange,
  onCreateDestination,
  creatingDestination,
  onApproveDestination,
  onRevokeDestination,
  destinationApprovalPending,
}: {
  loading: boolean;
  data?: { settings: Record<string, unknown>; triggerTypes: string[]; nodeTypes: string[] };
  destinations: MailFlowWebhookDestinationDto[];
  destinationsLoading: boolean;
  destinationsError: string | null;
  approvalPolicyDraft: ApprovalPolicyDraft;
  onApprovalPolicyDraftChange: (draft: ApprovalPolicyDraft) => void;
  onSaveApprovalPolicy: () => void;
  savingApprovalPolicy: boolean;
  canSettingsWrite: boolean;
  canFlowWrite: boolean;
  canFlowPublish: boolean;
  draft: WebhookDestinationDraft;
  onDraftChange: (draft: WebhookDestinationDraft) => void;
  onCreateDestination: () => void;
  creatingDestination: boolean;
  onApproveDestination: (destination: MailFlowWebhookDestinationDto) => void;
  onRevokeDestination: (destinationId: string) => void;
  destinationApprovalPending: boolean;
}) {
  if (loading) return <StateBlock title="Loading settings" body="Reading Mail Marketing settings." />;
  if (!data) return null;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <section className="section">
          <h3>Settings</h3>
          <DetailLine label="Sending enabled" value="false" />
          <DetailLine label="Provider mode" value={String(data.settings.providerMode ?? 'disabled')} />
          <DetailLine label="Daily cap" value={String(data.settings.dailySendCap ?? 0)} />
        </section>
        <section className="section">
          <h3>Campaign approval policy</h3>
          <div className="muted" style={{ marginBottom: 12 }}>
            Approval reads the frozen send list, not the moving preview. Campaigns above these limits are blocked until the list is reduced or the policy is changed by a mail settings admin.
          </div>
          <div className="field-row">
            <label className="field">
              <span>Max eligible recipients</span>
              <input
                value={approvalPolicyDraft.maxReachableRecipients}
                onChange={(event) => onApprovalPolicyDraftChange({ ...approvalPolicyDraft, maxReachableRecipients: event.target.value })}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>Max frozen list size</span>
              <input
                value={approvalPolicyDraft.maxSnapshotMembers}
                onChange={(event) => onApprovalPolicyDraftChange({ ...approvalPolicyDraft, maxSnapshotMembers: event.target.value })}
                inputMode="numeric"
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Max audience spend USD</span>
              <input
                value={approvalPolicyDraft.maxEstimatedAudienceSpendUsd}
                onChange={(event) => onApprovalPolicyDraftChange({ ...approvalPolicyDraft, maxEstimatedAudienceSpendUsd: event.target.value })}
                inputMode="decimal"
              />
              <div className="hint">Use 0 to disable spend threshold until the audience has trusted spend metrics.</div>
            </label>
            <div className="orders-toolbar" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <button className="btn primary" type="button" disabled={!canSettingsWrite || savingApprovalPolicy} onClick={onSaveApprovalPolicy}>
                Save approval policy
              </button>
            </div>
          </div>
        </section>
        <section className="section">
          <h3>Catalog</h3>
          <DetailLine label="Triggers" value={data.triggerTypes.join(', ')} />
          <DetailLine label="Nodes" value={data.nodeTypes.join(', ')} />
        </section>
      </div>
      <section className="section">
        <h3>
          <span>Webhook destination registry</span>
          <span className="pill warn">Guarded outbound</span>
        </h3>
        <div className="muted" style={{ marginBottom: 12 }}>
          Flow webhook nodes must reference a tenant-owned destinationId. Raw URLs, tokens, and authorization headers are not stored inside flow graphs. Live outbound remains blocked until an exact target allowlist is approved.
        </div>
        {destinationsLoading ? (
          <StateBlock title="Loading destinations" body="Reading tenant-scoped webhook destinations." />
        ) : destinationsError ? (
          <StateBlock title="Webhook destinations could not load" body={destinationsError} />
        ) : destinations.length === 0 ? (
          <StateBlock title="No webhook destinations" body="Create a disabled destination before a flow can reference an outbound webhook safely." />
        ) : (
          <Table headers={['Destination', 'Status', 'Auth', 'Runtime guard', 'Live approval']}>
            {destinations.map((destination) => (
              <tr key={destination.id}>
                <td>
                  <div className="name">{destination.name}</div>
                  <div className="muted">{destination.slug} · {destination.url}</div>
                </td>
                <td><span className={`pill ${destination.status === 'active' ? 'success' : 'warn'}`}>{humanizeKey(destination.status)}</span></td>
                <td>
                  <div className="name">{destination.authType === 'header' ? 'Header secret' : 'No secret'}</div>
                  <div className="muted">{destination.hasSecret ? `${destination.secretHeaderName ?? 'Custom header'} stored encrypted` : 'No stored secret'}</div>
                </td>
                <td>
                  <div className="name">
                    {destination.executionMode === 'live_requested' && destination.liveApproved
                      ? 'Exact target approved; connector disabled'
                      : destination.executionMode === 'live_requested'
                        ? 'Live requested; allowlist approval required'
                      : destination.status === 'active'
                        ? 'Proof-only action log'
                        : 'Draft/proof only until activated'}
                  </div>
                  <div className="muted">{destination.timeoutMs}ms timeout - no external call without exact allowlist and runtime connector</div>
                </td>
                <td>
                  <div className="name">
                    {destination.liveApproved
                      ? `Approved ${fmtDate(destination.liveApprovedAt)}`
                      : destination.executionMode === 'live_requested'
                        ? 'Not approved'
                        : 'Not requested'}
                  </div>
                  <div className="muted">
                    {destination.liveApproved
                      ? 'Exact URL is allowlisted for this tenant destination.'
                      : destination.executionMode === 'live_requested'
                        ? 'Approve only after the target is owned and expected.'
                        : 'Proof-only destinations never call external URLs.'}
                  </div>
                  <div className="orders-toolbar" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    {destination.liveApproved ? (
                      <button
                        className="btn"
                        type="button"
                        disabled={!canFlowPublish || destinationApprovalPending}
                        onClick={() => onRevokeDestination(destination.id)}
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        className="btn"
                        type="button"
                        disabled={!canFlowPublish || destinationApprovalPending || destination.status !== 'active' || destination.executionMode !== 'live_requested'}
                        onClick={() => onApproveDestination(destination)}
                      >
                        Approve exact URL
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <form
          className="data-card"
          style={{ display: 'grid', gap: 10, marginTop: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            onCreateDestination();
          }}
        >
          <div className="field-row">
            <label className="field">
              <span>Name</span>
              <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Order status webhook" />
            </label>
            <label className="field">
              <span>HTTPS URL</span>
              <input value={draft.url} onChange={(event) => onDraftChange({ ...draft, url: event.target.value })} placeholder="https://example.com/factory-engine/webhook" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(event) => {
                  const status = event.target.value as WebhookDestinationDraft['status'];
                  onDraftChange({ ...draft, status, executionMode: status === 'active' ? draft.executionMode : 'proof_only' });
                }}
              >
                <option value="disabled">Disabled proof only</option>
                <option value="active">Active selectable</option>
              </select>
            </label>
            <label className="field">
              <span>Auth</span>
              <select value={draft.authType} onChange={(event) => onDraftChange({ ...draft, authType: event.target.value as WebhookDestinationDraft['authType'], secretHeaderName: '', secretValue: '' })}>
                <option value="none">No secret</option>
                <option value="header">Encrypted header secret</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Execution mode</span>
              <select
                value={draft.executionMode}
                disabled={draft.status !== 'active'}
                onChange={(event) => onDraftChange({ ...draft, executionMode: event.target.value as WebhookDestinationDraft['executionMode'] })}
              >
                <option value="proof_only">Proof-only action log</option>
                <option value="live_requested">Request live outbound after allowlist approval</option>
              </select>
              <div className="hint">Live outbound is not automatic. It needs an exact approved target before customer data can leave the tenant runtime.</div>
            </label>
          </div>
          {draft.authType === 'header' && (
            <div className="field-row">
              <label className="field">
                <span>Header name</span>
                <input value={draft.secretHeaderName} onChange={(event) => onDraftChange({ ...draft, secretHeaderName: event.target.value })} placeholder="X-Factory-Signature" />
              </label>
              <label className="field">
                <span>Secret value</span>
                <input type="password" value={draft.secretValue} onChange={(event) => onDraftChange({ ...draft, secretValue: event.target.value })} placeholder="Stored encrypted at rest" />
              </label>
            </div>
          )}
          <div className="field-row">
            <label className="field">
              <span>Timeout ms</span>
              <input value={draft.timeoutMs} onChange={(event) => onDraftChange({ ...draft, timeoutMs: event.target.value })} inputMode="numeric" />
            </label>
            <div className="orders-toolbar" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <button className="btn primary" type="submit" disabled={!canFlowWrite || creatingDestination || !draft.name.trim() || !draft.url.trim()}>
                Save destination
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: number | string; tone: string; icon: ReactNode }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="data-card">
      <table className="data-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      <AlertTriangle size={18} />
      <div className="name" style={{ marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ marginBottom: action ? 14 : 0 }}>{body}</div>
      {action}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 10 }}>
      <span className="muted">{label}</span>
      <strong style={{ color: 'var(--text)', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

function buildTemplateInputFromDraft(draft: TemplateDraft): SaveEmailTemplateInput {
  return {
    name: draft.name.trim(),
    eventKey: draft.eventKey.trim(),
    templateType: draft.templateType,
    folderKey: draft.folderKey.trim() || draft.templateType,
    subject: draft.subject.trim(),
    previewText: draft.previewText.trim() || null,
    html: draft.html,
    text: draft.text.trim() || null,
    variables: splitCsv(draft.variables),
    metadata: {
      source: 'admin_mail_template_draft_composer',
      releaseLane: 'draft_only',
    },
  };
}

function draftFromTemplateEvent(event: MailTemplateWorkspaceEvent): TemplateDraft {
  const title = event.title || humanizeKey(event.eventKey);
  const actionUrl = event.eventKey.includes('password') ? '{{reset_url}}' : event.eventKey.includes('invoice') ? '{{portal_url}}' : '{{action_url}}';
  return {
    name: `${title} variant`,
    eventKey: event.eventKey,
    templateType: 'transactional',
    folderKey: event.folderKey || event.eventKey.split('.')[0] || 'transactional',
    subject: event.eventKey.includes('invoice')
      ? '{{brand_name}} invoice {{invoice_number}}'
      : `{{brand_name}} | ${title}`,
    previewText: event.description || 'Transactional customer email.',
    html: [
      '<!doctype html><html><body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#eef2f7;"><tr><td align="center">',
      '<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dbe4ef;border-radius:24px;overflow:hidden;">',
      '<tr><td style="padding:30px 32px 14px;border-top:6px solid #1d4ed8;"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Transactional email</div><h1 style="margin:16px 0 0;font-size:30px;line-height:1.15;color:#111827;">',
      title,
      '</h1></td></tr>',
      '<tr><td style="padding:4px 32px 10px;color:#334155;font-size:15px;line-height:1.7;"><p>Hi {{recipient_name}},</p><p>',
      event.description || 'Please review the account update below.',
      '</p></td></tr>',
      `<tr><td style="padding:0 32px 30px;"><a href="${actionUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700;">Review details</a></td></tr>`,
      '<tr><td style="padding:18px 32px 28px;color:#64748b;font-size:12px;line-height:1.5;border-top:1px solid #e5eaf2;">This message was sent from {{brand_name}}.</td></tr>',
      '</table></td></tr></table></body></html>',
    ].join(''),
    text: `Hi {{recipient_name}}, ${event.description || title} ${actionUrl}`,
    variables: (event.variables ?? ['brand_name', 'recipient_name', 'action_url']).join(', '),
  };
}

function eventFolderRank(folderKey: string | undefined) {
  const order = ['identity', 'auth', 'users', 'b2b', 'tax_exempt', 'support', 'forms', 'discount', 'orders', 'marketing', 'general'];
  const index = order.indexOf(folderKey || 'general');
  return index === -1 ? 99 : index;
}

function templateDraftBlockedReason(draft: TemplateDraft) {
  if (draft.name.trim().length < 2) return 'Template name must be at least 2 characters.';
  if (draft.eventKey.trim().length < 2) return 'Business event key is required.';
  if (draft.subject.trim().length < 1) return 'Subject is required.';
  if (draft.html.trim().length < 1) return 'HTML body is required.';
  const unsafeReason = unsafeTemplateSourceReason(draft.html, '');
  if (unsafeReason) return unsafeReason;
  if (draft.templateType === 'marketing' && !draft.html.includes('{{urls.unsubscribe}}')) {
    return 'Marketing templates must include the {{urls.unsubscribe}} variable before creation.';
  }
  return null;
}

function revisionSourceBlockedReason(source: { subject: string; html: string; css: string }) {
  if (source.subject.trim().length < 1) return 'Subject is required.';
  if (source.html.trim().length < 1) return 'HTML body is required.';
  return unsafeTemplateSourceReason(source.html, source.css);
}

function unsafeTemplateSourceReason(html: string, css: string) {
  if (/<script\b/i.test(html)) return 'HTML cannot include script tags.';
  if (/<form\b/i.test(html)) return 'HTML cannot include form tags.';
  if (/<iframe\b/i.test(html)) return 'HTML cannot include iframe tags.';
  if (/<(?:object|embed)\b/i.test(html)) return 'HTML cannot include object or embed tags.';
  if (/<link\b/i.test(html)) return 'HTML cannot include link tags.';
  if (/\son[a-z]+\s*=/i.test(html)) return 'HTML cannot include inline JavaScript event handlers.';
  if (/javascript:/i.test(html)) return 'HTML cannot include javascript: URLs.';
  if (/data\s*:\s*text\/html/i.test(html)) return 'HTML cannot include text/html data URLs.';
  if (/<img\b[^>]*(?:width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?[^>]*width\s*=\s*["']?1["']?)/i.test(html)) {
    return 'HTML cannot include tracking-pixel sized images.';
  }
  if (/<img\b[^>]*display\s*:\s*none/i.test(html)) return 'HTML cannot include hidden tracking images.';
  if (/<\/style\s*>/i.test(css)) return 'CSS cannot close the style tag.';
  if (/<script\b/i.test(css)) return 'CSS cannot include script tags.';
  if (/@import\b/i.test(css)) return 'CSS cannot include @import.';
  if (/javascript:/i.test(css)) return 'CSS cannot include javascript: URLs.';
  if (/\bexpression\s*\(/i.test(css)) return 'CSS cannot include expression().';
  if (/\bbehavior\s*:/i.test(css)) return 'CSS cannot include behavior.';
  return null;
}

function buildFlowGraphFromDraft(draft: FlowDraft): SaveMailFlowInput['graph'] {
  const nodes: Array<Record<string, unknown>> = [
    {
      id: 'trigger',
      type: 'trigger',
      label: businessTrigger(draft.triggerType),
      triggerType: draft.triggerType,
      positionX: 0,
      positionY: 0,
    },
  ];
  const edges: Array<Record<string, unknown>> = [];
  let sourceNode = 'trigger';
  const delayConfig = flowDraftDelayConfig(draft);
  if (delayConfig) {
    nodes.push({
      id: 'delay',
      type: 'delay',
      label: delayConfig.label,
      ...delayConfig.config,
      positionX: 220,
      positionY: 0,
    });
    edges.push({ id: 'trigger-delay', source: 'trigger', target: 'delay' });
    sourceNode = 'delay';
  }

  const hasCondition = draft.conditionEnabled;
  if (hasCondition) {
    nodes.push({
      id: 'condition',
      type: 'condition',
      label: 'Check condition before action',
      field: draft.conditionField.trim(),
      operator: draft.conditionOperator,
      value: conditionValue(draft),
      routes: [{ key: 'true', label: 'Continue', nextNodeKey: 'action' }],
      positionX: delayConfig ? 440 : 220,
      positionY: 0,
    });
    edges.push({ id: `${sourceNode}-condition`, source: sourceNode, target: 'condition' });
    sourceNode = 'condition';
  }

  nodes.push({
    id: 'action',
    type: draft.actionType,
    label: flowActionLabel(draft.actionType),
    ...flowActionConfig(draft),
    positionX: delayConfig && hasCondition ? 660 : delayConfig || hasCondition ? 440 : 220,
    positionY: 0,
  });
  if (!hasCondition) edges.push({ id: `${sourceNode}-action`, source: sourceNode, target: 'action' });
  return { nodes, edges };
}

function flowActionConfig(draft: FlowDraft): Record<string, unknown> {
  switch (draft.actionType) {
    case 'send_email':
      return { templateId: draft.templateId };
    case 'create_follow_up_task':
      return {
        axis: draft.taskAxis,
        title: draft.taskTitle.trim(),
        body: draft.taskDescription.trim(),
        priority: draft.taskPriority,
      };
    case 'update_contact_tag':
      return { tags: [draft.tag.trim()].filter(Boolean) };
    case 'add_to_audience':
    case 'remove_from_audience':
      return { audienceId: draft.audienceId };
    case 'webhook':
      return { destinationId: draft.webhookDestinationId };
    case 'emit_internal_event':
      return { eventName: draft.eventName.trim() };
    default:
      return {};
  }
}

function flowDraftBlockedReason(
  draft: FlowDraft,
  sendableTemplates: EmailTemplate[],
  audiences: MailAudience[],
  activeDestinations: MailFlowWebhookDestinationDto[],
) {
  if (draft.name.trim().length < 2) return 'Flow name must be at least 2 characters.';
  if (draft.triggerType.trim().length < 2) return 'Choose a trigger before creating a flow.';
  if (draft.delayMode === 'minutes' && !flowDraftDelayMinutes(draft)) return 'Delay must be a positive whole number of minutes.';
  if (draft.delayMode === 'scheduled_at' && !flowDraftScheduledAt(draft)) return 'Choose a scheduled date before creating this flow.';
  if (draft.conditionEnabled) {
    if (draft.conditionField.trim().length < 2) return 'Condition field is required.';
    if (draft.conditionValue.trim().length < 1) return 'Condition expected value is required.';
  }
  switch (draft.actionType) {
    case 'send_email':
      if (sendableTemplates.length === 0) return 'Publish a template revision before building an email flow.';
      if (!draft.templateId) return 'Choose a published template before creating this flow.';
      return null;
    case 'create_follow_up_task':
      if (!draft.taskAxis) return 'Choose purchase intent or account help for the follow-up task.';
      if (draft.taskTitle.trim().length < 2) return 'Follow-up task title is required.';
      if (draft.taskDescription.trim().length < 2) return 'Follow-up task instruction is required.';
      return null;
    case 'update_contact_tag':
      if (!draft.tag.trim()) return 'Enter the contact tag to apply.';
      return null;
    case 'add_to_audience':
    case 'remove_from_audience':
      if (audiences.filter((audience) => !audience.isArchived).length === 0) return 'Create an audience before building an audience membership flow.';
      if (!draft.audienceId) return 'Choose the audience this action will update.';
      return null;
    case 'webhook':
      if (activeDestinations.length === 0) return 'Create and activate a guarded webhook destination before building a webhook flow.';
      if (!draft.webhookDestinationId) return 'Choose an active webhook destination.';
      return null;
    case 'emit_internal_event':
      if (!draft.eventName.trim()) return 'Internal event name is required.';
      if (!/^[a-zA-Z0-9_.:-]{2,160}$/.test(draft.eventName.trim())) {
        return 'Internal event name may only contain letters, numbers, dots, dashes, underscores, and colons.';
      }
      return null;
    default:
      return 'Choose a supported business action.';
  }
}

function flowDraftDelayMinutes(draft: FlowDraft) {
  if (draft.delayMode !== 'minutes') return null;
  const value = draft.delayMinutes.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

function flowDraftScheduledAt(draft: FlowDraft) {
  if (draft.delayMode !== 'scheduled_at') return null;
  if (!draft.delayScheduledAt) return null;
  const parsed = new Date(draft.delayScheduledAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function flowDraftDelayConfig(draft: FlowDraft) {
  const delayMinutes = flowDraftDelayMinutes(draft);
  if (delayMinutes) {
    return {
      label: `Wait ${delayMinutes} minute${delayMinutes === 1 ? '' : 's'}`,
      config: { delayMinutes },
    };
  }
  const scheduledAt = flowDraftScheduledAt(draft);
  if (scheduledAt) {
    return {
      label: `Wait until ${fmtDate(scheduledAt)}`,
      config: { scheduledAt },
    };
  }
  return null;
}

function conditionValue(draft: FlowDraft) {
  return draft.conditionOperator === 'in'
    ? splitCsv(draft.conditionValue)
    : draft.conditionValue.trim();
}

function flowActionLabel(value: FlowBuilderActionType) {
  const labels: Record<FlowBuilderActionType, string> = {
    send_email: 'Send approved email',
    create_follow_up_task: 'Create follow-up task',
    update_contact_tag: 'Update contact tag',
    add_to_audience: 'Add to audience',
    remove_from_audience: 'Remove from audience',
    webhook: 'Record webhook action',
    emit_internal_event: 'Emit internal event',
  };
  return labels[value];
}

function flowDraftSummary(draft: FlowDraft) {
  const delay = flowDraftDelayMinutes(draft);
  const scheduledAt = flowDraftScheduledAt(draft);
  const timing = delay
    ? `after ${delay} minute${delay === 1 ? '' : 's'}`
    : scheduledAt
      ? `at ${fmtDate(scheduledAt)}`
      : 'immediately';
  const condition = draft.conditionEnabled
    ? ` when ${draft.conditionField.trim() || 'the configured field'} ${draft.conditionOperator.replace(/_/g, ' ')} ${draft.conditionValue.trim() || 'the expected value'}`
    : '';
  if (draft.actionType === 'create_follow_up_task') {
    return `${flowActionLabel(draft.actionType)} ${timing}${condition}; task lane ${businessTaskAxis(draft.taskAxis)}.`;
  }
  if (draft.actionType === 'send_email') {
    return `${flowActionLabel(draft.actionType)} ${timing}${condition}; publish requires an approved template revision.`;
  }
  if (draft.actionType === 'webhook') {
    return `${flowActionLabel(draft.actionType)} ${timing}${condition}; registry destination only, no raw URL in graph.`;
  }
  return `${flowActionLabel(draft.actionType)} ${timing}${condition}; validate before publishing proof mode.`;
}

function businessTaskAxis(value: FlowDraft['taskAxis']) {
  return value === 'account' ? 'account help' : 'purchase intent';
}

function buildAudienceFilters(draft: AudienceDraft): MailAudienceFilterInput {
  return {
    matchMode: 'all',
    conditions: [],
    segmentIds: [],
    localSegmentIds: splitCsv(draft.localSegments),
    shopifySegmentIds: splitCsv(draft.shopifySegments),
    manualListIds: splitCsv(draft.manualLists),
    emails: splitCsv(draft.emails).filter((value) => value.includes('@')),
    tags: splitCsv(draft.tags),
    lifecycleStages: [],
    customerOwnerMemberIds: splitCsv(draft.ownerMemberIds),
    assignmentAxes: [],
    productSkus: splitCsv(draft.productSkus),
    productNames: [],
    productFamilies: splitCsv(draft.productFamilies),
    productQuery: draft.productQuery.trim() || null,
    orderCountMin: draft.orderCountMin.trim() ? Number(draft.orderCountMin) : null,
    orderCountMax: null,
    totalSpentMin: draft.totalSpentMin.trim() ? Number(draft.totalSpentMin) : null,
    totalSpentMax: null,
    lastOrderAfter: draft.lastOrderAfter ? new Date(draft.lastOrderAfter).toISOString() : null,
    lastOrderBefore: null,
    includeUnknownConsent: draft.includeUnknownConsent,
    includeSuppressed: draft.includeSuppressed,
  };
}

function splitCsv(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function label(tab: Tab) {
  return tab.replace('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeMailTab(value: unknown): Tab | null {
  return typeof value === 'string' && MAIL_MARKETING_TABS.includes(value as Tab) ? value as Tab : null;
}

function fmtDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatMoney(value: string | number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '$0';
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function humanizeKey(value: string | null | undefined) {
  const raw = String(value || 'unknown').replace(/[._-]+/g, ' ').trim();
  return raw ? raw.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown';
}

function parsePreviewVariables(value: string) {
  const parsed = JSON.parse(value || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Preview data must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function deliveryMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isTemplateReleaseProof(row: MailDeliveryProof) {
  if (!['queued_disabled', 'queued', 'sending', 'sent'].includes(row.status)) return false;
  const metadata = deliveryMetadata(row.metadata);
  const releaseProof = deliveryMetadata(metadata.releaseProof);
  return metadata.source === 'email_template_test_send'
    && releaseProof.schemaVersion === 1
    && typeof releaseProof.sourceHash === 'string'
    && releaseProof.unresolvedCount === 0;
}

function textMeta(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function deliveryTone(status: MailDeliveryStatus) {
  const tones: Record<MailDeliveryStatus, string> = {
    draft: '',
    queued: 'info',
    queued_disabled: 'warn',
    sending: 'info',
    sent: 'success',
    failed: 'danger',
    skipped: 'warn',
  };
  return tones[status] ?? '';
}

function deliveryLabel(status: MailDeliveryStatus) {
  const labels: Record<MailDeliveryStatus, string> = {
    draft: 'Draft',
    queued: 'Queued',
    queued_disabled: 'Disabled proof recorded',
    sending: 'Sending',
    sent: 'Sent',
    failed: 'Failed',
    skipped: 'Skipped',
  };
  return labels[status] ?? status;
}

function businessTrigger(value: string) {
  const labels: Record<string, string> = {
    manual: 'Manual entry',
    segment_enter: 'Customer enters audience',
    segment_exit: 'Customer leaves audience',
    shopify_order_placed: 'Shopify order placed',
    order_completed: 'Order completed',
    customer_created: 'New customer',
    abandoned_cart: 'Cart left behind',
    form_submitted: 'Form submitted',
    high_buyer_intent: 'High purchase intent',
    viewed_product_n_times: 'Repeated product views',
    no_order_for_n_days: 'No order for days',
    clicked_campaign_no_convert: 'Clicked campaign without order',
    sales_handoff_signal: 'Purchase handoff signal',
  };
  return labels[value] ?? value.replace(/_/g, ' ');
}

function businessFlowStatus(value: string) {
  const labels: Record<string, string> = {
    draft: 'Draft',
    published: 'Active',
    paused: 'Paused',
    archived: 'Archived',
  };
  return labels[value] ?? value;
}

function campaignDecision(row: MailCampaign, threshold: CampaignThresholdDecision) {
  if (!row.snapshotId) {
    return {
      primary: 'Freeze a send list before approval or proof.',
      secondary: 'Live audience preview can move and is not a final send list.',
    };
  }
  if (threshold.blocked) {
    return {
      primary: 'Approval is blocked by the campaign approval policy.',
      secondary: threshold.reasons.join(' '),
    };
  }
  if (!row.templateVersionId) {
    return {
      primary: 'Pin an approved template revision before approval or proof.',
      secondary: 'A campaign must not send from a draft or moving template.',
    };
  }
  if (!row.approvedAt && ['draft', 'needs_approval', 'paused'].includes(row.status)) {
    return {
      primary: 'Approval required before delivery proof.',
      secondary: row.snapshot
        ? `${snapshotEligibilitySummary(row.snapshot)} before proof.`
        : 'Frozen recipient evidence is attached.',
    };
  }
  if (row.status === 'queued_disabled') {
    return {
      primary: 'Proof-only delivery is recorded.',
      secondary: 'No external customer email was sent from this proof run.',
    };
  }
  if (row.status === 'scheduled') {
    return {
      primary: 'Approved and waiting for the scheduled proof run.',
      secondary: 'Recipient list and template revision are frozen.',
    };
  }
  if (row.approvedAt) {
    return {
      primary: `Approved ${fmtDate(row.approvedAt)}.`,
      secondary: 'Ready to record proof or send when provider mode allows.',
    };
  }
  return {
    primary: `Campaign is ${businessCampaignStatus(row.status)}.`,
    secondary: 'Review frozen list, pinned template, and blockers before action.',
  };
}

function campaignProofSummary(row: MailCampaign) {
  const proofCount = row.queuedCount || row.recipientCount;
  const blocked = row.skippedCount + row.suppressedCount;
  if (row.status === 'queued_disabled') {
    return `${proofCount} proof records / ${blocked} blocked or skipped / 0 external sends`;
  }
  if (!row.snapshotId || !row.templateVersionId) {
    return 'Proof blocked until frozen list and approved template revision exist';
  }
  return `${proofCount} proof-ready / ${row.skippedCount} skipped / ${row.suppressedCount} suppressed`;
}

function providerModeValue(value: unknown): MailProviderMode {
  return value === 'live' || value === 'test' || value === 'disabled' ? value : 'disabled';
}

function providerModeLabel(value: unknown) {
  const mode = providerModeValue(value);
  if (mode === 'live') return 'Live delivery';
  if (mode === 'test') return 'Test-only';
  return 'Delivery disabled';
}

function providerModeTone(value: unknown) {
  const mode = providerModeValue(value);
  if (mode === 'live') return 'success';
  if (mode === 'test') return 'info';
  return 'warn';
}

function providerModeTemplateDetail(value: unknown) {
  const mode = providerModeValue(value);
  if (mode === 'live') return 'Mail Center is in live mode. Template tests still use explicit test recipients before any customer-facing release.';
  if (mode === 'test') return 'Mail Center is in test-only mode. Template tests can create delivery proof for the selected test recipient only.';
  return 'Mail Center delivery is disabled. Tests create a proof-only delivery record without contacting customers.';
}

function snapshotEligibilitySummary(snapshot: { memberCount: number; reachableCount: number }) {
  const blocked = Math.max(snapshot.memberCount - snapshot.reachableCount, 0);
  return `${snapshot.reachableCount}/${snapshot.memberCount} eligible, ${blocked} blocked`;
}

interface CampaignThresholdDecision {
  blocked: boolean;
  reasons: string[];
}

function campaignThresholdDecision(row: MailCampaign, policy: ApprovalPolicy): CampaignThresholdDecision {
  const snapshot = row.snapshot;
  if (!snapshot) return { blocked: false, reasons: [] };
  const reasons: string[] = [];
  if (snapshot.reachableCount > policy.maxReachableRecipients) {
    reasons.push(`${snapshot.reachableCount} eligible recipients exceeds ${policy.maxReachableRecipients}.`);
  }
  if (snapshot.memberCount > policy.maxSnapshotMembers) {
    reasons.push(`${snapshot.memberCount} frozen recipients exceeds ${policy.maxSnapshotMembers}.`);
  }
  const estimatedSpend = nonNegativeNumber(recordValue(snapshot.sourceSummary).matchedTotalSpent, 0);
  if (policy.maxEstimatedAudienceSpendUsd > 0 && estimatedSpend > policy.maxEstimatedAudienceSpendUsd) {
    reasons.push(`Estimated audience spend $${Math.round(estimatedSpend)} exceeds $${Math.round(policy.maxEstimatedAudienceSpendUsd)}.`);
  }
  return { blocked: reasons.length > 0, reasons };
}

function approvalPolicyFromSettings(settings?: Record<string, unknown>): ApprovalPolicy {
  const policy = recordValue(settings?.approvalPolicy);
  return {
    maxReachableRecipients: positiveInt(policy.maxReachableRecipients, 1000),
    maxSnapshotMembers: positiveInt(policy.maxSnapshotMembers, 1500),
    maxEstimatedAudienceSpendUsd: nonNegativeNumber(policy.maxEstimatedAudienceSpendUsd, 0),
  };
}

function approvalPolicyFromDraft(draft: ApprovalPolicyDraft): MailMarketingSettingsInput['approvalPolicy'] {
  return {
    maxReachableRecipients: positiveInt(draft.maxReachableRecipients, 1000),
    maxSnapshotMembers: positiveInt(draft.maxSnapshotMembers, 1500),
    maxEstimatedAudienceSpendUsd: nonNegativeNumber(draft.maxEstimatedAudienceSpendUsd, 0),
  };
}

function toApprovalPolicyDraft(policy: ApprovalPolicy): ApprovalPolicyDraft {
  return {
    maxReachableRecipients: String(policy.maxReachableRecipients),
    maxSnapshotMembers: String(policy.maxSnapshotMembers),
    maxEstimatedAudienceSpendUsd: String(policy.maxEstimatedAudienceSpendUsd),
  };
}

function quietHoursFromSettings(settings: Record<string, unknown>): MailMarketingSettingsInput['quietHours'] {
  const quietHours = recordValue(settings.quietHours);
  return {
    enabled: Boolean(quietHours.enabled),
    start: typeof quietHours.start === 'string' ? quietHours.start : '21:00',
    end: typeof quietHours.end === 'string' ? quietHours.end : '08:00',
    timezone: typeof quietHours.timezone === 'string' ? quietHours.timezone : 'America/Chicago',
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function businessCampaignStatus(value: string) {
  const labels: Record<string, string> = {
    draft: 'Draft',
    needs_approval: 'Needs approval',
    approved: 'Approved',
    scheduled: 'Scheduled',
    sending: 'Recording proof',
    queued_disabled: 'Proof recorded',
    sent: 'Sent',
    completed: 'Completed',
    paused: 'Paused',
    canceled: 'Canceled',
    archived: 'Archived',
  };
  return labels[value] ?? humanizeKey(value);
}

function campaignStatusTone(value: string) {
  if (['approved', 'scheduled', 'sent', 'completed'].includes(value)) return 'success';
  if (['queued_disabled', 'paused', 'needs_approval'].includes(value)) return 'warn';
  if (['canceled', 'archived'].includes(value)) return 'danger';
  return 'info';
}
