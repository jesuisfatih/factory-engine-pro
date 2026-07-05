import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.mailMarketingSetting.findFirst({ where: { tenantId } });
    if (existing) return existing;
    return this.prisma.db.mailMarketingSetting.create({
      data: {
        id: prefixedId('mset'),
        tenantId,
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
      where: { tenantId: this.tenantId(), id: settings.id },
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
    const tenantId = this.tenantId();
    return this.prisma.db.mailContact.findMany({
      where: {
        tenantId,
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
      include: {
        consentStates: {
          where: { tenantId, channel: 'email', category: 'marketing' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  listAudienceContacts(limit: number) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailContact.findMany({
      where: { tenantId },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      include: {
        consentStates: {
          where: { tenantId, channel: 'email', category: 'marketing' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        suppressions: {
          where: { tenantId, channel: 'email', isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async ensureManualAudienceContacts(emails: string[]) {
    const normalized = Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
    if (normalized.length === 0) return 0;
    let touched = 0;
    for (const email of normalized) {
      const contact = await this.prisma.db.mailContact.upsert({
        where: {
          tenantId_normalizedEmail: {
            tenantId: this.tenantId(),
            normalizedEmail: email,
          },
        },
        create: {
          id: prefixedId('mcon'),
          tenantId: this.tenantId(),
          email,
          normalizedEmail: email,
          name: null,
          phone: null,
          tags: [],
          lifecycleStage: 'manual',
          isSendable: true,
          metadata: { source: 'manual_audience_email' },
        },
        update: {
          email,
          isSendable: true,
          metadata: { source: 'manual_audience_email' },
        },
      });
      await this.upsertContactIdentity({
        contactId: contact.id,
        entityType: 'mail_contact',
        entityKey: contact.id,
        email,
        metadata: { source: 'manual_audience_email' },
      });
      await this.upsertContactIdentity({
        contactId: contact.id,
        entityType: 'email',
        entityKey: email,
        email,
        metadata: { source: 'manual_audience_email' },
      });
      touched += 1;
    }
    return touched;
  }

  customersForAudience(input: { customerIds: string[]; emails: string[] }) {
    const customerIds = Array.from(new Set(input.customerIds.filter(Boolean)));
    const emails = Array.from(new Set(input.emails.map((email) => email.trim()).filter(Boolean)));
    if (customerIds.length === 0 && emails.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.customer.findMany({
      where: {
        tenantId,
        OR: [
          ...(customerIds.length > 0 ? [{ id: { in: customerIds } }] : []),
          ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
        ],
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        companyName: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        tags: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderAt: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  segmentMembershipsForAudience(customerIds: string[]) {
    const ids = Array.from(new Set(customerIds.filter(Boolean)));
    if (ids.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.segmentCustomerMembership.findMany({
      where: { tenantId, customerId: { in: ids } },
      select: {
        customerId: true,
        segmentId: true,
        source: true,
        shopifySegmentRef: true,
        segment: {
          select: {
            id: true,
            name: true,
            lifecycleStage: true,
            isActive: true,
          },
        },
      },
    });
  }

  shopifySegmentMembershipsForAudience(shopifyCustomerIds: string[]) {
    const ids = Array.from(new Set(shopifyCustomerIds.filter(Boolean)));
    if (ids.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.shopifyCustomerSegmentMember.findMany({
      where: { tenantId, shopifyCustomerId: { in: ids } },
      select: {
        shopifyCustomerId: true,
        shopifySegmentId: true,
        segment: {
          select: {
            shopifySegmentId: true,
            name: true,
          },
        },
      },
    });
  }

  customerListItemsForAudience(customerIds: string[]) {
    const ids = Array.from(new Set(customerIds.filter(Boolean)));
    if (ids.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.customerListItem.findMany({
      where: { tenantId, customerId: { in: ids } },
      select: {
        customerId: true,
        listId: true,
        list: {
          select: {
            id: true,
            name: true,
            systemType: true,
          },
        },
      },
    });
  }

  customerAssignmentsForAudience(customerIds: string[]) {
    const ids = Array.from(new Set(customerIds.filter(Boolean)));
    if (ids.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.customerAssignment.findMany({
      where: { tenantId, customerId: { in: ids } },
      select: {
        customerId: true,
        axis: true,
        memberId: true,
        isPrimary: true,
      },
    });
  }

  findMemberById(memberId: string) {
    return this.prisma.db.member.findFirst({
      where: { tenantId: this.tenantId(), id: memberId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  resolveCustomerAxisPrimaryMember(customerId: string, axis: 'sales' | 'account') {
    return this.prisma.db.customerAssignment.findFirst({
      where: {
        tenantId: this.tenantId(),
        customerId,
        axis,
        isPrimary: true,
      },
      select: {
        id: true,
        memberId: true,
        member: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findMailFlowFollowUpTask(taskKey: string) {
    return this.prisma.db.serviceRequest.findFirst({
      where: {
        tenantId: this.tenantId(),
        metadata: {
          path: ['mailFlowTaskKey'],
          equals: taskKey,
        },
      },
      select: { id: true, title: true, assignedMemberId: true },
    });
  }

  createMailFlowFollowUpTask(input: {
    customerId: string | null;
    assignedMemberId: string | null;
    axis: 'sales' | 'account';
    title: string;
    description: string | null;
    priority: 'critical' | 'urgent' | 'high' | 'medium' | 'low';
    dueAt: Date | null;
    sourceCallId: string | null;
    metadata: Prisma.InputJsonValue;
    taskStateSnapshot: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.serviceRequest.create({
      data: {
        id: prefixedId('sr'),
        tenantId: this.tenantId(),
        customerId: input.customerId,
        assignedMemberId: input.assignedMemberId,
        axis: input.axis,
        matchedRuleId: null,
        source: 'admin_created',
        surface: 'internal',
        sourceCallId: input.sourceCallId,
        title: input.title,
        description: input.description,
        status: 'open',
        priority: input.priority,
        dueAt: input.dueAt,
        metadata: input.metadata,
        conditionTrace: [],
        taskStateSnapshot: input.taskStateSnapshot,
      },
      select: {
        id: true,
        title: true,
        assignedMemberId: true,
      },
    });
  }

  commerceOrdersForAudience(input: { customerIds: string[]; emails: string[]; shopifyCustomerIds: string[] }) {
    const customerIds = Array.from(new Set(input.customerIds.filter(Boolean)));
    const emails = Array.from(new Set(input.emails.map((email) => email.trim()).filter(Boolean)));
    const shopifyCustomerIds = Array.from(new Set(input.shopifyCustomerIds.filter(Boolean)));
    if (customerIds.length === 0 && emails.length === 0 && shopifyCustomerIds.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.commerceOrder.findMany({
      where: {
        tenantId,
        OR: [
          ...(customerIds.length > 0 ? [{ customerId: { in: customerIds } }] : []),
          ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
          ...(shopifyCustomerIds.length > 0 ? [{ shopifyCustomerId: { in: shopifyCustomerIds } }] : []),
        ],
      },
      select: {
        id: true,
        customerId: true,
        email: true,
        shopifyCustomerId: true,
        shopifyOrderNumber: true,
        totalPrice: true,
        lineItems: true,
        processedAt: true,
        createdAt: true,
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take: 25000,
    });
  }

  findContactDetail(contactId: string) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailContact.findFirst({
      where: { tenantId, id: contactId },
      include: {
        consentStates: {
          where: { tenantId, channel: 'email' },
          orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
        },
        suppressions: {
          where: { tenantId, channel: 'email' },
          orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        },
        identities: {
          orderBy: [{ entityType: 'asc' }, { updatedAt: 'desc' }],
        },
        snapshotMembers: {
          include: {
            snapshot: {
              include: {
                audience: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        flowActionLogs: {
          include: {
            flow: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
    });
  }

  customerSummary(customerId: string) {
    return this.prisma.db.customer.findFirst({
      where: { tenantId: this.tenantId(), id: customerId },
      select: {
        id: true,
        shopifyCustomerId: true,
        companyName: true,
        email: true,
        phone: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderAt: true,
      },
    });
  }

  customerUsersForContact(customerId: string) {
    return this.prisma.db.customerUser.findMany({
      where: { tenantId: this.tenantId(), customerId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 10,
    });
  }

  recentDeliveriesForContact(contact: { email: string; normalizedEmail: string }) {
    const emails = Array.from(new Set([contact.email, contact.normalizedEmail].map((value) => value.trim().toLowerCase()).filter(Boolean)));
    return this.prisma.db.mailDelivery.findMany({
      where: { tenantId: this.tenantId(), recipientEmail: { in: emails } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        eventKey: true,
        category: true,
        templateId: true,
        templateVersionId: true,
        recipientEmail: true,
        subject: true,
        status: true,
        provider: true,
        errorMessage: true,
        createdAt: true,
        sentAt: true,
      },
    });
  }

  recentEventsForContact(contact: { id: string; customerId: string | null; email: string; normalizedEmail: string }) {
    const emails = Array.from(new Set([contact.email, contact.normalizedEmail].map((value) => value.trim().toLowerCase()).filter(Boolean)));
    const filters: Prisma.MailMarketingEventWhereInput[] = [
      { metadata: { path: ['contactId'], equals: contact.id } },
      ...emails.flatMap((email) => [
        { metadata: { path: ['email'], equals: email } },
        { metadata: { path: ['recipientEmail'], equals: email } },
      ]),
      ...(contact.customerId ? [{ metadata: { path: ['customerId'], equals: contact.customerId } }] : []),
    ];
    return this.prisma.db.mailMarketingEvent.findMany({
      where: { tenantId: this.tenantId(), OR: filters },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        eventType: true,
        status: true,
        source: true,
        metadata: true,
        createdAt: true,
      },
    });
  }

  async recordContactConsent(contactId: string, input: {
    state: string;
    channel: string;
    category: string;
    source: string;
    sourceDetail?: string | null;
    metadata: Prisma.InputJsonValue;
  }) {
    const tenantId = this.tenantId();
    const contact = await this.prisma.db.mailContact.findFirst({ where: { tenantId, id: contactId } });
    if (!contact) throw new NotFoundException('Mail contact not found');
    return this.prisma.db.mailConsentState.upsert({
      where: {
        tenantId_contactId_channel_category: {
          tenantId,
          contactId,
          channel: input.channel,
          category: input.category,
        },
      },
      create: {
        id: prefixedId('mcst'),
        tenantId,
        contactId,
        channel: input.channel,
        category: input.category,
        state: input.state,
        source: input.source,
        sourceDetail: input.sourceDetail ?? null,
        metadata: input.metadata,
        capturedAt: new Date(),
      },
      update: {
        state: input.state,
        source: input.source,
        sourceDetail: input.sourceDetail ?? null,
        metadata: input.metadata,
        capturedAt: new Date(),
      },
    });
  }

  async publicPreferenceSummary(input: {
    email: string;
    contactId?: string | null;
    customerId?: string | null;
    source: string;
  }) {
    const contact = await this.resolvePreferenceContact(input);
    const [consent, suppression] = await Promise.all([
      this.prisma.db.mailConsentState.findFirst({
        where: { tenantId: this.tenantId(), contactId: contact.id, channel: 'email', category: 'marketing' },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.db.mailSuppression.findFirst({
        where: {
          tenantId: this.tenantId(),
          contactId: contact.id,
          channel: 'email',
          isActive: true,
          OR: [
            { scope: 'global' },
            { scope: 'category', category: 'marketing' },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      contact,
      consent,
      suppression,
    };
  }

  async recordPublicMarketingUnsubscribe(input: {
    email: string;
    contactId?: string | null;
    customerId?: string | null;
    source: string;
    tokenIssuedAt: number;
    tokenExpiresAt: number;
  }) {
    const tenantId = this.tenantId();
    const contact = await this.resolvePreferenceContact(input);
    const metadata: Prisma.InputJsonValue = {
      source: 'mail_preference_link',
      linkSource: input.source,
      tokenIssuedAt: input.tokenIssuedAt,
      tokenExpiresAt: input.tokenExpiresAt,
    };
    const consent = await this.prisma.db.mailConsentState.upsert({
      where: {
        tenantId_contactId_channel_category: {
          tenantId,
          contactId: contact.id,
          channel: 'email',
          category: 'marketing',
        },
      },
      create: {
        id: prefixedId('mcst'),
        tenantId,
        contactId: contact.id,
        channel: 'email',
        category: 'marketing',
        state: 'unsubscribed',
        source: 'mail_preference_link',
        sourceDetail: input.source,
        metadata,
        capturedAt: new Date(),
      },
      update: {
        state: 'unsubscribed',
        source: 'mail_preference_link',
        sourceDetail: input.source,
        metadata,
        capturedAt: new Date(),
      },
    });
    const existingSuppression = await this.prisma.db.mailSuppression.findFirst({
      where: {
        tenantId,
        contactId: contact.id,
        channel: 'email',
        scope: 'category',
        category: 'marketing',
      },
      orderBy: { updatedAt: 'desc' },
    });
    const suppressionData = {
      scope: 'category',
      category: 'marketing',
      campaignId: null,
      flowId: null,
      templateId: null,
      isActive: true,
      reason: 'unsubscribe',
      source: 'mail_preference_link',
      notes: `Unsubscribed from ${input.source || 'marketing email link'}`,
      expiresAt: null,
    };
    let suppression;
    if (existingSuppression) {
      await this.prisma.db.mailSuppression.updateMany({
        where: { tenantId, id: existingSuppression.id },
        data: suppressionData,
      });
      suppression = await this.prisma.db.mailSuppression.findFirst({ where: { tenantId, id: existingSuppression.id } });
      if (!suppression) throw new NotFoundException('Suppression record not found after update');
    } else {
      suppression = await this.prisma.db.mailSuppression.create({
        data: {
          id: prefixedId('msup'),
          tenantId,
          contactId: contact.id,
          channel: 'email',
          ...suppressionData,
        },
      });
    }
    return { contact, consent, suppression };
  }

  async importContactsFromCustomers(limit = 500) {
    const tenantId = this.tenantId();
    const customers = await this.prisma.db.customer.findMany({
      where: { tenantId, email: { not: null } },
      select: {
        id: true,
        shopifyCustomerId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        tags: true,
        status: true,
        lastOrderAt: true,
        updatedAt: true,
        customerUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
          take: 20,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    let touched = 0;
    for (const customer of customers) {
      const email = customer.email?.trim();
      if (!email) continue;
      const contact = await this.prisma.db.mailContact.upsert({
        where: {
          tenantId_normalizedEmail: {
            tenantId,
            normalizedEmail: email.toLowerCase(),
          },
        },
        create: {
          id: prefixedId('mcon'),
          tenantId,
          customerId: customer.id,
          email,
          normalizedEmail: email.toLowerCase(),
          name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
          phone: customer.phone,
          tags: customer.tags,
          lifecycleStage: customer.status,
          lastActivityAt: customer.lastOrderAt ?? customer.updatedAt,
          metadata: { source: 'customer_import' },
        },
        update: {
          customerId: customer.id,
          email,
          name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
          phone: customer.phone,
          tags: customer.tags,
          lifecycleStage: customer.status,
          lastActivityAt: customer.lastOrderAt ?? customer.updatedAt,
          metadata: { source: 'customer_import' },
        },
      });
      await this.syncCustomerContactIdentities(contact.id, customer);
      touched += 1;
    }
    return touched;
  }

  contactCounts() {
    const tenantId = this.tenantId();
    return Promise.all([
      this.prisma.db.mailContact.count({ where: { tenantId } }),
      this.prisma.db.mailContact.count({ where: { tenantId, isSendable: true } }),
    ]);
  }

  listAudiences() {
    return this.prisma.db.mailAudience.findMany({
      where: { tenantId: this.tenantId() },
      orderBy: [{ isArchived: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  findAudience(id: string) {
    return this.prisma.db.mailAudience.findFirst({ where: { tenantId: this.tenantId(), id } });
  }

  async updateContactTags(contactId: string, tags: string[], action: 'add' | 'remove') {
    const tenantId = this.tenantId();
    const contact = await this.prisma.db.mailContact.findFirst({ where: { tenantId, id: contactId } });
    if (!contact) return null;
    const currentTags = jsonStringArray(contact.tags);
    const nextTags =
      action === 'remove'
        ? currentTags.filter((tag) => !tags.includes(tag))
        : Array.from(new Set([...currentTags, ...tags]));
    await this.prisma.db.mailContact.updateMany({
      where: { tenantId, id: contact.id },
      data: { tags: nextTags },
    });
    return { contact, previousTags: currentTags, nextTags };
  }

  async buildAudienceDirectEmailMutation(audienceId: string, email: string, mode: 'add' | 'remove') {
    const audience = await this.findAudience(audienceId);
    if (!audience || audience.isArchived) return null;
    const filters = asRecord(audience.filters);
    const currentEmails = jsonStringArray(filters.emails);
    const normalizedEmail = email.trim().toLowerCase();
    const nextEmails =
      mode === 'remove'
        ? currentEmails.filter((entry) => entry !== normalizedEmail)
        : Array.from(new Set([...currentEmails, normalizedEmail]));
    return {
      audience,
      normalizedEmail,
      previousEmails: currentEmails,
      nextFilters: {
        ...filters,
        emails: nextEmails,
      } as Prisma.InputJsonValue,
    };
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
      where: { tenantId: this.tenantId(), id },
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

  listAudienceSnapshots(audienceId: string, limit: number) {
    return this.prisma.db.mailAudienceSnapshot.findMany({
      where: { tenantId: this.tenantId(), audienceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { _count: { select: { members: true } } },
    });
  }

  async requireAudienceSnapshot(snapshotId: string) {
    const snapshot = await this.prisma.db.mailAudienceSnapshot.findFirst({
      where: { tenantId: this.tenantId(), id: snapshotId },
      include: { _count: { select: { members: true } } },
    });
    if (!snapshot) throw new NotFoundException('Audience snapshot not found');
    return snapshot;
  }

  async createAudienceSnapshot(input: {
    audienceId: string;
    name: string;
    filters: Prisma.InputJsonValue;
    contacts: Array<{
      id: string;
      customerId: string | null;
      email: string;
      isSendable: boolean;
      buyerIntent: string | null;
      lastActivityAt: Date | null;
      metadata: Prisma.JsonValue;
      consentStates?: Array<{ state: string }>;
      suppressions?: Array<{ reason: string | null; scope?: string | null; category?: string | null; expiresAt?: Date | null }>;
    }>;
    sourceSummary: Prisma.InputJsonValue;
  }) {
    const tenantId = this.tenantId();
    const snapshotMembers = input.contacts.map((contact) => {
      const consentState = contact.consentStates?.[0]?.state ?? 'unknown';
      const suppressionReason = effectiveSuppressionReason(contact.suppressions, { category: 'marketing' });
      const isSendable = contact.isSendable && consentState !== 'unsubscribed' && !suppressionReason;
      return {
        contact,
        consentState,
        suppressionReason,
        isSendable,
      };
    });
    const reachableCount = snapshotMembers.filter((member) => member.isSendable).length;
    const snapshot = await this.prisma.db.mailAudienceSnapshot.create({
      data: {
        id: prefixedId('msnp'),
        tenantId,
        audienceId: input.audienceId,
        name: input.name,
        filters: input.filters,
        summary: {
          memberCount: input.contacts.length,
          reachableCount,
          sendableSkipped: input.contacts.length - reachableCount,
        },
        sourceSummary: input.sourceSummary,
        memberCount: input.contacts.length,
        reachableCount,
      },
    });
    if (input.contacts.length > 0) {
      await this.prisma.db.mailAudienceSnapshotMember.createMany({
        data: snapshotMembers.map(({ contact, consentState, suppressionReason, isSendable }) => {
          return {
            id: prefixedId('msnm'),
            tenantId,
            snapshotId: snapshot.id,
            contactId: contact.id,
            customerId: contact.customerId,
            email: contact.email,
            consentState,
            suppressionReason: suppressionReason ?? (!contact.isSendable ? 'not_sendable' : null),
            isSendable,
            buyerIntent: contact.buyerIntent,
            lastActivityAt: contact.lastActivityAt,
            metadata: jsonInput(contact.metadata, {}),
          };
        }),
        skipDuplicates: true,
      });
    }
    return this.prisma.db.mailAudienceSnapshot.findFirst({
      where: { tenantId, id: snapshot.id },
      include: { _count: { select: { members: true } } },
    });
  }

  listCampaigns(input: { status?: string; limit: number }) {
    return this.prisma.db.mailCampaign.findMany({
      where: {
        tenantId: this.tenantId(),
        ...(input.status && { status: input.status }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: input.limit,
      include: {
        audience: { select: { id: true, name: true } },
        snapshot: { select: { id: true, name: true, memberCount: true, reachableCount: true, sourceSummary: true } },
        template: { select: { id: true, name: true, subject: true } },
        templateVersion: { select: { id: true, versionNumber: true, subject: true, status: true, approvalState: true } },
        createdByMember: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedByMember: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  findCampaign(id: string) {
    return this.prisma.db.mailCampaign.findFirst({
      where: { tenantId: this.tenantId(), id },
      include: {
        audience: true,
        snapshot: true,
        template: { include: { versions: { orderBy: { versionNumber: 'desc' } }, publishedVersion: true } },
        templateVersion: true,
        createdByMember: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedByMember: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  findAudienceSnapshot(id: string) {
    return this.prisma.db.mailAudienceSnapshot.findFirst({ where: { tenantId: this.tenantId(), id } });
  }

  async createCampaign(input: {
    name: string;
    description?: string | null;
    audienceId: string;
    snapshotId?: string | null;
    templateId: string;
    templateVersionId: string;
    subjectOverride?: string | null;
    senderName?: string | null;
    replyTo?: string | null;
    scheduledAt?: Date | null;
    createdByMemberId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailCampaign.create({
      data: {
        id: prefixedId('mcmp'),
        tenantId: this.tenantId(),
        name: input.name,
        description: input.description ?? null,
        audienceId: input.audienceId,
        snapshotId: input.snapshotId ?? null,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        subjectOverride: input.subjectOverride ?? null,
        senderName: input.senderName ?? null,
        replyTo: input.replyTo ?? null,
        scheduledAt: input.scheduledAt ?? null,
        createdByMemberId: input.createdByMemberId ?? null,
        metadata: input.metadata ?? {},
      },
    });
  }

  async approveCampaign(id: string, memberId: string | null) {
    const tenantId = this.tenantId();
    const campaign = await this.requireCampaign(id);
    const status = campaign.scheduledAt ? 'scheduled' : 'approved';
    await this.prisma.db.mailCampaign.updateMany({
      where: { tenantId, id },
      data: {
        status,
        approvedAt: new Date(),
        approvedByMemberId: memberId,
        pausedAt: null,
      },
    });
    return this.requireCampaign(id);
  }

  async pauseCampaign(id: string) {
    const tenantId = this.tenantId();
    await this.requireCampaign(id);
    await this.prisma.db.mailCampaign.updateMany({
      where: { tenantId, id },
      data: { status: 'paused', pausedAt: new Date() },
    });
    return this.requireCampaign(id);
  }

  async cancelCampaign(id: string) {
    const tenantId = this.tenantId();
    await this.requireCampaign(id);
    await this.prisma.db.mailCampaign.updateMany({
      where: { tenantId, id },
      data: { status: 'canceled', completedAt: new Date() },
    });
    return this.requireCampaign(id);
  }

  async updateCampaignQueued(id: string, input: {
    status?: 'sending' | 'queued_disabled';
    snapshotId: string;
    recipientCount: number;
    queuedCount: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    suppressedCount: number;
    metadata: Prisma.InputJsonValue;
  }) {
    const tenantId = this.tenantId();
    const status = input.status ?? 'queued_disabled';
    await this.prisma.db.mailCampaign.updateMany({
      where: { tenantId, id },
      data: {
        status,
        snapshotId: input.snapshotId,
        queuedAt: new Date(),
        completedAt: status === 'queued_disabled' ? new Date() : null,
        recipientCount: input.recipientCount,
        queuedCount: input.queuedCount,
        sentCount: input.sentCount,
        failedCount: input.failedCount,
        skippedCount: input.skippedCount,
        suppressedCount: input.suppressedCount,
        metadata: input.metadata,
      },
    });
    return this.requireCampaign(id);
  }

  snapshotMembers(snapshotId: string, limit = 1000) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailAudienceSnapshotMember.findMany({
      where: { tenantId, snapshotId },
      orderBy: [{ isSendable: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      include: {
        contact: {
          include: {
            consentStates: {
              where: { tenantId, channel: 'email', category: 'marketing' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
            suppressions: {
              where: { tenantId, channel: 'email', isActive: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });
  }

  snapshotMembersForView(snapshotId: string, input: { limit: number; search?: string }) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailAudienceSnapshotMember.findMany({
      where: {
        tenantId,
        snapshotId,
        ...(input.search && {
          OR: [
            { email: { contains: input.search, mode: 'insensitive' } },
            { contact: { name: { contains: input.search, mode: 'insensitive' } } },
          ],
        }),
      },
      orderBy: [{ isSendable: 'desc' }, { createdAt: 'asc' }],
      take: input.limit,
      include: {
        contact: {
          select: {
            name: true,
            phone: true,
            isSendable: true,
            consentStates: {
              where: { tenantId, channel: 'email', category: 'marketing' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
            suppressions: {
              where: { tenantId, channel: 'email', isActive: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });
  }

  listFlows() {
    return this.prisma.db.mailFlow.findMany({
      where: { tenantId: this.tenantId() },
      include: {
        activeVersion: { include: { nodes: { orderBy: { sortOrder: 'asc' } } } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        _count: { select: { runs: true, actionLogs: true } },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  findFlow(id: string) {
    return this.prisma.db.mailFlow.findFirst({
      where: { tenantId: this.tenantId(), id },
      include: {
        activeVersion: { include: { nodes: { orderBy: { sortOrder: 'asc' } } } },
        versions: { include: { nodes: { orderBy: { sortOrder: 'asc' } } }, orderBy: { versionNumber: 'desc' } },
        runs: { orderBy: { createdAt: 'desc' }, take: 5 },
        actionLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  async createFlow(input: {
    name: string;
    slug: string;
    triggerType: string;
    status: string;
    graph: Prisma.InputJsonValue;
    nodes: Array<{
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
    }>;
    summary: Prisma.InputJsonValue;
    metadata: Prisma.InputJsonValue;
  }) {
    const flowId = prefixedId('mflw');
    const versionId = prefixedId('mflv');
    const tenantId = this.tenantId();
    await this.prisma.db.$transaction(async (tx) => {
      await tx.mailFlow.create({
        data: {
          id: flowId,
          tenantId,
          name: input.name,
          slug: input.slug,
          triggerType: input.triggerType,
          status: input.status === 'published' ? 'published' : 'draft',
          graph: input.graph,
          metadata: input.metadata,
          publishedAt: input.status === 'published' ? new Date() : null,
        },
      });
      await tx.mailFlowVersion.create({
        data: {
          id: versionId,
          tenantId,
          flowId,
          versionNumber: 1,
          status: input.status === 'published' ? 'published' : 'draft',
          triggerType: input.triggerType,
          graph: input.graph,
          summary: input.summary,
          publishedAt: input.status === 'published' ? new Date() : null,
        },
      });
      if (input.nodes.length > 0) {
        await tx.mailFlowNode.createMany({
          data: input.nodes.map((node) => ({
            id: prefixedId('mfln'),
            tenantId,
            flowVersionId: versionId,
            nodeKey: node.nodeKey,
            nodeType: node.nodeType,
            label: node.label,
            description: node.description,
            nextNodeKey: node.nextNodeKey,
            routes: node.routes,
            config: node.config,
            sortOrder: node.sortOrder,
            positionX: node.positionX,
            positionY: node.positionY,
          })),
        });
      }
      if (input.status === 'published') {
        await tx.mailFlow.updateMany({ where: { tenantId, id: flowId }, data: { activeVersionId: versionId } });
      }
    });
    return this.requireFlow(flowId);
  }

  async updateFlow(id: string, input: {
    name?: string;
    slug?: string;
    triggerType?: string;
    status?: string;
    graph?: Prisma.InputJsonValue;
    nodes?: Array<{
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
    }>;
    summary?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await this.requireFlow(id);
    const tenantId = this.tenantId();
    await this.prisma.db.$transaction(async (tx) => {
      await tx.mailFlow.updateMany({
        where: { tenantId, id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.triggerType !== undefined && { triggerType: input.triggerType }),
          ...(input.status !== undefined && input.status !== 'published' && { status: input.status }),
          ...(input.graph !== undefined && { graph: input.graph }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        },
      });
      if (input.graph !== undefined && input.nodes && input.summary !== undefined) {
        const latestVersion = existing.versions[0]?.versionNumber ?? 0;
        const versionId = prefixedId('mflv');
        await tx.mailFlowVersion.create({
          data: {
            id: versionId,
            tenantId,
            flowId: id,
            versionNumber: latestVersion + 1,
            status: 'draft',
            triggerType: input.triggerType ?? existing.triggerType,
            graph: input.graph,
            summary: input.summary,
          },
        });
        if (input.nodes.length > 0) {
          await tx.mailFlowNode.createMany({
            data: input.nodes.map((node) => ({
              id: prefixedId('mfln'),
              tenantId,
              flowVersionId: versionId,
              nodeKey: node.nodeKey,
              nodeType: node.nodeType,
              label: node.label,
              description: node.description,
              nextNodeKey: node.nextNodeKey,
              routes: node.routes,
              config: node.config,
              sortOrder: node.sortOrder,
              positionX: node.positionX,
              positionY: node.positionY,
            })),
          });
        }
      }
    });
    return this.requireFlow(id);
  }

  async publishFlow(id: string) {
    const flow = await this.requireFlow(id);
    const latestVersion = flow.versions[0];
    if (!latestVersion) throw new NotFoundException('Mail flow version not found');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.mailFlowVersion.updateMany({
        where: { tenantId: this.tenantId(), id: latestVersion.id },
        data: { status: 'published', publishedAt: new Date() },
      });
      await tx.mailFlow.updateMany({
        where: { tenantId: this.tenantId(), id },
        data: {
          status: 'published',
          activeVersionId: latestVersion.id,
          triggerType: latestVersion.triggerType,
          publishedAt: new Date(),
        },
      });
    });
    return this.requireFlow(id);
  }

  async pauseFlow(id: string) {
    const tenantId = this.tenantId();
    await this.requireFlow(id);
    await this.prisma.db.mailFlow.updateMany({ where: { tenantId, id }, data: { status: 'paused' } });
    return this.requireFlow(id);
  }

  async resumeFlow(id: string) {
    const tenantId = this.tenantId();
    const flow = await this.requireFlow(id);
    if (!flow.activeVersionId) throw new NotFoundException('Published flow version not found');
    await this.prisma.db.mailFlow.updateMany({ where: { tenantId, id }, data: { status: 'published' } });
    return this.requireFlow(id);
  }

  async createFlowRun(input: {
    flowId: string;
    flowVersionId: string | null;
    triggerType: string;
    triggerEventType?: string | null;
    status: string;
    enrollmentCount: number;
    completedCount?: number;
    failedCount?: number;
    metadata: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailFlowRun.create({
      data: {
        id: prefixedId('mfrn'),
        tenantId: this.tenantId(),
        flowId: input.flowId,
        flowVersionId: input.flowVersionId,
        triggerType: input.triggerType,
        triggerEventType: input.triggerEventType ?? null,
        status: input.status,
        enrollmentCount: input.enrollmentCount,
        completedCount: input.completedCount ?? 0,
        failedCount: input.failedCount ?? 0,
        startedAt: new Date(),
        endedAt: new Date(),
        metadata: input.metadata,
      },
    });
  }

  async claimFlowIdempotencyKey(input: {
    flowId: string;
    flowVersionId: string | null;
    triggerType: string;
    targetKey: string;
    idempotencyKey: string;
    ttlMs: number;
    metadata: Prisma.InputJsonValue;
  }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.ttlMs);
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.mailFlowIdempotencyKey.findFirst({
      where: { tenantId, flowId: input.flowId, idempotencyKey: input.idempotencyKey },
    });
    if (existing && existing.expiresAt > now) return false;
    if (existing) {
      await this.prisma.db.mailFlowIdempotencyKey.updateMany({
        where: { tenantId, id: existing.id },
        data: {
          flowVersionId: input.flowVersionId,
          triggerType: input.triggerType,
          targetKey: input.targetKey,
          expiresAt,
          metadata: input.metadata,
        },
      });
      return true;
    }
    await this.prisma.db.mailFlowIdempotencyKey.create({
      data: {
        id: prefixedId('mfik'),
        tenantId,
        flowId: input.flowId,
        flowVersionId: input.flowVersionId,
        triggerType: input.triggerType,
        targetKey: input.targetKey,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        metadata: input.metadata,
      },
    });
    return true;
  }

  async createFlowEnrollment(input: {
    flowId: string;
    flowVersionId: string | null;
    flowRunId: string;
    contactId?: string | null;
    customerId?: string | null;
    email?: string | null;
    currentNodeKey?: string | null;
    status: string;
    eventPayload: Prisma.InputJsonValue;
    completedAt?: Date | null;
  }) {
    return this.prisma.db.mailFlowEnrollment.create({
      data: {
        id: prefixedId('mfen'),
        tenantId: this.tenantId(),
        flowId: input.flowId,
        flowVersionId: input.flowVersionId,
        flowRunId: input.flowRunId,
        contactId: input.contactId ?? null,
        customerId: input.customerId ?? null,
        email: input.email ?? null,
        currentNodeKey: input.currentNodeKey ?? null,
        status: input.status,
        eventPayload: input.eventPayload,
        completedAt: input.completedAt ?? null,
      },
    });
  }

  async createFlowActionLog(input: {
    flowId: string;
    flowVersionId?: string | null;
    flowRunId?: string | null;
    enrollmentId?: string | null;
    contactId?: string | null;
    actionType: string;
    nodeKey?: string | null;
    status: string;
    message?: string | null;
    payload?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailFlowActionLog.create({
      data: {
        id: prefixedId('mfal'),
        tenantId: this.tenantId(),
        flowId: input.flowId,
        flowVersionId: input.flowVersionId ?? null,
        flowRunId: input.flowRunId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        contactId: input.contactId ?? null,
        actionType: input.actionType,
        nodeKey: input.nodeKey ?? null,
        status: input.status,
        message: input.message ?? null,
        payload: input.payload ?? {},
      },
    });
  }

  flowRuns(flowId: string, limit = 50) {
    return this.prisma.db.mailFlowRun.findMany({
      where: { tenantId: this.tenantId(), flowId },
      include: { enrollments: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  flowEvents(flowId: string, limit = 100) {
    return this.prisma.db.mailFlowActionLog.findMany({
      where: { tenantId: this.tenantId(), flowId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  flowEnrollment(flowId: string, enrollmentId: string) {
    return this.prisma.db.mailFlowEnrollment.findFirst({ where: { tenantId: this.tenantId(), flowId, id: enrollmentId } });
  }

  publishedFlowsByTrigger(triggerType: string) {
    return this.prisma.db.mailFlow.findMany({
      where: { tenantId: this.tenantId(), status: 'published', triggerType, activeVersionId: { not: null } },
      include: {
        activeVersion: { include: { nodes: { orderBy: { sortOrder: 'asc' } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  contactsForFlowEvent(payload: Record<string, unknown>) {
    const contactId = textValue(payload.contactId);
    const customerId = textValue(payload.customerId);
    const email = textValue(payload.email).toLowerCase();
    const filters = [
      ...(contactId ? [{ id: contactId }] : []),
      ...(customerId ? [{ customerId }] : []),
      ...(email ? [{ normalizedEmail: email }] : []),
    ];
    if (filters.length === 0) return Promise.resolve([]);
    const tenantId = this.tenantId();
    return this.prisma.db.mailContact.findMany({
      where: { tenantId, OR: filters },
      include: {
        consentStates: {
          where: { tenantId, channel: 'email', category: 'marketing' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        suppressions: {
          where: { tenantId, channel: 'email', isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
      take: 25,
    });
  }

  flowEnrollmentForProcessing(enrollmentId: string) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailFlowEnrollment.findFirst({
      where: { tenantId, id: enrollmentId },
      include: {
        contact: {
          include: {
            consentStates: {
              where: { tenantId, channel: 'email', category: 'marketing' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
            suppressions: {
              where: { tenantId, channel: 'email', isActive: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        flow: true,
        flowVersion: { include: { nodes: { orderBy: { sortOrder: 'asc' } } } },
        flowRun: true,
      },
    });
  }

  updateFlowEnrollmentState(id: string, data: Prisma.MailFlowEnrollmentUpdateManyMutationInput) {
    return this.prisma.db.mailFlowEnrollment.updateMany({ where: { tenantId: this.tenantId(), id }, data });
  }

  incrementFlowRunCompleted(runId: string) {
    return this.prisma.db.mailFlowRun.updateMany({
      where: { tenantId: this.tenantId(), id: runId },
      data: { completedCount: { increment: 1 } },
    });
  }

  incrementFlowRunFailed(runId: string) {
    return this.prisma.db.mailFlowRun.updateMany({
      where: { tenantId: this.tenantId(), id: runId },
      data: { failedCount: { increment: 1 } },
    });
  }

  countOpenFlowEnrollments(runId: string) {
    return this.prisma.db.mailFlowEnrollment.count({
      where: { tenantId: this.tenantId(), flowRunId: runId, status: { in: ['queued', 'running'] } },
    });
  }

  completeFlowRunIfNoOpen(runId: string) {
    return this.prisma.db.mailFlowRun.updateMany({
      where: { tenantId: this.tenantId(), id: runId },
      data: { status: 'completed', endedAt: new Date() },
    });
  }

  failFlowRunIfNoOpen(runId: string) {
    return this.prisma.db.mailFlowRun.updateMany({
      where: { tenantId: this.tenantId(), id: runId },
      data: { status: 'failed', endedAt: new Date() },
    });
  }

  countMarketingDeliveriesForRecipientSince(recipientEmail: string, since: Date) {
    return this.prisma.db.mailDelivery.count({
      where: {
        tenantId: this.tenantId(),
        recipientEmail: recipientEmail.toLowerCase(),
        category: 'marketing',
        createdAt: { gte: since },
        status: { in: ['queued', 'queued_disabled', 'sending', 'sent'] },
      },
    });
  }

  countTenantMarketingDeliveriesSince(since: Date) {
    return this.prisma.db.mailDelivery.count({
      where: {
        tenantId: this.tenantId(),
        category: 'marketing',
        createdAt: { gte: since },
        status: { in: ['queued', 'queued_disabled', 'sending', 'sent'] },
      },
    });
  }

  analyticsDeliveries(input: {
    since: Date;
    until: Date;
    campaignId?: string;
    templateId?: string;
    limit: number;
  }) {
    return this.prisma.db.mailDelivery.findMany({
      where: analyticsDeliveryWhere({ ...input, tenantId: this.tenantId() }),
      orderBy: { createdAt: 'desc' },
      take: Math.min(input.limit, 25000),
      select: {
        id: true,
        eventKey: true,
        category: true,
        templateId: true,
        templateVersionId: true,
        recipientEmail: true,
        subject: true,
        status: true,
        provider: true,
        errorMessage: true,
        metadata: true,
        createdAt: true,
        sentAt: true,
      },
    });
  }

  analyticsCampaigns(input: { campaignId?: string; limit: number }) {
    return this.prisma.db.mailCampaign.findMany({
      where: {
        tenantId: this.tenantId(),
        ...(input.campaignId && { id: input.campaignId }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: input.limit,
      include: {
        audience: { select: { id: true, name: true } },
        snapshot: { select: { id: true, name: true, memberCount: true, reachableCount: true, createdAt: true } },
        template: { select: { id: true, name: true, templateType: true } },
        templateVersion: { select: { id: true, versionNumber: true, subject: true, status: true } },
      },
    });
  }

  analyticsTemplates(input: { templateId?: string; limit: number }) {
    return this.prisma.db.emailTemplate.findMany({
      where: {
        tenantId: this.tenantId(),
        isArchived: false,
        ...(input.templateId && { id: input.templateId }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: input.limit,
      include: {
        publishedVersion: { select: { id: true, versionNumber: true, status: true, approvalState: true } },
        _count: { select: { versions: true, campaigns: true, mailDeliveries: true } },
      },
    });
  }

  analyticsAudiences(input: { audienceId?: string; limit: number }) {
    return this.prisma.db.mailAudience.findMany({
      where: {
        tenantId: this.tenantId(),
        isArchived: false,
        ...(input.audienceId && { id: input.audienceId }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: input.limit,
      include: {
        snapshots: { orderBy: { createdAt: 'desc' }, take: 3 },
        _count: { select: { snapshots: true, campaigns: true } },
      },
    });
  }

  analyticsFlows(input: { flowId?: string; limit: number }) {
    return this.prisma.db.mailFlow.findMany({
      where: {
        tenantId: this.tenantId(),
        ...(input.flowId && { id: input.flowId }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: input.limit,
      include: {
        activeVersion: { select: { id: true, versionNumber: true, status: true } },
        _count: { select: { runs: true, enrollments: true, actionLogs: true } },
      },
    });
  }

  analyticsFlowActionLogs(input: { since: Date; until: Date; flowId?: string; limit: number }) {
    return this.prisma.db.mailFlowActionLog.findMany({
      where: {
        tenantId: this.tenantId(),
        createdAt: { gte: input.since, lte: input.until },
        ...(input.flowId && { flowId: input.flowId }),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(input.limit, 25000),
      select: {
        id: true,
        flowId: true,
        actionType: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    });
  }

  analyticsActiveSuppressions(input: { since: Date; until: Date; limit: number }) {
    return this.prisma.db.mailSuppression.findMany({
      where: {
        tenantId: this.tenantId(),
        isActive: true,
        createdAt: { lte: input.until },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(input.limit, 25000),
      select: {
        id: true,
        contactId: true,
        reason: true,
        createdAt: true,
      },
    });
  }

  analyticsRecentSnapshots(input: { since: Date; until: Date; limit: number }) {
    return this.prisma.db.mailAudienceSnapshot.findMany({
      where: { tenantId: this.tenantId(), createdAt: { gte: input.since, lte: input.until } },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: {
        id: true,
        audienceId: true,
        memberCount: true,
        reachableCount: true,
        createdAt: true,
      },
    });
  }

  analyticsProviderEvents(input: { since: Date; until: Date; campaignId?: string; templateId?: string; limit: number }) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailProviderEvent.findMany({
      where: {
        tenantId,
        occurredAt: { gte: input.since, lte: input.until },
        ...(input.campaignId || input.templateId
          ? {
              delivery: {
                tenantId,
                ...(input.templateId && { templateId: input.templateId }),
                ...(input.campaignId && { metadata: { path: ['campaignId'], equals: input.campaignId } }),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { receivedAt: 'desc' }],
      take: Math.min(input.limit, 25000),
      select: {
        id: true,
        eventType: true,
        deliveryId: true,
        providerMessageId: true,
        recipientEmail: true,
        occurredAt: true,
        receivedAt: true,
      },
    });
  }

  analyticsOrdersForCustomers(input: { customerIds: string[]; since: Date; until: Date; limit: number }) {
    const customerIds = Array.from(new Set(input.customerIds.filter(Boolean)));
    if (customerIds.length === 0) return Promise.resolve([]);
    return this.prisma.db.commerceOrder.findMany({
      where: {
        tenantId: this.tenantId(),
        customerId: { in: customerIds },
        OR: [
          { processedAt: { gte: input.since, lte: input.until } },
          { processedAt: null, createdAt: { gte: input.since, lte: input.until } },
        ],
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(input.limit, 25000),
      select: {
        id: true,
        customerId: true,
        shopifyOrderNumber: true,
        totalPrice: true,
        processedAt: true,
        createdAt: true,
      },
    });
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
      where: { tenantId: this.tenantId() },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async requireAudience(id: string) {
    const audience = await this.findAudience(id);
    if (!audience) throw new NotFoundException('Mail audience not found');
    return audience;
  }

  async requireCampaign(id: string) {
    const campaign = await this.findCampaign(id);
    if (!campaign) throw new NotFoundException('Mail campaign not found');
    return campaign;
  }

  async requireFlow(id: string) {
    const flow = await this.findFlow(id);
    if (!flow) throw new NotFoundException('Mail flow not found');
    return flow;
  }

  listWebhookDestinations() {
    return this.prisma.db.mailFlowWebhookDestination.findMany({
      where: { tenantId: this.tenantId() },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  findWebhookDestination(id: string) {
    return this.prisma.db.mailFlowWebhookDestination.findFirst({ where: { tenantId: this.tenantId(), id } });
  }

  createWebhookDestination(input: {
    name: string;
    slug: string;
    url: string;
    status: string;
    authType: string;
    secretHeaderName: string | null;
    secretValueEncrypted: string | null;
    timeoutMs: number;
    metadata: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailFlowWebhookDestination.create({
      data: {
        id: prefixedId('mfwd'),
        tenantId: this.tenantId(),
        name: input.name,
        slug: input.slug,
        url: input.url,
        status: input.status,
        authType: input.authType,
        secretHeaderName: input.secretHeaderName,
        secretValueEncrypted: input.secretValueEncrypted,
        timeoutMs: input.timeoutMs,
        metadata: input.metadata,
      },
    });
  }

  async updateWebhookDestination(id: string, input: {
    name?: string;
    slug?: string;
    url?: string;
    status?: string;
    authType?: string;
    secretHeaderName?: string | null;
    secretValueEncrypted?: string | null;
    clearSecret?: boolean;
    timeoutMs?: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    const tenantId = this.tenantId();
    await this.prisma.db.mailFlowWebhookDestination.updateMany({
      where: { tenantId, id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.url !== undefined && { url: input.url }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.authType !== undefined && { authType: input.authType }),
        ...(input.secretHeaderName !== undefined && { secretHeaderName: input.secretHeaderName }),
        ...(input.clearSecret && { secretValueEncrypted: null }),
        ...(input.secretValueEncrypted !== undefined && { secretValueEncrypted: input.secretValueEncrypted }),
        ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
    });
    return this.findWebhookDestination(id);
  }

  private async syncCustomerContactIdentities(contactId: string, customer: {
    id: string;
    shopifyCustomerId: string | null;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    customerUsers: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      status: string;
    }>;
  }) {
    const email = customer.email?.trim().toLowerCase() || null;
    const phone = customer.phone?.trim() || null;
    const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null;
    await this.upsertContactIdentity({
      contactId,
      entityType: 'mail_contact',
      entityKey: contactId,
      customerId: customer.id,
      email,
      phone,
      metadata: { source: 'customer_import', customerName },
    });
    if (email) {
      await this.upsertContactIdentity({
        contactId,
        entityType: 'email',
        entityKey: email,
        customerId: customer.id,
        email,
        phone,
        metadata: { source: 'customer_import', customerName },
      });
    }
    if (phone) {
      await this.upsertContactIdentity({
        contactId,
        entityType: 'phone',
        entityKey: `${contactId}:${phone}`,
        customerId: customer.id,
        email,
        phone,
        metadata: { source: 'customer_import', customerName },
      });
    }
    await this.upsertContactIdentity({
      contactId,
      entityType: 'customer',
      entityKey: customer.id,
      customerId: customer.id,
      email,
      phone,
      metadata: { source: 'customer_import', customerName },
    });
    if (customer.shopifyCustomerId) {
      await this.upsertContactIdentity({
        contactId,
        entityType: 'shopify_customer',
        entityKey: customer.shopifyCustomerId,
        customerId: customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        email,
        phone,
        metadata: { source: 'customer_import', customerName },
      });
    }
    for (const user of customer.customerUsers) {
      await this.upsertContactIdentity({
        contactId,
        entityType: 'customer_user',
        entityKey: user.id,
        customerId: customer.id,
        customerUserId: user.id,
        email: user.email.trim().toLowerCase(),
        phone: user.phone?.trim() || null,
        metadata: {
          source: 'customer_import',
          customerName,
          customerUserName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          status: user.status,
        },
      });
    }
  }

  private upsertContactIdentity(input: {
    contactId: string;
    entityType: string;
    entityKey: string;
    customerId?: string | null;
    customerUserId?: string | null;
    shopifyCustomerId?: string | null;
    email?: string | null;
    phone?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const tenantId = this.tenantId();
    return this.prisma.db.mailContactIdentity.upsert({
      where: {
        tenantId_entityType_entityKey: {
          tenantId,
          entityType: input.entityType,
          entityKey: input.entityKey,
        },
      },
      create: {
        id: prefixedId('mcid'),
        tenantId,
        contactId: input.contactId,
        entityType: input.entityType,
        entityKey: input.entityKey,
        customerId: input.customerId ?? null,
        customerUserId: input.customerUserId ?? null,
        shopifyCustomerId: input.shopifyCustomerId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        contactId: input.contactId,
        customerId: input.customerId ?? null,
        customerUserId: input.customerUserId ?? null,
        shopifyCustomerId: input.shopifyCustomerId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async resolvePreferenceContact(input: {
    email: string;
    contactId?: string | null;
    customerId?: string | null;
    source: string;
  }) {
    const tenantId = this.tenantId();
    const normalizedEmail = normalizeEmail(input.email);
    if (!normalizedEmail) throw new BadRequestException('A valid recipient email is required');

    let contact = input.contactId
      ? await this.prisma.db.mailContact.findFirst({ where: { tenantId, id: input.contactId } })
      : null;
    if (contact && contact.normalizedEmail !== normalizedEmail) {
      throw new BadRequestException('Mail preference link does not match this recipient');
    }
    if (!contact) {
      contact = await this.prisma.db.mailContact.findFirst({ where: { tenantId, normalizedEmail } });
    }
    if (contact) return contact;

    return this.prisma.db.mailContact.create({
      data: {
        id: prefixedId('mcon'),
        tenantId,
        email: normalizedEmail,
        normalizedEmail,
        customerId: input.customerId ?? null,
        metadata: {
          source: 'mail_preference_link',
          linkSource: input.source,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }

  currentTenantId() {
    return this.tenantId();
  }

  currentMemberId() {
    const context = this.tenantContext.get();
    return context?.principalType === 'member' ? context.principalId ?? null : null;
  }
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function jsonInput(value: Prisma.JsonValue, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === null ? fallback : value as Prisma.InputJsonValue;
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => textValue(entry)).filter(Boolean)))
    : [];
}

function effectiveSuppressionReason(
  suppressions: Array<{ reason: string | null; scope?: string | null; category?: string | null; expiresAt?: Date | null }> | undefined,
  context: { category?: string },
) {
  const now = Date.now();
  const active = (suppressions ?? []).filter((suppression) => !suppression.expiresAt || suppression.expiresAt.getTime() > now);
  const match = active.find((suppression) => {
    const scope = suppression.scope || 'global';
    if (scope === 'global') return true;
    if (scope === 'category') return !suppression.category || suppression.category === context.category;
    return false;
  });
  return match?.reason ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function analyticsDeliveryWhere(input: {
  tenantId: string;
  since: Date;
  until: Date;
  campaignId?: string;
  templateId?: string;
}): Prisma.MailDeliveryWhereInput {
  const filters: Prisma.MailDeliveryWhereInput[] = [
    { tenantId: input.tenantId },
    { createdAt: { gte: input.since, lte: input.until } },
  ];
  if (input.campaignId) filters.push({ metadata: { path: ['campaignId'], equals: input.campaignId } });
  if (input.templateId) filters.push({ templateId: input.templateId });
  return filters.length === 1 ? filters[0] : { AND: filters };
}
