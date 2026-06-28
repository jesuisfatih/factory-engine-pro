import { Injectable } from '@nestjs/common';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import type { PrincipalRecord } from './auth.types.js';

@Injectable()
export class AuthAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
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
    this.logger.log('auth', input.action, input.success ? 'Login accepted' : 'Login rejected', {
      email: input.email,
      principal_id: input.principal?.id ?? null,
      principal_type: input.principal?.type ?? null,
      success: input.success,
    });
  }
}
