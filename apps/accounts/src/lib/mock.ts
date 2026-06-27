const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

/* ─── Addresses ─────────────────────────────────────────── */
export type AddressType = 'shipping' | 'billing';
export interface AccountAddress {
  id: string;
  type: AddressType;
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

const ADDRESSES: AccountAddress[] = [
  { id: 'addr1', type: 'shipping', firstName: 'Linda', lastName: 'Anderson', company: 'DTF Bank HQ', address1: '4318 Industrial Blvd', address2: 'Suite 200', city: 'Houston', province: 'TX', zip: '77072', country: 'US', phone: '+1 281-555-0124', isDefault: true },
  { id: 'addr2', type: 'shipping', firstName: 'Charlette', lastName: 'Lee', company: 'DTF Bank — West Warehouse', address1: '120 Pacific Way', address2: '', city: 'Sacramento', province: 'CA', zip: '95814', country: 'US', phone: '+1 916-555-0188', isDefault: false },
  { id: 'addr3', type: 'billing', firstName: 'Accounts Payable', lastName: '', company: 'DTF Bank Inc.', address1: 'PO Box 8821', address2: '', city: 'Houston', province: 'TX', zip: '77001', country: 'US', phone: '+1 281-555-0199', isDefault: true },
  { id: 'addr4', type: 'shipping', firstName: 'Sam', lastName: 'Reyes', company: 'DTF Bank — Trade Show Pickup', address1: '1421 Convention Center Way', address2: 'Booth A-12', city: 'Las Vegas', province: 'NV', zip: '89109', country: 'US', phone: '+1 702-555-0163', isDefault: false },
];

export async function fetchAccountAddresses(): Promise<AccountAddress[]> {
  await delay(160);
  return ADDRESSES.map((address) => ({ ...address }));
}

export async function saveAccountAddress(input: AccountAddress): Promise<AccountAddress> {
  await delay(180);
  const idx = ADDRESSES.findIndex((address) => address.id === input.id);
  const next: AccountAddress = { ...input };
  if (idx >= 0) ADDRESSES[idx] = next;
  else ADDRESSES.push(next);
  if (next.isDefault) {
    for (const address of ADDRESSES) {
      if (address.id !== next.id && address.type === next.type) address.isDefault = false;
    }
  }
  return { ...next };
}

export async function deleteAccountAddress(id: string): Promise<void> {
  await delay(120);
  const idx = ADDRESSES.findIndex((address) => address.id === id);
  if (idx >= 0) ADDRESSES.splice(idx, 1);
}

/* ─── Support tickets ───────────────────────────────────── */
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'billing' | 'shipping' | 'product' | 'account' | 'other';

export interface TicketReply { id: string; author: string; fromMe: boolean; at: string; body: string; }
export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  relatedTo: string | null;
  createdAt: string;
  updatedAt: string;
  description: string;
  responses: TicketReply[];
  satisfactionRating: number | null;
}

const SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 'sr1', ticketNumber: 'SR-4421', subject: 'Damaged film roll on shipment #48201',
    category: 'shipping', priority: 'high', status: 'in_progress',
    relatedTo: 'Order #48201', createdAt: '2026-06-25 09:14', updatedAt: '2026-06-26 14:02',
    description: 'Two of the rolls in the 200pc shipment arrived with crushed cores. Photos attached. Need replacements before our run next Tuesday.',
    responses: [
      { id: 'rp1', author: 'Aisha Khan (DTF Bank Support)', fromMe: false, at: '2026-06-25 10:11', body: 'Thanks for the photos — escalating to logistics. Carrier claim opened (CL-99214). Replacements should ship within 48h.' },
      { id: 'rp2', author: 'You', fromMe: true, at: '2026-06-25 11:00', body: 'Appreciated. Please confirm tracking once it ships.' },
    ],
    satisfactionRating: null,
  },
  {
    id: 'sr2', ticketNumber: 'SR-4408', subject: 'Wrong invoice total on inv #INV-2030',
    category: 'billing', priority: 'normal', status: 'open',
    relatedTo: 'Invoice INV-2030', createdAt: '2026-06-23 16:33', updatedAt: '2026-06-23 16:33',
    description: 'The line for "TPU powder 1kg" shows 12 units but we only received 10. Could you adjust and reissue?',
    responses: [],
    satisfactionRating: null,
  },
  {
    id: 'sr3', ticketNumber: 'SR-4392', subject: 'Add Olivia to account as Buyer',
    category: 'account', priority: 'low', status: 'resolved',
    relatedTo: null, createdAt: '2026-06-19 08:02', updatedAt: '2026-06-19 14:48',
    description: 'Need to add olivia@dtfbank.com to the account as a Buyer with $5,000 monthly cap.',
    responses: [
      { id: 'rp3', author: 'Marcus Bell (DTF Bank Accounts)', fromMe: false, at: '2026-06-19 14:48', body: 'Added with the $5,000 cap. She received the activation email.' },
    ],
    satisfactionRating: 5,
  },
  {
    id: 'sr4', ticketNumber: 'SR-4350', subject: 'Product page pricing wrong for VIP tier',
    category: 'product', priority: 'normal', status: 'closed',
    relatedTo: 'Product DTF-Film-22in', createdAt: '2026-06-11 13:21', updatedAt: '2026-06-14 09:15',
    description: 'Catalog shows list price when I should be seeing the VIP 12% off rate.',
    responses: [
      { id: 'rp4', author: 'Sam Reyes (Sales)', fromMe: false, at: '2026-06-12 10:01', body: 'Pricing engine cache cleared. You should see the VIP tier on refresh.' },
      { id: 'rp5', author: 'You', fromMe: true, at: '2026-06-14 09:15', body: 'Confirmed — all good.' },
    ],
    satisfactionRating: 4,
  },
];

const SUPPORT_FAQS: { question: string; answer: string }[] = [
  { question: 'How long does a shipping claim take?', answer: 'Carrier claims are usually resolved within 5–7 business days. We ship replacements upfront if the order is time-sensitive.' },
  { question: 'Can I change a billing address mid-cycle?', answer: 'Yes — update it on the Addresses page. Open invoices stay on the previous address; only new invoices use the new one.' },
  { question: 'What does the “VIP tier” require?', answer: 'A rolling 12-month spend above $30k. Tier reviews run on the 1st of each month.' },
];

export async function fetchSupportTickets(): Promise<SupportTicket[]> {
  await delay(150);
  return SUPPORT_TICKETS.map((ticket) => ({ ...ticket, responses: ticket.responses.map((response) => ({ ...response })) }));
}

export async function fetchSupportFaqs() {
  await delay(80);
  return SUPPORT_FAQS.map((entry) => ({ ...entry }));
}

export interface NewTicketInput {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  relatedTo: string;
  description: string;
}

export async function createSupportTicket(input: NewTicketInput): Promise<SupportTicket> {
  await delay(200);
  const next: SupportTicket = {
    id: `sr-${Date.now()}`,
    ticketNumber: `SR-${4500 + SUPPORT_TICKETS.length}`,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    status: 'open',
    relatedTo: input.relatedTo || null,
    createdAt: 'just now',
    updatedAt: 'just now',
    description: input.description,
    responses: [],
    satisfactionRating: null,
  };
  SUPPORT_TICKETS.unshift(next);
  return { ...next, responses: [] };
}

/* ─── Team members ──────────────────────────────────────── */
export type TeamMemberRole = 'owner' | 'admin' | 'buyer' | 'viewer';
export type TeamMemberStatus = 'active' | 'pending' | 'suspended';

export interface TeamMemberAuditEntry { id: string; at: string; label: string; }
export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  spendingCapUsd: number | null;
  spendingUsedUsd: number;
  ordersCount: number;
  quotesCount: number;
  totalValueUsd: number;
  joinedAt: string;
  lastActiveAt: string;
  audit: TeamMemberAuditEntry[];
}

