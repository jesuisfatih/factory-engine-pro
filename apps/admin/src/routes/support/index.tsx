import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Search, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import { SupportModal } from '@/components/SupportModal';
import { fetchServiceRequests, type ServiceRequestRow, type SrSurface } from '@/lib/mock';

type SurfaceFilter = 'all' | SrSurface;

function SupportListView() {
  const { t } = useTranslation();
  const [surface, setSurface] = useState<SurfaceFilter>('all');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'priority', desc: true }]);
  const [selected, setSelected] = useState<ServiceRequestRow | null>(null);

  const { data: rows = [] } = useQuery({ queryKey: ['support', 'list'], queryFn: fetchServiceRequests });

  const filteredBySurface = useMemo(() => {
    if (surface === 'all') return rows;
    return rows.filter((row) => row.surface === surface);
  }, [rows, surface]);

  const kpis = useMemo(() => {
    const open = filteredBySurface.filter((row) => row.status === 'open').length;
    const inProgress = filteredBySurface.filter((row) => row.status === 'in_progress').length;
    const dueToday = filteredBySurface.filter((row) => row.slaBreachAt?.startsWith('Today')).length;
    const slaBreach = filteredBySurface.filter((row) => row.slaBreachAt && row.status !== 'resolved' && row.status !== 'closed').length;
    return { open, inProgress, dueToday, slaBreach };
  }, [filteredBySurface]);

  const columns = useMemo<ColumnDef<ServiceRequestRow>[]>(() => [
    { id: 'number', header: t('support.col_number'), accessorKey: 'number',
      cell: ({ row }) => <span className="pill accent" style={{ fontFamily: 'monospace' }}>{row.original.number}</span>,
    },
    { id: 'title', header: t('support.col_title'), accessorKey: 'title',
      cell: ({ row }) => (
        <div>
          <div className="name">{row.original.title}</div>
          <div className="muted">{row.original.category.replaceAll('_', ' ')}</div>
        </div>
      ),
    },
    { id: 'customer', header: t('support.col_customer'), accessorKey: 'customer' },
    { id: 'status', header: t('support.col_status'),
      accessorKey: 'status',
      cell: ({ row }) => <span className={`sr-status-pill ${row.original.status}`}>{t(`support.status_${row.original.status}`)}</span>,
    },
    { id: 'priority', header: t('support.col_priority'), accessorKey: 'priority',
      sortingFn: (a, b) => {
        const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        return order[a.original.priority] - order[b.original.priority];
      },
      cell: ({ row }) => {
        const p = row.original.priority;
        const cls = p === 'critical' ? 'pill danger' : p === 'high' ? 'pill warn' : p === 'medium' ? 'pill info' : 'pill';
        return <span className={cls}>{p}</span>;
      },
    },
    { id: 'assignee', header: t('support.col_assignee'),
      accessorFn: (row) => row.assignee,
      cell: ({ row }) => row.original.assignee ?? <span className="muted" data-i18n-key="support.no_assignee">{t('support.no_assignee')}</span>,
    },
    { id: 'sla', header: t('support.col_sla'),
      accessorFn: (row) => row.slaBreachAt,
      cell: ({ row }) => row.original.slaBreachAt ? (
        <span style={{ color: 'var(--warn)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ShieldAlert size={11} /> {row.original.slaBreachAt}
        </span>
      ) : <span className="muted">—</span>,
    },
    { id: 'lastActivity', header: t('support.col_last_activity'),
      accessorKey: 'lastMessageAt',
      cell: ({ row }) => <span className="muted">{row.original.lastMessageAt}</span>,
    },
  ], [t]);

  const table = useReactTable({
    data: filteredBySurface,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue) return true;
      const q = String(filterValue).toLowerCase();
      return `${row.original.title} ${row.original.customer} ${row.original.number}`.toLowerCase().includes(q);
    },
  });

  return (
    <>
      <PageHeader titleI18nKey="support.title" subtitleI18nKey="support.subtitle" />

      <div className="sr-kpi-row">
        <div className="sr-kpi" id="sr-kpi-open"><div className="lbl" data-i18n-key="support.kpi.open">{t('support.kpi.open')}</div><div className="val">{kpis.open}</div></div>
        <div className="sr-kpi warn" id="sr-kpi-in-progress"><div className="lbl" data-i18n-key="support.kpi.in_progress">{t('support.kpi.in_progress')}</div><div className="val">{kpis.inProgress}</div></div>
        <div className="sr-kpi" id="sr-kpi-due"><div className="lbl" data-i18n-key="support.kpi.due_today">{t('support.kpi.due_today')}</div><div className="val">{kpis.dueToday}</div></div>
        <div className="sr-kpi danger" id="sr-kpi-sla"><div className="lbl" data-i18n-key="support.kpi.sla_breach">{t('support.kpi.sla_breach')}</div><div className="val">{kpis.slaBreach}</div></div>
      </div>

      <Tabs
        tabs={[
          { to: '/support', i18nKey: 'support.tabs.all', id: 'tab-sr-all' },
          { to: '/support?surface=internal', i18nKey: 'support.tabs.internal', id: 'tab-sr-internal' },
          { to: '/support?surface=customer_facing', i18nKey: 'support.tabs.customer_facing', id: 'tab-sr-customer' },
        ]}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button type="button" id="filter-all" className={`btn ${surface === 'all' ? 'primary' : ''}`} onClick={() => setSurface('all')}>{t('support.tabs.all')}</button>
        <button type="button" id="filter-internal" className={`btn ${surface === 'internal' ? 'primary' : ''}`} onClick={() => setSurface('internal')}>{t('support.tabs.internal')}</button>
        <button type="button" id="filter-customer" className={`btn ${surface === 'customer_facing' ? 'primary' : ''}`} onClick={() => setSurface('customer_facing')}>{t('support.tabs.customer_facing')}</button>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360, marginLeft: 'auto' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input id="sr-search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="SR-####, title, customer…"
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px 8px 32px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
        </div>
      </div>

      <div className="data-card">
        <table className="data-table" id="sr-table">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default', userSelect: 'none' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} id={`sr-row-${row.original.id}`} onClick={() => setSelected(row.original)} style={{ cursor: 'pointer' }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <SupportModal sr={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export const Route = createFileRoute('/support/')({ component: SupportListView });
