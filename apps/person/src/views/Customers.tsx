import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import { fetchCustomerArchive, fetchCustomerArchiveDetail, fetchCustomerDetail, fetchCustomers, fetchMyCommissionRequests, friendlyError, submitCommissionRequest } from '../api/live';
import type { CustomerRow } from '../types';
import { Icon } from '../components/Icon';
import { QueryState } from '../components/QueryState';

const LIFECYCLE_LABEL: Record<CustomerRow['lifecycle'], string> = {
  lead: 'Lead', engaged: 'Engaged', active: 'Active', at_risk: 'At risk', churned: 'Churned',
};

function fmtMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function CustomersView({ archive = false }: { archive?: boolean }) {
  const qc = useQueryClient();
  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ['person', archive ? 'customer-archive' : 'customers'],
    queryFn: archive ? fetchCustomerArchive : fetchCustomers,
  });
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(() => currentCustomerIdFromUrl());
  const [commissionTarget, setCommissionTarget] = useState<CustomerRow | null>(null);
  const { data: commissionRequests = [] } = useQuery({ queryKey: ['person', 'commission-requests'], queryFn: fetchMyCommissionRequests });
  const detailQuery = useQuery({
    queryKey: ['person', archive ? 'customer-archive-detail' : 'customer-detail', detailCustomerId],
    queryFn: () => archive ? fetchCustomerArchiveDetail(detailCustomerId ?? '') : fetchCustomerDetail(detailCustomerId ?? ''),
    enabled: Boolean(detailCustomerId),
  });

  useEffect(() => {
    const syncFromUrl = () => setDetailCustomerId(currentCustomerIdFromUrl());
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const openCustomerDetail = (customerId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('customerId', customerId);
    window.history.pushState({}, '', url);
    setDetailCustomerId(customerId);
  };
  const closeCustomerDetail = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('customerId');
    window.history.pushState({}, '', url);
    setDetailCustomerId(null);
  };
  const submitCommission = useMutation({
    mutationFn: submitCommissionRequest,
    onSuccess: async () => {
      setCommissionTarget(null);
      await qc.invalidateQueries({ queryKey: ['person', 'commission-requests'] });
    },
  });
  const latestCommissionByCustomer = useMemo(() => {
    const rows = new Map<string, typeof commissionRequests[number]>();
    for (const request of commissionRequests) {
      const current = rows.get(request.customerId);
      if (!current || request.createdAt > current.createdAt) rows.set(request.customerId, request);
    }
    return rows;
  }, [commissionRequests]);

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
    {
      id: 'commission',
      header: 'Commission',
      cell: ({ row }) => {
        const request = latestCommissionByCustomer.get(row.original.id);
        return request ? <span className={`stat-pill ${request.status}`}>{request.status.replace(/_/g, ' ')}</span> : <span className="cust-email">No request</span>;
      },
    },
    { id: 'phone', header: 'Phone', cell: ({ row }) => <span className="cust-email">{row.original.phone}</span> },
    { id: 'last', header: 'Last contact', cell: ({ row }) => <span className="cust-email">{row.original.lastContact}</span> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="actions">
          <button type="button" className="action-btn" title="Open customer detail" onClick={() => openCustomerDetail(row.original.id)}>
            <Icon name="customers" size={14} />
          </button>
          <button type="button" className="action-btn" title="Submit commission request" onClick={() => setCommissionTarget(row.original)}>
            %
          </button>
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
        <div className="kpi"><div className="label">{archive ? 'Shopify customers' : 'Customers'}</div><div className="val">{customers.length}</div><div className="sub">{archive ? 'active archive' : 'in your segments'}</div></div>
        <div className="kpi"><div className="label">Total spent</div><div className="val">{fmtMoney(totalSpent)}</div><div className="sub">{archive ? 'across Shopify archive' : 'across portfolio'}</div></div>
        <div className="kpi"><div className="label">At risk</div><div className="val">{atRisk}</div><div className="sub">needs outreach</div></div>
        <div className="kpi"><div className="label">Avg orders</div><div className="val">{customers.length ? Math.round(customers.reduce((a, c) => a + c.ordersCount, 0) / customers.length) : 0}</div><div className="sub">per customer</div></div>
        <div className="kpi"><div className="label">Segments</div><div className="val">{new Set(customers.map((c) => c.segment.id)).size}</div><div className="sub">{archive ? 'matched' : 'owned'}</div></div>
        <div className="kpi"><div className="label">Commission Requests</div><div className="val">{commissionRequests.filter((item) => item.status === 'pending_admin_approval').length}</div><div className="sub">pending approval</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={customers.length === 0}
        emptyTitle={archive ? 'No Shopify customers in archive' : 'No customers in this workspace'}
        emptyBody={archive ? 'Run Shopify customer sync before the archive can show live customers.' : 'Shopify sync or customer import needs to add customers before this table fills.'}
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
              <tr key={row.id} onDoubleClick={() => openCustomerDetail(row.original.id)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </QueryState>
      <CustomerDetailPanel
        open={Boolean(detailCustomerId)}
        detail={detailQuery.data}
        isLoading={detailQuery.isLoading}
        error={detailQuery.error ? friendlyError(detailQuery.error) : null}
        onRetry={() => detailQuery.refetch()}
        onClose={closeCustomerDetail}
      />
      {commissionTarget ? (
        <CommissionRequestModal
          customer={commissionTarget}
          isSaving={submitCommission.isPending}
          error={submitCommission.error ? friendlyError(submitCommission.error) : null}
          onClose={() => setCommissionTarget(null)}
          onSubmit={(input) => submitCommission.mutate(input)}
        />
      ) : null}
    </>
  );
}

function currentCustomerIdFromUrl() {
  return new URLSearchParams(window.location.search).get('customerId');
}

function CommissionRequestModal({
  customer,
  isSaving,
  error,
  onClose,
  onSubmit,
}: {
  customer: CustomerRow;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { customerId: string; productReference: string; saleReference: string; percent: number; note?: string }) => void;
}) {
  const [productReference, setProductReference] = useState('');
  const [saleReference, setSaleReference] = useState('');
  const [percent, setPercent] = useState(5);
  const [note, setNote] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productReference.trim() || !saleReference.trim()) return;
    onSubmit({
      customerId: customer.id,
      productReference: productReference.trim(),
      saleReference: saleReference.trim(),
      percent,
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="commission-request-title" onMouseDown={onClose}>
      <form className="modal-card commission-request-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h3 id="commission-request-title">Commission request</h3>
            <p>{customer.name} - {customer.email || customer.phone}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>x</button>
        </header>
        <label>
          Product / service reference
          <input value={productReference} onChange={(event) => setProductReference(event.target.value)} maxLength={240} required />
        </label>
        <label>
          Sale reference
          <input value={saleReference} onChange={(event) => setSaleReference(event.target.value)} maxLength={240} required />
        </label>
        <label>
          Percent
          <input type="number" min={0} max={100} step="0.1" value={percent} onChange={(event) => setPercent(Number(event.target.value))} required />
        </label>
        <label>
          Note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
        </label>
        {error ? <div className="email-compose-error">{error}</div> : null}
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={isSaving || !productReference.trim() || !saleReference.trim()}>
            {isSaving ? 'Submitting...' : 'Submit'}
          </button>
        </footer>
      </form>
    </div>
  );
}