const TEAM_MEMBERS: TeamMember[] = [
  { id: 'tm1', firstName: 'Linda', lastName: 'Anderson', email: 'linda@dtfbank.com', phone: '+1 469-555-0142', role: 'owner', status: 'active', spendingCapUsd: null, spendingUsedUsd: 18420, ordersCount: 42, quotesCount: 7, totalValueUsd: 84200, joinedAt: '2025-04-12', lastActiveAt: '2026-06-27 14:21', audit: [
    { id: 'a1', at: '2026-06-26 09:14', label: 'Approved quote #QT-2031 for $8,420' },
    { id: 'a2', at: '2026-06-25 10:02', label: 'Updated billing address for the account' },
    { id: 'a3', at: '2026-06-24 16:32', label: 'Invited Olivia Park as Buyer' },
  ]},
  { id: 'tm2', firstName: 'Charlette', lastName: 'Lee', email: 'charlette@dtfbank.com', phone: '+1 469-555-0184', role: 'admin', status: 'active', spendingCapUsd: 25000, spendingUsedUsd: 11420, ordersCount: 28, quotesCount: 4, totalValueUsd: 41200, joinedAt: '2025-06-02', lastActiveAt: '2026-06-26 18:42', audit: [
    { id: 'b1', at: '2026-06-26 10:11', label: 'Placed bulk order #48199' },
    { id: 'b2', at: '2026-06-25 14:33', label: 'Adjusted spending cap for Sam Reyes' },
  ]},
  { id: 'tm3', firstName: 'Sam', lastName: 'Reyes', email: 'sam@dtfbank.com', phone: '+1 469-555-0119', role: 'buyer', status: 'active', spendingCapUsd: 8000, spendingUsedUsd: 6420, ordersCount: 18, quotesCount: 11, totalValueUsd: 22480, joinedAt: '2025-09-22', lastActiveAt: '2026-06-26 11:02', audit: [
    { id: 'c1', at: '2026-06-26 11:02', label: 'Placed order #48174' },
  ]},
  { id: 'tm4', firstName: 'Olivia', lastName: 'Park', email: 'olivia@dtfbank.com', phone: '+1 469-555-0166', role: 'buyer', status: 'active', spendingCapUsd: 5000, spendingUsedUsd: 1200, ordersCount: 4, quotesCount: 2, totalValueUsd: 3400, joinedAt: '2026-06-19', lastActiveAt: '2026-06-26 14:48', audit: [
    { id: 'd1', at: '2026-06-19 14:48', label: 'Joined the account' },
  ]},
  { id: 'tm5', firstName: 'Marcus', lastName: 'Bell', email: 'marcus@dtfbank.com', phone: '+1 469-555-0177', role: 'viewer', status: 'active', spendingCapUsd: 0, spendingUsedUsd: 0, ordersCount: 0, quotesCount: 0, totalValueUsd: 0, joinedAt: '2025-11-04', lastActiveAt: '2026-06-25 17:33', audit: [
    { id: 'e1', at: '2026-06-25 17:33', label: 'Exported commission report' },
  ]},
  { id: 'tm6', firstName: 'Aisha', lastName: 'Khan', email: 'aisha@dtfbank.com', phone: '+1 469-555-0103', role: 'admin', status: 'pending', spendingCapUsd: 15000, spendingUsedUsd: 0, ordersCount: 0, quotesCount: 0, totalValueUsd: 0, joinedAt: '2026-06-27', lastActiveAt: '—', audit: [
    { id: 'f1', at: '2026-06-27 08:14', label: 'Invitation sent — pending activation' },
  ]},
];

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  await delay(180);
  return TEAM_MEMBERS.map((member) => ({ ...member, audit: member.audit.map((entry) => ({ ...entry })) }));
}

export async function saveTeamMember(input: TeamMember): Promise<TeamMember> {
  await delay(160);
  const idx = TEAM_MEMBERS.findIndex((member) => member.id === input.id);
  const next: TeamMember = { ...input, audit: input.audit.map((entry) => ({ ...entry })) };
  if (idx >= 0) TEAM_MEMBERS[idx] = next;
  else TEAM_MEMBERS.push(next);
  return { ...next, audit: next.audit.map((entry) => ({ ...entry })) };
}

export async function removeTeamMember(id: string): Promise<void> {
  await delay(140);
  const idx = TEAM_MEMBERS.findIndex((member) => member.id === id);
  if (idx >= 0) TEAM_MEMBERS.splice(idx, 1);
}

/* ─── Profile ───────────────────────────────────────────── */
export interface BuyerProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  company: string;
  joinedAt: string;
  ordersCount: number;
  quotesCount: number;
  totalSpentUsd: number;
  notifyOrderUpdates: boolean;
  notifyQuoteAlerts: boolean;
  notifyTeamActivity: boolean;
  notifyPromotions: boolean;
  notifyWeeklyDigest: boolean;
}

