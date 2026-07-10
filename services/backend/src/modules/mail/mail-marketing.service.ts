import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  createMailAudienceSnapshotSchema,
  mailAudienceFilterSchema,
  mailAudienceSnapshotMemberQuerySchema,
  mailAudienceSnapshotQuerySchema,
  mailCampaignQuerySchema,
  mailMarketingAnalyticsQuerySchema,
  mailMarketingContactQuerySchema,
  mailMarketingSettingsSchema,
  patchMailAudienceSchema,
  patchMailFlowSchema,
  saveMailCampaignSchema,
  saveMailAudienceSchema,
  saveMailFlowSchema,
  saveMailFlowWebhookDestinationSchema,
  simulateMailFlowSchema,
  upsertMailContactConsentSchema,
  validateMailFlowSchema,
  type MailFlowWebhookDestinationDto,
  type CreateMailAudienceSnapshotInput,
  type MailAudienceSnapshotMemberQuery,
  type MailAudienceSnapshotQuery,
  type MailAudienceFilterInput,
  type MailCampaignQuery,
  type MailCampaignStatus,
  type MailFlowSimulationResponse,
  type MailFlowValidationResponse,
  type MailFlowVersionSelector,
  type MailMarketingAnalyticsQuery,
  type MailMarketingContactQuery,
  type MailMarketingSettingsInput,
  type MailProviderMode,
  type PatchMailAudienceInput,
  type PatchMailFlowInput,
  type ApproveMailFlowWebhookDestinationInput,
  type SaveMailCampaignInput,
  type SaveMailAudienceInput,
  type SaveMailFlowInput,
  type SaveMailFlowWebhookDestinationInput,
  type SimulateMailFlowInput,
  type CreateTaskAxis,
  type ServiceRequestPriority,
  type PatchMailFlowWebhookDestinationInput,
  type UpsertMailContactConsentInput,
  type ValidateMailFlowInput,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { algorithmCompare, algorithmScore, algorithmScoreBand, algorithmVisible } from '../rules/algorithm-runtime.js';
import { RulesService } from '../rules/rules.service.js';
import {
  MAIL_MARKETING_CAMPAIGN_JOB,
  MAIL_MARKETING_CAMPAIGN_QUEUE,
  MAIL_MARKETING_FLOW_JOB,
  MAIL_MARKETING_FLOW_QUEUE,
} from '../../shared/queue.module.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';
import {
  ensureApiV1BaseUrl,
  mailPreferenceHtmlPage,
  marketingComplianceLinks,
  resolveMailPreferenceSecret,
  resolveMailPreferenceTtlSeconds,
  verifyMailPreferenceToken,
  type MarketingComplianceContext,
  type MailPreferenceTokenPayload,
} from './mail-compliance.js';
import { MailMarketingRepository } from './mail-marketing.repository.js';
import { MailService } from './mail.service.js';

type AudienceContactRecord = Awaited<ReturnType<MailMarketingRepository['listAudienceContacts']>>[number];
type AudienceCustomerRecord = Awaited<ReturnType<MailMarketingRepository['customersForAudience']>>[number];
type AudienceAssignmentRecord = Awaited<ReturnType<MailMarketingRepository['customerAssignmentsForAudience']>>[number];
type AudienceOrderRecord = Awaited<ReturnType<MailMarketingRepository['commerceOrdersForAudience']>>[number];
type AnalyticsDeliveryRecord = Awaited<ReturnType<MailMarketingRepository['analyticsDeliveries']>>[number];
type AnalyticsCampaignRecord = Awaited<ReturnType<MailMarketingRepository['analyticsCampaigns']>>[number];
type AnalyticsTemplateRecord = Awaited<ReturnType<MailMarketingRepository['analyticsTemplates']>>[number];
type AnalyticsAudienceRecord = Awaited<ReturnType<MailMarketingRepository['analyticsAudiences']>>[number];
type AnalyticsFlowRecord = Awaited<ReturnType<MailMarketingRepository['analyticsFlows']>>[number];
type AnalyticsFlowActionLogRecord = Awaited<ReturnType<MailMarketingRepository['analyticsFlowActionLogs']>>[number];
type AnalyticsSuppressionRecord = Awaited<ReturnType<MailMarketingRepository['analyticsActiveSuppressions']>>[number];
type AnalyticsSnapshotRecord = Awaited<ReturnType<MailMarketingRepository['analyticsRecentSnapshots']>>[number];
type AnalyticsProviderEventRecord = Awaited<ReturnType<MailMarketingRepository['analyticsProviderEvents']>>[number];
type AnalyticsOrderRecord = Awaited<ReturnType<MailMarketingRepository['analyticsOrdersForCustomers']>>[number];
type MailFlowRecord = Awaited<ReturnType<MailMarketingRepository['requireFlow']>>;
type WebhookDestinationRecord = NonNullable<Awaited<ReturnType<MailMarketingRepository['findWebhookDestination']>>>;

interface AudienceContactContext {
  customer: AudienceCustomerRecord | null;
  tags: string[];
  localSegmentIds: Set<string>;
  localSegmentNames: Set<string>;
  shopifySegmentIds: Set<string>;
  shopifySegmentNames: Set<string>;
  manualListIds: Set<string>;
  manualListNames: Set<string>;
  assignments: AudienceAssignmentRecord[];
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  orderLineTokens: string[];
}

interface AnalyticsBundleView {
  range: { start: Date; end: Date; days: number };
  deliveries: AnalyticsDeliveryRecord[];
  campaigns: AnalyticsCampaignRecord[];
  templates: AnalyticsTemplateRecord[];
  audiences: AnalyticsAudienceRecord[];
  flows: AnalyticsFlowRecord[];
  flowLogs: AnalyticsFlowActionLogRecord[];
  suppressions: AnalyticsSuppressionRecord[];
  snapshots: AnalyticsSnapshotRecord[];
  providerEvents: AnalyticsProviderEventRecord[];
  attribution: {
    totalOrders: number;
    totalRevenue: number;
    byCampaignId: Map<string, { orders: number; revenue: number }>;
    byTemplateId: Map<string, { orders: number; revenue: number }>;
    rows: AnalyticsAttributionRow[];
  };
}

interface AnalyticsAttributionRow {
  order: AnalyticsOrderRecord;
  delivery: AnalyticsDeliveryRecord;
  campaignId: string | null;
  templateId: string | null;
  revenue: number;
}

