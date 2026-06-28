import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  mailTemplateQuerySchema,
  patchEmailTemplateSchema,
  previewEmailTemplateSchema,
  saveEmailTemplateSchema,
  type MailTemplateQuery,
  type PatchEmailTemplateInput,
  type PreviewEmailTemplateInput,
  type SaveEmailTemplateInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly repository: EmailTemplatesRepository,
    private readonly logger: AppLogger,
  ) {}

  async workspace() {
    const templates = await this.repository.list({ limit: 200 });
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
      provider: disabledProvider(),
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
    const rows = await this.repository.findByEventKey(eventKey);
    return {
      eventKey,
      templates: rows.map((template) => ({ ...toTemplateDto(template), versions: template.versions.map(toVersionDto) })),
      sendingEnabled: false as const,
      provider: disabledProvider(),
    };
  }

  async create(input: SaveEmailTemplateInput) {
    const parsed = saveEmailTemplateSchema.parse(input);
    const created = await this.toConflictOnDuplicateSlug(() => this.repository.create({
      ...parsed,
      slug: parsed.slug ?? slug(parsed.name),
      text: parsed.text ?? null,
      variables: parsed.variables as Prisma.InputJsonValue,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    }));
    this.logger.log('mail_template', 'create', 'Email template created', { template_id: created.id, event_key: created.eventKey });
    return { ...toTemplateDto(created), versions: created.versions.map(toVersionDto) };
  }

  async update(id: string, input: PatchEmailTemplateInput) {
    const parsed = patchEmailTemplateSchema.parse(input);
    const updated = await this.toConflictOnDuplicateSlug(() => this.repository.update(id, {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.slug !== undefined && { slug: parsed.slug || undefined }),
      ...(parsed.eventKey !== undefined && { eventKey: parsed.eventKey }),
      ...(parsed.templateType !== undefined && { templateType: parsed.templateType }),
      ...(parsed.folderKey !== undefined && { folderKey: parsed.folderKey }),
      ...(parsed.subject !== undefined && { subject: parsed.subject }),
      ...(parsed.html !== undefined && { html: parsed.html }),
      ...(parsed.text !== undefined && { text: parsed.text ?? null }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.variables !== undefined && { variables: parsed.variables as Prisma.InputJsonValue }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    }));
    this.logger.log('mail_template', 'update', 'Email template updated', { template_id: id, event_key: updated.eventKey });
    return { ...toTemplateDto(updated), versions: updated.versions.map(toVersionDto) };
  }

  async publishRevision(revisionId: string) {
    const template = await this.repository.publishRevision(revisionId);
    this.logger.log('mail_template', 'publish', 'Email template revision published', {
      template_id: template.id,
      revision_id: revisionId,
      event_key: template.eventKey,
    });
    return { ...toTemplateDto(template), versions: template.versions.map(toVersionDto) };
  }

  async previewRevision(revisionId: string, input: PreviewEmailTemplateInput) {
    const parsed = previewEmailTemplateSchema.parse(input);
    const revision = await this.repository.findRevisionById(revisionId);
    if (!revision) throw new NotFoundException('Email template revision not found');
    return {
      subject: renderTemplate(revision.subject, parsed.variables),
      html: renderTemplate(revision.html, parsed.variables),
      text: revision.text ? renderTemplate(revision.text, parsed.variables) : null,
    };
  }

  async testSend(revisionId: string) {
    this.logger.warn('mail_template', 'test_send_disabled', 'Email template test-send requested while mail marketing delivery is disabled', {
      revision_id: revisionId,
    });
    return {
      sendingEnabled: false,
      status: 'skipped',
      revisionId,
      message: 'Mail Marketing delivery is disabled for this tenant; no email was sent.',
    };
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
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { versions: number };
}) {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    eventKey: template.eventKey,
    templateType: template.templateType as 'transactional' | 'marketing',
    folderKey: template.folderKey,
    subject: template.subject,
    html: template.html,
    text: template.text,
    status: template.status as 'draft' | 'approved' | 'published' | 'archived',
    approvalState: template.approvalState,
    variables: Array.isArray(template.variables) ? template.variables.map(String) : [],
    metadata: asRecord(template.metadata),
    versionCount: template._count?.versions ?? 0,
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
  html: string;
  text: string | null;
  status: string;
  approvalState: string;
  variables: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  publishedAt: Date | null;
}) {
  return {
    id: version.id,
    templateId: version.templateId,
    versionNumber: version.versionNumber,
    subject: version.subject,
    html: version.html,
    text: version.text,
    status: version.status,
    approvalState: version.approvalState,
    variables: Array.isArray(version.variables) ? version.variables.map(String) : [],
    metadata: asRecord(version.metadata),
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function renderTemplate(source: string, variables: Record<string, unknown>) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, variables);
    return value === undefined || value === null ? '' : String(value);
  });
}

function disabledProvider() {
  return {
    mode: 'disabled' as const,
    message: 'Mail sending is intentionally disabled; templates and workflow endpoints are connected without delivery.',
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'template';
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}