const PROFILE: BuyerProfile = {
  firstName: 'Linda',
  lastName: 'Anderson',
  email: 'linda@dtfbank.com',
  phone: '+1 469-555-0142',
  role: 'Owner',
  company: 'DTF Bank Inc.',
  joinedAt: '2025-04-12',
  ordersCount: 42,
  quotesCount: 7,
  totalSpentUsd: 84200,
  notifyOrderUpdates: true,
  notifyQuoteAlerts: true,
  notifyTeamActivity: true,
  notifyPromotions: false,
  notifyWeeklyDigest: true,
};

export async function fetchProfile(): Promise<BuyerProfile> {
  await delay(140);
  return { ...PROFILE };
}

export async function saveProfile(input: Partial<BuyerProfile>): Promise<BuyerProfile> {
  await delay(180);
  Object.assign(PROFILE, input);
  return { ...PROFILE };
}

/* ─── Orders ────────────────────────────────────────────── */
export type OrderStatusValue = 'pending' | 'paid' | 'fulfilled' | 'cancelled';
export interface OrderLineItem { sku: string; name: string; qty: number; unitPriceUsd: number; }
export interface BuyerOrder {
  id: string;
  orderNumber: string;
  status: OrderStatusValue;
  placedAt: string;
  itemsCount: number;
  totalUsd: number;
  items: OrderLineItem[];
  placedBy: string;
}

const ORDERS: BuyerOrder[] = [
  { id: 'o1', orderNumber: '#48201', status: 'pending', placedAt: '2026-06-26', itemsCount: 4, totalUsd: 1824.50, placedBy: 'Linda Anderson', items: [
    { sku: 'DTF-FILM-22', name: 'DTF Film 22"', qty: 100, unitPriceUsd: 12 },
    { sku: 'TPU-PWD-1KG', name: 'TPU Powder 1kg', qty: 12, unitPriceUsd: 38 },
  ]},
  { id: 'o2', orderNumber: '#48199', status: 'paid', placedAt: '2026-06-26', itemsCount: 12, totalUsd: 4980.00, placedBy: 'Charlette Lee', items: [
    { sku: 'DTF-FILM-22', name: 'DTF Film 22"', qty: 200, unitPriceUsd: 12 },
    { sku: 'DTF-ADH-500', name: 'DTF Adhesive 500ml', qty: 24, unitPriceUsd: 28 },
  ]},
  { id: 'o3', orderNumber: '#48195', status: 'pending', placedAt: '2026-06-25', itemsCount: 2, totalUsd: 312.00, placedBy: 'Robert Hopkins', items: [
    { sku: 'DTF-FILM-13', name: 'DTF Film 13"', qty: 24, unitPriceUsd: 13 },
  ]},
  { id: 'o4', orderNumber: '#48190', status: 'fulfilled', placedAt: '2026-06-25', itemsCount: 3, totalUsd: 612.20, placedBy: 'Sam Reyes', items: [
    { sku: 'TPU-PWD-500', name: 'TPU Powder 500g', qty: 18, unitPriceUsd: 24 },
  ]},
  { id: 'o5', orderNumber: '#48186', status: 'fulfilled', placedAt: '2026-06-24', itemsCount: 6, totalUsd: 8842.10, placedBy: 'Linda Anderson', items: [
    { sku: 'DTF-FILM-22', name: 'DTF Film 22"', qty: 600, unitPriceUsd: 11 },
  ]},
  { id: 'o6', orderNumber: '#48184', status: 'fulfilled', placedAt: '2026-06-24', itemsCount: 1, totalUsd: 274.50, placedBy: 'Cleo Harris', items: [
    { sku: 'DTF-ADH-500', name: 'DTF Adhesive 500ml', qty: 8, unitPriceUsd: 28 },
  ]},
  { id: 'o7', orderNumber: '#48181', status: 'cancelled', placedAt: '2026-06-23', itemsCount: 2, totalUsd: 1098.00, placedBy: 'Olivia Park', items: [
    { sku: 'DTF-FILM-13', name: 'DTF Film 13"', qty: 80, unitPriceUsd: 13 },
  ]},
  { id: 'o8', orderNumber: '#48174', status: 'fulfilled', placedAt: '2026-06-22', itemsCount: 28, totalUsd: 14820.00, placedBy: 'Sam Reyes', items: [
    { sku: 'BULK', name: 'Bulk DTF + Adhesive bundle', qty: 1, unitPriceUsd: 14820 },
  ]},
];

