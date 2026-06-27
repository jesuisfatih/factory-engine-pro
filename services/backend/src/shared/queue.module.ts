import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
export const AUTH_EVENTS_QUEUE = Symbol('AUTH_EVENTS_QUEUE');
export const PRICING_RULE_SYNC_QUEUE = Symbol('PRICING_RULE_SYNC_QUEUE');
export const MAIL_OUTBOUND_QUEUE = Symbol('MAIL_OUTBOUND_QUEUE');
export const AIRCALL_INGEST_QUEUE = Symbol('AIRCALL_INGEST_QUEUE');

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
  ],
  exports: [REDIS_CONNECTION, AUTH_EVENTS_QUEUE, PRICING_RULE_SYNC_QUEUE, MAIL_OUTBOUND_QUEUE, AIRCALL_INGEST_QUEUE],
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
