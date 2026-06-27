import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class AircallRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  syncLogs(limit = 50) {
    return this.prisma.db.syncLog.findMany({
      where: { service: 'aircall' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  inboxItems(limit = 50) {
    return this.prisma.db.aircallWebhookInbox.findMany({
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        eventType: true,
        externalCallId: true,
        receivedAt: true,
        processedAt: true,
      },
    });
  }

  createSyncLog(input: {
    action: string;
    status: string;
    message?: string | null;
    metadata?: Prisma.InputJsonValue;
    startedAt?: Date;
    finishedAt?: Date | null;
  }) {
    return this.prisma.db.syncLog.create({
      data: {
        id: prefixedId('slog'),
        tenantId: this.tenantId(),
        service: 'aircall',
        action: input.action,
        status: input.status,
        message: input.message ?? null,
        metadata: input.metadata ?? {},
        startedAt: input.startedAt ?? new Date(),
        finishedAt: input.finishedAt ?? null,
      },
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
