import type {
  AccountAddressInput,
  AccountCartAddItemInput,
  AccountCartCheckoutInput,
  AccountCartCreateInput,
  AccountDocumentCategory,
  AccountDocumentListQuery,
  AccountInvoiceDownloadAction,
  AccountInvoiceListQuery,
  AccountInvoicePayAction,
  AccountOrderListQuery,
  AccountSupportCloseInput,
  AccountSupportReopenInput,
  AccountSupportReplyInput,
  CreateAccountSupportTicketInput,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
} from '@factory-engine-pro/contracts';
import { accountsApi } from '@/lib/api';

export type AddressType = 'shipping' | 'billing';
export type AccountAddress = AccountAddressInput;

export type BuyerOrderLineItem = { id: string; sku: string; name: string; qty: number; unitPriceUsd: number; canReorder: boolean; reason: string };
export type BuyerOrder = {
  id: string;
  orderNumber: string;
  placedAt: string;
  placedBy: string;
  status: OrderStatusValue;
  totalUsd: number;
  currency: string;
  fulfillmentStatus: string | null;
  financialStatus: string | null;
  canReorder: boolean;
  itemsCount: number;
  items: BuyerOrderLineItem[];
};
export type OrderStatusValue = 'pending' | 'paid' | 'fulfilled' | 'cancelled';

export type BuyerListMeta = {
  count: number;
  pageCount: number;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
};

export type BuyerPage<T> = {
  data: T[];
  meta: BuyerListMeta;
};

export type BuyerOrderDetailLineItem = BuyerOrderLineItem & {
  variantTitle: string | null;
  lineTotalUsd: number;
  reorderReason: string;
  properties: Array<{ name: string; value: string }>;
  designFiles: Array<{ id: string; name: string; url: string | null; sku: string | null }>;
};

export type BuyerOrderDetail = Omit<BuyerOrder, 'items'> & {
  subtotalUsd: number;
  taxUsd: number;
  shippingUsd: number;
  discountsUsd: number;
  refundedUsd: number;
  tags: string[];
  notes: string | null;
  shippingAddress: PortalAddressDisplay | null;
  billingAddress: PortalAddressDisplay | null;
  tracking: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string };
  designFiles: Array<{ id: string; name: string; url: string | null; sku: string | null }>;
  items: BuyerOrderDetailLineItem[];
  pickup: { id: string; status: string; qrPayload: string; shelfCode: string | null } | null;
};

export type PortalAddressDisplay = {
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  formatted: string;
};

export type ReorderTemplate = {
  id: string;
  orderId: string;
  name: string;
  useCount: number;
  lastUsedAt: string | null;
  items: BuyerOrder['items'];
  canReorder: boolean;
};

export type ReorderResult = {
  cartId: string;
  originOrderId: string;
  action: 'checkout' | 'review_portal_cart' | 'unavailable';
  message: string;
  checkoutUrl: string | null;
  checkoutError: string | null;
  resolvedCount: number;
  skippedCount: number;
  items: Array<{ id: string; sku: string; name: string; qty: number; unitPriceUsd: number; lineTotalUsd: number; reorderable: boolean; reason: string }>;
};

export type BuyerCartItem = {
  id: string;
  originOrderId: string | null;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  listPriceUsd: number;
  unitPriceUsd: number;
  discountUsd: number;
  pricingLabel: string | null;
  lineTotalUsd: number;
  reorderable: boolean;
  reason: string;
  properties: Array<{ name: string; value: string }>;
  designFiles: Array<{ id: string; name: string; url: string | null }>;
};

export type BuyerCartActivity = {
  id: string;
  action: string;
  label: string;
  detail: string | null;
  actorType: string;
  createdAt: string;
};

export type BuyerCart = {
  id: string;
  status: 'review_required' | 'unavailable' | 'checkout_ready' | string;
  originOrderId: string | null;
  originOrderNumber: string | null;
  currency: string;
  subtotalUsd: number;
  totalUsd: number;
  itemCount: number;
  checkoutUrl: string | null;
  checkoutError: string | null;
  checkoutAction: 'checkout' | 'review_cart' | 'unavailable';
  createdAt: string;
  updatedAt: string;
  items: BuyerCartItem[];
  activities: BuyerCartActivity[];
};

export type BuyerCartCheckoutResult = {
  action: 'checkout' | 'review_cart' | 'account_review' | 'unavailable';
  message: string;
  checkoutUrl: string | null;
  checkoutError: string | null;
  cart: BuyerCart;
};

export type BuyerProduct = {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  vendor: string;
  listPriceUsd: number;
  yourPriceUsd: number;
  discountUsd?: number;
  pricingLabel?: string | null;
  inStock: boolean;
  inventoryQuantity: number | null;
  imageUrl: string | null;
  imageBg: string;
};