export async function fetchBuyerOrders(): Promise<BuyerOrder[]> {
  await delay(160);
  return ORDERS.map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) }));
}

/* ─── Reorder templates ────────────────────────────────── */
export interface ReorderTemplate {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
  items: OrderLineItem[];
}

const REORDER_TEMPLATES: ReorderTemplate[] = [
  { id: 'rt1', name: 'Weekly DTF Film + Adhesive', createdAt: '2026-04-12', lastUsedAt: '2026-06-22', useCount: 14, items: [
    { sku: 'DTF-FILM-22', name: 'DTF Film 22"', qty: 200, unitPriceUsd: 12 },
    { sku: 'DTF-ADH-500', name: 'DTF Adhesive 500ml', qty: 24, unitPriceUsd: 28 },
  ]},
  { id: 'rt2', name: 'Powder restock', createdAt: '2026-05-02', lastUsedAt: '2026-06-15', useCount: 6, items: [
    { sku: 'TPU-PWD-1KG', name: 'TPU Powder 1kg', qty: 20, unitPriceUsd: 38 },
  ]},
  { id: 'rt3', name: 'Trade show kit', createdAt: '2026-06-19', lastUsedAt: null, useCount: 0, items: [
    { sku: 'DTF-FILM-22', name: 'DTF Film 22"', qty: 50, unitPriceUsd: 12 },
    { sku: 'TPU-PWD-500', name: 'TPU Powder 500g', qty: 6, unitPriceUsd: 24 },
    { sku: 'DTF-ADH-500', name: 'DTF Adhesive 500ml', qty: 4, unitPriceUsd: 28 },
  ]},
];

export async function fetchReorderTemplates(): Promise<ReorderTemplate[]> {
  await delay(140);
  return REORDER_TEMPLATES.map((template) => ({ ...template, items: template.items.map((item) => ({ ...item })) }));
}

export async function deleteReorderTemplate(id: string): Promise<void> {
  await delay(120);
  const idx = REORDER_TEMPLATES.findIndex((template) => template.id === id);
  if (idx >= 0) REORDER_TEMPLATES.splice(idx, 1);
}

/* ─── Invoices ──────────────────────────────────────────── */
export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue' | 'partial';
export interface BuyerInvoice {
  id: string;
  invoiceNumber: string;
  orderNumber: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  totalUsd: number;
  paidUsd: number;
  fileUrl: string;
}

const INVOICES: BuyerInvoice[] = [
  { id: 'inv1', invoiceNumber: 'INV-2031', orderNumber: '#48201', status: 'unpaid', issuedAt: '2026-06-26', dueAt: '2026-07-26', totalUsd: 1824.50, paidUsd: 0, fileUrl: '#' },
  { id: 'inv2', invoiceNumber: 'INV-2030', orderNumber: '#48199', status: 'partial', issuedAt: '2026-06-26', dueAt: '2026-07-26', totalUsd: 4980.00, paidUsd: 2000.00, fileUrl: '#' },
  { id: 'inv3', invoiceNumber: 'INV-2027', orderNumber: '#48190', status: 'paid', issuedAt: '2026-06-25', dueAt: '2026-07-25', totalUsd: 612.20, paidUsd: 612.20, fileUrl: '#' },
  { id: 'inv4', invoiceNumber: 'INV-2025', orderNumber: '#48186', status: 'paid', issuedAt: '2026-06-24', dueAt: '2026-07-24', totalUsd: 8842.10, paidUsd: 8842.10, fileUrl: '#' },
  { id: 'inv5', invoiceNumber: 'INV-2019', orderNumber: '#48169', status: 'overdue', issuedAt: '2026-05-21', dueAt: '2026-06-20', totalUsd: 3812.40, paidUsd: 0, fileUrl: '#' },
  { id: 'inv6', invoiceNumber: 'INV-2018', orderNumber: '#48165', status: 'paid', issuedAt: '2026-05-20', dueAt: '2026-06-19', totalUsd: 942.00, paidUsd: 942.00, fileUrl: '#' },
];

