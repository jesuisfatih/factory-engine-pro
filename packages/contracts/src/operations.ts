import { z } from 'zod';
import { emailSchema, pageQuerySchema, passwordSchema } from './common.js';
import { serviceRequestSourceSchema } from './enums.js';

export const segmentFieldSchema = z.enum([
  'companyStatus',
  'companyGroup',
  'companyEmail',
  'companyPhone',
  'companyTaxId',
  'currentLifecycleStage',
  'teamCount',
  'companyUserRole',
  'companyUserIsActive',
  'shopifyCustomerTags',
  'shopifyCustomerSegmentIds',
  'shopifyCustomerAcceptsMarketing',
  'shopifyCustomerState',
  'shopifyCustomerLocale',
  'shopifyCustomerOrdersCount',
  'shopifyCustomerTotalSpent',
  'totalRevenue',
  'totalOrders',
  'avgOrderValue',
  'daysSinceLastOrder',
  'churnRisk',
  'buyerIntent',
  'segment',
  'engagementScore',
  'upsellPotential',
  'totalSessions',
  'totalProductViews',
  'totalAddToCarts',
  'periodRevenue',
  'periodOrders',
  'periodQuantity',
]);
export type SegmentField = z.infer<typeof segmentFieldSchema>;

export const segmentOperatorSchema = z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'contains', 'in', 'notIn']);
export type SegmentOperator = z.infer<typeof segmentOperatorSchema>;

export const segmentConditionSchema = z.object({
  id: z.string().trim().optional(),
  field: segmentFieldSchema,
  operator: segmentOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
  timeframeDays: z.coerce.number().int().min(0).optional(),
  scopeType: z.enum(['all', 'product', 'collection']).default('all').optional(),
  scopeValues: z.array(z.string().trim()).default([]).optional(),
});
export type SegmentConditionInput = z.infer<typeof segmentConditionSchema>;

export const segmentMatchModeSchema = z.enum(['all', 'any']);
export const segmentImportanceSchema = z.enum(['critical', 'high', 'normal', 'low']);
export type SegmentImportance = z.infer<typeof segmentImportanceSchema>;

export const createSegmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#2f80ed'),
  matchMode: segmentMatchModeSchema.default('all'),
  priority: z.coerce.number().int().min(0).default(0),
  priorityGlobal: z.coerce.number().int().min(0).optional(),
  audienceType: z.enum(['accountscompany', 'shopify_customer', 'workforce_pool']).default('accountscompany'),
  lifecycleStage: z.string().trim().max(50).optional(),
  conditions: z.array(segmentConditionSchema).min(1).max(20),
  isActive: z.boolean().default(true),
});
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;

export const updateSegmentSchema = createSegmentSchema.partial().extend({
  conditions: z.array(segmentConditionSchema).min(1).max(20).optional(),
});
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;

export const previewSegmentSchema = z.object({
  id: z.string().trim().optional(),
  matchMode: segmentMatchModeSchema.default('all'),
  conditions: z.array(segmentConditionSchema).min(1).max(20),
});
export type PreviewSegmentInput = z.infer<typeof previewSegmentSchema>;

export const upsertSegmentOwnershipSchema = z.object({
  memberId: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  priority: z.coerce.number().int().min(0).default(0),
  importance: segmentImportanceSchema.default('normal'),
  dailyCap: z.coerce.number().int().min(0).nullable().optional(),
  autoAssignNew: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
  visualToken: z.string().trim().max(80).optional(),
});
export type UpsertSegmentOwnershipInput = z.infer<typeof upsertSegmentOwnershipSchema>;

export const syncShopifySegmentsSchema = z.object({
  force: z.boolean().default(false).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100).optional(),
});
export type SyncShopifySegmentsInput = z.infer<typeof syncShopifySegmentsSchema>;

export interface SyncShopifySegmentsResponse {
  scanned: number;
  created: number;
  updated: number;
  evaluated: number;
  skippedEvaluation: number;
  failed: number;
  segments: Array<{
    id: string;
    name: string;
    shopifySegmentId: string;
    action: 'created' | 'updated';
    evaluationStatus: 'evaluated' | 'skipped' | 'failed';
    customerCount: number;
    syncStatus: string | null;
    error: string | null;
  }>;
}

export const serviceRequestSurfaceSchema = z.enum(['internal', 'customer_facing']);
export const serviceRequestPrioritySchema = z.enum(['critical', 'urgent', 'high', 'medium', 'low']);
export const taskAxisSchema = z.enum(['sales', 'support', 'account']);
export const serviceRequestStatusSchema = z.enum([
  'open',
  'in_progress',
  'waiting',
  'waiting_on_customer',
  'pending_resolve',
  'pending_transfer',
  'resolved',
  'closed',
  'reopened',
  'transferred',
]);
export type ServiceRequestSource = z.infer<typeof serviceRequestSourceSchema>;
export type ServiceRequestSurface = z.infer<typeof serviceRequestSurfaceSchema>;
export type ServiceRequestPriority = z.infer<typeof serviceRequestPrioritySchema>;
export type TaskAxis = z.infer<typeof taskAxisSchema>;
export type ServiceRequestStatus = z.infer<typeof serviceRequestStatusSchema>;

