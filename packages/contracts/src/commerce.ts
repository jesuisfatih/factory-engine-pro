import { z } from 'zod';
import { pageQuerySchema } from './common.js';
import { taskAxisSchema } from './operations.js';

export const fulfillmentModeSchema = z.enum(['pickup', 'shipping', 'local_delivery', 'unknown']);
export type FulfillmentMode = z.infer<typeof fulfillmentModeSchema>;

export const commercePickupStatusSchema = z.enum([
  'pending',
  'processing',
  'ready',
  'notified',
  'picked_up',
  'cancelled',
]);
export type CommercePickupStatus = z.infer<typeof commercePickupStatusSchema>;

export const updateCommercePickupSchema = z.object({
  status: commercePickupStatusSchema.optional(),
  shelfCode: z.string().trim().max(80).nullable().optional(),
  qrCode: z.string().trim().max(240).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: 'At least one pickup field must be provided',
});
export type UpdateCommercePickupInput = z.infer<typeof updateCommercePickupSchema>;

export const orderSurfaceSchema = z.enum(['all', 'pickup', 'design_files']);
export type OrderSurface = z.infer<typeof orderSurfaceSchema>;

export const orderSortBySchema = z.enum([
  'shopify_updated',
  'order_date',
  'order_number',
  'customer_name',
  'total',
  'payment',
  'fulfillment',
]);
export type OrderSortBy = z.infer<typeof orderSortBySchema>;

export const orderListQuerySchema = pageQuerySchema.extend({
  surface: orderSurfaceSchema.default('all'),
  status: z.string().trim().optional(),
  financialStatus: z.string().trim().optional(),
  fulfillmentStatus: z.string().trim().optional(),
  fulfillmentMode: fulfillmentModeSchema.optional(),
  customerId: z.string().trim().optional(),
  orderSearch: z.string().trim().optional(),
  customerSearch: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: orderSortBySchema.default('shopify_updated'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  pickupOnly: z.coerce.boolean().optional(),
  hasDesignFiles: z.coerce.boolean().optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const directOrderItemSchema = z.object({
  variantId: z.string().trim().optional(),
  shopifyVariantId: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  title: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});
export type DirectOrderItemInput = z.infer<typeof directOrderItemSchema>;

export const createDirectOrderSchema = z.object({
  customerId: z.string().trim().optional(),
  customerUserId: z.string().trim().optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  idempotencyKey: z.string().trim().optional(),
  currency: z.string().trim().length(3).default('USD'),
  lineItems: z.array(directOrderItemSchema).min(1),
  shippingAddress: z.record(z.string(), z.unknown()).optional(),
  billingAddress: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().trim()).default([]),
});
export type CreateDirectOrderInput = z.infer<typeof createDirectOrderSchema>;

export const resolveReorderSchema = z.object({
  orderId: z.string().trim().optional(),
  shopifyOrderId: z.string().trim().optional(),
  lineItems: z.array(directOrderItemSchema).optional(),
});
export type ResolveReorderInput = z.infer<typeof resolveReorderSchema>;

export const transferOrderToMemberSchema = z.object({
  targetMemberId: z.string().trim().min(1),
  note: z.string().trim().min(1).max(2000),
  axis: taskAxisSchema.default('support'),
  priority: z.enum(['critical', 'urgent', 'high', 'medium', 'low']).default('high'),
  dueAt: z.string().datetime().nullable().optional(),
});
export type TransferOrderToMemberInput = z.infer<typeof transferOrderToMemberSchema>;

export const accountInvoiceStatusSchema = z.enum(['draft', 'unpaid', 'partial', 'paid', 'overdue', 'void']);
export type AccountInvoiceStatus = z.infer<typeof accountInvoiceStatusSchema>;

export const accountInvoiceLineItemSchema = z.object({
  id: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  name: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).optional(),
});
export type AccountInvoiceLineItemInput = z.infer<typeof accountInvoiceLineItemSchema>;

export const saveAccountInvoiceSchema = z.object({
  customerId: z.string().trim().optional(),
  orderId: z.string().trim().optional(),
  invoiceNumber: z.string().trim().optional(),
  status: accountInvoiceStatusSchema.default('unpaid'),
  issuedAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  subtotal: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).default(0),
  shippingAmount: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0).optional(),
  amountPaid: z.coerce.number().min(0).default(0),
  currency: z.string().trim().length(3).default('USD'),
  fileUrl: z.string().trim().min(1).nullable().optional(),
  externalPaymentUrl: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  lineItems: z.array(accountInvoiceLineItemSchema).optional(),
});
export type SaveAccountInvoiceInput = z.infer<typeof saveAccountInvoiceSchema>;

