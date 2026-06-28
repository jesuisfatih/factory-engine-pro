import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AddServiceRequestCommentInput,
  AssignServiceRequestInput,
  BulkServiceRequestsInput,
  ChangeServiceRequestStatusInput,
  CloseServiceRequestInput,
  CreateServiceRequestInput,
  SupportQuery,
  UpdateServiceRequestInput,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { SupportRepository } from './support.repository.js';

const CLOSED_STATUSES = new Set(['closed', 'resolved']);

@Injectable()
export class SupportService {
  constructor(
    private readonly repository: SupportRepository,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async list(query: SupportQuery) {
    const where = this.buildWhere(query);
    const limit = query.limit ?? 25;
    const page = query.page ?? 1;
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.repository.list(where, this.orderBy(query.sort), skip, limit),
      this.repository.count(where),
    ]);
    return {
      items: rows.map((row) => this.present(row)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      offset: skip,
    };
  }

  async stats(query: Partial<SupportQuery>) {
    const where = this.buildWhere({ ...query, limit: 25, page: 1, surface: query.surface ?? 'all' } as SupportQuery);
    const [byStatus, bySurface, urgent] = await Promise.all([
      this.repository.groupByStatus(where),
      this.repository.groupBySurface(where),
      this.repository.count({ ...where, status: { notIn: Array.from(CLOSED_STATUSES) }, priority: { in: ['critical', 'urgent', 'high'] } }),
    ]);
    const statusCounts: Record<string, number> = {};
    const surfaces: Record<string, number> = {};
    let total = 0;
    for (const row of byStatus) {
      statusCounts[row.status] = row._count._all;
      total += row._count._all;
    }
    for (const row of bySurface) surfaces[row.surface] = row._count._all;
    return {
      total,
      open: statusCounts.open || 0,
      inProgress: statusCounts.in_progress || 0,
      waiting: (statusCounts.waiting || 0) + (statusCounts.waiting_on_customer || 0),
      resolved: statusCounts.resolved || 0,
      closed: statusCounts.closed || 0,
      urgent,
      surfaces,
      ...statusCounts,
    };
  }

  async exportCsv(query: SupportQuery) {
    const result = await this.list({ ...query, limit: 100, page: 1 });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['ticketNumber', 'title', 'surface', 'source', 'status', 'priority', 'category', 'customer', 'assignedTo', 'createdAt', 'updatedAt'];
    const body = result.items.map((item: any) => [
      item.ticketNumber,
      item.title,
      item.surface,
      item.source,
      item.status,
      item.priority,
      item.category,
      item.customer?.companyName || '',
      item.assignedTo?.name || '',
      item.createdAt,
      item.updatedAt,
    ].map(escape).join(','));
    return `${header.join(',')}\n${body.join('\n')}\n`;
  }

  async getById(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Service request not found');
    return this.present(row);
  }

  async create(input: CreateServiceRequestInput) {
    if (input.customerId) await this.ensureCustomer(input.customerId);
    if (input.customerUserId) await this.ensureCustomerUser(input.customerUserId);
    if (input.assignedMemberId) await this.ensureMember(input.assignedMemberId);
    const metadata = this.cleanMetadata({
      ...(input.metadata ?? {}),
      category: (input.metadata?.category as string | undefined) || 'other',
      ticketNumber: `SR-${Date.now().toString(36).toUpperCase()}`,
    });
    const created = await this.repository.create({
      customerId: input.customerId ?? null,
      customerUserId: input.customerUserId ?? null,
      assignedMemberId: input.assignedMemberId ?? null,
      source: input.source ?? 'manual',
      surface: input.surface ?? 'internal',
      sourceCallId: input.sourceCallId,
      sourceEmailId: input.sourceEmailId,
      sourceFormId: input.sourceFormId,
      title: input.title,
      description: input.description ?? null,
      status: 'open',
      priority: input.priority ?? 'medium',
      createdByActorId: this.tenantContext.get()?.principalId,
      metadata,
      ...(input.taskStateSnapshot && { taskStateSnapshot: input.taskStateSnapshot as Prisma.InputJsonValue }),
    });
    this.logger.log('support', 'create', 'Service request created', { service_request_id: created.id, surface: created.surface });
    return this.getById(created.id);
  }

  async update(id: string, input: UpdateServiceRequestInput) {
    const existing = await this.requireRow(id);
    const metadata = this.asRecord(existing.metadata);
    const updated = await this.repository.update(id, {
      ...(input.priority && { priority: input.priority }),
      ...(input.category !== undefined && { metadata: this.cleanMetadata({ ...metadata, category: input.category || 'other' }) }),
    });
    await this.addSystemComment(id, 'details_changed', {
      previousPriority: existing.priority,
      newPriority: updated?.priority,
      previousCategory: metadata.category,
      newCategory: input.category,
    });
    this.logger.log('support', 'update', 'Service request updated', { service_request_id: id });
    return this.getById(id);
  }

