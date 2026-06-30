import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type AuthTokenKind, type PrincipalType } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service.js';
import { prefixedId } from './id.js';

@Injectable()
export class AuthTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    tenantId: string;
    kind: AuthTokenKind;
    principalType: PrincipalType;
    principalId: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
    createdById?: string | null;
  }) {
    const token = randomBytes(48).toString('base64url');
    await this.prisma.db.authToken.create({
      data: {
        id: prefixedId('tok'),
        tenantId: input.tenantId,
        kind: input.kind,
        principalType: input.principalType,
        principalId: input.principalId,
        tokenHash: this.hash(token),
        expiresAt: input.expiresAt,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        createdById: input.createdById ?? null,
      },
    });
    return token;
  }

  async storeToken(input: {
    tenantId: string;
    kind: AuthTokenKind;
    principalType: PrincipalType;
    principalId: string;
    token: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
    createdById?: string | null;
  }) {
    return this.prisma.db.authToken.create({
      data: {
        id: prefixedId('tok'),
        tenantId: input.tenantId,
        kind: input.kind,
        principalType: input.principalType,
        principalId: input.principalId,
        tokenHash: this.hash(input.token),
        expiresAt: input.expiresAt,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        createdById: input.createdById ?? null,
      },
    });
  }

  async consume(kind: AuthTokenKind, token: string) {
    const tokenHash = this.hash(token);
    const row = await this.prisma.db.authToken.findFirst({
      where: { kind, tokenHash, usedAt: null, revokedAt: null },
    });
    if (!row) throw new UnauthorizedException('Token is invalid or already used');
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Token expired');

    await this.prisma.db.authToken.updateMany({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return row;
  }

  async revoke(kind: AuthTokenKind, token: string) {
    const tokenHash = this.hash(token);
    const result = await this.prisma.db.authToken.updateMany({
      where: { kind, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Refresh token not found');
  }

  async revokeIfPresent(kind: AuthTokenKind, token: string | undefined) {
    if (!token) return false;
    const tokenHash = this.hash(token);
    const result = await this.prisma.db.authToken.updateMany({
      where: { kind, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAccessToken(input: {
    tenantId: string;
    token: string;
    principalType: PrincipalType;
    principalId: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.db.authToken.upsert({
      where: { tokenHash: this.hash(input.token) },
      create: {
        id: prefixedId('tok'),
        tenantId: input.tenantId,
        kind: 'access_revocation',
        principalType: input.principalType,
        principalId: input.principalId,
        tokenHash: this.hash(input.token),
        expiresAt: input.expiresAt,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        revokedAt: null,
        expiresAt: input.expiresAt,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async isAccessTokenRevoked(token: string) {
    const row = await this.prisma.db.authToken.findFirst({
      where: {
        kind: 'access_revocation',
        tokenHash: this.hash(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async isMcpAccessTokenActive(token: string) {
    const row = await this.prisma.db.authToken.findFirst({
      where: {
        kind: 'mcp_access',
        tokenHash: this.hash(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async revokeById(input: { tenantId: string; id: string; kind: AuthTokenKind }) {
    const result = await this.prisma.db.authToken.updateMany({
      where: {
        id: input.id,
        tenantId: input.tenantId,
        kind: input.kind,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Token not found');
  }

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