export const supportQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().optional(),
  surface: z.enum(['all', 'internal', 'customer_facing']).default('all'),
  priority: z.string().trim().optional(),
  category: z.string().trim().optional(),
  source: z.string().trim().optional(),
  assigned: z.string().trim().optional(),
  customerId: z.string().trim().optional(),
  createdFrom: z.string().trim().optional(),
  createdTo: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type SupportQuery = z.infer<typeof supportQuerySchema>;

export const createServiceRequestSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(8000).optional(),
  source: serviceRequestSourceSchema.default('manual'),
  surface: serviceRequestSurfaceSchema.default('internal'),
  priority: serviceRequestPrioritySchema.default('medium'),
  axis: taskAxisSchema.optional(),
  customerId: z.string().trim().optional(),
  customerUserId: z.string().trim().optional(),
  assignedMemberId: z.string().trim().nullable().optional(),
  watcherMemberIds: z.array(z.string().trim().min(1)).max(25).default([]).optional(),
  matchedRuleId: z.string().trim().optional(),
  conditionTrace: z.array(z.unknown()).default([]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  sourceCallId: z.string().trim().optional(),
  sourceEmailId: z.string().trim().optional(),
  sourceFormId: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  taskStateSnapshot: z.record(z.string(), z.unknown()).optional(),
});
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;

export const assignServiceRequestSchema = z.object({
  assignedMemberId: z.string().trim().nullable().optional(),
  reason: z.string().trim().max(1000).optional(),
});
export type AssignServiceRequestInput = z.infer<typeof assignServiceRequestSchema>;

export const updateServiceRequestSchema = z.object({
  priority: serviceRequestPrioritySchema.optional(),
  category: z.string().trim().max(80).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
export type UpdateServiceRequestInput = z.infer<typeof updateServiceRequestSchema>;

export const changeServiceRequestStatusSchema = z.object({
  status: serviceRequestStatusSchema,
});
export type ChangeServiceRequestStatusInput = z.infer<typeof changeServiceRequestStatusSchema>;

export const closeServiceRequestSchema = z.object({
  resolutionCode: z.string().trim().max(80).optional(),
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type CloseServiceRequestInput = z.infer<typeof closeServiceRequestSchema>;

export const sweepOverdueServiceRequestsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  now: z.string().datetime().optional(),
});
export type SweepOverdueServiceRequestsInput = z.infer<typeof sweepOverdueServiceRequestsSchema>;

export interface SweepOverdueServiceRequestItem {
  id: string;
  title: string;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  dueAt: string;
  eventId: string;
  evaluatedRules: number;
  tasksCreated: number;
  resultStatuses: string[];
}

export interface SweepOverdueServiceRequestsResponse {
  checkedAt: string;
  scanned: number;
  overdue: number;
  fired: number;
  skipped: number;
  items: SweepOverdueServiceRequestItem[];
}

export const bulkServiceRequestsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
  assignedMemberId: z.string().trim().nullable().optional(),
  status: serviceRequestStatusSchema.optional(),
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type BulkServiceRequestsInput = z.infer<typeof bulkServiceRequestsSchema>;

export const addServiceRequestCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  internal: z.boolean().default(false),
  attachmentsJson: z.array(z.unknown()).default([]).optional(),
});
export type AddServiceRequestCommentInput = z.infer<typeof addServiceRequestCommentSchema>;

export const createB2BAccessRequestSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  companyName: z.string().trim().min(1),
  legalName: z.string().trim().min(1),
  website: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  estimatedMonthlyVolume: z.string().trim().optional(),
  message: z.string().trim().max(4000).optional(),
  password: passwordSchema,
  flowIntent: z.enum(['apply', 'request-invitation']).default('request-invitation'),
  sourceSurface: z.string().trim().default('accounts-request-invitation'),
  sourcePath: z.string().trim().optional(),
  sourceUrl: z.string().trim().optional(),
  formHandle: z.string().trim().optional(),
  formName: z.string().trim().optional(),
  shop: z.string().trim().optional(),
  merchantContext: z.string().trim().optional(),
});
export type CreateB2BAccessRequestInput = z.infer<typeof createB2BAccessRequestSchema>;

export const b2bAccessQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});
export type B2BAccessQuery = z.infer<typeof b2bAccessQuerySchema>;

export const rejectB2BAccessSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
});
export type RejectB2BAccessInput = z.infer<typeof rejectB2BAccessSchema>;
