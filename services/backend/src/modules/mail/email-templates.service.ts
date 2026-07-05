import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  activateEmailTemplateSchema,
  approveEmailTemplateRevisionSchema,
  mailTemplateBlockQuerySchema,
  mailTemplateQuerySchema,
  mailTemplatePreviewProfileQuerySchema,
  mailTemplateSnippetQuerySchema,
  patchMailTemplateBlockSchema,
  patchMailTemplatePreviewProfileSchema,
  patchEmailTemplateSchema,
  patchMailTemplateSnippetSchema,
  previewEmailTemplateSchema,
  proposeEmailTemplateAiEditSchema,
  saveMailTemplateBlockSchema,
  saveEmailTemplateSchema,
  saveMailTemplatePreviewProfileSchema,
  saveMailTemplateSnippetSchema,
  testEmailTemplateRevisionSchema,
  updateEmailTemplateRevisionSourceSchema,
  type ActivateEmailTemplateInput,
  type ApproveEmailTemplateRevisionInput,
  type EmailTemplateAiEditMode,
  type MailTemplateBlockQuery,
  type MailTemplateQuery,
  type MailTemplatePreviewProfileQuery,
  type MailTemplateSnippetQuery,
  type MailProviderMode,
  type PatchMailTemplateBlockInput,
  type PatchMailTemplatePreviewProfileInput,
  type PatchEmailTemplateInput,
  type PatchMailTemplateSnippetInput,
  type PreviewEmailTemplateInput,
  type ProposeEmailTemplateAiEditInput,
  type SaveMailTemplateBlockInput,
  type SaveEmailTemplateInput,
  type SaveMailTemplatePreviewProfileInput,
  type SaveMailTemplateSnippetInput,
  type TestEmailTemplateRevisionInput,
  type UpdateEmailTemplateRevisionSourceInput,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';
