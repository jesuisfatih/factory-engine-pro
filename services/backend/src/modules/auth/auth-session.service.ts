import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthSession } from '@factory-engine-pro/contracts';
import type { PrincipalType } from '@prisma/client';
import { AuthTokenService } from '../../shared/auth-token.service.js';
import { getJwtAccessSecret } from '../../shared/jwt-secret.js';
import type { PrincipalRecord } from './auth.types.js';

interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  principal_type: PrincipalType;
  permissions?: string[];
  exp?: number;
}

const SESSION_TTL_DAYS = 365;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_EXPIRES_IN = `${SESSION_TTL_DAYS}d`;

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
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      },
    );
    const refreshToken = await this.authTokens.create({
      tenantId,
      kind: 'refresh',
      principalType: principal.type,
      principalId: principal.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
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

  async issueMcpAccessToken(input: {
    tenantId: string;
    principalId: string;
    permissions: string[];
    expiresAt: Date;
  }) {
    const expiresInSeconds = Math.max(60, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000));
    return this.jwt.signAsync(
      {
        sub: input.principalId,
        tenant_id: input.tenantId,
        principal_type: 'member' satisfies PrincipalType,
        permissions: input.permissions,
        token_use: 'mcp',
      },
      {
        secret: getJwtAccessSecret(this.config),
        expiresIn: expiresInSeconds,
      },
    );
  }

  async revokeAccessToken(accessToken: string | undefined) {
    if (!accessToken) return false;
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: getJwtAccessSecret(this.config),
      });
    } catch {
      return false;
    }
    if (!payload.exp) return false;
    const expiresAt = new Date(payload.exp * 1000);
    if (expiresAt.getTime() <= Date.now()) return false;
    await this.authTokens.revokeAccessToken({
      tenantId: payload.tenant_id,
      principalId: payload.sub,
      principalType: payload.principal_type,
      token: accessToken,
      expiresAt,
      metadata: { source: 'logout' },
    });
    return true;
  }
}
