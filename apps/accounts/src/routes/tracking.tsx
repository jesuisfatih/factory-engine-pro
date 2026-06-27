import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, ExternalLink, Truck, CheckCircle2, Circle, Package, MapPin,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { fetchTrackingOrders, type TrackingOrder } from '@/lib/mock';

const QK = ['tracking'] as const;

type Filter = 'all' | 'in_transit' | 'delivered';

const FILTERS: Filter[] = ['all', 'in_transit', 'delivered'];

const STATUS_TONE: Record<TrackingOrder['status'], string> = {
  pending: 'warn', in_transit: 'info', delivered: 'success',
};

function TrackingView() {
  const { t } = useTranslation();
  const { data: orders = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchTrackingOrders });

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const text = search.toLowerCase().trim();
    return orders.filter((order) => {
      if (filter === 'in_transit' && order.status !== 'in_transit') return false;
      if (filter === 'delivered' && order.status !== 'delivered') return false;
      if (text && !order.orderNumber.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [orders, search, filter]);

  const selected = orders.find((order) => order.id === selectedId) ?? filtered[0] ?? null;

  const total = orders.length;
  const inTransit = orders.filter((order) => order.status === 'in_transit').length;
  const delivered = orders.filter((order) => order.status === 'delivered').length;
  const pending = orders.filter((order) => order.status === 'pending').length;

  return (
    <>
      <PageHeader titleI18nKey="tracking.title" subtitleI18nKey="tracking.subtitle" />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('tracking.kpi_total')}</div><div className="val">{total}</div><div className="sub">tracked</div></div>
        <div className="kpi"><div className="label">{t('tracking.kpi_in_transit')}</div><div className="val">{inTransit}</div><div className="sub">in motion</div></div>
        <div className="kpi"><div className="label">{t('tracking.kpi_delivered')}</div><div className="val">{delivered}</div><div className="sub">arrived</div></div>
        <div className="kpi"><div className="label">{t('tracking.kpi_pending')}</div><div className="val">{pending}</div><div className="sub">awaiting carrier</div></div>
      </div>

      <div className="orders-toolbar">
        <div className="orders-search" style={{ flex: 1 }}>
          <Search size={14} />
          <input placeholder={t('tracking.search_placeholder')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="tabs" role="tablist">
          {FILTERS.map((value) => (
            <button key={value} type="button" role="tab" className={`tab${filter === value ? ' active' : ''}`} onClick={() => setFilter(value)}>
              {t(`tracking.filter_${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="tracking-shell">
        <aside className="tracking-list">
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              {isLoading ? t('common.loading') : t('tracking.empty_state')}
            </div>
          ) : filtered.map((order) => (
            <button
              key={order.id}
              type="button"
              className={`tracking-row${selected?.id === order.id ? ' active' : ''}`}
              onClick={() => setSelectedId(order.id)}
            >
              <div>
                <div className="name">{order.orderNumber}</div>
                <div className="muted">{order.customerName}</div>
                <div className="muted" style={{ fontSize: 10 }}>
                  {order.trackingNumber !== '—' ? `${order.carrier} · ${order.trackingNumber}` : '—'}
                </div>
              </div>
              <span className={`pill ${STATUS_TONE[order.status]}`}>{t(`tracking.status.${order.status}`)}</span>
            </button>
          ))}
        </aside>

        <main className="tracking-detail">
          {!selected ? (
            <div className="muted" style={{ padding: 24, textAlign: 'center' }}>{t('tracking.list_empty')}</div>
          ) : (
            <>
              <header>
                <h3>{selected.orderNumber}</h3>
                <span className={`pill ${STATUS_TONE[selected.status]}`}>{t(`tracking.status.${selected.status}`)}</span>
              </header>

              <ol className="tracking-timeline">
                {selected.steps.map((step) => (
                  <li key={step.key} className={step.done ? 'done' : 'pending'}>
                    <span className="ts-icon">{step.done ? <CheckCircle2 size={14} /> : <Circle size={14} />}</span>
                    <div>
                      <div className="name">{step.label}</div>
                      <div className="muted">{step.at ?? '—'}</div>
                    </div>
                  </li>
                ))}
              </ol>

              {selected.trackingNumber !== '—' && (
                <div className="tracking-info">
                  <div>
                    <div className="label"><Truck size={11} /> {t('tracking.carrier')}</div>
                    <div className="val">{selected.carrier}</div>
                  </div>
                  <div>
                    <div className="label"><Package size={11} /> {t('tracking.tracking_number')}</div>
                    <div className="val" style={{ fontFamily: 'ui-monospace, monospace' }}>{selected.trackingNumber}</div>
                  </div>
                  <button type="button" className="btn">
                    <ExternalLink size={12} /> {t('tracking.track_on_carrier')}
                  </button>
                </div>
              )}

              <div className="tracking-address">
                <div className="label"><MapPin size={11} /> {t('tracking.ship_to')}</div>
                <pre>{selected.shippingAddress}</pre>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

export const Route = createFileRoute('/tracking')({ component: TrackingView });