export const accountInvoiceQuerySchema = pageQuerySchema.extend({
  customerId: z.string().trim().optional(),
  orderId: z.string().trim().optional(),
  status: accountInvoiceStatusSchema.optional(),
  search: z.string().trim().optional(),
});
export type AccountInvoiceQuery = z.infer<typeof accountInvoiceQuerySchema>;

export const updateAccountInvoiceStatusSchema = z.object({
  status: accountInvoiceStatusSchema,
  amountPaid: z.coerce.number().min(0).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type UpdateAccountInvoiceStatusInput = z.infer<typeof updateAccountInvoiceStatusSchema>;

export const updateAccountInvoiceFileSchema = z.object({
  fileUrl: z.string().trim().min(1).nullable(),
  externalPaymentUrl: z.string().trim().min(1).nullable().optional(),
});
export type UpdateAccountInvoiceFileInput = z.infer<typeof updateAccountInvoiceFileSchema>;

export const recordAccountInvoicePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().trim().max(60).default('manual'),
  note: z.string().trim().max(1000).optional(),
});
export type RecordAccountInvoicePaymentInput = z.infer<typeof recordAccountInvoicePaymentSchema>;

export const sendAccountInvoiceSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type SendAccountInvoiceInput = z.infer<typeof sendAccountInvoiceSchema>;

export const customerCommerceQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().optional(),
  segment: z.string().trim().optional(),
  churnRisk: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  taxExempt: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recent_order', 'total_spent', 'orders_count', 'health_score', 'name']).default('recent_order'),
});
export type CustomerCommerceQuery = z.infer<typeof customerCommerceQuerySchema>;

export const createCustomerListSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  color: z.string().trim().default('#2563eb'),
  icon: z.string().trim().default('users'),
});
export type CreateCustomerListInput = z.infer<typeof createCustomerListSchema>;

export const updateCustomerListSchema = createCustomerListSchema.partial();
export type UpdateCustomerListInput = z.infer<typeof updateCustomerListSchema>;

export const customerListCustomersSchema = z.object({
  customerIds: z.array(z.string().trim()).min(1),
  notes: z.string().trim().optional(),
});
export type CustomerListCustomersInput = z.infer<typeof customerListCustomersSchema>;

export const updateCustomerListItemNoteSchema = z.object({
  notes: z.string().trim().nullable(),
});
export type UpdateCustomerListItemNoteInput = z.infer<typeof updateCustomerListItemNoteSchema>;

export const customerAssignmentAxisSchema = taskAxisSchema;
export type CustomerAssignmentAxis = z.infer<typeof customerAssignmentAxisSchema>;

export const assignCustomerAxisPrimarySchema = z.object({
  memberId: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
  source: z.string().trim().max(80).default('admin_transfer'),
});
export type AssignCustomerAxisPrimaryInput = z.infer<typeof assignCustomerAxisPrimarySchema>;

