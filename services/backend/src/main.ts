import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(helmet());
  app.enableCors({
    origin: [
      process.env.ADMIN_APP_URL ?? 'http://127.0.0.1:5189',
      process.env.ACCOUNTS_APP_URL ?? 'http://127.0.0.1:5187',
      process.env.PERSON_APP_URL ?? 'http://127.0.0.1:5188',
    ],
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-tenant-id', 'x-request-id', 'x-bootstrap-token'],
    exposedHeaders: ['x-request-id'],
  });

  const port = Number(process.env.PORT ?? 4100);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
