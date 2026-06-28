import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  mailMarketingContactQuerySchema,
  mailMarketingSettingsSchema,
  patchMailAudienceSchema,
  patchMailFlowSchema,
  saveMailAudienceSchema,
  saveMailFlowSchema,
  type MailAudienceFilterInput,
  type MailMarketingContactQuery,
  type MailMarketingSettingsInput,
  type PatchMailAudienceInput,
  type PatchMailFlowInput,
  type SaveMailAudienceInput,
  type SaveMailFlowInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { EmailTemplatesRepository } from './email-templates.repository.js';
import { MailMarketingRepository } from './mail-marketing.repository.js';

@Injectable()
export class MailMarketingService {
  constructor(
    private readonly repository: MailMarketingRepository,
    private readonly templates: EmailTemplatesRepository,
    private readonly logger: AppLogger,
  ) {}

  async overview() {
    await this.repository.importContactsFromCustomers(750);
    const [[contacts, sendableContacts], audiences, flows, templates, recentEvents] = await Promise.all([
      this.repository.contactCounts(),
      this.repository.listAudiences(),
      this.repository.listFlows(),
      this.templates.countTemplates(),
      this.repository.recentEvents(10),
    ]);
    return {
      sendingEnabled: false as const,
      counts: {
        contacts,
        sendableContacts,
        audiences: audiences.filter((audience) => !audience.isArchived).length,
        templates,
        flows: flows.filter((flow) => flow.status !== 'archived').length,
        publishedFlows: flows.filter((flow) => flow.status === 'published').length,
      },
      provider: disabledProvider(),
      recentEvents: recentEvents.map(toEventDto),
    };
  }

  async settingsBootstrap() {
    const settings = await this.repository.ensureSettings();
    return {
      settings: toSettingsDto(settings),
      provider: disabledProvider(),
      triggerTypes: [
        'segment_enter',
        'segment_exit',
        'shopify_order_placed',
        'customer_created',
        'manual',
      ],
      nodeTypes: ['trigger', 'delay', 'condition', 'send_email', 'create_sales_task', 'emit_internal_event'],
    };
  }

  async settings() {
    return toSettingsDto(await this.repository.ensureSettings());
  }

  async updateSettings(input: MailMarketingSettingsInput) {
    const parsed = mailMarketingSettingsSchema.parse(input);
    const updated = await this.repository.updateSettings({
      providerMode: 'disabled',
      defaultSenderName: parsed.defaultSenderName,
      defaultSenderEmail: parsed.defaultSenderEmail ?? null,
      quietHours: parsed.quietHours as Prisma.InputJsonValue,
      dailySendCap: parsed.dailySendCap,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    });
    this.logger.log('mail_marketing', 'settings_update', 'Mail Marketing settings updated with sending disabled', {
      sending_enabled: false,
      provider_mode: 'disabled',
    });
    return toSettingsDto(updated);
  }

  async contacts(query: MailMarketingContactQuery) {
    await this.repository.importContactsFromCustomers(750);
    const parsed = mailMarketingContactQuerySchema.parse(query);
    const rows = await this.repository.listContacts(parsed);
    return rows.map(toContactDto);
  }

  async audiences() {
    const rows = await this.repository.listAudiences();
    return rows.map(toAudienceDto);
  }

  async getAudience(id: string) {
    return toAudienceDto(await this.repository.requireAudience(id));
  }

