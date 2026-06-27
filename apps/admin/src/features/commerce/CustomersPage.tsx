import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Download, Phone, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

interface CustomerRow {
  id: string;
  shopifyCustomerId: string | null;
  companyName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  tags: string[];
  totalSpent: number;
  ordersCount: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
  lifecycle: string;
  clvTier: string;
  healthScore: number | null;
  churnRisk: string;
  customerUserCount: number;
  listCount: number;
  updatedAt: string;
}

interface CustomerListResponse {
  data: CustomerRow[];
  meta: { count: number; limit: number };
}

interface CustomerStats {
  count: number;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  atRiskCount: number;
  vipCount: number;
  dormantCount: number;
}

const SEGMENTS = ['vip', 'loyal', 'active', 'dormant', 'new'];
const CHURN_RISKS = ['low', 'medium', 'high', 'critical', 'unknown'];
const SORTS = ['recent_order', 'total_spent', 'orders_count', 'health_score', 'name'] as const;

export function CustomersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('customers.write');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [churnRisk, setChurnRisk] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('recent_order');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const query = useMemo(() => customerQuery({ search, segment, churnRisk, tag, sort }), [search, segment, churnRisk, tag, sort]);
  const customers = useQuery({ queryKey: ['commerce', 'customers', query], queryFn: () => fetchCustomers(query) });
  const stats = useQuery({ queryKey: ['commerce', 'customers', 'stats'], queryFn: () => fetchCustomerStats() });
  const rows = customers.data?.data ?? [];
  const tagOptions = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(), [rows]);

  const calculateInsights = useMutation({
    mutationFn: () => adminApi.recalculateCustomerInsights(),
    onSuccess: () => {
      toast.success(t('customers.insights_started'));
      qc.invalidateQueries({ queryKey: ['commerce', 'customers'] });
    },
    onError: (error) => toast.error(t('customers.insights_failed'), { description: apiErrorMessage(error) }),
  });

  const generateAlarms = useMutation({
    mutationFn: () => adminApi.generateCustomerAlarms(),
    onSuccess: () => {
      toast.success(t('customers.alarms_generated'));
      qc.invalidateQueries({ queryKey: ['commerce', 'customers'] });
    },
    onError: (error) => toast.error(t('customers.alarms_failed'), { description: apiErrorMessage(error) }),
  });

  const clearFilters = () => {
    setSearch('');
    setSegment('');
    setChurnRisk('');
    setTag('');
    setSort('recent_order');
  };
  const hasFilters = Boolean(search || segment || churnRisk || tag || sort !== 'recent_order');
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <>
      <PageHeader
        titleI18nKey="customers.title"
        subtitleI18nKey="customers.subtitle"
        actions={(
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => downloadCsv(selectedRows.length ? selectedRows : rows)} disabled={rows.length === 0}>
              <Download size={14} /> {t('customers.bulk_export')}
            </button>
            {canWrite && (
              <>
                <button type="button" className="btn" onClick={() => calculateInsights.mutate()} disabled={calculateInsights.isPending}>
                  <Activity size={14} /> {t('customers.recalculate_insights')}
                </button>
                <button type="button" className="btn" onClick={() => generateAlarms.mutate()} disabled={generateAlarms.isPending}>
                  <AlertTriangle size={14} /> {t('customers.generate_alarms')}
                </button>
              </>
            )}
          </div>
        )}
      />

      <div className="kpis" style={{ marginBottom: 14 }}>
        <Kpi label={t('customers.kpi_count')} value={stats.data?.count ?? null} sub={t('customers.kpi_sub_count')} />
        <Kpi label={t('customers.kpi_revenue')} value={stats.data ? fmtMoney(stats.data.totalRevenue) : null} sub={t('customers.kpi_sub_revenue')} />
        <Kpi label={t('customers.kpi_orders')} value={stats.data?.totalOrders ?? null} sub={t('customers.kpi_sub_orders')} />
        <Kpi label={t('customers.kpi_at_risk')} value={stats.data?.atRiskCount ?? null} sub={t('customers.kpi_sub_at_risk')} />
        <Kpi label={t('customers.kpi_vip')} value={stats.data?.vipCount ?? null} sub={t('customers.kpi_sub_vip')} />
      </div>

      <div className="customers-toolbar">
        <div className="orders-search" style={{ minWidth: 240, flex: 1 }}>
          <Search size={14} />
          <input
            id="customers-search"
            placeholder={t('customers.search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select value={segment} aria-label={t('customers.filter_segment')} onChange={(event) => setSegment(event.target.value)}>
          <option value="">{t('customers.filter_segment_all')}</option>
          {SEGMENTS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={churnRisk} aria-label={t('customers.filter_churn_risk')} onChange={(event) => setChurnRisk(event.target.value)}>
          <option value="">{t('customers.filter_churn_all')}</option>
          {CHURN_RISKS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={tag} aria-label={t('customers.filter_tag')} onChange={(event) => setTag(event.target.value)}>
          <option value="">{t('customers.filter_tag_all')}</option>
          {tagOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={sort} aria-label={t('customers.sort_label')} onChange={(event) => setSort(event.target.value as (typeof SORTS)[number])}>
          {SORTS.map((value) => <option key={value} value={value}>{t(`customers.sort_${value}`)}</option>)}
        </select>
        <button type="button" className="btn ghost" onClick={() => { customers.refetch(); stats.refetch(); }}>
          <RefreshCw size={14} /> {t('common.refresh')}
        </button>
        {hasFilters && (
          <button type="button" className="btn ghost" onClick={clearFilters}>
            <X size={13} /> {t('customers.clear_filters')}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="customers-bulk-bar">
          <span>{t('customers.selected_label', { count: selected.size })}</span>
          <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
            <X size={13} /> {t('customers.bulk_clear')}
          </button>
        </div>
      )}

      {customers.isLoading && <StateBlock title={t('common.loading')} body={t('customers.loading_body')} />}
      {customers.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(customers.error)} action={<button type="button" className="btn" onClick={() => customers.refetch()}>{t('common.retry')}</button>} />}
      {customers.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('customers.empty_title')}
          body={t('customers.empty_state')}
          action={<button type="button" className="btn primary" onClick={() => customers.refetch()}><RefreshCw size={14} /> {t('common.refresh')}</button>}
        />
      )}
      {customers.isSuccess && rows.length > 0 && (
        <div className="data-card">
          <table className="data-table customers-table" id="table-customers">
            <thead>
              <tr>
                <th><input type="checkbox" checked={rows.every((row) => selected.has(row.id))} onChange={() => toggleAll(rows, selected, setSelected)} aria-label={t('customers.select_all')} /></th>
                <th>{t('customers.columns.customer')}</th>
                <th>{t('customers.columns.lifecycle')}</th>
                <th>{t('customers.columns.health')}</th>
                <th>{t('customers.columns.orders')}</th>
                <th>{t('customers.columns.revenue')}</th>
                <th>{t('customers.columns.last_order')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id} id={`row-customer-${customer.id}`}>
                  <td><input type="checkbox" checked={selected.has(customer.id)} onChange={() => toggleOne(customer.id, setSelected)} aria-label={t('customers.select_customer')} /></td>
                  <td>
                    <div className="name">{customer.name ?? customer.companyName}</div>
                    <div className="muted">{customer.email ?? '—'}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {customer.tags.slice(0, 4).map((entry) => <span key={entry} className="chip">{entry}</span>)}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${lifecycleTone(customer.lifecycle, customer.churnRisk)}`}>{label(customer.lifecycle)}</span>
                    <div className="muted" style={{ marginTop: 4 }}>{label(customer.clvTier)}</div>
                  </td>
                  <td>
                    <strong>{customer.healthScore ?? '—'}</strong>
                    <div className={`muted ${customer.churnRisk === 'high' || customer.churnRisk === 'critical' ? 'danger-text' : ''}`}>
                      {label(customer.churnRisk)}
                    </div>
                  </td>
                  <td>{customer.ordersCount}</td>
                  <td><strong>{fmtMoney(customer.totalSpent)}</strong></td>
                  <td className="muted">{fmtDate(customer.lastOrderAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {customer.phone && (
                      <a className="btn ghost" href={`tel:${customer.phone.replace(/\s/g, '')}`} title={t('customers.call_customer')}>
                        <Phone size={13} />
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

function fetchCustomers(query: string) {
  return adminApi.commerceCustomers(query) as Promise<CustomerListResponse>;
}

function fetchCustomerStats() {
  return adminApi.commerceCustomerStats('?limit=100') as Promise<CustomerStats>;
}

function customerQuery(input: { search: string; segment: string; churnRisk: string; tag: string; sort: string }) {
  const params = new URLSearchParams({ limit: '100', sort: input.sort });
  if (input.search.trim()) params.set('search', input.search.trim());
  if (input.segment) params.set('segment', input.segment);
  if (input.churnRisk) params.set('churnRisk', input.churnRisk);
  if (input.tag) params.set('tag', input.tag);
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

function toggleOne(id: string, setSelected: (update: (current: Set<string>) => Set<string>) => void) {
  setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function toggleAll(rows: CustomerRow[], selected: Set<string>, setSelected: (update: (current: Set<string>) => Set<string>) => void) {
  setSelected((current) => {
    const next = new Set(current);
    const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
    rows.forEach((row) => {
      if (allSelected) next.delete(row.id);
      else next.add(row.id);
    });
    return next;
  });
}

function downloadCsv(rows: CustomerRow[]) {
  const header = ['Name', 'Email', 'Phone', 'Lifecycle', 'Churn risk', 'Orders', 'Total spent', 'Last order', 'Tags'];
  const lines = rows.map((row) => [
    row.name ?? row.companyName,
    row.email ?? '',
    row.phone ?? '',
    row.lifecycle,
    row.churnRisk,
    String(row.ordersCount),
    row.totalSpent.toFixed(2),
    row.lastOrderAt ?? '',
    row.tags.join('; '),
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function label(value: string) {
  return value.replace(/_/g, ' ');
}

function lifecycleTone(lifecycle: string, churnRisk: string) {
  if (churnRisk === 'critical' || churnRisk === 'high') return 'danger';
  if (lifecycle === 'vip' || lifecycle === 'loyal') return 'success';
  if (lifecycle === 'dormant') return 'warn';
  return 'info';
}