  async assign(id: string, input: AssignServiceRequestInput) {
    const existing = await this.requireRow(id);
    if (input.assignedMemberId) await this.ensureMember(input.assignedMemberId);
    await this.repository.update(id, { assignedMemberId: input.assignedMemberId ?? null });
    await this.addSystemComment(id, 'assignment_changed', {
      previousAssignee: existing.assignedMemberId,
      newAssignee: input.assignedMemberId ?? null,
      reason: input.reason ?? null,
    });
    this.logger.log('support', 'assign', 'Service request assigned', { service_request_id: id, member_id: input.assignedMemberId ?? null });
    return this.getById(id);
  }

  async changeStatus(id: string, input: ChangeServiceRequestStatusInput) {
    const existing = await this.requireRow(id);
    const data: Prisma.ServiceRequestUncheckedUpdateManyInput = { status: input.status };
    if (CLOSED_STATUSES.has(input.status)) data.closedAt = new Date();
    if (input.status === 'reopened') data.closedAt = null;
    await this.repository.update(id, data);
    await this.addSystemComment(id, 'status_changed', { previousStatus: existing.status, newStatus: input.status });
    this.logger.log('support', 'status', 'Service request status changed', { service_request_id: id, status: input.status });
    return this.getById(id);
  }

  async addComment(id: string, input: AddServiceRequestCommentInput) {
    await this.requireRow(id);
    await this.repository.createComment({
      serviceRequestId: id,
      actorId: this.tenantContext.get()?.principalId,
      actorType: this.tenantContext.get()?.principalType ?? 'member',
      body: input.body,
      internal: input.internal ?? false,
      attachmentsJson: (input.attachmentsJson ?? []) as Prisma.InputJsonValue,
    });
    await this.repository.touch(id);
    this.logger.log('support', 'comment', 'Service request comment added', { service_request_id: id, internal: input.internal ?? false });
    return this.getById(id);
  }

  async close(id: string, input: CloseServiceRequestInput) {
    await this.requireRow(id);
    await this.repository.update(id, {
      status: 'closed',
      closedAt: new Date(),
      resolutionCode: input.resolutionCode ?? null,
      resolutionNote: input.resolutionNote ?? null,
    });
    await this.addSystemComment(id, 'closed', { resolutionCode: input.resolutionCode ?? null, resolutionNote: input.resolutionNote ?? null });
    this.logger.log('support', 'close', 'Service request closed', { service_request_id: id });
    return this.getById(id);
  }

  async reopen(id: string, reason?: string) {
    await this.requireRow(id);
    await this.repository.update(id, { status: 'reopened', closedAt: null });
    await this.addSystemComment(id, 'reopened', { reason: reason ?? null });
    this.logger.log('support', 'reopen', 'Service request reopened', { service_request_id: id });
    return this.getById(id);
  }

  async bulk(input: BulkServiceRequestsInput) {
    if (input.assignedMemberId) await this.ensureMember(input.assignedMemberId);
    for (const id of input.ids) {
      await this.requireRow(id);
      if (input.assignedMemberId !== undefined) await this.assign(id, { assignedMemberId: input.assignedMemberId });
      if (input.status) await this.changeStatus(id, { status: input.status });
      if (input.status === 'closed') await this.close(id, { resolutionNote: input.resolutionNote });
    }
    this.logger.log('support', 'bulk', 'Bulk support action applied', { count: input.ids.length });
    return { ok: true, count: input.ids.length };
  }

  async listCustomers(search?: string) {
    const customers = await this.repository.listCustomers(search);
    return customers.map((customer) => ({ id: customer.id, companyName: customer.companyName, email: customer.email }));
  }

