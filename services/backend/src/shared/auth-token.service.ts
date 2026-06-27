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

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