@Injectable()
export class MailMarketingService {
  constructor(
    private readonly repository: MailMarketingRepository,
    private readonly templates: EmailTemplatesRepository,
    private readonly mail: MailService,
    private readonly logger: AppLogger,
    private readonly tenantContext: TenantContextService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => RulesService)) private readonly rules: RulesService,
    @Inject(MAIL_MARKETING_FLOW_QUEUE) private readonly flowQueue: Queue | null,
    @Inject(MAIL_MARKETING_CAMPAIGN_QUEUE) private readonly campaignQueue: Queue | null,
  ) {}

  async overview() {
    await this.repository.importContactsFromCustomers(750);
    const [[contacts, sendableContacts], audiences, flows, campaigns, templates, recentEvents, settings, provider] = await Promise.all([
      this.repository.contactCounts(),
      this.repository.listAudiences(),
      this.repository.listFlows(),
      this.repository.listCampaigns({ limit: 200 }),
      this.templates.countTemplates(),
      this.repository.recentEvents(10),
      this.repository.ensureSettings(),
      this.mailProviderSummary(),
    ]);
    return {
      sendingEnabled: settings.sendingEnabled && provider.mode === 'live',
      counts: {
        contacts,
        sendableContacts,
        audiences: audiences.filter((audience) => !audience.isArchived).length,
        campaigns: campaigns.filter((campaign) => campaign.status !== 'archived').length,
        templates,
        flows: flows.filter((flow) => flow.status !== 'archived').length,
        publishedFlows: flows.filter((flow) => flow.status === 'published').length,
      },
      provider,
      recentEvents: recentEvents.map(toEventDto),
    };
  }

  async analyticsOverview(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const [bundle, provider] = await Promise.all([
      this.analyticsBundle(parsed),
      this.mailProviderSummary(),
    ]);
    const topCampaigns = campaignAnalyticsRows(bundle).slice(0, parsed.limit);
    const topTemplates = templateAnalyticsRows(bundle).slice(0, parsed.limit);
    const topAudiences = audienceAnalyticsRows(bundle).slice(0, parsed.limit);
    const topFlows = flowAnalyticsRows(bundle).slice(0, parsed.limit);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      total: topCampaigns.length,
      rows: topCampaigns,
      providerMode: provider.mode,
      attributionMode: 'customer_id_only_order_after_delivery' as const,
      totals: {
        deliveries: bundle.deliveries.length,
        queuedDisabled: countDeliveries(bundle.deliveries, 'queued_disabled'),
        queued: countDeliveries(bundle.deliveries, 'queued'),
        sent: countDeliveries(bundle.deliveries, 'sent'),
        failed: countDeliveries(bundle.deliveries, 'failed'),
        skipped: countDeliveries(bundle.deliveries, 'skipped'),
        activeSuppressions: bundle.suppressions.length,
        campaigns: bundle.campaigns.length,
        audiences: bundle.audiences.length,
        snapshots: bundle.snapshots.length,
        flows: bundle.flows.length,
        flowActions: bundle.flowLogs.length,
        providerEvents: bundle.providerEvents.length,
        deliveredEvents: countProviderEvents(bundle.providerEvents, 'email.delivered'),
        openedEvents: countProviderEvents(bundle.providerEvents, 'email.opened'),
        clickedEvents: countProviderEvents(bundle.providerEvents, 'email.clicked'),
        bouncedEvents: countProviderEvents(bundle.providerEvents, 'email.bounced'),
        complainedEvents: countProviderEvents(bundle.providerEvents, 'email.complained'),
        conservativeOrders: bundle.attribution.totalOrders,
        conservativeRevenue: bundle.attribution.totalRevenue,
      },
      statusBreakdown: breakdown(bundle.deliveries, (delivery) => delivery.status),
      categoryBreakdown: breakdown(bundle.deliveries, (delivery) => delivery.category || 'uncategorized'),
      daily: dailyAnalyticsSeries(bundle),
      topCampaigns,
      topTemplates,
      topAudiences,
      topFlows,
      proofNotes: analyticsProofNotes(),
    };
  }

  async analyticsCampaigns(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const bundle = await this.analyticsBundle(parsed);
    const rows = campaignAnalyticsRows(bundle).slice(0, parsed.limit);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      total: rows.length,
      rows,
      proofNotes: analyticsProofNotes(),
    };
  }

  async analyticsTemplates(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const bundle = await this.analyticsBundle(parsed);
    const rows = templateAnalyticsRows(bundle).slice(0, parsed.limit);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      total: rows.length,
      rows,
      proofNotes: analyticsProofNotes(),
    };
  }

  async analyticsAudiences(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const bundle = await this.analyticsBundle(parsed);
    const rows = audienceAnalyticsRows(bundle).slice(0, parsed.limit);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      total: rows.length,
      rows,
      proofNotes: analyticsProofNotes(),
    };
  }

  async analyticsFlows(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const bundle = await this.analyticsBundle(parsed);
    const rows = flowAnalyticsRows(bundle).slice(0, parsed.limit);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      total: rows.length,
      rows,
      proofNotes: analyticsProofNotes(),
    };
  }

  async analyticsFunnel(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const bundle = await this.analyticsBundle(parsed);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      attributionMode: 'customer_id_only_order_after_delivery' as const,
      stages: analyticsFunnelStages(bundle),
      proofNotes: analyticsProofNotes(),
    };
  }

  async analyticsCohorts(query: MailMarketingAnalyticsQuery) {
    const parsed = mailMarketingAnalyticsQuerySchema.parse(query);
    const bundle = await this.analyticsBundle(parsed);
    const rows = analyticsCohortRows(bundle).slice(0, parsed.limit);
    return {
      range: toAnalyticsRangeDto(bundle.range),
      attributionMode: 'customer_id_only_order_after_delivery' as const,
      total: rows.length,
      rows,
      proofNotes: analyticsProofNotes(),
    };
  }

  private async analyticsBundle(query: MailMarketingAnalyticsQuery) {
    const range = analyticsRange(query.days);
    const scanLimit = Math.max(query.limit * 250, 5000);
    const [deliveries, campaigns, templates, audiences, flows, flowLogs, suppressions, snapshots, providerEvents] = await Promise.all([
      this.repository.analyticsDeliveries({ since: range.start, until: range.end, campaignId: query.campaignId, templateId: query.templateId, limit: scanLimit }),
      this.repository.analyticsCampaigns({ campaignId: query.campaignId, limit: Math.max(query.limit, 200) }),
      this.repository.analyticsTemplates({ templateId: query.templateId, limit: Math.max(query.limit, 200) }),
      this.repository.analyticsAudiences({ audienceId: query.audienceId, limit: Math.max(query.limit, 200) }),
      this.repository.analyticsFlows({ flowId: query.flowId, limit: Math.max(query.limit, 200) }),
      this.repository.analyticsFlowActionLogs({ since: range.start, until: range.end, flowId: query.flowId, limit: scanLimit }),
      this.repository.analyticsActiveSuppressions({ since: range.start, until: range.end, limit: scanLimit }),
      this.repository.analyticsRecentSnapshots({ since: range.start, until: range.end, limit: scanLimit }),
      this.repository.analyticsProviderEvents({ since: range.start, until: range.end, campaignId: query.campaignId, templateId: query.templateId, limit: scanLimit }),
    ]);
    return {
      range,
      deliveries,
      campaigns,
      templates,
      audiences,
      flows,
      flowLogs,
      suppressions,
      snapshots,
      providerEvents,
      attribution: await this.conservativeAttribution(deliveries, range),
    };
  }

  private async conservativeAttribution(deliveries: AnalyticsDeliveryRecord[], range: { start: Date; end: Date }) {
    const customerIds = uniqueStrings(deliveries.map((delivery) => textValue(asRecord(delivery.metadata).customerId)));
    const orders = await this.repository.analyticsOrdersForCustomers({
      customerIds,
      since: range.start,
      until: range.end,
      limit: Math.max(customerIds.length * 20, 5000),
    });
    const deliveriesByCustomer = groupBy(
      deliveries.filter((delivery) => textValue(asRecord(delivery.metadata).customerId)),
      (delivery) => textValue(asRecord(delivery.metadata).customerId),
    );
    const byCampaignId = new Map<string, { orders: number; revenue: number }>();
    const byTemplateId = new Map<string, { orders: number; revenue: number }>();
    const rows: AnalyticsAttributionRow[] = [];
    let totalOrders = 0;
    let totalRevenue = 0;
    for (const order of orders) {
      const customerId = order.customerId ?? '';
      const orderAt = order.processedAt ?? order.createdAt;
      const candidate = (deliveriesByCustomer.get(customerId) ?? [])
        .filter((delivery) => delivery.createdAt <= orderAt)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      if (!candidate) continue;
      const revenue = decimalToNumber(order.totalPrice);
      totalOrders += 1;
      totalRevenue += revenue;
      const campaignId = textValue(asRecord(candidate.metadata).campaignId);
      rows.push({
        order,
        delivery: candidate,
        campaignId: campaignId || null,
        templateId: candidate.templateId ?? null,
        revenue,
      });
      if (campaignId) incrementAttribution(byCampaignId, campaignId, revenue);
      if (candidate.templateId) incrementAttribution(byTemplateId, candidate.templateId, revenue);
    }
    return { totalOrders, totalRevenue, byCampaignId, byTemplateId, rows };
  }

  async settingsBootstrap() {
    const [settings, provider] = await Promise.all([
      this.repository.ensureSettings(),
      this.mailProviderSummary(),
    ]);
    return {
      settings: toSettingsDto(settings, provider.mode),
      provider,
      triggerTypes: [
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
      ],
      nodeTypes: [
        'trigger',
        'delay',
        'condition',
        'send_email',
        'create_follow_up_task',
        'create_sales_task',
        'update_contact_tag',
        'add_to_audience',
        'remove_from_audience',
        'webhook',
        'emit_internal_event',
      ],
    };
  }

  async settings() {
    const [settings, provider] = await Promise.all([
      this.repository.ensureSettings(),
      this.mailProviderSummary(),
    ]);
    return toSettingsDto(settings, provider.mode);
  }

  async updateSettings(input: MailMarketingSettingsInput) {
    const parsed = mailMarketingSettingsSchema.parse(input);
    const current = await this.repository.ensureSettings();
    const metadata = {
      ...asRecord(current.metadata),
      ...asRecord(parsed.metadata),
      approvalPolicy: parsed.approvalPolicy,
    };
    const provider = await this.mailProviderSummary();
    const updated = await this.repository.updateSettings({
      sendingEnabled: parsed.sendingEnabled,
      providerMode: provider.mode,
      defaultSenderName: parsed.defaultSenderName,
      defaultSenderEmail: parsed.defaultSenderEmail ?? null,
      quietHours: parsed.quietHours as Prisma.InputJsonValue,
      dailySendCap: parsed.dailySendCap,
      metadata: metadata as Prisma.InputJsonValue,
    });
    this.logger.log('mail_marketing', 'settings_update', 'Mail Marketing settings updated', {
      sending_enabled: updated.sendingEnabled && provider.mode === 'live',
      provider_mode: provider.mode,
      approval_policy: parsed.approvalPolicy,
    });
    return toSettingsDto(updated, provider.mode);
  }

  async webhookDestinations() {
    const rows = await this.repository.listWebhookDestinations();
    return rows.map(toWebhookDestinationDto);
  }

  async createWebhookDestination(input: SaveMailFlowWebhookDestinationInput) {
    const parsed = validateWebhookDestinationInput(input);
    const secretValueEncrypted = parsed.secretValue ? this.crypto.encrypt(parsed.secretValue) : null;
    if (parsed.authType === 'header' && !secretValueEncrypted) {
      throw new BadRequestException('Header-auth webhook destination requires a secret value.');
    }
    const row = await this.repository.createWebhookDestination({
      name: parsed.name,
      slug: parsed.slug || slug(parsed.name),
      url: parsed.url,
      status: parsed.status,
      authType: parsed.authType,
      secretHeaderName: parsed.secretHeaderName ?? null,
      secretValueEncrypted,
      timeoutMs: parsed.timeoutMs,
      metadata: inputJson(webhookDestinationMetadata(parsed.metadata, parsed.executionMode), {}),
    });
    await this.repository.recordEvent({
      eventType: 'flow.webhook_destination.created',
      status: row.status,
      metadata: {
        destinationId: row.id,
        slug: row.slug,
        status: row.status,
        authType: row.authType,
        executionMode: webhookDestinationExecutionMode(row),
        hasSecret: Boolean(row.secretValueEncrypted),
      },
    });
    return toWebhookDestinationDto(row);
  }

  async updateWebhookDestination(id: string, input: PatchMailFlowWebhookDestinationInput) {
    const existing = await this.repository.findWebhookDestination(id);
    if (!existing) throw new NotFoundException('Webhook destination not found.');
    const merged = validateWebhookDestinationInput({
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      url: input.url ?? existing.url,
      status: input.status ?? (existing.status === 'active' ? 'active' : 'disabled'),
      authType: input.authType ?? (existing.authType === 'header' ? 'header' : 'none'),
      executionMode: input.executionMode ?? webhookDestinationExecutionMode(existing),
      secretHeaderName: input.secretHeaderName !== undefined ? input.secretHeaderName : input.authType === 'none' ? null : existing.secretHeaderName,
      secretValue: typeof input.secretValue === 'string' ? input.secretValue : null,
      clearSecret: input.clearSecret ?? input.authType === 'none',
      timeoutMs: input.timeoutMs ?? existing.timeoutMs,
      metadata: input.metadata ?? asRecord(existing.metadata),
    });
    const nextHasSecret = Boolean(existing.secretValueEncrypted && !merged.clearSecret) || Boolean(merged.secretValue);
    if (merged.authType === 'header' && !nextHasSecret) {
      throw new BadRequestException('Header-auth webhook destination requires a stored secret value.');
    }
    const materialLiveApprovalChange = input.url !== undefined || input.status !== undefined || input.executionMode !== undefined;
    const nextMetadata = webhookDestinationMetadata(
      materialLiveApprovalChange
        ? clearWebhookDestinationLiveApproval(merged.metadata, 'destination_changed')
        : merged.metadata,
      merged.executionMode,
    );
    const row = await this.repository.updateWebhookDestination(id, {
      ...(input.name !== undefined && { name: merged.name }),
      ...(input.slug !== undefined && { slug: merged.slug || slug(merged.name) }),
      ...(input.url !== undefined && { url: merged.url }),
      ...(input.status !== undefined && { status: merged.status }),
      ...(input.authType !== undefined && { authType: merged.authType }),
      ...((input.secretHeaderName !== undefined || input.authType === 'none') && { secretHeaderName: merged.secretHeaderName ?? null }),
      ...((input.clearSecret !== undefined || input.authType === 'none') && { clearSecret: merged.clearSecret }),
      ...(typeof input.secretValue === 'string' && { secretValueEncrypted: this.crypto.encrypt(merged.secretValue ?? input.secretValue) }),
      ...(input.timeoutMs !== undefined && { timeoutMs: merged.timeoutMs }),
      ...((input.metadata !== undefined || input.executionMode !== undefined || materialLiveApprovalChange) && { metadata: inputJson(nextMetadata, {}) }),
    });
    if (!row) throw new NotFoundException('Webhook destination not found.');
    await this.repository.recordEvent({
      eventType: 'flow.webhook_destination.updated',
      status: row.status,
      metadata: {
        destinationId: row.id,
        slug: row.slug,
        status: row.status,
        authType: row.authType,
        executionMode: webhookDestinationExecutionMode(row),
        hasSecret: Boolean(row.secretValueEncrypted),
      },
    });
    return toWebhookDestinationDto(row);
  }

  async approveWebhookDestinationLive(id: string, input: ApproveMailFlowWebhookDestinationInput) {
    const existing = await this.repository.findWebhookDestination(id);
    if (!existing) throw new NotFoundException('Webhook destination not found.');
    const allowlistedUrl = input.allowlistedUrl.trim();
    if (allowlistedUrl !== existing.url) {
      throw new BadRequestException('Live approval must match the destination URL exactly.');
    }
    if (existing.status !== 'active') {
      throw new BadRequestException('Only active webhook destinations can be approved for live outbound execution.');
    }
    if (webhookDestinationExecutionMode(existing) !== 'live_requested') {
      throw new BadRequestException('Destination must request live outbound execution before approval.');
    }
    const urlError = webhookDestinationUrlError(existing.url);
    if (urlError) throw new BadRequestException(urlError);
    const approvedAt = new Date().toISOString();
    const metadata = {
      ...asRecord(existing.metadata),
      executionMode: 'live_requested',
      liveApproved: true,
      liveApprovedAt: approvedAt,
      liveApprovedByMemberId: this.repository.currentMemberId(),
      liveAllowlistedUrl: allowlistedUrl,
      liveRevokedAt: null,
      liveRevokedByMemberId: null,
      liveRevokedReason: null,
    };
    const row = await this.repository.updateWebhookDestination(id, {
      metadata: inputJson(metadata, {}),
    });
    if (!row) throw new NotFoundException('Webhook destination not found.');
    await this.repository.recordEvent({
      eventType: 'flow.webhook_destination.live_approved',
      status: 'approved',
      metadata: {
        destinationId: row.id,
        slug: row.slug,
        approvedAt,
        approvedByMemberId: this.repository.currentMemberId(),
        urlHash: createHash('sha256').update(row.url).digest('hex'),
      },
    });
    return toWebhookDestinationDto(row);
  }

  async revokeWebhookDestinationLive(id: string) {
    const existing = await this.repository.findWebhookDestination(id);
    if (!existing) throw new NotFoundException('Webhook destination not found.');
    const revokedAt = new Date().toISOString();
    const metadata = {
      ...asRecord(existing.metadata),
      liveApproved: false,
      liveApprovedAt: null,
      liveApprovedByMemberId: null,
      liveAllowlistedUrl: null,
      liveRevokedAt: revokedAt,
      liveRevokedByMemberId: this.repository.currentMemberId(),
      liveRevokedReason: 'manual_revoke',
    };
    const row = await this.repository.updateWebhookDestination(id, {
      metadata: inputJson(metadata, {}),
    });
    if (!row) throw new NotFoundException('Webhook destination not found.');
    await this.repository.recordEvent({
      eventType: 'flow.webhook_destination.live_revoked',
      status: 'revoked',
      metadata: {
        destinationId: row.id,
        slug: row.slug,
        revokedAt,
        revokedByMemberId: this.repository.currentMemberId(),
      },
    });
    return toWebhookDestinationDto(row);
  }

  async contacts(query: MailMarketingContactQuery) {
    await this.repository.importContactsFromCustomers(750);
    const parsed = mailMarketingContactQuerySchema.parse(query);
    const rows = await this.repository.listContacts(parsed);
    return rows.map(toContactDto);
  }

  async contact(contactId: string) {
    await this.repository.importContactsFromCustomers(750);
    const contact = await this.repository.findContactDetail(contactId);
    if (!contact) throw new NotFoundException('Mail contact not found');
    const [customer, customerUsers, recentDeliveries, recentEvents] = await Promise.all([
      contact.customerId ? this.repository.customerSummary(contact.customerId) : Promise.resolve(null),
      contact.customerId ? this.repository.customerUsersForContact(contact.customerId) : Promise.resolve([]),
      this.repository.recentDeliveriesForContact(contact),
      this.repository.recentEventsForContact(contact),
    ]);
    return toContactDetailDto(contact, customer, customerUsers, recentDeliveries, recentEvents);
  }

  async updateContactConsent(contactId: string, input: UpsertMailContactConsentInput) {
    const parsed = upsertMailContactConsentSchema.parse(input);
    const consent = await this.repository.recordContactConsent(contactId, {
      state: parsed.state,
      channel: parsed.channel,
      category: parsed.category,
      source: parsed.source,
      sourceDetail: parsed.sourceDetail ?? null,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    });
    await this.repository.recordEvent({
      eventType: 'contact.consent.updated',
      status: 'recorded',
      metadata: {
        contactId,
        channel: consent.channel,
        category: consent.category,
        state: consent.state,
        source: consent.source,
      },
    });
    return {
      id: consent.id,
      contactId: consent.contactId,
      channel: consent.channel,
      category: consent.category,
      state: consent.state,
      source: consent.source,
      sourceDetail: consent.sourceDetail,
      capturedAt: consent.capturedAt.toISOString(),
      updatedAt: consent.updatedAt.toISOString(),
    };
  }

  async publicPreferenceCenter(token: string | undefined) {
    const payload = this.verifyPreferencePayload(token);
    if (!payload) return invalidMailPreferencePage();
    return this.runWithPreferenceTenant(payload.tenantId, async () => {
      const summary = await this.repository.publicPreferenceSummary(payload);
      const compliance = await this.marketingComplianceContext();
      const urls = marketingComplianceLinks(compliance, {
        email: summary.contact.email,
        contactId: summary.contact.id,
        customerId: summary.contact.customerId,
        source: 'preference_center',
      });
      const state = summary.consent?.state ?? (summary.suppression ? 'unsubscribed' : 'unknown');
      return mailPreferenceHtmlPage({
        title: 'Email preferences',
        heading: 'Email preferences',
        message: state === 'unsubscribed'
          ? 'Marketing email is currently turned off for this address.'
          : 'This page controls marketing email for this address.',
        email: summary.contact.email,
        state,
        actionUrl: state === 'unsubscribed' ? null : urls.unsubscribe,
        actionLabel: state === 'unsubscribed' ? null : 'Unsubscribe from marketing email',
      });
    });
  }

  async publicUnsubscribe(token: string | undefined) {
    const payload = this.verifyPreferencePayload(token);
    if (!payload) return invalidMailPreferencePage();
    return this.runWithPreferenceTenant(payload.tenantId, async () => {
      const result = await this.repository.recordPublicMarketingUnsubscribe({
        email: payload.email,
        contactId: payload.contactId ?? null,
        customerId: payload.customerId ?? null,
        source: payload.source,
        tokenIssuedAt: payload.iat,
        tokenExpiresAt: payload.exp,
      });
      await this.repository.recordEvent({
        eventType: 'contact.unsubscribe.public',
        status: 'recorded',
        metadata: {
          contactId: result.contact.id,
          email: result.contact.normalizedEmail,
          source: payload.source,
          consentId: result.consent.id,
          suppressionId: result.suppression.id,
        },
      });
      const compliance = await this.marketingComplianceContext();
      const urls = marketingComplianceLinks(compliance, {
        email: result.contact.email,
        contactId: result.contact.id,
        customerId: result.contact.customerId,
        source: 'unsubscribe_result',
      });
      return mailPreferenceHtmlPage({
        title: 'Unsubscribed',
        heading: 'You are unsubscribed',
        message: 'Marketing email has been turned off for this address. Order, invoice, and account emails can still be sent when they are required for your account.',
        email: result.contact.email,
        state: 'unsubscribed',
        actionUrl: urls.preferenceCenter,
        actionLabel: 'View email preferences',
      });
    });
  }

  async audiences() {
    const rows = await this.repository.listAudiences();
    return rows.map(toAudienceDto);
  }

  async getAudience(id: string) {
    return toAudienceDto(await this.repository.requireAudience(id));
  }

  async previewAudience(input: SaveMailAudienceInput['filters']) {
    const [resolved, sendingEnabled] = await Promise.all([
      this.resolveAudience(input),
      this.marketingDeliveryEnabled(),
    ]);
    const matched = resolved.contacts;
    return {
      matchedContacts: matched.length,
      sample: matched.slice(0, 10).map(toContactDto),
      sendingEnabled,
      sourceSummary: resolved.sourceSummary,
    };
  }

  private async resolveAudience(input: SaveMailAudienceInput['filters'] | Prisma.JsonValue | undefined) {
    const filters = asAudienceFilters(input as Prisma.JsonValue);
    await this.repository.importContactsFromCustomers(10000);
    await this.repository.ensureManualAudienceContacts(filters.emails);
    const contacts = await this.repository.listAudienceContacts(10000);
    const context = await this.buildAudienceContext(contacts, filters);
    const strategy = await this.rules.algorithmRuntimeDefinition('mail_marketing.audience_eligibility');
    const filterMatched = contacts.filter((contact) => matchesAudience(contact, filters, context.byContactId.get(contact.id)));
    const scoredMatched = filterMatched.map((contact) => {
      const signals = audienceStrategySignals(contact, context.byContactId.get(contact.id));
      const score = algorithmScore(strategy, signals);
      return {
        contact,
        signals,
        score,
        visible: algorithmVisible(strategy, signals),
        band: algorithmScoreBand(strategy, score),
      };
    });
    const matched = scoredMatched
      .filter((entry) => entry.visible)
      .sort((left, right) => algorithmCompare(strategy, left.signals, right.signals))
      .map((entry) => entry.contact);
    const strategyBlocked = scoredMatched.length - matched.length;
    const matchedCustomerKeys = new Set<string>();
    let matchedOrderCount = 0;
    let matchedTotalSpent = 0;
    for (const contact of matched) {
      const contactContext = context.byContactId.get(contact.id);
      const customerKey = contactContext?.customer?.id ?? contact.customerId ?? contact.email.toLowerCase();
      if (matchedCustomerKeys.has(customerKey)) continue;
      matchedCustomerKeys.add(customerKey);
      matchedOrderCount += contactContext?.orderCount ?? 0;
      matchedTotalSpent += contactContext?.totalSpent ?? 0;
    }
    return {
      filters,
      contacts: matched,
      sourceSummary: {
        source: 'customer_mail_graph',
        totalContactsRead: contacts.length,
        matchedContacts: matched.length,
        matchedLocalSegments: uniqueCount(matched.flatMap((contact) => Array.from(context.byContactId.get(contact.id)?.localSegmentIds ?? []))),
        matchedShopifySegments: uniqueCount(matched.flatMap((contact) => Array.from(context.byContactId.get(contact.id)?.shopifySegmentIds ?? []))),
        matchedManualLists: uniqueCount(matched.flatMap((contact) => Array.from(context.byContactId.get(contact.id)?.manualListIds ?? []))),
        matchedCustomers: uniqueCount(matched.map((contact) => context.byContactId.get(contact.id)?.customer?.id ?? contact.customerId).filter(Boolean)),
        matchedOrderCount,
        matchedTotalSpent,
        directEmailCount: filters.emails.length,
        productFilterCount: filters.productSkus.length + filters.productNames.length + filters.productFamilies.length + (filters.productQuery ? 1 : 0),
        includeSuppressed: filters.includeSuppressed,
        includeUnknownConsent: filters.includeUnknownConsent,
        strategySurfaceId: strategy.surfaceId,
        strategyBlocked,
      },
    };
  }

  private async buildAudienceContext(
    contacts: AudienceContactRecord[],
    filters: MailAudienceFilterInput,
  ): Promise<{ byContactId: Map<string, AudienceContactContext> }> {
    const contactCustomerIds = uniqueStrings(contacts.map((contact) => contact.customerId));
    const contactEmails = uniqueStrings(contacts.map((contact) => contact.email));
    const customers = await this.repository.customersForAudience({ customerIds: contactCustomerIds, emails: contactEmails });
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const customersByEmail = new Map(uniqueStrings(customers.map((customer) => customer.email)).map((email) => [
      email.toLowerCase(),
      customers.find((customer) => customer.email?.toLowerCase() === email.toLowerCase())!,
    ]));
    const customerIds = uniqueStrings(contacts.map((contact) => {
      const linkedCustomer = contact.customerId ? customersById.get(contact.customerId) : customersByEmail.get(contact.email.toLowerCase());
      return linkedCustomer?.id ?? contact.customerId;
    }));
    const shopifyCustomerIds = uniqueStrings(customers.map((customer) => customer.shopifyCustomerId));

    const [segmentMemberships, shopifySegmentMemberships, listItems, assignments, orders] = await Promise.all([
      this.repository.segmentMembershipsForAudience(customerIds),
      this.repository.shopifySegmentMembershipsForAudience(shopifyCustomerIds),
      this.repository.customerListItemsForAudience(customerIds),
      this.repository.customerAssignmentsForAudience(customerIds),
      audienceNeedsOrderLines(filters)
        ? this.repository.commerceOrdersForAudience({ customerIds, emails: contactEmails, shopifyCustomerIds })
        : Promise.resolve([]),
    ]);

    const segmentsByCustomerId = groupBy(segmentMemberships, (row) => row.customerId);
    const shopifySegmentsByCustomerId = new Map<string, typeof shopifySegmentMemberships>();
    for (const customer of customers) {
      if (!customer.shopifyCustomerId) continue;
      shopifySegmentsByCustomerId.set(customer.id, shopifySegmentMemberships.filter((row) => row.shopifyCustomerId === customer.shopifyCustomerId));
    }
    const listsByCustomerId = groupBy(listItems, (row) => row.customerId);
    const assignmentsByCustomerId = groupBy(assignments, (row) => row.customerId);
    const ordersByCustomerId = groupBy(orders.filter((order) => Boolean(order.customerId)), (order) => order.customerId || '');
    const ordersByEmail = groupBy(orders.filter((order) => Boolean(order.email)), (order) => (order.email || '').toLowerCase());
    const ordersByShopifyCustomerId = groupBy(orders.filter((order) => Boolean(order.shopifyCustomerId)), (order) => order.shopifyCustomerId || '');

    const byContactId = new Map<string, AudienceContactContext>();
    for (const contact of contacts) {
      const customer = contact.customerId ? customersById.get(contact.customerId) : customersByEmail.get(contact.email.toLowerCase());
      const customerId = customer?.id ?? contact.customerId;
      const customerOrders = uniqueById([
        ...(customerId ? ordersByCustomerId.get(customerId) ?? [] : []),
        ...(ordersByEmail.get(contact.email.toLowerCase()) ?? []),
        ...(customer?.shopifyCustomerId ? ordersByShopifyCustomerId.get(customer.shopifyCustomerId) ?? [] : []),
      ]);
      const customerSegments = customerId ? segmentsByCustomerId.get(customerId) ?? [] : [];
      const customerShopifySegments = customerId ? shopifySegmentsByCustomerId.get(customerId) ?? [] : [];
      const customerLists = customerId ? listsByCustomerId.get(customerId) ?? [] : [];
      const customerAssignments = customerId ? assignmentsByCustomerId.get(customerId) ?? [] : [];
      const orderLineTokens = customerOrders.flatMap((order) => extractOrderLineTokens(order.lineItems));
      const fallbackTotalSpent = customerOrders.reduce((sum, order) => sum + decimalToNumber(order.totalPrice), 0);
      const fallbackLastOrderAt = latestDate(customerOrders.map((order) => order.processedAt ?? order.createdAt));
      byContactId.set(contact.id, {
        customer: customer ?? null,
        tags: uniqueStrings([...jsonStringArray(contact.tags), ...(customer?.tags ?? [])]),
        localSegmentIds: new Set(customerSegments.map((row) => row.segmentId)),
        localSegmentNames: new Set(customerSegments.map((row) => row.segment.name)),
        shopifySegmentIds: new Set([
          ...customerShopifySegments.map((row) => row.shopifySegmentId),
          ...customerSegments.map((row) => row.shopifySegmentRef).filter((value): value is string => Boolean(value)),
        ]),
        shopifySegmentNames: new Set(customerShopifySegments.map((row) => row.segment.name)),
        manualListIds: new Set(customerLists.map((row) => row.listId)),
        manualListNames: new Set(customerLists.map((row) => row.list.name)),
        assignments: customerAssignments,
        orderCount: customer?.ordersCount ?? customerOrders.length,
        totalSpent: customer ? decimalToNumber(customer.totalSpent) : fallbackTotalSpent,
        lastOrderAt: customer?.lastOrderAt ?? fallbackLastOrderAt,
        orderLineTokens,
      });
    }
    return { byContactId };
  }

  async createAudience(input: SaveMailAudienceInput) {
    const parsed = saveMailAudienceSchema.parse(input);
    const preview = await this.previewAudience(parsed.filters);
    const audience = await this.repository.createAudience({
      name: parsed.name,
      slug: parsed.slug ?? slug(parsed.name),
      description: parsed.description ?? null,
      filters: parsed.filters as Prisma.InputJsonValue,
      contactCount: preview.matchedContacts,
      isArchived: parsed.isArchived,
    });
    await this.repository.recordEvent({
      eventType: 'audience.created',
      metadata: { audienceId: audience.id, contactCount: audience.contactCount },
    });
    this.logger.log('mail_marketing', 'audience_create', 'Mail audience created', { audience_id: audience.id });
    return toAudienceDto(audience);
  }

  async updateAudience(id: string, input: PatchMailAudienceInput) {
    const parsed = patchMailAudienceSchema.parse(input);
    const preview = parsed.filters ? await this.previewAudience(parsed.filters) : null;
    const audience = await this.repository.updateAudience(id, {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.slug !== undefined && { slug: parsed.slug || undefined }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.filters !== undefined && { filters: parsed.filters as Prisma.InputJsonValue }),
      ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
      ...(preview && { contactCount: preview.matchedContacts }),
    });
    await this.repository.recordEvent({
      eventType: 'audience.updated',
      metadata: { audienceId: audience.id, contactCount: audience.contactCount },
    });
    return toAudienceDto(audience);
  }

  async audienceSnapshots(audienceId: string, query: MailAudienceSnapshotQuery) {
    await this.repository.requireAudience(audienceId);
    const parsed = mailAudienceSnapshotQuerySchema.parse(query);
    const rows = await this.repository.listAudienceSnapshots(audienceId, parsed.limit);
    return rows.map(toSnapshotDto);
  }

  async createAudienceSnapshot(audienceId: string, input: CreateMailAudienceSnapshotInput) {
    const parsed = createMailAudienceSnapshotSchema.parse(input);
    const audience = await this.repository.requireAudience(audienceId);
    const resolved = await this.resolveAudience(audience.filters);
    const matched = resolved.contacts;
    const snapshot = await this.repository.createAudienceSnapshot({
      audienceId: audience.id,
      name: parsed.name ?? `${audience.name} snapshot`,
      filters: audience.filters as Prisma.InputJsonValue,
      contacts: matched,
      sourceSummary: { ...resolved.sourceSummary, audienceId: audience.id },
    });
    await this.repository.recordEvent({
      eventType: 'audience.snapshot_created',
      metadata: { audienceId: audience.id, snapshotId: snapshot?.id, memberCount: snapshot?.memberCount ?? 0 },
    });
    return toSnapshotDto(snapshot!);
  }

  async audienceSnapshotMembers(snapshotId: string, query: MailAudienceSnapshotMemberQuery) {
    const parsed = mailAudienceSnapshotMemberQuerySchema.parse(query);
    const snapshot = await this.repository.requireAudienceSnapshot(snapshotId);
    const members = await this.repository.snapshotMembersForView(snapshot.id, {
      limit: parsed.limit,
      search: parsed.search,
    });
    const sendingEnabled = await this.marketingDeliveryEnabled();
    return {
      snapshot: toSnapshotDto(snapshot),
      members: members.map(toSnapshotMemberDto),
      totalReturned: members.length,
      sendingEnabled,
    };
  }

  async audienceSnapshotDiff(snapshotId: string, query: MailAudienceSnapshotMemberQuery) {
    const parsed = mailAudienceSnapshotMemberQuerySchema.parse(query);
    const snapshot = await this.repository.requireAudienceSnapshot(snapshotId);
    if (!snapshot.audienceId) throw new BadRequestException('Snapshot is not linked to an active audience');
    const audience = await this.repository.requireAudience(snapshot.audienceId);
    const currentContacts = (await this.resolveAudience(audience.filters)).contacts;
    const snapshotMembers = await this.repository.snapshotMembers(snapshot.id, 5000);
    const snapshotMap = new Map(snapshotMembers.map((member) => [audienceMemberKey(member.contactId, member.email), member]));
    const currentMap = new Map(currentContacts.map((contact) => [audienceMemberKey(contact.id, contact.email), contact]));

    const added = currentContacts.filter((contact) => !snapshotMap.has(audienceMemberKey(contact.id, contact.email)));
    const removed = snapshotMembers.filter((member) => !currentMap.has(audienceMemberKey(member.contactId, member.email)));
    const stayed = currentContacts.filter((contact) => snapshotMap.has(audienceMemberKey(contact.id, contact.email))).length;
    const search = parsed.search?.trim().toLowerCase();
    const filteredAdded = search
      ? added.filter((contact) => `${contact.email} ${contact.name ?? ''}`.toLowerCase().includes(search))
      : added;
    const filteredRemoved = search
      ? removed.filter((member) => `${member.email} ${member.contact?.name ?? ''}`.toLowerCase().includes(search))
      : removed;

    const sendingEnabled = await this.marketingDeliveryEnabled();
    return {
      snapshot: toSnapshotDto(snapshot),
      current: {
        matchedContacts: currentContacts.length,
        reachableCount: currentContacts.filter((contact) => contact.isSendable).length,
      },
      diff: {
        added: added.length,
        removed: removed.length,
        stayed,
        driftDetected: added.length > 0 || removed.length > 0,
      },
      samples: {
        added: filteredAdded.slice(0, parsed.limit).map(toContactDto),
        removed: filteredRemoved.slice(0, parsed.limit).map(toSnapshotMemberDto),
      },
      sendingEnabled,
    };
  }

  async campaigns(query: MailCampaignQuery) {
    const parsed = mailCampaignQuerySchema.parse(query);
    const rows = await this.repository.listCampaigns(parsed);
    const reconciled = await Promise.all(rows.map((row) => row.status === 'sending'
      ? this.repository.reconcileCampaignDeliveryStats(row.id)
      : row));
    return reconciled.map(toCampaignDto);
  }

  async createCampaign(input: SaveMailCampaignInput) {
    const parsed = saveMailCampaignSchema.parse(input);
    await this.repository.requireAudience(parsed.audienceId);
    const snapshot = await this.repository.findAudienceSnapshot(parsed.snapshotId);
    if (!snapshot || snapshot.audienceId !== parsed.audienceId) {
      throw new BadRequestException('Freeze and select an audience snapshot before creating a campaign.');
    }
    const { revision } = await this.requireCampaignTemplateRevision(parsed.templateId, parsed.templateVersionId ?? null);
    const campaign = await this.repository.createCampaign({
      name: parsed.name,
      description: parsed.description ?? null,
      audienceId: parsed.audienceId,
      snapshotId: parsed.snapshotId,
      templateId: parsed.templateId,
      templateVersionId: revision.id,
      subjectOverride: parsed.subjectOverride ?? null,
      senderName: parsed.senderName ?? null,
      replyTo: parsed.replyTo ?? null,
      scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
      createdByMemberId: this.repository.currentMemberId(),
      metadata: parsed.metadata as Prisma.InputJsonValue,
    });
    await this.repository.recordEvent({
      eventType: 'campaign.created',
      metadata: { campaignId: campaign.id, audienceId: campaign.audienceId, templateId: campaign.templateId, templateVersionId: revision.id },
    });
    return toCampaignDto(campaign);
  }

  async approveCampaign(campaignId: string) {
    const campaign = await this.repository.requireCampaign(campaignId);
    if (['queued_disabled', 'sent', 'completed', 'canceled', 'archived'].includes(campaign.status)) {
      throw new BadRequestException(`Campaign cannot be approved from ${campaign.status} state.`);
    }
    if (!campaign.templateVersionId) throw new BadRequestException('Campaign must pin an approved template revision before approval.');
    if (!campaign.snapshotId) throw new BadRequestException('Campaign must have a frozen audience snapshot before approval.');
    if (campaign.scheduledAt && !this.campaignQueue) {
      throw new BadRequestException('Scheduled campaign delivery requires the managed Redis queue to be configured before approval.');
    }
    const settings = await this.repository.ensureSettings();
    const approvalPolicy = approvalPolicyFromMetadata(settings.metadata);
    const thresholdDecision = campaignApprovalThresholdDecision(campaign, approvalPolicy);
    if (thresholdDecision.blocked) {
      await this.repository.recordEvent({
        eventType: 'campaign.approval_blocked_threshold',
        status: 'blocked',
        metadata: {
          campaignId,
          approvalPolicy,
          metrics: thresholdDecision.metrics,
          reasons: thresholdDecision.reasons,
        },
      });
      throw new BadRequestException(`Campaign approval blocked by recipient policy: ${thresholdDecision.reasons.join(' ')}`);
    }
    const updated = await this.repository.approveCampaign(campaignId, this.repository.currentMemberId());
    if (updated.status === 'scheduled' && updated.scheduledAt) {
      await this.enqueueScheduledCampaign(updated);
    }
    await this.repository.recordEvent({
      eventType: 'campaign.approved',
      metadata: {
        campaignId,
        status: updated.status,
        templateVersionId: updated.templateVersionId,
        approvalPolicy,
        approvalMetrics: thresholdDecision.metrics,
      },
    });
    return toCampaignDto(updated);
  }

  async processScheduledCampaign(campaignId: string, jobScheduledAt: string | null) {
    const campaign = await this.repository.requireCampaign(campaignId);
    if (campaign.status !== 'scheduled') {
      await this.repository.recordEvent({
        eventType: 'campaign.schedule_skipped',
        status: 'skipped',
        metadata: { campaignId, reason: `status_${campaign.status}`, jobScheduledAt },
      });
      return toCampaignDto(campaign);
    }
    if (!campaign.scheduledAt) {
      await this.repository.recordEvent({
        eventType: 'campaign.schedule_skipped',
        status: 'skipped',
        metadata: { campaignId, reason: 'missing_scheduled_at', jobScheduledAt },
      });
      return toCampaignDto(campaign);
    }
    const now = Date.now();
    const dueAt = campaign.scheduledAt.getTime();
    if (dueAt > now + 1000) {
      await this.enqueueScheduledCampaign(campaign);
      await this.repository.recordEvent({
        eventType: 'campaign.schedule_requeued',
        status: 'queued',
        metadata: { campaignId, scheduledAt: campaign.scheduledAt.toISOString(), reason: 'job_arrived_early' },
      });
      return toCampaignDto(campaign);
    }
    const mailSettings = await this.mail.loadMailCenterSettings();
    const quietRetryMs = computeQuietHoursDelayMs(mailSettings.categoryMarketing.quietHours);
    if (quietRetryMs > 0) {
      await this.enqueueScheduledCampaign(campaign, quietRetryMs);
      await this.repository.recordEvent({
        eventType: 'campaign.schedule_requeued_quiet_hours',
        status: 'queued',
        metadata: {
          campaignId,
          scheduledAt: campaign.scheduledAt.toISOString(),
          retryMinutes: Math.round(quietRetryMs / 60000),
          quietHours: mailSettings.categoryMarketing.quietHours,
        },
      });
      return toCampaignDto(campaign);
    }
    await this.repository.recordEvent({
      eventType: 'campaign.schedule_due',
      status: 'running',
      metadata: { campaignId, scheduledAt: campaign.scheduledAt.toISOString(), jobScheduledAt },
    });
    return this.queueCampaign(campaignId);
  }

  async pauseCampaign(campaignId: string) {
    const campaign = await this.repository.requireCampaign(campaignId);
    if (['queued_disabled', 'sent', 'completed', 'canceled', 'archived'].includes(campaign.status)) {
      throw new BadRequestException(`Campaign cannot be paused from ${campaign.status} state.`);
    }
    const updated = await this.repository.pauseCampaign(campaignId);
    await this.repository.recordEvent({ eventType: 'campaign.paused', metadata: { campaignId } });
    return toCampaignDto(updated);
  }

  async cancelCampaign(campaignId: string) {
    const campaign = await this.repository.requireCampaign(campaignId);
    if (['queued_disabled', 'sent', 'completed', 'canceled', 'archived'].includes(campaign.status)) {
      throw new BadRequestException(`Campaign cannot be canceled from ${campaign.status} state.`);
    }
    const updated = await this.repository.cancelCampaign(campaignId);
    await this.repository.recordEvent({ eventType: 'campaign.canceled', metadata: { campaignId } });
    return toCampaignDto(updated);
  }

  async queueCampaign(campaignId: string) {
    const campaign = await this.repository.requireCampaign(campaignId);
    if (!['approved', 'scheduled'].includes(campaign.status)) {
      throw new BadRequestException('Approve the campaign before recording delivery proof.');
    }
    if (!campaign.audienceId) throw new BadRequestException('Campaign has no audience');
    if (!campaign.template) throw new BadRequestException('Campaign has no template');
    const revision = campaign.templateVersion ?? campaign.template.publishedVersion;
    if (!revision) throw new BadRequestException('Campaign template revision is missing.');
    if (!campaign.snapshot) {
      throw new BadRequestException('Campaign must use a frozen audience snapshot before delivery proof can be recorded.');
    }
    const snapshot = campaign.snapshot;
    const snapshotId = snapshot.id;
    const members = await this.repository.snapshotMembers(snapshotId, 5000);
    const mailSettings = await this.mail.loadMailCenterSettings();
    const marketingSettings = mailSettings.categoryMarketing;
    const marketingRuntime = await this.repository.ensureSettings();
    if (!marketingRuntime.sendingEnabled) {
      await this.repository.recordEvent({
        eventType: 'campaign.queue_skipped',
        status: 'skipped',
        metadata: { campaignId: campaign.id, snapshotId, reason: 'mailMarketing.sendingEnabled' },
      });
      throw new BadRequestException('Marketing delivery is off for this workspace. Enable it in Mail Marketing settings after reviewing the audience and approval policy.');
    }
    if (mailSettings.providerMode !== 'live') {
      await this.repository.recordEvent({
        eventType: 'campaign.queue_skipped',
        status: 'skipped',
        metadata: { campaignId: campaign.id, snapshotId, reason: 'mailCenter.providerMode', providerMode: mailSettings.providerMode },
      });
      throw new BadRequestException(`Marketing delivery requires Mail Center live mode; current mode is ${mailSettings.providerMode}.`);
    }
    if (!marketingSettings.enabled || marketingSettings.types.campaigns === false) {
      const field = !marketingSettings.enabled ? 'categoryMarketing.enabled' : 'categoryMarketing.types.campaigns';
      await this.repository.recordEvent({
        eventType: 'campaign.queue_skipped',
        status: 'skipped',
        metadata: { campaignId: campaign.id, snapshotId, reason: field },
      });
      throw new BadRequestException(`Marketing campaign delivery is disabled by mail settings (${field}).`);
    }
    const quietRetryMs = computeQuietHoursDelayMs(marketingSettings.quietHours);
    if (quietRetryMs > 0) {
      await this.repository.recordEvent({
        eventType: 'campaign.queue_blocked_quiet_hours',
        status: 'queued',
        metadata: { campaignId: campaign.id, snapshotId, quietHours: marketingSettings.quietHours, retryMinutes: Math.round(quietRetryMs / 60000) },
      });
      throw new BadRequestException(`Quiet hours are active; queue this campaign after ${Math.round(quietRetryMs / 60000)} minute(s).`);
    }
    let recipientCount = 0;
    let skippedCount = 0;
    let suppressedCount = 0;
    const skippedReasons: Record<string, number> = {};
    const compliance = await this.marketingComplianceContext();
    const sendStrategy = await this.rules.algorithmRuntimeDefinition('mail_marketing.send_safety');
    for (const member of members) {
      const block = campaignMemberBlockReason(member, { category: 'marketing', campaignId: campaign.id, templateId: campaign.template.id });
      if (block) {
        skippedCount += 1;
        suppressedCount += 1;
        skippedReasons[block] = (skippedReasons[block] ?? 0) + 1;
        continue;
      }
      const frequencyCap = await this.frequencyCapExceeded(member.email, marketingSettings.frequencyCaps);
      if (frequencyCap) {
        skippedCount += 1;
        const reason = `frequency_${frequencyCap}`;
        skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
        continue;
      }
      const tenantDailyCap = await this.tenantDailySendCapExceeded();
      if (tenantDailyCap) {
        skippedCount += 1;
        skippedReasons.tenant_daily_cap = (skippedReasons.tenant_daily_cap ?? 0) + 1;
        continue;
      }
      const sendSignals = campaignSendSafetySignals(member, {
        providerMode: mailSettings.providerMode,
        templateApproved: true,
        campaignId: campaign.id,
        templateId: campaign.template.id,
      });
      if (!algorithmVisible(sendStrategy, sendSignals)) {
        skippedCount += 1;
        suppressedCount += 1;
        const score = algorithmScore(sendStrategy, sendSignals);
        const band = algorithmScoreBand(sendStrategy, score);
        const reason = band?.id ? `strategy_${band.id}` : 'strategy_send_safety_blocked';
        skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
        continue;
      }
      recipientCount += 1;
      const variables = memberVariables(member, marketingComplianceLinks(compliance, {
        email: member.email,
        contactId: member.contactId,
        customerId: member.customerId,
        source: `campaign:${campaign.id}`,
      }));
      const renderedCss = revision.css ? renderTemplate(revision.css, variables) : null;
      const rendered = appendMarketingComplianceFooter({
        html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss),
        text: revision.text ? renderTemplate(revision.text, variables) : null,
        compliance,
        urls: asRecord(variables.urls),
      });
      await this.mail.sendTransactional({
        eventKey: `mail.campaign.${campaign.id}`,
        category: 'marketing',
        to: member.email,
        templateId: campaign.template.id,
        templateVersionId: revision.id,
        subject: renderTemplate(campaign.subjectOverride || revision.subject, variables),
        html: rendered.html,
        text: rendered.text,
        metadata: {
          source: 'mail_campaign_queue',
          campaignId: campaign.id,
          snapshotId,
          contactId: member.contactId,
          customerId: member.customerId,
          senderName: campaign.senderName,
          replyTo: campaign.replyTo,
          providerMode: mailSettings.providerMode,
          sendingEnabled: true,
          sendSafety: {
            surfaceId: sendStrategy.surfaceId,
            score: algorithmScore(sendStrategy, sendSignals),
            band: algorithmScoreBand(sendStrategy, algorithmScore(sendStrategy, sendSignals))?.id ?? null,
          },
          compliance: {
            unsubscribeUrl: asRecord(variables.urls).unsubscribe ?? null,
            preferenceCenterUrl: asRecord(variables.urls).preferenceCenter ?? null,
            footerInjected: rendered.footerInjected,
          },
        },
      });
    }
    const updated = await this.repository.updateCampaignQueued(campaign.id, {
      status: 'sending',
      snapshotId,
      recipientCount,
      queuedCount: recipientCount,
      sentCount: 0,
      failedCount: 0,
      skippedCount,
      suppressedCount,
      metadata: {
        ...asRecord(campaign.metadata),
        queuedAt: new Date().toISOString(),
        providerMode: mailSettings.providerMode,
        eligibilitySkippedCount: skippedCount,
        skippedReasons,
      },
    });
    await this.repository.recordEvent({
      eventType: 'campaign.queued',
      status: 'queued',
      metadata: { campaignId: campaign.id, snapshotId, recipientCount, skippedCount, suppressedCount, skippedReasons },
    });
    return toCampaignDto(updated);
  }

  async flows() {
    const [rows, enabled] = await Promise.all([
      this.repository.listFlows(),
      this.marketingDeliveryEnabled(),
    ]);
    return rows.map((row) => toFlowDto(row, enabled));
  }

  async getFlow(id: string) {
    const [flow, enabled] = await Promise.all([
      this.repository.requireFlow(id),
      this.marketingDeliveryEnabled(),
    ]);
    return toFlowDto(flow, enabled);
  }

  async createFlow(input: SaveMailFlowInput) {
    const parsed = saveMailFlowSchema.parse(input);
    const graph = inputJson(parsed.graph, { nodes: [], edges: [] });
    const nodes = normalizeFlowNodes(parsed.graph);
    validateMailFlowGraph(parsed.triggerType, nodes);
    if (parsed.status === 'published') await this.validateFlowPublishReferences(nodes);
    const summary = flowSummary(nodes);
    const sendingEnabled = await this.marketingDeliveryEnabled();
    const flow = await this.repository.createFlow({
      name: parsed.name,
      slug: parsed.slug ?? slug(parsed.name),
      triggerType: parsed.triggerType,
      status: parsed.status,
      graph,
      nodes,
      summary,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    });
    await this.repository.recordEvent({
      eventType: 'flow.created',
      metadata: { flowId: flow.id, triggerType: flow.triggerType, status: flow.status, summary },
    });
    await this.repository.createFlowActionLog({
      flowId: flow.id,
      flowVersionId: flow.activeVersion?.id ?? flow.versions?.[0]?.id ?? null,
      actionType: 'flow_created',
      status: 'recorded',
      message: `${nodes.length} flow nodes were stored in an immutable draft version.`,
      payload: { triggerType: flow.triggerType, sendingEnabled, summary },
    });
    this.logger.log('mail_marketing', 'flow_create', 'Mail flow created', { flow_id: flow.id, status: flow.status });
    return toFlowDto(flow, sendingEnabled);
  }

  async updateFlow(id: string, input: PatchMailFlowInput) {
    const parsed = patchMailFlowSchema.parse(input);
    const existing = await this.repository.requireFlow(id);
    const nextTriggerType = parsed.triggerType ?? existing.triggerType;
    const nextGraph = parsed.graph !== undefined ? inputJson(parsed.graph, { nodes: [], edges: [] }) : undefined;
    const nextNodes = parsed.graph !== undefined ? normalizeFlowNodes(parsed.graph) : undefined;
    const nextSummary = nextNodes ? flowSummary(nextNodes) : undefined;
    const sendingEnabled = await this.marketingDeliveryEnabled();
    if (nextNodes) validateMailFlowGraph(nextTriggerType, nextNodes);
    const flow = await this.repository.updateFlow(id, {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.slug !== undefined && { slug: parsed.slug || undefined }),
      ...(parsed.triggerType !== undefined && { triggerType: parsed.triggerType }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(nextGraph !== undefined && { graph: nextGraph, nodes: nextNodes, summary: nextSummary }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    });
    await this.repository.recordEvent({
      eventType: 'flow.updated',
      metadata: { flowId: flow.id, triggerType: flow.triggerType, status: flow.status, ...(nextSummary && { summary: nextSummary }) },
    });
    await this.repository.createFlowActionLog({
      flowId: flow.id,
      flowVersionId: flow.versions?.[0]?.id ?? flow.activeVersion?.id ?? null,
      actionType: 'flow_updated',
      status: 'recorded',
      message: nextNodes ? `${nextNodes.length} nodes were stored in a new draft version.` : 'Flow metadata was updated.',
      payload: { sendingEnabled, ...(nextSummary && { summary: nextSummary }) },
    });
    return toFlowDto(flow, sendingEnabled);
  }

  async validateFlow(id: string, input: ValidateMailFlowInput): Promise<MailFlowValidationResponse> {
    const parsed = validateMailFlowSchema.parse(input ?? {});
    const flow = await this.repository.requireFlow(id);
    const [provider, sendingEnabled] = await Promise.all([this.mailProviderSummary(), this.marketingDeliveryEnabled()]);
    return this.buildFlowValidationResult(flow, parsed.version, provider.mode, sendingEnabled);
  }

  async simulateFlow(id: string, input: SimulateMailFlowInput): Promise<MailFlowSimulationResponse> {
    const parsed = simulateMailFlowSchema.parse(input ?? {});
    const flow = await this.repository.requireFlow(id);
    const [provider, sendingEnabled] = await Promise.all([this.mailProviderSummary(), this.marketingDeliveryEnabled()]);
    const selected = selectFlowVersion(flow, parsed.version);
    const nodes = selected.version?.nodes?.map(toStoredNodeInput) ?? [];
    const validation = await this.buildFlowValidationResult(flow, parsed.version, provider.mode, sendingEnabled);
    const triggerType = parsed.triggerType ?? selected.version?.triggerType ?? flow.triggerType;
    const issues = [...validation.issues];
    const warnings = [...validation.warnings];
    if (selected.version && triggerType !== selected.version.triggerType) {
      issues.push(`Simulation trigger ${triggerType} does not match version trigger ${selected.version.triggerType}`);
    }
    if (issues.length === 0) {
      warnings.push('Simulation is proof-only: no enrollment, delivery, task, audience mutation, or webhook execution is created.');
    }
    return {
      flowId: flow.id,
      flowName: flow.name,
      versionSelector: parsed.version,
      versionId: selected.version?.id ?? null,
      versionNumber: selected.version?.versionNumber ?? null,
      triggerType,
      providerMode: provider.mode,
      sendingEnabled,
      mode: sendingEnabled ? 'live_ready' : 'proof_only',
      valid: issues.length === 0,
      blocked: issues.length > 0,
      target: {
        contactId: parsed.target.contactId ?? null,
        customerId: parsed.target.customerId ?? null,
        email: parsed.target.email ?? null,
      },
      payloadKeys: Object.keys(parsed.payload).sort(),
      issues,
      warnings,
      steps: nodes.map((node) => simulateFlowNode(node, provider.mode, sendingEnabled)),
      checkedAt: new Date().toISOString(),
    };
  }

  async publishFlow(id: string) {
    const existing = await this.repository.requireFlow(id);
    const latestVersion = existing.versions?.[0];
    if (!latestVersion) throw new BadRequestException('Flow has no draft version');
    const nodes = (latestVersion.nodes ?? []).map(toStoredNodeInput);
    validateMailFlowGraph(latestVersion.triggerType, nodes);
    await this.validateFlowPublishReferences(nodes);
    const flow = await this.repository.publishFlow(id);
    const [provider, sendingEnabled] = await Promise.all([this.mailProviderSummary(), this.marketingDeliveryEnabled()]);
    await this.repository.recordEvent({
      eventType: 'flow.published',
      status: 'recorded',
      metadata: {
        flowId: flow.id,
        versionId: flow.activeVersion?.id ?? latestVersion.id,
        providerMode: provider.mode,
        sendingEnabled,
      },
    });
    await this.repository.createFlowActionLog({
      flowId: flow.id,
      flowVersionId: flow.activeVersion?.id ?? latestVersion.id,
      actionType: 'flow_published',
      status: 'recorded',
      message: sendingEnabled
        ? 'Flow version was published and is eligible to deliver when its runtime checks pass.'
        : 'Flow version was published. Delivery is off in Mail Marketing settings, so runtime emails will be skipped until it is enabled.',
      payload: { sendingEnabled, providerMode: provider.mode, summary: flow.activeVersion?.summary ?? flowSummary(nodes) },
    });
    return toFlowDto(flow, sendingEnabled);
  }

  async pauseFlow(id: string) {
    const flow = await this.repository.pauseFlow(id);
    const sendingEnabled = await this.marketingDeliveryEnabled();
    await this.repository.recordEvent({
      eventType: 'flow.paused',
      metadata: { flowId: flow.id, activeVersionId: flow.activeVersion?.id ?? null },
    });
    await this.repository.createFlowActionLog({
      flowId: flow.id,
      flowVersionId: flow.activeVersion?.id ?? null,
      actionType: 'flow_paused',
      status: 'recorded',
      message: 'Flow was paused by an operator.',
      payload: { sendingEnabled },
    });
    return toFlowDto(flow, sendingEnabled);
  }

  async resumeFlow(id: string) {
    const flow = await this.repository.resumeFlow(id);
    const [provider, sendingEnabled] = await Promise.all([this.mailProviderSummary(), this.marketingDeliveryEnabled()]);
    await this.repository.recordEvent({
      eventType: 'flow.resumed',
      metadata: { flowId: flow.id, activeVersionId: flow.activeVersion?.id ?? null, sendingEnabled, providerMode: provider.mode },
    });
    await this.repository.createFlowActionLog({
      flowId: flow.id,
      flowVersionId: flow.activeVersion?.id ?? null,
      actionType: 'flow_resumed',
      status: 'recorded',
      message: sendingEnabled
        ? 'Flow was resumed and can deliver when each enrollment passes runtime checks.'
        : 'Flow was resumed. Marketing delivery remains off until enabled in workspace settings.',
      payload: { sendingEnabled, providerMode: provider.mode },
    });
    return toFlowDto(flow, sendingEnabled);
  }

  async replayEnrollment(flowId: string, enrollmentId: string) {
    const flow = await this.repository.requireFlow(flowId);
    const source = await this.repository.flowEnrollmentForProcessing(enrollmentId);
    if (!source || source.flowId !== flowId) throw new NotFoundException('Flow enrollment not found');
    if (flow.status !== 'published' || !flow.activeVersionId || flow.activeVersionId !== source.flowVersionId || !source.flowVersion) {
      throw new BadRequestException('Replay requires the same published flow version to remain active.');
    }
    const triggerNode = source.flowVersion.nodes.find((node) => node.nodeType === 'trigger');
    const firstNodeKey = triggerNode?.nextNodeKey ?? firstNodeAfterTrigger(source.flowVersion.nodes, triggerNode?.nodeKey ?? null);
    if (!firstNodeKey) throw new BadRequestException('Replay requires a runnable node after the flow trigger.');
    const sendingEnabled = await this.marketingDeliveryEnabled();
    const replayRun = await this.repository.createFlowRun({
      flowId: flow.id,
      flowVersionId: source.flowVersionId,
      triggerType: flow.triggerType,
      triggerEventType: 'operator.replay',
      status: 'running',
      enrollmentCount: 1,
      metadata: inputJson({ replayOfEnrollmentId: source.id, replayedAt: new Date().toISOString(), sendingEnabled }, {}),
    });
    const replay = await this.repository.createFlowEnrollment({
      flowId: flow.id,
      flowVersionId: source.flowVersionId,
      flowRunId: replayRun.id,
      contactId: source.contactId,
      customerId: source.customerId,
      email: source.email,
      currentNodeKey: firstNodeKey,
      status: 'queued',
      eventPayload: inputJson(source.eventPayload, {}),
    });
    await this.repository.createFlowActionLog({
      flowId: flow.id,
      flowVersionId: replay.flowVersionId,
      flowRunId: replay.flowRunId,
      enrollmentId: replay.id,
      contactId: replay.contactId,
      actionType: 'replay_enrollment',
      nodeKey: firstNodeKey,
      status: 'queued',
      message: 'Enrollment replay was queued from the active flow version.',
      payload: { replayOfEnrollmentId: source.id, sendingEnabled },
    });
    await this.repository.recordEvent({
      eventType: 'flow.enrollment_replay_queued',
      status: 'queued',
      metadata: { flowId, enrollmentId, replayEnrollmentId: replay.id, replayRunId: replayRun.id, sendingEnabled },
    });
    await this.enqueueFlowNode(replay.id, firstNodeKey);
    return {
      flowId: flow.id,
      enrollmentId: replay.id,
      status: 'queued',
      sendingEnabled,
      message: sendingEnabled
        ? 'Enrollment replay was queued for the active flow version.'
        : 'Enrollment replay was queued. Email nodes will record a skip until Marketing delivery is enabled.',
    };
  }

  async flowRuns(flowId: string) {
    await this.repository.requireFlow(flowId);
    const [rows, sendingEnabled] = await Promise.all([this.repository.flowRuns(flowId), this.marketingDeliveryEnabled()]);
    return {
      flowId,
      total: rows.length,
      sendingEnabled,
      runs: rows.map(toFlowRunDto),
    };
  }

  async flowEvents(flowId: string) {
    await this.repository.requireFlow(flowId);
    const [rows, sendingEnabled] = await Promise.all([this.repository.flowEvents(flowId), this.marketingDeliveryEnabled()]);
    return {
      flowId,
      total: rows.length,
      sendingEnabled,
      events: rows.map(toFlowEventDto),
    };
  }

  async handleDomainEvent(triggerType: string, payload: Record<string, unknown>) {
    const sendingEnabled = await this.marketingDeliveryEnabled();
    const flows = await this.repository.publishedFlowsByTrigger(triggerType);
    let matched = 0;
    let enrollmentCount = 0;
    for (const flow of flows) {
      const version = flow.activeVersion;
      if (!version) continue;
      if (shouldSkipSelfTriggeredFlow(flow.id, triggerType, payload)) continue;
      const triggerNode = version.nodes.find((node) => node.nodeType === 'trigger');
      if (triggerNode && !matchesTriggerConfig(triggerNode.config, payload)) continue;
      const audienceTargets = await this.flowEventAudienceTargets(payload);
      const contacts = audienceTargets.length > 0 ? [] : await this.repository.contactsForFlowEvent(payload);
      const emailOnly: FlowEventTarget[] = contacts.length === 0 && textValue(payload.email)
        ? [{ id: null, customerId: textValue(payload.customerId) || null, email: textValue(payload.email), isSendable: true, suppressions: [], consentStates: [] }]
        : [];
      const targets: FlowEventTarget[] = audienceTargets.length > 0 ? audienceTargets : contacts.length > 0 ? contacts.map((contact) => ({
        id: contact.id,
        customerId: contact.customerId,
        email: contact.email,
        isSendable: contact.isSendable,
        suppressions: contact.suppressions,
        consentStates: contact.consentStates,
      })) : emailOnly;
      if (targets.length === 0) continue;

      const claimedTargets: typeof targets = [];
      let duplicateCount = 0;
      for (const target of targets) {
        const targetKey = flowTargetKey(target);
        const idempotencyKey = flowIdempotencyKey(flow.id, version.id, triggerType, payload, targetKey);
        const claimed = await this.repository.claimFlowIdempotencyKey({
          flowId: flow.id,
          flowVersionId: version.id,
          triggerType,
          targetKey,
          idempotencyKey,
          ttlMs: 24 * 60 * 60 * 1000,
          metadata: inputJson({ triggerType, targetKey, source: 'mail_flow_domain_event', payload }, {}),
        });
        if (claimed) claimedTargets.push(target);
        else duplicateCount += 1;
      }
      if (duplicateCount > 0) {
        await this.repository.recordEvent({
          eventType: 'flow.enrollment_duplicate_skipped',
          status: 'skipped',
          metadata: { flowId: flow.id, triggerType, duplicateCount, targetCount: targets.length },
        });
      }
      if (claimedTargets.length === 0) continue;

      matched += 1;
      enrollmentCount += claimedTargets.length;
      const run = await this.repository.createFlowRun({
        flowId: flow.id,
        flowVersionId: version.id,
        triggerType,
        triggerEventType: textValue(payload.eventType) || triggerType,
        status: 'running',
        enrollmentCount: claimedTargets.length,
        metadata: inputJson({ ...payload, duplicateCount }, {}),
      });

      for (const target of claimedTargets) {
        const enrollment = await this.repository.createFlowEnrollment({
          flowId: flow.id,
          flowVersionId: version.id,
          flowRunId: run.id,
          contactId: target.id,
          customerId: target.customerId ?? null,
          email: target.email ?? null,
          currentNodeKey: triggerNode?.nodeKey ?? null,
          status: 'queued',
          eventPayload: inputJson(payload, {}),
        });
        await this.repository.createFlowActionLog({
          flowId: flow.id,
          flowVersionId: version.id,
          flowRunId: run.id,
          enrollmentId: enrollment.id,
          contactId: target.id,
          actionType: 'trigger_received',
          nodeKey: triggerNode?.nodeKey ?? null,
          status: 'success',
          message: `Matched ${businessTriggerLabel(triggerType)}.`,
          payload: inputJson({ triggerType, sendingEnabled, eventPayload: payload }, {}),
        });
        const nextNodeKey = triggerNode?.nextNodeKey ?? firstNodeAfterTrigger(version.nodes, triggerNode?.nodeKey ?? null);
        if (nextNodeKey) await this.enqueueFlowNode(enrollment.id, nextNodeKey);
        else await this.completeEnrollment(enrollment.id, run.id);
      }
    }
    await this.repository.recordEvent({
      eventType: 'flow.domain_event_ingested',
      status: matched > 0 ? 'matched' : 'skipped',
      metadata: { triggerType, matched, enrollmentCount, sendingEnabled },
    });
    return { triggerType, matched, enrollmentCount, sendingEnabled };
  }

  private async flowEventAudienceTargets(payload: Record<string, unknown>): Promise<FlowEventTarget[]> {
    const snapshotId = textValue(payload.snapshotId ?? payload.audienceSnapshotId);
    if (snapshotId) {
      const members = await this.repository.snapshotMembers(snapshotId, 5000);
      return members
        .filter((member) => member.contact)
        .map((member) => ({
          id: member.contact!.id,
          customerId: member.customerId ?? member.contact!.customerId,
          email: member.email || member.contact!.email,
          isSendable: member.contact!.isSendable,
          suppressions: member.contact!.suppressions,
          consentStates: member.contact!.consentStates,
        }));
    }
    const audienceId = textValue(payload.audienceId ?? payload.mailAudienceId);
    if (!audienceId) return [];
    const audience = await this.repository.findAudience(audienceId);
    if (!audience || audience.isArchived) return [];
    const resolved = await this.resolveAudience(audience.filters);
    return resolved.contacts.map((contact) => ({
      id: contact.id,
      customerId: contact.customerId,
      email: contact.email,
      isSendable: contact.isSendable,
      suppressions: contact.suppressions,
      consentStates: contact.consentStates,
    }));
  }

  async processFlowEnrollmentNode(enrollmentId: string, nodeKey: string) {
    const enrollment = await this.repository.flowEnrollmentForProcessing(enrollmentId);
    if (!enrollment || enrollment.status === 'completed' || enrollment.status === 'skipped' || enrollment.status === 'failed') return;
    if (!enrollment.flowVersion) {
      await this.failEnrollment(enrollment.id, enrollment.flowRunId, `Flow version not found for ${enrollmentId}`);
      return;
    }
    if (enrollment.flow.status !== 'published' || enrollment.flow.activeVersionId !== enrollment.flowVersionId) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey,
        actionType: 'flow_inactive',
        message: 'Flow is paused, archived, or no longer active.',
      });
      return;
    }
    const node = enrollment.flowVersion.nodes.find((item) => item.nodeKey === nodeKey);
    if (!node) {
      await this.failEnrollment(enrollment.id, enrollment.flowRunId, `Node ${nodeKey} not found`);
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: 'node_missing',
        nodeKey,
        status: 'failed',
        message: `Node ${nodeKey} not found`,
      });
      return;
    }

    await this.repository.updateFlowEnrollmentState(enrollment.id, { status: 'running', currentNodeKey: nodeKey, nextRunAt: null });
    if (node.nodeType === 'delay') {
      await this.processDelayNode(enrollment, node);
      return;
    }
    if (node.nodeType === 'condition' || node.nodeType === 'split') {
      await this.processBranchNode(enrollment, node);
      return;
    }
    if (node.nodeType === 'send_email') {
      const shouldContinue = await this.processSendEmailNode(enrollment, node);
      if (!shouldContinue) return;
    } else {
      await this.processSideEffectNode(enrollment, node);
    }

    if (node.nextNodeKey) await this.enqueueFlowNode(enrollment.id, node.nextNodeKey);
    else await this.completeEnrollment(enrollment.id, enrollment.flowRunId);
  }

  private async enqueueFlowNode(enrollmentId: string, nodeKey: string, delay = 0) {
    if (!this.flowQueue) {
      this.logger.warn('mail_marketing', 'flow_queue_missing', 'REDIS_URL is not configured; processing Mail Marketing flow node inline', {
        enrollment_id: enrollmentId,
        node_key: nodeKey,
        delay_ms: delay,
      });
      if (delay > 0) return;
      await this.processFlowEnrollmentNode(enrollmentId, nodeKey);
      return;
    }
    await this.flowQueue.add(
      MAIL_MARKETING_FLOW_JOB,
      { tenantId: this.repository.currentTenantId(), enrollmentId, nodeKey },
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        jobId: delay > 0 ? `${enrollmentId}:${nodeKey}:${Date.now() + delay}` : `${enrollmentId}:${nodeKey}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  private async processDelayNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    const config = asRecord(node.config);
    const scheduledAt = textValue(config.scheduledAt ?? config.runAt ?? config.waitUntil);
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    const delayMinutes = Math.max(0, Number(config.delayMinutes ?? config.minutes ?? 0));
    const hasScheduledDate = Boolean(scheduledDate && !Number.isNaN(scheduledDate.getTime()));
    const hasDuration = Number.isFinite(delayMinutes) && delayMinutes >= 1;
    if (!hasScheduledDate && !hasDuration) {
      await this.failEnrollment(enrollment.id, enrollment.flowRunId, 'Delay node requires delayMinutes or scheduledAt.');
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: 'delay',
        nodeKey: node.nodeKey,
        status: 'failed',
        message: 'Delay node requires a positive duration or a valid scheduled date.',
        payload: inputJson({ config }, {}),
      });
      return;
    }
    const now = Date.now();
    const nextRunAt = hasScheduledDate
      ? scheduledDate!
      : new Date(now + delayMinutes * 60 * 1000);
    const delayMs = Math.max(nextRunAt.getTime() - now, 0);
    const message = hasScheduledDate
      ? `Delayed until ${nextRunAt.toISOString()}.`
      : `Delayed for ${delayMinutes} minute(s).`;
    await this.repository.updateFlowEnrollmentState(enrollment.id, { status: 'queued', nextRunAt });
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: 'delay',
      nodeKey: node.nodeKey,
      status: 'queued',
      message,
      payload: { nextRunAt: nextRunAt.toISOString(), delayMinutes: hasDuration ? delayMinutes : null, scheduledAt: hasScheduledDate ? nextRunAt.toISOString() : null },
    });
    if (node.nextNodeKey) await this.enqueueFlowNode(enrollment.id, node.nextNodeKey, delayMs);
    else await this.completeEnrollment(enrollment.id, enrollment.flowRunId);
  }

  private async processBranchNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    const config = asRecord(node.config);
    const payload = asRecord(enrollment.eventPayload);
    const actualValue = resolveOperand(config.field, enrollment.contact, payload);
    const expectedValue = config.value;
    const operator = String(config.operator ?? 'equals');
    const matched = compareValues(actualValue, operator, expectedValue);
    const routeKey = matched ? 'true' : 'false';
    const route = routesArray(inputJson(node.routes, [])).find((item) => textValue(item.key) === routeKey);
    const nextNodeKey = textValue(route?.nextNodeKey) || node.nextNodeKey;
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: node.nodeType,
      nodeKey: node.nodeKey,
      status: 'success',
      message: matched ? 'Condition matched.' : 'Condition did not match.',
      payload: inputJson({ field: textValue(config.field), operator, actualValue, expectedValue, nextNodeKey }, {}),
    });
    if (nextNodeKey) await this.enqueueFlowNode(enrollment.id, nextNodeKey);
    else await this.completeEnrollment(enrollment.id, enrollment.flowRunId);
  }

  private async processSendEmailNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    const email = enrollment.email || enrollment.contact?.email || null;
    const config = asRecord(node.config);
    const templateId = textValue(config.templateId) || null;
    if (!email) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: 'Recipient email is missing.',
      });
      return false;
    }
    if (!templateId) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: 'send_email requires a published templateId.',
      });
      return false;
    }
    const reachabilityBlock = reachabilityBlockReason(enrollment.contact ?? null, {
      category: 'marketing',
      flowId: enrollment.flowId,
      templateId,
    });
    if (reachabilityBlock) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: reachabilityBlock.message,
        payload: inputJson({ reason: reachabilityBlock.reason, templateId }, {}),
      });
      return false;
    }
    const mailSettings = await this.mail.loadMailCenterSettings();
    const marketingSettings = mailSettings.categoryMarketing;
    const marketingRuntime = await this.repository.ensureSettings();
    if (!marketingRuntime.sendingEnabled) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: 'Marketing delivery is off for this workspace. Enable it in Mail Marketing settings before running customer-facing flow email.',
        payload: inputJson({ field: 'mailMarketing.sendingEnabled', templateId, sendingEnabled: false }, {}),
      });
      return false;
    }
    if (mailSettings.providerMode !== 'live') {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: `Marketing delivery requires Mail Center live mode; current mode is ${mailSettings.providerMode}.`,
        payload: inputJson({ field: 'mailCenter.providerMode', templateId, providerMode: mailSettings.providerMode, sendingEnabled: false }, {}),
      });
      return false;
    }
    if (!marketingSettings.enabled || marketingSettings.types.flows === false) {
      const field = !marketingSettings.enabled ? 'categoryMarketing.enabled' : 'categoryMarketing.types.flows';
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: `Marketing flow delivery is disabled by mail settings (${field}).`,
        payload: inputJson({ field, templateId, sendingEnabled: false }, {}),
      });
      return false;
    }
    const quietRetryMs = computeQuietHoursDelayMs(marketingSettings.quietHours);
    if (quietRetryMs > 0) {
      const nextRunAt = new Date(Date.now() + quietRetryMs);
      await this.repository.updateFlowEnrollmentState(enrollment.id, { status: 'queued', currentNodeKey: node.nodeKey, nextRunAt });
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: 'send_email',
        nodeKey: node.nodeKey,
        status: 'queued',
        message: `Quiet hours active; delivery proof re-queued in ${Math.round(quietRetryMs / 60000)} minute(s).`,
        payload: inputJson({ templateId, nextRunAt: nextRunAt.toISOString(), quietHours: marketingSettings.quietHours }, {}),
      });
      await this.enqueueFlowNode(enrollment.id, node.nodeKey, quietRetryMs);
      return false;
    }
    const frequencyCap = await this.frequencyCapExceeded(email, marketingSettings.frequencyCaps);
    if (frequencyCap) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: `Frequency cap exceeded (${frequencyCap}).`,
        payload: inputJson({ cap: frequencyCap, caps: marketingSettings.frequencyCaps, templateId }, {}),
      });
      return false;
    }
    const tenantDailyCap = await this.tenantDailySendCapExceeded();
    if (tenantDailyCap) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: `Tenant daily marketing cap exceeded (${tenantDailyCap.count}/${tenantDailyCap.cap}).`,
        payload: inputJson({ cap: tenantDailyCap.cap, count: tenantDailyCap.count, templateId }, {}),
      });
      return false;
    }
    const sendStrategy = await this.rules.algorithmRuntimeDefinition('mail_marketing.send_safety');
    const sendSignals = flowSendSafetySignals(enrollment, {
      providerMode: mailSettings.providerMode,
      templateApproved: true,
      templateId,
      nodeKey: node.nodeKey,
    });
    if (!algorithmVisible(sendStrategy, sendSignals)) {
      const score = algorithmScore(sendStrategy, sendSignals);
      const band = algorithmScoreBand(sendStrategy, score);
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: band?.label ? `Send safety strategy blocked this recipient (${band.label}).` : 'Send safety strategy blocked this recipient.',
        payload: inputJson({ templateId, strategySurfaceId: sendStrategy.surfaceId, strategyScore: score, strategyBand: band?.id ?? null }, {}),
      });
      return false;
    }
    const compliance = await this.marketingComplianceContext();
    const variables = flowEmailVariables(enrollment, marketingComplianceLinks(compliance, {
      email,
      contactId: enrollment.contactId,
      customerId: enrollment.customerId,
      source: `flow:${enrollment.flowId}:${node.nodeKey}`,
    }));
    const rendered = await this.renderFlowEmail(config, variables, compliance);
    if (!rendered) {
      await this.skipEnrollment(enrollment.id, enrollment.flowRunId, {
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        nodeKey: node.nodeKey,
        actionType: 'send_email',
        message: 'Email template is missing or has no published revision.',
        payload: inputJson({ templateId }, {}),
      });
      return false;
    }
    const delivery = await this.mail.sendTransactional({
      eventKey: `mail.flow.${enrollment.flowId}`,
      category: 'marketing',
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: rendered.templateId,
      templateVersionId: rendered.templateVersionId,
      metadata: {
        source: 'mail_flow_node',
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        nodeKey: node.nodeKey,
        templateId: rendered.templateId,
        templateVersionId: rendered.templateVersionId,
        sendSafety: {
          surfaceId: sendStrategy.surfaceId,
          score: algorithmScore(sendStrategy, sendSignals),
          band: algorithmScoreBand(sendStrategy, algorithmScore(sendStrategy, sendSignals))?.id ?? null,
        },
        compliance: {
          unsubscribeUrl: asRecord(variables.urls).unsubscribe ?? null,
          preferenceCenterUrl: asRecord(variables.urls).preferenceCenter ?? null,
          footerInjected: rendered.footerInjected,
        },
      },
    });
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: 'send_email',
      nodeKey: node.nodeKey,
      status: 'queued',
      message: 'Email delivery was queued for the marketing delivery worker.',
      payload: { deliveryId: delivery.id, recipient: email, templateId: rendered.templateId, providerMode: mailSettings.providerMode, sendingEnabled: true },
    });
    return true;
  }

  private async frequencyCapExceeded(
    email: string,
    caps: { perDay: number; perWeek: number; per30Days: number } | undefined | null,
  ): Promise<'day' | 'week' | '30days' | null> {
    if (!caps) return null;
    const now = Date.now();
    const day = new Date(now - 24 * 60 * 60 * 1000);
    const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const days30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const [dayCount, weekCount, monthCount] = await Promise.all([
      caps.perDay > 0 ? this.repository.countMarketingDeliveriesForRecipientSince(email, day) : Promise.resolve(0),
      caps.perWeek > 0 ? this.repository.countMarketingDeliveriesForRecipientSince(email, week) : Promise.resolve(0),
      caps.per30Days > 0 ? this.repository.countMarketingDeliveriesForRecipientSince(email, days30) : Promise.resolve(0),
    ]);
    if (caps.perDay > 0 && dayCount >= caps.perDay) return 'day';
    if (caps.perWeek > 0 && weekCount >= caps.perWeek) return 'week';
    if (caps.per30Days > 0 && monthCount >= caps.per30Days) return '30days';
    return null;
  }

  private async tenantDailySendCapExceeded() {
    const settings = await this.repository.ensureSettings();
    if (settings.dailySendCap <= 0) return null;
    const count = await this.repository.countTenantMarketingDeliveriesSince(new Date(Date.now() - 24 * 60 * 60 * 1000));
    return count >= settings.dailySendCap ? { cap: settings.dailySendCap, count } : null;
  }

  private async requirePublishedTemplate(templateId: string, label: string) {
    const template = await this.templates.findById(templateId);
    if (!template || template.isArchived) throw new BadRequestException(`${label}: email template not found.`);
    if (!template.publishedVersion) throw new BadRequestException(`${label}: email template must have a published revision.`);
    const issues = templateRevisionSafetyIssues(template.publishedVersion);
    if (issues.length > 0) throw new BadRequestException(`${label}: published revision is blocked: ${issues.join(', ')}`);
    return { template, revision: template.publishedVersion };
  }

  private async requireCampaignTemplateRevision(templateId: string, revisionId: string | null) {
    const { template, revision: publishedRevision } = await this.requirePublishedTemplate(templateId, 'Campaign template');
    const revision = revisionId
      ? template.versions.find((entry) => entry.id === revisionId)
      : publishedRevision;
    if (!revision) throw new BadRequestException('Campaign template revision was not found.');
    if (!['approved', 'published'].includes(revision.status) && !['approved', 'published'].includes(revision.approvalState)) {
      throw new BadRequestException('Campaign template revision must be approved or published.');
    }
    const issues = templateRevisionSafetyIssues(revision);
    if (issues.length > 0) throw new BadRequestException(`Campaign template revision is blocked: ${issues.join(', ')}`);
    return { template, revision };
  }

  private async enqueueScheduledCampaign(
    campaign: { id: string; scheduledAt: Date | null },
    delayOverrideMs?: number,
  ) {
    if (!campaign.scheduledAt) return null;
    if (!this.campaignQueue) {
      throw new BadRequestException('Scheduled campaign delivery requires the managed Redis queue to be configured.');
    }
    const tenantId = this.repository.currentTenantId();
    const runAt = delayOverrideMs !== undefined
      ? new Date(Date.now() + Math.max(delayOverrideMs, 0))
      : campaign.scheduledAt;
    const delay = Math.max(runAt.getTime() - Date.now(), 0);
    const jobId = `mail-campaign:${tenantId}:${campaign.id}:${runAt.toISOString()}`;
    await this.campaignQueue.add(
      MAIL_MARKETING_CAMPAIGN_JOB,
      {
        tenantId,
        campaignId: campaign.id,
        scheduledAt: campaign.scheduledAt.toISOString(),
      },
      {
        jobId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
    await this.repository.recordEvent({
      eventType: 'campaign.schedule_enqueued',
      status: 'queued',
      metadata: {
        campaignId: campaign.id,
        scheduledAt: campaign.scheduledAt.toISOString(),
        runAt: runAt.toISOString(),
        delayMs: delay,
      },
    });
    return jobId;
  }

  private async buildFlowValidationResult(
    flow: MailFlowRecord,
    versionSelector: MailFlowVersionSelector,
    providerMode: MailProviderMode,
    sendingEnabled: boolean,
  ): Promise<MailFlowValidationResponse> {
    const selected = selectFlowVersion(flow, versionSelector);
    const nodes = selected.version?.nodes?.map(toStoredNodeInput) ?? [];
    const issues = selected.version
      ? [
        ...collectFlowGraphIssues(selected.version.triggerType, nodes),
        ...(await this.flowPublishReferenceIssues(nodes)),
      ]
      : [`${versionSelector === 'active' ? 'Active' : 'Latest'} flow version was not found`];
    const warnings = flowValidationWarnings(flow, selected.version, providerMode, sendingEnabled);
    return {
      flowId: flow.id,
      flowName: flow.name,
      versionSelector,
      versionId: selected.version?.id ?? null,
      versionNumber: selected.version?.versionNumber ?? null,
      triggerType: selected.version?.triggerType ?? flow.triggerType,
      providerMode,
      sendingEnabled,
      valid: issues.length === 0,
      publishable: issues.length === 0,
      issues,
      warnings,
      summary: flowValidationSummary(nodes),
      checkedAt: new Date().toISOString(),
    };
  }

  private async validateFlowPublishReferences(nodes: NormalizedFlowNode[]) {
    const errors = await this.flowPublishReferenceIssues(nodes);
    if (errors.length > 0) {
      throw new BadRequestException(`Flow cannot be published: ${errors.join('; ')}`);
    }
  }

  private async flowPublishReferenceIssues(nodes: NormalizedFlowNode[]) {
    const errors: string[] = [];
    for (const node of nodes) {
      const label = node.label || node.nodeKey;
      const config = asRecord(node.config as Prisma.JsonValue);
      switch (node.nodeType) {
        case 'send_email': {
          const templateId = textValue(config.templateId);
          if (!templateId) {
            errors.push(`${label}: templateId is required`);
            break;
          }
          const template = await this.templates.findById(templateId);
          if (!template || template.isArchived) {
            errors.push(`${label}: template not found`);
            break;
          }
          if (!template.publishedVersion) {
            errors.push(`${label}: template must have a published revision`);
            break;
          }
          const publishedIssues = templateRevisionSafetyIssues(template.publishedVersion);
          if (publishedIssues.length > 0) errors.push(`${label}: published revision is blocked: ${publishedIssues.join(', ')}`);
          const requestedRevisionId = textValue(config.revisionId);
          if (requestedRevisionId) {
            const requestedRevision = template.versions.find((revision) => revision.id === requestedRevisionId);
            if (!requestedRevision) {
              errors.push(`${label}: requested revision not found`);
            } else if (!['approved', 'published'].includes(requestedRevision.status) && !['approved', 'published'].includes(requestedRevision.approvalState)) {
              errors.push(`${label}: requested revision must be approved or published`);
            } else {
              const requestedIssues = templateRevisionSafetyIssues(requestedRevision);
              if (requestedIssues.length > 0) errors.push(`${label}: requested revision is blocked: ${requestedIssues.join(', ')}`);
            }
          }
          break;
        }
        case 'webhook': {
          const destinationId = textValue(config.destinationId);
          if (!destinationId) {
            errors.push(`${label}: webhook destinationId is required`);
            break;
          }
          const destination = await this.repository.findWebhookDestination(destinationId);
          if (!destination) {
            errors.push(`${label}: webhook destination not found`);
            break;
          }
          if (destination.status !== 'active') errors.push(`${label}: webhook destination is not active`);
          break;
        }
        case 'delay': {
          const delayMinutes = Number(config.delayMinutes ?? config.minutes ?? 0);
          const scheduledAt = textValue(config.scheduledAt ?? config.runAt ?? config.waitUntil);
          const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
          const hasDuration = Number.isFinite(delayMinutes) && delayMinutes >= 1;
          const hasScheduledDate = Boolean(scheduledDate && !Number.isNaN(scheduledDate.getTime()));
          if (!hasDuration && !hasScheduledDate) errors.push(`${label}: delayMinutes or scheduledAt must be valid`);
          break;
        }
        case 'condition':
        case 'split': {
          if (!textValue(config.field)) errors.push(`${label}: condition field is required`);
          break;
        }
        case 'add_to_audience':
        case 'remove_from_audience': {
          const audienceId = textValue(config.audienceId);
          if (!audienceId) {
            errors.push(`${label}: audienceId is required`);
            break;
          }
          const audience = await this.repository.findAudience(audienceId);
          if (!audience || audience.isArchived) errors.push(`${label}: audience not found`);
          break;
        }
        case 'update_contact_tag': {
          const tags = normalizeStringArray(Array.isArray(config.tags) ? config.tags : [config.tag]);
          if (tags.length === 0) errors.push(`${label}: at least one tag is required`);
          break;
        }
        case 'emit_internal_event': {
          const eventName = textValue(config.eventName);
          if (!eventName) {
            errors.push(`${label}: eventName is required`);
          } else if (!isSafeMailFlowInternalEventName(eventName)) {
            errors.push(`${label}: eventName may only contain letters, numbers, dots, dashes, underscores, and colons`);
          }
          if (containsSensitiveFlowConfig(config)) {
            errors.push(`${label}: internal event config cannot contain secrets, tokens, authorization headers, or API keys`);
          }
          break;
        }
        case 'create_sales_task':
        case 'create_follow_up_task':
        case 'create_followup_task': {
          const axis = mailFlowTaskAxis(config, node.nodeType);
          if (!axis) {
            errors.push(`${label}: follow-up task axis must be sales or account`);
          }
          const assignedMemberId = textValue(config.assignedMemberId ?? config.memberId ?? config.assigneeMemberId);
          if (assignedMemberId && !(await this.repository.findMemberById(assignedMemberId))) {
            errors.push(`${label}: assignedMemberId was not found`);
          }
          break;
        }
        default:
          break;
      }
    }
    return errors;
  }

  private async processSideEffectNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    if (node.nodeType === 'update_contact_tag') {
      await this.processUpdateContactTagNode(enrollment, node);
      return;
    }
    if (isFollowUpTaskNode(node.nodeType)) {
      await this.processFollowUpTaskNode(enrollment, node);
      return;
    }
    if (node.nodeType === 'add_to_audience' || node.nodeType === 'remove_from_audience') {
      await this.processAudienceMembershipNode(
        enrollment,
        node,
        node.nodeType === 'add_to_audience' ? 'add' : 'remove',
      );
      return;
    }
    if (node.nodeType === 'emit_internal_event') {
      await this.processInternalEventNode(enrollment, node, asRecord(node.config));
      return;
    }
    await this.recordDisabledSideEffectNode(enrollment, node);
  }

  private async processFollowUpTaskNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    const config = asRecord(node.config);
    const axis = mailFlowTaskAxis(config, node.nodeType);
    if (!axis) {
      throw new BadRequestException('Mail flow follow-up tasks only accept sales or account axis.');
    }
    const customerId = textValue(enrollment.customerId || enrollment.contact?.customerId) || null;
    if (!customerId) {
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: node.nodeType,
        nodeKey: node.nodeKey,
        status: 'skipped',
        message: 'No customer context is linked to this enrollment, so no follow-up task was created.',
        payload: inputJson({ config, reason: 'missing_customer' }, {}),
      });
      return;
    }

    const taskKey = `${enrollment.id}:${node.nodeKey}`;
    const existing = await this.repository.findMailFlowFollowUpTask(taskKey);
    if (existing) {
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: node.nodeType,
        nodeKey: node.nodeKey,
        status: 'success',
        message: `Follow-up task already exists: ${existing.title}`,
        payload: inputJson({
          serviceRequestId: existing.id,
          assignedMemberId: existing.assignedMemberId,
          axis,
          idempotent: true,
        }, {}),
      });
      return;
    }

    const explicitMemberId = textValue(config.assignedMemberId ?? config.memberId ?? config.assigneeMemberId);
    const explicitMember = explicitMemberId ? await this.repository.findMemberById(explicitMemberId) : null;
    if (explicitMemberId && !explicitMember) {
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: node.nodeType,
        nodeKey: node.nodeKey,
        status: 'skipped',
        message: 'Configured assignee was not found, so no follow-up task was created.',
        payload: inputJson({ assignedMemberId: explicitMemberId, axis }, {}),
      });
      return;
    }

    const axisPrimary = explicitMember ? null : await this.repository.resolveCustomerAxisPrimaryMember(customerId, axis);
    const assignedMemberId = explicitMember?.id ?? axisPrimary?.memberId ?? null;
    const title = textValue(config.title) || textValue(node.label) || 'Mail engagement follow-up';
    const description = textValue(config.body ?? config.description)
      || `Mail flow "${enrollment.flowId}" requested a follow-up after customer engagement.`;
    const priority = mailFlowTaskPriority(config.priority);
    const dueAt = mailFlowTaskDueAt(config);
    const sourceCallId = textValue(config.sourceCallId)
      || textValue(asRecord(enrollment.eventPayload).sourceCallId)
      || textValue(asRecord(enrollment.eventPayload).callId)
      || textValue(asRecord(enrollment.eventPayload).aircallCallId)
      || textValue(asRecord(enrollment.eventPayload).callEventId)
      || null;
    const taskStateSnapshot = inputJson({
      source: 'mail_marketing_flow',
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      nodeKey: node.nodeKey,
      contactId: enrollment.contactId,
      email: enrollment.email || enrollment.contact?.email || null,
      customerId,
      axis,
      priority,
      eventPayload: enrollment.eventPayload,
    }, {});
    const task = await this.repository.createMailFlowFollowUpTask({
      customerId,
      assignedMemberId,
      axis,
      title,
      description,
      priority,
      dueAt,
      sourceCallId,
      metadata: inputJson({
        category: 'mail_follow_up',
        mailFlowTaskKey: taskKey,
        workflow: {
          source: 'mail_marketing_flow',
          flowId: enrollment.flowId,
          flowVersionId: enrollment.flowVersionId,
          flowRunId: enrollment.flowRunId,
          enrollmentId: enrollment.id,
          nodeKey: node.nodeKey,
          nodeType: node.nodeType,
          trigger: textValue(asRecord(enrollment.eventPayload).triggerType) || 'mail_flow',
        },
        mailFlow: {
          flowId: enrollment.flowId,
          flowVersionId: enrollment.flowVersionId,
          flowRunId: enrollment.flowRunId,
          enrollmentId: enrollment.id,
          nodeKey: node.nodeKey,
          nodeType: node.nodeType,
        },
        assignment: {
          axis,
          assignedMemberId,
          source: explicitMember ? 'explicit_member' : axisPrimary ? 'customer_axis_primary' : 'unassigned',
          customerAssignmentId: axisPrimary?.id ?? null,
        },
      }, {}),
      taskStateSnapshot,
    });

    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: node.nodeType,
      nodeKey: node.nodeKey,
      status: 'success',
      message: `Created follow-up task: ${task.title}`,
      payload: inputJson({
        serviceRequestId: task.id,
        assignedMemberId: task.assignedMemberId,
        axis,
        priority,
        dueAt: dueAt?.toISOString() ?? null,
        customerId,
      }, {}),
    });
  }

  private async processUpdateContactTagNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    const contactId = enrollment.contactId || enrollment.contact?.id || null;
    if (!contactId) {
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: 'update_contact_tag',
        nodeKey: node.nodeKey,
        status: 'skipped',
        message: 'No contact is linked to this enrollment, so contact tags were not changed.',
        payload: inputJson({ config: asRecord(node.config) }, {}),
      });
      return;
    }
    const config = asRecord(node.config);
    const action = textValue(config.action).toLowerCase() === 'remove' ? 'remove' : 'add';
    const tags = normalizeStringArray(Array.isArray(config.tags) ? config.tags : [config.tag]);
    if (tags.length === 0) throw new BadRequestException('update_contact_tag requires at least one tag');
    const result = await this.repository.updateContactTags(contactId, tags, action);
    if (!result) {
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId,
        actionType: 'update_contact_tag',
        nodeKey: node.nodeKey,
        status: 'skipped',
        message: 'Contact was not found, so tags were not changed.',
        payload: inputJson({ tags, action }, {}),
      });
      return;
    }
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId,
      actionType: 'update_contact_tag',
      nodeKey: node.nodeKey,
      status: 'success',
      message: `${action === 'remove' ? 'Removed' : 'Applied'} ${tags.length} contact tag(s).`,
      payload: inputJson({
        tags,
        action,
        previousTags: result.previousTags,
        nextTags: result.nextTags,
      }, {}),
    });
  }

  private async processAudienceMembershipNode(
    enrollment: FlowEnrollmentProcessingInput,
    node: FlowNodeDtoInput,
    mode: 'add' | 'remove',
  ) {
    const config = asRecord(node.config);
    const audienceId = textValue(config.audienceId);
    if (!audienceId) throw new BadRequestException(`${node.nodeType} requires audienceId`);
    const email = textValue(enrollment.email || enrollment.contact?.email).toLowerCase();
    if (!email) {
      await this.repository.createFlowActionLog({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        actionType: node.nodeType,
        nodeKey: node.nodeKey,
        status: 'skipped',
        message: 'No recipient email is linked to this enrollment, so audience membership was not changed.',
        payload: inputJson({ audienceId, mode }, {}),
      });
      return;
    }
    if (mode === 'add') await this.repository.ensureManualAudienceContacts([email]);
    const mutation = await this.repository.buildAudienceDirectEmailMutation(audienceId, email, mode);
    if (!mutation) throw new BadRequestException('Audience not found for flow node');
    const resolved = await this.resolveAudience(mutation.nextFilters as Prisma.JsonValue);
    await this.repository.updateAudience(audienceId, {
      filters: mutation.nextFilters,
      contactCount: resolved.contacts.length,
    });
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: node.nodeType,
      nodeKey: node.nodeKey,
      status: 'success',
      message:
        mode === 'remove'
          ? `Removed ${mutation.normalizedEmail} from audience direct emails.`
          : `Added ${mutation.normalizedEmail} to audience direct emails.`,
      payload: inputJson({
        audienceId,
        email: mutation.normalizedEmail,
        mode,
        previousDirectEmailCount: mutation.previousEmails.length,
        nextMatchedContactCount: resolved.contacts.length,
      }, {}),
    });
  }

  private async recordDisabledSideEffectNode(enrollment: FlowEnrollmentProcessingInput, node: FlowNodeDtoInput) {
    const config = asRecord(node.config);
    if (node.nodeType === 'webhook') {
      await this.recordDisabledWebhookNode(enrollment, node, config);
      return;
    }
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: node.nodeType,
      nodeKey: node.nodeKey,
      status: 'skipped',
      message: `${node.label || node.nodeType} was recorded only; this side effect is not enabled yet.`,
      payload: inputJson({
        config: sanitizeSideEffectConfig(config),
        sendingEnabled: false,
        sideEffectEnabled: false,
        safetyReason: undefined,
      }, {}),
    });
  }

  private async processInternalEventNode(
    enrollment: FlowEnrollmentProcessingInput,
    node: FlowNodeDtoInput,
    config: Record<string, unknown>,
  ) {
    const eventName = textValue(config.eventName);
    if (!eventName) throw new BadRequestException('emit_internal_event requires eventName.');
    if (!isSafeMailFlowInternalEventName(eventName)) {
      throw new BadRequestException('emit_internal_event eventName contains unsupported characters.');
    }
    if (containsSensitiveFlowConfig(config)) {
      throw new BadRequestException('emit_internal_event config cannot contain secrets, tokens, authorization headers, or API keys.');
    }
    const event = await this.repository.recordEvent({
      eventType: eventName,
      status: 'emitted',
      source: 'mail_flow',
      metadata: inputJson({
        flowId: enrollment.flowId,
        flowVersionId: enrollment.flowVersionId,
        flowRunId: enrollment.flowRunId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        customerId: enrollment.customerId ?? enrollment.contact?.customerId ?? null,
        email: enrollment.email || enrollment.contact?.email || null,
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        eventPayload: asRecord(enrollment.eventPayload),
        config: sanitizeSideEffectConfig(config),
      }, {}),
    });
    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: node.nodeType,
      nodeKey: node.nodeKey,
      status: 'success',
      message: `Recorded internal event ${eventName}.`,
      payload: inputJson({
        eventId: event.id,
        eventName,
        source: 'mail_flow',
      }, {}),
    });
  }

  private async recordDisabledWebhookNode(
    enrollment: FlowEnrollmentProcessingInput,
    node: FlowNodeDtoInput,
    config: Record<string, unknown>,
  ) {
    const destinationId = textValue(config.destinationId);
    const destination = destinationId ? await this.repository.findWebhookDestination(destinationId) : null;
    const liveApproval = destination ? webhookDestinationLiveApproval(destination) : null;
    const destinationPayload = destination
      ? {
        id: destination.id,
        slug: destination.slug,
        status: destination.status === 'active' ? 'active' : 'disabled',
        authType: destination.authType === 'header' ? 'header' : 'none',
        executionMode: webhookDestinationExecutionMode(destination),
        liveApproved: liveApproval?.liveApproved ?? false,
        liveApprovedAt: liveApproval?.liveApprovedAt ?? null,
        hasSecret: Boolean(destination.secretValueEncrypted),
        timeoutMs: destination.timeoutMs,
      }
      : {
        id: destinationId || null,
        found: false,
      };
    const registryValidated = Boolean(destination && destination.status === 'active');
    const message = !destinationId
      ? 'Webhook destinationId is missing; outbound webhook execution was skipped.'
      : !destination
        ? 'Webhook destination was not found in the encrypted registry; outbound webhook execution was skipped.'
        : destination.status !== 'active'
          ? `Webhook destination "${destination.name}" is disabled; outbound webhook execution was skipped.`
          : webhookDestinationExecutionMode(destination) === 'live_requested'
            ? liveApproval?.liveApproved
              ? `Webhook destination "${destination.name}" has exact target approval; outbound runtime connector is still disabled, so proof was recorded only.`
              : `Webhook destination "${destination.name}" requested live outbound execution, but exact target allowlist approval is required; proof was recorded only.`
            : `Webhook destination "${destination.name}" was registry-validated and recorded only by proof-only mode.`;

    await this.repository.createFlowActionLog({
      flowId: enrollment.flowId,
      flowVersionId: enrollment.flowVersionId,
      flowRunId: enrollment.flowRunId,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      actionType: node.nodeType,
      nodeKey: node.nodeKey,
      status: 'skipped',
      message,
      payload: inputJson({
        config: sanitizeSideEffectConfig(config),
        destination: destinationPayload,
        registryValidated,
        sendingEnabled: false,
        sideEffectEnabled: false,
        safetyReason: registryValidated
          ? webhookDestinationExecutionMode(destination!) === 'live_requested'
            ? liveApproval?.liveApproved
              ? 'Exact destination approval is stored, but the external runtime connector has not been explicitly enabled.'
              : 'Live outbound webhook execution requires exact destination allowlist approval before data can leave the tenant runtime.'
            : 'Destination is proof-only, so the flow records a real action log without sending data to the external URL.'
          : 'Outbound webhook execution requires an active encrypted destination registry record.',
      }, {}),
    });
  }

  private async renderFlowEmail(
    config: Record<string, unknown>,
    variables: Record<string, unknown>,
    compliance: MarketingComplianceContext,
  ) {
    const templateId = textValue(config.templateId);
    if (templateId) {
      const template = await this.templates.findById(templateId);
      const revision = template?.publishedVersion ?? null;
      if (revision) {
        const issues = templateRevisionSafetyIssues(revision);
        if (issues.length > 0) return null;
        const renderedCss = revision.css ? renderString(revision.css, variables) : null;
        const rendered = appendMarketingComplianceFooter({
          html: renderEmailHtml(renderString(revision.html, variables, { escapeHtml: true }), renderedCss),
          text: revision.text ? renderString(revision.text, variables) : null,
          compliance,
          urls: asRecord(variables.urls),
        });
        return {
          templateId: template?.id ?? templateId,
          templateVersionId: revision.id,
          subject: renderString(revision.subject, variables),
          html: rendered.html,
          text: rendered.text,
          footerInjected: rendered.footerInjected,
        };
      }
    }
    return null;
  }

  private async marketingComplianceContext(): Promise<MarketingComplianceContext> {
    const { settings } = await this.mail.mailCenterSettings();
    const compliance = settings.categoryMarketing.compliance;
    const configuredPreferenceUrl = textValue(compliance.preferenceCenterUrl);
    const apiBaseUrl = ensureApiV1BaseUrl(firstConfiguredUrl([
      this.config.get<string>('PUBLIC_API_URL'),
      this.config.get<string>('API_PUBLIC_BASE_URL'),
      this.config.get<string>('API_URL'),
      this.config.get<string>('ADMIN_APP_URL'),
      this.config.get<string>('ADMIN_URL'),
      this.config.get<string>('ACCOUNTS_APP_URL'),
      this.config.get<string>('ACCOUNTS_URL'),
    ]));
    const publicPreferenceUrl = joinUrl(apiBaseUrl, '/mail-marketing/preferences');
    const preferenceCenterUrl = publicPreferenceUrl || configuredPreferenceUrl;
    return {
      brandName: textValue(this.config.get<string>('MAIL_BRAND_NAME')) || textValue(this.config.get<string>('BRAND_NAME')) || 'Factory Engine Pro',
      physicalAddress: textValue(this.config.get<string>('MAIL_PHYSICAL_ADDRESS')) || textValue(this.config.get<string>('COMPANY_PHYSICAL_ADDRESS')) || '',
      preferenceCenterUrl,
      unsubscribeBaseUrl: joinUrl(apiBaseUrl, '/mail-marketing/preferences/unsubscribe') || preferenceCenterUrl,
      tenantId: this.repository.currentTenantId(),
      tokenSecret: resolveMailPreferenceSecret(this.config),
      tokenTtlSeconds: resolveMailPreferenceTtlSeconds(this.config),
    };
  }

  private verifyPreferencePayload(token: string | undefined): MailPreferenceTokenPayload | null {
    const cleanToken = token?.trim();
    if (!cleanToken) return null;
    const secret = resolveMailPreferenceSecret(this.config);
    if (!secret) return null;
    return verifyMailPreferenceToken(cleanToken, secret);
  }

  private runWithPreferenceTenant<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
    const existing = this.tenantContext.get();
    if (existing) {
      this.tenantContext.set({ tenantId, permissions: existing.permissions ?? [] });
      return callback();
    }
    return this.tenantContext.run({
      requestId: `mail-pref-${Date.now()}`,
      tenantId,
      permissions: [],
    }, callback);
  }

  private async skipEnrollment(enrollmentId: string, runId: string, input: {
    flowId: string;
    flowVersionId: string | null;
    enrollmentId: string;
    contactId: string | null;
    actionType: string;
    nodeKey?: string | null;
    message: string;
    payload?: Prisma.InputJsonValue;
  }) {
    await this.repository.updateFlowEnrollmentState(enrollmentId, { status: 'skipped', lastError: input.message, completedAt: new Date() });
    await this.repository.incrementFlowRunCompleted(runId);
    await this.repository.createFlowActionLog({
      flowId: input.flowId,
      flowVersionId: input.flowVersionId,
      flowRunId: runId,
      enrollmentId: input.enrollmentId,
      contactId: input.contactId,
      actionType: input.actionType,
      nodeKey: input.nodeKey ?? null,
      status: 'skipped',
      message: input.message,
      payload: input.payload ?? { sendingEnabled: false },
    });
    if (await this.repository.countOpenFlowEnrollments(runId) === 0) await this.repository.completeFlowRunIfNoOpen(runId);
  }

  private async completeEnrollment(enrollmentId: string, runId: string) {
    await this.repository.updateFlowEnrollmentState(enrollmentId, { status: 'completed', completedAt: new Date(), nextRunAt: null });
    await this.repository.incrementFlowRunCompleted(runId);
    if (await this.repository.countOpenFlowEnrollments(runId) === 0) await this.repository.completeFlowRunIfNoOpen(runId);
  }

  private async failEnrollment(enrollmentId: string, runId: string, message: string) {
    await this.repository.updateFlowEnrollmentState(enrollmentId, { status: 'failed', lastError: message, completedAt: new Date(), nextRunAt: null });
    await this.repository.incrementFlowRunFailed(runId);
    if (await this.repository.countOpenFlowEnrollments(runId) === 0) await this.repository.failFlowRunIfNoOpen(runId);
  }

  private async mailProviderSummary() {
    const { settings } = await this.mail.mailCenterSettings();
    return providerSummary(settings.providerMode);
  }

  private async marketingDeliveryEnabled() {
    const [settings, provider] = await Promise.all([
      this.repository.ensureSettings(),
      this.mailProviderSummary(),
    ]);
    return settings.sendingEnabled && provider.mode === 'live';
  }
}

function toSettingsDto(settings: {
  id: string;
  sendingEnabled: boolean;
  providerMode: string;
  defaultSenderName: string;
  defaultSenderEmail: string | null;
  quietHours: Prisma.JsonValue;
  dailySendCap: number;
  metadata: Prisma.JsonValue;
  updatedAt: Date;
}, providerMode: MailProviderMode = 'disabled') {
  const approvalPolicy = approvalPolicyFromMetadata(settings.metadata);
  return {
    id: settings.id,
    sendingEnabled: settings.sendingEnabled && providerMode === 'live',
    providerMode,
    defaultSenderName: settings.defaultSenderName,
    defaultSenderEmail: settings.defaultSenderEmail,
    quietHours: asRecord(settings.quietHours),
    dailySendCap: settings.dailySendCap,
    approvalPolicy,
    metadata: asRecord(settings.metadata),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function approvalPolicyFromMetadata(metadata: unknown) {
  const policy = asRecord(asRecord(metadata).approvalPolicy);
  return mailMarketingSettingsSchema.parse({ approvalPolicy: policy }).approvalPolicy;
}

function campaignApprovalThresholdDecision(
  campaign: {
    snapshot?: {
      memberCount: number;
      reachableCount: number;
      sourceSummary?: Prisma.JsonValue | null;
    } | null;
  },
  policy: ReturnType<typeof approvalPolicyFromMetadata>,
) {
  const snapshot = campaign.snapshot;
  const sourceSummary = asRecord(snapshot?.sourceSummary);
  const metrics = {
    snapshotMembers: snapshot?.memberCount ?? 0,
    reachableRecipients: snapshot?.reachableCount ?? 0,
    estimatedAudienceSpendUsd: numberValue(sourceSummary.matchedTotalSpent, 0),
  };
  const reasons: string[] = [];
  if (metrics.reachableRecipients > policy.maxReachableRecipients) {
    reasons.push(`Reachable recipients ${metrics.reachableRecipients} exceeds limit ${policy.maxReachableRecipients}.`);
  }
  if (metrics.snapshotMembers > policy.maxSnapshotMembers) {
    reasons.push(`Frozen list size ${metrics.snapshotMembers} exceeds limit ${policy.maxSnapshotMembers}.`);
  }
  if (policy.maxEstimatedAudienceSpendUsd > 0 && metrics.estimatedAudienceSpendUsd > policy.maxEstimatedAudienceSpendUsd) {
    reasons.push(`Estimated audience spend $${Math.round(metrics.estimatedAudienceSpendUsd)} exceeds limit $${Math.round(policy.maxEstimatedAudienceSpendUsd)}.`);
  }
  return { blocked: reasons.length > 0, reasons, metrics };
}

function validateWebhookDestinationInput(input: SaveMailFlowWebhookDestinationInput): SaveMailFlowWebhookDestinationInput {
  const parsed = saveMailFlowWebhookDestinationSchema.parse(input);
  const urlError = webhookDestinationUrlError(parsed.url);
  if (urlError) throw new BadRequestException(urlError);
  if (parsed.status !== 'active' && parsed.executionMode !== 'proof_only') {
    throw new BadRequestException('Disabled webhook destinations must remain proof-only.');
  }
  if (parsed.authType === 'none' && (parsed.secretHeaderName || parsed.secretValue)) {
    throw new BadRequestException('Webhook destination with authType=none cannot include secret fields.');
  }
  if (parsed.authType === 'header') {
    if (!parsed.secretHeaderName) throw new BadRequestException('Header-auth webhook destination requires secretHeaderName.');
    if (SENSITIVE_FLOW_CONFIG_KEY.test(parsed.secretHeaderName)) {
      throw new BadRequestException('Webhook secretHeaderName cannot use a generic secret/token/authorization header name.');
    }
  }
  return parsed;
}

function webhookDestinationMetadata(metadata: unknown, executionMode: 'proof_only' | 'live_requested') {
  return {
    ...asRecord(metadata),
    executionMode,
  };
}

function clearWebhookDestinationLiveApproval(metadata: unknown, reason: string) {
  return {
    ...asRecord(metadata),
    liveApproved: false,
    liveApprovedAt: null,
    liveApprovedByMemberId: null,
    liveAllowlistedUrl: null,
    liveRevokedAt: new Date().toISOString(),
    liveRevokedByMemberId: null,
    liveRevokedReason: reason,
  };
}

function webhookDestinationExecutionMode(row: { metadata: Prisma.JsonValue | Record<string, unknown> }) {
  const mode = textValue(asRecord(row.metadata).executionMode);
  return mode === 'live_requested' || mode === 'live' ? 'live_requested' : 'proof_only';
}

function webhookDestinationLiveApproval(row: {
  url: string;
  status: string;
  metadata: Prisma.JsonValue | Record<string, unknown>;
}) {
  const metadata = asRecord(row.metadata);
  const liveAllowlistedUrl = textValue(metadata.liveAllowlistedUrl) || null;
  const liveApprovedAt = textValue(metadata.liveApprovedAt) || null;
  const liveApprovedByMemberId = textValue(metadata.liveApprovedByMemberId) || null;
  const liveApproved = metadata.liveApproved === true
    && row.status === 'active'
    && webhookDestinationExecutionMode(row) === 'live_requested'
    && Boolean(liveApprovedAt)
    && liveAllowlistedUrl === row.url;
  return {
    liveApproved,
    liveApprovedAt: liveApproved ? liveApprovedAt : null,
    liveApprovedByMemberId: liveApproved ? liveApprovedByMemberId : null,
    liveAllowlistedUrl,
  };
}

function webhookDestinationUrlError(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Webhook destination URL is invalid.';
  }
  if (parsed.protocol !== 'https:') return 'Webhook destination URL must use https.';
  if (parsed.username || parsed.password) return 'Webhook destination URL must not contain credentials.';
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_FLOW_CONFIG_KEY.test(key)) return 'Webhook destination URL must not contain secret query parameters.';
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return 'Webhook destination host must be a public hostname.';
  }
  const ipVersion = isIP(host);
  if ((ipVersion === 4 || ipVersion === 6) && isPrivateWebhookIp(host, ipVersion)) {
    return 'Webhook destination cannot target localhost or private network addresses.';
  }
  return null;
}

function isPrivateWebhookIp(host: string, ipVersion: 0 | 4 | 6) {
  if (ipVersion === 4) {
    const parts = host.split('.').map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a === 0
    );
  }
  return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
}

function toWebhookDestinationDto(row: {
  id: string;
  name: string;
  slug: string;
  url: string;
  status: string;
  authType: string;
  secretHeaderName: string | null;
  secretValueEncrypted: string | null;
  timeoutMs: number;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): MailFlowWebhookDestinationDto {
  const liveApproval = webhookDestinationLiveApproval(row);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    url: row.url,
    status: row.status === 'active' ? 'active' : 'disabled',
    authType: row.authType === 'header' ? 'header' : 'none',
    executionMode: webhookDestinationExecutionMode(row),
    secretHeaderName: row.secretHeaderName,
    hasSecret: Boolean(row.secretValueEncrypted),
    timeoutMs: row.timeoutMs,
    liveApproved: liveApproval.liveApproved,
    liveApprovedAt: liveApproval.liveApprovedAt,
    liveApprovedByMemberId: liveApproval.liveApprovedByMemberId,
    liveAllowlistedUrl: liveApproval.liveAllowlistedUrl,
    metadata: asRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ContactDetailRecord = NonNullable<Awaited<ReturnType<MailMarketingRepository['findContactDetail']>>>;
type ContactCustomerSummary = Awaited<ReturnType<MailMarketingRepository['customerSummary']>>;
type ContactCustomerUser = Awaited<ReturnType<MailMarketingRepository['customerUsersForContact']>>[number];
type ContactRecentDelivery = Awaited<ReturnType<MailMarketingRepository['recentDeliveriesForContact']>>[number];
type ContactRecentEvent = Awaited<ReturnType<MailMarketingRepository['recentEventsForContact']>>[number];

function toContactDto(contact: {
  id: string;
  customerId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  tags: Prisma.JsonValue;
  buyerIntent: string | null;
  lifecycleStage: string | null;
  isSendable: boolean;
  consentStates?: Array<{ state: string; category?: string }>;
  lastActivityAt: Date | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  const marketingConsent = contact.consentStates?.find((state) => state.category === 'marketing') ?? contact.consentStates?.[0];
  return {
    id: contact.id,
    customerId: contact.customerId,
    email: contact.email,
    name: contact.name,
    phone: contact.phone,
    tags: Array.isArray(contact.tags) ? contact.tags.map(String) : [],
    buyerIntent: contact.buyerIntent,
    lifecycleStage: contact.lifecycleStage,
    isSendable: contact.isSendable,
    consentState: marketingConsent?.state ?? 'unknown',
    lastActivityAt: contact.lastActivityAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function toContactDetailDto(
  contact: ContactDetailRecord,
  customer: ContactCustomerSummary,
  customerUsers: ContactCustomerUser[],
  recentDeliveries: ContactRecentDelivery[],
  recentEvents: ContactRecentEvent[],
) {
  const fallbackIdentities = [
    { type: 'mail_contact' as const, label: 'Mail contact', value: contact.id, source: 'mail_contacts' },
    { type: 'email' as const, label: 'Email', value: contact.email, source: 'mail_contacts' },
    ...(contact.phone ? [{ type: 'phone' as const, label: 'Phone', value: contact.phone, source: 'mail_contacts' }] : []),
    ...(contact.customerId ? [{ type: 'customer' as const, label: 'Customer', value: contact.customerId, source: 'customers' }] : []),
    ...(customer?.shopifyCustomerId ? [{ type: 'shopify_customer' as const, label: 'Shopify customer', value: customer.shopifyCustomerId, source: 'customers' }] : []),
    ...customerUsers.map((user) => ({
      type: 'customer_user' as const,
      label: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      value: user.email,
      source: 'customer_users',
    })),
  ];
  const storedIdentities = contact.identities.map(toContactIdentityDto).filter((identity) => identity.value);
  const identities = storedIdentities.length > 0 ? storedIdentities : fallbackIdentities;

  return {
    contact: toContactDto(contact),
    customer: customer ? {
      id: customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      totalSpent: customer.totalSpent.toString(),
      ordersCount: customer.ordersCount,
      lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
    } : null,
    identities,
    consentHistory: contact.consentStates.map((state) => ({
      id: state.id,
      channel: state.channel,
      category: state.category,
      state: state.state,
      source: state.source,
      sourceDetail: state.sourceDetail,
      capturedAt: state.capturedAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    })),
    suppressionHistory: contact.suppressions.map((suppression) => ({
      id: suppression.id,
      channel: suppression.channel,
      scope: suppression.scope,
      category: suppression.category,
      campaignId: suppression.campaignId,
      flowId: suppression.flowId,
      templateId: suppression.templateId,
      isActive: suppression.isActive,
      reason: suppression.reason,
      source: suppression.source,
      notes: suppression.notes,
      expiresAt: suppression.expiresAt?.toISOString() ?? null,
      createdAt: suppression.createdAt.toISOString(),
      updatedAt: suppression.updatedAt.toISOString(),
    })),
    audienceMemberships: contact.snapshotMembers.map((member) => ({
      id: member.id,
      snapshotId: member.snapshotId,
      snapshotName: member.snapshot.name,
      audienceId: member.snapshot.audienceId,
      audienceName: member.snapshot.audience?.name ?? null,
      consentState: member.consentState,
      suppressionReason: member.suppressionReason,
      isSendable: member.isSendable,
      createdAt: member.createdAt.toISOString(),
    })),
    recentDeliveries: recentDeliveries.map((delivery) => ({
      id: delivery.id,
      eventKey: delivery.eventKey,
      category: delivery.category,
      templateId: delivery.templateId,
      templateVersionId: delivery.templateVersionId,
      recipientEmail: delivery.recipientEmail,
      subject: delivery.subject,
      status: delivery.status,
      provider: delivery.provider,
      errorMessage: delivery.errorMessage,
      createdAt: delivery.createdAt.toISOString(),
      sentAt: delivery.sentAt?.toISOString() ?? null,
    })),
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      source: event.source,
      createdAt: event.createdAt.toISOString(),
      metadata: asRecord(event.metadata),
    })),
    flowActivity: contact.flowActionLogs.map((log) => ({
      id: log.id,
      flowId: log.flowId,
      flowName: log.flow.name,
      status: log.status,
      nodeKey: log.nodeKey,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

function toContactIdentityDto(identity: ContactDetailRecord['identities'][number]) {
  const metadata = asRecord(identity.metadata);
  const source = textValue(metadata.source) || 'mail_contact_identities';
  const base = {
    type: contactIdentityType(identity.entityType),
    label: contactIdentityLabel(identity.entityType, metadata),
    value: contactIdentityValue(identity),
    source,
  };
  return base;
}

function contactIdentityType(entityType: string) {
  if (
    entityType === 'mail_contact' ||
    entityType === 'customer' ||
    entityType === 'customer_user' ||
    entityType === 'shopify_customer' ||
    entityType === 'email' ||
    entityType === 'phone'
  ) {
    return entityType;
  }
  return 'mail_contact';
}

function contactIdentityLabel(entityType: string, metadata: Record<string, unknown>) {
  if (entityType === 'mail_contact') return 'Mail contact';
  if (entityType === 'customer') return textValue(metadata.customerName) || 'Customer';
  if (entityType === 'customer_user') return textValue(metadata.customerUserName) || 'Customer user';
  if (entityType === 'shopify_customer') return 'Shopify customer';
  if (entityType === 'phone') return 'Phone';
  if (entityType === 'email') return 'Email';
  return entityType.replace(/_/g, ' ');
}

function contactIdentityValue(identity: ContactDetailRecord['identities'][number]) {
  if (identity.entityType === 'email') return identity.email || identity.entityKey;
  if (identity.entityType === 'phone') return identity.phone || identity.entityKey;
  if (identity.entityType === 'customer') return identity.customerId || identity.entityKey;
  if (identity.entityType === 'customer_user') return identity.email || identity.customerUserId || identity.entityKey;
  if (identity.entityType === 'shopify_customer') return identity.shopifyCustomerId || identity.entityKey;
  return identity.entityKey;
}

function toAudienceDto(audience: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  filters: Prisma.JsonValue;
  contactCount: number;
  isArchived: boolean;
  lastCalculatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: audience.id,
    slug: audience.slug,
    name: audience.name,
    description: audience.description,
    filters: asRecord(audience.filters),
    contactCount: audience.contactCount,
    isArchived: audience.isArchived,
    lastCalculatedAt: audience.lastCalculatedAt?.toISOString() ?? null,
    createdAt: audience.createdAt.toISOString(),
    updatedAt: audience.updatedAt.toISOString(),
  };
}

function toSnapshotDto(snapshot: {
  id: string;
  audienceId: string | null;
  name: string;
  summary: Prisma.JsonValue;
  sourceSummary: Prisma.JsonValue;
  memberCount: number;
  reachableCount: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { members: number };
}) {
  return {
    id: snapshot.id,
    audienceId: snapshot.audienceId,
    name: snapshot.name,
    summary: asRecord(snapshot.summary),
    sourceSummary: asRecord(snapshot.sourceSummary),
    memberCount: snapshot.memberCount,
    reachableCount: snapshot.reachableCount,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    storedMembers: snapshot._count?.members ?? snapshot.memberCount,
  };
}

function toSnapshotMemberDto(member: {
  id: string;
  snapshotId: string;
  contactId: string;
  customerId: string | null;
  email: string;
  consentState: string;
  suppressionReason: string | null;
  isSendable: boolean;
  buyerIntent: string | null;
  lastActivityAt: Date | null;
  contact?: { name?: string | null } | null;
}) {
  return {
    id: member.id,
    snapshotId: member.snapshotId,
    contactId: member.contactId,
    customerId: member.customerId,
    email: member.email,
    consentState: member.consentState,
    suppressionReason: member.suppressionReason,
    isSendable: member.isSendable,
    buyerIntent: member.buyerIntent,
    lastActivityAt: member.lastActivityAt?.toISOString() ?? null,
    name: member.contact?.name ?? null,
    contactDetailAvailable: Boolean(member.contactId),
    contactDetailPath: member.contactId ? `/mail-marketing/contacts/${member.contactId}` : null,
  };
}

function toMemberPreviewDto(member: { id: string; firstName: string; lastName: string; email: string } | null | undefined) {
  if (!member) return null;
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return {
    id: member.id,
    name: name || member.email,
    email: member.email,
  };
}

function toCampaignDto(campaign: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  audienceId: string | null;
  snapshotId: string | null;
  templateId: string | null;
  templateVersionId?: string | null;
  subjectOverride?: string | null;
  senderName?: string | null;
  replyTo?: string | null;
  scheduledAt: Date | null;
  queuedAt: Date | null;
  sentAt?: Date | null;
  pausedAt?: Date | null;
  approvedAt?: Date | null;
  createdByMemberId?: string | null;
  approvedByMemberId?: string | null;
  completedAt: Date | null;
  recipientCount: number;
  queuedCount?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount: number;
  suppressedCount?: number;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  audience?: { id: string; name: string } | null;
  snapshot?: { id: string; name: string; memberCount: number; reachableCount: number; sourceSummary?: Prisma.JsonValue | null } | null;
  template?: { id: string; name: string; subject: string } | null;
  templateVersion?: { id: string; versionNumber: number; subject: string; status: string; approvalState: string } | null;
  createdByMember?: { id: string; firstName: string; lastName: string; email: string } | null;
  approvedByMember?: { id: string; firstName: string; lastName: string; email: string } | null;
}) {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status as MailCampaignStatus,
    audienceId: campaign.audienceId,
    snapshotId: campaign.snapshotId,
    templateId: campaign.templateId,
    templateVersionId: campaign.templateVersionId ?? null,
    subjectOverride: campaign.subjectOverride ?? null,
    senderName: campaign.senderName ?? null,
    replyTo: campaign.replyTo ?? null,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    queuedAt: campaign.queuedAt?.toISOString() ?? null,
    sentAt: campaign.sentAt?.toISOString() ?? null,
    pausedAt: campaign.pausedAt?.toISOString() ?? null,
    approvedAt: campaign.approvedAt?.toISOString() ?? null,
    createdByMemberId: campaign.createdByMemberId ?? null,
    approvedByMemberId: campaign.approvedByMemberId ?? null,
    createdByMember: toMemberPreviewDto(campaign.createdByMember),
    approvedByMember: toMemberPreviewDto(campaign.approvedByMember),
    completedAt: campaign.completedAt?.toISOString() ?? null,
    recipientCount: campaign.recipientCount,
    queuedCount: campaign.queuedCount ?? 0,
    sentCount: campaign.sentCount ?? 0,
    failedCount: campaign.failedCount ?? 0,
    skippedCount: campaign.skippedCount,
    suppressedCount: campaign.suppressedCount ?? 0,
    metadata: asRecord(campaign.metadata),
    audience: campaign.audience ?? null,
    snapshot: campaign.snapshot
      ? {
          id: campaign.snapshot.id,
          name: campaign.snapshot.name,
          memberCount: campaign.snapshot.memberCount,
          reachableCount: campaign.snapshot.reachableCount,
          sourceSummary: asRecord(campaign.snapshot.sourceSummary),
        }
      : null,
    template: campaign.template ?? null,
    templateVersion: campaign.templateVersion ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function toFlowDto(flow: {
  id: string;
  slug: string;
  name: string;
  triggerType: string;
  status: string;
  graph: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeVersion?: FlowVersionDtoInput | null;
  versions?: FlowVersionDtoInput[];
  runs?: Array<{ status: string; enrollmentCount: number; completedCount: number; failedCount: number; createdAt: Date }>;
  actionLogs?: Array<{ id: string; actionType: string; status: string; createdAt: Date }>;
  _count?: { runs: number; actionLogs: number };
}, sendingEnabled = false) {
  const latestVersion = flow.versions?.[0] ?? null;
  const activeVersion = flow.activeVersion ?? null;
  const runSummary = summarizeFlowRuns(flow.runs ?? []);
  return {
    id: flow.id,
    slug: flow.slug,
    name: flow.name,
    triggerType: flow.triggerType,
    status: flow.status,
    graph: asRecord(flow.graph),
    metadata: asRecord(flow.metadata),
    sendingEnabled,
    activeVersion: activeVersion ? toFlowVersionDto(activeVersion) : null,
    latestVersion: latestVersion ? toFlowVersionDto(latestVersion) : null,
    nodeCount: activeVersion?.nodes?.length ?? latestVersion?.nodes?.length ?? 0,
    versionCount: flow.versions?.length ?? (latestVersion ? 1 : 0),
    runCount: flow._count?.runs ?? flow.runs?.length ?? 0,
    eventCount: flow._count?.actionLogs ?? flow.actionLogs?.length ?? 0,
    runSummary,
    publishedAt: flow.publishedAt?.toISOString() ?? null,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

type FlowVersionDtoInput = {
  id: string;
  versionNumber: number;
  status: string;
  triggerType: string;
  summary: Prisma.JsonValue;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  nodes?: FlowNodeDtoInput[];
};

type FlowNodeDtoInput = {
  id?: string;
  nodeKey: string;
  nodeType: string;
  label: string;
  description: string | null;
  nextNodeKey: string | null;
  routes: Prisma.JsonValue;
  config: Prisma.JsonValue;
  sortOrder: number;
  positionX: number;
  positionY: number;
};

function selectFlowVersion(flow: MailFlowRecord, selector: MailFlowVersionSelector): { version: FlowVersionDtoInput | null } {
  return {
    version: selector === 'active'
      ? flow.activeVersion ?? null
      : flow.versions?.[0] ?? flow.activeVersion ?? null,
  };
}

function collectFlowGraphIssues(triggerType: string, nodes: NormalizedFlowNode[]) {
  try {
    validateMailFlowGraph(triggerType, nodes);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : 'Flow graph validation failed'];
  }
}

function flowValidationSummary(nodes: NormalizedFlowNode[]) {
  const byType = nodes.reduce<Record<string, number>>((summary, node) => {
    summary[node.nodeType] = (summary[node.nodeType] ?? 0) + 1;
    return summary;
  }, {});
  return {
    nodeCount: nodes.length,
    actionCount: nodes.filter((node) => MAIL_FLOW_ACTION_NODE_TYPES.has(node.nodeType)).length,
    triggerCount: byType.trigger ?? 0,
    sendEmailNodes: byType.send_email ?? 0,
    delayNodes: byType.delay ?? 0,
    conditionNodes: (byType.condition ?? 0) + (byType.split ?? 0),
  };
}

function flowValidationWarnings(flow: MailFlowRecord, version: FlowVersionDtoInput | null, providerMode: MailProviderMode, sendingEnabled: boolean) {
  const warnings: string[] = [];
  if (flow.status === 'paused') warnings.push('Flow is paused; publish references can be valid while runtime remains stopped.');
  if (!sendingEnabled) warnings.push('Marketing delivery is off; email nodes will be skipped until the workspace send control and live provider mode are enabled.');
  if (providerMode === 'disabled') warnings.push('Mail Center provider mode is disabled; runtime email nodes cannot contact customers.');
  if (providerMode === 'test') warnings.push('Mail Center provider mode is test-only; customer-facing marketing email is blocked.');
  if (version && version.status !== 'published') warnings.push('Selected version is not published yet.');
  return warnings;
}

function simulateFlowNode(node: NormalizedFlowNode, providerMode: MailProviderMode, sendingEnabled: boolean) {
  const config = asRecord(node.config as Prisma.JsonValue);
  switch (node.nodeType) {
    case 'trigger':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_match_trigger',
        message: `Would start when ${textValue(config.triggerType) || 'the configured trigger'} is received.`,
      };
    case 'delay': {
      const delayMinutes = Number(config.delayMinutes ?? config.minutes ?? 0);
      const scheduledAt = textValue(config.scheduledAt ?? config.runAt ?? config.waitUntil);
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
      const hasScheduledDate = Boolean(scheduledDate && !Number.isNaN(scheduledDate.getTime()));
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_wait',
        message: hasScheduledDate
          ? `Would wait until ${scheduledDate!.toISOString()}.`
          : `Would wait ${Number.isFinite(delayMinutes) && delayMinutes > 0 ? `${delayMinutes} minute(s)` : 'until the configured delay is valid'}.`,
      };
    }
    case 'condition':
    case 'split':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_evaluate_condition',
        message: `Would check ${textValue(config.field) || 'the configured field'} and route through the matching branch.`,
      };
    case 'send_email':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_evaluate_delivery_gate',
        message: !sendingEnabled
          ? 'Simulation does not send email. Runtime would skip this node until Marketing delivery is enabled in workspace settings.'
          : providerMode === 'live'
            ? 'Simulation does not send email. Runtime would evaluate consent, suppression, category, quiet-hours, frequency, and provider checks.'
            : `Simulation does not send email. Runtime would skip this node because Mail Center is in ${providerMode} mode.`,
      };
    case 'create_sales_task':
    case 'create_follow_up_task':
    case 'create_followup_task':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_create_follow_up',
        message: `Would prepare a ${mailFlowTaskAxis(config, node.nodeType) ?? 'blocked'} follow-up task if customer context and assignee rules pass.`,
      };
    case 'add_to_audience':
    case 'remove_from_audience':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_update_audience_membership',
        message: 'Would update tenant-scoped audience membership during real runtime; simulation does not mutate membership.',
      };
    case 'update_contact_tag':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_update_contact_tags',
        message: 'Would update contact tags during real runtime; simulation does not mutate contact data.',
      };
    case 'webhook':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_record_webhook_proof',
        message: 'Would validate the tenant-owned webhook destination and record proof; simulation never calls outbound webhooks.',
      };
    case 'emit_internal_event':
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'would_emit_internal_event',
        message: 'Would record the configured tenant-scoped internal event during runtime; simulation does not mutate the event ledger.',
      };
    default:
      return {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        label: node.label,
        outcome: 'blocked_unknown_node',
        message: 'Node type is not supported by the mail flow runtime.',
      };
  }
}

type FlowEnrollmentProcessingInput = {
  id: string;
  flowId: string;
  flowVersionId: string | null;
  flowRunId: string;
  contactId: string | null;
  customerId: string | null;
  email: string | null;
  eventPayload: Prisma.JsonValue;
  contact?: {
    id: string;
    email: string;
    name: string | null;
    customerId: string | null;
    isSendable: boolean;
    consentStates?: Array<{ id: string; state: string; channel: string; category: string }>;
    suppressions?: SuppressionScopeInput[];
  } | null;
};

type FlowEventTarget = {
  id: string | null;
  customerId: string | null;
  email: string | null;
  isSendable: boolean;
  consentStates?: Array<{ state: string; channel: string; category: string }>;
  suppressions?: SuppressionScopeInput[];
};

function toFlowVersionDto(version: FlowVersionDtoInput) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    triggerType: version.triggerType,
    summary: asRecord(version.summary),
    nodeCount: version.nodes?.length ?? 0,
    nodes: version.nodes?.map(toFlowNodeDto) ?? [],
    publishedAt: version.publishedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

function toFlowNodeDto(node: FlowNodeDtoInput) {
  return {
    id: node.id ?? node.nodeKey,
    nodeKey: node.nodeKey,
    nodeType: node.nodeType,
    label: node.label,
    description: node.description,
    nextNodeKey: node.nextNodeKey,
    routes: Array.isArray(node.routes) ? node.routes : [],
    config: asRecord(node.config),
    sortOrder: node.sortOrder,
    positionX: node.positionX,
    positionY: node.positionY,
  };
}

function toFlowRunDto(run: {
  id: string;
  status: string;
  triggerType: string;
  triggerEventType: string | null;
  enrollmentCount: number;
  completedCount: number;
  failedCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  enrollments?: Array<{
    id: string;
    status: string;
    email: string | null;
    currentNodeKey: string | null;
    lastError: string | null;
    nextRunAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: run.id,
    status: run.status,
    triggerType: run.triggerType,
    triggerEventType: run.triggerEventType,
    enrollmentCount: run.enrollmentCount,
    completedCount: run.completedCount,
    failedCount: run.failedCount,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    enrollments: run.enrollments?.map((enrollment) => ({
      id: enrollment.id,
      status: enrollment.status,
      email: enrollment.email,
      currentNodeKey: enrollment.currentNodeKey,
      lastError: enrollment.lastError,
      nextRunAt: enrollment.nextRunAt?.toISOString() ?? null,
      createdAt: enrollment.createdAt.toISOString(),
    })) ?? [],
  };
}

function toFlowEventDto(event: {
  id: string;
  actionType: string;
  status: string;
  nodeKey: string | null;
  message: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
  enrollmentId: string | null;
  flowRunId: string | null;
}) {
  return {
    id: event.id,
    actionType: event.actionType,
    status: event.status,
    nodeKey: event.nodeKey,
    message: event.message,
    payload: asRecord(event.payload),
    createdAt: event.createdAt.toISOString(),
    enrollmentId: event.enrollmentId,
    runId: event.flowRunId,
  };
}

function toEventDto(event: {
  id: string;
  eventType: string;
  status: string;
  createdAt: Date;
  metadata: Prisma.JsonValue;
}) {
  return {
    id: event.id,
    eventType: event.eventType,
    status: event.status,
    createdAt: event.createdAt.toISOString(),
    metadata: asRecord(event.metadata),
  };
}

function matchesAudience(contact: AudienceContactRecord, filters: MailAudienceFilterInput, context?: AudienceContactContext) {
  const consentState = contact.consentStates?.[0]?.state ?? 'unknown';
  const isSuppressed = Boolean(effectiveSuppressionReason(contact.suppressions, { category: 'marketing' })) || !contact.isSendable;
  if (!filters.includeSuppressed && isSuppressed) return false;
  if (!filters.includeUnknownConsent && consentState === 'unknown') return false;
  if (!matchesSourceSelectors(contact, filters, context)) return false;
  if (!matchesBusinessSelectors(contact, filters, context)) return false;
  const checks = filters.conditions.map((condition) => matchesCondition(valueFor(contact, context, condition.field), condition.operator, condition.value));
  const conditionResult = checks.length === 0 ? true : filters.matchMode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
  return conditionResult;
}

function audienceStrategySignals(contact: AudienceContactRecord, context?: AudienceContactContext): Record<string, unknown> {
  const consentStatus = contact.consentStates?.[0]?.state ?? 'unknown';
  const suppressed = Boolean(effectiveSuppressionReason(contact.suppressions, { category: 'marketing' })) || !contact.isSendable;
  const segmentIds = [
    ...Array.from(context?.localSegmentIds ?? []),
    ...Array.from(context?.shopifySegmentIds ?? []),
  ];
  const daysSinceOrder = context?.lastOrderAt ? (Date.now() - context.lastOrderAt.getTime()) / 86_400_000 : null;
  const daysSinceActivity = contact.lastActivityAt ? (Date.now() - contact.lastActivityAt.getTime()) / 86_400_000 : null;
  return {
    consentStatus,
    suppressed,
    lastOrderAt: context?.lastOrderAt ?? null,
    segmentIds,
    campaignHistory: Number(asRecord(contact.metadata).campaignHistory ?? 0),
    emailDeliverability: contact.isSendable ? 'sendable' : 'blocked',
    consent: contact.isSendable && consentStatus !== 'unsubscribed' && !suppressed,
    segmentMatch: segmentIds.length,
    recency: daysSinceOrder === null ? 0 : Math.max(0, 180 - daysSinceOrder),
    purchaseHistory: Number(context?.orderCount ?? 0) + Number(context?.totalSpent ?? 0) / 500,
    engagement: daysSinceActivity === null ? 0 : Math.max(0, 90 - daysSinceActivity),
    totalSpent: context?.totalSpent ?? 0,
    createdAt: contact.createdAt,
    urgencyScore: contact.isSendable && consentStatus !== 'unsubscribed' && !suppressed ? 50 : 0,
  };
}

function campaignSendSafetySignals(member: {
  email: string;
  consentState: string;
  suppressionReason: string | null;
  isSendable: boolean;
  contact?: {
    isSendable: boolean;
    consentStates?: Array<{ state: string }>;
    suppressions?: SuppressionScopeInput[];
  } | null;
}, options: { providerMode: MailProviderMode | 'disabled'; templateApproved: boolean; campaignId: string; templateId: string }): Record<string, unknown> {
  const consentStatus = member.contact?.consentStates?.[0]?.state ?? member.consentState ?? 'unknown';
  const suppressed = Boolean(member.suppressionReason) || Boolean(effectiveSuppressionReason(member.contact?.suppressions, {
    category: 'marketing',
    campaignId: options.campaignId,
    templateId: options.templateId,
  })) || !member.isSendable || member.contact?.isSendable === false;
  return {
    consentStatus,
    suppressed,
    providerMode: options.providerMode,
    templateApproved: options.templateApproved,
    rateLimitState: 'ok',
    idempotencyKey: `campaign:${options.campaignId}:${member.email}:${options.templateId}`,
    templateApproval: options.templateApproved,
    suppression: suppressed ? -1 : 1,
    rateLimit: 1,
    providerReadiness: options.providerMode === 'live' ? 1 : 0,
    priority: suppressed || consentStatus === 'unsubscribed' ? 0 : 50,
    createdAt: new Date(),
    urgencyScore: suppressed || consentStatus === 'unsubscribed' ? 0 : 50,
  };
}

function flowSendSafetySignals(
  enrollment: FlowEnrollmentProcessingInput,
  options: { providerMode: MailProviderMode | 'disabled'; templateApproved: boolean; templateId: string; nodeKey: string },
): Record<string, unknown> {
  const consentStatus = enrollment.contact?.consentStates?.[0]?.state ?? 'unknown';
  const suppressed = Boolean(effectiveSuppressionReason(enrollment.contact?.suppressions, {
    category: 'marketing',
    flowId: enrollment.flowId,
    templateId: options.templateId,
  })) || enrollment.contact?.isSendable === false;
  return {
    consentStatus,
    suppressed,
    providerMode: options.providerMode,
    templateApproved: options.templateApproved,
    rateLimitState: 'ok',
    idempotencyKey: `flow:${enrollment.flowId}:${enrollment.id}:${options.nodeKey}:${options.templateId}`,
    templateApproval: options.templateApproved,
    suppression: suppressed ? -1 : 1,
    rateLimit: 1,
    providerReadiness: options.providerMode === 'live' ? 1 : 0,
    priority: suppressed || consentStatus === 'unsubscribed' ? 0 : 50,
    createdAt: new Date(),
    urgencyScore: suppressed || consentStatus === 'unsubscribed' ? 0 : 50,
  };
}

function asAudienceFilters(value: Prisma.JsonValue | unknown): MailAudienceFilterInput {
  const parsed = mailAudienceFilterSchema.parse(isRecord(value) ? value : {});
  return {
    ...parsed,
    segmentIds: uniqueStrings(parsed.segmentIds),
    localSegmentIds: uniqueStrings([...parsed.localSegmentIds, ...parsed.segmentIds]),
    shopifySegmentIds: uniqueStrings(parsed.shopifySegmentIds),
    manualListIds: uniqueStrings(parsed.manualListIds),
    emails: uniqueStrings(parsed.emails.map((email) => email.toLowerCase())),
    tags: uniqueStrings(parsed.tags),
    lifecycleStages: uniqueStrings(parsed.lifecycleStages),
    customerOwnerMemberIds: uniqueStrings(parsed.customerOwnerMemberIds),
    assignmentAxes: uniqueStrings(parsed.assignmentAxes),
    productSkus: uniqueStrings(parsed.productSkus),
    productNames: uniqueStrings(parsed.productNames),
    productFamilies: uniqueStrings(parsed.productFamilies),
  };
}

function matchesSourceSelectors(contact: AudienceContactRecord, filters: MailAudienceFilterInput, context?: AudienceContactContext) {
  const localSegmentIds = uniqueStrings([...filters.localSegmentIds, ...filters.segmentIds]);
  const hasSourceSelector = localSegmentIds.length > 0 || filters.shopifySegmentIds.length > 0 || filters.manualListIds.length > 0 || filters.emails.length > 0;
  if (!hasSourceSelector) return true;
  const contactEmail = contact.email.trim().toLowerCase();
  if (filters.emails.map(normalize).includes(contactEmail)) return true;
  if (localSegmentIds.some((id) => context?.localSegmentIds.has(id) || normalizedSetHas(context?.localSegmentNames, id))) return true;
  if (filters.shopifySegmentIds.some((id) => context?.shopifySegmentIds.has(id) || normalizedSetHas(context?.shopifySegmentNames, id))) return true;
  if (filters.manualListIds.some((id) => context?.manualListIds.has(id) || normalizedSetHas(context?.manualListNames, id))) return true;
  return false;
}

function matchesBusinessSelectors(contact: AudienceContactRecord, filters: MailAudienceFilterInput, context?: AudienceContactContext) {
  if (filters.tags.length > 0 && !hasOverlap(context?.tags ?? jsonStringArray(contact.tags), filters.tags)) return false;
  if (filters.lifecycleStages.length > 0) {
    const stages = [contact.lifecycleStage, context?.customer?.status, context?.customer?.lastOrderAt ? 'customer' : null].filter(Boolean).map(String);
    if (!hasOverlap(stages, filters.lifecycleStages)) return false;
  }
  if (filters.customerOwnerMemberIds.length > 0) {
    const axes = new Set(filters.assignmentAxes.map(normalize));
    const ownerMatch = (context?.assignments ?? []).some((assignment) => {
      const memberMatches = filters.customerOwnerMemberIds.map(normalize).includes(normalize(assignment.memberId));
      const axisMatches = axes.size === 0 || axes.has(normalize(assignment.axis));
      return memberMatches && axisMatches;
    });
    if (!ownerMatch) return false;
  }
  if (!numberWithin(context?.orderCount ?? 0, filters.orderCountMin, filters.orderCountMax)) return false;
  if (!numberWithin(context?.totalSpent ?? 0, filters.totalSpentMin, filters.totalSpentMax)) return false;
  if (!dateWithin(context?.lastOrderAt ?? null, filters.lastOrderAfter, filters.lastOrderBefore)) return false;
  const productFilters = [...filters.productSkus, ...filters.productNames, ...filters.productFamilies, filters.productQuery ?? ''].filter(Boolean);
  if (productFilters.length > 0 && !hasOverlap(context?.orderLineTokens ?? [], productFilters)) return false;
  return true;
}

function memberVariables(
  member: { email: string; contactId?: string | null; customerId: string | null; buyerIntent: string | null },
  urls: Record<string, string>,
) {
  return {
    contact: { email: member.email },
    customer: { id: member.customerId, email: member.email },
    intent: member.buyerIntent,
    urls,
  };
}

function invalidMailPreferencePage() {
  return mailPreferenceHtmlPage({
    title: 'Email preferences',
    heading: 'This email preferences link is not valid',
    message: 'The link is missing, expired, or does not match a valid recipient. Please use the latest link from a recent email.',
  });
}

function audienceMemberKey(contactId: string | null, email: string) {
  return `${contactId || 'email'}:${email.trim().toLowerCase()}`;
}

function campaignMemberBlockReason(member: {
  isSendable: boolean;
  consentState: string;
  suppressionReason: string | null;
  contact?: {
    isSendable: boolean;
    consentStates?: Array<{ state: string }>;
    suppressions?: SuppressionScopeInput[];
  } | null;
}, context: SuppressionMatchContext) {
  if (!member.isSendable) return member.suppressionReason || 'snapshot_not_sendable';
  if (member.consentState === 'unsubscribed') return 'snapshot_unsubscribed';
  if (member.contact && !member.contact.isSendable) return 'contact_not_sendable';
  if (member.contact?.consentStates?.[0]?.state === 'unsubscribed') return 'unsubscribed';
  const suppressionReason = effectiveSuppressionReason(member.contact?.suppressions, context);
  if (suppressionReason) return suppressionReason;
  return null;
}

function analyticsRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(1, days) + 1);
  start.setHours(0, 0, 0, 0);
  return { start, end, days };
}

function toAnalyticsRangeDto(range: { start: Date; end: Date; days: number }) {
  return {
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    days: range.days,
  };
}

function campaignAnalyticsRows(bundle: AnalyticsBundleView) {
  const deliveriesByCampaign = groupBy(bundle.deliveries, (delivery) => textValue(asRecord(delivery.metadata).campaignId));
  return bundle.campaigns.map((campaign) => {
    const deliveries = deliveriesByCampaign.get(campaign.id) ?? [];
    const stats = deliveryStats(deliveries);
    const attribution = bundle.attribution.byCampaignId.get(campaign.id) ?? { orders: 0, revenue: 0 };
    return sortReadyRow({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      type: 'campaign',
      deliveryCount: deliveries.length,
      queuedDisabled: stats.queuedDisabled,
      sentCount: Math.max(stats.sent, campaign.sentCount),
      failedCount: Math.max(stats.failed, campaign.failedCount),
      skippedCount: Math.max(stats.skipped, campaign.skippedCount),
      suppressedCount: Math.max(stats.suppressed, campaign.suppressedCount),
      snapshotCount: campaign.snapshot?.memberCount ?? campaign.recipientCount,
      reachableCount: campaign.snapshot?.reachableCount ?? campaign.queuedCount,
      conservativeOrders: attribution.orders,
      conservativeRevenue: roundCurrency(attribution.revenue),
      lastActivityAt: (campaign.queuedAt ?? campaign.sentAt ?? campaign.updatedAt).toISOString(),
      notes: [
        campaign.templateVersionId ? `Pinned template revision ${campaign.templateVersion?.versionNumber ?? campaign.templateVersionId}` : 'No pinned template revision',
        campaign.snapshotId ? 'Frozen audience snapshot is attached' : 'No frozen audience snapshot yet',
        campaign.status === 'queued_disabled' ? 'Proof-only delivery was recorded' : `Campaign is ${humanizeKey(campaign.status)}`,
      ],
    });
  }).sort(compareAnalyticsRows);
}

function templateAnalyticsRows(bundle: AnalyticsBundleView) {
  const deliveriesByTemplate = groupBy(bundle.deliveries, (delivery) => delivery.templateId ?? '');
  return bundle.templates.map((template) => {
    const deliveries = deliveriesByTemplate.get(template.id) ?? [];
    const stats = deliveryStats(deliveries);
    const attribution = bundle.attribution.byTemplateId.get(template.id) ?? { orders: 0, revenue: 0 };
    return sortReadyRow({
      id: template.id,
      name: template.name,
      status: template.status,
      type: template.templateType,
      deliveryCount: deliveries.length,
      queuedDisabled: stats.queuedDisabled,
      sentCount: stats.sent,
      failedCount: stats.failed,
      skippedCount: stats.skipped,
      suppressedCount: stats.suppressed,
      snapshotCount: template._count.campaigns,
      reachableCount: undefined,
      conservativeOrders: attribution.orders,
      conservativeRevenue: roundCurrency(attribution.revenue),
      lastActivityAt: template.updatedAt.toISOString(),
      notes: [
        template.publishedVersion ? `Published revision ${template.publishedVersion.versionNumber}` : 'No published revision',
        `${template._count.versions} stored revision(s)`,
        `${template._count.mailDeliveries} total delivery proof record(s)`,
      ],
    });
  }).sort(compareAnalyticsRows);
}

function audienceAnalyticsRows(bundle: AnalyticsBundleView) {
  const campaignRows = campaignAnalyticsRows(bundle);
  const campaignRowsByAudience = groupBy(
    campaignRows.map((row) => {
      const campaign = bundle.campaigns.find((item) => item.id === row.id);
      return { ...row, audienceId: campaign?.audienceId ?? '' };
    }),
    (row) => row.audienceId,
  );
  return bundle.audiences.map((audience) => {
    const rows = campaignRowsByAudience.get(audience.id) ?? [];
    const latestSnapshot = audience.snapshots[0] ?? null;
    return sortReadyRow({
      id: audience.id,
      name: audience.name,
      status: audience.isArchived ? 'archived' : 'active',
      type: 'audience',
      deliveryCount: sum(rows, (row) => row.deliveryCount),
      queuedDisabled: sum(rows, (row) => row.queuedDisabled),
      sentCount: sum(rows, (row) => row.sentCount),
      failedCount: sum(rows, (row) => row.failedCount),
      skippedCount: sum(rows, (row) => row.skippedCount),
      suppressedCount: sum(rows, (row) => row.suppressedCount),
      snapshotCount: audience._count.snapshots,
      reachableCount: latestSnapshot?.reachableCount ?? audience.contactCount,
      conservativeOrders: sum(rows, (row) => row.conservativeOrders),
      conservativeRevenue: roundCurrency(sum(rows, (row) => row.conservativeRevenue)),
      lastActivityAt: (latestSnapshot?.createdAt ?? audience.updatedAt).toISOString(),
      notes: [
        `${audience.contactCount} current matched contact(s)`,
        latestSnapshot ? `Latest snapshot: ${latestSnapshot.reachableCount}/${latestSnapshot.memberCount} reachable` : 'No frozen snapshot yet',
        `${audience._count.campaigns} campaign(s) use this audience`,
      ],
    });
  }).sort(compareAnalyticsRows);
}

function flowAnalyticsRows(bundle: AnalyticsBundleView) {
  const logsByFlow = groupBy(bundle.flowLogs, (log) => log.flowId);
  return bundle.flows.map((flow) => {
    const logs = logsByFlow.get(flow.id) ?? [];
    const sentActions = logs.filter((log) => log.actionType === 'send_email' || log.actionType === 'send_mail').length;
    const failedActions = logs.filter((log) => log.status === 'failed' || log.status === 'skipped').length;
    return sortReadyRow({
      id: flow.id,
      name: flow.name,
      status: flow.status,
      type: flow.triggerType,
      deliveryCount: sentActions,
      queuedDisabled: logs.filter((log) => asRecord(log.payload).providerMode === 'disabled').length,
      sentCount: 0,
      failedCount: failedActions,
      skippedCount: logs.filter((log) => log.status === 'skipped').length,
      suppressedCount: 0,
      snapshotCount: flow._count.runs,
      reachableCount: flow._count.enrollments,
      flowActionCount: logs.length,
      conservativeOrders: 0,
      conservativeRevenue: 0,
      lastActivityAt: flow.updatedAt.toISOString(),
      notes: [
        flow.activeVersion ? `Active version ${flow.activeVersion.versionNumber}` : 'No active version',
        `${flow._count.actionLogs} lifetime action log(s)`,
        `${logs.length} action log(s) in selected window`,
      ],
    });
  }).sort(compareAnalyticsRows);
}

function dailyAnalyticsSeries(bundle: AnalyticsBundleView) {
  const rows = new Map<string, {
    date: string;
    queuedDisabled: number;
    queued: number;
    sent: number;
    failed: number;
    skipped: number;
    providerEvents: number;
    deliveredEvents: number;
    openedEvents: number;
    clickedEvents: number;
    bouncedEvents: number;
    complainedEvents: number;
    activeSuppressions: number;
    conservativeOrders: number;
    conservativeRevenue: number;
  }>();
  const cursor = new Date(bundle.range.start);
  while (cursor <= bundle.range.end) {
    const date = dateKey(cursor);
    rows.set(date, {
      date,
      queuedDisabled: 0,
      queued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      providerEvents: 0,
      deliveredEvents: 0,
      openedEvents: 0,
      clickedEvents: 0,
      bouncedEvents: 0,
      complainedEvents: 0,
      activeSuppressions: 0,
      conservativeOrders: 0,
      conservativeRevenue: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const delivery of bundle.deliveries) {
    const row = rows.get(dateKey(delivery.createdAt));
    if (!row) continue;
    if (delivery.status === 'queued_disabled') row.queuedDisabled += 1;
    if (delivery.status === 'queued') row.queued += 1;
    if (delivery.status === 'sent') row.sent += 1;
    if (delivery.status === 'failed') row.failed += 1;
    if (delivery.status === 'skipped') row.skipped += 1;
  }
  for (const event of bundle.providerEvents) {
    const eventAt = event.occurredAt ?? event.receivedAt;
    const row = rows.get(dateKey(eventAt));
    if (!row) continue;
    row.providerEvents += 1;
    if (event.eventType === 'email.delivered') row.deliveredEvents += 1;
    if (event.eventType === 'email.opened') row.openedEvents += 1;
    if (event.eventType === 'email.clicked') row.clickedEvents += 1;
    if (event.eventType === 'email.bounced') row.bouncedEvents += 1;
    if (event.eventType === 'email.complained') row.complainedEvents += 1;
  }
  for (const suppression of bundle.suppressions) {
    if (suppression.createdAt < bundle.range.start) continue;
    const row = rows.get(dateKey(suppression.createdAt));
    if (row) row.activeSuppressions += 1;
  }
  return Array.from(rows.values()).reverse();
}

function analyticsFunnelStages(bundle: AnalyticsBundleView) {
  const snapshotMembers = sum(bundle.snapshots, (snapshot) => snapshot.memberCount);
  const reachableMembers = sum(bundle.snapshots, (snapshot) => snapshot.reachableCount);
  const deliveryProof = bundle.deliveries.length;
  const providerSent = countDeliveries(bundle.deliveries, 'sent');
  const delivered = countProviderEvents(bundle.providerEvents, 'email.delivered');
  const opened = countProviderEvents(bundle.providerEvents, 'email.opened');
  const clicked = countProviderEvents(bundle.providerEvents, 'email.clicked');
  const orders = bundle.attribution.totalOrders;
  const blockedBeforeDelivery = Math.max(0, snapshotMembers - reachableMembers) + bundle.suppressions.length;
  const blockedAtDelivery = countDeliveries(bundle.deliveries, 'queued_disabled') + countDeliveries(bundle.deliveries, 'skipped') + countDeliveries(bundle.deliveries, 'failed');
  const bouncedOrComplained = countProviderEvents(bundle.providerEvents, 'email.bounced') + countProviderEvents(bundle.providerEvents, 'email.complained');
  return [
    funnelStage('snapshot_members', 'Frozen audience members', snapshotMembers, null, blockedBeforeDelivery, 'Members captured in saved audience snapshots during the selected window.'),
    funnelStage('reachable_members', 'Reachable after consent/suppression', reachableMembers, snapshotMembers, blockedBeforeDelivery, 'Reachable count comes from frozen snapshots; blocked people are not counted as reachable.'),
    funnelStage('delivery_proof', 'Delivery proof records', deliveryProof, reachableMembers || snapshotMembers, blockedAtDelivery, 'Mail delivery rows are persisted proof, including disabled-provider and skipped outcomes.'),
    funnelStage('provider_sent', 'Provider accepted sends', providerSent, deliveryProof, blockedAtDelivery, 'Only rows marked sent count here; disabled proof is not treated as customer delivery.'),
    funnelStage('verified_delivered', 'Verified delivered events', delivered, providerSent, bouncedOrComplained, 'Delivered events require stored provider webhook proof.'),
    funnelStage('verified_opened', 'Verified opened events', opened, delivered, 0, 'Open events are shown only when Resend webhook events exist.'),
    funnelStage('verified_clicked', 'Verified clicked events', clicked, opened, 0, 'Click events are shown only when Resend webhook events exist.'),
    funnelStage('conservative_orders', 'Customer/order matches after delivery', orders, Math.max(clicked, delivered, providerSent, deliveryProof), 0, 'Orders require customerId match and order date after the recorded delivery.'),
  ];
}

function funnelStage(key: string, label: string, count: number, previousCount: number | null, blockerCount: number, note: string) {
  return {
    key,
    label,
    count,
    previousCount,
    conversionRate: previousCount && previousCount > 0 ? Math.round((count / previousCount) * 10000) / 100 : null,
    blockerCount,
    note,
  };
}

function analyticsCohortRows(bundle: AnalyticsBundleView) {
  const rowsByDate = groupBy(bundle.attribution.rows, (row) => dateKey(row.order.processedAt ?? row.order.createdAt));
  return Array.from(rowsByDate.entries())
    .map(([cohortKey, rows]) => {
      const orders = rows.map((row) => row.order);
      const orderDates = orders
        .map((order) => order.processedAt ?? order.createdAt)
        .sort((left, right) => left.getTime() - right.getTime());
      return {
        cohortKey,
        label: cohortKey,
        customerCount: uniqueCount(orders.map((order) => order.customerId)),
        orderCount: orders.length,
        revenue: roundCurrency(sum(rows, (row) => row.revenue)),
        deliveryProofCount: uniqueCount(rows.map((row) => row.delivery.id)),
        firstOrderAt: orderDates[0]?.toISOString() ?? null,
        lastOrderAt: orderDates[orderDates.length - 1]?.toISOString() ?? null,
        notes: [
          'CustomerId matched a delivery proof row.',
          'Order occurred after the matched delivery.',
          'No email-only, phone-only, fingerprint, or session attribution was used.',
        ],
      };
    })
    .sort((left, right) => right.cohortKey.localeCompare(left.cohortKey));
}

function analyticsProofNotes() {
  return [
    'Provider mode is disabled; analytics reports stored proof and blockers, not successful external delivery.',
    'Open and click metrics are counted only from verified Resend webhook events.',
    'Revenue attribution is conservative: customerId must match and the order must occur after a recorded delivery.',
    'The dashboard reads persisted DB records only; it does not re-run transcript or model analysis.',
  ];
}

function countDeliveries(deliveries: AnalyticsDeliveryRecord[], status: string) {
  return deliveries.filter((delivery) => delivery.status === status).length;
}

function countProviderEvents(events: AnalyticsProviderEventRecord[], eventType: string) {
  return events.filter((event) => event.eventType === eventType).length;
}

function deliveryStats(deliveries: AnalyticsDeliveryRecord[]) {
  return {
    queuedDisabled: countDeliveries(deliveries, 'queued_disabled'),
    sent: countDeliveries(deliveries, 'sent'),
    failed: countDeliveries(deliveries, 'failed'),
    skipped: countDeliveries(deliveries, 'skipped'),
    suppressed: deliveries.filter((delivery) => {
      const reason = textValue(asRecord(delivery.metadata).suppressionReason) || textValue(asRecord(delivery.metadata).blockReason);
      return Boolean(reason);
    }).length,
  };
}

function breakdown<T>(rows: T[], keyFn: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, label: humanizeKey(key), count }))
    .sort((left, right) => right.count - left.count);
}

function incrementAttribution(map: Map<string, { orders: number; revenue: number }>, key: string, revenue: number) {
  const current = map.get(key) ?? { orders: 0, revenue: 0 };
  current.orders += 1;
  current.revenue += revenue;
  map.set(key, current);
}

function sortReadyRow<T extends { conservativeRevenue: number }>(row: T) {
  return row;
}

function compareAnalyticsRows(left: { deliveryCount: number; conservativeRevenue: number; lastActivityAt: string | null }, right: { deliveryCount: number; conservativeRevenue: number; lastActivityAt: string | null }) {
  if (right.conservativeRevenue !== left.conservativeRevenue) return right.conservativeRevenue - left.conservativeRevenue;
  if (right.deliveryCount !== left.deliveryCount) return right.deliveryCount - left.deliveryCount;
  return String(right.lastActivityAt ?? '').localeCompare(String(left.lastActivityAt ?? ''));
}

function sum<T>(rows: T[], valueFn: (row: T) => number | undefined) {
  return rows.reduce((total, row) => total + (valueFn(row) ?? 0), 0);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function humanizeKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderTemplate(source: string, variables: Record<string, unknown>, options: { escapeHtml?: boolean } = {}) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, variables);
    if (value === undefined || value === null) return '';
    const rendered = String(value);
    return options.escapeHtml ? escapeHtml(rendered) : rendered;
  });
}

function valueFor(contact: AudienceContactRecord, context: AudienceContactContext | undefined, field: string) {
  if (field === 'email') return contact.email;
  if (field === 'name') return contact.name;
  if (field === 'phone') return contact.phone;
  if (field === 'tags') return context?.tags ?? jsonStringArray(contact.tags);
  if (field === 'buyerIntent') return contact.buyerIntent;
  if (field === 'lifecycleStage') return contact.lifecycleStage ?? context?.customer?.status;
  if (field === 'isSendable') return contact.isSendable;
  if (field === 'consentState') return contact.consentStates?.[0]?.state ?? 'unknown';
  if (field === 'customerId') return context?.customer?.id ?? contact.customerId;
  if (field === 'shopifyCustomerId') return context?.customer?.shopifyCustomerId;
  if (field === 'localSegmentId' || field === 'segmentId') return Array.from(context?.localSegmentIds ?? []);
  if (field === 'localSegmentName' || field === 'segmentName') return Array.from(context?.localSegmentNames ?? []);
  if (field === 'shopifySegmentId') return Array.from(context?.shopifySegmentIds ?? []);
  if (field === 'shopifySegmentName') return Array.from(context?.shopifySegmentNames ?? []);
  if (field === 'manualListId') return Array.from(context?.manualListIds ?? []);
  if (field === 'manualListName') return Array.from(context?.manualListNames ?? []);
  if (field === 'ownerMemberId' || field === 'customerOwnerMemberId') return (context?.assignments ?? []).map((assignment) => assignment.memberId);
  if (field === 'assignmentAxis') return (context?.assignments ?? []).map((assignment) => assignment.axis);
  if (field === 'orderCount') return context?.orderCount ?? 0;
  if (field === 'totalSpent') return context?.totalSpent ?? 0;
  if (field === 'lastOrderAt') return context?.lastOrderAt?.toISOString() ?? null;
  if (field === 'product' || field === 'productSku' || field === 'productName' || field === 'productFamily') return context?.orderLineTokens ?? [];
  return asRecord(contact.metadata ?? {})[field];
}

function matchesCondition(actual: unknown, operator: string, expected: unknown) {
  if (Array.isArray(actual)) {
    const expectedValues = Array.isArray(expected) ? expected.map(normalize) : String(expected ?? '').split(',').map(normalize);
    if (operator === 'contains' || operator === 'in') return actual.map(normalize).some((value) => expectedValues.includes(value));
    if (operator === 'notIn') return actual.map(normalize).every((value) => !expectedValues.includes(value));
  }
  const left = normalize(actual);
  const right = normalize(expected);
  if (operator === 'eq') return left === right;
  if (operator === 'neq') return left !== right;
  if (operator === 'contains') return left.includes(right);
  if (operator === 'in') return right.split(',').map(normalize).includes(left);
  if (operator === 'notIn') return !right.split(',').map(normalize).includes(left);
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  if (operator === 'gt') return leftNumber > rightNumber;
  if (operator === 'gte') return leftNumber >= rightNumber;
  if (operator === 'lt') return leftNumber < rightNumber;
  if (operator === 'lte') return leftNumber <= rightNumber;
  return false;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function uniqueCount(values: Array<string | null | undefined>) {
  return uniqueStrings(values).length;
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.id, row);
  return Array.from(map.values());
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function hasOverlap(actual: string[], expected: string[]) {
  const actualSet = new Set(actual.map(normalize));
  return expected.map(normalize).some((value) => actualSet.has(value) || Array.from(actualSet).some((actualValue) => actualValue.includes(value)));
}

function normalizedSetHas(values: Set<string> | undefined, expected: string) {
  if (!values) return false;
  const needle = normalize(expected);
  return Array.from(values).map(normalize).some((value) => value === needle || value.includes(needle));
}

function numberWithin(actual: number, min?: number | null, max?: number | null) {
  if (min !== undefined && min !== null && actual < min) return false;
  if (max !== undefined && max !== null && actual > max) return false;
  return true;
}

function dateWithin(actual: Date | null, after?: string | null, before?: string | null) {
  if (!after && !before) return true;
  if (!actual) return false;
  const actualTime = actual.getTime();
  if (after) {
    const afterTime = Date.parse(after);
    if (Number.isFinite(afterTime) && actualTime < afterTime) return false;
  }
  if (before) {
    const beforeTime = Date.parse(before);
    if (Number.isFinite(beforeTime) && actualTime > beforeTime) return false;
  }
  return true;
}

function decimalToNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber();
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestDate(values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) return null;
  return dates.reduce((latest, value) => (value.getTime() > latest.getTime() ? value : latest), dates[0]);
}

function audienceNeedsOrderLines(filters: MailAudienceFilterInput) {
  const explicitProductFilters = filters.productSkus.length > 0 || filters.productNames.length > 0 || filters.productFamilies.length > 0 || Boolean(filters.productQuery);
  const conditionProductFilters = filters.conditions.some((condition) => ['product', 'productSku', 'productName', 'productFamily'].includes(condition.field));
  return explicitProductFilters || conditionProductFilters;
}

function extractOrderLineTokens(lineItems: Prisma.JsonValue) {
  const tokens: string[] = [];
  const rows = Array.isArray(lineItems) ? lineItems : [];
  const tokenKeys = [
    'sku',
    'title',
    'name',
    'productTitle',
    'product_title',
    'productName',
    'product_name',
    'productType',
    'product_type',
    'vendor',
    'variantTitle',
    'variant_title',
    'variantSku',
    'variant_sku',
    'productId',
    'product_id',
    'variantId',
    'variant_id',
  ];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    for (const key of tokenKeys) {
      const value = row[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') tokens.push(String(value));
    }
    const tags = row.tags;
    if (Array.isArray(tags)) tokens.push(...tags.map(String));
    const properties = row.properties;
    if (Array.isArray(properties)) {
      for (const property of properties) {
        if (!isRecord(property)) continue;
        const name = property.name ?? property.key;
        const value = property.value;
        if (name) tokens.push(String(name));
        if (value) tokens.push(String(value));
      }
    }
  }
  return uniqueStrings(tokens).map(normalize);
}

type SuppressionScopeInput = {
  id?: string | null;
  reason?: string | null;
  scope?: string | null;
  category?: string | null;
  campaignId?: string | null;
  flowId?: string | null;
  templateId?: string | null;
  expiresAt?: Date | string | null;
};

type SuppressionMatchContext = {
  category?: string | null;
  campaignId?: string | null;
  flowId?: string | null;
  templateId?: string | null;
};

function reachabilityBlockReason(contact: FlowEnrollmentProcessingInput['contact'] | null, context: SuppressionMatchContext) {
  if (!contact) return null;
  if (!contact.isSendable) {
    return {
      reason: 'contact_not_sendable',
      message: 'Recipient is not sendable under current contact rules.',
    };
  }
  const consentState = contact.consentStates?.[0]?.state || 'unknown';
  if (consentState === 'unsubscribed') {
    return {
      reason: 'unsubscribed',
      message: 'Recipient is unsubscribed from marketing email.',
    };
  }
  const suppressionReason = effectiveSuppressionReason(contact.suppressions, context);
  if (suppressionReason) {
    return {
      reason: suppressionReason,
      message: 'Recipient is suppressed for email delivery.',
    };
  }
  return null;
}

function effectiveSuppressionReason(
  suppressions: SuppressionScopeInput[] | undefined,
  context: SuppressionMatchContext,
) {
  const now = Date.now();
  const match = (suppressions ?? []).find((suppression) => {
    const expiresAt = suppression.expiresAt ? new Date(suppression.expiresAt).getTime() : null;
    if (expiresAt && Number.isFinite(expiresAt) && expiresAt <= now) return false;
    const scope = suppression.scope || 'global';
    if (scope === 'global') return true;
    if (scope === 'category') return !suppression.category || suppression.category === context.category;
    if (scope === 'campaign') return Boolean(suppression.campaignId && suppression.campaignId === context.campaignId);
    if (scope === 'flow') return Boolean(suppression.flowId && suppression.flowId === context.flowId);
    if (scope === 'template') return Boolean(suppression.templateId && suppression.templateId === context.templateId);
    return true;
  });
  return match?.reason || (match ? 'suppressed' : null);
}

function computeQuietHoursDelayMs(quietHours: { startHHMM: string; endHHMM: string; timezone: string } | undefined | null) {
  if (!quietHours?.startHHMM || !quietHours.endHHMM) return 0;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: quietHours.timezone || 'America/Chicago',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [hourRaw, minuteRaw] = formatter.format(now).split(':');
    const currentHour = Number(hourRaw) % 24;
    const currentMinute = Number(minuteRaw);
    const start = parseHHMM(quietHours.startHHMM);
    const end = parseHHMM(quietHours.endHHMM);
    if (!start || !end || !Number.isFinite(currentHour) || !Number.isFinite(currentMinute)) return 0;
    const current = currentHour * 60 + currentMinute;
    const startMinute = start.hour * 60 + start.minute;
    const endMinute = end.hour * 60 + end.minute;
    const inQuiet = startMinute <= endMinute
      ? current >= startMinute && current < endMinute
      : current >= startMinute || current < endMinute;
    if (!inQuiet) return 0;
    let minutesUntilEnd = endMinute - current;
    if (minutesUntilEnd <= 0) minutesUntilEnd += 24 * 60;
    return minutesUntilEnd * 60 * 1000;
  } catch {
    return 0;
  }
}

function parseHHMM(value: string) {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function shouldSkipSelfTriggeredFlow(flowId: string, triggerType: string, payload: Record<string, unknown>) {
  if (triggerType !== 'sales_handoff_signal') return false;
  const sourceFlowId = textValue(payload.sourceFlowId) || textValue(payload.flowId);
  return Boolean(sourceFlowId && sourceFlowId === flowId);
}

function flowTargetKey(target: { id: string | null; customerId?: string | null; email?: string | null }) {
  if (target.id) return `contact:${target.id}`;
  if (target.customerId) return `customer:${target.customerId}`;
  if (target.email) return `email:${target.email.toLowerCase()}`;
  return 'target:unknown';
}

function flowIdempotencyKey(
  flowId: string,
  versionId: string,
  triggerType: string,
  payload: Record<string, unknown>,
  targetKey: string,
) {
  const sourceEventKey = textValue(payload.idempotencyKey)
    || textValue(payload.eventId)
    || textValue(payload.sourceEventId)
    || textValue(payload.callEventId)
    || textValue(payload.callId)
    || textValue(payload.orderId)
    || stableJson(payload);
  return createHash('sha256')
    .update(stableJson({ flowId, versionId, triggerType, targetKey, sourceEventKey }))
    .digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortJson((value as Record<string, unknown>)[key]);
    return acc;
  }, {});
}

function matchesTriggerConfig(configValue: Prisma.JsonValue, payload: Record<string, unknown>) {
  const config = asRecord(configValue);
  const field = textValue(config.field);
  if (!field) return true;
  return compareValues(resolveOperand(field, null, payload), String(config.operator ?? 'equals'), config.value);
}

function firstNodeAfterTrigger(nodes: FlowNodeDtoInput[], triggerNodeKey: string | null) {
  if (!triggerNodeKey) return nodes.find((node) => node.nodeType !== 'trigger')?.nodeKey ?? null;
  return nodes.find((node) => node.nodeKey !== triggerNodeKey && node.nodeType !== 'trigger')?.nodeKey ?? null;
}

function resolveOperand(field: unknown, contact: FlowEnrollmentProcessingInput['contact'] | null | undefined, payload: Record<string, unknown>) {
  const key = textValue(field);
  if (!key) return null;
  if (key.startsWith('contact.')) return contact ? (contact as unknown as Record<string, unknown>)[key.slice('contact.'.length)] ?? null : null;
  if (key.startsWith('event.')) return payload[key.slice('event.'.length)] ?? null;
  return payload[key] ?? (contact ? (contact as unknown as Record<string, unknown>)[key] ?? null : null);
}

function compareValues(actual: unknown, operator: string, expected: unknown) {
  const left = actual === null || actual === undefined ? '' : actual;
  const right = expected === null || expected === undefined ? '' : expected;
  if (operator === 'contains') return String(left).toLowerCase().includes(String(right).toLowerCase());
  if (operator === 'gte') return Number(left) >= Number(right);
  if (operator === 'gt') return Number(left) > Number(right);
  if (operator === 'lte') return Number(left) <= Number(right);
  if (operator === 'lt') return Number(left) < Number(right);
  if (operator === 'not_equals' || operator === 'neq') return String(left) !== String(right);
  if (operator === 'in') {
    const values = Array.isArray(right) ? right.map(normalize) : String(right).split(',').map(normalize);
    return values.includes(normalize(left));
  }
  if (operator === 'notIn') {
    const values = Array.isArray(right) ? right.map(normalize) : String(right).split(',').map(normalize);
    return !values.includes(normalize(left));
  }
  return String(left) === String(right);
}

function flowEmailVariables(enrollment: FlowEnrollmentProcessingInput, urls: Record<string, string>) {
  const payload = asRecord(enrollment.eventPayload);
  return {
    event: payload,
    contact: {
      id: enrollment.contactId,
      email: enrollment.email ?? enrollment.contact?.email ?? null,
      name: enrollment.contact?.name ?? payload.name ?? null,
    },
    customer: {
      id: enrollment.customerId ?? enrollment.contact?.customerId ?? payload.customerId ?? null,
      email: enrollment.email ?? enrollment.contact?.email ?? payload.email ?? null,
      name: enrollment.contact?.name ?? payload.name ?? null,
    },
    urls,
  };
}

function appendMarketingComplianceFooter(input: {
  html: string;
  text: string | null;
  compliance: MarketingComplianceContext;
  urls: Record<string, unknown>;
}) {
  if (input.html.includes('data-mail-compliance-footer')) {
    return { html: input.html, text: input.text, footerInjected: false };
  }
  const unsubscribeUrl = textValue(input.urls.unsubscribe) || input.compliance.preferenceCenterUrl;
  const preferenceUrl = textValue(input.urls.preferenceCenter) || textValue(input.urls.preference_center) || input.compliance.preferenceCenterUrl;
  const physicalAddress = input.compliance.physicalAddress;
  const html = [
    '<div data-mail-compliance-footer="1" style="margin-top:32px;padding:16px 24px;border-top:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#64748b;text-align:center">',
    `<div style="margin-bottom:6px">${escapeHtml(input.compliance.brandName)}${physicalAddress ? ` · ${escapeHtml(physicalAddress)}` : ''}</div>`,
    `<div><a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b">Unsubscribe</a> &middot; <a href="${escapeHtml(preferenceUrl)}" style="color:#64748b">Email preferences</a></div>`,
    '</div>',
  ].join('');
  const nextHtml = /<\/body>/i.test(input.html)
    ? input.html.replace(/<\/body>/i, `${html}</body>`)
    : `${input.html}${html}`;
  const textParts = [input.text ?? '', '', input.compliance.brandName];
  if (physicalAddress) textParts.push(physicalAddress);
  textParts.push(`Unsubscribe: ${unsubscribeUrl}`, `Email preferences: ${preferenceUrl}`);
  return { html: nextHtml, text: textParts.join('\n').trim(), footerInjected: true };
}

