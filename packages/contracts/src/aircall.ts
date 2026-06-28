import { z } from 'zod';

export const aircallLinkUserSchema = z.object({
  memberId: z.string().trim().min(1),
});
export type AircallLinkUserInput = z.infer<typeof aircallLinkUserSchema>;

export const aircallBackfillRecentSchema = z.object({
  recentDays: z.coerce.number().int().min(1).max(7).default(3),
  maxPages: z.coerce.number().int().min(1).max(40).default(20),
});
export type AircallBackfillRecentInput = z.infer<typeof aircallBackfillRecentSchema>;

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
  receivedAt: string;
}

export interface AircallCallEventsResponse {
  credentialRequired: boolean;
  stats: {
    total: number;
    last3d: number;
    withTranscript: number;
    resolverQueued: number;
    lastReceivedAt: string | null;
  };
  calls: AircallCallEventDto[];
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
