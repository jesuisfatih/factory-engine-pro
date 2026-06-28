import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PrincipalType } from '@factory-engine-pro/contracts';
import { AuthTokenService } from './auth-token.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { getJwtAccessSecret } from './jwt-secret.js';
import { TenantContextService } from './tenant-context.js';

interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  principal_type: PrincipalType;
  permissions?: string[];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly authTokens: AuthTokenService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { context?: unknown }>();
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer token is required');

    const accessToken = auth.slice(7);
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: getJwtAccessSecret(this.config),
    });
    if (await this.authTokens.isAccessTokenRevoked(accessToken)) {
      throw new UnauthorizedException('Session was revoked');
    }
    this.tenantContext.set({
      tenantId: payload.tenant_id,
      principalId: payload.sub,
      principalType: payload.principal_type,
      permissions: normalizePermissions(payload.permissions),
    });

    request.context = this.tenantContext.get();
    return true;
  }
}

function normalizePermissions(permissions: unknown) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((permission): permission is string => typeof permission === 'string' && permission.length > 0);
}
