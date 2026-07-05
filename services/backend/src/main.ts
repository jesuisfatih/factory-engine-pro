import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(helmet());
  const allowedOrigins = [
    process.env.ADMIN_APP_URL ?? 'http://127.0.0.1:5189',
    process.env.ACCOUNTS_APP_URL ?? 'http://127.0.0.1:5187',
    process.env.PERSON_APP_URL ?? 'http://127.0.0.1:5188',
    ...csvEnv('SHOPIFY_CUSTOMER_ACCOUNT_ORIGINS'),
    ...csvEnv('SHOPIFY_EXTENSION_ORIGINS'),
  ].filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin) || isShopifyCustomerOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-tenant-id', 'x-request-id', 'x-bootstrap-token', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'],
    exposedHeaders: ['x-request-id', 'mcp-session-id'],
  });

  const port = Number(process.env.PORT ?? 4100);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
}

function csvEnv(key: string) {
  return (process.env[key] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isShopifyCustomerOrigin(origin: string) {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.myshopify.com');
  } catch {
    return false;
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