  private buildWhere(query: SupportQuery): Prisma.ServiceRequestWhereInput {
    const where: Prisma.ServiceRequestWhereInput = {};
    if (query.surface && query.surface !== 'all') where.surface = query.surface;
    const priority = splitCsv(query.priority);
    if (priority.length) where.priority = { in: priority };
    const sources = splitCsv(query.source);
    if (sources.length) where.source = { in: sources };
    if (query.customerId) where.customerId = query.customerId;
    if (query.assigned === 'unassigned') where.assignedMemberId = null;
    else if (query.assigned && query.assigned !== 'all') where.assignedMemberId = query.assigned;
    if (query.category) {
      where.metadata = { path: ['category'], equals: query.category };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom && { gte: new Date(query.createdFrom) }),
        ...(query.createdTo && { lte: new Date(query.createdTo) }),
      };
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { id: q },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { customer: { companyName: { contains: q, mode: 'insensitive' } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
        { customerUser: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  private orderBy(sort?: string): Prisma.ServiceRequestOrderByWithRelationInput[] {
    const [key, rawDir] = String(sort || 'updatedAt:desc').split(':');
    const dir: Prisma.SortOrder = rawDir === 'asc' ? 'asc' : 'desc';
    if (key === 'status') return [{ status: dir }, { updatedAt: 'desc' }];
    if (key === 'assignedTo') return [{ assignedMemberId: dir }, { updatedAt: 'desc' }];
    if (key === 'priority') return [{ priority: dir }, { updatedAt: 'desc' }];
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'title') return [{ title: dir }];
    return [{ updatedAt: dir }, { createdAt: 'desc' }];
  }

  private async requireRow(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Service request not found');
    return row;
  }

  private async ensureCustomer(id: string) {
    const row = await this.repository.findCustomer(id);
    if (!row) throw new BadRequestException('Valid customerId is required');
  }

  private async ensureCustomerUser(id: string) {
    const row = await this.repository.findCustomerUser(id);
    if (!row) throw new BadRequestException('Valid customerUserId is required');
  }

  private async ensureMember(id: string) {
    const row = await this.repository.findActiveMember(id);
    if (!row) throw new BadRequestException('Valid assignedMemberId is required');
  }

  private async addSystemComment(id: string, eventType: string, meta: Record<string, unknown>) {
    await this.repository.createComment({
      serviceRequestId: id,
      actorId: this.tenantContext.get()?.principalId,
      actorType: 'system',
      body: eventType,
      internal: true,
      attachmentsJson: [meta] as Prisma.InputJsonValue,
    });
    await this.repository.touch(id);
  }

  private present(row: any) {
    const metadata = this.asRecord(row.metadata);
    const ticketNumber = String(metadata.ticketNumber || `SR-${String(row.id).slice(-8).toUpperCase()}`);
    const firstResponseAt = row.comments?.find((comment: any) => comment.actorType !== 'system' && !comment.internal)?.createdAt ?? null;
    return {
      ...row,
      ticketNumber,
      number: ticketNumber,
      subject: row.title,
      summary: row.description,
      category: String(metadata.category || 'other'),
      customer: row.customer ? { id: row.customer.id, companyName: row.customer.companyName, name: row.customer.companyName, email: row.customer.email } : null,
      company: row.customer ? { id: row.customer.id, name: row.customer.companyName, email: row.customer.email } : null,
      companyUser: row.customerUser ? { id: row.customerUser.id, email: row.customerUser.email, firstName: row.customerUser.firstName, lastName: row.customerUser.lastName } : null,
      assignedTo: row.assignedMember ? { id: row.assignedMember.id, name: `${row.assignedMember.firstName} ${row.assignedMember.lastName}`, email: row.assignedMember.email } : null,
      comments: (row.comments ?? []).map((comment: any) => ({
        id: comment.id,
        body: comment.body,
        message: comment.body,
        internal: comment.internal,
        actorId: comment.actorId,
        actorType: comment.actorType,
        attachmentsJson: comment.attachmentsJson,
        createdAt: comment.createdAt,
      })),
      responses: (row.comments ?? []).filter((comment: any) => !comment.internal),
      firstResponseAt,
      sla: buildSla(row, firstResponseAt),
    };
  }

  private cleanMetadata(metadata: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== '')) as unknown as Prisma.InputJsonValue;
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }
}

function splitCsv(raw?: string) {
  return String(raw || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function buildSla(row: any, firstResponseAt: Date | string | null) {
  const createdAt = new Date(row.createdAt);
  const firstResponseTargetAt = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000);
  const resolutionTargetAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  const now = Date.now();
  const closedAt = row.closedAt ? new Date(row.closedAt).getTime() : null;
  const firstResponseMs = firstResponseAt ? new Date(firstResponseAt).getTime() : null;
  const firstResponseBreached = !firstResponseMs && now > firstResponseTargetAt.getTime();
  const resolutionBreached = !closedAt && now > resolutionTargetAt.getTime();
  return {
    firstResponseHours: 4,
    resolutionHours: 24,
    firstResponseTargetAt,
    resolutionTargetAt,
    firstResponseAt,
    ageMs: now - createdAt.getTime(),
    firstResponseBreached,
    resolutionBreached,
    tone: resolutionBreached ? 'red' : firstResponseBreached ? 'amber' : 'green',
  };
}
