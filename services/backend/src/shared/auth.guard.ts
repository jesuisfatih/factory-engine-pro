import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PrincipalType } from '@factory-engine-pro/contracts';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { PrismaService } from './prisma.service.js';
import { TenantContextService } from './tenant-context.js';

interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  principal_type: PrincipalType;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
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

    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(auth.slice(7), {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
    this.tenantContext.set({
      tenantId: payload.tenant_id,
      principalId: payload.sub,
      principalType: payload.principal_type,
    });

    const principal = await this.resolvePrincipal(payload);
    this.tenantContext.set({ permissions: principal.permissions });
    request.context = this.tenantContext.get();
    return true;
  }

  private async resolvePrincipal(payload: AccessTokenPayload) {
    if (payload.principal_type === 'member') {
      const member = await this.prisma.db.member.findFirst({
        where: { id: payload.sub, status: 'active' },
        include: { roleAssignments: { include: { role: true } } },
      });
      if (!member) throw new UnauthorizedException('Member is not active');
      return {
        email: member.email,
        permissions: mergePermissions(member.roleAssignments.map((assignment) => assignment.role.permissions)),
      };
    }

    if (payload.principal_type === 'customer_user') {
      const user = await this.prisma.db.customerUser.findFirst({
        where: { id: payload.sub, status: 'active' },
        include: { roleAssignments: { include: { role: true } } },
      });
      if (!user) throw new UnauthorizedException('Customer user is not active');
      return {
        email: user.email,
        permissions: mergePermissions(user.roleAssignments.map((assignment) => assignment.role.permissions)),
      };
    }

    const subUser = await this.prisma.db.subUser.findFirst({
      where: { id: payload.sub, status: 'active' },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!subUser) throw new UnauthorizedException('Sub-user is not active');
    return {
      email: subUser.email,
      permissions: mergePermissions(subUser.roleAssignments.map((assignment) => assignment.role.permissions)),
    };
  }
}

function mergePermissions(records: unknown[]) {
  const permissions = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, allowed] of Object.entries(record as Record<string, unknown>)) {
      if (allowed === true) permissions.add(key);
    }
  }
  return [...permissions];
}
