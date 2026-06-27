import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Eye, RotateCw, ChevronDown, ChevronUp, ArrowUpDown,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { fetchBuyerOrders, fetchReorderTemplates, type BuyerOrder, type OrderStatusValue } from '@/lib/mock';

const QK = ['orders'] as const;
const QK_TEMPLATES = ['reorder-templates'] as const;

const STATUS_TONE: Record<OrderStatusValue, string> = {
  pending: 'warn', paid: 'info', fulfilled: 'success', cancelled: 'danger',
};

const TABS: ('all' | OrderStatusValue)[] = ['all', 'pending', 'paid', 'fulfilled'];

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function OrderRow({ order, expanded, onToggle }: { order: BuyerOrder; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={`buyer-order${expanded ? ' expanded' : ''}`} id={`order-${order.id}`}>
      <button type="button" className="buyer-order-head" onClick={onToggle} aria-expanded={expanded}>
        <div>
          <div className="name">{order.orderNumber}</div>
          <div className="muted">{order.placedAt} · {t('orders.placed_by')} {order.placedBy}</div>
        </div>
        <div className="buyer-order-meta">
          <span className="muted">{t('orders.items_label', { count: order.itemsCount })}</span>
          <strong>{fmtMoney(order.totalUsd)}</strong>
          <span className={`pill ${STATUS_TONE[order.status]}`}>{t(`orders.status.${order.status}`)}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {expanded && (
        <div className="buyer-order-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.sku}>
                  <td className="muted">{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.qty}</td>
                  <td>{fmtMoney(item.unitPriceUsd)}</td>
                  <td>{fmtMoney(item.qty * item.unitPriceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="buyer-order-actions">
            <button type="button" className="btn"><Eye size={13} /> {t('orders.view')}</button>
            <button type="button" className="btn primary"><RotateCw size={13} /> {t('orders.reorder')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersView() {
  const { t } = useTranslation();
  const { data: orders = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchBuyerOrders });
  const { data: templates = [] } = useQuery({ queryKey: QK_TEMPLATES, queryFn: fetchReorderTemplates });

  const [tab, setTab] = useState<'all' | OrderStatusValue>('all');
  const [sort, setSort] = useState<'date' | 'total'>('date');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sortedRows = useMemo(() => {
    const filtered = tab === 'all' ? orders : orders.filter((order) => order.status === tab);
    const list = filtered.slice();
    if (sort === 'total') list.sort((a, b) => b.totalUsd - a.totalUsd);
    else list.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
    return list;
  }, [orders, tab, sort]);

  const total = orders.length;
  const totalSpent = orders.reduce((sum, order) => sum + order.totalUsd, 0);
  const avgOrder = total > 0 ? totalSpent / total : 0;
  const pending = orders.filter((order) => order.status === 'pending').length;

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <PageHeader
        titleI18nKey="orders.title"
        subtitleI18nKey="orders.subtitle"
        actions={(
          <button type="button" className="btn primary">
            <Plus size={14} /> {t('orders.new_order')}
          </button>
        )}
      />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('orders.kpi_count')}</div><div className="val">{total}</div><div className="sub">orders placed</div></div>
        <div className="kpi"><div className="label">{t('orders.kpi_spent')}</div><div className="val">{fmtMoney(totalSpent)}</div><div className="sub">gross</div></div>
        <div className="kpi"><div className="label">{t('orders.kpi_avg')}</div><div className="val">{fmtMoney(avgOrder)}</div><div className="sub">across all</div></div>
        <div className="kpi"><div className="label">{t('orders.kpi_pending')}</div><div className="val">{pending}</div><div className="sub">awaiting payment</div></div>
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
                  onClick={() => setTab(value)}
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

          {sortedRows.length === 0 ? (
            <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
              {isLoading ? t('common.loading') : t('orders.empty_state')}
            </div>
          ) : (
            <div className="buyer-orders-list">
              {sortedRows.map((order) => (
                <OrderRow key={order.id} order={order} expanded={expanded.has(order.id)} onToggle={() => toggle(order.id)} />
              ))}
            </div>
          )}
        </div>

        <aside className="orders-side">
          <div className="section" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0, fontSize: 13 }}>{t('orders.side_quick_reorder')}</h3>
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
                    <button type="button" className="btn primary"><RotateCw size={11} /> {t('reorder.use_template')}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="section" style={{ padding: 16, marginTop: 12 }}>
            <h3 style={{ marginTop: 0, fontSize: 13 }}>{t('orders.side_summary')}</h3>
            <div className="orders-summary-row"><span>{t('orders.side_this_month')}</span><strong>{fmtMoney(orders.filter((order) => order.placedAt.startsWith('2026-06')).reduce((sum, order) => sum + order.totalUsd, 0))}</strong></div>
            <div className="orders-summary-row"><span>{t('orders.side_last_30d')}</span><strong>{fmtMoney(totalSpent)}</strong></div>
            <div className="orders-summary-row"><span>{t('orders.side_lifetime')}</span><strong>{fmtMoney(totalSpent * 4.2)}</strong></div>
          </div>
        </aside>
      </div>
    </>
  );
}

export const Route = createFileRoute('/orders')({ component: OrdersView });
