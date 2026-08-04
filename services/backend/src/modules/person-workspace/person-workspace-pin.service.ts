import { Injectable } from '@nestjs/common';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

export type PersonWorkspacePinTarget = 'customer' | 'service_request';

@Injectable()
export class PersonWorkspacePinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  list(memberId: string) {
    return this.prisma.db.personWorkspacePin.findMany({
      where: { memberId },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
  }

  async toggle(
    memberId: string,
    targetKind: PersonWorkspacePinTarget,
    targetId: string,
    requestedState?: boolean,
  ) {
    const tenantId = this.tenantId();
    const existing = requestedState === undefined
      ? await this.prisma.db.personWorkspacePin.findFirst({ where: { memberId, targetKind, targetId } })
      : null;
    const pinned = requestedState ?? !existing;

    if (!pinned) {
      await this.prisma.db.personWorkspacePin.deleteMany({
        where: { memberId, targetKind, targetId },
      });
      return { id: existing?.id ?? null, targetKind, targetId, pinned: false, pinnedAt: null };
    }

    const created = await this.prisma.db.personWorkspacePin.upsert({
      where: {
        tenantId_memberId_targetKind_targetId: { tenantId, memberId, targetKind, targetId },
      },
      create: {
        id: prefixedId('pwp'),
        tenantId,
        memberId,
        targetKind,
        targetId,
      },
      update: {},
    });
    return {
      id: created.id,
      targetKind,
      targetId,
      pinned: true,
      pinnedAt: created.createdAt.getTime(),
    };
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for workspace pins');
    return tenantId;
  }
}
