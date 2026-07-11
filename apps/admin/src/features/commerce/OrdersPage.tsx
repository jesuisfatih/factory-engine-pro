import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  ArrowRightLeft,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  FilterX,
  Loader2,
  MapPin,
  Mail,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  UserRound,
  Truck,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  AccountInvoiceStatus,
  CustomerDetailPanelDto,
  OrderSortBy,
  OrderSurface,
  SaveAccountInvoiceInput,
  TransferOrderToMemberInput,
  UpdateCommercePickupInput,
} from '@factory-engine-pro/contracts';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';

interface OrderRow {
  id: string;
  shopifyOrderId: string | null;
  shopifyCustomerId?: string | null;
  orderNumber: string;
  customerId?: string | null;
  customerName: string | null;
  customerEmail: string | null;
  phone?: string | null;
  companyName: string | null;
  subtotal?: number;
  totalDiscounts?: number;
  totalTax?: number;
  totalShipping?: number;
  totalRefunded?: number;
  totalPrice: number;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentMode: string;
  pickupStatus: string | null;
  processedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string | null;
  closedAt?: string | null;
  notes?: string | null;
  tags?: string[];
  hasDesignFiles: boolean;
  designFiles: Array<Record<string, unknown>>;
  lineItems: Array<Record<string, unknown>>;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  discountCodes?: unknown;
  fulfillments?: unknown;
  refunds?: unknown;
  fulfillmentEvidence?: unknown;
  pickup?: {
    id: string;
    status: string;
    qrCode: string | null;
    shelfCode: string | null;
    note: string | null;
    pickupAt: string | null;
    createdAt: string;
    updatedAt: string;
    history: unknown[];
  };
}

interface OrderListResponse {
  data: OrderRow[];
  meta: { count: number; limit: number };
}

interface OrderStats {
  count: number;
  totalRevenue: number;
  totalRefunded: number;
  totalShipping: number;
  refundedCount: number;
  fulfilledCount: number;
  fulfillmentRate: number;
  pickupCount: number;
  designFileCount: number;
}

interface AccountInvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  fileUrl: string | null;
  externalPaymentUrl: string | null;
  payment: { state: string; label: string; amountDue: number; url: string | null };
  lastDelivery: { id: string | null; status: string; recipientEmail: string | null; sentAt: string } | null;
  notes?: string | null;
  lineItems?: Array<{ id?: string; sku?: string; name: string; quantity: number; unitPrice: number; total: number }>;
  payments?: Array<{ id: string; amount: number; method: string; note: string | null; recordedAt: string; recordedByMemberId: string | null }>;
  activities?: Array<{ id: string; action: string; actorMemberId: string | null; metadata: unknown; createdAt: string }>;
}

interface OrderDetailResponse {
  order: OrderRow;
  customerHistory: {
    orders: OrderRow[];
    activities: Array<{ id: string; eventType: string; createdAt: string; payload?: unknown }>;
    summary: {
      orderCount: number;
      totalSpent: number;
      averageOrderValue: number;
      lastOrderAt: string | null;
      last30Days: { orderCount: number; totalSpent: number };
    };
  };
}

interface MemberRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
}

interface TransferResult {
  ok: boolean;
  serviceRequestId: string;
  assignedMemberName: string;
  axis: string;
}

const SURFACES: { id: OrderSurface; key: string }[] = [
  { id: 'all', key: 'orders.tab_all' },
  { id: 'pickup', key: 'orders.tab_pickup' },
  { id: 'design_files', key: 'orders.tab_design_files' },
];

type SortDir = 'asc' | 'desc';

interface OrderFilters {
  orderSearch: string;
  customerSearch: string;
  dateFrom: string;
  dateTo: string;
  financialStatus: string;
  fulfillmentStatus: string;
  sortBy: OrderSortBy;
  sortDir: SortDir;
}

const DEFAULT_ORDER_FILTERS: OrderFilters = {
  orderSearch: '',
  customerSearch: '',
  dateFrom: '',
  dateTo: '',
  financialStatus: '',
  fulfillmentStatus: '',
  sortBy: 'shopify_updated',
  sortDir: 'desc',
};

const PAYMENT_STATUS_OPTIONS = ['paid', 'pending', 'authorized', 'partially_paid', 'refunded', 'partially_refunded', 'voided', 'failed'];
const FULFILLMENT_STATUS_OPTIONS = ['fulfilled', 'partial', 'unfulfilled', 'complete', 'completed', 'cancelled'];