export const recordCustomerAxisNoAutoReassignSchema = z.object({
  attemptedMemberId: z.string().trim().min(1),
  source: z.string().trim().max(80).default('aircall.current_operator'),
  reason: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RecordCustomerAxisNoAutoReassignInput = z.infer<typeof recordCustomerAxisNoAutoReassignSchema>;

export const assignDefaultCustomerAxisSchema = z.object({
  axes: z.array(customerAssignmentAxisSchema).min(1).max(3).default(['sales', 'support', 'account']),
  limit: z.coerce.number().int().min(1).max(10000).default(10000),
  onlyMissing: z.boolean().default(true),
  source: z.string().trim().max(80).default('default_axis_backfill'),
  reason: z.string().trim().max(500).default('Default axis assignment backfill'),
});
export type AssignDefaultCustomerAxisInput = z.infer<typeof assignDefaultCustomerAxisSchema>;

export interface AssignDefaultCustomerAxisResponse {
  scanned: number;
  assigned: number;
  skippedExisting: number;
  skippedNoOwner: number;
  axes: CustomerAssignmentAxis[];
  missingOwnerAxes: CustomerAssignmentAxis[];
  owners: Record<CustomerAssignmentAxis, {
    id: string;
    email: string;
    name: string;
  } | null>;
}

export interface CustomerAxisAssignmentDto {
  id: string;
  customerId: string;
  axis: CustomerAssignmentAxis;
  memberId: string;
  memberName: string;
  memberEmail: string;
  isPrimary: boolean;
  source: string;
  reason: string | null;
  approvedByMemberId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAxisAssignmentAuditDto {
  id: string;
  customerId: string;
  axis: CustomerAssignmentAxis;
  action: 'primary_assigned' | 'auto_reassign_skipped' | string;
  previousMemberId: string | null;
  previousMemberName: string | null;
  newMemberId: string | null;
  newMemberName: string | null;
  actorMemberId: string | null;
  actorMemberName: string | null;
  source: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CustomerAxisAssignmentsResponse {
  customerId: string;
  assignments: CustomerAxisAssignmentDto[];
  audits: CustomerAxisAssignmentAuditDto[];
}

export const customerDetailTabSchema = z.enum([
  'profile',
  'shopify_orders',
  'aircall_calls',
  'support',
  'email',
  'messages',
  'notes',
  'tasks',
  'commission',
]);
export type CustomerDetailTab = z.infer<typeof customerDetailTabSchema>;

export const customerDetailCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  actorId: z.string().nullable(),
  actorType: z.string().nullable(),
  internal: z.boolean(),
  createdAt: z.string(),
});
export type CustomerDetailCommentDto = z.infer<typeof customerDetailCommentSchema>;

export const customerDetailPanelSchema = z.object({
  customer: z.object({
    id: z.string(),
    shopifyCustomerId: z.string().nullable(),
    companyName: z.string(),
    legalName: z.string().nullable(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    status: z.string(),
    tags: z.array(z.string()),
    note: z.string().nullable(),
    totalSpent: z.number(),
    ordersCount: z.number(),
    averageOrderValue: z.number(),
    lastOrderAt: z.string().nullable(),
    syncedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    billingAddress: z.unknown().nullable(),
    shippingAddress: z.unknown().nullable(),
    insight: z.object({
      lifecycle: z.string(),
      clvTier: z.string(),
      healthScore: z.number().nullable(),
      churnRisk: z.string(),
      daysSinceLastOrder: z.number().nullable(),
      purchaseFrequency: z.number().nullable(),
      projectedClv: z.number().nullable(),
      calculatedAt: z.string().nullable(),
    }),
    metrics: z.object({
      lifetimeRevenue: z.number(),
      ordersCount: z.number(),
      averageOrderValue: z.number(),
      openSupportCount: z.number(),
      openTaskCount: z.number(),
      callsCount: z.number(),
      emailsCount: z.number(),
      lastContactAt: z.string().nullable(),
    }),
    segments: z.array(z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      priority: z.number(),
      matchedAt: z.string(),
      score: z.number().nullable(),
      owners: z.array(z.object({
        id: z.string(),
        memberId: z.string(),
        memberName: z.string(),
        memberEmail: z.string(),
        importance: z.string(),
        priority: z.number(),
      })),
    })),
    assignments: z.array(z.object({
      id: z.string(),
      axis: z.string(),
      memberId: z.string(),
      memberName: z.string(),
      memberEmail: z.string(),
      source: z.string(),
      reason: z.string().nullable(),
      updatedAt: z.string(),
    })),
  }),
  visibleTabs: z.array(customerDetailTabSchema),
  tabs: z.object({
    profile: z.object({
      addresses: z.object({
        billing: z.unknown().nullable(),
        shipping: z.unknown().nullable(),
      }),
      tags: z.array(z.string()),
      rawNote: z.string().nullable(),
    }),
    shopifyOrders: z.array(z.object({
      id: z.string(),
      shopifyOrderId: z.string().nullable(),
      orderNumber: z.string().nullable(),
      totalPrice: z.number(),
      subtotal: z.number(),
      totalDiscounts: z.number(),
      totalTax: z.number(),
      totalShipping: z.number(),
      currency: z.string(),
      financialStatus: z.string().nullable(),
      fulfillmentStatus: z.string().nullable(),
      fulfillmentMode: z.string(),
      processedAt: z.string().nullable(),
      createdAt: z.string(),
      tags: z.array(z.string()),
      lineItems: z.unknown(),
      note: z.string().nullable(),
      shippingAddress: z.unknown().nullable(),
      billingAddress: z.unknown().nullable(),
      discountCodes: z.unknown().nullable(),
      fulfillments: z.unknown().nullable(),
      refunds: z.unknown().nullable(),
      designFiles: z.unknown(),
    })),
    aircallCalls: z.array(z.object({
      id: z.string(),
      externalCallId: z.string(),
      eventType: z.string(),
      eventTimestamp: z.string(),
      direction: z.string().nullable(),
      status: z.string().nullable(),
      durationSeconds: z.number().nullable(),
      contactPhone: z.string().nullable(),
      contactEmail: z.string().nullable(),
      hasRecording: z.boolean(),
      hasVoicemail: z.boolean(),
      hasTranscript: z.boolean(),
      transcriptPreview: z.string().nullable(),
      resolverStatus: z.string().nullable(),
      resolverSummary: z.string().nullable(),
      resolverIntent: z.string().nullable(),
      psychTags: z.array(z.string()),
    })),
    support: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      priority: z.string(),
      source: z.string(),
      surface: z.string(),
      axis: z.string().nullable(),
      assignedMemberName: z.string().nullable(),
      dueAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      comments: z.array(customerDetailCommentSchema),
    })),
    email: z.array(z.object({
      id: z.string(),
      eventKey: z.string(),
      category: z.string(),
      recipientEmail: z.string(),
      subject: z.string(),
      status: z.string(),
      provider: z.string().nullable(),
      preview: z.string().nullable(),
      errorMessage: z.string().nullable(),
      attemptCount: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
      sentAt: z.string().nullable(),
    })),
    messages: z.array(z.object({
      id: z.string(),
      title: z.string(),
      participants: z.array(z.string()),
      latestMessage: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      messages: z.array(customerDetailCommentSchema),
    })),
    notes: z.array(z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      kind: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      linkedQueueId: z.string().nullable(),
      authorMemberId: z.string().nullable(),
      authorMemberName: z.string().nullable().optional(),
      authorMemberEmail: z.string().nullable().optional(),
    })),
    tasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      priority: z.string(),
      source: z.string(),
      axis: z.string().nullable(),
      assignedMemberName: z.string().nullable(),
      matchedRuleId: z.string().nullable(),
      matchedRuleName: z.string().nullable(),
      dueAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })),
    commission: z.object({
      eligible: z.boolean(),
      lifetimeRevenue: z.number(),
      revenue30d: z.number(),
      orders30d: z.number(),
      projectedCommission: z.number(),
      note: z.string(),
    }).nullable(),
  }),
  generatedAt: z.string(),
});
export type CustomerDetailPanelDto = z.infer<typeof customerDetailPanelSchema>;