import { MailService } from './mail.service.js';
import {
  ensureApiV1BaseUrl,
  marketingComplianceLinks,
  resolveMailPreferenceSecret,
  resolveMailPreferenceTtlSeconds,
  type MarketingComplianceContext,
} from './mail-compliance.js';

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly repository: EmailTemplatesRepository,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async workspace() {
    const [templates, provider] = await Promise.all([
      this.repository.list({ limit: 200 }),
      this.providerSummary(),
    ]);
    const events = new Map<string, { eventKey: string; templateCount: number; publishedCount: number }>();
    for (const row of templates) {
      const current = events.get(row.eventKey) ?? { eventKey: row.eventKey, templateCount: 0, publishedCount: 0 };
      current.templateCount += 1;
      if (row.status === 'published') current.publishedCount += 1;
      events.set(row.eventKey, current);
    }
    return {
      sendingEnabled: false as const,
      templates: templates.map(toTemplateDto),
      events: [...events.values()].sort((left, right) => left.eventKey.localeCompare(right.eventKey)),
      provider,
    };
  }

  async list(query: MailTemplateQuery) {
    const parsed = mailTemplateQuerySchema.parse(query);
    const rows = await this.repository.list(parsed);
    return rows.map(toTemplateDto);
  }

  async get(id: string) {
    const template = await this.repository.findById(id);
    if (!template) throw new NotFoundException('Email template not found');
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async getEvent(eventKey: string) {
    const [rows, provider] = await Promise.all([
      this.repository.findByEventKey(eventKey),
      this.providerSummary(),
    ]);
    return {
      eventKey,
      templates: rows.map((template) => ({ ...toTemplateDto(template), versions: template.versions.map(toVersionDto) })),
      sendingEnabled: false as const,
      provider,
    };
  }

  async create(input: SaveEmailTemplateInput) {
    const parsed = saveEmailTemplateSchema.parse(input);
    assertSafeEmailSource(parsed.html, parsed.css ?? '');
    const created = await this.toConflictOnDuplicateSlug(() => this.repository.create({
      ...parsed,
      slug: parsed.slug ?? slug(parsed.name),
      description: parsed.description ?? null,
      previewText: parsed.previewText ?? null,
      css: parsed.css ?? null,
      text: parsed.text ?? null,
      variables: parsed.variables as Prisma.InputJsonValue,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    }));
    this.logger.log('mail_template', 'create', 'Email template created', { template_id: created.id, event_key: created.eventKey });
    return { ...toTemplateDto(created), versions: created.versions.map(toVersionDto) };
  }

  async update(id: string, input: PatchEmailTemplateInput) {
    const parsed = patchEmailTemplateSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const updated = await this.toConflictOnDuplicateSlug(() => this.repository.update(id, {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.slug !== undefined && { slug: parsed.slug || undefined }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.eventKey !== undefined && { eventKey: parsed.eventKey }),
      ...(parsed.templateType !== undefined && { templateType: parsed.templateType }),
      ...(parsed.folderKey !== undefined && { folderKey: parsed.folderKey }),
      ...(parsed.subject !== undefined && { subject: parsed.subject }),
      ...(parsed.previewText !== undefined && { previewText: parsed.previewText ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    }));
    this.logger.log('mail_template', 'update', 'Email template updated', { template_id: id, event_key: updated.eventKey });
    return { ...toTemplateDto(updated), versions: updated.versions.map(toVersionDto) };
  }

  async duplicateVariant(variantId: string) {
    const template = await this.repository.duplicateVariant(variantId);
    this.logger.log('mail_template', 'duplicate_variant', 'Email template variant duplicated', { template_id: template.id, source_template_id: variantId });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async duplicateRevision(revisionId: string) {
    const template = await this.repository.duplicateRevision(revisionId);
    this.logger.log('mail_template', 'duplicate_revision', 'Email template revision duplicated', { template_id: template.id, revision_id: revisionId });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async updateRevisionSource(revisionId: string, input: UpdateEmailTemplateRevisionSourceInput) {
    const parsed = updateEmailTemplateRevisionSourceSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const template = await this.repository.updateRevisionSource(revisionId, {
      ...(parsed.subject !== undefined && { subject: parsed.subject }),
      ...(parsed.previewText !== undefined && { previewText: parsed.previewText ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    });
    this.logger.log('mail_template', 'update_revision_source', 'Email template revision source updated', {
      template_id: template.id,
      revision_id: revisionId,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async proposeAiEdit(revisionId: string, input: ProposeEmailTemplateAiEditInput) {
    const parsed = proposeEmailTemplateAiEditSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const declaredVariables = declaredTemplateVariables(revision.variables);
    const response = await this.generateTemplateAssistantJson({
      service: 'mail-template',
      promptKey: 'mail.template.proposal',
      system: templateAssistantSystemPrompt(),
      user: {
        task: 'Return a proposal for the saved email template revision. Do not claim it was saved.',
        mode: parsed.mode,
        instruction: parsed.instruction,
        audience: parsed.audience ?? '',
        brandVoice: parsed.brandVoice ?? '',
        template: {
          id: revision.templateId,
          revisionId: revision.id,
          type: revision.template.templateType,
          eventKey: revision.template.eventKey,
        },
        allowedVariables: declaredVariables.map((key) => `{{${key}}}`),
        currentDraft: {
          subject: revision.subject,
          previewText: revision.previewText ?? '',
          html: revision.html,
          css: revision.css ?? '',
          text: revision.text ?? '',
          variables: declaredVariables,
        },
        releaseRules: {
          marketingTemplatesNeedUnsubscribeToken: revision.template.templateType !== 'transactional',
          forbiddenHtml: ['script tags', 'form tags', 'inline event handlers', 'javascript: URLs'],
          outputMustBeJsonOnly: true,
          proposalOnly: true,
        },
      },
      metadata: { revision_id: revision.id, template_id: revision.templateId, mode: parsed.mode },
    });
    const proposal = normalizeTemplateAiProposal(response.output, revision, parsed.mode, declaredVariables);
    const validation = validatePublishableRevision({
      subject: proposal.subject,
      previewText: proposal.previewText ?? '',
      html: proposal.html,
      css: proposal.css ?? '',
      text: proposal.text ?? '',
      variables: proposal.variables,
      templateType: revision.template.templateType,
    });
    const changedFields = changedTemplateFields(revision, proposal);
    this.logger.log('mail_template', 'ai_proposal', 'Email template assistant proposal generated', {
      template_id: revision.templateId,
      revision_id: revision.id,
      mode: parsed.mode,
      changed_fields: changedFields.join(','),
      blocking_issues: validation.blockingIssues.length,
    });
    return {
      revisionId: revision.id,
      templateId: revision.templateId,
      mode: parsed.mode,
      provider: response.provider,
      model: response.model,
      promptKey: 'mail.template.proposal' as const,
      applied: false as const,
      generatedAt: new Date().toISOString(),
      draft: proposal,
      summary: proposal.summary,
      warnings: [...proposal.warnings, ...validation.warnings],
      changedFields,
      validation,
    };
  }

  async approveRevision(revisionId: string, input: ApproveEmailTemplateRevisionInput) {
    const parsed = approveEmailTemplateRevisionSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const validation = validatePublishableRevision(toReleaseInput(revision));
    if (validation.blockingIssues.length > 0) {
      throw new BadRequestException(validation.blockingIssues.join(', '));
    }
    await this.requireFreshReleaseProof(revision, 'approval');
    const template = await this.repository.approveRevision(revisionId, { comment: parsed.comment ?? null });
    this.logger.log('mail_template', 'approve_revision', 'Email template revision approved', { template_id: template.id, revision_id: revisionId });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async publishRevision(revisionId: string) {
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    if (revision.status !== 'approved' || revision.approvalState !== 'approved') {
      throw new BadRequestException('Revision must be approved before publish');
    }
    const validation = validatePublishableRevision(toReleaseInput(revision));
    if (validation.blockingIssues.length > 0) {
      throw new BadRequestException(validation.blockingIssues.join(', '));
    }
    await this.requireFreshReleaseProof(revision, 'publish');
    const template = await this.repository.publishRevision(revisionId, {
      lintSummary: validation as Prisma.InputJsonValue,
      spamScore: calculateSpamScore(revision.subject, revision.html),
    });
    this.logger.log('mail_template', 'publish', 'Email template revision published', {
      template_id: template.id,
      revision_id: revisionId,
      event_key: template.eventKey,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async activateVariant(eventKey: string, input: ActivateEmailTemplateInput) {
    const parsed = activateEmailTemplateSchema.parse(input);
    const template = await this.repository.activateVariant(eventKey, parsed.variantId, parsed.revisionId);
    this.logger.log('mail_template', 'activate', 'Email template activated for event', {
      template_id: template.id,
      event_key: eventKey,
      revision_id: parsed.revisionId ?? template.publishedVersionId,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async previewRevision(revisionId: string, input: PreviewEmailTemplateInput) {
    const parsed = previewEmailTemplateSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const variables = revision.template.templateType === 'transactional'
      ? parsed.variables
      : await this.withMarketingComplianceVariables(parsed.variables, {
        email: previewEmailFromVariables(parsed.variables),
        source: `template-preview:${revision.id}`,
      });
    const renderedCss = revision.css ? renderTemplate(revision.css, variables) : null;
    const unresolvedVariables = findUnresolvedVariables([revision.subject, revision.previewText ?? '', revision.html, revision.css ?? '', revision.text ?? ''], variables);
    const rendered = revision.template.templateType === 'transactional'
      ? { html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss), text: revision.text ? renderTemplate(revision.text, variables) : null }
      : appendMarketingComplianceFooter({
        html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss),
        text: revision.text ? renderTemplate(revision.text, variables) : null,
        compliance: await this.marketingComplianceContext(),
        urls: asRecord(variables.urls),
      });
    return {
      subject: renderTemplate(revision.subject, variables),
      previewText: revision.previewText ? renderTemplate(revision.previewText, variables) : null,
      html: rendered.html,
      text: rendered.text,
      unresolvedVariables,
    };
  }

  async testSend(revisionId: string, input: TestEmailTemplateRevisionInput) {
    const parsed = testEmailTemplateRevisionSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    const validation = validatePublishableRevision(toReleaseInput(revision));
    if (validation.blockingIssues.length > 0) {
      throw new BadRequestException(validation.blockingIssues.join(', '));
    }
    const variables = revision.template.templateType === 'transactional'
      ? parsed.variables
      : await this.withMarketingComplianceVariables(parsed.variables, {
        email: parsed.to,
        source: `template-test:${revision.id}`,
      });
    const unresolvedVariables = findUnresolvedVariables([revision.subject, revision.previewText ?? '', revision.html, revision.css ?? '', revision.text ?? ''], variables);
    if (unresolvedVariables.length > 0) {
      throw new BadRequestException(`Resolve missing preview values before test proof: ${unresolvedVariables.join(', ')}`);
    }
    const renderedCss = revision.css ? renderTemplate(revision.css, variables) : null;
    const rendered = revision.template.templateType === 'transactional'
      ? { html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss), text: revision.text ? renderTemplate(revision.text, variables) : null, footerInjected: false }
      : appendMarketingComplianceFooter({
        html: renderEmailHtml(renderTemplate(revision.html, variables, { escapeHtml: true }), renderedCss),
        text: revision.text ? renderTemplate(revision.text, variables) : null,
        compliance: await this.marketingComplianceContext(),
        urls: asRecord(variables.urls),
      });
    const releaseProof = buildReleaseProof(revision, variables, validation.warnings);
    const delivery = await this.mail.recordDisabledDelivery({
      eventKey: revision.template.eventKey,
      category: revision.template.templateType === 'marketing' ? 'marketing' : 'system',
      to: parsed.to,
      templateId: revision.templateId,
      templateVersionId: revision.id,
      subject: renderTemplate(revision.subject, variables),
      html: rendered.html,
      text: rendered.text,
      metadata: {
        source: 'email_template_test_send',
        templateId: revision.templateId,
        revisionId: revision.id,
        revisionNumber: revision.versionNumber,
        releaseProof,
        compliance: revision.template.templateType === 'transactional' ? null : {
          unsubscribeUrl: asRecord(variables.urls).unsubscribe ?? null,
          preferenceCenterUrl: asRecord(variables.urls).preferenceCenter ?? null,
          footerInjected: rendered.footerInjected,
        },
      },
    });
    this.logger.warn('mail_template', 'test_send_disabled', 'Email template test-send recorded while mail provider is disabled', {
      revision_id: revisionId,
      mail_delivery_id: delivery.id,
    });
    return {
      sendingEnabled: false,
      status: delivery.status,
      revisionId,
      deliveryId: delivery.id,
      message: 'Mail provider is disabled for this tenant; a queued_disabled delivery record was created and no email was sent.',
    };
  }

  async testSendTemplate(templateId: string, input: TestEmailTemplateRevisionInput) {
    const template = await this.repository.findById(templateId);
    if (!template) throw new NotFoundException('Email template not found');
    const revision = template.publishedVersion ?? template.versions[0];
    if (!revision) throw new NotFoundException('Email template revision not found');
    return this.testSend(revision.id, input);
  }

  async deleteRevision(revisionId: string) {
    const template = await this.repository.deleteRevision(revisionId);
    this.logger.log('mail_template', 'delete_revision', 'Email template draft revision deleted', {
      template_id: template.id,
      revision_id: revisionId,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  private async generateTemplateAssistantJson(input: {
    service: string;
    promptKey: string;
    system: string;
    user: unknown;
    metadata: Record<string, unknown>;
  }) {
    if (this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_ENABLED')?.trim().toLowerCase() === 'false') {
      throw new BadRequestException({
        message: 'Anthropic template assistant is disabled by budget control.',
        code: 'anthropic_template_assist_disabled',
      });
    }
    const credentials = await this.resolveTemplateAssistantKey();
    if (!credentials.key) throw new BadRequestException('Anthropic API key is not configured for this tenant.');
    const model = await this.resolveTemplateAssistantModel(credentials.key);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': credentials.key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(this.anthropicTemplateTimeoutMs()),
        body: JSON.stringify({
          model,
          max_tokens: this.anthropicTemplateMaxTokens(),
          temperature: 0.2,
          system: input.system,
          messages: [{ role: 'user', content: JSON.stringify(input.user) }],
        }),
      });
    } catch (error) {
      const message = isTimeoutError(error)
        ? `Anthropic template assistant timed out after ${this.anthropicTemplateTimeoutMs()}ms.`
        : `Anthropic template assistant could not reach provider: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('mail_template', 'ai_proposal_network_failed', message, {
        key_source: credentials.source,
        model,
        prompt_key: input.promptKey,
        latency_ms: Date.now() - startedAt,
        ...input.metadata,
      });
      throw new BadRequestException({ message, code: 'anthropic_template_assist_network_error' });
    }
    const text = await response.text();
    const body = parseJsonObjectOrNull(text);
    if (!response.ok) {
      const message = providerErrorMessage(body, text) ?? `Anthropic template assistant failed with HTTP ${response.status}.`;
      this.logger.error('mail_template', 'ai_proposal_failed', message, {
        key_source: credentials.source,
        model,
        status_code: response.status,
        prompt_key: input.promptKey,
        latency_ms: Date.now() - startedAt,
        ...input.metadata,
      });
      throw new BadRequestException({ message, code: 'anthropic_template_assist_failed', status: response.status });
    }
    this.logger.log('mail_template', 'ai_proposal_provider_completed', 'Anthropic template assistant returned structured proposal text', {
      key_source: credentials.source,
      model,
      prompt_key: input.promptKey,
      latency_ms: Date.now() - startedAt,
      ...input.metadata,
    });
    return {
      provider: 'anthropic' as const,
      model,
      output: extractJsonObjectFromAnthropic(body),
    };
  }

  private async resolveTemplateAssistantKey(): Promise<{ key: string | null; source: 'tenant_config' | 'env' | 'none' }> {
    const config = await this.prisma.db.tenantConfig.findFirst({ select: { anthropicApiKeyEncrypted: true } });
    const tenantKey = this.crypto.decrypt(config?.anthropicApiKeyEncrypted)?.trim();
    if (tenantKey) return { key: tenantKey, source: 'tenant_config' };
    const envKey = this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
    if (envKey) return { key: envKey, source: 'env' };
    return { key: null, source: 'none' };
  }

  private async resolveTemplateAssistantModel(key: string) {
    const configured = this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_MODEL')?.trim()
      || this.config.get<string>('ANTHROPIC_MODEL')?.trim();
    if (configured) return configured;
    const fallback = 'claude-haiku-4-5-20251001';
    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=20', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(this.anthropicTemplateTimeoutMs()),
      });
      const body = parseJsonObjectOrNull(await response.text()) as { data?: Array<{ id?: string }> } | null;
      const ids = Array.isArray(body?.data) ? body.data.map((item) => item.id).filter((id): id is string => Boolean(id)) : [];
      return ids.find((id) => id === fallback)
        ?? ids.find((id) => id.includes('haiku-4-5'))
        ?? ids.find((id) => id.includes('haiku'))
        ?? ids[0]
        ?? fallback;
    } catch {
      return fallback;
    }
  }

  private anthropicTemplateTimeoutMs() {
    const configured = Number(this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_TIMEOUT_MS') ?? this.config.get<string>('ANTHROPIC_TIMEOUT_MS') ?? '15000');
    return Number.isFinite(configured) && configured >= 1000 && configured <= 120000 ? configured : 15000;
  }

  private anthropicTemplateMaxTokens() {
    const configured = Number(this.config.get<string>('ANTHROPIC_TEMPLATE_ASSIST_MAX_TOKENS') ?? '1200');
    if (!Number.isInteger(configured)) return 1200;
    return Math.min(4000, Math.max(300, configured));
  }

  private async requireFreshReleaseProof(
    revision: NonNullable<Awaited<ReturnType<EmailTemplatesRepository['findRevisionById']>>>,
    action: 'approval' | 'publish',
  ) {
    const expectedSourceHash = releaseSourceHash(revision);
    const proofs = await this.mail.listTemplateRevisionTestProofs(revision.id);
    const proof = proofs.find((row) => {
      const metadata = asRecord(row.metadata);
      const releaseProof = asRecord(metadata.releaseProof);
      return metadata.source === 'email_template_test_send'
        && releaseProof.sourceHash === expectedSourceHash
        && releaseProof.unresolvedCount === 0;
    });
    if (!proof) {
      throw new BadRequestException(`Record a fresh rendered test proof before ${action}.`);
    }
    return proof;
  }

  private async withMarketingComplianceVariables(
    variables: Record<string, unknown>,
    input: { email: string; source: string },
  ) {
    const compliance = await this.marketingComplianceContext();
    const urls = marketingComplianceLinks(compliance, input);
    return {
      ...variables,
      urls: {
        ...asRecord(variables.urls),
        unsubscribe: textValue(asRecord(variables.urls).unsubscribe) || urls.unsubscribe,
        preferenceCenter: textValue(asRecord(variables.urls).preferenceCenter) || urls.preferenceCenter,
        preference_center: textValue(asRecord(variables.urls).preference_center) || urls.preference_center,
      },
    };
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

  private async providerSummary() {
    const { settings } = await this.mail.mailCenterSettings();
    return providerSummary(settings.providerMode);
  }

  async previewProfiles(query: MailTemplatePreviewProfileQuery) {
    const parsed = mailTemplatePreviewProfileQuerySchema.parse(query);
    const rows = await this.repository.listPreviewProfiles(parsed);
    return rows.map(toPreviewProfileDto);
  }

  async createPreviewProfile(input: SaveMailTemplatePreviewProfileInput) {
    const parsed = saveMailTemplatePreviewProfileSchema.parse(input);
    const profile = await this.repository.createPreviewProfile({
      templateId: parsed.templateId ?? null,
      eventKey: parsed.eventKey ?? null,
      name: parsed.name,
      description: parsed.description ?? null,
      variables: parsed.variables as Prisma.InputJsonValue,
      isDefault: parsed.isDefault,
    });
    this.logger.log('mail_template', 'preview_profile_create', 'Mail template preview profile created', { profile_id: profile.id });
    return toPreviewProfileDto(profile);
  }

  async updatePreviewProfile(id: string, input: PatchMailTemplatePreviewProfileInput) {
    const parsed = patchMailTemplatePreviewProfileSchema.parse(input);
    const profile = await this.repository.updatePreviewProfile(id, {
      ...(parsed.templateId !== undefined && { templateId: parsed.templateId ?? null }),
      ...(parsed.eventKey !== undefined && { eventKey: parsed.eventKey ?? null }),
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.isDefault !== undefined && { isDefault: parsed.isDefault }),
    });
    this.logger.log('mail_template', 'preview_profile_update', 'Mail template preview profile updated', { profile_id: profile.id });
    return toPreviewProfileDto(profile);
  }

  async deletePreviewProfile(id: string) {
    const result = await this.repository.deletePreviewProfile(id);
    this.logger.log('mail_template', 'preview_profile_delete', 'Mail template preview profile deleted', { profile_id: id });
    return result;
  }

  async snippets(query: MailTemplateSnippetQuery) {
    const parsed = mailTemplateSnippetQuerySchema.parse(query);
    const rows = await this.repository.listSnippets(parsed);
    return rows.map(toSnippetDto);
  }

  async createSnippet(input: SaveMailTemplateSnippetInput) {
    const parsed = saveMailTemplateSnippetSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const snippet = await this.repository.createSnippet({
      key: parsed.key,
      name: parsed.name,
      description: parsed.description ?? null,
      templateType: parsed.templateType ?? null,
      subject: parsed.subject ?? null,
      html: parsed.html ?? null,
      css: parsed.css ?? null,
      text: parsed.text ?? null,
      metadata: parsed.metadata as Prisma.InputJsonValue,
      isArchived: parsed.isArchived,
    });
    this.logger.log('mail_template', 'snippet_create', 'Mail template snippet created', { snippet_id: snippet.id, key: snippet.key });
    return toSnippetDto(snippet);
  }

  async updateSnippet(id: string, input: PatchMailTemplateSnippetInput) {
    const parsed = patchMailTemplateSnippetSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const snippet = await this.repository.updateSnippet(id, {
      ...(parsed.key !== undefined && { key: parsed.key }),
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.templateType !== undefined && { templateType: parsed.templateType ?? null }),
      ...(parsed.subject !== undefined && { subject: parsed.subject ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html ?? null }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
      ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
    });
    this.logger.log('mail_template', 'snippet_update', 'Mail template snippet updated', { snippet_id: snippet.id, key: snippet.key });
    return toSnippetDto(snippet);
  }

  async deleteSnippet(id: string) {
    const result = await this.repository.deleteSnippet(id);
    this.logger.log('mail_template', 'snippet_archive', 'Mail template snippet archived', { snippet_id: id });
    return result;
  }

  async blocks(query: MailTemplateBlockQuery) {
    const parsed = mailTemplateBlockQuerySchema.parse(query);
    const rows = await this.repository.listBlocks(parsed);
    return rows.map(toBlockDto);
  }

  async createBlock(input: SaveMailTemplateBlockInput) {
    const parsed = saveMailTemplateBlockSchema.parse(input);
    assertSafeEmailSource(parsed.html, parsed.css ?? '');
    const block = await this.repository.createBlock({
      key: parsed.key,
      name: parsed.name,
      category: parsed.category,
      description: parsed.description ?? null,
      html: parsed.html,
      css: parsed.css ?? null,
      metadata: parsed.metadata as Prisma.InputJsonValue,
      isArchived: parsed.isArchived,
    });
    this.logger.log('mail_template', 'block_create', 'Mail template block created', { block_id: block.id, key: block.key });
    return toBlockDto(block);
  }

  async updateBlock(id: string, input: PatchMailTemplateBlockInput) {
    const parsed = patchMailTemplateBlockSchema.parse(input);
    assertSafeEmailSource(parsed.html ?? '', parsed.css ?? '');
    const block = await this.repository.updateBlock(id, {
      ...(parsed.key !== undefined && { key: parsed.key }),
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.category !== undefined && { category: parsed.category }),
      ...(parsed.description !== undefined && { description: parsed.description ?? null }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.css !== undefined && { css: parsed.css ?? null }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
      ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
    });
    this.logger.log('mail_template', 'block_update', 'Mail template block updated', { block_id: block.id, key: block.key });
    return toBlockDto(block);
  }

  async deleteBlock(id: string) {
    const result = await this.repository.deleteBlock(id);
    this.logger.log('mail_template', 'block_archive', 'Mail template block archived', { block_id: id });
    return result;
  }

  private async toConflictOnDuplicateSlug<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new ConflictException('An email template with this slug already exists.');
      }
      throw error;
    }
  }
}

function toTemplateDto(template: {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  eventKey: string;
  templateType: string;
  folderKey: string;
  subject: string;
  html: string;
  text: string | null;
  status: string;
  approvalState: string;
  variables: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  isArchived?: boolean;
  publishedVersionId?: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { versions: number };
  versions?: Array<{
    id: string;
    previewText: string | null;
    css: string | null;
    status: string;
  }>;
  publishedVersion?: {
    id: string;
    previewText: string | null;
    css: string | null;
  } | null;
  bindings?: Array<{
    id: string;
    eventKey: string;
    templateVersionId: string;
    isEnabled: boolean;
  }>;
}) {
  const sourceVersion = template.publishedVersion ?? template.versions?.[0] ?? null;
  const activeBinding = template.bindings?.find((binding) => binding.isEnabled) ?? null;
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description ?? null,
    eventKey: template.eventKey,
    templateType: template.templateType as 'transactional' | 'marketing',
    folderKey: template.folderKey,
    subject: template.subject,
    previewText: sourceVersion?.previewText ?? null,
    html: template.html,
    css: sourceVersion?.css ?? null,
    text: template.text,
    status: template.status as 'draft' | 'approved' | 'published' | 'archived',
    approvalState: template.approvalState,
    variables: Array.isArray(template.variables) ? template.variables.map(String) : [],
    metadata: asRecord(template.metadata),
    isArchived: template.isArchived ?? false,
    publishedVersionId: template.publishedVersionId ?? null,
    versionCount: template._count?.versions ?? 0,
    activeBinding: activeBinding ? {
      id: activeBinding.id,
      eventKey: activeBinding.eventKey,
      templateVersionId: activeBinding.templateVersionId,
      isEnabled: activeBinding.isEnabled,
    } : null,
    publishedAt: template.publishedAt?.toISOString() ?? null,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

function toVersionDto(version: {
  id: string;
  templateId: string;
  versionNumber: number;
  subject: string;
  previewText?: string | null;
  html: string;
  css?: string | null;
  text: string | null;
  status: string;
  approvalState: string;
  variables: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt?: Date;
  publishedAt: Date | null;
}) {
  return {
    id: version.id,
    templateId: version.templateId,
    versionNumber: version.versionNumber,
    subject: version.subject,
    previewText: version.previewText ?? null,
    html: version.html,
    css: version.css ?? null,
    text: version.text,
    status: version.status,
    approvalState: version.approvalState,
    variables: Array.isArray(version.variables) ? version.variables.map(String) : [],
    metadata: asRecord(version.metadata),
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt?.toISOString() ?? version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toPreviewProfileDto(profile: {
  id: string;
  templateId: string | null;
  eventKey: string | null;
  name: string;
  description: string | null;
  variables: Prisma.JsonValue;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    templateId: profile.templateId,
    eventKey: profile.eventKey,
    name: profile.name,
    description: profile.description,
    variables: asRecord(profile.variables),
    isDefault: profile.isDefault,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function toSnippetDto(snippet: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  templateType: string | null;
  subject: string | null;
  html: string | null;
  css: string | null;
  text: string | null;
  metadata: Prisma.JsonValue;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: snippet.id,
    key: snippet.key,
    name: snippet.name,
    description: snippet.description,
    templateType: snippet.templateType,
    subject: snippet.subject,
    html: snippet.html,
    css: snippet.css,
    text: snippet.text,
    metadata: asRecord(snippet.metadata),
    isSystem: snippet.isSystem,
    isArchived: snippet.isArchived,
    createdAt: snippet.createdAt.toISOString(),
    updatedAt: snippet.updatedAt.toISOString(),
  };
}

function toBlockDto(block: {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  html: string;
  css: string | null;
  metadata: Prisma.JsonValue;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: block.id,
    key: block.key,
    name: block.name,
    category: block.category,
    description: block.description,
    html: block.html,
    css: block.css,
    metadata: asRecord(block.metadata),
    isSystem: block.isSystem,
    isArchived: block.isArchived,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

type ReleaseRevision = {
  id: string;
  templateId: string;
  versionNumber: number;
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: Prisma.JsonValue;
  template: { templateType: string };
};

function toReleaseInput(revision: ReleaseRevision) {
  return {
    subject: revision.subject,
    previewText: revision.previewText ?? '',
    html: revision.html,
    css: revision.css ?? '',
    text: revision.text ?? '',
    variables: declaredTemplateVariables(revision.variables),
    templateType: revision.template.templateType,
  };
}

function buildReleaseProof(revision: ReleaseRevision, variables: Record<string, unknown>, warnings: string[]) {
  return {
    schemaVersion: 1,
    sourceHash: releaseSourceHash(revision),
    variablesHash: stableHash(variables),
    unresolvedCount: 0,
    warningCount: warnings.length,
    warnings,
    recordedAt: new Date().toISOString(),
  };
}

function releaseSourceHash(revision: ReleaseRevision) {
  return stableHash({
    subject: revision.subject,
    previewText: revision.previewText ?? '',
    html: revision.html,
    css: revision.css ?? '',
    text: revision.text ?? '',
    variables: declaredTemplateVariables(revision.variables),
    templateType: revision.template.templateType,
  });
}

function declaredTemplateVariables(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function stableHash(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailHtml(html: string, css: string | null) {
  return css?.trim() ? `<style>${css}</style>${html}` : html;
}

function previewEmailFromVariables(variables: Record<string, unknown>) {
  const recipient = asRecord(variables.recipient);
  const contact = asRecord(variables.contact);
  const customer = asRecord(variables.customer);
  return textValue(variables.email)
    || textValue(variables.recipient_email)
    || textValue(recipient.email)
    || textValue(contact.email)
    || textValue(customer.email)
    || 'preview@example.com';
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

function findUnresolvedVariables(sources: string[], variables: Record<string, unknown>) {
  const unresolved = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      const key = match[1];
      const value = key.split('.').reduce<unknown>((current, part) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[part];
      }, variables);
      if (value === undefined || value === null) unresolved.add(key);
    }
  }
  return [...unresolved].sort();
}

function validatePublishableRevision(input: {
  subject: string;
  previewText: string;
  html: string;
  css: string;
  text: string;
  variables: string[];
  templateType: string;
}) {
  const sources = [input.subject, input.previewText, input.html, input.css, input.text];
  const tokenKeys = [...new Set(sources.flatMap((source) => [...source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]).filter(Boolean)))].sort();
  const declared = new Set(input.variables);
  const unknownTokens = declared.size > 0 ? tokenKeys.filter((token) => !declared.has(token)) : [];
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!input.subject.trim()) blockingIssues.push('Subject is required');
  if (!input.html.trim()) blockingIssues.push('HTML body is required');
  blockingIssues.push(...unsafeEmailMarkupIssues(input.html, input.css));
  if (input.templateType !== 'transactional' && !input.html.includes('{{urls.unsubscribe}}')) {
    blockingIssues.push('Marketing and flow templates must include {{urls.unsubscribe}}');
  }
  if (unknownTokens.length > 0) blockingIssues.push(`Unknown template variables: ${unknownTokens.join(', ')}`);
  if (input.subject.length > 70) warnings.push('Subject is longer than 70 characters');
  if (input.previewText.length > 120) warnings.push('Preview text is longer than 120 characters');

  return {
    tokenKeys,
    unknownTokens,
    warnings,
    blockingIssues,
  };
}

function assertSafeEmailSource(html: string, css: string) {
  const issues = unsafeEmailMarkupIssues(html, css);
  if (issues.length > 0) {
    throw new BadRequestException(issues.join(', '));
  }
}

function unsafeEmailMarkupIssues(html: string, css: string) {
  const issues: string[] = [];
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
  for (const [blocked, message] of checks) {
    if (blocked && !issues.includes(message)) issues.push(message);
  }
  return issues;
}

function calculateSpamScore(subject: string, html: string) {
  let score = 0;
  const uppercaseRatio = subject ? subject.replace(/[^A-Z]/g, '').length / Math.max(subject.length, 1) : 0;
  if (uppercaseRatio > 0.5) score += 2;
  if ((subject.match(/!/g) || []).length >= 3) score += 2;
  if (/(free|winner|urgent|act now|limited time)/i.test(`${subject} ${html}`)) score += 3;
  if (html.length > 120000) score += 1;
  return Math.min(score, 10);
}

type TemplateAiRevision = {
  id: string;
  templateId: string;
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: Prisma.JsonValue;
};

type TemplateAiDraft = {
  subject: string;
  previewText: string | null;
  html: string;
  css: string | null;
  text: string | null;
  variables: string[];
};

function normalizeTemplateAiProposal(
  output: unknown,
  revision: TemplateAiRevision,
  mode: EmailTemplateAiEditMode,
  declaredVariables: string[],
): TemplateAiDraft & { summary: string; warnings: string[] } {
  const record = asRecord(output);
  const draft = asRecord(record.draft);
  const source = Object.keys(draft).length > 0 ? draft : record;
  const outputSubject = textValue(source.subject);
  const outputPreview = nullableText(source.previewText ?? source.preview_text);
  const outputHtml = textValue(source.html);
  const outputCss = nullableText(source.css);
  const outputText = nullableText(source.text);
  const outputVariables = Array.isArray(source.variables)
    ? source.variables.map(String).map((item) => item.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim()).filter(Boolean)
    : declaredVariables;

  const base: TemplateAiDraft = {
    subject: revision.subject,
    previewText: revision.previewText ?? null,
    html: revision.html,
    css: revision.css ?? null,
    text: revision.text ?? null,
    variables: declaredVariables,
  };
  const next: TemplateAiDraft = mode === 'template_critique'
    ? base
    : mode === 'html_css_only'
      ? {
          ...base,
          html: outputHtml || base.html,
          css: outputCss ?? base.css,
        }
      : mode === 'subject_variants'
        ? {
            ...base,
            subject: outputSubject || base.subject,
            previewText: outputPreview ?? base.previewText,
          }
        : {
            subject: outputSubject || base.subject,
            previewText: outputPreview ?? base.previewText,
            html: outputHtml || base.html,
            css: outputCss ?? base.css,
            text: outputText ?? base.text,
            variables: outputVariables.length > 0 ? [...new Set(outputVariables)] : base.variables,
          };

  return {
    ...next,
    summary: textValue(record.summary) || textValue(record.explanation) || 'Template proposal generated. Review, save, render, test, approve, and publish through the normal release lane.',
    warnings: Array.isArray(record.warnings) ? record.warnings.map((item) => textValue(item)).filter(Boolean) : [],
  };
}

function changedTemplateFields(revision: TemplateAiRevision, proposal: TemplateAiDraft) {
  const changed: string[] = [];
  if (revision.subject !== proposal.subject) changed.push('subject');
  if ((revision.previewText ?? null) !== (proposal.previewText ?? null)) changed.push('previewText');
  if (revision.html !== proposal.html) changed.push('html');
  if ((revision.css ?? null) !== (proposal.css ?? null)) changed.push('css');
  if ((revision.text ?? null) !== (proposal.text ?? null)) changed.push('text');
  const currentVariables = declaredTemplateVariables(revision.variables).join('\n');
  if (currentVariables !== proposal.variables.slice().sort().join('\n')) changed.push('variables');
  return changed;
}

function templateAssistantSystemPrompt() {
  return `You are the Factory Engine Pro mail template assistant for an admin release lane.
Return STRICT JSON only. Do not include markdown fences.
The JSON shape must be:
{
  "draft": {
    "subject": string,
    "previewText": string|null,
    "html": string,
    "css": string|null,
    "text": string|null,
    "variables": string[]
  },
  "summary": string,
  "warnings": string[]
}

Rules:
- This is a proposal only. Never say it was saved, approved, published, activated, or sent.
- Preserve every required template variable unless the user explicitly asks to remove it.
- Use only variables listed in allowedVariables.
- Use customer-readable business language, not internal system wording.
- For marketing templates, keep an unsubscribe link token in the HTML: {{urls.unsubscribe}}.
- Never use script tags, form tags, inline event handlers, javascript: URLs, iframes, external scripts, or tracking pixels.
- Keep subject lines concise and preview text useful.
- If the instruction is unsafe or under-specified, return the current draft and explain the blocker in warnings.
- For html_css_only, change only html/css.
- For subject_variants, change only subject/previewText.
- For template_critique, leave draft unchanged and put findings in summary/warnings.`;
}

function providerSummary(mode: MailProviderMode) {
  if (mode === 'live') {
    return {
      mode,
      message: 'Mail Center is in live delivery mode. Template test and runtime sends still pass category, approval, compliance, and suppression gates.',
    };
  }
  if (mode === 'test') {
    return {
      mode,
      message: 'Mail Center is in test-only mode. Explicit System Mail tests can contact recipients; other template/runtime deliveries are recorded as proof.',
    };
  }
  return {
    mode,
    message: 'Mail sending is intentionally disabled; template actions record delivery evidence without contacting customers.',
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'template';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function nullableText(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function parseJsonObjectOrNull(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractJsonObjectFromAnthropic(body: Record<string, unknown> | null) {
  const content = Array.isArray(body?.content) ? body.content as Array<Record<string, unknown>> : [];
  const text = content
    .map((item) => item.type === 'text' && typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new BadRequestException('Anthropic template assistant returned an empty response.');
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new BadRequestException('Anthropic template assistant did not return JSON.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    throw new BadRequestException('Anthropic template assistant returned invalid JSON.');
  }
}

function providerErrorMessage(body: Record<string, unknown> | null, fallback: string) {
  const error = asRecord(body?.error);
  return textValue(error.message).slice(0, 300) || fallback.trim().slice(0, 300) || null;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
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

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}