function renderString(source: string, variables: Record<string, unknown>, options: { escapeHtml?: boolean } = {}) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, variables);
    if (value === undefined || value === null) return '';
    const rendered = String(value);
    return options.escapeHtml ? escapeHtml(rendered) : rendered;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeStringArray(values: unknown[]) {
  return values
    .map((value) => textValue(value))
    .filter((value): value is string => value.length > 0);
}

const SENSITIVE_FLOW_CONFIG_KEY = /(authorization|bearer|credential|password|secret|token|api[_-]?key|private[_-]?key)/i;

function mailFlowWebhookConfigSafetyError(node: NormalizedFlowNode) {
  const label = node.label || node.nodeKey;
  const config = asRecord(node.config as Prisma.JsonValue);
  if (textValue(config.url)) {
    return `${label}: webhook nodes must use destinationId from the encrypted destination registry, not raw urls`;
  }
  if (!textValue(config.destinationId)) {
    return `${label}: webhook destinationId is required`;
  }
  if (containsSensitiveFlowConfig(config)) {
    return `${label}: webhook secrets, tokens, authorization headers, and API keys are not supported in flow graph config; use an encrypted destination contract before enabling outbound webhooks`;
  }
  const url = textValue(config.url);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      return `${label}: webhook url must not contain credentials`;
    }
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_FLOW_CONFIG_KEY.test(key)) {
        return `${label}: webhook url must not contain secret query parameters`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function containsSensitiveFlowConfig(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSensitiveFlowConfig(item));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    SENSITIVE_FLOW_CONFIG_KEY.test(key) || containsSensitiveFlowConfig(child)
  ));
}

