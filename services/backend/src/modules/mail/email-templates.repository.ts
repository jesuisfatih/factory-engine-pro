import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.db.emailTemplate.findMany({
      where: {
        ...(input.type && { templateType: input.type }),
        ...(input.status && { status: input.status }),
        ...(input.search && {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' } },
            { eventKey: { contains: input.search, mode: 'insensitive' } },
            { slug: { contains: input.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: { _count: { select: { versions: true } } },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: input.limit,
    });
  }

  findById(id: string) {
    return this.prisma.db.emailTemplate.findFirst({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' } }, _count: { select: { versions: true } } },
    });
  }

  findByEventKey(eventKey: string) {
    return this.prisma.db.emailTemplate.findMany({
      where: { eventKey },
      include: { versions: { orderBy: { versionNumber: 'desc' } }, _count: { select: { versions: true } } },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findRevisionById(revisionId: string) {
    return this.prisma.db.emailTemplateVersion.findFirst({ where: { id: revisionId } });
  }

  async create(input: {
    name: string;
    slug: string;
    eventKey: string;
    templateType: string;
    folderKey: string;
    subject: string;
    html: string;
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
        html: input.html,
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
    eventKey?: string;
    templateType?: string;
    folderKey?: string;
    subject?: string;
    html?: string;
    text?: string | null;
    status?: string;
    variables?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await this.requireById(id);
    await this.prisma.db.emailTemplate.updateMany({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
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
    const contentChanged = input.subject !== undefined || input.html !== undefined || input.text !== undefined || input.variables !== undefined;
    if (contentChanged) {
      const nextVersion = (existing.versions[0]?.versionNumber ?? 0) + 1;
      await this.prisma.db.emailTemplateVersion.create({
        data: {
          id: prefixedId('mtpv'),
          tenantId: this.tenantId(),
          templateId: id,
          versionNumber: nextVersion,
          subject: input.subject ?? existing.subject,
          html: input.html ?? existing.html,
          text: input.text !== undefined ? input.text : existing.text,
          variables: input.variables ?? jsonInput(existing.variables, []),
          metadata: { source: 'update' },
        },
      });
    }
    return this.requireById(id);
  }

  async publishRevision(revisionId: string) {
    const revision = await this.prisma.db.emailTemplateVersion.findFirst({ where: { id: revisionId } });
    if (!revision) throw new NotFoundException('Email template revision not found');
    const now = new Date();
    await this.prisma.db.emailTemplateVersion.updateMany({
      where: { id: revisionId },
      data: { status: 'published', approvalState: 'published', publishedAt: now },
    });
    await this.prisma.db.emailTemplate.updateMany({
      where: { id: revision.templateId },
      data: {
        subject: revision.subject,
        html: revision.html,
        text: revision.text,
        variables: jsonInput(revision.variables, []),
        status: 'published',
        approvalState: 'published',
        publishedAt: now,
      },
    });
    return this.requireById(revision.templateId);
  }

  countTemplates() {
    return this.prisma.db.emailTemplate.count({ where: {} });
  }

  private async requireById(id: string) {
    const template = await this.findById(id);
    if (!template) throw new NotFoundException('Email template not found');
    return template;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}

function jsonInput(value: Prisma.JsonValue, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === null ? fallback : value as Prisma.InputJsonValue;
}

function asRecordInput(value: Prisma.InputJsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
