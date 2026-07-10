import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
export const AUTH_EVENTS_QUEUE = Symbol('AUTH_EVENTS_QUEUE');
export const PRICING_RULE_SYNC_QUEUE = Symbol('PRICING_RULE_SYNC_QUEUE');
export const MAIL_OUTBOUND_QUEUE = Symbol('MAIL_OUTBOUND_QUEUE');
export const MAIL_MARKETING_FLOW_QUEUE = Symbol('MAIL_MARKETING_FLOW_QUEUE');
export const MAIL_MARKETING_CAMPAIGN_QUEUE = Symbol('MAIL_MARKETING_CAMPAIGN_QUEUE');
export const AIRCALL_INGEST_QUEUE = Symbol('AIRCALL_INGEST_QUEUE');
export const AIRCALL_ROLLING_SYNC_QUEUE = Symbol('AIRCALL_ROLLING_SYNC_QUEUE');
export const AI_TRANSCRIPT_RESOLVER_QUEUE = Symbol('AI_TRANSCRIPT_RESOLVER_QUEUE');
export const SHOPIFY_SYNC_QUEUE = Symbol('SHOPIFY_SYNC_QUEUE');
export const SEGMENT_EVALUATION_QUEUE = Symbol('SEGMENT_EVALUATION_QUEUE');
export const ROLLING_BACKFILL_QUEUE = Symbol('ROLLING_BACKFILL_QUEUE');
export const WORKFLOW_SCHEDULED_ACTION_QUEUE = Symbol('WORKFLOW_SCHEDULED_ACTION_QUEUE');
export const AUTH_EVENTS_QUEUE_NAME = 'auth.events';
export const PRICING_RULE_SYNC_QUEUE_NAME = 'pricing-rule-sync';
export const MAIL_OUTBOUND_QUEUE_NAME = 'mail-outbound';
export const AIRCALL_INGEST_QUEUE_NAME = 'aircall-ingest';
export const AI_TRANSCRIPT_RESOLVER_QUEUE_NAME = 'ai-transcript-resolver';
export const AI_TRANSCRIPT_RESOLVER_JOB = 'resolve';
export const AIRCALL_ROLLING_SYNC_QUEUE_NAME = 'aircall-rolling-sync';
export const AIRCALL_ROLLING_SYNC_JOB = 'rolling_sync';
export const SHOPIFY_SYNC_QUEUE_NAME = 'shopify-sync';
export const SEGMENT_EVALUATION_QUEUE_NAME = 'segment-evaluation';
export const SEGMENT_EVALUATION_JOB = 'segment_evaluation_job';
export const ROLLING_BACKFILL_QUEUE_NAME = 'rolling-7d-backfill';
export const ROLLING_BACKFILL_JOB = 'rolling_7d_backfill_job';
export const WORKFLOW_SCHEDULED_ACTION_QUEUE_NAME = 'workflow-scheduled-actions';
export const WORKFLOW_SCHEDULED_ACTION_JOB = 'workflow_scheduled_actions_sweep';
export const MAIL_MARKETING_FLOW_QUEUE_NAME = 'mail-marketing-flow';
export const MAIL_MARKETING_FLOW_JOB = 'process-enrollment';
export const MAIL_MARKETING_CAMPAIGN_QUEUE_NAME = 'mail-marketing-campaign';
export const MAIL_MARKETING_CAMPAIGN_JOB = 'queue-campaign';

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
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, AUTH_EVENTS_QUEUE_NAME), { connection });
      },
    },
    {
      provide: PRICING_RULE_SYNC_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, PRICING_RULE_SYNC_QUEUE_NAME), { connection });
      },
    },
    {
      provide: MAIL_OUTBOUND_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, MAIL_OUTBOUND_QUEUE_NAME), { connection });
      },
    },
    {
      provide: MAIL_MARKETING_FLOW_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, MAIL_MARKETING_FLOW_QUEUE_NAME), { connection });
      },
    },
    {
      provide: MAIL_MARKETING_CAMPAIGN_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, MAIL_MARKETING_CAMPAIGN_QUEUE_NAME), { connection });
      },
    },
    {
      provide: AIRCALL_INGEST_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, AIRCALL_INGEST_QUEUE_NAME), { connection });
      },
    },
    {
      provide: AIRCALL_ROLLING_SYNC_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, AIRCALL_ROLLING_SYNC_QUEUE_NAME), { connection });
      },
    },
    {
      provide: AI_TRANSCRIPT_RESOLVER_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, AI_TRANSCRIPT_RESOLVER_QUEUE_NAME), { connection });
      },
    },
    {
      provide: SHOPIFY_SYNC_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, SHOPIFY_SYNC_QUEUE_NAME), { connection });
      },
    },
    {
      provide: SEGMENT_EVALUATION_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, SEGMENT_EVALUATION_QUEUE_NAME), { connection });
      },
    },
    {
      provide: ROLLING_BACKFILL_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, ROLLING_BACKFILL_QUEUE_NAME), { connection });
      },
    },
    {
      provide: WORKFLOW_SCHEDULED_ACTION_QUEUE,
      inject: [REDIS_CONNECTION, ConfigService],
      useFactory: (connection: ConnectionOptions | null, config: ConfigService) => {
        if (!connection) return null;
        return new Queue(queueName(config, WORKFLOW_SCHEDULED_ACTION_QUEUE_NAME), { connection });
      },
    },
  ],
  exports: [
    REDIS_CONNECTION,
    AUTH_EVENTS_QUEUE,
    PRICING_RULE_SYNC_QUEUE,
    MAIL_OUTBOUND_QUEUE,
    MAIL_MARKETING_FLOW_QUEUE,
    MAIL_MARKETING_CAMPAIGN_QUEUE,
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

export function queueName(config: ConfigService, baseName: string): string {
  const namespace = [
    config.get<string>('FACTORY_ENGINE_QUEUE_NAMESPACE'),
    config.get<string>('QUEUE_NAMESPACE'),
    config.get<string>('TENANT_ID'),
    config.get<string>('FACTORY_ENGINE_TENANT_ID'),
    config.get<string>('TENANT_SLUG'),
    config.get<string>('APP_SLUG'),
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  return namespace ? `${safeQueueNamespace(namespace)}__${baseName}` : baseName;
}

function safeQueueNamespace(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

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
