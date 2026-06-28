import { Injectable, NotFoundException } from '@nestjs/common';
import type { MailDeliveryStatus, Prisma } from '@prisma/client';
import { prefixedId } from '../../shared/id.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class MailRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  createDelivery(input: {
    eventKey: string;
    category?: string;
    recipientEmail: string;
    subject: string;
    html: string;
    text?: string | null;
    status?: MailDeliveryStatus;
    provider?: string | null;
    errorMessage?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.mailDelivery.create({
      data: {
        id: prefixedId('mail'),
        tenantId: this.tenantId(),
        eventKey: input.eventKey,
        category: input.category ?? 'system',
        recipientEmail: input.recipientEmail.toLowerCase(),
        subject: input.subject,
        html: input.html,
        text: input.text ?? null,
        ...(input.status && { status: input.status }),
        provider: input.provider ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata: input.metadata ?? {},
      },
    });
  }

  list(input: { status?: MailDeliveryStatus; eventKey?: string; recipient?: string; limit: number }) {
    return this.prisma.db.mailDelivery.findMany({
      where: {
        ...(input.status && { status: input.status }),
        ...(input.eventKey && { eventKey: { contains: input.eventKey, mode: 'insensitive' } }),
        ...(input.recipient && { recipientEmail: { contains: input.recipient.toLowerCase(), mode: 'insensitive' } }),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });
  }

  findById(id: string) {
    return this.prisma.db.mailDelivery.findFirst({ where: { id } });
  }

  async markSending(id: string) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { id },
      data: { status: 'sending', attemptCount: { increment: 1 }, errorMessage: null },
    });
    return this.requireById(id);
  }

  async markSent(id: string, provider: string, providerMessageId: string | null) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { id },
      data: { status: 'sent', provider, providerMessageId, errorMessage: null, sentAt: new Date() },
    });
    return this.requireById(id);
  }

  async markFailed(id: string, errorMessage: string) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { id },
      data: { status: 'failed', errorMessage },
    });
    return this.requireById(id);
  }

  async markSkipped(id: string, reason: string) {
    await this.prisma.db.mailDelivery.updateMany({
      where: { id },
      data: { status: 'skipped', errorMessage: reason },
    });
    return this.requireById(id);
  }

  private async requireById(id: string) {
    const delivery = await this.findById(id);
    if (!delivery) throw new NotFoundException('Mail delivery not found');
    return delivery;
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
