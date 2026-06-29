import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { OrderSurface, TransferOrderToMemberInput } from '@factory-engine-pro/contracts';
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

export function OrdersPage() {
  const { t } = useTranslation();
  const [surface, setSurface] = useState<OrderSurface>('all');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const query = useMemo(() => orderQuery(surface, search), [surface, search]);
  const orders = useQuery({ queryKey: ['commerce', 'orders', surface, search], queryFn: () => fetchOrders(query) });
  const stats = useQuery({ queryKey: ['commerce', 'orders', 'stats', surface], queryFn: () => fetchStats(orderQuery(surface, '')) });
  const rows = orders.data?.data ?? [];
  const shopifyStore = import.meta.env.VITE_SHOPIFY_ADMIN_STORE as string | undefined;

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
                <th>{t('orders.columns.order')}</th>
                <th>{t('orders.columns.customer')}</th>
                <th>{t('orders.columns.date')}</th>
                <th>{t('orders.columns.total')}</th>
                <th>{t('orders.columns.payment')}</th>
                <th>{t('orders.columns.fulfillment')}</th>
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
                  <td className="muted">{fmtDate(order.processedAt)}</td>
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
        />
      )}
    </>
  );
}

function OrderDetailDialog({ orderId, shopifyStore, onClose }: { orderId: string; shopifyStore?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ targetMemberId: '', axis: 'support', note: '' });
  const [lastTransfer, setLastTransfer] = useState<TransferResult | null>(null);
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
            <section className="modal-section">
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
            </section>

            <section className="modal-section">
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
                        </td>
                        <td>{String(item.quantity ?? 1)}</td>
                        <td>{fmtMoney(Number(item.totalPrice ?? item.price ?? 0) * Number(item.quantity ?? 1), order.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="modal-section">
              <h3>{t('orders.modal.fulfillment', { defaultValue: 'Fulfillment, refunds, and files' })}</h3>
              <FulfillmentList values={arrayValue(order.fulfillments)} currency={order.currency} />
              <RefundList values={arrayValue(order.refunds)} currency={order.currency} />
              <DesignFiles values={order.designFiles} />
            </section>
          </main>

          <aside className="order-modal-side">
            <section className="modal-section">
              <h3>{t('orders.modal.customer_stats', { defaultValue: 'Shopify customer stats' })}</h3>
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
                    <div key={item.id} className={item.id === order.id ? 'active' : ''}>
                      <strong>{item.orderNumber}</strong>
                      <span>{fmtDateTime(item.processedAt ?? item.createdAt ?? null)}</span>
                      <span>{fmtMoney(item.totalPrice, item.currency)}</span>
                    </div>
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

function orderQuery(surface: OrderSurface, search: string) {
  const params = new URLSearchParams({ surface, limit: '50' });
  if (search.trim()) params.set('search', search.trim());
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
      {values.map((entry, index) => (
        <div key={`fulfillment-${index}`}>
          <strong>{String(entry.status ?? entry.shipmentStatus ?? `Fulfillment ${index + 1}`)}</strong>
          <span>{[entry.trackingCompany, entry.trackingNumber].filter(Boolean).map(String).join(' - ') || 'No tracking number'}</span>
        </div>
      ))}
    </div>
  );
}

function RefundList({ values, currency }: { values: Array<Record<string, unknown>>; currency: string }) {
  if (values.length === 0) return null;
  return (
    <div className="compact-list refund-list">
      {values.map((entry, index) => (
        <div key={`refund-${index}`}>
          <strong>{String(entry.note ?? `Refund ${index + 1}`)}</strong>
          <span>{fmtMoney(Number(entry.amount ?? 0), currency)} - {fmtDateTime(String(entry.createdAt ?? ''))}</span>
        </div>
      ))}
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
        </div>
      ))}
    </div>
  );
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
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
