import { Global, Module } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service.js';
import { CryptoService } from './crypto.service.js';
import { AppLogger } from './logger.service.js';
import { PasswordService } from './password.service.js';
import { PrismaService } from './prisma.service.js';
import { TenantContextService } from './tenant-context.js';

@Global()
@Module({
  providers: [
    TenantContextService,
    PrismaService,
    PasswordService,
    CryptoService,
    AuthTokenService,
    AppLogger,
  ],
  exports: [
    TenantContextService,
    PrismaService,
    PasswordService,
    CryptoService,
    AuthTokenService,
    AppLogger,
  ],
})
export class SharedModule {}