  async previewAudience(input: SaveMailAudienceInput['filters']) {
    await this.repository.importContactsFromCustomers(750);
    const contacts = await this.repository.listContacts({ limit: 200, sendable: true });
    const filters = input ?? { matchMode: 'all', conditions: [], segmentIds: [] };
    const matched = contacts.filter((contact) => matchesAudience(contact, filters));
    return {
      matchedContacts: matched.length,
      sample: matched.slice(0, 10).map(toContactDto),
      sendingEnabled: false as const,
    };
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

  async flows() {
    const rows = await this.repository.listFlows();
    return rows.map(toFlowDto);
  }

  async getFlow(id: string) {
    return toFlowDto(await this.repository.requireFlow(id));
  }

  async createFlow(input: SaveMailFlowInput) {
    const parsed = saveMailFlowSchema.parse(input);
    const flow = await this.repository.createFlow({
      name: parsed.name,
      slug: parsed.slug ?? slug(parsed.name),
      triggerType: parsed.triggerType,
      status: parsed.status,
      graph: parsed.graph as Prisma.InputJsonValue,
      metadata: parsed.metadata as Prisma.InputJsonValue,
    });
    await this.repository.recordEvent({
      eventType: 'flow.created',
      metadata: { flowId: flow.id, triggerType: flow.triggerType, status: flow.status },
    });
    this.logger.log('mail_marketing', 'flow_create', 'Mail flow created', { flow_id: flow.id, status: flow.status });
    return toFlowDto(flow);
  }

  async updateFlow(id: string, input: PatchMailFlowInput) {
    const parsed = patchMailFlowSchema.parse(input);
    const flow = await this.repository.updateFlow(id, {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.slug !== undefined && { slug: parsed.slug || undefined }),
      ...(parsed.triggerType !== undefined && { triggerType: parsed.triggerType }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.graph !== undefined && { graph: parsed.graph as Prisma.InputJsonValue }),
      ...(parsed.metadata !== undefined && { metadata: parsed.metadata as Prisma.InputJsonValue }),
    });
    await this.repository.recordEvent({
      eventType: 'flow.updated',
      metadata: { flowId: flow.id, triggerType: flow.triggerType, status: flow.status },
    });
    return toFlowDto(flow);
  }

  publishFlow(id: string) {
    return this.updateFlow(id, { status: 'published' });
  }

  pauseFlow(id: string) {
    return this.updateFlow(id, { status: 'paused' });
  }

  resumeFlow(id: string) {
    return this.updateFlow(id, { status: 'published' });
  }

  async replayEnrollment(flowId: string, enrollmentId: string) {
    const flow = await this.repository.requireFlow(flowId);
    await this.repository.recordEvent({
      eventType: 'flow.enrollment_replay_skipped',
      status: 'skipped',
      metadata: { flowId, enrollmentId, reason: 'mail_marketing_delivery_disabled' },
    });
    return {
      flowId: flow.id,
      enrollmentId,
      status: 'skipped',
      sendingEnabled: false,
      message: 'Mail Marketing delivery is disabled; enrollment replay was recorded but not executed.',
    };
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
}) {
  return {
    id: settings.id,
    sendingEnabled: false,
    providerMode: 'disabled',
    defaultSenderName: settings.defaultSenderName,
    defaultSenderEmail: settings.defaultSenderEmail,
    quietHours: asRecord(settings.quietHours),
    dailySendCap: settings.dailySendCap,
    metadata: asRecord(settings.metadata),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

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
  lastActivityAt: Date | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
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
    lastActivityAt: contact.lastActivityAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
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
}) {
  return {
    id: flow.id,
    slug: flow.slug,
    name: flow.name,
    triggerType: flow.triggerType,
    status: flow.status,
    graph: asRecord(flow.graph),
    metadata: asRecord(flow.metadata),
    sendingEnabled: false,
    publishedAt: flow.publishedAt?.toISOString() ?? null,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
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

function matchesAudience(contact: Parameters<typeof toContactDto>[0], filters: MailAudienceFilterInput) {
  const checks = filters.conditions.map((condition) => matchesCondition(valueFor(contact, condition.field), condition.operator, condition.value));
  const conditionResult = checks.length === 0 ? true : filters.matchMode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
  return conditionResult && contact.isSendable;
}

function valueFor(contact: Parameters<typeof toContactDto>[0], field: string) {
  if (field === 'email') return contact.email;
  if (field === 'name') return contact.name;
  if (field === 'phone') return contact.phone;
  if (field === 'tags') return contact.tags;
  if (field === 'buyerIntent') return contact.buyerIntent;
  if (field === 'lifecycleStage') return contact.lifecycleStage;
  if (field === 'isSendable') return contact.isSendable;
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

function disabledProvider() {
  return {
    mode: 'disabled' as const,
    message: 'Mail Marketing is transferred but delivery is intentionally disabled for this tenant.',
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'mail-item';
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