export function OrdersPage() {
  const { t } = useTranslation();
  const [surface, setSurface] = useState<OrderSurface>('all');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const query = useMemo(() => orderQuery(surface, search, filters), [surface, search, filters]);
  const orders = useQuery({ queryKey: ['commerce', 'orders', query], queryFn: () => fetchOrders(query) });
  const stats = useQuery({ queryKey: ['commerce', 'orders', 'stats', query], queryFn: () => fetchStats(query) });
  const customerDetail = useQuery({
    queryKey: ['commerce', 'customers', selectedCustomerId, 'detail'],
    queryFn: () => adminApi.customerDetail(selectedCustomerId ?? '') as Promise<CustomerDetailPanelDto>,
    enabled: Boolean(selectedCustomerId),
  });
  const rows = orders.data?.data ?? [];
  const shopifyStore = import.meta.env.VITE_SHOPIFY_ADMIN_STORE as string | undefined;
  const hasActiveFilters = Boolean(
    search.trim()
    || filters.orderSearch
    || filters.customerSearch
    || filters.dateFrom
    || filters.dateTo
    || filters.financialStatus
    || filters.fulfillmentStatus
    || filters.sortBy !== DEFAULT_ORDER_FILTERS.sortBy
    || filters.sortDir !== DEFAULT_ORDER_FILTERS.sortDir,
  );
  const updateFilter = <K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const cycleSort = (sortBy: OrderSortBy) => {
    setFilters((current) => ({
      ...current,
      sortBy,
      sortDir: current.sortBy === sortBy && current.sortDir === 'desc' ? 'asc' : 'desc',
    }));
  };
  const resetFilters = () => {
    setSearch('');
    setFilters(DEFAULT_ORDER_FILTERS);
  };

  return (
    <>
      <PageHeader
        titleI18nKey="orders.title"
        subtitleI18nKey="orders.subtitle"
        actions={(
          <button type="button" className="btn" onClick={() => downloadCsv(rows, surface)} disabled={rows.length === 0}>
            <Download size={14} /> {t('orders.export_csv')}
          </button>
        )}
      />

      <div className="tabs" role="tablist">
        {SURFACES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={`tab${surface === entry.id ? ' active' : ''}`}
            onClick={() => setSurface(entry.id)}
          >
            {t(entry.key)}
          </button>
        ))}
      </div>

      <div className="kpis" style={{ marginBottom: 14 }}>
        <Kpi label={t('orders.kpi_count')} value={stats.data?.count ?? null} sub={t('orders.kpi_sub_count')} />
        <Kpi label={t('orders.kpi_revenue')} value={stats.data ? fmtMoney(stats.data.totalRevenue) : null} sub={t('orders.kpi_sub_revenue')} />
        <Kpi label={t('orders.kpi_pickup')} value={stats.data?.pickupCount ?? null} sub={t('orders.kpi_sub_pickup')} />
        <Kpi label={t('orders.kpi_design_files')} value={stats.data?.designFileCount ?? null} sub={t('orders.kpi_sub_design_files')} />
        <Kpi label={t('orders.kpi_fulfilled')} value={stats.data ? `${stats.data.fulfillmentRate}%` : null} sub={t('orders.kpi_sub_fulfilled')} />
      </div>

      <div className="orders-toolbar">
        <div className="orders-search">
          <Search size={14} />
          <input
            id="orders-search"
            placeholder={t('orders.search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="orders-date-range" aria-label={t('orders.date_range', { defaultValue: 'Order date range' })}>
          <CalendarDays size={14} />
          <input
            id="orders-filter-date-from"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
            aria-label={t('orders.date_from', { defaultValue: 'Date from' })}
          />
          <span className="muted">to</span>
          <input
            id="orders-filter-date-to"
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter('dateTo', event.target.value)}
            aria-label={t('orders.date_to', { defaultValue: 'Date to' })}
          />
        </div>
        <button
          type="button"
          id="orders-sort-shopify-updated"
          className={`btn ghost${filters.sortBy === 'shopify_updated' ? ' active' : ''}`}
          onClick={() => cycleSort('shopify_updated')}
        >
          <ArrowUpDown size={14} /> {t('orders.sort_shopify_updated', { defaultValue: 'Shopify updated' })} {filters.sortBy === 'shopify_updated' ? filters.sortDir : ''}
        </button>
        {hasActiveFilters && (
          <button type="button" className="btn ghost" id="orders-clear-filters" onClick={resetFilters}>
            <FilterX size={14} /> {t('common.clear', { defaultValue: 'Clear' })}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => { orders.refetch(); stats.refetch(); }}>
          <RefreshCw size={14} /> {t('common.refresh')}
        </button>
      </div>

      {orders.isLoading && <StateBlock title={t('common.loading')} body={t('orders.loading_body')} />}
      {orders.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(orders.error)} action={<button type="button" className="btn" onClick={() => orders.refetch()}>{t('common.retry')}</button>} />}
      {orders.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('orders.empty_title')}
          body={t('orders.empty_state')}
          action={<button type="button" className="btn primary" onClick={() => orders.refetch()}><RefreshCw size={14} /> {t('common.refresh')}</button>}
        />
      )}
      {orders.isSuccess && rows.length > 0 && (
        <div className="data-card">
          <table className="data-table" id="table-orders">
            <thead>
              <tr>
                <th>
                  <SortHeader label={t('orders.columns.order')} sortBy="order_number" activeSortBy={filters.sortBy} sortDir={filters.sortDir} onSort={cycleSort} />
                  <input
                    id="orders-filter-order"
                    className="table-filter-input"
                    value={filters.orderSearch}
                    onChange={(event) => updateFilter('orderSearch', event.target.value)}
                    placeholder={t('orders.filter_order_placeholder', { defaultValue: 'Order #' })}
                  />
                </th>
                <th>
                  <SortHeader label={t('orders.columns.customer')} sortBy="customer_name" activeSortBy={filters.sortBy} sortDir={filters.sortDir} onSort={cycleSort} />
                  <input
                    id="orders-filter-customer"
                    className="table-filter-input"
                    value={filters.customerSearch}
                    onChange={(event) => updateFilter('customerSearch', event.target.value)}
                    placeholder={t('orders.filter_customer_placeholder', { defaultValue: 'Customer name' })}
                  />
                </th>
                <th>
                  <SortHeader label={t('orders.columns.date')} sortBy="order_date" activeSortBy={filters.sortBy} sortDir={filters.sortDir} onSort={cycleSort} />
                </th>
                <th>
                  <SortHeader label={t('orders.columns.total')} sortBy="total" activeSortBy={filters.sortBy} sortDir={filters.sortDir} onSort={cycleSort} />
                </th>
                <th>
                  <SortHeader label={t('orders.columns.payment')} sortBy="payment" activeSortBy={filters.sortBy} sortDir={filters.sortDir} onSort={cycleSort} />
                  <select
                    id="orders-filter-payment"
                    className="table-filter-select"
                    value={filters.financialStatus}
                    onChange={(event) => updateFilter('financialStatus', event.target.value)}
                    aria-label={t('orders.filter_payment', { defaultValue: 'Payment status' })}
                  >
                    <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                    {PAYMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
                  </select>
                </th>
                <th>
                  <SortHeader label={t('orders.columns.fulfillment')} sortBy="fulfillment" activeSortBy={filters.sortBy} sortDir={filters.sortDir} onSort={cycleSort} />
                  <select
                    id="orders-filter-fulfillment"
                    className="table-filter-select"
                    value={filters.fulfillmentStatus}
                    onChange={(event) => updateFilter('fulfillmentStatus', event.target.value)}
                    aria-label={t('orders.filter_fulfillment', { defaultValue: 'Fulfillment status' })}
                  >
                    <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                    {FULFILLMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
                  </select>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr
                  key={order.id}
                  id={`row-order-${order.id}`}
                  className="clickable-row"
                  tabIndex={0}
                  onClick={() => setSelectedOrderId(order.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedOrderId(order.id);
                    }
                  }}
                >
                  <td>
                    <div className="name">{order.orderNumber}</div>
                    <div className="muted" style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {order.fulfillmentMode === 'pickup' && <span className="pill warn"><MapPin size={9} /> {t('orders.badge_pickup')}</span>}
                      {order.fulfillmentMode === 'local_delivery' && <span className="pill info"><Truck size={9} /> {t('orders.badge_local')}</span>}
                      {order.hasDesignFiles && <span className="pill accent"><FileText size={9} /> {t('orders.badge_files', { count: order.designFiles.length })}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="name">{order.customerName ?? order.companyName ?? t('orders.unknown_customer')}</div>
                    <div className="muted">{order.customerEmail ?? '-'}</div>
                    {order.companyName && <div className="muted">{order.companyName}</div>}
                  </td>
                  <td>
                    <div className="muted">{fmtDate(order.processedAt ?? order.createdAt ?? null)}</div>
                    {order.updatedAt && (
                      <div className="order-updated-line">
                        {t('orders.updated_label', { defaultValue: 'Updated' })} {fmtDateTime(order.updatedAt)}
                      </div>
                    )}
                  </td>
                  <td><strong>{fmtMoney(order.totalPrice, order.currency)}</strong></td>
                  <td><span className={`pill ${paymentTone(order.financialStatus)}`}>{labelStatus(order.financialStatus)}</span></td>
                  <td>
                    <span className={`pill ${fulfillmentTone(order.fulfillmentStatus, order.fulfillmentMode)}`}>
                      {labelStatus(order.fulfillmentStatus ?? order.fulfillmentMode)}
                    </span>
                    {order.pickupStatus && <div className="muted" style={{ marginTop: 4 }}>{order.pickupStatus}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {shopifyStore && order.shopifyOrderId && (
                      <a
                        className="btn ghost"
                        href={`https://admin.shopify.com/store/${shopifyStore}/orders/${order.shopifyOrderId}`}
                        target="_blank"
                        rel="noreferrer"
                        title={t('orders.open_shopify')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrderId && (
        <OrderDetailDialog
          orderId={selectedOrderId}
          shopifyStore={shopifyStore}
          onClose={() => setSelectedOrderId(null)}
          onSelectOrder={setSelectedOrderId}
          onOpenCustomer={(customerId) => {
            setSelectedOrderId(null);
            setSelectedCustomerId(customerId);
          }}
        />
      )}
      <CustomerDetailPanel
        open={Boolean(selectedCustomerId)}
        detail={customerDetail.data}
        isLoading={customerDetail.isLoading}
        error={customerDetail.error ? apiErrorMessage(customerDetail.error) : null}
        onRetry={() => customerDetail.refetch()}
        onClose={() => setSelectedCustomerId(null)}
        onOpenOrder={(nextOrderId) => {
          setSelectedCustomerId(null);
          setSelectedOrderId(nextOrderId);
        }}
        shopifyAdminCustomerUrl={shopifyStore && customerDetail.data?.customer.shopifyCustomerId
          ? `https://admin.shopify.com/store/${shopifyStore}/customers/${customerDetail.data.customer.shopifyCustomerId}`
          : null}
      />
    </>
  );
}

export function OrderDetailDialog({
  orderId,
  shopifyStore,
  onClose,
  onSelectOrder,
  onOpenCustomer,
}: {
  orderId: string;
  shopifyStore?: string;
  onClose: () => void;
  onSelectOrder?: (orderId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ targetMemberId: '', axis: 'support', note: '' });
  const [lastTransfer, setLastTransfer] = useState<TransferResult | null>(null);
  const [section, setSection] = useState<'overview' | 'items' | 'fulfillment' | 'billing' | 'activity'>('overview');
  const detail = useQuery({ queryKey: ['commerce', 'orders', orderId, 'detail'], queryFn: () => fetchOrderDetail(orderId), retry: false });
  const members = useQuery({ queryKey: ['identity', 'members', 'orders-transfer'], queryFn: fetchMembers, retry: false });
  const activeMembers = (members.data ?? []).filter((member) => member.status === 'active');
  const defaultTargetId = activeMembers.find((member) => member.email.toLowerCase() === 'dtfbanktx@gmail.com')?.id ?? activeMembers[0]?.id ?? '';
  const selectedTargetId = draft.targetMemberId || defaultTargetId;
  const transfer = useMutation({
    mutationFn: () => adminApi.transferOrder(orderId, {
      targetMemberId: selectedTargetId,
      axis: draft.axis as TransferOrderToMemberInput['axis'],
      note: draft.note,
      priority: 'high',
    }) as Promise<TransferResult>,
    onSuccess: (result) => {
      setLastTransfer(result);
      toast.success(t('orders.modal.transfer_success', { defaultValue: 'Task sent to staff queue' }), {
        description: `${result.assignedMemberName} - ${result.serviceRequestId}`,
      });
      qc.invalidateQueries({ queryKey: ['commerce', 'orders', orderId, 'detail'] });
    },
    onError: (error) => toast.error(t('orders.modal.transfer_failed', { defaultValue: 'Transfer failed' }), { description: apiErrorMessage(error) }),
  });

  const body = detail.data;
  const order = body?.order ?? null;
  const history = body?.customerHistory;
  const canTransfer = Boolean(selectedTargetId && draft.note.trim()) && !transfer.isPending;

  useEffect(() => {
    setSection('overview');
    setLastTransfer(null);
  }, [orderId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} cardClassName="modal-card order-modal-card" labelledBy="order-detail-title" describedBy="order-detail-subtitle">
      <header className="modal-head">
        <div>
          <DialogTitle asChild>
            <h2 id="order-detail-title">{order ? `Order ${order.orderNumber}` : t('orders.modal.title', { defaultValue: 'Order detail' })}</h2>
          </DialogTitle>
          <DialogDescription asChild>
            <div id="order-detail-subtitle" className="sub">
              {order ? `${order.customerName ?? order.companyName ?? t('orders.unknown_customer')} - ${fmtMoney(order.totalPrice, order.currency)}` : t('orders.modal.subtitle', { defaultValue: 'Shopify detail, customer history, and staff transfer' })}
            </div>
          </DialogDescription>
        </div>
        <DialogClose asChild>
          <button type="button" className="close" title={t('common.cancel')}><X size={16} /></button>
        </DialogClose>
      </header>

      {order && (
        <nav className="order-modal-tabs" aria-label="Order detail sections">
          {([
            ['overview', 'Overview'],
            ['items', `Items (${order.lineItems.length})`],
            ['fulfillment', order.fulfillmentMode === 'pickup' ? 'Pickup & files' : 'Delivery & files'],
            ['billing', 'Invoices & payment'],
            ['activity', `Activity (${history?.activities.length ?? 0})`],
          ] as const).map(([id, labelText]) => (
            <button key={id} type="button" className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
              {labelText}
            </button>
          ))}
        </nav>
      )}

      {detail.isLoading && (
        <div className="modal-body order-modal-body order-modal-single">
          <StateBlock title={t('common.loading')} body={t('orders.modal.loading', { defaultValue: 'Loading Shopify order detail and customer history.' })} />
        </div>
      )}

      {detail.isError && (
        <div className="modal-body order-modal-body order-modal-single">
          <StateBlock
            title={t('common.error')}
            body={apiErrorMessage(detail.error)}
            action={<button type="button" className="btn" onClick={() => detail.refetch()}>{t('common.retry')}</button>}
          />
        </div>
      )}

      {detail.isSuccess && !order && (
        <div className="modal-body order-modal-body order-modal-single">
          <StateBlock title={t('orders.empty_title')} body={t('orders.modal.not_found', { defaultValue: 'This order could not be found.' })} />
        </div>
      )}

      {detail.isSuccess && order && history && (
        <div className="modal-body order-modal-body">
          <main className="order-modal-main">
            {section === 'overview' && <section className="modal-section">
              <div className="order-modal-section-head">
                <h3>{t('orders.modal.shopify_detail', { defaultValue: 'Shopify order detail' })}</h3>
                {shopifyStore && order.shopifyOrderId && (
                  <a className="btn ghost" href={`https://admin.shopify.com/store/${shopifyStore}/orders/${order.shopifyOrderId}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Shopify
                  </a>
                )}
              </div>
              <div className="order-detail-grid">
                <Metric icon={<CreditCard size={13} />} label="Payment" value={labelStatus(order.financialStatus)} />
                <Metric icon={<Truck size={13} />} label="Fulfillment" value={labelStatus(order.fulfillmentStatus ?? order.fulfillmentMode)} />
                <Metric icon={<ShoppingBag size={13} />} label="Total" value={fmtMoney(order.totalPrice, order.currency)} />
                <Metric icon={<Package size={13} />} label="Items" value={String(order.lineItems.length)} />
              </div>
              <MoneyBreakdown order={order} />
              {order.notes && <InfoBlock title="Notes" body={order.notes} />}
              <div className="order-detail-grid order-detail-dates">
                <Metric icon={<CalendarDays size={13} />} label="Placed" value={fmtDateTime(order.processedAt ?? order.createdAt ?? null)} />
                <Metric label="Synced" value={fmtDateTime(order.updatedAt ?? null)} />
                <Metric label="Closed" value={fmtDateTime(order.closedAt ?? null)} />
                <Metric label="Cancelled" value={fmtDateTime(order.cancelledAt ?? null)} />
              </div>
              {order.tags?.length ? <div className="order-tag-row">{order.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}</div> : null}
            </section>}

            {section === 'items' && <section className="modal-section">
              <h3>{t('orders.modal.line_items', { defaultValue: 'Line items' })}</h3>
              {order.lineItems.length === 0 ? (
                <div className="muted">{t('orders.modal.no_line_items', { defaultValue: 'No line items captured for this order.' })}</div>
              ) : (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.map((item, index) => (
                      <tr key={`${String(item.id ?? item.title ?? index)}-${index}`}>
                        <td>
                          <strong>{String(item.title ?? item.name ?? 'Line item')}</strong>
                          <div className="muted">{[item.sku, item.variant_title ?? item.variantTitle].filter(Boolean).map(String).join(' - ') || '-'}</div>
                          <OrderItemProperties value={item.properties ?? item.customAttributes} />
                        </td>
                        <td>{String(item.quantity ?? 1)}</td>
                        <td>
                          <strong>{fmtMoney(Number(item.totalPrice ?? item.price ?? 0) * Number(item.quantity ?? 1), order.currency)}</strong>
                          <div className="muted">{fmtMoney(Number(item.price ?? item.unitPrice ?? 0), order.currency)} each</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>}

            {section === 'fulfillment' && <section className="modal-section">
              <h3>{t('orders.modal.fulfillment', { defaultValue: 'Fulfillment, refunds, and files' })}</h3>
              {order.fulfillmentMode === 'pickup' ? <PickupPanel order={order} /> : null}
              <div className="order-address-grid">
                <AddressSummary title="Shipping address" value={order.shippingAddress} />
                <AddressSummary title="Billing address" value={order.billingAddress} />
              </div>
              <FulfillmentList values={arrayValue(order.fulfillments)} currency={order.currency} />
              <RefundList values={arrayValue(order.refunds)} currency={order.currency} />
              <DesignFiles values={order.designFiles} />
            </section>}

            {section === 'billing' && <InvoicePanel order={order} />}

            {section === 'activity' && (
              <section className="modal-section">
                <h3>Order and customer activity</h3>
                {history.activities.length === 0 ? (
                  <div className="muted">No related activity has been captured for this customer.</div>
                ) : (
                  <div className="order-activity-list">
                    {history.activities.map((activity) => (
                      <article key={activity.id}>
                        <span className="order-activity-dot" />
                        <div>
                          <strong>{labelStatus(activity.eventType)}</strong>
                          <span>{fmtDateTime(activity.createdAt)}</span>
                          <ActivityPayload value={activity.payload} />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </main>

          <aside className="order-modal-side">
            <section className="modal-section">
              <div className="order-modal-section-head">
                <h3>{t('orders.modal.customer_stats', { defaultValue: 'Customer' })}</h3>
                {order.customerId && onOpenCustomer ? (
                  <button type="button" className="btn ghost" onClick={() => onOpenCustomer(order.customerId!)}>
                    <UserRound size={13} /> Customer 360
                  </button>
                ) : null}
              </div>
              <div className="order-customer-contact">
                <strong>{order.customerName ?? order.companyName ?? 'Unknown customer'}</strong>
                {order.customerEmail ? <a href={`mailto:${order.customerEmail}`}><Mail size={12} /> {order.customerEmail}</a> : <span className="muted">No email</span>}
                {order.phone ? <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}><Phone size={12} /> {order.phone}</a> : <span className="muted">No phone</span>}
              </div>
              <div className="order-stats-grid">
                <Metric label="LTV" value={fmtMoney(history.summary.totalSpent, order.currency)} />
                <Metric label="AOV" value={fmtMoney(history.summary.averageOrderValue, order.currency)} />
                <Metric label="Orders" value={String(history.summary.orderCount)} />
                <Metric label="30d" value={`${history.summary.last30Days.orderCount} / ${fmtMoney(history.summary.last30Days.totalSpent, order.currency)}`} />
              </div>
            </section>

            <section className="modal-section">
              <h3>{t('orders.modal.history', { defaultValue: 'Shopify order history' })}</h3>
              {history.orders.length === 0 ? (
                <div className="muted">{t('orders.modal.no_history', { defaultValue: 'No Shopify history captured for this customer.' })}</div>
              ) : (
                <div className="order-history-list">
                  {history.orders.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === order.id ? 'active' : ''}
                      disabled={item.id === order.id}
                      onClick={() => onSelectOrder?.(item.id)}
                    >
                      <span><strong>{item.orderNumber}</strong><small>{fmtDateTime(item.processedAt ?? item.createdAt ?? null)}</small></span>
                      <span>{fmtMoney(item.totalPrice, item.currency)} <ChevronRight size={13} /></span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="modal-section">
              <h3>{t('orders.modal.transfer_title', { defaultValue: 'Personele aktar' })}</h3>
              <label className="field-label" htmlFor="order-transfer-member">{t('orders.modal.target_member', { defaultValue: 'Target staff member' })}</label>
              <select
                id="order-transfer-member"
                value={selectedTargetId}
                onChange={(event) => setDraft((current) => ({ ...current, targetMemberId: event.target.value }))}
                disabled={members.isLoading || activeMembers.length === 0}
              >
                {members.isLoading && <option value="">{t('common.loading')}</option>}
                {!members.isLoading && activeMembers.length === 0 && <option value="">{t('orders.modal.no_members', { defaultValue: 'No active members found' })}</option>}
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>{memberName(member)} - {member.email}</option>
                ))}
              </select>
              {members.isError && <div className="inline-error">{apiErrorMessage(members.error)}</div>}

              <label className="field-label" htmlFor="order-transfer-axis">Axis</label>
              <select id="order-transfer-axis" value={draft.axis} onChange={(event) => setDraft((current) => ({ ...current, axis: event.target.value }))}>
                <option value="support">Support</option>
                <option value="sales">Sales</option>
                <option value="account">Account</option>
              </select>

              <label className="field-label" htmlFor="order-transfer-note">{t('orders.modal.note', { defaultValue: 'Explanation' })}</label>
              <textarea
                id="order-transfer-note"
                rows={4}
                value={draft.note}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder={t('orders.modal.note_placeholder', { defaultValue: 'Tell the staff member what to do with this order.' })}
              />
              {lastTransfer && (
                <div className="transfer-proof">
                  <ArrowRightLeft size={13} />
                  <span>{lastTransfer.assignedMemberName} - {lastTransfer.serviceRequestId}</span>
                </div>
              )}
              <button type="button" className="btn primary" disabled={!canTransfer} onClick={() => transfer.mutate()}>
                {transfer.isPending ? <Loader2 size={13} className="spin" /> : <ArrowRightLeft size={13} />}
                {t('orders.modal.transfer_button', { defaultValue: 'Personele aktar' })}
              </button>
            </section>
          </aside>
        </div>
      )}

      <footer className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
      </footer>
    </Dialog>
  );
}

function fetchOrders(query: string) {
  return adminApi.orders(query) as Promise<OrderListResponse>;
}

function fetchStats(query: string) {
  return adminApi.orderStats(query) as Promise<OrderStats>;
}

function fetchOrderDetail(orderId: string) {
  return adminApi.orderDetail(orderId) as Promise<OrderDetailResponse>;
}

function fetchMembers() {
  return adminApi.members() as Promise<MemberRow[]>;
}

function PickupPanel({ order }: { order: OrderRow }) {
  const queryClient = useQueryClient();
  const pickup = order.pickup;
  const [draft, setDraft] = useState({
    shelfCode: pickup?.shelfCode ?? '',
    qrCode: pickup?.qrCode ?? '',
    note: pickup?.note ?? '',
  });
  useEffect(() => {
    setDraft({
      shelfCode: pickup?.shelfCode ?? '',
      qrCode: pickup?.qrCode ?? '',
      note: pickup?.note ?? '',
    });
  }, [order.id, pickup?.note, pickup?.qrCode, pickup?.shelfCode]);

  const updatePickup = useMutation({
    mutationFn: (input: UpdateCommercePickupInput) => adminApi.updateOrderPickup(order.id, input) as Promise<OrderRow>,
    onSuccess: async () => {
      toast.success('Pickup record updated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commerce', 'orders', order.id, 'detail'] }),
        queryClient.invalidateQueries({ queryKey: ['commerce', 'orders'] }),
      ]);
    },
    onError: (error) => toast.error('Pickup update failed', { description: apiErrorMessage(error) }),
  });
  const status = pickup?.status ?? order.pickupStatus ?? 'pending';
  const nextActions = pickupStatusActions(status);

  return (
    <div className="pickup-workspace">
      <div className="pickup-status-strip">
        {['pending', 'processing', 'ready', 'notified', 'picked_up'].map((step) => (
          <div key={step} className={pickupStepDone(status, step) ? 'done' : status === step ? 'current' : ''}>
            <span>{pickupStepDone(status, step) ? <CheckCircle2 size={13} /> : null}</span>
            <strong>{labelStatus(step)}</strong>
          </div>
        ))}
      </div>
      <div className="pickup-details-grid">
        <label>
          <span>Shelf / pickup location</span>
          <input value={draft.shelfCode} onChange={(event) => setDraft((current) => ({ ...current, shelfCode: event.target.value }))} placeholder="A-12 or Front counter" />
        </label>
        <label>
          <span>QR or pickup code</span>
          <input value={draft.qrCode} onChange={(event) => setDraft((current) => ({ ...current, qrCode: event.target.value }))} placeholder="Scan or enter code" />
        </label>
        <label className="wide">
          <span>Pickup note</span>
          <textarea rows={2} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Customer-facing pickup or handling context" />
        </label>
      </div>
      <div className="pickup-action-row">
        <button
          type="button"
          className="btn ghost"
          disabled={updatePickup.isPending}
          onClick={() => updatePickup.mutate({
            shelfCode: draft.shelfCode.trim() || null,
            qrCode: draft.qrCode.trim() || null,
            note: draft.note.trim() || null,
          })}
        >
          {updatePickup.isPending ? <Loader2 size={13} className="spin" /> : <MapPin size={13} />} Save pickup details
        </button>
        {nextActions.map((action) => (
          <button
            key={action.status}
            type="button"
            className={action.primary ? 'btn primary' : 'btn ghost'}
            disabled={updatePickup.isPending}
            onClick={() => updatePickup.mutate({
              status: action.status,
              shelfCode: draft.shelfCode.trim() || null,
              qrCode: draft.qrCode.trim() || null,
              note: draft.note.trim() || null,
            })}
          >
            {action.status === 'notified' ? <BellRing size={13} /> : <CheckCircle2 size={13} />} {action.label}
          </button>
        ))}
      </div>
      {status === 'notified' ? <div className="pickup-proof success"><Mail size={13} /> Pickup-ready email is recorded for this order.</div> : null}
      {pickup?.pickupAt ? <div className="pickup-proof"><CheckCircle2 size={13} /> Picked up {fmtDateTime(pickup.pickupAt)}</div> : null}
    </div>
  );
}

function pickupStatusActions(status: string): Array<{ status: UpdateCommercePickupInput['status']; label: string; primary: boolean }> {
  if (status === 'pending') return [{ status: 'processing', label: 'Start processing', primary: true }];
  if (status === 'processing') return [{ status: 'ready', label: 'Mark ready', primary: true }];
  if (status === 'ready') return [
    { status: 'notified', label: 'Email customer', primary: true },
    { status: 'picked_up', label: 'Mark picked up', primary: false },
  ];
  if (status === 'notified') return [{ status: 'picked_up', label: 'Mark picked up', primary: true }];
  return [];
}

function pickupStepDone(status: string, step: string) {
  const rank: Record<string, number> = { pending: 0, processing: 1, ready: 2, notified: 3, picked_up: 4 };
  return (rank[status] ?? -1) > (rank[step] ?? 99);
}

function InvoicePanel({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ['commerce', 'orders', order.id, 'invoices'];
  const invoices = useQuery({
    queryKey,
    queryFn: () => adminApi.orderInvoices(order.id) as Promise<AccountInvoiceRow[]>,
  });
  const [draft, setDraft] = useState({
    invoiceNumber: '',
    dueAt: '',
    fileUrl: '',
    externalPaymentUrl: '',
    notes: '',
  });
  const [fileDrafts, setFileDrafts] = useState<Record<string, { fileUrl: string; externalPaymentUrl: string }>>({});
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});

  const refreshInvoices = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ['commerce', 'orders', order.id, 'detail'] });
  };

  const createInvoice = useMutation({
    mutationFn: () => {
      const input: SaveAccountInvoiceInput = {
        orderId: order.id,
        invoiceNumber: draft.invoiceNumber.trim() || undefined,
        status: 'unpaid',
        dueAt: draft.dueAt ? new Date(`${draft.dueAt}T12:00:00.000Z`).toISOString() : undefined,
        discountAmount: 0,
        shippingAmount: 0,
        taxAmount: 0,
        amountPaid: 0,
        currency: order.currency || 'USD',
        fileUrl: draft.fileUrl.trim() || null,
        externalPaymentUrl: draft.externalPaymentUrl.trim() || null,
        notes: draft.notes.trim() || null,
      };
      return adminApi.createInvoice(input) as Promise<AccountInvoiceRow>;
    },
    onSuccess: async () => {
      toast.success(t('orders.invoice.created', { defaultValue: 'Invoice created' }));
      setDraft({ invoiceNumber: '', dueAt: '', fileUrl: '', externalPaymentUrl: '', notes: '' });
      await refreshInvoices();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccountInvoiceStatus }) => (
      adminApi.updateInvoiceStatus(id, { status }) as Promise<AccountInvoiceRow>
    ),
    onSuccess: async () => {
      toast.success(t('orders.invoice.status_saved', { defaultValue: 'Invoice status updated' }));
      await refreshInvoices();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const updateFile = useMutation({
    mutationFn: ({ id, fileUrl, externalPaymentUrl }: { id: string; fileUrl: string; externalPaymentUrl: string }) => (
      adminApi.updateInvoiceFile(id, {
        fileUrl: fileUrl.trim() || null,
        externalPaymentUrl: externalPaymentUrl.trim() || null,
      }) as Promise<AccountInvoiceRow>
    ),
    onSuccess: async () => {
      toast.success(t('orders.invoice.file_saved', { defaultValue: 'Invoice links updated' }));
      await refreshInvoices();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const recordPayment = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => (
      adminApi.recordInvoicePayment(id, { amount, method: 'manual', note: 'Recorded from order invoice panel' }) as Promise<AccountInvoiceRow>
    ),
    onSuccess: async (_row, variables) => {
      toast.success(t('orders.invoice.payment_saved', { defaultValue: 'Payment recorded' }));
      setPaymentDrafts((current) => ({ ...current, [variables.id]: '' }));
      await refreshInvoices();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const duplicateInvoice = useMutation({
    mutationFn: (id: string) => adminApi.duplicateInvoice(id) as Promise<AccountInvoiceRow>,
    onSuccess: async () => {
      toast.success(t('orders.invoice.duplicated', { defaultValue: 'Invoice duplicated' }));
      await refreshInvoices();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const sendInvoice = useMutation({
    mutationFn: (id: string) => adminApi.sendInvoice(id, {}) as Promise<{ invoice: AccountInvoiceRow; delivery: { status: string; recipientEmail: string } }>,
    onSuccess: async (result) => {
      toast.success(t('orders.invoice.sent', {
        defaultValue: `Invoice delivery ${result.delivery.status}`,
      }));
      await refreshInvoices();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <section className="modal-section">
      <h3>{t('orders.invoice.title', { defaultValue: 'Invoices' })}</h3>
      <p className="muted">
        {t('orders.invoice.body', { defaultValue: 'Create and maintain real invoice records for this order. Customer portal only shows persisted invoices.' })}
      </p>

      <div className="order-invoice-create">
        <label>
          <span>Invoice number</span>
          <input
            value={draft.invoiceNumber}
            onChange={(event) => setDraft((current) => ({ ...current, invoiceNumber: event.target.value }))}
            placeholder={t('orders.invoice.number_placeholder', { defaultValue: 'Generated when blank' })}
          />
        </label>
        <label>
          <span>{t('orders.invoice.due_date', { defaultValue: 'Due date' })}</span>
          <input
            type="date"
            value={draft.dueAt}
            onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))}
          />
        </label>
        <label>
          <span>Invoice file URL</span>
          <input
            type="url"
            value={draft.fileUrl}
            onChange={(event) => setDraft((current) => ({ ...current, fileUrl: event.target.value }))}
            placeholder="https://..."
          />
        </label>
        <label>
          <span>Payment URL</span>
          <input
            type="url"
            value={draft.externalPaymentUrl}
            onChange={(event) => setDraft((current) => ({ ...current, externalPaymentUrl: event.target.value }))}
            placeholder="https://..."
          />
        </label>
        <label className="wide">
          <span>Billing note</span>
          <textarea
            rows={2}
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t('orders.invoice.notes_placeholder', { defaultValue: 'Context visible to staff and used by the invoice email' })}
          />
        </label>
        <button type="button" className="btn primary" onClick={() => createInvoice.mutate()} disabled={createInvoice.isPending}>
          {createInvoice.isPending ? <Loader2 size={13} className="spin" /> : <FileText size={13} />}
          {t('orders.invoice.create', { defaultValue: 'Create invoice' })}
        </button>
      </div>

      {invoices.isLoading && <div className="muted">{t('common.loading')}</div>}
      {invoices.isError && (
        <div className="inline-error">
          {apiErrorMessage(invoices.error)}
          <button type="button" className="btn ghost" onClick={() => invoices.refetch()}>
            <RefreshCw size={13} /> {t('common.retry')}
          </button>
        </div>
      )}
      {invoices.isSuccess && invoices.data.length === 0 && (
        <div className="pricing-list-empty">
          <div className="name">{t('orders.invoice.empty_title', { defaultValue: 'No invoice yet' })}</div>
          <div className="muted">{t('orders.invoice.empty_body', { defaultValue: 'Create one here before customers can download or pay it from the portal.' })}</div>
        </div>
      )}
      {invoices.isSuccess && invoices.data.length > 0 && (
        <div className="compact-list invoice-list">
          {invoices.data.map((invoice) => {
            const fileDraft = fileDrafts[invoice.id] ?? { fileUrl: invoice.fileUrl ?? '', externalPaymentUrl: invoice.externalPaymentUrl ?? '' };
            const paymentAmount = paymentDrafts[invoice.id] ?? '';
            const parsedPayment = Number(paymentAmount);
            return (
              <div key={invoice.id} className="invoice-row">
                <div className="invoice-row-head">
                  <div>
                    <strong>{invoice.invoiceNumber}</strong>
                    <span className="muted">
                      {invoiceStatusLabel(invoice.status)} - {fmtMoney(invoice.amountDue, invoice.currency)} due - {invoice.dueAt ? fmtDate(invoice.dueAt) : 'No due date'}
                    </span>
                  </div>
                  <span className={`status-pill ${invoice.status === 'paid' ? 'success' : invoice.status === 'void' ? 'danger' : 'warn'}`}>
                    {invoice.payment.label}
                  </span>
                </div>
                <div className="order-stats-grid">
                  <Metric icon={<FileText size={12} />} label="Total" value={fmtMoney(invoice.totalAmount, invoice.currency)} />
                  <Metric icon={<CreditCard size={12} />} label="Paid" value={fmtMoney(invoice.amountPaid, invoice.currency)} />
                  <Metric label="Issued" value={fmtDate(invoice.issuedAt)} />
                </div>
                {invoice.lastDelivery ? (
                  <div className="invoice-delivery-proof">
                    <strong>Customer email</strong>
                    <span>
                      Last delivery {invoice.lastDelivery.status} to {invoice.lastDelivery.recipientEmail ?? 'customer'} on {fmtDate(invoice.lastDelivery.sentAt)}
                    </span>
                  </div>
                ) : null}
                {invoice.notes ? <div className="invoice-note"><strong>Billing note</strong><span>{invoice.notes}</span></div> : null}
                <details className="invoice-detail-disclosure">
                  <summary>Invoice detail, payments, and audit history</summary>
                  <div className="invoice-detail-grid">
                    <div>
                      <strong>Line items</strong>
                      {invoice.lineItems?.length ? invoice.lineItems.map((item, index) => (
                        <span key={`${item.id ?? item.name}-${index}`}>{item.quantity} x {item.name}{item.sku ? ` (${item.sku})` : ''} - {fmtMoney(item.total, invoice.currency)}</span>
                      )) : <span>No line items captured.</span>}
                    </div>
                    <div>
                      <strong>Payments</strong>
                      {invoice.payments?.length ? invoice.payments.map((payment) => (
                        <span key={payment.id}>{fmtMoney(payment.amount, invoice.currency)} - {labelStatus(payment.method)} - {fmtDateTime(payment.recordedAt)}</span>
                      )) : <span>No payment has been recorded.</span>}
                    </div>
                    <div>
                      <strong>Audit history</strong>
                      {invoice.activities?.length ? invoice.activities.map((activity) => (
                        <span key={activity.id}>{labelStatus(activity.action)} - {fmtDateTime(activity.createdAt)}</span>
                      )) : <span>No invoice activity captured.</span>}
                    </div>
                  </div>
                </details>
                <div className="invoice-link-grid">
                  <input
                    value={fileDraft.fileUrl}
                    onChange={(event) => setFileDrafts((current) => ({ ...current, [invoice.id]: { ...fileDraft, fileUrl: event.target.value } }))}
                    placeholder="Invoice file URL"
                  />
                  <input
                    value={fileDraft.externalPaymentUrl}
                    onChange={(event) => setFileDrafts((current) => ({ ...current, [invoice.id]: { ...fileDraft, externalPaymentUrl: event.target.value } }))}
                    placeholder="Payment URL"
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => updateFile.mutate({ id: invoice.id, fileUrl: fileDraft.fileUrl, externalPaymentUrl: fileDraft.externalPaymentUrl })}
                    disabled={updateFile.isPending}
                  >
                    Save links
                  </button>
                </div>
                <div className="invoice-action-row">
                  {invoice.status === 'draft' ? (
                    <button type="button" className="btn primary" onClick={() => updateStatus.mutate({ id: invoice.id, status: 'unpaid' })} disabled={updateStatus.isPending}>
                      Publish invoice
                    </button>
                  ) : null}
                  {invoice.fileUrl && (
                    <a className="btn ghost" href={invoice.fileUrl} target="_blank" rel="noreferrer">
                      <Download size={13} /> File
                    </a>
                  )}
                  {invoice.externalPaymentUrl && (
                    <a className="btn ghost" href={invoice.externalPaymentUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> Pay link
                    </a>
                  )}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => setPaymentDrafts((current) => ({ ...current, [invoice.id]: event.target.value }))}
                    placeholder="Payment amount"
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => recordPayment.mutate({ id: invoice.id, amount: parsedPayment })}
                    disabled={!Number.isFinite(parsedPayment) || parsedPayment <= 0 || recordPayment.isPending}
                  >
                    <CreditCard size={13} /> Record payment
                  </button>
                  <button type="button" className="btn ghost" onClick={() => updateStatus.mutate({ id: invoice.id, status: 'paid' })} disabled={updateStatus.isPending || invoice.status === 'paid'}>
                    Mark paid
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => sendInvoice.mutate(invoice.id)}
                    disabled={sendInvoice.isPending || invoice.status === 'draft' || invoice.status === 'void'}
                    title={invoice.status === 'draft' ? 'Publish the invoice before sending it.' : 'Send this invoice to the customer email on file.'}
                  >
                    <Send size={13} /> Send to customer
                  </button>
                  <button type="button" className="btn ghost" onClick={() => updateStatus.mutate({ id: invoice.id, status: 'void' })} disabled={updateStatus.isPending || invoice.status === 'void'}>
                    Void
                  </button>
                  <button type="button" className="btn ghost" onClick={() => duplicateInvoice.mutate(invoice.id)} disabled={duplicateInvoice.isPending}>
                    Duplicate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function orderQuery(surface: OrderSurface, search: string, filters: OrderFilters) {
  const params = new URLSearchParams({
    surface,
    limit: '50',
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  });
  if (search.trim()) params.set('search', search.trim());
  if (filters.orderSearch.trim()) params.set('orderSearch', filters.orderSearch.trim());
  if (filters.customerSearch.trim()) params.set('customerSearch', filters.customerSearch.trim());
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.financialStatus) params.set('financialStatus', filters.financialStatus);
  if (filters.fulfillmentStatus) params.set('fulfillmentStatus', filters.fulfillmentStatus);
  return `?${params.toString()}`;
}

function Kpi({ label, value, sub }: { label: string; value: string | number | null; sub: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="val">{value ?? '...'}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      <div className="name" style={{ marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ marginBottom: action ? 14 : 0 }}>{body}</div>
      {action}
    </div>
  );
}

function SortHeader({
  label,
  sortBy,
  activeSortBy,
  sortDir,
  onSort,
}: {
  label: string;
  sortBy: OrderSortBy;
  activeSortBy: OrderSortBy;
  sortDir: SortDir;
  onSort: (sortBy: OrderSortBy) => void;
}) {
  const active = activeSortBy === sortBy;
  return (
    <button type="button" className={`table-sort-btn${active ? ' active' : ''}`} onClick={() => onSort(sortBy)}>
      <span>{label}</span>
      <ArrowUpDown size={12} />
      {active && <span className="table-sort-dir">{sortDir}</span>}
    </button>
  );
}

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="order-metric">
      <div className="muted">{icon} {label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function MoneyBreakdown({ order }: { order: OrderRow }) {
  return (
    <div className="money-breakdown">
      <span>Subtotal <strong>{fmtMoney(order.subtotal ?? 0, order.currency)}</strong></span>
      <span>Shipping <strong>{fmtMoney(order.totalShipping ?? 0, order.currency)}</strong></span>
      <span>Tax <strong>{fmtMoney(order.totalTax ?? 0, order.currency)}</strong></span>
      <span>Discounts <strong>{fmtMoney(order.totalDiscounts ?? 0, order.currency)}</strong></span>
      {(order.totalRefunded ?? 0) > 0 && <span>Refunded <strong>{fmtMoney(order.totalRefunded ?? 0, order.currency)}</strong></span>}
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="info-block">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function FulfillmentList({ values }: { values: Array<Record<string, unknown>>; currency: string }) {
  if (values.length === 0) return <div className="muted">No fulfillment rows captured.</div>;
  return (
    <div className="compact-list">
      {values.map((entry, index) => {
        const trackingRows = arrayValue(entry.trackingInfo ?? entry.tracking_info);
        const trackingCompany = entry.trackingCompany ?? trackingRows[0]?.company;
        const trackingNumber = entry.trackingNumber ?? trackingRows[0]?.number;
        const trackingUrl = String(entry.trackingUrl ?? entry.tracking_url ?? trackingRows[0]?.url ?? '');
        return (
          <div key={`fulfillment-${index}`}>
            <strong>{labelStatus(String(entry.displayStatus ?? entry.status ?? entry.shipmentStatus ?? `Fulfillment ${index + 1}`))}</strong>
            <span>{[trackingCompany, trackingNumber].filter(Boolean).map(String).join(' - ') || 'No tracking number'}</span>
            {isHttpUrl(trackingUrl) ? <a href={trackingUrl} target="_blank" rel="noreferrer">Track shipment</a> : null}
            {entry.createdAt ? <span>Created {fmtDateTime(String(entry.createdAt))}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function RefundList({ values, currency }: { values: Array<Record<string, unknown>>; currency: string }) {
  if (values.length === 0) return null;
  return (
    <div className="compact-list refund-list">
      {values.map((entry, index) => {
        const amount = Number(entry.amount ?? nestedMoneyAmount(entry.totalRefundedSet) ?? 0);
        return (
          <div key={`refund-${index}`}>
            <strong>{String(entry.note ?? entry.reason ?? `Refund ${index + 1}`)}</strong>
            <span>{fmtMoney(amount, currency)} - {fmtDateTime(String(entry.processedAt ?? entry.createdAt ?? ''))}</span>
          </div>
        );
      })}
    </div>
  );
}

function DesignFiles({ values }: { values: Array<Record<string, unknown>> }) {
  if (values.length === 0) return <div className="muted">No upload/design files captured.</div>;
  return (
    <div className="compact-list design-list">
      {values.map((file, index) => (
        <div key={`file-${index}`}>
          <strong>{String(file.fileName ?? file.lineItemTitle ?? `Design file ${index + 1}`)}</strong>
          <span>{[file.rawWidth && `${String(file.rawWidth)}w`, file.rawHeight && `${String(file.rawHeight)}h`, file.dpi && `${String(file.dpi)} DPI`].filter(Boolean).join(' - ') || 'File metadata captured'}</span>
          {typeof file.previewUrl === 'string' && <a href={file.previewUrl} target="_blank" rel="noreferrer">Preview</a>}
          {typeof file.uploadedFileUrl === 'string' && <a href={file.uploadedFileUrl} target="_blank" rel="noreferrer">Uploaded file</a>}
          {typeof file.printReadyUrl === 'string' && <a href={file.printReadyUrl} target="_blank" rel="noreferrer">Print-ready file</a>}
          {typeof file.adminEditUrl === 'string' && <a href={file.adminEditUrl} target="_blank" rel="noreferrer">Edit production file</a>}
        </div>
      ))}
    </div>
  );
}

function OrderItemProperties({ value }: { value: unknown }) {
  const rows = Array.isArray(value)
    ? value.flatMap((entry) => {
        const row = asRecord(entry);
        const name = row ? String(row.name ?? row.key ?? '').trim() : '';
        const propertyValue = row ? String(row.value ?? '').trim() : '';
        return name && propertyValue ? [{ name, value: propertyValue }] : [];
      })
    : Object.entries(asRecord(value) ?? {}).map(([name, propertyValue]) => ({ name, value: String(propertyValue ?? '') })).filter((entry) => entry.value);
  if (rows.length === 0) return null;
  return (
    <dl className="order-item-properties">
      {rows.map((property) => (
        <div key={`${property.name}-${property.value}`}>
          <dt>{property.name}</dt>
          <dd>{isHttpUrl(property.value) ? <a href={property.value} target="_blank" rel="noreferrer">Open linked file</a> : property.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AddressSummary({ title, value }: { title: string; value: unknown }) {
  const address = asRecord(value);
  if (!address) return <div className="order-address-card"><strong>{title}</strong><span>No address captured</span></div>;
  const name = [address.first_name ?? address.firstName, address.last_name ?? address.lastName].filter(Boolean).join(' ');
  const cityLine = [address.city, address.province ?? address.province_code, address.zip].filter(Boolean).join(', ');
  return (
    <div className="order-address-card">
      <strong>{title}</strong>
      {name ? <span>{String(name)}</span> : null}
      {address.company ? <span>{String(address.company)}</span> : null}
      {address.address1 ? <span>{String(address.address1)}</span> : null}
      {address.address2 ? <span>{String(address.address2)}</span> : null}
      {cityLine ? <span>{cityLine}</span> : null}
      {address.country ? <span>{String(address.country)}</span> : null}
      {address.phone ? <span>{String(address.phone)}</span> : null}
    </div>
  );
}

function ActivityPayload({ value }: { value: unknown }) {
  const record = asRecord(value);
  if (!record) return null;
  const rows = Object.entries(record)
    .filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry))
    .slice(0, 6);
  if (rows.length === 0) return null;
  return <div className="order-activity-meta">{rows.map(([key, entry]) => <span key={key}>{labelStatus(key)}: {String(entry)}</span>)}</div>;
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function nestedMoneyAmount(value: unknown): number | null {
  const root = asRecord(value);
  const shopMoney = asRecord(root?.shopMoney);
  const amount = Number(shopMoney?.amount);
  return Number.isFinite(amount) ? amount : null;
}

function memberName(member: MemberRow) {
  return `${member.firstName} ${member.lastName}`.trim() || member.email;
}

function downloadCsv(rows: OrderRow[], surface: OrderSurface) {
  const header = ['Order', 'Customer', 'Email', 'Date', 'Total', 'Payment', 'Fulfillment', 'Files'];
  const lines = rows.map((row) => [
    row.orderNumber,
    row.customerName ?? row.companyName ?? '',
    row.customerEmail ?? '',
    row.processedAt ?? '',
    row.totalPrice.toFixed(2),
    row.financialStatus ?? '',
    row.fulfillmentStatus ?? row.fulfillmentMode,
    String(row.designFiles.length),
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orders-${surface}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function fmtMoney(value: number, currency = 'USD') {
  return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
}

function fmtDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function labelStatus(value: string | null) {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

function invoiceStatusLabel(value: string | null) {
  if (!value) return 'Unknown';
  if (value === 'unpaid') return 'Due';
  return labelStatus(value);
}

function paymentTone(value: string | null) {
  if (value === 'paid') return 'success';
  if (value === 'refunded' || value === 'partially_refunded') return 'info';
  if (value === 'failed' || value === 'voided') return 'danger';
  return 'warn';
}

function fulfillmentTone(value: string | null, mode: string) {
  if (value === 'fulfilled' || value === 'complete' || value === 'completed') return 'success';
  if (value === 'cancelled') return 'danger';
  if (mode === 'pickup') return 'warn';
  return 'info';
}
