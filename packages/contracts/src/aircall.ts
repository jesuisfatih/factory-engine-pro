import { z } from 'zod';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION, type TranscriptResolverOutput } from './ai.js';

export const aircallLinkUserSchema = z.object({
  memberId: z.string().trim().min(1),
});
export type AircallLinkUserInput = z.infer<typeof aircallLinkUserSchema>;

export const aircallBackfillRecentSchema = z.object({
  recentDays: z.coerce.number().int().min(1).max(7).default(3),
  maxPages: z.coerce.number().int().min(1).max(40).default(20),
});
export type AircallBackfillRecentInput = z.infer<typeof aircallBackfillRecentSchema>;

export const aircallResolverReprocessSchema = z.object({
  targetVersion: z.coerce.number().int().min(1).default(TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  recentDays: z.coerce.number().int().min(1).max(7).optional(),
  callEventId: z.string().trim().min(1).optional(),
});
export type AircallResolverReprocessInput = z.infer<typeof aircallResolverReprocessSchema>;

export const aircallWorkflowRepairSchema = z.object({
  targetVersion: z.coerce.number().int().min(1).default(TRANSCRIPT_RESOLVER_SCHEMA_VERSION),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  scope: z.enum(['recent', 'all']).default('recent'),
  recentDays: z.coerce.number().int().min(1).max(365).default(7),
  callEventId: z.string().trim().min(1).optional(),
});
export type AircallWorkflowRepairInput = z.infer<typeof aircallWorkflowRepairSchema>;

export const aircallWorkflowCoverageQuerySchema = z.object({
  scope: z.enum(['recent', 'all']).default('recent'),
  recentDays: z.coerce.number().int().min(1).max(365).default(7),
});
export type AircallWorkflowCoverageQuery = z.infer<typeof aircallWorkflowCoverageQuerySchema>;

export interface AircallUserDto {
  id: string;
  aircallUserId: string;
  name: string;
  email: string | null;
  extension: string | null;
  availableStatus: string | null;
  linkedMember: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface AircallUsersResponse {
  users: AircallUserDto[];
  members: Array<{
    id: string;
    email: string;
    name: string;
    aircallUserId: string | null;
  }>;
  source: 'aircall_api';
}

export interface AircallNumberDto {
  id: string;
  aircallNumberId: string;
  name: string;
  digits: string;
  country: string | null;
  timezone: string | null;
  isIvr: boolean;
  tenantSlug: string | null;
  lastSyncedAt: string | null;
}

export interface AircallNumbersResponse {
  credentialRequired: boolean;
  source: 'aircall_api' | 'not_configured';
  stats: {
    total: number;
    ivr: number;
    countries: string[];
  };
  numbers: AircallNumberDto[];
}

export interface AircallWebhookStatusResponse {
  credentialRequired: boolean;
  apiCredentialsPresent: boolean;
  webhookSecretPresent: boolean;
  tenantSlug: string | null;
  webhookUrl: string | null;
  config: {
    id: string;
    aircallWebhookId: string | null;
    customName: string | null;
    events: string[];
    active: boolean;
    lastEventAt: string | null;
    lastPingAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    failureCount: number;
  } | null;
  inbox: {
    total: number;
    processed: number;
    rejected: number;
    pending: number;
    lastReceivedAt: string | null;
  };
}

export interface AircallConnectionTestResponse {
  ok: boolean;
  status: 'ok' | 'missing_credentials' | 'provider_error' | 'network_error';
  credentialRequired: boolean;
  checkedAt: string;
  latencyMs: number;
  userProbeCount: number | null;
  numberProbeCount: number | null;
  webhookSecretPresent: boolean;
  webhookUrl: string | null;
  error: string | null;
}

export interface AircallSyncLogDto {
  id: string;
  service: string;
  action: string;
  status: string;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AircallSyncLogsResponse {
  credentialRequired: boolean;
  logs: AircallSyncLogDto[];
  inbox: Array<{
    id: string;
    status: string;
    rejectionReason: string | null;
    eventType: string | null;
    externalCallId: string | null;
    receivedAt: string;
    processedAt: string | null;
  }>;
}

export interface AircallCallEventDto {
  id: string;
  externalCallId: string;
  eventType: string;
  eventTimestamp: string;
  direction: string | null;
  status: string | null;
  aircallUserId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  transcriptPresent: boolean;
  transcriptLength: number;
  transcriptSource: string | null;
  transcriptPulledAt: string | null;
  resolverQueuedAt: string | null;
  resolverQueueJobId: string | null;
  resolverStatus: string | null;
  resolverStartedAt: string | null;
  resolverOutputPresent: boolean;
  resolverOutput: TranscriptResolverOutput | null;
  resolverError: string | null;
  resolverModel: string | null;
  resolverPromptKey: string | null;
  resolverLatencyMs: number | null;
  resolvedAt: string | null;
  resolvedWithVersion: number | null;
  receivedAt: string;
}

export interface AircallCallEventsResponse {
  credentialRequired: boolean;
  stats: {
    total: number;
    last3d: number;
    withTranscript: number;
    resolverQueued: number;
    resolverSucceeded: number;
    resolverFailed: number;
    lastReceivedAt: string | null;
  };
  calls: AircallCallEventDto[];
}

export interface AircallWorkflowCoverageResponse {
  targetVersion: number;
  scope: 'recent' | 'all';
  recentDays: number | null;
  from: string | null;
  to: string;
  transcriptEvents: number;
  resolvedEvents: number;
  evaluatedEvents: number;
  flowCompletedEvents: number;
  expectedSignalCount: number;
  evaluatedSignalCount: number;
  flowCompletedSignalCount: number;
  missingSignalEvaluationCount: number;
  missingSignalFlowOutcomeCount: number;
  extraSignalEvaluationCount: number;
  invalidResolverOutputCount: number;
  signalInvariantOk: boolean;
  workflowInvariantOk: boolean;
  evaluationRows: number;
  actionableEvaluations: number;
  noActionEvaluations: number;
  taskCreatedEvaluations: number;
  matchedWithoutTaskEvaluations: number;
  cooldownSuppressedEvaluations: number;
  failedEvaluations: number;
  unmatchedEvaluations: number;
  localFallbackResolvedEvents: number;
  missingEvaluations: number;
  missingFlowOutcomeEvents: number;
  staleResolverVersion: number;
  resolverQueuedOrProcessing: number;
  resolverFailed: number;
  signalOutcomes: Array<{
    signal: string;
    evaluations: number;
    actionRequired: number;
    taskCreated: number;
    matchedWithoutTask: number;
    cooldownSuppressed: number;
    noAction: number;
    noMatchingRule: number;
    failed: number;
    recommendedAxis: {
      sales: number;
      account: number;
      none: number;
      other: number;
    };
  }>;
  missing: Array<{
    id: string;
    externalCallId: string;
    eventTimestamp: string;
    resolverStatus: string | null;
    resolvedAt: string | null;
    resolvedWithVersion: number | null;
    resolverOutputPresent: boolean;
    transcriptLength: number;
    expectedSignals: string[];
    evaluatedSignals: string[];
    missingSignals: string[];
    missingFlowSignals: string[];
    extraSignals: string[];
    invalidResolverOutput: boolean;
    problems: string[];
    repairMode: 'replay_stored_output' | 'rerun_resolver' | 'wait_for_resolver' | 'resolver_failed';
  }>;
}

export interface AircallBackfillRecentResponse {
  recentDays: number;
  from: string;
  to: string;
  fetched: number;
  ingested: number;
  skipped: number;
  errors: number;
  pages: number;
  transcriptsFound: number;
  transcriptsEmpty: number;
  transcriptErrors: number;
  resolverQueued: number;
  stats: AircallCallEventsResponse['stats'];
}

export interface AircallResolverReprocessResponse {
  targetVersion: number;
  recentDays: number | null;
  from: string | null;
  scanned: number;
  queued: number;
  skipped: number;
  callEvents: Array<{
    id: string;
    externalCallId: string;
    previousVersion: number | null;
    previousStatus: string | null;
    queued: boolean;
    skippedReason: string | null;
  }>;
  stats: AircallCallEventsResponse['stats'];
}

export interface AircallWorkflowRepairResponse {
  targetVersion: number;
  scope: 'recent' | 'all';
  recentDays: number | null;
  from: string | null;
  scanned: number;
  queued: number;
  skipped: number;
  alreadyEvaluated: number;
  missingEvaluations: number;
  missingSignalEvaluations: number;
  missingSignalFlowOutcomes: number;
  extraSignalEvaluations: number;
  invalidResolverOutputs: number;
  failedOrUnmatchedEvaluations: number;
  staleResolverVersion: number;
  unresolved: number;
  callEvents: Array<{
    id: string;
    externalCallId: string;
    resolvedWithVersion: number | null;
    resolverStatus: string | null;
    evaluationCount: number;
    evaluationProblemCount: number;
    expectedSignals: string[];
    evaluatedSignals: string[];
    missingSignals: string[];
    missingFlowSignals: string[];
    extraSignals: string[];
    invalidResolverOutput: boolean;
    repairMode: 'already_evaluated' | 'replay_stored_output' | 'rerun_resolver' | 'wait_for_resolver' | 'resolver_failed';
    queued: boolean;
    skippedReason: string | null;
  }>;
  coverage: AircallWorkflowCoverageResponse;
}
