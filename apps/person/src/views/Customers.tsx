import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { fetchCustomers, friendlyError } from '../api/live';
import type { CustomerRow } from '../types';
import { Icon } from '../components/Icon';
import { QueryState } from '../components/QueryState';

const LIFECYCLE_LABEL: Record<CustomerRow['lifecycle'], string> = {
  lead: 'Lead', engaged: 'Engaged', active: 'Active', at_risk: 'At risk', churned: 'Churned',
};

function fmtMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function CustomersView() {
  const { data: customers = [], isLoading, error } = useQuery({ queryKey: ['person', 'customers'], queryFn: fetchCustomers });

  const columns: ColumnDef<CustomerRow>[] = [
    {
      id: 'name',
      header: 'Customer',
      cell: ({ row }) => (
        <div>
          <div className="cust-name">{row.original.name}</div>
          <div className="cust-email">{row.original.email}</div>
        </div>
      ),
    },
    {
      id: 'segment',
      header: 'Segment',
      cell: ({ row }) => (
        <span className="chip" style={{ background: row.original.segment.color }}>{row.original.segment.name}</span>
      ),
    },
    { id: 'lifecycle', header: 'Lifecycle', cell: ({ row }) => <span className="stat-pill">{LIFECYCLE_LABEL[row.original.lifecycle]}</span> },
    { id: 'urgency', header: 'Urgency', cell: ({ row }) => <span className="stat-pill">U{row.original.urgencyScore ?? 0}</span> },
    { id: 'orders', header: 'Orders', cell: ({ row }) => <span>{row.original.ordersCount}</span> },
    { id: 'spent', header: 'Spent', cell: ({ row }) => <span>{fmtMoney(row.original.totalSpent)}</span> },
    { id: 'phone', header: 'Phone', cell: ({ row }) => <span className="cust-email">{row.original.phone}</span> },
    { id: 'last', header: 'Last contact', cell: ({ row }) => <span className="cust-email">{row.original.lastContact}</span> },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <div className="actions">
          <button type="button" className="action-btn" title="Dial"><Icon name="phone" size={14} /></button>
          <button type="button" className="action-btn" title="Email"><Icon name="mail-action" size={14} /></button>
          <button type="button" className="action-btn" title="Add note"><Icon name="note-action" size={14} /></button>
          <button type="button" className="action-btn" title="More"><Icon name="more" size={14} /></button>
        </div>
      ),
    },
  ];

  const table = useReactTable({ data: customers, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });

  const totalSpent = customers.reduce((acc, c) => acc + c.totalSpent, 0);
  const atRisk = customers.filter((c) => c.lifecycle === 'at_risk').length;

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="label">Customers</div><div className="val">{customers.length}</div><div className="sub">in your segments</div></div>
        <div className="kpi"><div className="label">Total spent</div><div className="val">{fmtMoney(totalSpent)}</div><div className="sub">across portfolio</div></div>
        <div className="kpi"><div className="label">At risk</div><div className="val">{atRisk}</div><div className="sub">needs outreach</div></div>
        <div className="kpi"><div className="label">Avg orders</div><div className="val">{customers.length ? Math.round(customers.reduce((a, c) => a + c.ordersCount, 0) / customers.length) : 0}</div><div className="sub">per customer</div></div>
        <div className="kpi"><div className="label">Segments</div><div className="val">{new Set(customers.map((c) => c.segment.id)).size}</div><div className="sub">owned</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={customers.length === 0}
        emptyTitle="No customers in this workspace"
        emptyBody="Shopify sync or customer import needs to add customers before this table fills."
      >
      <div className="data-card">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </QueryState>
    </>
  );
}