export const discountTypeSchema = z.enum(['percentage', 'fixed_amount', 'fixed_price', 'qty_break']);
export type DiscountType = z.infer<typeof discountTypeSchema>;

export const targetTypeSchema = z.enum([
  'all',
  'customer',
  'customer_user',
  'customer_group',
  'customer_role',
  'customer_tag',
  'segment',
  'buyer_intent',
  'anonymous',
]);
export type TargetType = z.infer<typeof targetTypeSchema>;

export const scopeTypeSchema = z.enum(['all', 'products', 'collections', 'tags', 'variants']);
export type ScopeType = z.infer<typeof scopeTypeSchema>;

export const pricingExecutionModeSchema = z.enum(['native_basic', 'shopify_function', 'draft_order', 'display_only']);
export type PricingExecutionMode = z.infer<typeof pricingExecutionModeSchema>;

export const pricingRuleSyncStateSchema = z.enum(['not_applicable', 'pending', 'syncing', 'synced', 'failed', 'disabled']);
export type PricingRuleSyncState = z.infer<typeof pricingRuleSyncStateSchema>;

export const qtyBreakSchema = z.object({
  minQty: z.coerce.number().int().min(1),
  value: z.coerce.number().min(0),
  type: discountTypeSchema.exclude(['qty_break']).default('percentage'),
});
export type QtyBreakInput = z.infer<typeof qtyBreakSchema>;