export async function fetchInvoices(): Promise<BuyerInvoice[]> {
  await delay(160);
  return INVOICES.map((invoice) => ({ ...invoice }));
}

/* ─── Documents ─────────────────────────────────────────── */
export type DocumentCategory = 'contract' | 'certificate' | 'tax' | 'license' | 'other';
export interface BuyerDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  sizeBytes: number;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'application/msword';
  uploadedAt: string;
  uploadedBy: string;
  url: string;
}

const DOCUMENTS: BuyerDocument[] = [
  { id: 'd1', name: 'Master Supply Agreement 2026.pdf', category: 'contract', sizeBytes: 482_300, mimeType: 'application/pdf', uploadedAt: '2026-01-08', uploadedBy: 'Linda Anderson', url: '#' },
  { id: 'd2', name: 'Resale Certificate — TX.pdf', category: 'tax', sizeBytes: 168_200, mimeType: 'application/pdf', uploadedAt: '2025-09-22', uploadedBy: 'Charlette Lee', url: '#' },
  { id: 'd3', name: 'ISO 9001 Certificate.pdf', category: 'certificate', sizeBytes: 612_800, mimeType: 'application/pdf', uploadedAt: '2025-11-04', uploadedBy: 'Linda Anderson', url: '#' },
  { id: 'd4', name: 'Business License.png', category: 'license', sizeBytes: 1_240_000, mimeType: 'image/png', uploadedAt: '2025-08-30', uploadedBy: 'Linda Anderson', url: '#' },
  { id: 'd5', name: 'W-9 form 2026.pdf', category: 'tax', sizeBytes: 218_400, mimeType: 'application/pdf', uploadedAt: '2026-02-18', uploadedBy: 'Marcus Bell', url: '#' },
  { id: 'd6', name: 'Insurance proof.jpg', category: 'other', sizeBytes: 940_000, mimeType: 'image/jpeg', uploadedAt: '2026-03-12', uploadedBy: 'Marcus Bell', url: '#' },
];

export async function fetchDocuments(): Promise<BuyerDocument[]> {
  await delay(160);
  return DOCUMENTS.map((document) => ({ ...document }));
}

/* ─── Tracking ──────────────────────────────────────────── */
export type TrackingStepKey = 'placed' | 'paid' | 'processing' | 'shipped' | 'delivered';
export interface TrackingStep { key: TrackingStepKey; label: string; at: string | null; done: boolean; }
export interface TrackingOrder {
  id: string;
  orderNumber: string;
  status: 'pending' | 'in_transit' | 'delivered';
  carrier: string;
  trackingNumber: string;
  customerName: string;
  shippingAddress: string;
  steps: TrackingStep[];
}

const TRACKING: TrackingOrder[] = [
  { id: 'tk1', orderNumber: '#48199', status: 'in_transit', carrier: 'FedEx', trackingNumber: '7715 2210 0048', customerName: 'Linda Anderson', shippingAddress: '4318 Industrial Blvd, Suite 200\nHouston, TX 77072', steps: [
    { key: 'placed', label: 'Order placed', at: '2026-06-26 11:18', done: true },
    { key: 'paid', label: 'Payment confirmed', at: '2026-06-26 11:42', done: true },
    { key: 'processing', label: 'Processing', at: '2026-06-26 14:02', done: true },
    { key: 'shipped', label: 'Shipped', at: '2026-06-26 18:10', done: true },
    { key: 'delivered', label: 'Delivered', at: null, done: false },
  ]},
  { id: 'tk2', orderNumber: '#48190', status: 'delivered', carrier: 'UPS', trackingNumber: '1Z 999 AA1 0123 4567 84', customerName: 'Charlette Lee', shippingAddress: '120 Pacific Way\nSacramento, CA 95814', steps: [
    { key: 'placed', label: 'Order placed', at: '2026-06-25 09:55', done: true },
    { key: 'paid', label: 'Payment confirmed', at: '2026-06-25 09:58', done: true },
    { key: 'processing', label: 'Processing', at: '2026-06-25 11:14', done: true },
    { key: 'shipped', label: 'Shipped', at: '2026-06-25 14:30', done: true },
    { key: 'delivered', label: 'Delivered', at: '2026-06-26 11:02', done: true },
  ]},
  { id: 'tk3', orderNumber: '#48201', status: 'pending', carrier: '—', trackingNumber: '—', customerName: 'Linda Anderson', shippingAddress: '4318 Industrial Blvd, Suite 200\nHouston, TX 77072', steps: [
    { key: 'placed', label: 'Order placed', at: '2026-06-26 14:32', done: true },
    { key: 'paid', label: 'Payment confirmed', at: '2026-06-26 14:48', done: true },
    { key: 'processing', label: 'Processing', at: null, done: false },
    { key: 'shipped', label: 'Shipped', at: null, done: false },
    { key: 'delivered', label: 'Delivered', at: null, done: false },
  ]},
];

