import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class EmailTemplatesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list(input: { type?: string; status?: string; search?: string; limit: number }) {
    const tenantId = this.tenantId();
    return this.prisma.db.emailTemplate.findMany({
      where: {
        tenantId,
        isArchived: input.status === 'archived' ? true : false,
        ...(input.type && { templateType: input.type }),
        ...(input.status && input.status !== 'archived' && { status: input.status }),
        ...(input.search && {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' } },
            { eventKey: { contains: input.search, mode: 'insensitive' } },
            { slug: { contains: input.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: templateInclude,
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: input.limit,
    });
  }

  findById(id: string) {
    const tenantId = this.tenantId();
    return this.prisma.db.emailTemplate.findFirst({
      where: { tenantId, id },
      include: templateInclude,
    });
  }

  findByEventKey(eventKey: string) {
    const tenantId = this.tenantId();
    return this.prisma.db.emailTemplate.findMany({
      where: { tenantId, eventKey, isArchived: false },
      include: templateInclude,
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findRevisionById(revisionId: string) {
    const tenantId = this.tenantId();
    return this.prisma.db.emailTemplateVersion.findFirst({
      where: { tenantId, id: revisionId },
      include: { template: true },
    });
  }

  async create(input: {
    name: string;
    slug: string;
    description?: string | null;
    eventKey: string;
    templateType: string;
    folderKey: string;
    subject: string;
    previewText?: string | null;
    html: string;
    css?: string | null;
    text?: string | null;
    variables: Prisma.InputJsonValue;
    metadata: Prisma.InputJsonValue;
  }) {
    const tenantId = this.tenantId();
    const template = await this.prisma.db.emailTemplate.create({
      data: {
        id: prefixedId('mtpl'),
        tenantId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        eventKey: input.eventKey,
        templateType: input.templateType,
        folderKey: input.folderKey,
        subject: input.subject,
        html: input.html,
        text: input.text ?? null,
        variables: input.variables,
        metadata: input.metadata,
      },
    });
    await this.prisma.db.emailTemplateVersion.create({
      data: {
        id: prefixedId('mtpv'),
        tenantId,
        templateId: template.id,
        versionNumber: 1,
        subject: input.subject,
        previewText: input.previewText ?? null,
        html: input.html,
        css: input.css ?? null,
        text: input.text ?? null,
        variables: input.variables,
        metadata: { ...asRecordInput(input.metadata), source: 'initial' },
      },
    });
    return this.requireById(template.id);
  }

  async update(id: string, input: {
    name?: string;
    slug?: string;
    description?: string | null;
    eventKey?: string;
    templateType?: string;
    folderKey?: string;
    subject?: string;
    previewText?: string | null;
    html?: string;
    css?: string | null;
    text?: string | null;
    status?: string;
    variables?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await this.requireById(id);
    const tenantId = this.tenantId();
    await this.prisma.db.emailTemplate.updateMany({
      where: { tenantId, id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.eventKey !== undefined && { eventKey: input.eventKey }),
        ...(input.templateType !== undefined && { templateType: input.templateType }),
        ...(input.folderKey !== undefined && { folderKey: input.folderKey }),
        ...(input.subject !== undefined && { subject: input.subject }),
        ...(input.html !== undefined && { html: input.html }),
        ...(input.text !== undefined && { text: input.text }),
        ...(input.status !== undefined && { status: input.status, approvalState: input.status }),
        ...(input.variables !== undefined && { variables: input.variables }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
    });
    const contentChanged = input.subject !== undefined || input.previewText !== undefined || input.html !== undefined || input.css !== undefined || input.text !== undefined || input.variables !== undefined;
    if (contentChanged) {
      const nextVersion = (existing.versions[0]?.versionNumber ?? 0) + 1;
      await this.prisma.db.emailTemplateVersion.create({
        data: {
          id: prefixedId('mtpv'),
          tenantId,
          templateId: id,
          versionNumber: nextVersion,
          subject: input.subject ?? existing.subject,
          previewText: input.previewText !== undefined ? input.previewText : existing.publishedVersion?.previewText ?? null,
          html: input.html ?? existing.html,
          css: input.css !== undefined ? input.css : existing.publishedVersion?.css ?? null,
          text: input.text !== undefined ? input.text : existing.text,
          variables: input.variables ?? jsonInput(existing.variables, []),
          metadata: { source: 'update' },
        },
      });
    }
    return this.requireById(id);
  }

  async duplicateVariant(variantId: string) {
    const existing = await this.requireById(variantId);
    const sourceRevision = existing.versions[0];
    if (!sourceRevision) throw new BadRequestException('Template has no revision to duplicate');
    const tenantId = this.tenantId();
    const slugBase = `${existing.slug}-copy`;
    const slug = await this.uniqueSlug(slugBase);
    const template = await this.prisma.db.emailTemplate.create({
      data: {
        id: prefixedId('mtpl'),
        tenantId,
        name: `${existing.name} copy`,
        slug,
        description: existing.description,
        eventKey: existing.eventKey,
        templateType: existing.templateType,
        folderKey: existing.folderKey,
        subject: sourceRevision.subject,
        html: sourceRevision.html,
        text: sourceRevision.text,
        variables: jsonInput(sourceRevision.variables, []),
        metadata: {
          ...asRecordInput(jsonInput(existing.metadata, {})),
          duplicatedFromTemplateId: existing.id,
        },
      },
    });
    await this.prisma.db.emailTemplateVersion.create({
      data: {
        id: prefixedId('mtpv'),
        tenantId,
        templateId: template.id,
        versionNumber: 1,
        subject: sourceRevision.subject,
        previewText: sourceRevision.previewText,
        html: sourceRevision.html,
        css: sourceRevision.css,
        text: sourceRevision.text,
        variables: jsonInput(sourceRevision.variables, []),
        metadata: {
          ...asRecordInput(jsonInput(sourceRevision.metadata, {})),
          source: 'duplicate_variant',
          duplicatedFromRevisionId: sourceRevision.id,
        },
      },
    });
    return this.requireById(template.id);
  }

  async duplicateRevision(revisionId: string) {
    const revision = await this.requireRevision(revisionId);
    const nextVersion = await this.nextVersionNumber(revision.templateId);
    const tenantId = this.tenantId();
    await this.prisma.db.emailTemplateVersion.create({
      data: {
        id: prefixedId('mtpv'),
        tenantId,
        templateId: revision.templateId,
        versionNumber: nextVersion,
        subject: revision.subject,
        previewText: revision.previewText,
        html: revision.html,
        css: revision.css,
        text: revision.text,
        status: 'draft',
        approvalState: 'draft',
        variables: jsonInput(revision.variables, []),
        metadata: {
          ...asRecordInput(jsonInput(revision.metadata, {})),
          source: 'duplicate_revision',
          duplicatedFromRevisionId: revision.id,
        },
      },
    });
    return this.requireById(revision.templateId);
  }

  async updateRevisionSource(revisionId: string, input: {
    subject?: string;
    previewText?: string | null;
    html?: string;
    css?: string | null;
    text?: string | null;
    variables?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const revision = await this.requireRevision(revisionId);
    const tenantId = this.tenantId();
    if (revision.status === 'published') {
      throw new BadRequestException('Published revisions cannot be edited. Duplicate the revision first.');
    }
    await this.prisma.db.emailTemplateVersion.updateMany({
      where: { tenantId, id: revisionId },
      data: {
        ...(input.subject !== undefined && { subject: input.subject }),
        ...(input.previewText !== undefined && { previewText: input.previewText }),
        ...(input.html !== undefined && { html: input.html }),
        ...(input.css !== undefined && { css: input.css }),
        ...(input.text !== undefined && { text: input.text }),
        ...(input.variables !== undefined && { variables: input.variables }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
        status: 'draft',
        approvalState: 'draft',
      },
    });
    return this.requireById(revision.templateId);
  }

  async approveRevision(revisionId: string, input: { comment?: string | null; actorId?: string | null }) {
    const revision = await this.requireRevision(revisionId);
    const tenantId = this.tenantId();
    if (revision.status === 'published') throw new BadRequestException('Published revisions are already final');
    await this.prisma.db.emailTemplateVersion.updateMany({
      where: { tenantId, id: revisionId },
      data: { status: 'approved', approvalState: 'approved' },
    });
    await this.prisma.db.mailTemplateApproval.create({
      data: {
        id: prefixedId('mtpa'),
        tenantId,
        templateId: revision.templateId,
        templateVersionId: revision.id,
        action: 'approved',
        comment: input.comment ?? null,
        actorId: input.actorId ?? null,
      },
    });
    return this.requireById(revision.templateId);
  }

  async publishRevision(revisionId: string, input?: { lintSummary?: Prisma.InputJsonValue; spamScore?: number | null }) {
    const revision = await this.requireRevision(revisionId);
    const tenantId = this.tenantId();
    if (revision.status === 'published') throw new BadRequestException('Revision is already published');
    if (!['draft', 'approved'].includes(revision.status)) throw new BadRequestException('Only draft or approved revisions can be published');
    const now = new Date();
    await this.prisma.db.emailTemplateVersion.updateMany({
      where: { tenantId, id: revisionId },
      data: {
        status: 'published',
        approvalState: 'published',
        publishedAt: now,
        ...(input?.lintSummary !== undefined && { lintSummary: input.lintSummary }),
        ...(input?.spamScore !== undefined && { spamScore: input.spamScore }),
      },
    });
    await this.prisma.db.emailTemplate.updateMany({
      where: { tenantId, id: revision.templateId },
      data: {
        subject: revision.subject,
        html: revision.html,
        text: revision.text,
        variables: jsonInput(revision.variables, []),
        status: 'published',
        approvalState: 'published',
        publishedVersionId: revisionId,
        publishedAt: now,
      },
    });
    await this.prisma.db.mailTemplateApproval.create({
      data: {
        id: prefixedId('mtpa'),
        tenantId,
        templateId: revision.templateId,
        templateVersionId: revisionId,
        action: 'published',
      },
    });
    return this.requireById(revision.templateId);
  }

  async activateVariant(eventKey: string, variantId: string, revisionId?: string) {
    const template = await this.requireById(variantId);
    const tenantId = this.tenantId();
    if (template.eventKey !== eventKey) throw new BadRequestException('Template event does not match the activation event');
    const revision = revisionId
      ? await this.requireRevision(revisionId)
      : template.publishedVersion ?? template.versions.find((version) => version.status === 'published');
    if (!revision) throw new BadRequestException('Publish a revision before activating this template');
    if (revision.templateId !== template.id) throw new BadRequestException('Revision does not belong to this template');
    if (revision.status !== 'published') throw new BadRequestException('Only published revisions can be activated');
    const existing = await this.prisma.db.emailTemplateBinding.findFirst({ where: { tenantId, eventKey } });
    if (existing) {
      await this.prisma.db.emailTemplateBinding.updateMany({
        where: { tenantId, id: existing.id },
        data: {
          templateId: template.id,
          templateVersionId: revision.id,
          isEnabled: true,
        },
      });
    } else {
      await this.prisma.db.emailTemplateBinding.create({
        data: {
          id: prefixedId('mtpb'),
          tenantId,
          eventKey,
          templateId: template.id,
          templateVersionId: revision.id,
          isEnabled: true,
        },
      });
    }
    return this.requireById(template.id);
  }

  async deleteRevision(revisionId: string) {
    const revision = await this.requireRevision(revisionId);
    const tenantId = this.tenantId();
    const activeBinding = await this.prisma.db.emailTemplateBinding.findFirst({ where: { tenantId, templateVersionId: revisionId } });
    if (activeBinding) throw new BadRequestException('Active revisions cannot be deleted. Activate another published revision first.');
    if (revision.status === 'published') throw new BadRequestException('Published revisions cannot be deleted');
    const revisionCount = await this.prisma.db.emailTemplateVersion.count({ where: { tenantId, templateId: revision.templateId } });
    if (revisionCount <= 1) throw new BadRequestException('A template must keep at least one revision');
    await this.prisma.db.emailTemplateVersion.deleteMany({ where: { tenantId, id: revisionId } });
    return this.requireById(revision.templateId);
  }

  listPreviewProfiles(input: { templateId?: string; eventKey?: string; limit: number }) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailTemplatePreviewProfile.findMany({
      where: {
        tenantId,
        ...(input.templateId && { templateId: input.templateId }),
        ...(input.eventKey && { eventKey: input.eventKey }),
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { name: 'asc' }],
      take: input.limit,
    });
  }

  async createPreviewProfile(input: {
    templateId?: string | null;
    eventKey?: string | null;
    name: string;
    description?: string | null;
    variables: Prisma.InputJsonValue;
    isDefault: boolean;
  }) {
    if (input.templateId) await this.requireById(input.templateId);
    const tenantId = this.tenantId();
    if (input.isDefault) await this.clearPreviewProfileDefaults(input.templateId ?? null, input.eventKey ?? null);
    return this.prisma.db.mailTemplatePreviewProfile.create({
      data: {
        id: prefixedId('mtpp'),
        tenantId,
        templateId: input.templateId ?? null,
        eventKey: input.eventKey ?? null,
        name: input.name,
        description: input.description ?? null,
        variables: input.variables,
        isDefault: input.isDefault,
      },
    });
  }

  async updatePreviewProfile(id: string, input: {
    templateId?: string | null;
    eventKey?: string | null;
    name?: string;
    description?: string | null;
    variables?: Prisma.InputJsonValue;
    isDefault?: boolean;
  }) {
    const existing = await this.requirePreviewProfile(id);
    const tenantId = this.tenantId();
    const nextTemplateId = input.templateId !== undefined ? input.templateId : existing.templateId;
    const nextEventKey = input.eventKey !== undefined ? input.eventKey : existing.eventKey;
    if (nextTemplateId) await this.requireById(nextTemplateId);
    if (input.isDefault === true) await this.clearPreviewProfileDefaults(nextTemplateId ?? null, nextEventKey ?? null, id);
    await this.prisma.db.mailTemplatePreviewProfile.updateMany({
      where: { tenantId, id },
      data: {
        ...(input.templateId !== undefined && { templateId: input.templateId }),
        ...(input.eventKey !== undefined && { eventKey: input.eventKey }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.variables !== undefined && { variables: input.variables }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      },
    });
    return this.requirePreviewProfile(id);
  }

  async deletePreviewProfile(id: string) {
    await this.requirePreviewProfile(id);
    await this.prisma.db.mailTemplatePreviewProfile.deleteMany({ where: { tenantId: this.tenantId(), id } });
    return { ok: true };
  }

  listSnippets(input: { templateType?: string; includeArchived: boolean; limit: number }) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailTemplateSnippet.findMany({
      where: {
        tenantId,
        ...(input.templateType && {
          OR: [
            { templateType: input.templateType },
            { templateType: null },
          ],
        }),
        ...(!input.includeArchived && { isArchived: false }),
      },
      orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }, { name: 'asc' }],
      take: input.limit,
    });
  }

  async createSnippet(input: {
    key: string;
    name: string;
    description?: string | null;
    templateType?: string | null;
    subject?: string | null;
    html?: string | null;
    css?: string | null;
    text?: string | null;
    metadata: Prisma.InputJsonValue;
    isArchived: boolean;
  }) {
    await this.assertSnippetKeyAvailable(input.key);
    return this.prisma.db.mailTemplateSnippet.create({
      data: {
        id: prefixedId('mtsn'),
        tenantId: this.tenantId(),
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        templateType: input.templateType ?? null,
        subject: input.subject ?? null,
        html: input.html ?? null,
        css: input.css ?? null,
        text: input.text ?? null,
        metadata: input.metadata,
        isArchived: input.isArchived,
      },
    });
  }

  async updateSnippet(id: string, input: {
    key?: string;
    name?: string;
    description?: string | null;
    templateType?: string | null;
    subject?: string | null;
    html?: string | null;
    css?: string | null;
    text?: string | null;
    metadata?: Prisma.InputJsonValue;
    isArchived?: boolean;
  }) {
    await this.requireSnippet(id);
    if (input.key) await this.assertSnippetKeyAvailable(input.key, id);
    await this.prisma.db.mailTemplateSnippet.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: {
        ...(input.key !== undefined && { key: input.key }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.templateType !== undefined && { templateType: input.templateType }),
        ...(input.subject !== undefined && { subject: input.subject }),
        ...(input.html !== undefined && { html: input.html }),
        ...(input.css !== undefined && { css: input.css }),
        ...(input.text !== undefined && { text: input.text }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
      },
    });
    return this.requireSnippet(id);
  }

  async deleteSnippet(id: string) {
    await this.requireSnippet(id);
    await this.prisma.db.mailTemplateSnippet.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: { isArchived: true },
    });
    return { ok: true };
  }

  listBlocks(input: { category?: string; includeArchived: boolean; limit: number }) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailTemplateBlock.findMany({
      where: {
        tenantId,
        ...(input.category && { category: input.category }),
        ...(!input.includeArchived && { isArchived: false }),
      },
      orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }, { name: 'asc' }],
      take: input.limit,
    });
  }

  async createBlock(input: {
    key: string;
    name: string;
    category: string;
    description?: string | null;
    html: string;
    css?: string | null;
    metadata: Prisma.InputJsonValue;
    isArchived: boolean;
  }) {
    await this.assertBlockKeyAvailable(input.key);
    return this.prisma.db.mailTemplateBlock.create({
      data: {
        id: prefixedId('mtbl'),
        tenantId: this.tenantId(),
        key: input.key,
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        html: input.html,
        css: input.css ?? null,
        metadata: input.metadata,
        isArchived: input.isArchived,
      },
    });
  }

  async updateBlock(id: string, input: {
    key?: string;
    name?: string;
    category?: string;
    description?: string | null;
    html?: string;
    css?: string | null;
    metadata?: Prisma.InputJsonValue;
    isArchived?: boolean;
  }) {
    await this.requireBlock(id);
    if (input.key) await this.assertBlockKeyAvailable(input.key, id);
    await this.prisma.db.mailTemplateBlock.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: {
        ...(input.key !== undefined && { key: input.key }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.html !== undefined && { html: input.html }),
        ...(input.css !== undefined && { css: input.css }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
      },
    });
    return this.requireBlock(id);
  }

  async deleteBlock(id: string) {
    await this.requireBlock(id);
    await this.prisma.db.mailTemplateBlock.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: { isArchived: true },
    });
    return { ok: true };
  }

  countTemplates() {
    return this.prisma.db.emailTemplate.count({ where: { tenantId: this.tenantId() } });
  }

  private async requireById(id: string) {
    const template = await this.findById(id);
    if (!template) throw new NotFoundException('Email template not found');
    return template;
  }

  private async requireRevision(revisionId: string) {
    const revision = await this.prisma.db.emailTemplateVersion.findFirst({ where: { tenantId: this.tenantId(), id: revisionId } });
    if (!revision) throw new NotFoundException('Email template revision not found');
    return revision;
  }

  private async requirePreviewProfile(id: string) {
    const profile = await this.prisma.db.mailTemplatePreviewProfile.findFirst({ where: { tenantId: this.tenantId(), id } });
    if (!profile) throw new NotFoundException('Mail template preview profile not found');
    return profile;
  }

  private async requireSnippet(id: string) {
    const snippet = await this.prisma.db.mailTemplateSnippet.findFirst({ where: { tenantId: this.tenantId(), id } });
    if (!snippet) throw new NotFoundException('Mail template snippet not found');
    return snippet;
  }

  private async requireBlock(id: string) {
    const block = await this.prisma.db.mailTemplateBlock.findFirst({ where: { tenantId: this.tenantId(), id } });
    if (!block) throw new NotFoundException('Mail template block not found');
    return block;
  }

  private async assertSnippetKeyAvailable(key: string, exceptId?: string) {
    const existing = await this.prisma.db.mailTemplateSnippet.findFirst({
      where: { tenantId: this.tenantId(), key, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('A mail template snippet with this key already exists');
  }

  private async assertBlockKeyAvailable(key: string, exceptId?: string) {
    const existing = await this.prisma.db.mailTemplateBlock.findFirst({
      where: { tenantId: this.tenantId(), key, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('A mail template block with this key already exists');
  }

  private async clearPreviewProfileDefaults(templateId: string | null, eventKey: string | null, exceptId?: string) {
    await this.prisma.db.mailTemplatePreviewProfile.updateMany({
      where: {
        tenantId: this.tenantId(),
        ...(templateId ? { templateId } : { templateId: null }),
        ...(eventKey ? { eventKey } : { eventKey: null }),
        ...(exceptId && { id: { not: exceptId } }),
      },
      data: { isDefault: false },
    });
  }

  private async nextVersionNumber(templateId: string) {
    const latest = await this.prisma.db.emailTemplateVersion.findFirst({
      where: { tenantId: this.tenantId(), templateId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return (latest?.versionNumber ?? 0) + 1;
  }

  private async uniqueSlug(slugBase: string) {
    const clean = slugBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'template-copy';
    for (let index = 0; index < 100; index += 1) {
      const candidate = index === 0 ? clean : `${clean}-${index + 1}`;
      const existing = await this.prisma.db.emailTemplate.findFirst({ where: { tenantId: this.tenantId(), slug: candidate } });
      if (!existing) return candidate;
    }
    return `${clean}-${Date.now()}`;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }

  currentTenantId() {
    return this.tenantId();
  }
}

const templateInclude = {
  versions: { orderBy: { versionNumber: 'desc' } },
  bindings: { orderBy: { updatedAt: 'desc' } },
  publishedVersion: true,
  _count: { select: { versions: true } },
} satisfies Prisma.EmailTemplateInclude;

function jsonInput(value: Prisma.JsonValue, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === null ? fallback : value as Prisma.InputJsonValue;
}

function asRecordInput(value: Prisma.InputJsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
