import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthTokenService } from './auth-token.service.js';
import { BusinessClockService } from './business-clock.service.js';
import { CryptoService } from './crypto.service.js';
import { CustomerContactResolverService } from './customer-contact-resolver.service.js';
import { CustomerInternalNotesService } from './customer-internal-notes.service.js';
import { AppLogger } from './logger.service.js';
import { PasswordService } from './password.service.js';
import { PrismaService } from './prisma.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { TenantContextService } from './tenant-context.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    TenantContextService,
    PrismaService,
    PasswordService,
    CryptoService,
    AuthTokenService,
    BusinessClockService,
    CustomerContactResolverService,
    CustomerInternalNotesService,
    AppLogger,
    RealtimeService,
    RealtimeGateway,
  ],
  exports: [
    JwtModule,
    TenantContextService,
    PrismaService,
    PasswordService,
    CryptoService,
    AuthTokenService,
    BusinessClockService,
    CustomerContactResolverService,
    CustomerInternalNotesService,
    AppLogger,
    RealtimeService,
  ],
})
export class SharedModule {}