export async function fetchTrackingOrders(): Promise<TrackingOrder[]> {
  await delay(160);
  return TRACKING.map((order) => ({ ...order, steps: order.steps.map((step) => ({ ...step })) }));
}

/* ─── Pickup ────────────────────────────────────────────── */
export type PickupStep = 'order_received' | 'design_qa' | 'printing' | 'curing' | 'packed' | 'ready';
export interface PickupOrder {
  id: string;
  orderNumber: string;
  placedAt: string;
  shelfCode: string | null;
  status: 'in_production' | 'ready_for_pickup' | 'picked_up';
  currentStep: PickupStep;
  steps: { key: PickupStep; label: string; done: boolean; at: string | null }[];
  designFiles: { id: string; name: string; previewUrl: string }[];
  qrPayload: string;
  pickupBy: string | null;
}

const PICKUPS: PickupOrder[] = [
  { id: 'p1', orderNumber: '#48195', placedAt: '2026-06-25 17:42', shelfCode: 'A-12', status: 'ready_for_pickup', currentStep: 'ready',
    steps: [
      { key: 'order_received', label: 'Order received', done: true, at: '2026-06-25 17:42' },
      { key: 'design_qa', label: 'Design QA', done: true, at: '2026-06-25 18:10' },
      { key: 'printing', label: 'Printing', done: true, at: '2026-06-26 09:14' },
      { key: 'curing', label: 'Curing', done: true, at: '2026-06-26 10:42' },
      { key: 'packed', label: 'Packed', done: true, at: '2026-06-26 12:01' },
      { key: 'ready', label: 'Ready for pickup', done: true, at: '2026-06-26 12:08' },
    ],
    designFiles: [
      { id: 'f1', name: 'Sleeve_Logo_white.png', previewUrl: '#' },
      { id: 'f2', name: 'Backprint_v3.png', previewUrl: '#' },
    ],
    qrPayload: 'PICKUP-48195-A12-9F2C', pickupBy: null,
  },
  { id: 'p2', orderNumber: '#48201', placedAt: '2026-06-26 14:32', shelfCode: null, status: 'in_production', currentStep: 'printing',
    steps: [
      { key: 'order_received', label: 'Order received', done: true, at: '2026-06-26 14:32' },
      { key: 'design_qa', label: 'Design QA', done: true, at: '2026-06-26 15:11' },
      { key: 'printing', label: 'Printing', done: false, at: null },
      { key: 'curing', label: 'Curing', done: false, at: null },
      { key: 'packed', label: 'Packed', done: false, at: null },
      { key: 'ready', label: 'Ready for pickup', done: false, at: null },
    ],
    designFiles: [
      { id: 'f3', name: 'Tour_Date_Tee.png', previewUrl: '#' },
      { id: 'f4', name: 'Crest_4color.png', previewUrl: '#' },
    ],
    qrPayload: 'PICKUP-48201-PEND', pickupBy: null,
  },
  { id: 'p3', orderNumber: '#48184', placedAt: '2026-06-24 10:12', shelfCode: 'B-04', status: 'picked_up', currentStep: 'ready',
    steps: [
      { key: 'order_received', label: 'Order received', done: true, at: '2026-06-24 10:12' },
      { key: 'design_qa', label: 'Design QA', done: true, at: '2026-06-24 11:00' },
      { key: 'printing', label: 'Printing', done: true, at: '2026-06-24 14:22' },
      { key: 'curing', label: 'Curing', done: true, at: '2026-06-24 15:48' },
      { key: 'packed', label: 'Packed', done: true, at: '2026-06-24 17:01' },
      { key: 'ready', label: 'Ready for pickup', done: true, at: '2026-06-24 17:09' },
    ],
    designFiles: [{ id: 'f5', name: 'Tulsa_Logo.png', previewUrl: '#' }],
    qrPayload: 'PICKUP-48184-B04-2A11', pickupBy: 'Cleo Harris on 2026-06-25 10:30',
  },
];