export type TrackingOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: 'pending' | 'in_transit' | 'delivered';
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  shippingAddress: string;
  steps: Array<{ key: string; label: string; done: boolean; at: string | null }>;
};

export type PickupOrder = {
  id: string;
  orderNumber: string;
  status: 'in_production' | 'ready_for_pickup' | 'picked_up';
  placedAt: string;
  shelfCode: string | null;
  pickupBy: string | null;
  qrPayload: string;
  designFiles: Array<{ id: string; name: string; previewUrl: string }>;
  steps: Array<{ key: string; label: string; done: boolean; at: string | null }>;
};

export type BuyerInvoice = {
  id: string;
  orderId: string | null;
  invoiceNumber: string;
  orderNumber: string | null;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  totalUsd: number;
  paidUsd: number;
  balanceUsd: number;
  hasFile: boolean;
  canPay: boolean;
};
export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue' | 'partial';

export type BuyerInvoiceDetail = BuyerInvoice & {
  subtotalUsd: number;
  discountUsd: number;
  shippingUsd: number;
  taxUsd: number;
  currency: string;
  notes: string | null;
  fileUrl: string | null;
  payment: { state: string; amountDue: number; url: string | null; label: string };
  items: Array<{ id: string; sku: string | null; name: string; quantity: number; unitPriceUsd: number; totalUsd: number }>;
  payments: Array<{ id: string; amountUsd: number; method: string; recordedAt: string }>;
  activities: Array<{ id: string; label: string; detail: string; createdAt: string }>;
};

export type BuyerInvoiceDownloadAction = AccountInvoiceDownloadAction;
export type BuyerInvoicePayAction = AccountInvoicePayAction;

export type DocumentCategory = AccountDocumentCategory;
export type BuyerDocument = {
  id: string;
  name: string;
  category: DocumentCategory;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string;
  uploadedBy: string;
  documentKind: 'account_file' | 'invoice_file' | 'order_design_file';
  addedAs: string;
  relatedLabel: string | null;
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  downloadMode: 'api' | 'url';
  downloadUrl: string | null;
};

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'billing' | 'shipping' | 'product' | 'account' | 'other';
export type SupportTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  relatedTo: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  updatedAtIso: string;
  firstResponseMinutes: number | null;
  responses: Array<{ id: string; author: string; at: string; atIso: string; body: string; fromMe: boolean }>;
  satisfactionRating: number | null;
};

export type BuyerProfile = {
  id: string;
  type: 'customer_user' | 'sub_user';
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  role: string;
  company: string;
  companyName: string;
  customerId: string;
  taxId: string | null;
  ordersCount: number;
  quotesCount: number;
  totalSpentUsd: number;
  spendingLimitCents: number | null;
  spendingUsedCents: number;
  addresses: AccountAddress[];
  taxExemption: {
    status: string;
    expiresAt: string;
    daysRemaining: number;
    warningSentAt: string | null;
    expiredAt: string | null;
    purchasingRestricted: boolean;
    syncPending: boolean;
    warningMessage: string | null;
  } | null;
  taxExemptionRenewal: {
    requestId: string;
    submittedAt: string;
    expiresAt: string | null;
    status: 'pending';
  } | null;
};

export function fetchAccountAddresses() {
  return accountsApi.accountAddresses() as Promise<AccountAddress[]>;
}

export function saveAccountAddress(input: AccountAddress) {
  return accountsApi.saveAccountAddress(input) as Promise<AccountAddress | null>;
}

export function deleteAccountAddress(idOrType: string) {
  const type = idOrType === 'billing' ? 'billing' : 'shipping';
  return accountsApi.deleteAccountAddress(type) as Promise<{ ok: true }>;
}

export function fetchBuyerOrders(query: Partial<AccountOrderListQuery> = {}) {
  return accountsApi.accountOrders(query) as Promise<BuyerPage<BuyerOrder>>;
}

export function fetchBuyerOrder(id: string) {
  return accountsApi.accountOrder(id) as Promise<BuyerOrderDetail>;
}

export function reorderOrder(id: string, quantity?: number) {
  return accountsApi.accountOrderReorder(id, quantity ? { quantity } : {}) as Promise<ReorderResult>;
}

export function reorderLineItem(orderId: string, lineItemId: string, quantity?: number) {
  return accountsApi.accountOrderLineItemReorder(orderId, lineItemId, quantity ? { quantity } : {}) as Promise<ReorderResult>;
}

export function fetchActiveCart() {
  return accountsApi.accountActiveCart() as Promise<BuyerCart | null>;
}

