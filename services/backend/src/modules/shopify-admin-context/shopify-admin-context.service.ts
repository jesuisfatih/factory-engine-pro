import { Injectable } from '@nestjs/common';
import type {
  ShopifyAbandonedCheckoutContext,
  ShopifyAbandonedCheckoutContextInput,
} from '@factory-engine-pro/contracts';
import type { Request } from 'express';
import { CustomerContactResolverService } from '../../shared/customer-contact-resolver.service.js';
import { CustomerContactTimelineService } from '../../shared/customer-contact-timeline.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { ShopifyCustomerSessionService } from '../accounts/shopify-customer-session.service.js';

@Injectable()
export class ShopifyAdminContextService {
  constructor(
    private readonly sessions: ShopifyCustomerSessionService,
    private readonly resolver: CustomerContactResolverService,
    private readonly timeline: CustomerContactTimelineService,
    private readonly prisma: PrismaService,
  ) {}

  async abandonedCheckout(
    request: Request,
    input: ShopifyAbandonedCheckoutContextInput,
  ): Promise<ShopifyAbandonedCheckoutContext> {
    await this.sessions.inspectAdmin(request);
    const customer = await this.resolveCustomer(input);
    const checkedAt = new Date().toISOString();
    if (!customer) {
      return {
        matched: false,
        customer: null,
        contactState: null,
        latestNote: null,
        staffMessage: 'No Factory Engine customer matched this abandoned checkout yet.',
        checkedAt,
      };
    }

    await this.resolver.capturePhonePoints(customer.id, [
      ...(input.phone ? [{
        value: input.phone,
        source: 'checkout' as const,
        sourceRef: input.checkoutId ?? null,
        priority: 85,
        metadata: { surface: 'shopify_admin_abandoned_checkout', checkoutId: input.checkoutId ?? null },
      }] : []),
      ...input.alternatePhones.map((phone, index) => ({
        value: phone,
        source: 'checkout' as const,
        sourceRef: input.checkoutId ?? null,
        priority: 84 - index,
        metadata: { surface: 'shopify_admin_abandoned_checkout', checkoutId: input.checkoutId ?? null, alternate: true },
      })),
    ]);

    const [contactState, internalNote, workspaceNote, taskComment, staffWorkComment] = await Promise.all([
      this.timeline.latestForCustomer(customer.id),
      this.prisma.db.customerInternalNote.findFirst({
        where: { customerId: customer.id },
        include: { author: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.db.personWorkspaceNote.findFirst({
        where: { linkedCustomerId: customer.id, kind: 'queue', deletedAt: null },
        include: { author: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.db.serviceRequestComment.findFirst({
        where: {
          internal: true,
          serviceRequest: { customerId: customer.id },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.db.staffWorkComment.findFirst({
        where: {
          internal: true,
          staffWorkItem: { customerId: customer.id },
        },
        include: { actor: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);
    const taskCommentAuthor = taskComment?.actorId
      ? await this.prisma.db.member.findFirst({
          where: { id: taskComment.actorId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;
    const latestNote = pickLatestNote(
      internalNote,
      workspaceNote,
      taskComment ? {
        id: taskComment.id,
        body: taskComment.body,
        createdAt: taskComment.createdAt,
        author: taskCommentAuthor,
      } : null,
      staffWorkComment ? {
        id: staffWorkComment.id,
        body: staffWorkComment.body,
        createdAt: staffWorkComment.createdAt,
        author: staffWorkComment.actor,
      } : null,
    );
    const contact = await this.resolver.resolveOne(customer.id);
    const name = customer.companyName
      || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
      || customer.email
      || 'Customer';
    return {
      matched: true,
      customer: {
        id: customer.id,
        name,
        email: contact?.email ?? customer.email,
        phone: contact?.displayPhone ?? customer.phone,
      },
      contactState,
      latestNote,
      staffMessage: contactState?.active
        ? contactState.label
        : latestNote
          ? `Latest internal note: ${latestNote.body}`
          : contactState?.label ?? 'No prior call or internal note is recorded for this customer.',
      checkedAt,
    };
  }

  private async resolveCustomer(input: ShopifyAbandonedCheckoutContextInput) {
    const direct = await this.resolver.findCustomer({
      shopifyCustomerId: numericShopifyId(input.shopifyCustomerId),
      email: input.email,
      phone: input.phone,
    });
    if (direct) return direct;
    for (const phone of input.alternatePhones) {
      const customer = await this.resolver.findCustomer({ phone });
      if (customer) return customer;
    }
    return null;
  }
}

type NoteRow = {
  id: string;
  body: string;
  createdAt: Date;
  author: { firstName: string; lastName: string; email: string } | null;
};

function pickLatestNote(...notes: Array<NoteRow | null>) {
  const row = notes
    .filter((note): note is NoteRow => Boolean(note))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!row) return null;
  return {
    id: row.id,
    body: row.body,
    authorName: row.author
      ? `${row.author.firstName ?? ''} ${row.author.lastName ?? ''}`.trim() || row.author.email
      : 'Team member',
    createdAt: row.createdAt.toISOString(),
  };
}

function numericShopifyId(value?: string) {
  if (!value) return undefined;
  return value.match(/Customer\/(\d+)/i)?.[1] ?? (/^\d+$/.test(value) ? value : undefined);
}