export async function fetchPickups(): Promise<PickupOrder[]> {
  await delay(160);
  return PICKUPS.map((order) => ({ ...order, steps: order.steps.map((step) => ({ ...step })), designFiles: order.designFiles.map((file) => ({ ...file })) }));
}

/* ─── Products (catalog) ───────────────────────────────── */
export interface BuyerProduct {
  id: string;
  name: string;
  vendor: string;
  imageBg: string;
  listPriceUsd: number;
  yourPriceUsd: number;
  inStock: boolean;
  collection: string;
  sku: string;
}

const PRODUCTS: BuyerProduct[] = [
  { id: 'pr1', name: 'DTF Film 22" — 100ft roll', vendor: 'DTF Bank Mfg', imageBg: '#1d4ed8', listPriceUsd: 14.00, yourPriceUsd: 12.00, inStock: true, collection: 'DTF Film', sku: 'DTF-FILM-22' },
  { id: 'pr2', name: 'DTF Film 13" — 100ft roll', vendor: 'DTF Bank Mfg', imageBg: '#0ea5e9', listPriceUsd: 15.00, yourPriceUsd: 13.00, inStock: true, collection: 'DTF Film', sku: 'DTF-FILM-13' },
  { id: 'pr3', name: 'DTF Film 24" — 100ft roll', vendor: 'DTF Bank Mfg', imageBg: '#7c3aed', listPriceUsd: 16.00, yourPriceUsd: 14.20, inStock: false, collection: 'DTF Film', sku: 'DTF-FILM-24' },
  { id: 'pr4', name: 'TPU Powder 1kg — Hot melt', vendor: 'PowderTech', imageBg: '#047857', listPriceUsd: 42.00, yourPriceUsd: 38.00, inStock: true, collection: 'Powders', sku: 'TPU-PWD-1KG' },
  { id: 'pr5', name: 'TPU Powder 500g — Hot melt', vendor: 'PowderTech', imageBg: '#059669', listPriceUsd: 28.00, yourPriceUsd: 24.00, inStock: true, collection: 'Powders', sku: 'TPU-PWD-500' },
  { id: 'pr6', name: 'TPU Powder Fine 1kg', vendor: 'PowderTech', imageBg: '#10b981', listPriceUsd: 48.00, yourPriceUsd: 42.00, inStock: true, collection: 'Powders', sku: 'TPU-PWD-FINE-1KG' },
  { id: 'pr7', name: 'DTF Adhesive 500ml', vendor: 'AdhesivePro', imageBg: '#b45309', listPriceUsd: 32.00, yourPriceUsd: 28.00, inStock: true, collection: 'Adhesives', sku: 'DTF-ADH-500' },
  { id: 'pr8', name: 'DTF Adhesive 1L', vendor: 'AdhesivePro', imageBg: '#92400e', listPriceUsd: 58.00, yourPriceUsd: 52.00, inStock: true, collection: 'Adhesives', sku: 'DTF-ADH-1L' },
  { id: 'pr9', name: 'Cleaning solvent 1L', vendor: 'AdhesivePro', imageBg: '#a3a3a3', listPriceUsd: 22.00, yourPriceUsd: 22.00, inStock: true, collection: 'Cleaning', sku: 'CLN-SLV-1L' },
  { id: 'pr10', name: 'Roller — Pro grade', vendor: 'DTF Bank Mfg', imageBg: '#dc2626', listPriceUsd: 88.00, yourPriceUsd: 75.00, inStock: true, collection: 'Tools', sku: 'TOOL-ROLLER' },
];

export async function fetchBuyerProducts(): Promise<BuyerProduct[]> {
  await delay(160);
  return PRODUCTS.map((product) => ({ ...product }));
}

export function uniqueVendors(rows: BuyerProduct[]): string[] {
  return Array.from(new Set(rows.map((row) => row.vendor)));
}
