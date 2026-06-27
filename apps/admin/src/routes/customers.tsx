import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import {
  Search, Download, Phone, Bookmark, MoreHorizontal, ArrowUpDown, X,
  CalendarPlus, FileText, ShieldAlert, Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  fetchShopifyCustomers, uniqueSegmentChips,
  type ShopifyCustomerRow, type CustomerLifecycle, type CustomerStatus, type CustomerLastContactWindow,
} from '@/lib/mock';
import { useCan, useCurrentRole } from '@/lib/permissions';

const LIFECYCLE_TONE: Record<CustomerLifecycle, string> = {
  lead: 'info', engaged: 'accent', active: 'success', at_risk: 'warn', churned: 'danger',
};

const LIFECYCLE_VALUES: CustomerLifecycle[] = ['lead', 'engaged', 'active', 'at_risk', 'churned'];
const STATUS_VALUES: CustomerStatus[] = ['active', 'archived'];
const LAST_CONTACT_VALUES: CustomerLastContactWindow[] = ['any', '7d', '30d', '90d', 'never'];

type SortKey = 'name' | 'last_newest' | 'last_oldest' | 'open_sr' | 'open_quotes' | 'lifecycle';
const SORT_KEYS: SortKey[] = ['name', 'last_newest', 'last_oldest', 'open_sr', 'open_quotes', 'lifecycle'];

const MS_PER_DAY = 86_400_000;

function fmtMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function daysAgo(iso: string | null) {
  if (!iso) return Infinity;
  return Math.floor((Date.parse('2026-06-27') - Date.parse(iso)) / MS_PER_DAY);
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function lifecycleRank(value: CustomerLifecycle) {
  return ['lead', 'engaged', 'active', 'at_risk', 'churned'].indexOf(value);
}

function downloadCsv(rows: ShopifyCustomerRow[]) {
  const header = ['Name', 'Email', 'Phone', 'Lifecycle', 'Status', 'Segments', 'Assigned', 'Last contact', 'Orders', 'LTV'];
  const lines = rows.map((row) => [
    row.name, row.email, row.phone, row.lifecycle, row.status,
    row.segments.map((segment) => segment.name).join('; '),
    row.assignedToName ?? '',
    row.lastContactAt ?? '',
    String(row.ordersCount),
    row.totalSpent.toFixed(2),
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shopify-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function CustomersView() {
  const { t } = useTranslation();
  const role = useCurrentRole();
  const canDial = useCan('messages.send');

  const { data: rows = [], isLoading } = useQuery({ queryKey: ['shopify-customers'], queryFn: fetchShopifyCustomers });

  const [search, setSearch] = useState('');
  const [segmentId, setSegmentId] = useState<string>('');
  const [lifecycle, setLifecycle] = useState<CustomerLifecycle | ''>('');
  const [status, setStatus] = useState<CustomerStatus | ''>('');
  const [lastContact, setLastContact] = useState<CustomerLastContactWindow>('any');
  const [mineOnly, setMineOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_newest');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const segmentOptions = useMemo(() => uniqueSegmentChips(rows), [rows]);
  const hasFilters = search || segmentId || lifecycle || status || lastContact !== 'any' || mineOnly;

  const filtered = useMemo(() => {
    const text = search.toLowerCase().trim();
    return rows.filter((row) => {
      if (text) {
        const haystack = `${row.name} ${row.email} ${row.phone}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      if (segmentId && !row.segments.some((segment) => segment.id === segmentId)) return false;
      if (lifecycle && row.lifecycle !== lifecycle) return false;
      if (status && row.status !== status) return false;
      if (lastContact !== 'any') {
        const days = daysAgo(row.lastContactAt);
        if (lastContact === '7d' && days > 7) return false;
        if (lastContact === '30d' && days > 30) return false;
        if (lastContact === '90d' && days > 90) return false;
        if (lastContact === 'never' && row.lastContactAt !== null) return false;
      }
      if (mineOnly && row.assignedToName !== role.name) return false;
      return true;
    });
  }, [rows, search, segmentId, lifecycle, status, lastContact, mineOnly, role.name]);

  const sorted = useMemo(() => {
    const list = filtered.slice();
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name);
        case 'last_newest': return daysAgo(a.lastContactAt) - daysAgo(b.lastContactAt);
        case 'last_oldest': return daysAgo(b.lastContactAt) - daysAgo(a.lastContactAt);
        case 'open_sr': return b.openServiceRequests - a.openServiceRequests;
        case 'open_quotes': return b.openQuotes - a.openQuotes;
        case 'lifecycle': return lifecycleRank(a.lifecycle) - lifecycleRank(b.lifecycle);
        default: return 0;
      }
    });
    return list;
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart = page * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  const toggleOne = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAllOnPage = () => setSelected((current) => {
    const next = new Set(current);
    const allSelected = pageRows.every((row) => next.has(row.id));
    if (allSelected) pageRows.forEach((row) => next.delete(row.id));
    else pageRows.forEach((row) => next.add(row.id));
    return next;
  });

  const columns = useMemo<ColumnDef<ShopifyCustomerRow>[]>(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          aria-label="Select all on page"
          checked={pageRows.length > 0 && pageRows.every((row) => selected.has(row.id))}
          onChange={toggleAllOnPage}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Select customer"
          checked={selected.has(row.original.id)}
          onChange={() => toggleOne(row.original.id)}
        />
      ),
    },
    {
      id: 'customer',
      header: () => <span>{t('customers.columns.customer')}</span>,
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div className="user-avatar" style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${customer.segments[0]?.color ?? '#1d4ed8'}, #1e293b)` }} aria-hidden>
              {customer.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="name">{customer.name}</div>
              <div className="muted">{customer.email}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                {customer.segments.slice(0, 4).map((segment) => (
                  <span
                    key={segment.id}
                    className="chip"
                    style={{ background: segment.color, color: '#fff', fontSize: 9, padding: '2px 7px', borderRadius: 999, fontWeight: 700 }}
                  >
                    {segment.name}
                  </span>
                ))}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 10 }}>
                {customer.assignedToName ? `${customer.assignedToName}` : t('customers.no_assigned')} · {customer.lastContactAt ? fmtDate(customer.lastContactAt) : t('customers.no_last_contact')}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'lifecycle',
      header: () => <span>{t('customers.columns.lifecycle')}</span>,
      accessorKey: 'lifecycle',
      cell: ({ getValue }) => {
        const value = getValue() as CustomerLifecycle;
        return <span className={`pill ${LIFECYCLE_TONE[value]}`}>{t(`customers.lifecycle.${value}`)}</span>;
      },
    },
    {
      id: 'status',
      header: () => <span>{t('customers.columns.status')}</span>,
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const value = getValue() as CustomerStatus;
        return <span className={`pill ${value === 'active' ? 'success' : ''}`}>{t(value === 'active' ? 'customers.status_active' : 'customers.status_archived')}</span>;
      },
    },
    {
      id: 'work',
      header: () => <span>{t('customers.columns.work')}</span>,
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="pill" title="Open service requests"><ShieldAlert size={9} /> {customer.openServiceRequests}</span>
            <span className="pill" title="Open quotes"><FileText size={9} /> {customer.openQuotes}</span>
            <span className="pill accent" title="Open AI tasks"><Sparkles size={9} /> {customer.openAiTasks}</span>
          </div>
        );
      },
    },
    {
      id: 'pipeline',
      header: () => <span>{t('customers.columns.pipeline')}</span>,
      accessorKey: 'pipelineValue',
      cell: ({ getValue }) => <span>{fmtMoney(getValue() as number | null)}</span>,
    },
    {
      id: 'commission',
      header: () => <span>{t('customers.columns.commission')}</span>,
      accessorKey: 'commissionAmount',
      cell: ({ getValue }) => <span>{fmtMoney(getValue() as number | null)}</span>,
    },
    {
      id: 'markup',
      header: () => <span>{t('customers.columns.markup')}</span>,
      accessorKey: 'markupPercent',
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
        return <span>{value == null ? '—' : `${value}%`}</span>;
      },
    },
    {
      id: 'actions',
      header: () => <span />,
      cell: ({ row }) => (
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {canDial && (
            <a className="btn ghost" href={`tel:${row.original.phone.replace(/\s/g, '')}`} title="Dial">
              <Phone size={13} />
            </a>
          )}
          <button type="button" className="btn ghost" title="Add calendar event">
            <CalendarPlus size={13} />
          </button>
          <button type="button" className="btn ghost" title="Bookmark">
            <Bookmark size={13} />
          </button>
          <button type="button" className="btn ghost" title="More">
            <MoreHorizontal size={13} />
          </button>
        </div>
      ),
    },
  ], [t, selected, pageRows, canDial]);

  const table = useReactTable({
    data: pageRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const clearFilters = () => {
    setSearch(''); setSegmentId(''); setLifecycle(''); setStatus(''); setLastContact('any'); setMineOnly(false);
    setPage(0);
  };

  return (
    <>
      <PageHeader titleI18nKey="customers.title" subtitleI18nKey="customers.subtitle" />

      <div className="customers-toolbar">
        <div className="orders-search" style={{ minWidth: 240, flex: 1 }}>
          <Search size={14} />
          <input
            id="customers-search"
            placeholder={t('customers.search_placeholder')}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          />
        </div>

        <select
          id="filter-segment"
          aria-label={t('customers.filter_segment')}
          value={segmentId}
          onChange={(event) => { setSegmentId(event.target.value); setPage(0); }}
        >
          <option value="">{t('customers.filter_segment_all')}</option>
          {segmentOptions.map((segment) => (
            <option key={segment.id} value={segment.id}>{segment.name}</option>
          ))}
        </select>

        <select
          id="filter-lifecycle"
          aria-label={t('customers.filter_lifecycle')}
          value={lifecycle}
          onChange={(event) => { setLifecycle(event.target.value as CustomerLifecycle | ''); setPage(0); }}
        >
          <option value="">{t('customers.filter_lifecycle_all')}</option>
          {LIFECYCLE_VALUES.map((value) => (
            <option key={value} value={value}>{t(`customers.lifecycle.${value}`)}</option>
          ))}
        </select>

        <select
          id="filter-status"
          aria-label={t('customers.filter_status')}
          value={status}
          onChange={(event) => { setStatus(event.target.value as CustomerStatus | ''); setPage(0); }}
        >
          <option value="">{t('customers.filter_status_all')}</option>
          {STATUS_VALUES.map((value) => (
            <option key={value} value={value}>{t(value === 'active' ? 'customers.status_active' : 'customers.status_archived')}</option>
          ))}
        </select>

        <select
          id="filter-last-contact"
          aria-label={t('customers.filter_last_contact')}
          value={lastContact}
          onChange={(event) => { setLastContact(event.target.value as CustomerLastContactWindow); setPage(0); }}
        >
          {LAST_CONTACT_VALUES.map((value) => (
            <option key={value} value={value}>{t(`customers.filter_last_contact_${value}`)}</option>
          ))}
        </select>

        <select
          id="filter-sort"
          aria-label={t('customers.sort_label')}
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          {SORT_KEYS.map((value) => (
            <option key={value} value={value}>{t(`customers.sort_${value}`)}</option>
          ))}
        </select>

        <label className="checkbox-row" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={mineOnly} onChange={(event) => { setMineOnly(event.target.checked); setPage(0); }} />
          {t('customers.filter_mine_only')}
        </label>

        {hasFilters && (
          <button type="button" className="btn ghost" onClick={clearFilters}>
            <X size={13} /> {t('customers.clear_filters')}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="customers-bulk-bar">
          <span>{t('customers.selected_label', { count: selected.size })}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn" onClick={() => downloadCsv(rows.filter((row) => selected.has(row.id)))}>
              <Download size={13} /> {t('customers.bulk_export')}
            </button>
            <button type="button" className="btn" disabled>
              <Phone size={13} /> {t('customers.bulk_dial')}
            </button>
            <button type="button" className="btn" disabled>{t('customers.bulk_contacted')}</button>
            <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
              <X size={13} /> {t('customers.bulk_clear')}
            </button>
          </div>
        </div>
      )}

      <div className="data-card">
        <table className="data-table customers-table" id="table-customers">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getCanSort() && header.id !== 'select' ? header.column.getToggleSortingHandler() : undefined}
                    style={{ cursor: header.column.getCanSort() && header.id !== 'select' ? 'pointer' : 'default', userSelect: 'none' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && header.id !== 'select' && <ArrowUpDown size={11} style={{ opacity: .5 }} />}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                {isLoading ? t('common.loading') : t('customers.empty_state')}
              </td></tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} id={`row-customer-${row.original.id}`}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="customers-pagination">
        <span className="muted">
          {t('customers.showing', { from: sorted.length === 0 ? 0 : pageStart + 1, to: Math.min(pageStart + pageSize, sorted.length), total: sorted.length })}
        </span>
        <span className="muted">{t('customers.page_of', { page: page + 1, pages: totalPages })}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn ghost" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
            {t('common.previous')}
          </button>
          <button type="button" className="btn ghost" disabled={page >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}>
            {t('common.next')}
          </button>
        </div>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {t('customers.page_size')}
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
    </>
  );
}

export const Route = createFileRoute('/customers')({ component: CustomersView });