export const pricingRuleBaseSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  targetType: targetTypeSchema.default('all'),
  targetCustomerId: z.string().trim().optional(),
  targetCustomerUserId: z.string().trim().optional(),
  targetCustomerGroup: z.string().trim().optional(),
  targetShopifyCustomerId: z.string().trim().optional(),
  targetTags: z.array(z.string().trim()).default([]),
  scopeType: scopeTypeSchema.default('all'),
  scopeProductIds: z.array(z.string().trim()).default([]),
  scopeCollectionIds: z.array(z.string().trim()).default([]),
  scopeTags: z.array(z.string().trim()).default([]),
  scopeVariantIds: z.array(z.string().trim()).default([]),
  discountType: discountTypeSchema,
  discountValue: z.coerce.number().min(0).optional(),
  discountPercentage: z.coerce.number().min(0).max(100).optional(),
  qtyBreaks: z.array(qtyBreakSchema).default([]),
  minCartAmount: z.coerce.number().min(0).optional(),
  discountPolicy: z.enum(['best', 'stack']).default('best'),
  priority: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  executionMode: pricingExecutionModeSchema.default('draft_order'),
});

export const createPricingRuleSchema = pricingRuleBaseSchema.superRefine((value, context) => {
  if (value.discountType === 'percentage' && value.discountPercentage === undefined) {
    context.addIssue({ code: 'custom', path: ['discountPercentage'], message: 'Discount percentage is required' });
  }
  if (['fixed_amount', 'fixed_price'].includes(value.discountType) && value.discountValue === undefined) {
    context.addIssue({ code: 'custom', path: ['discountValue'], message: 'Discount value is required' });
  }
  if (value.discountType === 'qty_break' && value.qtyBreaks.length === 0) {
    context.addIssue({ code: 'custom', path: ['qtyBreaks'], message: 'At least one quantity break is required' });
  }
});
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = pricingRuleBaseSchema.partial().superRefine((value, context) => {
  if (value.discountType === 'percentage' && value.discountPercentage === undefined && value.discountValue === undefined) {
    context.addIssue({ code: 'custom', path: ['discountPercentage'], message: 'Discount percentage is required' });
  }
  if (value.discountType === 'qty_break' && value.qtyBreaks !== undefined && value.qtyBreaks.length === 0) {
    context.addIssue({ code: 'custom', path: ['qtyBreaks'], message: 'At least one quantity break is required' });
  }
});
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

export const togglePricingRuleSchema = z.object({
  isActive: z.boolean(),
});
export type TogglePricingRuleInput = z.infer<typeof togglePricingRuleSchema>;

export const pricingRulesQuerySchema = pageQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
  syncState: pricingRuleSyncStateSchema.optional(),
  executionMode: pricingExecutionModeSchema.optional(),
});
export type PricingRulesQuery = z.infer<typeof pricingRulesQuerySchema>;

export const calculatePricingItemSchema = z.object({
  variantId: z.string().trim().optional(),
  shopifyVariantId: z.string().trim().optional(),
  productId: z.string().trim().optional(),
  shopifyProductId: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  tags: z.array(z.string().trim()).default([]),
  quantity: z.coerce.number().int().min(1),
  basePrice: z.coerce.number().min(0).optional(),
});
export type CalculatePricingItemInput = z.infer<typeof calculatePricingItemSchema>;

export const calculatePricesSchema = z.object({
  customerId: z.string().trim().optional(),
  customerUserId: z.string().trim().optional(),
  customerTags: z.array(z.string().trim()).default([]),
  customerRoleKeys: z.array(z.string().trim()).default([]),
  customerSegmentKeys: z.array(z.string().trim()).default([]),
  cartTotal: z.coerce.number().min(0).optional(),
  items: z.array(calculatePricingItemSchema).min(1),
});
export type CalculatePricesInput = z.infer<typeof calculatePricesSchema>;
