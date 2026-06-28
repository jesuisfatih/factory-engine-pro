import { z } from 'zod';
import { pageQuerySchema } from './common.js';
import { taskAxisSchema } from './operations.js';

export const fulfillmentModeSchema = z.enum(['pickup', 'shipping', 'local_delivery', 'unknown']);
export type FulfillmentMode = z.infer<typeof fulfillmentModeSchema>;

export const orderSurfaceSchema = z.enum(['all', 'pickup', 'design_files']);
export type OrderSurface = z.infer<typeof orderSurfaceSchema>;

export const orderListQuerySchema = pageQuerySchema.extend({
  surface: orderSurfaceSchema.default('all'),
  status: z.string().trim().optional(),
  financialStatus: z.string().trim().optional(),
  fulfillmentStatus: z.string().trim().optional(),
  fulfillmentMode: fulfillmentModeSchema.optional(),
  customerId: z.string().trim().optional(),
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

export const customerCommerceQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().optional(),
  segment: z.string().trim().optional(),
  churnRisk: z.string().trim().optional(),
  tag: z.string().trim().optional(),
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

export const discountTypeSchema = z.enum(['percentage', 'fixed_amount', 'fixed_price', 'qty_break']);
export type DiscountType = z.infer<typeof discountTypeSchema>;

export const targetTypeSchema = z.enum([
  'all',
  'customer',
  'customer_user',
  'customer_group',
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
  cartTotal: z.coerce.number().min(0).optional(),
  items: z.array(calculatePricingItemSchema).min(1),
});
export type CalculatePricesInput = z.infer<typeof calculatePricesSchema>;
