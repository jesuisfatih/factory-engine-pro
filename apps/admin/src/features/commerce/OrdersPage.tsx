import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, FileText, MapPin, RefreshCw, Search, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrderSurface } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';

interface OrderRow {
  id: string;
  shopifyOrderId: string | null;
  orderNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  companyName: string | null;
  totalPrice: number;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentMode: string;
  pickupStatus: string | null;
  processedAt: string | null;
  hasDesignFiles: boolean;
  designFiles: Array<Record<string, unknown>>;
  lineItems: Array<Record<string, unknown>>;
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

const SURFACES: { id: OrderSurface; key: string }[] = [
  { id: 'all', key: 'orders.tab_all' },
  { id: 'pickup', key: 'orders.tab_pickup' },
  { id: 'design_files', key: 'orders.tab_design_files' },
];

export function OrdersPage() {
  const { t } = useTranslation();
  const [surface, setSurface] = useState<OrderSurface>('all');
  const [search, setSearch] = useState('');
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
                <tr key={order.id} id={`row-order-${order.id}`}>
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
                    <div className="muted">{order.customerEmail ?? '—'}</div>
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
    </>
  );
}

function fetchOrders(query: string) {
  return adminApi.orders(query) as Promise<OrderListResponse>;
}

function fetchStats(query: string) {
  return adminApi.orderStats(query) as Promise<OrderStats>;
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
      <div className="val">{value ?? '…'}</div>
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
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function labelStatus(value: string | null) {
  if (!value) return '—';
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
