import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from './tenant-context.js';

const TENANT_SCOPED_MODELS = new Set([
  'TenantConfig',
  'Member',
  'MemberRole',
  'MemberRoleAssignment',
  'Customer',
  'CustomerUser',
  'SubUser',
  'CustomerRole',
  'CustomerUserRoleAssignment',
  'SubUserRoleAssignment',
  'AuthToken',
  'AuthAuditLog',
  'CatalogProduct',
  'CatalogVariant',
  'CommerceOrder',
  'CommercePickupOrder',
  'CommerceActivityLog',
  'CustomerInsight',
  'CustomerList',
  'CustomerListItem',
  'CustomerAssignment',
  'CustomerAssignmentAudit',
  'PricingRule',
  'Segment',
  'SegmentOwnership',
  'SegmentCustomerMembership',
  'ServiceRequest',
  'TaskParticipant',
  'ServiceRequestComment',
  'B2BAccessRequest',
  'B2BAccessRequestFile',
  'MailDelivery',
  'AircallUser',
  'AircallMemberMap',
  'AircallNumber',
  'AircallWebhookConfig',
  'AircallWebhookInbox',
  'AircallCallEvent',
  'Call',
  'CallEvent',
  'AircallSyncState',
  'ShopifySyncState',
  'SyncLog',
  'WorkflowRule',
  'WorkflowRuleBackfillReport',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenantContext: TenantContextService) {
    super({
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  get db(): PrismaClient {
    const tenantContext = this.tenantContext;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !TENANT_SCOPED_MODELS.has(model)) {
              return query(args);
            }

            const tenantId = tenantContext.get()?.tenantId;
            if (!tenantId) {
              throw new ForbiddenException('Tenant context is required for tenant-scoped data access');
            }

            const scopedArgs = scopeArgs(args as Record<string, unknown>, operation, tenantId, model);
            return query(scopedArgs);
          },
        },
      },
    }) as unknown as PrismaClient;
  }
}

function scopeArgs(args: Record<string, unknown>, operation: string, tenantId: string, model: string) {
  if (['findUnique', 'delete', 'update'].includes(operation)) {
    throw new ForbiddenException(`${operation} is not allowed on tenant-scoped model ${model}; use tenant-safe repository methods`);
  }

  if (['findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'].includes(operation)) {
    const where = (args.where ?? {}) as Record<string, unknown>;
    return { ...args, where: { AND: [where, { tenantId }] } };
  }

  if (operation === 'create') {
    return { ...args, data: addTenantToData(args.data, tenantId) };
  }

  if (operation === 'createMany') {
    const data = Array.isArray(args.data)
      ? args.data.map((item) => addTenantToData(item, tenantId))
      : addTenantToData(args.data, tenantId);
    return { ...args, data };
  }

  if (operation === 'upsert') {
    return {
      ...args,
      create: addTenantToData(args.create, tenantId),
      update: addTenantToData(args.update, tenantId),
    };
  }

  return args;
}

function addTenantToData(data: unknown, tenantId: string) {
  if (!data || typeof data !== 'object') return data;
  return { ...(data as Record<string, unknown>), tenantId };
}