export function createCart(input: AccountCartCreateInput = {}) {
  return accountsApi.accountCreateCart(input) as Promise<BuyerCart>;
}

export function addCartItem(cartId: string, input: AccountCartAddItemInput) {
  return accountsApi.accountCartAddItem(cartId, input) as Promise<BuyerCart>;
}

export function updateCartItem(cartId: string, itemId: string, quantity: number) {
  return accountsApi.accountCartUpdateItem(cartId, itemId, { quantity }) as Promise<BuyerCart>;
}

export function removeCartItem(cartId: string, itemId: string) {
  return accountsApi.accountCartRemoveItem(cartId, itemId) as Promise<BuyerCart>;
}

export function checkoutCart(cartId: string, input: AccountCartCheckoutInput = {}) {
  return accountsApi.accountCartCheckout(cartId, input) as Promise<BuyerCartCheckoutResult>;
}

export function fetchReorderTemplates() {
  return accountsApi.accountReorderTemplates() as Promise<ReorderTemplate[]>;
}

export function fetchBuyerProducts() {
  return accountsApi.accountProducts() as Promise<BuyerProduct[]>;
}

export function fetchTrackingOrders() {
  return accountsApi.accountTracking() as Promise<TrackingOrder[]>;
}

export function fetchPickups() {
  return accountsApi.accountPickups() as Promise<PickupOrder[]>;
}

export function fetchInvoices(query: Partial<AccountInvoiceListQuery> = {}) {
  return accountsApi.accountInvoices(query) as Promise<BuyerPage<BuyerInvoice>>;
}

export function fetchInvoice(id: string) {
  return accountsApi.accountInvoice(id) as Promise<BuyerInvoiceDetail>;
}

export function downloadInvoice(id: string) {
  return accountsApi.accountInvoiceDownload(id) as Promise<BuyerInvoiceDownloadAction>;
}

export function payInvoice(id: string) {
  return accountsApi.accountInvoicePay(id) as Promise<BuyerInvoicePayAction>;
}

export function openAccountActionUrl(url: string) {
  const baseUrl = import.meta.env.VITE_API_URL ?? window.location.origin;
  const resolved = /^https?:\/\//i.test(url) ? url : new URL(url, baseUrl).toString();
  window.open(resolved, '_blank', 'noopener,noreferrer');
}

export function fetchDocuments(query: Partial<AccountDocumentListQuery> = {}) {
  return accountsApi.accountDocuments(query) as Promise<BuyerPage<BuyerDocument>>;
}

export async function downloadDocument(doc: BuyerDocument) {
  if (doc.downloadMode === 'url' && doc.downloadUrl) {
    openAccountActionUrl(doc.downloadUrl);
    return;
  }
  const blob = await accountsApi.accountDocumentDownload(doc.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = doc.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function fetchProfile() {
  return accountsApi.accountProfile() as Promise<BuyerProfile>;
}

export function saveProfile(input: UpdateAccountProfileInput) {
  return accountsApi.updateAccountProfile(input) as Promise<BuyerProfile>;
}

export function updateAccountPassword(input: UpdateAccountPasswordInput) {
  return accountsApi.updateAccountPassword(input) as Promise<{ ok: true }>;
}

export function submitTaxExemptionRenewal(expiresAt: string, certificate: File) {
  return accountsApi.submitAccountTaxExemptionRenewal(expiresAt, certificate);
}

export function fetchSupportTickets() {
  return accountsApi.accountSupportTickets() as Promise<SupportTicket[]>;
}

export function createSupportTicket(input: {
  category: TicketCategory;
  subject: string;
  priority: TicketPriority;
  relatedTo: string;
  description: string;
}) {
  const payload: CreateAccountSupportTicketInput = {
    category: input.category,
    subject: input.subject,
    priority: input.priority,
    description: input.description,
    ...(input.relatedTo.trim() ? { relatedTo: input.relatedTo.trim() } : {}),
  };
  return accountsApi.createAccountSupportTicket(payload) as Promise<SupportTicket>;
}

export function replySupportTicket(id: string, input: AccountSupportReplyInput) {
  return accountsApi.replyAccountSupportTicket(id, input) as Promise<SupportTicket>;
}

export function closeSupportTicket(id: string, input: AccountSupportCloseInput = {}) {
  return accountsApi.closeAccountSupportTicket(id, input) as Promise<SupportTicket>;
}

export function reopenSupportTicket(id: string, input: AccountSupportReopenInput = {}) {
  return accountsApi.reopenAccountSupportTicket(id, input) as Promise<SupportTicket>;
}

export function uniqueVendors(products: BuyerProduct[]) {
  return Array.from(new Set(products.map((product) => product.vendor).filter(Boolean))).sort();
}
