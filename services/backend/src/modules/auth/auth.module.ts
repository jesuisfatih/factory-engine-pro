import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityModule } from '../identity/identity.module.js';
import { AuthAuditService } from './auth-audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthPrincipalService } from './auth-principal.service.js';
import { AuthSessionService } from './auth-session.service.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [JwtModule.register({}), IdentityModule],
  controllers: [AuthController],
  providers: [AuthAuditService, AuthPrincipalService, AuthSessionService, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