function isSafeMailFlowInternalEventName(value: string) {
  return /^[a-zA-Z0-9_.:-]{2,160}$/.test(value);
}

function sanitizeSideEffectConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeSideEffectConfig(item));
  if (!isRecord(value)) return value;
  return Object.entries(value).reduce<Record<string, unknown>>((result, [key, child]) => {
    if (SENSITIVE_FLOW_CONFIG_KEY.test(key)) {
      result[key] = '[redacted]';
      return result;
    }
    result[key] = key.toLowerCase() === 'url' && typeof child === 'string'
      ? sanitizeUrlForLog(child)
      : sanitizeSideEffectConfig(child);
    return result;
  }, {});
}

function sanitizeUrlForLog(value: string) {
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_FLOW_CONFIG_KEY.test(key)) parsed.searchParams.set(key, '[redacted]');
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function renderEmailHtml(html: string, css: string | null) {
  return css?.trim() ? `<style>${css}</style>${html}` : html;
}

function templateRevisionSafetyIssues(revision: { html: string; css?: string | null }) {
  const html = revision.html ?? '';
  const css = revision.css ?? '';
  const checks: Array<[boolean, string]> = [
    [/<script[\s>]/i.test(html), 'Script tags are not allowed'],
    [/<form[\s>]/i.test(html), 'Form tags are not allowed'],
    [/<iframe[\s>]/i.test(html), 'Iframe tags are not allowed'],
    [/<(?:object|embed)[\s>]/i.test(html), 'Object and embed tags are not allowed'],
    [/<link[\s>]/i.test(html), 'Link tags are not allowed in email body HTML'],
    [/\son[a-z]+\s*=/i.test(html), 'Inline JavaScript handlers are not allowed'],
    [/javascript:/i.test(html), 'javascript: URLs are not allowed'],
    [/data\s*:\s*text\/html/i.test(html), 'HTML data URLs are not allowed'],
    [/<img\b[^>]*(?:width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?[^>]*width\s*=\s*["']?1["']?)/i.test(html), 'Tracking-pixel sized images are not allowed'],
    [/<img\b[^>]*display\s*:\s*none/i.test(html), 'Hidden tracking images are not allowed'],
    [/<\/style\s*>/i.test(css), 'CSS cannot close the style tag'],
    [/<script[\s>]/i.test(css), 'CSS cannot include script tags'],
    [/@import\b/i.test(css), 'CSS @import is not allowed'],
    [/javascript:/i.test(css), 'CSS javascript: URLs are not allowed'],
    [/\bexpression\s*\(/i.test(css), 'CSS expression() is not allowed'],
    [/\bbehavior\s*:/i.test(css), 'CSS behavior is not allowed'],
  ];
  return checks.reduce<string[]>((issues, [blocked, message]) => {
    if (blocked && !issues.includes(message)) issues.push(message);
    return issues;
  }, []);
}

function businessTriggerLabel(value: string) {
  return value.replace(/_/g, ' ');
}

type NormalizedFlowNode = {
  nodeKey: string;
  nodeType: string;
  label: string;
  description: string | null;
  nextNodeKey: string | null;
  routes: Prisma.InputJsonValue;
  config: Prisma.InputJsonValue;
  sortOrder: number;
  positionX: number;
  positionY: number;
};

const MAIL_FLOW_NODE_TYPES = new Set([
  'trigger',
  'delay',
  'condition',
  'split',
  'send_email',
  'update_contact_tag',
  'add_to_audience',
  'remove_from_audience',
  'create_follow_up_task',
  'create_followup_task',
  'create_sales_task',
  'webhook',
  'emit_internal_event',
]);

const MAIL_FLOW_ACTION_NODE_TYPES = new Set([
  'send_email',
  'update_contact_tag',
  'add_to_audience',
  'remove_from_audience',
  'create_follow_up_task',
  'create_followup_task',
  'create_sales_task',
  'webhook',
  'emit_internal_event',
]);

function normalizeFlowNodes(graph: SaveMailFlowInput['graph']): NormalizedFlowNode[] {
  const graphRecord: Record<string, unknown> = isRecord(graph) ? graph : {};
  const rawNodes: unknown[] = Array.isArray(graphRecord.nodes) ? graphRecord.nodes : [];
  const edges = normalizeEdges(graphRecord.edges);
  return rawNodes.map((rawNode, index) => {
    const node = isRecord(rawNode) ? rawNode : {};
    const nodeKey = textValue(node.nodeKey) || textValue(node.id) || `node_${index + 1}`;
    const nodeType = textValue(node.nodeType) || textValue(node.type) || 'unknown';
    const nextNodeKey = textValue(node.nextNodeKey) || firstEdgeTarget(edges, nodeKey);
    const config = isRecord(node.config) ? node.config : compactRecord(node, [
      'id',
      'nodeKey',
      'nodeType',
      'type',
      'label',
      'name',
      'description',
      'nextNodeKey',
      'routes',
      'position',
      'positionX',
      'positionY',
      'sortOrder',
    ]);
    return {
      nodeKey,
      nodeType,
      label: textValue(node.label) || textValue(node.name) || titleFromKey(nodeKey),
      description: textValue(node.description) || null,
      nextNodeKey,
      routes: normalizeRoutes(node.routes, edges, nodeKey),
      config: inputJson(config, {}),
      sortOrder: numberValue(node.sortOrder, index),
      positionX: numberValue(node.positionX, numberValue(isRecord(node.position) ? node.position.x : undefined, index * 220)),
      positionY: numberValue(node.positionY, numberValue(isRecord(node.position) ? node.position.y : undefined, 0)),
    };
  });
}

function validateMailFlowGraph(triggerType: string, nodes: NormalizedFlowNode[]) {
  if (nodes.length === 0) throw new BadRequestException('Flow must contain at least one trigger and one action node');
  const keys = new Set<string>();
  for (const node of nodes) {
    if (keys.has(node.nodeKey)) throw new BadRequestException(`Flow node key is duplicated: ${node.nodeKey}`);
    keys.add(node.nodeKey);
    if (!MAIL_FLOW_NODE_TYPES.has(node.nodeType)) {
      throw new BadRequestException(`Unsupported flow node type: ${node.nodeType}`);
    }
    if (node.nodeType === 'webhook') {
      const webhookConfigError = mailFlowWebhookConfigSafetyError(node);
      if (webhookConfigError) throw new BadRequestException(webhookConfigError);
    }
  }
  const triggerNodes = nodes.filter((node) => node.nodeType === 'trigger');
  if (triggerNodes.length !== 1) throw new BadRequestException('Flow must contain exactly one trigger node');
  const triggerConfig = asRecord(triggerNodes[0].config as Prisma.JsonValue);
  const nodeTriggerType = textValue(triggerConfig.triggerType);
  if (nodeTriggerType && nodeTriggerType !== triggerType) {
    throw new BadRequestException(`Trigger node type ${nodeTriggerType} does not match flow trigger ${triggerType}`);
  }
  if (!nodes.some((node) => MAIL_FLOW_ACTION_NODE_TYPES.has(node.nodeType))) {
    throw new BadRequestException('Flow must contain at least one action node');
  }
  for (const node of nodes) {
    if (node.nextNodeKey && !keys.has(node.nextNodeKey)) {
      throw new BadRequestException(`Flow node ${node.nodeKey} points to missing next node ${node.nextNodeKey}`);
    }
    for (const route of routesArray(node.routes)) {
      const nextNodeKey = textValue(route.nextNodeKey);
      if (nextNodeKey && !keys.has(nextNodeKey)) {
        throw new BadRequestException(`Flow route ${node.nodeKey}.${textValue(route.key) || 'route'} points to missing node ${nextNodeKey}`);
      }
    }
  }
}

function flowSummary(nodes: NormalizedFlowNode[]): Prisma.InputJsonValue {
  const byType = nodes.reduce<Record<string, number>>((summary, node) => {
    summary[node.nodeType] = (summary[node.nodeType] ?? 0) + 1;
    return summary;
  }, {});
  return {
    nodeCount: nodes.length,
    triggerCount: byType.trigger ?? 0,
    sendEmailNodes: byType.send_email ?? 0,
    delayNodes: byType.delay ?? 0,
    conditionNodes: (byType.condition ?? 0) + (byType.split ?? 0),
    actionNodes: nodes.filter((node) => MAIL_FLOW_ACTION_NODE_TYPES.has(node.nodeType)).length,
    disabledDeliveryMode: true,
    byType,
  };
}

function toStoredNodeInput(node: FlowNodeDtoInput): NormalizedFlowNode {
  return {
    nodeKey: node.nodeKey,
    nodeType: node.nodeType,
    label: node.label,
    description: node.description,
    nextNodeKey: node.nextNodeKey,
    routes: inputJson(node.routes, []),
    config: inputJson(node.config, {}),
    sortOrder: node.sortOrder,
    positionX: node.positionX,
    positionY: node.positionY,
  };
}

function summarizeFlowRuns(runs: Array<{ status: string; enrollmentCount?: number; completedCount?: number; failedCount?: number }>) {
  return runs.reduce(
    (summary, run) => {
      summary.total += 1;
      summary.enrollments += run.enrollmentCount ?? 0;
      summary.completedEnrollments += run.completedCount ?? 0;
      summary.failedEnrollments += run.failedCount ?? 0;
      if (run.status === 'queued') summary.queued += 1;
      if (run.status === 'running') summary.running += 1;
      if (run.status === 'completed') summary.completed += 1;
      if (run.status === 'failed') summary.failed += 1;
      if (run.status === 'skipped' || run.status === 'queued_disabled') summary.skipped += 1;
      return summary;
    },
    { total: 0, queued: 0, running: 0, completed: 0, failed: 0, skipped: 0, enrollments: 0, completedEnrollments: 0, failedEnrollments: 0 },
  );
}

function normalizeEdges(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((edge) => {
      const record = isRecord(edge) ? edge : {};
      const source = textValue(record.source);
      const target = textValue(record.target);
      return source && target ? { source, target } : null;
    })
    .filter((edge): edge is { source: string; target: string } => Boolean(edge));
}

function normalizeRoutes(value: unknown, edges: Array<{ source: string; target: string }>, nodeKey: string): Prisma.InputJsonValue {
  if (Array.isArray(value)) return inputJson(value, []);
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, nextNodeKey]) => textValue(nextNodeKey))
      .map(([key, nextNodeKey]) => ({ key, nextNodeKey: textValue(nextNodeKey) })) as Prisma.InputJsonValue;
  }
  const edgeRoutes = edges.filter((edge) => edge.source === nodeKey).map((edge, index) => ({
    key: `route_${index + 1}`,
    nextNodeKey: edge.target,
  }));
  return inputJson(edgeRoutes, []);
}

