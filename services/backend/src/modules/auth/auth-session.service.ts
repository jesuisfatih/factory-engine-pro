import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthSession } from '@factory-engine-pro/contracts';
import { AuthTokenService } from '../../shared/auth-token.service.js';
import { getJwtAccessSecret } from '../../shared/jwt-secret.js';
import type { PrincipalRecord } from './auth.types.js';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly authTokens: AuthTokenService,
  ) {}

  async issue(tenantId: string, principal: PrincipalRecord): Promise<AuthSession> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: principal.id,
        tenant_id: tenantId,
        principal_type: principal.type,
        permissions: principal.permissions,
      },
      {
        secret: getJwtAccessSecret(this.config),
        expiresIn: '15m',
      },
    );
    const refreshToken = await this.authTokens.create({
      tenantId,
      kind: 'refresh',
      principalType: principal.type,
      principalId: principal.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return {
      accessToken,
      refreshToken,
      tenantId,
      principal: {
        id: principal.id,
        type: principal.type,
        email: principal.email,
        firstName: principal.firstName,
        lastName: principal.lastName,
        permissions: principal.permissions,
      },
    };
  }
}
