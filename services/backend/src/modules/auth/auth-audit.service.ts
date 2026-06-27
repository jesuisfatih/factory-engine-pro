import { Injectable } from '@nestjs/common';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import type { PrincipalRecord } from './auth.types.js';

@Injectable()
export class AuthAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async writeLoginAttempt(input: { principal: PrincipalRecord | null; email: string; action: string; success: boolean }) {
    const context = this.tenantContext.require();
    if (!context.tenantId) throw new Error('Tenant context is required');
    await this.prisma.db.authAuditLog.create({
      data: {
        id: prefixedId('alog'),
        tenantId: context.tenantId,
        principalId: input.principal?.id,
        principalType: input.principal?.type,
        email: input.email,
        action: input.action,
        requestId: context.requestId,
        success: input.success,
      },
    });
  }
}
