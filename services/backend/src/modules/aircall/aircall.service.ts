import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import type {
  AircallBackfillRecentInput,
  AircallBackfillRecentResponse,
  AircallCallEventsResponse,
  AircallConnectionTestResponse,
  AircallNumberDto,
  AircallNumbersResponse,
  AircallResolverReprocessInput,
  AircallResolverReprocessResponse,
  AircallSyncLogsResponse,
  AircallUsersResponse,
  AircallWebhookStatusResponse,
  AircallWorkflowCoverageResponse,
  AircallWorkflowRepairInput,
  AircallWorkflowRepairResponse,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { AircallApiError, AircallClient, type AircallCredentials } from './aircall.client.js';
import { AircallIngestService } from './aircall-ingest.service.js';
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
    private readonly ingest: AircallIngestService,
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

  async callEvents(): Promise<AircallCallEventsResponse> {
    const credentials = await this.credentialState();
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      orderBy: { eventTimestamp: 'desc' },
      take: 80,
      select: {
        id: true,
        externalCallId: true,
        eventType: true,
        eventTimestamp: true,
        direction: true,
        status: true,
        aircallUserId: true,
        contactPhone: true,
        contactEmail: true,
        transcriptRaw: true,
        transcriptSource: true,
        transcriptPulledAt: true,
        resolverQueuedAt: true,
        resolverQueueJobId: true,
        resolverStatus: true,
        resolverStartedAt: true,
        resolverOutput: true,
        resolverError: true,
        resolverModel: true,
        resolverPromptKey: true,
        resolverLatencyMs: true,
        resolvedAt: true,
        resolvedWithVersion: true,
        receivedAt: true,
      },
    });
    return {
      credentialRequired: !credentials.hasApiCredentials,
      stats: await this.callEventStats(),
      calls: rows.map((row) => ({
        id: row.id,
        externalCallId: row.externalCallId,
        eventType: row.eventType,
        eventTimestamp: row.eventTimestamp.toISOString(),
        direction: row.direction,
        status: row.status,
        aircallUserId: row.aircallUserId,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail,
        transcriptPresent: Boolean(row.transcriptRaw?.trim()),
        transcriptLength: row.transcriptRaw?.length ?? 0,
        transcriptSource: row.transcriptSource,
        transcriptPulledAt: row.transcriptPulledAt?.toISOString() ?? null,
        resolverQueuedAt: row.resolverQueuedAt?.toISOString() ?? null,
        resolverQueueJobId: row.resolverQueueJobId,
        resolverStatus: row.resolverStatus,
        resolverStartedAt: row.resolverStartedAt?.toISOString() ?? null,
        resolverOutputPresent: Boolean(row.resolverOutput),
        resolverOutput: row.resolverOutput as AircallCallEventsResponse['calls'][number]['resolverOutput'],
        resolverError: row.resolverError,
        resolverModel: row.resolverModel,
        resolverPromptKey: row.resolverPromptKey,
        resolverLatencyMs: row.resolverLatencyMs,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolvedWithVersion: row.resolvedWithVersion,
        receivedAt: row.receivedAt.toISOString(),
      })),
    };
  }

  async workflowCoverage(): Promise<AircallWorkflowCoverageResponse> {
    const tenantId = this.tenantId();
    const recentDays = 7;
    const targetVersion = TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
    const to = new Date();
    const from = new Date(to.getTime() - recentDays * 86_400_000);
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      where: {
        tenantId,
        eventTimestamp: { gte: from, lte: to },
        transcriptRaw: { not: null },
      },
      orderBy: { eventTimestamp: 'desc' },
      select: {
        id: true,
        externalCallId: true,
        eventTimestamp: true,
        transcriptRaw: true,
        resolverStatus: true,
        resolverOutput: true,
        resolverModel: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
    });
    const transcriptRows = rows.filter((row) => Boolean(row.transcriptRaw?.trim()));
    const callEventIds = transcriptRows.map((row) => row.id);
    const evaluations = callEventIds.length === 0
      ? []
      : await this.prisma.db.transcriptWorkflowEvaluation.findMany({
          where: { tenantId, callEventId: { in: callEventIds } },
          select: {
            callEventId: true,
            actionRequired: true,
            status: true,
            tasksCreated: true,
          },
        });
    const evaluatedIds = new Set(evaluations.map((row) => row.callEventId));
    const missingRows = transcriptRows.filter((row) => !evaluatedIds.has(row.id));
    const staleResolverVersion = transcriptRows.filter((row) => (row.resolvedWithVersion ?? 0) > 0 && (row.resolvedWithVersion ?? 0) < targetVersion).length;
    const resolverQueuedOrProcessing = transcriptRows.filter((row) => row.resolverStatus === 'queued' || row.resolverStatus === 'processing').length;
    const resolverFailed = transcriptRows.filter((row) => row.resolverStatus === 'failed').length;
    const failedEvaluations = evaluations.filter((row) => row.status === 'failed').length;

    return {
      targetVersion,
      recentDays,
      from: from.toISOString(),
      to: to.toISOString(),
      transcriptEvents: transcriptRows.length,
      resolvedEvents: transcriptRows.filter((row) => Boolean(row.resolvedAt) || row.resolverStatus === 'succeeded').length,
      evaluatedEvents: evaluatedIds.size,
      workflowInvariantOk: transcriptRows.length === evaluatedIds.size
        && missingRows.length === 0
        && staleResolverVersion === 0
        && resolverQueuedOrProcessing === 0
        && resolverFailed === 0
        && failedEvaluations === 0,
      evaluationRows: evaluations.length,
      actionableEvaluations: evaluations.filter((row) => row.actionRequired).length,
      noActionEvaluations: evaluations.filter((row) => row.status === 'no_action' || row.status === 'no_action_unmatched').length,
      taskCreatedEvaluations: evaluations.filter((row) => row.tasksCreated > 0 || row.status === 'task_created').length,
      matchedWithoutTaskEvaluations: evaluations.filter((row) => row.status === 'matched_without_task').length,
      failedEvaluations,
      localFallbackResolvedEvents: transcriptRows.filter((row) => row.resolverModel === 'local-rule-fallback').length,
      missingEvaluations: missingRows.length,
      staleResolverVersion,
      resolverQueuedOrProcessing,
      resolverFailed,
      missing: missingRows.slice(0, 50).map((row) => ({
        id: row.id,
        externalCallId: row.externalCallId,
        eventTimestamp: row.eventTimestamp.toISOString(),
        resolverStatus: row.resolverStatus,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolvedWithVersion: row.resolvedWithVersion,
        resolverOutputPresent: Boolean(row.resolverOutput),
        transcriptLength: row.transcriptRaw?.trim().length ?? 0,
        repairMode: workflowRepairMode(row, targetVersion),
      })),
    };
  }

  async backfillRecentCalls(input: AircallBackfillRecentInput): Promise<AircallBackfillRecentResponse> {
    const startedAt = new Date();
    const tenant = await this.currentTenant();
    const client = new AircallClient(await this.resolveCredentials());
    const recentDays = input.recentDays;
    const maxPages = input.maxPages;
    const to = new Date();
    const from = new Date(to.getTime() - recentDays * 86_400_000);
    const fromUnix = Math.floor(from.getTime() / 1000);
    const toUnix = Math.floor(to.getTime() / 1000);

    let page = 1;
    let fetched = 0;
    let ingested = 0;
    let skipped = 0;
    let errors = 0;
    let transcriptsFound = 0;
    let transcriptsEmpty = 0;
    let transcriptErrors = 0;
    let resolverQueued = 0;

    try {
      while (page <= maxPages) {
        const response = await client.listCalls({
          from: fromUnix,
          to: toUnix,
          page,
          per_page: 50,
          order: 'asc',
          fetch_contact: true,
          fetch_short_urls: true,
          fetch_call_timeline: true,
        });
        const calls = (response.calls ?? []) as Array<Record<string, unknown>>;
        if (calls.length === 0) break;
        fetched += calls.length;

        for (const raw of calls) {
          const externalCallId = stringOrNull(raw.id);
          if (!externalCallId) {
            skipped++;
            continue;
          }

          const existing = await this.prisma.db.aircallCallEvent.findFirst({
            where: { tenantId: tenant.id, externalCallId, eventType: 'call.ended' },
            select: { id: true, transcriptRaw: true, resolverQueuedAt: true, resolverStatus: true },
          });
          if (existing?.transcriptRaw && existing.resolverQueuedAt && existing.resolverStatus !== 'failed') {
            const repair = await this.ingest.enqueueTranscriptResolver(existing.id, existing.transcriptRaw, {
              targetVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
              source: 'rolling_backfill',
            });
            if (repair.queued) resolverQueued++;
            skipped++;
            continue;
          }

          const callPayload = { ...raw };
          try {
            const pulled = await this.pullTranscript(client, externalCallId);
            if (pulled.status === 'found' && pulled.transcript) {
              callPayload.transcript = pulled.transcript;
              callPayload.transcript_source = 'aircall_ci';
              transcriptsFound++;
            } else {
              transcriptsEmpty++;
            }
          } catch (error) {
            transcriptErrors++;
            this.logger.warn('aircall', 'transcript_pull_failed', 'Aircall transcript pull failed during recent backfill', {
              external_call_id: externalCallId,
              error: messageOf(error),
            });
          }

          try {
            const inbox = await this.prisma.aircallWebhookInbox.create({
              data: {
                id: prefixedId('awin'),
                tenantId: tenant.id,
                tenantSlug: tenant.slug,
                rawBody: JSON.stringify({
                  event: 'call.ended',
                  resource: 'call',
                  timestamp: callTimestamp(callPayload),
                  data: callPayload,
                  token: 'backfill',
                }),
                headers: {
                  source: 'aircall_recent_backfill',
                  recentDays,
                  page,
                } as Prisma.InputJsonValue,
                signature: null,
                tokenClaim: 'backfill',
                status: 'verified',
                eventType: 'call.ended',
                externalCallId,
              },
              select: { id: true },
            });
            await this.ingest.processInboxRow(inbox.id);
            ingested++;
            if (typeof callPayload.transcript === 'string' && callPayload.transcript.trim()) resolverQueued++;
          } catch (error) {
            errors++;
            this.logger.warn('aircall', 'recent_backfill_ingest_failed', 'Aircall recent backfill ingest failed', {
              external_call_id: externalCallId,
              error: messageOf(error),
            });
          }
        }

        if (!response.meta?.next_page_link) break;
        page++;
      }

      const stats = await this.callEventStats();
      await this.repository.createSyncLog({
        action: 'calls.backfill_recent',
        status: errors ? 'partial_success' : 'success',
        message: `Backfilled ${ingested}/${fetched} Aircall calls from the last ${recentDays} day(s).`,
        startedAt,
        finishedAt: new Date(),
        metadata: {
          recentDays,
          from: from.toISOString(),
          to: to.toISOString(),
          fetched,
          ingested,
          skipped,
          errors,
          pages: page,
          transcriptsFound,
          transcriptsEmpty,
          transcriptErrors,
          resolverQueued,
        },
      });
      return {
        recentDays,
        from: from.toISOString(),
        to: to.toISOString(),
        fetched,
        ingested,
        skipped,
        errors,
        pages: page,
        transcriptsFound,
        transcriptsEmpty,
        transcriptErrors,
        resolverQueued,
        stats,
      };
    } catch (error) {
      await this.repository.createSyncLog({
        action: 'calls.backfill_recent',
        status: 'failed',
        message: messageOf(error),
        startedAt,
        finishedAt: new Date(),
        metadata: { recentDays, from: from.toISOString(), to: to.toISOString(), page, fetched, ingested },
      });
      if (error instanceof AircallApiError) {
        throw new BadRequestException({
          message: 'Aircall recent call backfill failed.',
          code: 'aircall_api_error',
          details: { status: error.status },
        });
      }
      throw error;
    }
  }

  async reprocessResolver(input: AircallResolverReprocessInput): Promise<AircallResolverReprocessResponse> {
    const startedAt = new Date();
    const targetVersion = input.targetVersion ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
    if (targetVersion !== TRANSCRIPT_RESOLVER_SCHEMA_VERSION) {
      throw new BadRequestException({
        message: `Only current resolver schema version ${TRANSCRIPT_RESOLVER_SCHEMA_VERSION} can be queued for reprocess.`,
        code: 'resolver_reprocess_version_mismatch',
      });
    }

    const from = input.recentDays ? new Date(Date.now() - input.recentDays * 86_400_000) : null;
    const where: Prisma.AircallCallEventWhereInput = input.callEventId
      ? { id: input.callEventId }
      : {
          transcriptRaw: { not: null },
          ...(from ? { eventTimestamp: { gte: from } } : {}),
        };
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      where,
      orderBy: { eventTimestamp: 'desc' },
      take: input.limit,
      select: {
        id: true,
        externalCallId: true,
        transcriptRaw: true,
        resolvedWithVersion: true,
        resolverStatus: true,
      },
    });
    if (input.callEventId && rows.length === 0) {
      throw new NotFoundException('Aircall call event was not found for resolver reprocess.');
    }

    let queued = 0;
    let skipped = 0;
    const callEvents: AircallResolverReprocessResponse['callEvents'] = [];
    for (const row of rows) {
      const result = await this.ingest.enqueueTranscriptResolver(row.id, row.transcriptRaw, {
        forceReprocess: true,
        targetVersion,
        source: input.recentDays ? 'rolling_backfill' : 'manual_reprocess',
      });
      if (result.queued) queued++;
      else skipped++;
      callEvents.push({
        id: row.id,
        externalCallId: row.externalCallId,
        previousVersion: row.resolvedWithVersion,
        previousStatus: row.resolverStatus,
        queued: result.queued,
        skippedReason: result.skippedReason,
      });
    }

    await this.repository.createSyncLog({
      action: 'calls.resolver_reprocess',
      status: queued > 0 ? 'success' : 'skipped',
      message: `Queued ${queued}/${rows.length} Aircall transcript resolver job(s) for schema v${targetVersion}.`,
      startedAt,
      finishedAt: new Date(),
      metadata: {
        targetVersion,
        limit: input.limit,
        recentDays: input.recentDays ?? null,
        from: from?.toISOString() ?? null,
        callEventId: input.callEventId ?? null,
        scanned: rows.length,
        queued,
        skipped,
      },
    });

    return {
      targetVersion,
      recentDays: input.recentDays ?? null,
      from: from?.toISOString() ?? null,
      scanned: rows.length,
      queued,
      skipped,
      callEvents,
      stats: await this.callEventStats(),
    };
  }

  async repairWorkflowEvaluations(input: AircallWorkflowRepairInput): Promise<AircallWorkflowRepairResponse> {
    const startedAt = new Date();
    const tenantId = this.tenantId();
    const targetVersion = input.targetVersion ?? TRANSCRIPT_RESOLVER_SCHEMA_VERSION;
    if (targetVersion !== TRANSCRIPT_RESOLVER_SCHEMA_VERSION) {
      throw new BadRequestException({
        message: `Only current resolver schema version ${TRANSCRIPT_RESOLVER_SCHEMA_VERSION} can be queued for workflow repair.`,
        code: 'workflow_repair_version_mismatch',
      });
    }

    const recentDays = input.recentDays ?? 7;
    const from = input.callEventId ? null : new Date(Date.now() - recentDays * 86_400_000);
    const rows = await this.prisma.db.aircallCallEvent.findMany({
      where: input.callEventId
        ? { tenantId, id: input.callEventId, transcriptRaw: { not: null } }
        : { tenantId, eventTimestamp: { gte: from! }, transcriptRaw: { not: null } },
      orderBy: { eventTimestamp: 'desc' },
      take: input.limit,
      select: {
        id: true,
        externalCallId: true,
        eventTimestamp: true,
        transcriptRaw: true,
        resolverStatus: true,
        resolverOutput: true,
        resolvedAt: true,
        resolvedWithVersion: true,
      },
    });
    if (input.callEventId && rows.length === 0) {
      throw new NotFoundException('Aircall call event with transcript was not found for workflow repair.');
    }

    const evaluations = rows.length === 0
      ? []
      : await this.prisma.db.transcriptWorkflowEvaluation.findMany({
          where: { tenantId, callEventId: { in: rows.map((row) => row.id) } },
          select: { callEventId: true },
        });
    const evaluationCounts = new Map<string, number>();
    for (const evaluation of evaluations) {
      evaluationCounts.set(evaluation.callEventId, (evaluationCounts.get(evaluation.callEventId) ?? 0) + 1);
    }

    let queued = 0;
    let skipped = 0;
    let alreadyEvaluated = 0;
    let missingEvaluations = 0;
    let staleResolverVersion = 0;
    let unresolved = 0;
    const callEvents: AircallWorkflowRepairResponse['callEvents'] = [];

    for (const row of rows) {
      const evaluationCount = evaluationCounts.get(row.id) ?? 0;
      const stale = (row.resolvedWithVersion ?? 0) > 0 && (row.resolvedWithVersion ?? 0) < targetVersion;
      const hasCurrentEvaluation = evaluationCount > 0 && !stale;
      if (evaluationCount === 0) missingEvaluations++;
      if (stale) staleResolverVersion++;
      if (!row.resolvedAt && row.resolverStatus !== 'succeeded') unresolved++;

      if (hasCurrentEvaluation) {
        alreadyEvaluated++;
        skipped++;
        callEvents.push({
          id: row.id,
          externalCallId: row.externalCallId,
          resolvedWithVersion: row.resolvedWithVersion,
          resolverStatus: row.resolverStatus,
          evaluationCount,
          repairMode: 'already_evaluated',
          queued: false,
          skippedReason: 'already_evaluated',
        });
        continue;
      }

      const result = await this.ingest.enqueueTranscriptResolver(row.id, row.transcriptRaw, {
        targetVersion,
        source: 'workflow_repair',
      });
      if (result.queued) queued++;
      else skipped++;
      callEvents.push({
        id: row.id,
        externalCallId: row.externalCallId,
        resolvedWithVersion: row.resolvedWithVersion,
        resolverStatus: row.resolverStatus,
        evaluationCount,
        repairMode: workflowActionRepairMode(row, targetVersion),
        queued: result.queued,
        skippedReason: result.skippedReason,
      });
    }

    await this.repository.createSyncLog({
      action: 'calls.workflow_repair',
      status: queued > 0 ? 'success' : 'skipped',
      message: `Queued ${queued}/${rows.length} Aircall transcript workflow repair job(s).`,
      startedAt,
      finishedAt: new Date(),
      metadata: {
        targetVersion,
        limit: input.limit,
        recentDays,
        from: from?.toISOString() ?? null,
        callEventId: input.callEventId ?? null,
        scanned: rows.length,
        queued,
        skipped,
        alreadyEvaluated,
        missingEvaluations,
        staleResolverVersion,
        unresolved,
      },
    });

    return {
      targetVersion,
      recentDays: input.callEventId ? null : recentDays,
      from: from?.toISOString() ?? null,
      scanned: rows.length,
      queued,
      skipped,
      alreadyEvaluated,
      missingEvaluations,
      staleResolverVersion,
      unresolved,
      callEvents,
      coverage: await this.workflowCoverage(),
    };
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

  private async callEventStats(): Promise<AircallCallEventsResponse['stats']> {
    const since = new Date(Date.now() - 3 * 86_400_000);
    const [totalRows, last3dRows, withTranscript, resolverQueued, resolverSucceeded, resolverFailed, lastReceived] = await Promise.all([
      this.prisma.db.aircallCallEvent.findMany({ select: { externalCallId: true } }),
      this.prisma.db.aircallCallEvent.findMany({
        where: { eventTimestamp: { gte: since } },
        select: { externalCallId: true },
      }),
      this.prisma.db.aircallCallEvent.count({ where: { transcriptRaw: { not: null } } }),
      this.prisma.db.aircallCallEvent.count({ where: { resolverQueuedAt: { not: null } } }),
      this.prisma.db.aircallCallEvent.count({ where: { resolverStatus: 'succeeded' } }),
      this.prisma.db.aircallCallEvent.count({ where: { resolverStatus: 'failed' } }),
      this.prisma.db.aircallCallEvent.findFirst({
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
    ]);
    return {
      total: new Set(totalRows.map((row) => row.externalCallId)).size,
      last3d: new Set(last3dRows.map((row) => row.externalCallId)).size,
      withTranscript,
      resolverQueued,
      resolverSucceeded,
      resolverFailed,
      lastReceivedAt: lastReceived?.receivedAt.toISOString() ?? null,
    };
  }

  private async pullTranscript(client: AircallClient, externalCallId: string): Promise<{ status: 'found'; transcript: string } | { status: 'empty'; transcript: null }> {
    try {
      const response = await client.getCallTranscription(externalCallId);
      const utterances = getAircallUtterances(response);
      const transcript = formatAircallTranscript(utterances);
      return transcript
        ? { status: 'found', transcript }
        : { status: 'empty', transcript: null };
    } catch (error) {
      if (error instanceof AircallApiError && error.status === 404) {
        return { status: 'empty', transcript: null };
      }
      throw error;
    }
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

function workflowRepairMode(row: {
  resolverStatus: string | null;
  resolverOutput: unknown;
  resolvedAt: Date | null;
  resolvedWithVersion: number | null;
}, targetVersion: number): AircallWorkflowCoverageResponse['missing'][number]['repairMode'] {
  if (row.resolverStatus === 'failed') return 'resolver_failed';
  if (row.resolverStatus === 'queued' || row.resolverStatus === 'processing') return 'wait_for_resolver';
  if ((row.resolvedWithVersion ?? 0) >= targetVersion && row.resolverOutput && row.resolvedAt) return 'replay_stored_output';
  return 'rerun_resolver';
}

function workflowActionRepairMode(row: {
  resolverStatus: string | null;
  resolverOutput: unknown;
  resolvedAt: Date | null;
  resolvedWithVersion: number | null;
}, targetVersion: number): Exclude<AircallWorkflowRepairResponse['callEvents'][number]['repairMode'], 'already_evaluated'> {
  if (row.resolverStatus === 'queued' || row.resolverStatus === 'processing') return 'wait_for_resolver';
  if ((row.resolvedWithVersion ?? 0) >= targetVersion && row.resolverOutput && row.resolvedAt) return 'replay_stored_output';
  return 'rerun_resolver';
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stringOrNull(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function callTimestamp(call: Record<string, unknown>) {
  return call.ended_at
    ?? call.answered_at
    ?? call.started_at
    ?? call.created_at
    ?? Math.floor(Date.now() / 1000);
}

function getAircallUtterances(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const transcription = payload.transcription;
  const contentSource = transcription && typeof transcription === 'object'
    ? (transcription as Record<string, unknown>).content
    : payload.content;
  const content = contentSource && typeof contentSource === 'object'
    ? contentSource as Record<string, unknown>
    : payload;
  return Array.isArray(content.utterances) ? content.utterances as Array<Record<string, unknown>> : [];
}

function formatAircallTranscript(utterances: Array<Record<string, unknown>>) {
  return utterances
    .map((utterance) => {
      const speaker = utterance.participant_type === 'external' ? 'Customer' : 'Agent';
      const text = stringOrNull(utterance.text);
      return text ? `${speaker}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}
