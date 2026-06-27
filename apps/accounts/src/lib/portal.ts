import type {
  AccountAddressInput,
  CreateAccountSupportTicketInput,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
} from '@factory-engine-pro/contracts';
import { accountsApi } from '@/lib/api';

export type AddressType = 'shipping' | 'billing';
export type AccountAddress = AccountAddressInput;

export type BuyerOrder = {
  id: string;
  orderNumber: string;
  placedAt: string;
  placedBy: string;
  status: OrderStatusValue;
  totalUsd: number;
  itemsCount: number;
  items: Array<{ sku: string; name: string; qty: number; unitPriceUsd: number }>;
};
export type OrderStatusValue = 'pending' | 'paid' | 'fulfilled' | 'cancelled';

export type ReorderTemplate = {
  id: string;
  name: string;
  useCount: number;
  lastUsedAt: string | null;
  items: BuyerOrder['items'];
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
  orderId: string;
  invoiceNumber: string;
  orderNumber: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  totalUsd: number;
  paidUsd: number;
};
export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue' | 'partial';

export type DocumentCategory = 'contract' | 'certificate' | 'tax' | 'license' | 'other';
export type BuyerDocument = {
  id: string;
  name: string;
  category: DocumentCategory;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  requestId: string;
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
  updatedAt: string;
  responses: Array<{ id: string; author: string; at: string; body: string; fromMe: boolean }>;
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

export function fetchBuyerOrders() {
  return accountsApi.accountOrders() as Promise<BuyerOrder[]>;
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

export function fetchInvoices() {
  return accountsApi.accountInvoices() as Promise<BuyerInvoice[]>;
}

export function fetchDocuments() {
  return accountsApi.accountDocuments() as Promise<BuyerDocument[]>;
}

export async function downloadDocument(doc: BuyerDocument) {
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
  return accountsApi.updateAccountPassword(input) as Promise<{ ok: true; request_id: string }>;
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

export function uniqueVendors(products: BuyerProduct[]) {
  return Array.from(new Set(products.map((product) => product.vendor).filter(Boolean))).sort();
}
