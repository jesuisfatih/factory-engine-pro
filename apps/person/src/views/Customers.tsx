import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import { dialAircall, fetchCustomerArchive, fetchCustomerArchiveDetail, fetchCustomerDetail, fetchCustomers, friendlyError, saveCustomerNote } from '../api/live';
import type { CustomerArchivePage, CustomerRow } from '../types';
import { Icon } from '../components/Icon';
import { QueryState } from '../components/QueryState';

const ARCHIVE_PAGE_SIZE = 100;

const LIFECYCLE_LABEL: Record<CustomerRow['lifecycle'], string> = {
  lead: 'Lead', engaged: 'Engaged', active: 'Active', at_risk: 'At risk', churned: 'Churned',
};

function fmtMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function CustomersView({ archive = false }: { archive?: boolean }) {
  const qc = useQueryClient();
  const [archivePage, setArchivePage] = useState(0);
  const [archiveSearchDraft, setArchiveSearchDraft] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');
  const archiveOffset = archive ? archivePage * ARCHIVE_PAGE_SIZE : 0;
  const { data, isLoading, error } = useQuery<CustomerRow[] | CustomerArchivePage>({
    queryKey: ['person', archive ? 'customer-archive' : 'customers', archive ? archivePage : 0, archive ? archiveSearch : ''],
    queryFn: () => archive
      ? fetchCustomerArchive({ limit: ARCHIVE_PAGE_SIZE, offset: archiveOffset, search: archiveSearch || undefined })
      : fetchCustomers(),
  });
  const archiveResult = archive && data && !Array.isArray(data) ? data : null;
  const customers = Array.isArray(data) ? data : archiveResult?.items ?? [];
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(() => currentCustomerIdFromUrl());
  const [noteTarget, setNoteTarget] = useState<CustomerRow | null>(null);
  const [noteBody, setNoteBody] = useState('');
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

  useEffect(() => {
    setDetailCustomerId(currentCustomerIdFromUrl());
    setNoteTarget(null);
    setNoteBody('');
    setArchivePage(0);
    setArchiveSearch('');
    setArchiveSearchDraft('');
  }, [archive]);

  const openCustomerDetail = (customerId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('customerId', customerId);
    window.history.pushState({}, '', url);
    setDetailCustomerId(customerId);
  };
  const closeCustomerDetail = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('customerId');
    window.history.replaceState({}, '', url);
    setDetailCustomerId(null);
  };
  const customerNote = useMutation({
    mutationFn: (input: { customerId: string; body: string }) => saveCustomerNote(input.customerId, { body: input.body }),
    onSuccess: async (_detail, input) => {
      setNoteTarget(null);
      setNoteBody('');
      setDetailCustomerId(input.customerId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['person', archive ? 'customer-archive' : 'customers'] }),
        qc.invalidateQueries({ queryKey: ['person', 'notes'] }),
        qc.invalidateQueries({ queryKey: ['person', archive ? 'customer-archive-detail' : 'customer-detail', input.customerId] }),
      ]);
    },
  });
  const dialCustomer = useMutation({
    mutationFn: dialAircall,
    onSuccess: (result) => {
      if (result.mode === 'tel_fallback') window.location.assign(result.telHref);
    },
  });

  const columns = useMemo<ColumnDef<CustomerRow>[]>(() => [
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
      cell: ({ row }) => {
        const customer = row.original;
        const emailHref = customer.email ? `mailto:${customer.email}` : undefined;
        return (
        <div className="actions">
          <button type="button" className="action-btn" title="Open customer detail" onClick={() => openCustomerDetail(customer.id)}>
            <Icon name="customers" size={14} />
          </button>
          {customer.phone ? (
            <button
              type="button"
              className="action-btn"
              title="Dial"
              disabled={dialCustomer.isPending}
              onClick={() => dialCustomer.mutate({ phone: customer.phone ?? '', customerId: customer.id, source: 'customer_table' })}
            >
              <Icon name="phone" size={14} />
            </button>
          ) : null}
          {emailHref ? (
            <a className="action-btn" title="Email" href={emailHref}><Icon name="mail-action" size={14} /></a>
          ) : null}
          <button type="button" className="action-btn" title="Add note" onClick={() => setNoteTarget(customer)}><Icon name="note-action" size={14} /></button>
          <button type="button" className="action-btn" title="Open customer history" onClick={() => openCustomerDetail(customer.id)}><Icon name="more" size={14} /></button>
        </div>
        );
      },
    },
  ], [dialCustomer.isPending]);

  const table = useReactTable({ data: customers, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });

  const totalCustomers = archive ? archiveResult?.total ?? customers.length : customers.length;
  const totalSpent = archive ? archiveResult?.summary.totalSpent ?? 0 : customers.reduce((acc, c) => acc + c.totalSpent, 0);
  const atRisk = archive ? archiveResult?.summary.atRisk ?? 0 : customers.filter((c) => c.lifecycle === 'at_risk').length;
  const avgOrders = archive
    ? archiveResult?.summary.avgOrders ?? 0
    : customers.length ? Math.round(customers.reduce((a, c) => a + c.ordersCount, 0) / customers.length) : 0;
  const pageStart = totalCustomers === 0 ? 0 : archiveOffset + 1;
  const pageEnd = Math.min(archiveOffset + customers.length, totalCustomers);
  const hasPrevPage = archive && archivePage > 0;
  const hasNextPage = archive && pageEnd < totalCustomers;
  const applyArchiveSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setArchivePage(0);
    setArchiveSearch(archiveSearchDraft.trim());
  };
  const clearArchiveSearch = () => {
    setArchivePage(0);
    setArchiveSearch('');
    setArchiveSearchDraft('');
  };

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="label">{archive ? 'Shopify customers' : 'Customers'}</div><div className="val">{totalCustomers}</div><div className="sub">{archive ? `${pageStart}-${pageEnd} visible` : 'in your segments'}</div></div>
        <div className="kpi"><div className="label">Total spent</div><div className="val">{fmtMoney(totalSpent)}</div><div className="sub">{archive ? 'across Shopify archive' : 'across portfolio'}</div></div>
        <div className="kpi"><div className="label">At risk</div><div className="val">{atRisk}</div><div className="sub">needs outreach</div></div>
        <div className="kpi"><div className="label">Avg orders</div><div className="val">{avgOrders}</div><div className="sub">per customer</div></div>
        <div className="kpi"><div className="label">Segments</div><div className="val">{new Set(customers.map((c) => c.segment.id)).size}</div><div className="sub">{archive ? 'on this page' : 'owned'}</div></div>
      </div>

      {archive ? (
        <form className="archive-toolbar" onSubmit={applyArchiveSearch}>
          <label>
            Search archive
            <input
              value={archiveSearchDraft}
              onChange={(event) => setArchiveSearchDraft(event.target.value)}
              placeholder="Customer, email, phone, Shopify ID..."
            />
          </label>
          <button type="submit" className="archive-toolbar-btn">Search</button>
          {archiveSearch ? <button type="button" className="archive-toolbar-btn" onClick={clearArchiveSearch}>Clear</button> : null}
          <span>{isLoading ? 'Loading archive...' : `Showing ${pageStart}-${pageEnd} of ${totalCustomers}`}</span>
        </form>
      ) : null}

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
      {archive ? (
        <div className="archive-pagination">
          <button type="button" disabled={!hasPrevPage || isLoading} onClick={() => setArchivePage((page) => Math.max(0, page - 1))}>
            Previous
          </button>
          <span>Page {archivePage + 1}</span>
          <button type="button" disabled={!hasNextPage || isLoading} onClick={() => setArchivePage((page) => page + 1)}>
            Next
          </button>
        </div>
      ) : null}
      </QueryState>
      <CustomerDetailPanel
        open={Boolean(detailCustomerId)}
        detail={detailQuery.data}
        isLoading={detailQuery.isLoading}
        error={detailQuery.error ? friendlyError(detailQuery.error) : null}
        onRetry={() => detailQuery.refetch()}
        onClose={closeCustomerDetail}
        onCallCustomer={(phone, customerId) => dialCustomer.mutate({ phone, customerId, source: 'customer_detail' })}
        isCallingCustomer={dialCustomer.isPending}
        callMessage={dialCustomer.data?.message ?? (dialCustomer.error ? friendlyError(dialCustomer.error) : null)}
        staffTerminology
      />
      {noteTarget ? (
        <CustomerNoteModal
          customer={noteTarget}
          body={noteBody}
          isSaving={customerNote.isPending}
          error={customerNote.error ? friendlyError(customerNote.error) : null}
          onBodyChange={setNoteBody}
          onClose={() => {
            setNoteTarget(null);
            setNoteBody('');
          }}
          onSubmit={() => customerNote.mutate({ customerId: noteTarget.id, body: noteBody.trim() })}
        />
      ) : null}
    </>
  );
}

function currentCustomerIdFromUrl() {
  return new URLSearchParams(window.location.search).get('customerId');
}


function CustomerNoteModal({
  customer,
  body,
  isSaving,
  error,
  onBodyChange,
  onClose,
  onSubmit,
}: {
  customer: CustomerRow;
  body: string;
  isSaving: boolean;
  error: string | null;
  onBodyChange: (body: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="customer-note-title" onMouseDown={onClose}>
      <section className="modal-card customer-note-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h3 id="customer-note-title">Customer note</h3>
            <p>{customer.name} - {customer.email || customer.phone || customer.id}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>x</button>
        </header>
        <label>
          Note
          <textarea value={body} onChange={(event) => onBodyChange(event.target.value)} maxLength={5000} rows={8} />
        </label>
        {error ? <div className="email-compose-error">{error}</div> : null}
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={isSaving || !body.trim()} onClick={onSubmit}>
            {isSaving ? 'Saving...' : 'Save note'}
          </button>
        </footer>
      </section>
    </div>
  );
}
