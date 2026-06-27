import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import {
  Search, Download, ExternalLink, Eye, MapPin, Truck, FileText, ArrowUpDown,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  fetchOrders, fetchOrderKpis,
  type OrderRow, type OrderSurface, type OrderPaymentStatus, type OrderFulfillmentStatus,
} from '@/lib/mock';

const PAYMENT_TONE: Record<OrderPaymentStatus, string> = {
  paid: 'success', pending: 'warn', refunded: 'info', failed: 'danger',
};
const FULFILLMENT_TONE: Record<OrderFulfillmentStatus, string> = {
  fulfilled: 'success', partial: 'warn', unfulfilled: 'info', cancelled: 'danger',
};

const SURFACES: { id: OrderSurface; key: string }[] = [
  { id: 'all', key: 'orders.tab_all' },
  { id: 'pickup', key: 'orders.tab_pickup' },
  { id: 'design_files', key: 'orders.tab_design_files' },
  { id: 'partner', key: 'orders.tab_partner' },
];

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function downloadCsv(rows: OrderRow[], surface: OrderSurface) {
  const header = ['Order', 'Customer', 'Email', 'Company', 'Date', 'Total', 'Payment', 'Fulfillment', 'Files'];
  const lines = rows.map((row) => [
    row.orderNumber,
    row.customerName,
    row.customerEmail,
    row.companyName ?? '',
    row.date,
    row.total.toFixed(2),
    row.paymentStatus,
    row.fulfillmentStatus,
    String(row.designFilesCount),
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orders-${surface}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function OrdersView() {
  const { t } = useTranslation();
  const [surface, setSurface] = useState<OrderSurface>('all');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);

  const { data: rows = [], isLoading } = useQuery({ queryKey: ['orders', surface], queryFn: () => fetchOrders(surface) });
  const { data: kpis } = useQuery({ queryKey: ['orders', 'kpis', surface], queryFn: () => fetchOrderKpis(surface) });

  const columns = useMemo<ColumnDef<OrderRow>[]>(() => [
    {
      id: 'order',
      header: () => <span>{t('orders.columns.order')}</span>,
      accessorKey: 'orderNumber',
      cell: ({ row }) => {
        const order = row.original;
        return (
          <>
            <div className="name">{order.orderNumber}</div>
            <div className="muted" style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {order.isPickup && <span className="pill warn"><MapPin size={9} /> {t('orders.badge_pickup')}</span>}
              {order.isLocalDelivery && <span className="pill info"><Truck size={9} /> {t('orders.badge_local')}</span>}
              {order.designFilesCount > 0 && (
                <span className="pill accent"><FileText size={9} /> {t('orders.badge_files', { count: order.designFilesCount })}</span>
              )}
            </div>
          </>
        );
      },
    },
    {
      id: 'customer',
      header: () => <span>{t('orders.columns.customer')}</span>,
      accessorFn: (row) => `${row.customerName} ${row.customerEmail}`,
      cell: ({ row }) => (
        <>
          <div className="name">{row.original.customerName}</div>
          <div className="muted">{row.original.customerEmail}</div>
        </>
      ),
    },
    {
      id: 'company',
      header: () => <span>{t('orders.columns.company')}</span>,
      accessorKey: 'companyName',
      cell: ({ getValue }) => <span>{(getValue() as string | null) ?? '—'}</span>,
    },
    {
      id: 'date',
      header: () => <span>{t('orders.columns.date')}</span>,
      accessorKey: 'date',
      cell: ({ getValue }) => <span className="muted">{getValue() as string}</span>,
    },
    {
      id: 'total',
      header: () => <span>{t('orders.columns.total')}</span>,
      accessorKey: 'total',
      cell: ({ getValue }) => <strong>{fmtMoney(getValue() as number)}</strong>,
    },
    {
      id: 'payment',
      header: () => <span>{t('orders.columns.payment')}</span>,
      accessorKey: 'paymentStatus',
      cell: ({ getValue }) => {
        const value = getValue() as OrderPaymentStatus;
        return <span className={`pill ${PAYMENT_TONE[value]}`}>{t(`orders.payment.${value}`)}</span>;
      },
    },
    {
      id: 'fulfillment',
      header: () => <span>{t('orders.columns.fulfillment')}</span>,
      accessorKey: 'fulfillmentStatus',
      cell: ({ getValue }) => {
        const value = getValue() as OrderFulfillmentStatus;
        return <span className={`pill ${FULFILLMENT_TONE[value]}`}>{t(`orders.fulfillment.${value}`)}</span>;
      },
    },
    {
      id: 'actions',
      header: () => <span />,
      cell: ({ row }) => (
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <button type="button" className="btn ghost" title="View detail">
            <Eye size={13} />
          </button>
          {row.original.shopifyOrderId && (
            <a
              className="btn ghost"
              href={`https://admin.shopify.com/store/dtf-bank/orders/${row.original.shopifyOrderId}`}
              target="_blank"
              rel="noreferrer"
              title="Open in Shopify"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      ),
    },
  ], [t]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _id, filterValue) => {
      const text = String(filterValue ?? '').toLowerCase().trim();
      if (!text) return true;
      const order = row.original;
      return [
        order.orderNumber, order.customerName, order.customerEmail, order.companyName ?? '',
      ].some((field) => field.toLowerCase().includes(text));
    },
  });

  const sortedRows = table.getRowModel().rows;

  return (
    <>
      <PageHeader
        titleI18nKey="orders.title"
        subtitleI18nKey="orders.subtitle"
        actions={(
          <button
            id="btn-orders-export"
            type="button"
            className="btn"
            onClick={() => downloadCsv(sortedRows.map((row) => row.original), surface)}
            disabled={sortedRows.length === 0}
          >
            <Download size={14} /> {t('orders.export_csv')}
          </button>
        )}
      />

      <div className="tabs" role="tablist">
        {SURFACES.map((entry) => (
          <button
            key={entry.id}
            id={`tab-orders-${entry.id}`}
            data-i18n-key={entry.key}
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
        <div className="kpi">
          <div className="label">{t('orders.kpi_count')}</div>
          <div className="val">{kpis?.count ?? '…'}</div>
          <div className="sub">in view</div>
        </div>
        <div className="kpi">
          <div className="label">{t('orders.kpi_revenue')}</div>
          <div className="val">{kpis ? fmtMoney(kpis.revenue) : '…'}</div>
          <div className="sub">gross</div>
        </div>
        <div className="kpi">
          <div className="label">{t('orders.kpi_paid')}</div>
          <div className="val">{kpis?.paid ?? '…'}</div>
          <div className="sub">orders paid</div>
        </div>
        <div className="kpi">
          <div className="label">{t('orders.kpi_pending')}</div>
          <div className="val">{kpis?.pending ?? '…'}</div>
          <div className="sub">awaiting payment</div>
        </div>
        <div className="kpi">
          <div className="label">{t('orders.kpi_fulfilled')}</div>
          <div className="val">{kpis?.fulfilled ?? '…'}</div>
          <div className="sub">shipped / picked up</div>
        </div>
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
        <span className="muted" style={{ fontSize: 11 }}>
          {sortedRows.length}/{rows.length} orders
        </span>
      </div>

      <div className="data-card">
        <table className="data-table" id="table-orders">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default', userSelect: 'none' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ArrowUpDown size={11} style={{ opacity: .5 }} />}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                {isLoading ? t('common.loading') : t('orders.empty_state')}
              </td></tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} id={`row-order-${row.original.id}`}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/orders')({ component: OrdersView });
