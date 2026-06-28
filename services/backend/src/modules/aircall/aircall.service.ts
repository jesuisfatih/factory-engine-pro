import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type {
  AircallConnectionTestResponse,
  AircallNumberDto,
  AircallNumbersResponse,
  AircallSyncLogsResponse,
  AircallUsersResponse,
  AircallWebhookStatusResponse,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallApiError, AircallClient, type AircallCredentials } from './aircall.client.js';
import { AircallRepository } from './aircall.repository.js';

type AircallUserPayload = {
  id?: string | number;
  name?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  extension?: string | number | null;
  available_status?: string | null;
  availability_status?: string | null;
  time_zone?: string | null;
  language?: string | null;
  default_number_id?: string | number | null;
  numbers?: unknown;
};

type AircallNumberPayload = {
  id?: string | number;
  name?: string | null;
  digits?: string | null;
  country?: string | null;
  time_zone?: string | null;
  is_ivr?: boolean | null;
};

type PresentedAircallUser = AircallUsersResponse['users'][number] & {
  rawPayload: Record<string, unknown>;
  timezone: string | null;
  language: string | null;
  defaultNumberId: string | null;
  numbers: unknown;
};

@Injectable()
export class AircallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
    private readonly tenantContext: TenantContextService,
    private readonly repository: AircallRepository,
  ) {}

  async listUsers(): Promise<AircallUsersResponse> {
    const aircallUsers = await this.fetchAircallUsers();
    await this.persistUsers(aircallUsers);
    await this.autoMapUsersByEmail(aircallUsers);

    const [members, mappings] = await Promise.all([
      this.prisma.db.member.findMany({
        where: { status: { not: 'archived' } },
        select: { id: true, email: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.db.aircallMemberMap.findMany({
        select: {
          aircallUserId: true,
          memberId: true,
          member: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    const linkedByAircallId = new Map(
      mappings.map((mapping) => [
        mapping.aircallUserId,
        { id: mapping.member.id, email: mapping.member.email, name: displayName(mapping.member) },
      ]),
    );
    const aircallIdByMemberId = new Map(mappings.map((mapping) => [mapping.memberId, mapping.aircallUserId]));

    return {
      source: 'aircall_api',
      users: aircallUsers.map((user) => ({
        id: user.id,
        aircallUserId: user.aircallUserId,
        name: user.name,
        email: user.email,
        extension: user.extension,
        availableStatus: user.availableStatus,
        linkedMember: linkedByAircallId.get(user.aircallUserId) ?? null,
      })),
      members: members.map((member) => ({
        id: member.id,
        email: member.email,
        name: displayName(member),
        aircallUserId: aircallIdByMemberId.get(member.id) ?? null,
      })),
    };
  }

  syncUsers() {
    return this.listUsers();
  }

  async listNumbers(): Promise<AircallNumbersResponse> {
    const credentials = await this.credentialState();
    if (!credentials.hasApiCredentials) return this.emptyNumbers(true);
    return this.presentNumbers(false);
  }

  async syncNumbers(): Promise<AircallNumbersResponse> {
    const startedAt = new Date();
    const tenant = await this.currentTenant();
    const client = new AircallClient(await this.resolveCredentials());
    let page = 1;
    let count = 0;

    try {
      while (true) {
        const response = await client.listNumbers(page, 50);
        const numbers = (response.numbers ?? []) as AircallNumberPayload[];
        if (numbers.length === 0) break;

        for (const raw of numbers) {
          const number = this.presentNumber(raw, tenant.slug);
          await this.prisma.db.aircallNumber.upsert({
            where: {
              tenantId_aircallNumberId: {
                tenantId: tenant.id,
                aircallNumberId: number.aircallNumberId,
              },
            },
            create: {
              id: prefixedId('acn'),
              tenantId: tenant.id,
              aircallNumberId: number.aircallNumberId,
              name: number.name,
              digits: number.digits,
              country: number.country,
              timezone: number.timezone,
              isIvr: number.isIvr,
              tenantSlug: number.tenantSlug,
              rawPayload: raw as Prisma.InputJsonValue,
            },
            update: {
              name: number.name,
              digits: number.digits,
              country: number.country,
              timezone: number.timezone,
              isIvr: number.isIvr,
              tenantSlug: number.tenantSlug,
              rawPayload: raw as Prisma.InputJsonValue,
              lastSyncedAt: new Date(),
            },
          });
          count++;
        }

        if (!response.meta?.next_page_link) break;
        page++;
        if (page > 20) break;
      }

      await this.repository.createSyncLog({
        action: 'numbers.sync',
        status: 'success',
        message: `Synced ${count} Aircall numbers.`,
        startedAt,
        finishedAt: new Date(),
        metadata: { count, pages: page },
      });
      return this.presentNumbers(false);
    } catch (error) {
      await this.repository.createSyncLog({
        action: 'numbers.sync',
        status: 'failed',
        message: messageOf(error),
        startedAt,
        finishedAt: new Date(),
      });
      if (error instanceof AircallApiError) {
        throw new BadRequestException({
          message: 'Aircall numbers could not be synced.',
          code: 'aircall_api_error',
          details: { status: error.status },
        });
      }
      throw error;
    }
  }

  async webhookStatus(): Promise<AircallWebhookStatusResponse> {
    const tenant = await this.currentTenant();
    const credentials = await this.credentialState();
    const config = await this.prisma.db.aircallWebhookConfig.findFirst({});
    const [total, processed, rejected, pending, lastInbox] = await Promise.all([
      this.prisma.db.aircallWebhookInbox.count({}),
      this.prisma.db.aircallWebhookInbox.count({ where: { status: 'processed' } }),
      this.prisma.db.aircallWebhookInbox.count({ where: { status: 'rejected' } }),
      this.prisma.db.aircallWebhookInbox.count({ where: { status: { in: ['received', 'verified'] } } }),
      this.prisma.db.aircallWebhookInbox.findFirst({ orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    ]);

    return {
      credentialRequired: !(credentials.hasApiCredentials && credentials.hasWebhookSecret),
      apiCredentialsPresent: credentials.hasApiCredentials,
      webhookSecretPresent: credentials.hasWebhookSecret,
      tenantSlug: tenant.slug,
      webhookUrl: config?.url ?? this.webhookUrl(tenant.slug),
      config: config ? {
        id: config.id,
        aircallWebhookId: config.aircallWebhookId,
        customName: config.customName,
        events: config.events,
        active: config.active,
        lastEventAt: config.lastEventAt?.toISOString() ?? null,
        lastPingAt: config.lastPingAt?.toISOString() ?? null,
        lastFailureAt: config.lastFailureAt?.toISOString() ?? null,
        lastFailureReason: config.lastFailureReason,
        failureCount: config.failureCount,
      } : null,
      inbox: {
        total,
        processed,
        rejected,
        pending,
        lastReceivedAt: lastInbox?.receivedAt.toISOString() ?? null,
      },
    };
  }

  async testConnection(): Promise<AircallConnectionTestResponse> {
    const startedAt = Date.now();
    const tenant = await this.currentTenant();
    const credentials = await this.credentialState();
    const webhookUrl = this.webhookUrl(tenant.slug);
    if (!credentials.hasApiCredentials) {
      const response: AircallConnectionTestResponse = {
        ok: false,
        status: 'missing_credentials',
        credentialRequired: true,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        userProbeCount: null,
        numberProbeCount: null,
        webhookSecretPresent: credentials.hasWebhookSecret,
        webhookUrl,
        error: 'Aircall API ID and API token are not configured for this tenant.',
      };
      this.logger.warn('aircall', 'connection_test_failed', 'Aircall connection test skipped because credentials are missing', {
        status: response.status,
        webhook_secret_present: response.webhookSecretPresent,
      });
      return response;
    }

    try {
      const client = new AircallClient(await this.resolveCredentials());
      const [users, numbers] = await Promise.all([
        client.listUsers(1, 1),
        client.listNumbers(1, 1),
      ]);
      const response: AircallConnectionTestResponse = {
        ok: true,
        status: 'ok',
        credentialRequired: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        userProbeCount: Array.isArray(users.users) ? users.users.length : 0,
        numberProbeCount: Array.isArray(numbers.numbers) ? numbers.numbers.length : 0,
        webhookSecretPresent: credentials.hasWebhookSecret,
        webhookUrl,
        error: null,
      };
      this.logger.log('aircall', 'connection_test_ok', 'Aircall connection test succeeded', {
        latency_ms: response.latencyMs,
        user_probe_count: response.userProbeCount,
        number_probe_count: response.numberProbeCount,
        webhook_secret_present: response.webhookSecretPresent,
      });
      return response;
    } catch (error) {
      const isProviderError = error instanceof AircallApiError;
      const response: AircallConnectionTestResponse = {
        ok: false,
        status: isProviderError ? 'provider_error' : 'network_error',
        credentialRequired: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        userProbeCount: null,
        numberProbeCount: null,
        webhookSecretPresent: credentials.hasWebhookSecret,
        webhookUrl,
        error: messageOf(error),
      };
      this.logger.warn('aircall', 'connection_test_failed', 'Aircall connection test failed', {
        status: response.status,
        latency_ms: response.latencyMs,
        error: response.error,
      });
      return response;
    }
  }

  async syncLogs(): Promise<AircallSyncLogsResponse> {
    const credentials = await this.credentialState();
    const [logs, inbox] = await Promise.all([
      this.repository.syncLogs(50),
      this.repository.inboxItems(50),
    ]);
    return {
      credentialRequired: !(credentials.hasApiCredentials && credentials.hasWebhookSecret),
      logs: logs.map((log) => ({
        id: log.id,
        service: log.service,
        action: log.action,
        status: log.status,
        message: log.message,
        startedAt: log.startedAt.toISOString(),
        finishedAt: log.finishedAt?.toISOString() ?? null,
      })),
      inbox: inbox.map((item) => ({
        id: item.id,
        status: item.status,
        rejectionReason: item.rejectionReason,
        eventType: item.eventType,
        externalCallId: item.externalCallId,
        receivedAt: item.receivedAt.toISOString(),
        processedAt: item.processedAt?.toISOString() ?? null,
      })),
    };
  }

  async linkUser(aircallUserId: string, memberId: string) {
    const users = await this.fetchAircallUsers();
    const aircallUser = users.find((user) => user.aircallUserId === aircallUserId);
    if (!aircallUser) throw new NotFoundException('Aircall user not found');
    await this.persistUsers(users);

    const member = await this.prisma.db.member.findFirst({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');

    const tenantId = this.tenantId();
    await this.prisma.$transaction(async (tx) => {
      await tx.aircallMemberMap.deleteMany({
        where: { tenantId, OR: [{ aircallUserId }, { memberId }] },
      });
      await tx.aircallMemberMap.create({
        data: {
          id: prefixedId('acmap'),
          tenantId,
          aircallUserId,
          memberId,
          source: 'manual',
        },
      });
      await tx.member.updateMany({
        where: { tenantId, aircallUserId, id: { not: memberId } },
        data: { aircallUserId: null },
      });
      await tx.member.updateMany({
        where: { tenantId, id: memberId },
        data: { aircallUserId },
      });
    });
    this.logger.log('aircall', 'link_user', 'Aircall user linked to member', {
      aircall_user_id: aircallUserId,
      member_id: memberId,
    });
    return this.listUsers();
  }

  async unlinkUser(aircallUserId: string) {
    const tenantId = this.tenantId();
    await this.prisma.$transaction(async (tx) => {
      await tx.aircallMemberMap.deleteMany({ where: { tenantId, aircallUserId } });
      await tx.member.updateMany({
        where: { tenantId, aircallUserId },
        data: { aircallUserId: null },
      });
    });
    this.logger.log('aircall', 'unlink_user', 'Aircall user unlinked from member', { aircall_user_id: aircallUserId });
    return this.listUsers();
  }

  private async fetchAircallUsers() {
    const client = new AircallClient(await this.resolveCredentials());
    const response = await client.listUsers(1, 50).catch((error) => {
      if (error instanceof AircallApiError) {
        throw new BadRequestException({
          message: 'Aircall users could not be loaded.',
          code: 'aircall_api_error',
          details: { status: error.status },
        });
      }
      throw error;
    });
    return (response.users ?? []).map((raw) => this.presentUser(raw as AircallUserPayload));
  }

  private presentUser(user: AircallUserPayload): PresentedAircallUser {
    const aircallUserId = String(user.id ?? '').trim();
    if (!aircallUserId) throw new BadRequestException('Aircall returned a user without id');
    const firstLastName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return {
      id: aircallUserId,
      aircallUserId,
      name: String(user.name ?? firstLastName ?? user.email ?? `Aircall ${aircallUserId}`),
      email: user.email ?? null,
      extension: user.extension === undefined || user.extension === null ? null : String(user.extension),
      availableStatus: user.available_status ?? user.availability_status ?? null,
      linkedMember: null,
      timezone: user.time_zone ?? null,
      language: user.language ?? null,
      defaultNumberId: user.default_number_id === undefined || user.default_number_id === null ? null : String(user.default_number_id),
      numbers: user.numbers ?? [],
      rawPayload: user as Record<string, unknown>,
    };
  }

  private async persistUsers(users: PresentedAircallUser[]) {
    for (const user of users) {
      await this.prisma.db.aircallUser.upsert({
        where: {
          tenantId_aircallUserId: {
            tenantId: this.tenantId(),
            aircallUserId: user.aircallUserId,
          },
        },
        create: {
          id: prefixedId('acu'),
          tenantId: this.tenantId(),
          aircallUserId: user.aircallUserId,
          email: user.email,
          name: user.name,
          extension: user.extension,
          availableStatus: user.availableStatus,
          timezone: user.timezone,
          language: user.language,
          defaultNumberId: user.defaultNumberId,
          numbers: user.numbers as Prisma.InputJsonValue,
          rawPayload: user.rawPayload as Prisma.InputJsonValue,
        },
        update: {
          email: user.email,
          name: user.name,
          extension: user.extension,
          availableStatus: user.availableStatus,
          timezone: user.timezone,
          language: user.language,
          defaultNumberId: user.defaultNumberId,
          numbers: user.numbers as Prisma.InputJsonValue,
          rawPayload: user.rawPayload as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
        },
      });
    }
  }

  private async autoMapUsersByEmail(users: PresentedAircallUser[]) {
    const candidates = users
      .map((user) => ({ ...user, normalizedEmail: user.email?.trim().toLowerCase() ?? '' }))
      .filter((user) => user.normalizedEmail);
    if (candidates.length === 0) return;

    const emails = [...new Set(candidates.map((user) => user.normalizedEmail))];
    const members = await this.prisma.db.member.findMany({
      where: { status: { not: 'archived' }, email: { in: emails } },
      select: { id: true, email: true },
    });
    const memberByEmail = new Map(members.map((member) => [member.email.trim().toLowerCase(), member]));
    const memberIds = members.map((member) => member.id);
    const aircallUserIds = candidates.map((user) => user.aircallUserId);
    const existing = await this.prisma.db.aircallMemberMap.findMany({
      where: { OR: [{ memberId: { in: memberIds } }, { aircallUserId: { in: aircallUserIds } }] },
      select: { memberId: true, aircallUserId: true },
    });
    const mappedMemberIds = new Set(existing.map((mapping) => mapping.memberId));
    const mappedAircallUserIds = new Set(existing.map((mapping) => mapping.aircallUserId));
    const tenantId = this.tenantId();

    for (const user of candidates) {
      const member = memberByEmail.get(user.normalizedEmail);
      if (!member || mappedMemberIds.has(member.id) || mappedAircallUserIds.has(user.aircallUserId)) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.aircallMemberMap.create({
            data: {
              id: prefixedId('acmap'),
              tenantId,
              aircallUserId: user.aircallUserId,
              memberId: member.id,
              source: 'email_auto',
            },
          });
          await tx.member.updateMany({
            where: { tenantId, id: member.id },
            data: { aircallUserId: user.aircallUserId },
          });
        });
        mappedMemberIds.add(member.id);
        mappedAircallUserIds.add(user.aircallUserId);
      } catch (error) {
        this.logger.warn('aircall', 'auto_map_skipped', 'Aircall auto map by email was skipped', {
          aircall_user_id: user.aircallUserId,
          member_id: member.id,
          error: messageOf(error),
        });
      }
    }
  }

  private presentNumber(raw: AircallNumberPayload, tenantSlug: string): AircallNumberDto {
    const aircallNumberId = String(raw.id ?? '').trim();
    if (!aircallNumberId) throw new BadRequestException('Aircall returned a number without id');
    const digits = String(raw.digits ?? '').trim();
    const name = String(raw.name ?? '').trim() || digits || `Aircall ${aircallNumberId}`;
    return {
      id: aircallNumberId,
      aircallNumberId,
      name,
      digits,
      country: raw.country ?? null,
      timezone: raw.time_zone ?? null,
      isIvr: Boolean(raw.is_ivr),
      tenantSlug,
      lastSyncedAt: null,
    };
  }

  private async presentNumbers(credentialRequired: boolean): Promise<AircallNumbersResponse> {
    const rows = await this.prisma.db.aircallNumber.findMany({ orderBy: { name: 'asc' } });
    const numbers = rows.map((row) => ({
      id: row.id,
      aircallNumberId: row.aircallNumberId,
      name: row.name,
      digits: row.digits,
      country: row.country,
      timezone: row.timezone,
      isIvr: row.isIvr,
      tenantSlug: row.tenantSlug,
      lastSyncedAt: row.lastSyncedAt.toISOString(),
    }));
    return {
      credentialRequired,
      source: credentialRequired ? 'not_configured' : 'aircall_api',
      stats: {
        total: numbers.length,
        ivr: numbers.filter((number) => number.isIvr).length,
        countries: [...new Set(numbers.map((number) => number.country).filter((country): country is string => Boolean(country)))],
      },
      numbers,
    };
  }

  private emptyNumbers(credentialRequired: boolean): AircallNumbersResponse {
    return {
      credentialRequired,
      source: 'not_configured',
      stats: { total: 0, ivr: 0, countries: [] },
      numbers: [],
    };
  }

  private async resolveCredentials(): Promise<AircallCredentials> {
    const config = await this.prisma.db.tenantConfig.findFirst({
      select: { aircallApiIdEncrypted: true, aircallApiTokenEncrypted: true },
    });
    const apiId = this.crypto.decrypt(config?.aircallApiIdEncrypted)?.trim() || this.config.get<string>('AIRCALL_API_ID')?.trim();
    const apiToken = this.crypto.decrypt(config?.aircallApiTokenEncrypted)?.trim() || this.config.get<string>('AIRCALL_API_TOKEN')?.trim();
    if (!apiId || !apiToken) {
      throw new BadRequestException({
        message: 'Aircall credentials are not configured for this tenant.',
        code: 'aircall_credentials_missing',
      });
    }
    return { apiId, apiToken };
  }

  private async credentialState() {
    const config = await this.prisma.db.tenantConfig.findFirst({
      select: {
        aircallApiIdEncrypted: true,
        aircallApiTokenEncrypted: true,
        aircallWebhookSecretEncrypted: true,
      },
    });
    return {
      hasApiCredentials: Boolean(
        config?.aircallApiIdEncrypted
        || this.config.get<string>('AIRCALL_API_ID')?.trim(),
      ) && Boolean(
        config?.aircallApiTokenEncrypted
        || this.config.get<string>('AIRCALL_API_TOKEN')?.trim(),
      ),
      hasWebhookSecret: Boolean(
        config?.aircallWebhookSecretEncrypted
        || this.config.get<string>('AIRCALL_WEBHOOK_SECRET')?.trim()
        || this.config.get<string>('AIRCALL_WEBHOOK_TOKEN')?.trim(),
      ),
    };
  }

  private async currentTenant() {
    const tenantId = this.tenantId();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } });
    if (!tenant) throw new BadRequestException('Tenant could not be resolved');
    return tenant;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }

  private webhookUrl(tenantSlug: string) {
    const baseUrl = this.config.get<string>('AIRCALL_PUBLIC_BASE_URL')
      ?? this.config.get<string>('API_PUBLIC_BASE_URL')
      ?? this.config.get<string>('PUBLIC_API_URL')
      ?? this.config.get<string>('API_URL')
      ?? '';
    return baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/v1/webhooks/aircall/${tenantSlug}` : null;
  }
}

function displayName(member: { firstName: string; lastName: string; email: string }) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
