import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, ChevronDown, ChevronUp, FileText, RotateCw, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import {
  fetchBuyerOrder,
  fetchBuyerOrders,
  fetchReorderTemplates,
  reorderLineItem,
  reorderOrder,
  type BuyerOrder,
  type BuyerOrderDetail,
  type OrderStatusValue,
  type ReorderResult,
} from '@/lib/portal';

const QK = ['orders'] as const;
const QK_TEMPLATES = ['reorder-templates'] as const;

const STATUS_TONE: Record<OrderStatusValue, string> = {
  pending: 'warn',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'danger',
};

const TABS: ('all' | OrderStatusValue)[] = ['all', 'pending', 'paid', 'fulfilled'];

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function ReorderNotice({ result }: { result: ReorderResult | null }) {
  if (!result) return null;
  const tone = result.action === 'checkout' ? 'success' : result.action === 'review_portal_cart' ? 'info' : 'danger';
  return (
    <div className={`portal-alert ${tone}`}>
      <strong>{result.action === 'checkout' ? 'Checkout ready' : result.action === 'review_portal_cart' ? 'Account review cart saved' : 'Not reorderable'}</strong>
      <span>{result.message}</span>
      {result.checkoutUrl ? <a className="btn primary" href={result.checkoutUrl}>Proceed to checkout</a> : null}
      {!result.checkoutUrl && result.action === 'review_portal_cart' ? <Link to="/cart" className="btn">Open cart</Link> : null}
    </div>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const detail = useQuery({ queryKey: ['order-detail', orderId], queryFn: () => fetchBuyerOrder(orderId) });
  const [result, setResult] = useState<ReorderResult | null>(null);
  const reorderAll = useMutation({ mutationFn: () => reorderOrder(orderId), onSuccess: setResult });
  const reorderOne = useMutation({
    mutationFn: (lineItemId: string) => reorderLineItem(orderId, lineItemId),
    onSuccess: setResult,
  });

  if (detail.isLoading) {
    return <div className="buyer-order-body"><div className="muted">Loading order detail...</div></div>;
  }
  if (detail.isError) {
    return <div className="buyer-order-body"><ErrorState title="Could not load order detail" error={detail.error} retry={() => detail.refetch()} /></div>;
  }

  const order = detail.data as BuyerOrderDetail;
  return (
    <div className="buyer-order-body">
      <ReorderNotice result={result} />

      <div className="order-detail-grid">
        <div className="portal-info-card">
          <span>Order status</span>
          <strong>{order.fulfillmentStatus ?? order.status}</strong>
          <small>{order.tracking.trackingNumber ? `Tracking ${order.tracking.trackingNumber}` : 'Tracking appears when a carrier is assigned.'}</small>
        </div>
        <div className="portal-info-card">
          <span>Total breakdown</span>
          <strong>{fmtMoney(order.totalUsd)}</strong>
          <small>Tax {fmtMoney(order.taxUsd)} - shipping {fmtMoney(order.shippingUsd)}</small>
        </div>
        <div className="portal-info-card">
          <span>Reorder</span>
          <strong>{order.items.filter((item) => item.canReorder).length} eligible items</strong>
          <button type="button" className="btn primary" disabled={!order.canReorder || reorderAll.isPending} onClick={() => reorderAll.mutate()}>
            <RotateCw size={12} /> Reorder all eligible
          </button>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>Total</th>
            <th>Order properties</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
                {item.variantTitle ? <div className="muted">{item.variantTitle}</div> : null}
                {item.designFiles.length > 0 && (
                  <div className="portal-file-list">
                    {item.designFiles.map((file) => (
                      <span key={file.id}><FileText size={11} /> {file.name}</span>
                    ))}
                  </div>
                )}
              </td>
              <td className="muted">{item.sku || '-'}</td>
              <td>{item.qty}</td>
              <td>{fmtMoney(item.lineTotalUsd)}</td>
              <td>
                {item.properties.length === 0 ? <span className="muted">No item properties</span> : (
                  <div className="property-list">
                    {item.properties.slice(0, 4).map((property) => (
                      <span key={`${item.id}-${property.name}`}><strong>{property.name}:</strong> {property.value}</span>
                    ))}
                  </div>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div className="reorder-line-state">
                  <span className={`pill ${item.canReorder ? 'success' : 'danger'}`}>{item.canReorder ? 'Ready' : 'Needs review'}</span>
                  <div className="muted">{item.reorderReason || item.reason}</div>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={!item.canReorder || reorderOne.isPending}
                  title={item.reason}
                  onClick={() => reorderOne.mutate(item.id)}
                >
                  <RotateCw size={11} /> Reorder item
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="order-address-grid">
        <div>
          <h4>Shipping address</h4>
          <pre>{order.shippingAddress?.formatted ?? 'No shipping address captured.'}</pre>
        </div>
        <div>
          <h4>Billing address</h4>
          <pre>{order.billingAddress?.formatted ?? 'No billing address captured.'}</pre>
        </div>
      </div>
    </div>
  );
}

function OrderRow({ order, expanded, onToggle }: { order: BuyerOrder; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={`buyer-order${expanded ? ' expanded' : ''}`} id={`order-${order.id}`}>
      <button type="button" className="buyer-order-head" onClick={onToggle} aria-expanded={expanded}>
        <div>
          <div className="name">{order.orderNumber}</div>
          <div className="muted">{order.placedAt} - {t('orders.placed_by')} {order.placedBy}</div>
        </div>
        <div className="buyer-order-meta">
          <span className="muted">{t('orders.items_label', { count: order.itemsCount })}</span>
          <strong>{fmtMoney(order.totalUsd)}</strong>
          <span className={`pill ${STATUS_TONE[order.status]}`}>{t(`orders.status.${order.status}`)}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {expanded && <OrderDetail orderId={order.id} />}
    </div>
  );
}

function OrdersView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'all' | OrderStatusValue>('all');
  const [sort, setSort] = useState<'date' | 'total'>('date');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [quickResult, setQuickResult] = useState<ReorderResult | null>(null);
  const { data: orderPage, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...QK, tab, search, limit, cursor],
    queryFn: () => fetchBuyerOrders({
      status: tab,
      search: search.trim() || undefined,
      limit,
      cursor: cursor ?? undefined,
    }),
  });
  const { data: templates = [] } = useQuery({ queryKey: QK_TEMPLATES, queryFn: fetchReorderTemplates });
  const quickReorder = useMutation({ mutationFn: (orderId: string) => reorderOrder(orderId), onSuccess: setQuickResult });
  const orders = orderPage?.data ?? [];
  const meta = orderPage?.meta ?? { count: 0, pageCount: 0, limit, cursor: null, nextCursor: null };

  const sortedRows = useMemo(() => {
    const list = orders.slice();
    if (sort === 'total') list.sort((a, b) => b.totalUsd - a.totalUsd);
    else list.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
    return list;
  }, [orders, sort]);

  const total = meta.count;
  const visible = orders.length;
  const totalSpent = orders.reduce((sum, order) => sum + order.totalUsd, 0);
  const avgOrder = visible > 0 ? totalSpent / visible : 0;
  const pending = orders.filter((order) => order.status === 'pending').length;
  const currentOffset = Number(cursor ?? 0) || 0;

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <PageHeader titleI18nKey="orders.title" subtitleI18nKey="orders.subtitle" />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('orders.kpi_count')}</div><div className="val">{total}</div><div className="sub">matching orders</div></div>
        <div className="kpi"><div className="label">{t('orders.kpi_spent')}</div><div className="val">{fmtMoney(totalSpent)}</div><div className="sub">visible page</div></div>
        <div className="kpi"><div className="label">{t('orders.kpi_avg')}</div><div className="val">{fmtMoney(avgOrder)}</div><div className="sub">visible page</div></div>
        <div className="kpi"><div className="label">{t('orders.kpi_pending')}</div><div className="val">{pending}</div><div className="sub">visible page</div></div>
      </div>

      <div className="orders-grid">
        <div>
          <div className="orders-toolbar">
            <div className="tabs" role="tablist" style={{ flex: 1 }}>
              {TABS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  className={`tab${tab === value ? ' active' : ''}`}
                  onClick={() => {
                    setCursor(null);
                    setTab(value);
                  }}
                >
                  {value === 'all' ? t('orders.tab_all') : t(`orders.status.${value}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setSort((current) => current === 'date' ? 'total' : 'date')}
            >
              <ArrowUpDown size={12} />
              {sort === 'date' ? t('orders.sort_by_date') : t('orders.sort_by_total')}
            </button>
          </div>

          <div className="portal-list-controls">
            <label className="portal-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => {
                  setCursor(null);
                  setSearch(event.target.value);
                }}
                placeholder="Search order number, email, or phone"
              />
            </label>
            <label className="portal-page-size">
              Show
              <select
                value={limit}
                onChange={(event) => {
                  setCursor(null);
                  setLimit(Number(event.target.value));
                }}
              >
                {[10, 50, 100, 150].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className="portal-page-status">
              {total === 0 ? 'No matching orders' : `${currentOffset + 1}-${currentOffset + visible} of ${total}`}
            </div>
          </div>

          {isError ? (
            <ErrorState title="Could not load orders" error={error} retry={() => refetch()} />
          ) : sortedRows.length === 0 ? (
            <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
              {isLoading ? t('common.loading') : t('orders.empty_state')}
            </div>
          ) : (
            <div className="buyer-orders-list">
              {sortedRows.map((order) => (
                <OrderRow key={order.id} order={order} expanded={expanded.has(order.id)} onToggle={() => toggle(order.id)} />
              ))}
              <div className="portal-pagination">
                <button
                  type="button"
                  className="btn"
                  disabled={currentOffset === 0 || isLoading}
                  onClick={() => setCursor(String(Math.max(0, currentOffset - limit)))}
                >
                  Previous
                </button>
                <span>{total === 0 ? 'Page 0' : `Page ${Math.floor(currentOffset / limit) + 1}`}</span>
                <button
                  type="button"
                  className="btn"
                  disabled={!meta.nextCursor || isLoading}
                  onClick={() => setCursor(meta.nextCursor)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="orders-side">
          <div className="section" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0, fontSize: 13 }}>{t('orders.side_quick_reorder')}</h3>
            <ReorderNotice result={quickResult} />
            {templates.length === 0 ? (
              <div className="muted">{t('reorder.empty_state')}</div>
            ) : (
              <ul className="quick-reorder-list">
                {templates.slice(0, 3).map((template) => (
                  <li key={template.id}>
                    <div>
                      <div className="name">{template.name}</div>
                      <div className="muted">{template.items.length} items</div>
                    </div>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!template.canReorder || quickReorder.isPending}
                      onClick={() => quickReorder.mutate(template.orderId)}
                    >
                      <RotateCw size={11} /> {t('reorder.use_template')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="section" style={{ padding: 16, marginTop: 12 }}>
            <h3 style={{ marginTop: 0, fontSize: 13 }}>{t('orders.side_summary')}</h3>
            <div className="orders-summary-row"><span>{t('orders.side_this_month')}</span><strong>{fmtMoney(orders.filter((order) => order.placedAt.startsWith(new Date().toISOString().slice(0, 7))).reduce((sum, order) => sum + order.totalUsd, 0))}</strong></div>
            <div className="orders-summary-row"><span>Visible page value</span><strong>{fmtMoney(totalSpent)}</strong></div>
            <div className="orders-summary-row"><span>Matching records</span><strong>{total}</strong></div>
          </div>
        </aside>
      </div>
    </>
  );
}

export const Route = createFileRoute('/orders')({ component: OrdersView });
