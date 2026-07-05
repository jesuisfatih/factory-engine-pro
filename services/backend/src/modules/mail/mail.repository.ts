import { Injectable, NotFoundException } from '@nestjs/common';
import type { MailDeliveryStatus, Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

type MailDeliveryListInput = {
  status?: MailDeliveryStatus;
  eventKey?: string;
  recipient?: string;
  category?: string;
  templateId?: string;
  templateVersionId?: string;
  source?: string;
  limit: number;
};

type MailDeliveryLogInput = MailDeliveryListInput & {
  search?: string;
  cursor?: string;
};

type MailProviderEventLogInput = {
  eventType?: string;
  recipient?: string;
  deliveryId?: string;
  providerMessageId?: string;
  search?: string;
  limit: number;
  cursor?: string;
};

@Injectable()
export class MailRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  createDelivery(input: {
    eventKey: string;
    category?: string;
    templateId?: string | null;
    templateVersionId?: string | null;
    recipientEmail: string;
    subject: string;
    html: string;
    text?: string | null;
    status?: MailDeliveryStatus;
    provider?: string | null;
    errorMessage?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailDelivery.create({
      data: {
        id: prefixedId('mail'),
        tenantId: this.tenantId(),
        eventKey: input.eventKey,
        category: input.category ?? 'system',
        templateId: input.templateId ?? null,
        templateVersionId: input.templateVersionId ?? null,
        recipientEmail: input.recipientEmail.toLowerCase(),
        subject: input.subject,
        html: input.html,
        text: input.text ?? null,
        ...(input.status && { status: input.status }),
        provider: input.provider ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata: input.metadata ?? {},
      },
    });
  }

  list(input: MailDeliveryListInput) {
    return this.prisma.db.mailDelivery.findMany({
      where: this.deliveryWhere(input),
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });
  }

  async listPage(input: MailDeliveryLogInput) {
    const where = this.deliveryWhere(input);
    const [count, rows] = await Promise.all([
      this.prisma.db.mailDelivery.count({ where }),
      this.prisma.db.mailDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      }),
    ]);
    const data = rows.slice(0, input.limit);
    return {
      data,
      meta: {
        count,
        pageCount: data.length,
        limit: input.limit,
        nextCursor: rows.length > input.limit ? rows[input.limit]?.id ?? null : null,
      },
    };
  }

  async listProviderEventPage(input: MailProviderEventLogInput) {
    const where = this.providerEventWhere(input);
    const [count, rows] = await Promise.all([
      this.prisma.db.mailProviderEvent.count({ where }),
      this.prisma.db.mailProviderEvent.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        include: {
          delivery: {
            select: {
              id: true,
              status: true,
              eventKey: true,
              category: true,
              recipientEmail: true,
              subject: true,
              providerMessageId: true,
            },
          },
        },
      }),
    ]);
    const data = rows.slice(0, input.limit);
    return {
      data,
      meta: {
        count,
        pageCount: data.length,
        limit: input.limit,
        nextCursor: rows.length > input.limit ? rows[input.limit]?.id ?? null : null,
      },
    };
  }

  findById(id: string) {
    return this.prisma.db.mailDelivery.findFirst({ where: { tenantId: this.tenantId(), id } });
  }

  findRecentIdempotencyKey(idempotencyKey: string, since: Date) {
    return this.prisma.db.mailIdempotencyKey.findFirst({
      where: { tenantId: this.tenantId(), idempotencyKey, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordIdempotencyKey(input: {
    idempotencyKey: string;
    eventKey: string;
    recipientEmail: string;
    deliveryId: string | null;
  }) {
    try {
      return await this.prisma.db.mailIdempotencyKey.create({
        data: {
          id: prefixedId('miky'),
          tenantId: this.tenantId(),
          idempotencyKey: input.idempotencyKey,
          eventKey: input.eventKey,
          recipientEmail: input.recipientEmail.toLowerCase(),
          deliveryId: input.deliveryId,
        },
      });
    } catch (error) {
      if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') return null;
      throw error;
    }
  }

  async markSending(id: string) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: { status: 'sending', attemptCount: { increment: 1 }, errorMessage: null },
    });
    return this.requireById(id);
  }

  async markSent(id: string, provider: string, providerMessageId: string | null) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: { status: 'sent', provider, providerMessageId, errorMessage: null, sentAt: new Date() },
    });
    return this.requireById(id);
  }

  async markFailed(id: string, errorMessage: string) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: { status: 'failed', errorMessage },
    });
    return this.requireById(id);
  }

  async markSkipped(id: string, reason: string, metadata?: Prisma.InputJsonValue) {
    const existing = await this.requireById(id);
    await this.prisma.db.mailDelivery.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: {
        status: 'skipped',
        errorMessage: reason,
        ...(metadata && { metadata: mergeMetadata(existing.metadata, metadata) }),
      },
    });
    return this.requireById(id);
  }

  async markQueuedDisabled(id: string, reason: string, metadata?: Prisma.InputJsonValue) {
    const existing = await this.requireById(id);
    await this.prisma.db.mailDelivery.updateMany({
      where: { tenantId: this.tenantId(), id },
      data: {
        status: 'queued_disabled',
        provider: 'disabled',
        errorMessage: reason,
        ...(metadata && { metadata: mergeMetadata(existing.metadata, metadata) }),
      },
    });
    return this.requireById(id);
  }

  private async requireById(id: string) {
    const delivery = await this.findById(id);
    if (!delivery) throw new NotFoundException('Mail delivery not found');
    return delivery;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }

  private deliveryWhere(input: MailDeliveryListInput & { search?: string }): Prisma.MailDeliveryWhereInput {
    const tenantId = this.tenantId();
    const andFilters: Prisma.MailDeliveryWhereInput[] = [];
    if (input.source) andFilters.push({ metadata: { path: ['source'], equals: input.source } });
    const search = input.search?.trim();
    if (search) {
      andFilters.push({
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { eventKey: { contains: search, mode: 'insensitive' } },
          { recipientEmail: { contains: search.toLowerCase(), mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { providerMessageId: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    return {
      tenantId,
      ...(input.status && { status: input.status }),
      ...(input.eventKey && { eventKey: { contains: input.eventKey, mode: 'insensitive' } }),
      ...(input.recipient && { recipientEmail: { contains: input.recipient.toLowerCase(), mode: 'insensitive' } }),
      ...(input.category && { category: { contains: input.category, mode: 'insensitive' } }),
      ...(input.templateId && { templateId: input.templateId }),
      ...(input.templateVersionId && { templateVersionId: input.templateVersionId }),
      ...(andFilters.length > 0 && { AND: andFilters }),
    };
  }

  private providerEventWhere(input: MailProviderEventLogInput): Prisma.MailProviderEventWhereInput {
    const tenantId = this.tenantId();
    const andFilters: Prisma.MailProviderEventWhereInput[] = [];
    const search = input.search?.trim();
    if (search) {
      andFilters.push({
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { providerEventId: { contains: search, mode: 'insensitive' } },
          { providerMessageId: { contains: search, mode: 'insensitive' } },
          { deliveryId: { contains: search, mode: 'insensitive' } },
          { eventType: { contains: search, mode: 'insensitive' } },
          { recipientEmail: { contains: search.toLowerCase(), mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    return {
      tenantId,
      ...(input.eventType && { eventType: { contains: input.eventType, mode: 'insensitive' } }),
      ...(input.recipient && { recipientEmail: { contains: input.recipient.toLowerCase(), mode: 'insensitive' } }),
      ...(input.deliveryId && { deliveryId: input.deliveryId }),
      ...(input.providerMessageId && { providerMessageId: { contains: input.providerMessageId, mode: 'insensitive' } }),
      ...(andFilters.length > 0 && { AND: andFilters }),
    };
  }
}

function mergeMetadata(current: unknown, patch: unknown): Prisma.InputJsonObject {
  return {
    ...metadataObject(current),
    ...metadataObject(patch),
  };
}

function metadataObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.InputJsonObject
    : {};
}
