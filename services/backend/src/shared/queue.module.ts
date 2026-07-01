import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
export const AUTH_EVENTS_QUEUE = Symbol('AUTH_EVENTS_QUEUE');
export const PRICING_RULE_SYNC_QUEUE = Symbol('PRICING_RULE_SYNC_QUEUE');
export const MAIL_OUTBOUND_QUEUE = Symbol('MAIL_OUTBOUND_QUEUE');
export const AIRCALL_INGEST_QUEUE = Symbol('AIRCALL_INGEST_QUEUE');
export const AIRCALL_ROLLING_SYNC_QUEUE = Symbol('AIRCALL_ROLLING_SYNC_QUEUE');
export const AI_TRANSCRIPT_RESOLVER_QUEUE = Symbol('AI_TRANSCRIPT_RESOLVER_QUEUE');
export const SHOPIFY_SYNC_QUEUE = Symbol('SHOPIFY_SYNC_QUEUE');
export const SEGMENT_EVALUATION_QUEUE = Symbol('SEGMENT_EVALUATION_QUEUE');
export const ROLLING_BACKFILL_QUEUE = Symbol('ROLLING_BACKFILL_QUEUE');
export const WORKFLOW_SCHEDULED_ACTION_QUEUE = Symbol('WORKFLOW_SCHEDULED_ACTION_QUEUE');
export const AI_TRANSCRIPT_RESOLVER_QUEUE_NAME = 'ai-transcript-resolver';
export const AI_TRANSCRIPT_RESOLVER_JOB = 'resolve';
export const AIRCALL_ROLLING_SYNC_QUEUE_NAME = 'aircall-rolling-sync';
export const AIRCALL_ROLLING_SYNC_JOB = 'rolling_sync';
export const SEGMENT_EVALUATION_QUEUE_NAME = 'segment-evaluation';
export const SEGMENT_EVALUATION_JOB = 'segment_evaluation_job';
export const ROLLING_BACKFILL_QUEUE_NAME = 'rolling-7d-backfill';
export const ROLLING_BACKFILL_JOB = 'rolling_7d_backfill_job';
export const WORKFLOW_SCHEDULED_ACTION_QUEUE_NAME = 'workflow-scheduled-actions';
export const WORKFLOW_SCHEDULED_ACTION_JOB = 'workflow_scheduled_actions_sweep';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        if (!url) return null;
        return redisConnectionOptions(url);
      },
    },
    {
      provide: AUTH_EVENTS_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue('auth.events', { connection });
      },
    },
    {
      provide: PRICING_RULE_SYNC_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue('pricing-rule-sync', { connection });
      },
    },
    {
      provide: MAIL_OUTBOUND_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue('mail-outbound', { connection });
      },
    },
    {
      provide: AIRCALL_INGEST_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue('aircall-ingest', { connection });
      },
    },
    {
      provide: AIRCALL_ROLLING_SYNC_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue(AIRCALL_ROLLING_SYNC_QUEUE_NAME, { connection });
      },
    },
    {
      provide: AI_TRANSCRIPT_RESOLVER_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue(AI_TRANSCRIPT_RESOLVER_QUEUE_NAME, { connection });
      },
    },
    {
      provide: SHOPIFY_SYNC_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue('shopify-sync', { connection });
      },
    },
    {
      provide: SEGMENT_EVALUATION_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue(SEGMENT_EVALUATION_QUEUE_NAME, { connection });
      },
    },
    {
      provide: ROLLING_BACKFILL_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue(ROLLING_BACKFILL_QUEUE_NAME, { connection });
      },
    },
    {
      provide: WORKFLOW_SCHEDULED_ACTION_QUEUE,
      inject: [REDIS_CONNECTION],
      useFactory: (connection: ConnectionOptions | null) => {
        if (!connection) return null;
        return new Queue(WORKFLOW_SCHEDULED_ACTION_QUEUE_NAME, { connection });
      },
    },
  ],
  exports: [
    REDIS_CONNECTION,
    AUTH_EVENTS_QUEUE,
    PRICING_RULE_SYNC_QUEUE,
    MAIL_OUTBOUND_QUEUE,
    AIRCALL_INGEST_QUEUE,
    AIRCALL_ROLLING_SYNC_QUEUE,
    AI_TRANSCRIPT_RESOLVER_QUEUE,
    SHOPIFY_SYNC_QUEUE,
    SEGMENT_EVALUATION_QUEUE,
    ROLLING_BACKFILL_QUEUE,
    WORKFLOW_SCHEDULED_ACTION_QUEUE,
  ],
})
export class QueueModule {}

function redisConnectionOptions(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