function routesArray(value: Prisma.InputJsonValue) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstEdgeTarget(edges: Array<{ source: string; target: string }>, nodeKey: string) {
  return edges.find((edge) => edge.source === nodeKey)?.target ?? null;
}

function compactRecord(record: Record<string, unknown>, ignored: string[]) {
  const ignoredSet = new Set(ignored);
  return Object.entries(record).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (!ignoredSet.has(key) && value !== undefined) result[key] = value;
    return result;
  }, {});
}

function titleFromKey(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerSummary(mode: MailProviderMode) {
  if (mode === 'live') {
    return {
      mode,
      message: 'Mail Center is in live delivery mode. Campaign and flow actions still require frozen snapshots, approval, consent, suppression, and category gates before any customer contact.',
    };
  }
  if (mode === 'test') {
    return {
      mode,
      message: 'Mail Center is in test-only mode. Marketing workflows record proof unless an explicit System Mail test is being sent.',
    };
  }
  return {
    mode,
    message: 'Mail Marketing is transferred but delivery is intentionally disabled for this tenant.',
  };
}

function isFollowUpTaskNode(nodeType: string) {
  return nodeType === 'create_sales_task' || nodeType === 'create_follow_up_task' || nodeType === 'create_followup_task';
}

function mailFlowTaskAxis(config: Record<string, unknown>, nodeType: string): CreateTaskAxis | null {
  const rawAxis = normalize(config.axis ?? config.taskAxis ?? config.task_axis ?? (nodeType === 'create_sales_task' ? 'sales' : 'sales'));
  if (rawAxis === 'sales' || rawAxis === 'account') return rawAxis;
  return null;
}

function mailFlowTaskPriority(value: unknown): ServiceRequestPriority {
  const priority = normalize(value);
  if (priority === 'critical' || priority === 'urgent' || priority === 'high' || priority === 'medium' || priority === 'low') {
    return priority;
  }
  return 'medium';
}

function mailFlowTaskDueAt(config: Record<string, unknown>) {
  const dueAt = textValue(config.dueAt ?? config.due_at);
  if (dueAt) {
    const parsed = new Date(dueAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const delayMinutes = positiveInteger(config.delayMinutes ?? config.delay_minutes)
    ?? (positiveInteger(config.delayHours ?? config.delay_hours) !== null ? positiveInteger(config.delayHours ?? config.delay_hours)! * 60 : null)
    ?? (positiveInteger(config.delayDays ?? config.delay_days) !== null ? positiveInteger(config.delayDays ?? config.delay_days)! * 24 * 60 : null);
  return delayMinutes ? new Date(Date.now() + delayMinutes * 60 * 1000) : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'mail-item';
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstConfiguredUrl(values: Array<string | undefined>) {
  for (const value of values) {
    const url = textValue(value);
    if (/^https?:\/\//i.test(url)) return url.replace(/\/+$/, '');
  }
  return '';
}

function joinUrl(baseUrl: string, path: string) {
  if (!baseUrl) return '';
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function inputJson(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  try {
    const json = JSON.parse(JSON.stringify(value ?? fallback)) as Prisma.InputJsonValue | null;
    return json === null ? fallback : json;
  } catch {
    return fallback;
  }
}
