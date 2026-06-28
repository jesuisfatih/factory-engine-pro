import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class MailMarketingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async ensureSettings() {
    const existing = await this.prisma.db.mailMarketingSetting.findFirst({ where: {} });
    if (existing) return existing;
    return this.prisma.db.mailMarketingSetting.create({
      data: {
        id: prefixedId('mset'),
        tenantId: this.tenantId(),
        sendingEnabled: false,
        providerMode: 'disabled',
        quietHours: { enabled: false, start: '21:00', end: '08:00', timezone: 'America/Chicago' } as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(input: {
    providerMode?: string;
    defaultSenderName?: string;
    defaultSenderEmail?: string | null;
    quietHours?: Prisma.InputJsonValue;
    dailySendCap?: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    const settings = await this.ensureSettings();
    await this.prisma.db.mailMarketingSetting.updateMany({
      where: { id: settings.id },
      data: {
        sendingEnabled: false,
        providerMode: 'disabled',
        ...(input.defaultSenderName !== undefined && { defaultSenderName: input.defaultSenderName }),
        ...(input.defaultSenderEmail !== undefined && { defaultSenderEmail: input.defaultSenderEmail }),
        ...(input.quietHours !== undefined && { quietHours: input.quietHours }),
        ...(input.dailySendCap !== undefined && { dailySendCap: input.dailySendCap }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
    });
    return this.ensureSettings();
  }

  listContacts(input: { search?: string; sendable?: boolean; limit: number }) {
    return this.prisma.db.mailContact.findMany({
      where: {
        ...(input.sendable !== undefined && { isSendable: input.sendable }),
        ...(input.search && {
          OR: [
            { email: { contains: input.search, mode: 'insensitive' } },
            { name: { contains: input.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
      take: input.limit,
    });
  }

  async importContactsFromCustomers(limit = 500) {
    const customers = await this.prisma.db.customer.findMany({
      where: { email: { not: null } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        tags: true,
        status: true,
        lastOrderAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const data = customers
      .map((customer) => {
        const email = customer.email?.trim();
        if (!email) return null;
        return {
          id: prefixedId('mcon'),
          tenantId: this.tenantId(),
          customerId: customer.id,
          email,
          normalizedEmail: email.toLowerCase(),
          name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
          phone: customer.phone,
          tags: customer.tags,
          lifecycleStage: customer.status,
          lastActivityAt: customer.lastOrderAt ?? customer.updatedAt,
          metadata: { source: 'customer_import' },
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    if (data.length === 0) return 0;
    const created = await this.prisma.db.mailContact.createMany({ data, skipDuplicates: true });
    return created.count;
  }

  contactCounts() {
    return Promise.all([
      this.prisma.db.mailContact.count({ where: {} }),
      this.prisma.db.mailContact.count({ where: { isSendable: true } }),
    ]);
  }

  listAudiences() {
    return this.prisma.db.mailAudience.findMany({
      where: {},
      orderBy: [{ isArchived: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  findAudience(id: string) {
    return this.prisma.db.mailAudience.findFirst({ where: { id } });
  }

  async createAudience(input: {
    name: string;
    slug: string;
    description?: string | null;
    filters: Prisma.InputJsonValue;
    contactCount: number;
    isArchived: boolean;
  }) {
    return this.prisma.db.mailAudience.create({
      data: {
        id: prefixedId('maud'),
        tenantId: this.tenantId(),
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        filters: input.filters,
        contactCount: input.contactCount,
        isArchived: input.isArchived,
        lastCalculatedAt: new Date(),
      },
    });
  }

  async updateAudience(id: string, input: {
    name?: string;
    slug?: string;
    description?: string | null;
    filters?: Prisma.InputJsonValue;
    contactCount?: number;
    isArchived?: boolean;
  }) {
    await this.requireAudience(id);
    await this.prisma.db.mailAudience.updateMany({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.filters !== undefined && { filters: input.filters, lastCalculatedAt: new Date() }),
        ...(input.contactCount !== undefined && { contactCount: input.contactCount }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
      },
    });
    return this.requireAudience(id);
  }

  listFlows() {
    return this.prisma.db.mailFlow.findMany({ where: {}, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] });
  }

  findFlow(id: string) {
    return this.prisma.db.mailFlow.findFirst({ where: { id } });
  }

  async createFlow(input: {
    name: string;
    slug: string;
    triggerType: string;
    status: string;
    graph: Prisma.InputJsonValue;
    metadata: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailFlow.create({
      data: {
        id: prefixedId('mflw'),
        tenantId: this.tenantId(),
        name: input.name,
        slug: input.slug,
        triggerType: input.triggerType,
        status: input.status,
        graph: input.graph,
        metadata: input.metadata,
        publishedAt: input.status === 'published' ? new Date() : null,
      },
    });
  }

  async updateFlow(id: string, input: {
    name?: string;
    slug?: string;
    triggerType?: string;
    status?: string;
    graph?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.requireFlow(id);
    await this.prisma.db.mailFlow.updateMany({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.triggerType !== undefined && { triggerType: input.triggerType }),
        ...(input.status !== undefined && { status: input.status, publishedAt: input.status === 'published' ? new Date() : null }),
        ...(input.graph !== undefined && { graph: input.graph }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
    });
    return this.requireFlow(id);
  }

  async recordEvent(input: { eventType: string; status?: string; source?: string; metadata?: Prisma.InputJsonValue }) {
    return this.prisma.db.mailMarketingEvent.create({
      data: {
        id: prefixedId('mevt'),
        tenantId: this.tenantId(),
        eventType: input.eventType,
        status: input.status ?? 'recorded',
        source: input.source ?? 'system',
        metadata: input.metadata ?? {},
      },
    });
  }

  recentEvents(limit = 20) {
    return this.prisma.db.mailMarketingEvent.findMany({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async requireAudience(id: string) {
    const audience = await this.findAudience(id);
    if (!audience) throw new NotFoundException('Mail audience not found');
    return audience;
  }

  async requireFlow(id: string) {
    const flow = await this.findFlow(id);
    if (!flow) throw new NotFoundException('Mail flow not found');
    return flow;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
