import { Injectable, NotFoundException } from '@nestjs/common';
import { prefixedId } from './id.js';
import { PrismaService } from './prisma.service.js';
import { TenantContextService } from './tenant-context.js';

export type CustomerInternalNoteSource = 'person_workspace' | 'customer_archive' | 'admin_call_center';

@Injectable()
export class CustomerInternalNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(input: {
    customerId: string;
    authorMemberId: string;
    body: string;
    source: CustomerInternalNoteSource;
  }) {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for customer notes');
    const customer = await this.prisma.db.customer.findFirst({
      where: { id: input.customerId, tenantId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.db.customerInternalNote.create({
      data: {
        id: prefixedId('cnote'),
        tenantId,
        customerId: customer.id,
        authorMemberId: input.authorMemberId,
        body: input.body.trim(),
        source: input.source,
      },
    });
  }
}
