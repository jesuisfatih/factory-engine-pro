import { Injectable } from '@nestjs/common';
import type { AircallDialResponse, PersonContactActivityStatus, PersonContactState } from '@factory-engine-pro/contracts';
import type { Prisma } from '@prisma/client';
import { CustomerContactResolverService } from './customer-contact-resolver.service.js';
import { prefixedId } from './id.js';
import { AppLogger } from './logger.service.js';
import { PrismaService } from './prisma.service.js';
import { RealtimeService } from './realtime.service.js';
import { TenantContextService } from './tenant-context.js';

interface AircallContactEventInput {
  externalCallId: string;
  eventType: string;
  eventAt: Date;
  memberId: string | null;
  customerId?: string | null;
  shopifyCustomerId?: string | null;
  email?: string | null;
  phone?: string | null;
  durationSeconds?: number | null;
  direction?: string | null;
  rawStatus?: string | null;
}

@Injectable()
export class CustomerContactTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly resolver: CustomerContactResolverService,
    private readonly logger: AppLogger,
    private readonly realtime: RealtimeService,
  ) {}

  async recordDial(input: {
    customerId: string;
    memberId: string;
    phone: string;
    result: AircallDialResponse;
  }) {
    const now = new Date();
    const status: PersonContactActivityStatus = input.result.ok && input.result.mode === 'aircall_dial'
      ? 'calling'
      : 'attempted';
    const row = await this.prisma.db.customerContactActivity.create({
      data: {
        id: prefixedId('cca'),
        tenantId: this.tenantId(),
        customerId: input.customerId,
        memberId: input.memberId,
        source: input.result.mode === 'aircall_dial' ? 'aircall_dial' : 'tel_fallback',
        status,
        phone: input.result.normalizedPhone || input.phone,
        startedAt: now,
        expiresAt: status === 'calling' ? new Date(now.getTime() + 10 * 60_000) : null,
        metadata: {
          providerStatus: input.result.providerStatus,
          mode: input.result.mode,
        } as Prisma.InputJsonValue,
      },
    });
    this.emit('customer.contact.dial', input.customerId, input.memberId);
    return row;
  }

  async recordFollowUp(input: {
    customerId: string;
    memberId: string;
    scheduledAt: Date;
    note?: string | null;
  }) {
    const row = await this.prisma.db.customerContactActivity.create({
      data: {
        id: prefixedId('cca'),
        tenantId: this.tenantId(),
        customerId: input.customerId,
        memberId: input.memberId,
        source: 'person_calendar',
        status: 'follow_up_scheduled',
        note: input.note?.trim() || null,
        startedAt: new Date(),
        expiresAt: input.scheduledAt,
        metadata: {
          scheduledAt: input.scheduledAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    this.emit('customer.contact.follow_up_scheduled', input.customerId, input.memberId);
    return row;
  }

  async recordAircallEvent(input: AircallContactEventInput) {
    const customer = await this.resolver.findCustomer({
      customerId: input.customerId,
      shopifyCustomerId: input.shopifyCustomerId,
      email: input.email,
      phone: input.phone,
    });
    if (!customer) {
      this.logger.warn('customer_contact', 'aircall.customer_unmatched', 'Aircall contact activity could not be matched to a customer', {
        external_call_id: input.externalCallId,
        event_type: input.eventType,
      });
      return null;
    }

    if (input.phone) {
      await this.resolver.capturePhonePoints(customer.id, [{
        value: input.phone,
        source: 'call',
        sourceRef: input.externalCallId,
        priority: 70,
        metadata: {
          eventType: input.eventType,
          eventAt: input.eventAt.toISOString(),
          direction: input.direction ?? null,
        },
      }]);
    }

    const incomingStatus = contactStatus(input.eventType, input.durationSeconds, input.rawStatus);
    const tenantId = this.tenantId();
    const existing = await this.prisma.db.customerContactActivity.findUnique({
      where: { tenantId_externalCallId: { tenantId, externalCallId: input.externalCallId } },
    });
    const keepExisting = shouldKeepExistingEvent(existing, incomingStatus, input.eventAt);
    const status = keepExisting ? safeStatus(existing!.status) : incomingStatus;
    const terminal = ['no_answer', 'voicemail', 'completed'].includes(status);
    const expiresAt = keepExisting
      ? existing!.expiresAt
      : status === 'calling' || status === 'connected'
        ? new Date(input.eventAt.getTime() + 10 * 60_000)
        : null;
    const endedAt = keepExisting ? existing!.endedAt : terminal ? input.eventAt : null;
    const eventMetadata: Prisma.InputJsonValue = keepExisting
      ? existing!.metadata === null ? {} : existing!.metadata as Prisma.InputJsonValue
      : {
          direction: input.direction,
          rawStatus: input.rawStatus,
          eventType: input.eventType,
          eventAt: input.eventAt.toISOString(),
          durationSeconds: input.durationSeconds,
        } as Prisma.InputJsonValue;
    const row = await this.prisma.db.customerContactActivity.upsert({
      where: { tenantId_externalCallId: { tenantId, externalCallId: input.externalCallId } },
      create: {
        id: prefixedId('cca'),
        tenantId,
        customerId: customer.id,
        memberId: input.memberId,
        source: 'aircall_webhook',
        status,
        externalCallId: input.externalCallId,
        phone: input.phone ?? customer.phone,
        startedAt: input.eventAt,
        endedAt,
        expiresAt,
        metadata: eventMetadata,
      },
      update: {
        customerId: customer.id,
        memberId: input.memberId ?? undefined,
        status,
        phone: input.phone ?? undefined,
        endedAt,
        expiresAt,
        metadata: eventMetadata,
      },
    });
    if (terminal && input.memberId) {
      await this.prisma.db.customerContactActivity.updateMany({
        where: {
          customerId: customer.id,
          memberId: input.memberId,
          source: 'aircall_dial',
          status: { in: ['calling', 'connected'] },
          startedAt: {
            gte: new Date(input.eventAt.getTime() - 15 * 60_000),
            lte: new Date(input.eventAt.getTime() + 2 * 60_000),
          },
        },
        data: { status, endedAt, expiresAt: null },
      });
    }
    this.emit('customer.contact.aircall', customer.id, input.memberId);
    return row;
  }

  async latestForCustomers(customerIds: string[]) {
    const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
    const result = new Map<string, PersonContactState>();
    if (uniqueIds.length === 0) return result;
    const rows = await this.prisma.db.customerContactActivity.findMany({
      where: { customerId: { in: uniqueIds } },
      include: { member: true },
      orderBy: [{ startedAt: 'desc' }],
      take: Math.min(2000, uniqueIds.length * 8),
    });
    for (const row of rows) {
      const state = this.toState(row);
      const existing = result.get(row.customerId);
      if (!existing || (!existing.active && state.active)) result.set(row.customerId, state);
    }
    return result;
  }

  async latestForCustomer(customerId: string) {
    const rows = await this.latestForCustomers([customerId]);
    return rows.get(customerId) ?? null;
  }

  private toState(row: {
    id: string;
    status: string;
    memberId: string | null;
    member: { firstName: string; lastName: string; email: string } | null;
    phone: string | null;
    startedAt: Date;
    endedAt: Date | null;
    expiresAt: Date | null;
  }): PersonContactState {
    const status = safeStatus(row.status);
    const active = (status === 'calling' || status === 'connected')
      && Boolean(row.expiresAt && row.expiresAt.getTime() > Date.now());
    const memberName = row.member ? displayMember(row.member) : null;
    return {
      id: row.id,
      status,
      label: contactLabel(status, active, memberName, row.startedAt),
      memberId: row.memberId,
      memberName,
      phone: row.phone,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      active,
    };
  }

  private emit(reason: string, customerId: string, memberId: string | null) {
    this.logger.log('customer_contact', reason, 'Customer contact timeline changed', {
      customer_id: customerId,
      member_id: memberId,
    });
    this.realtime.emitTenantInvalidate(this.tenantId(), {
      module: 'call_center',
      reason,
      at: new Date().toISOString(),
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for customer contact activity');
    return tenantId;
  }
}

function contactStatus(eventType: string, durationSeconds?: number | null, rawStatus?: string | null): PersonContactActivityStatus {
  const value = `${eventType} ${rawStatus ?? ''}`.toLowerCase();
  if (value.includes('voicemail')) return 'voicemail';
  if (value.includes('missed') || value.includes('unanswered') || value.includes('no_answer')) return 'no_answer';
  if (value.includes('answered') || value.includes('connected')) return 'connected';
  if (value.includes('ended') || value.includes('hungup') || value.includes('completed')) {
    return Number(durationSeconds ?? 0) > 0 ? 'completed' : 'no_answer';
  }
  return 'calling';
}

function safeStatus(value: string): PersonContactActivityStatus {
  if (value === 'calling' || value === 'attempted' || value === 'connected' || value === 'no_answer'
    || value === 'voicemail' || value === 'follow_up_scheduled' || value === 'completed') return value;
  return 'attempted';
}

function shouldKeepExistingEvent(
  existing: { status: string; startedAt: Date; updatedAt: Date; metadata: Prisma.JsonValue } | null,
  incomingStatus: PersonContactActivityStatus,
  incomingAt: Date,
) {
  if (!existing) return false;
  const existingStatus = safeStatus(existing.status);
  const existingRank = contactStatusRank(existingStatus);
  const incomingRank = contactStatusRank(incomingStatus);
  if (existingRank > incomingRank) return true;
  if (existingRank < incomingRank) return false;
  const metadata = isRecord(existing.metadata) ? existing.metadata : null;
  const metadataTime = metadata && typeof metadata.eventAt === 'string'
    ? Date.parse(metadata.eventAt)
    : Number.NaN;
  const existingAt = Number.isFinite(metadataTime)
    ? metadataTime
    : (existing.updatedAt ?? existing.startedAt).getTime();
  return existingAt > incomingAt.getTime();
}

function contactStatusRank(status: PersonContactActivityStatus) {
  if (status === 'no_answer' || status === 'voicemail' || status === 'completed') return 2;
  if (status === 'connected') return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function contactLabel(status: PersonContactActivityStatus, active: boolean, member: string | null, startedAt: Date) {
  const actor = member || 'A team member';
  if (active) return `${actor} is calling this customer now`;
  const when = relative(startedAt);
  if (status === 'no_answer') return `Last contact ${when} by ${actor} - no answer`;
  if (status === 'voicemail') return `Voicemail left ${when} by ${actor}`;
  if (status === 'follow_up_scheduled') return `Follow-up scheduled by ${actor}`;
  if (status === 'connected' || status === 'completed') return `Last contacted ${when} by ${actor}`;
  return `Call opened ${when} by ${actor}`;
}

function displayMember(member: { firstName: string; lastName: string; email: string }) {
  return `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.email;
}

function relative(date: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
