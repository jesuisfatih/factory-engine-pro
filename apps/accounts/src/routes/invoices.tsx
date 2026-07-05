import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Download, ExternalLink, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { apiErrorMessage } from '@/lib/api';
import {
  downloadInvoice,
  fetchInvoice,
  fetchInvoices,
  openAccountActionUrl,
  payInvoice,
  type BuyerInvoice,
  type BuyerInvoiceDetail,
  type InvoiceStatus,
} from '@/lib/portal';

const QK = ['invoices'] as const;

const STATUS_DOT: Record<InvoiceStatus, string> = {
  paid: '#16A34A',
  unpaid: '#0EA5E9',
  overdue: '#DC2626',
  partial: '#F59E0B',
};

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function fmtDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

function invoiceNextAction(invoice: BuyerInvoice) {
  if (invoice.balanceUsd <= 0) {
    return { label: 'Paid - no action needed', tone: 'success' as const };
  }
  if (invoice.canPay) {
    return { label: 'Secure payment link ready', tone: 'info' as const };
  }
  if (invoice.hasFile) {
    return { label: 'Download invoice or contact billing', tone: 'warn' as const };
  }
  return { label: 'Contact billing to complete payment', tone: 'warn' as const };
}

function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['invoice-detail', invoiceId], queryFn: () => fetchInvoice(invoiceId) });
  const downloadMutation = useMutation({
    mutationFn: () => downloadInvoice(invoiceId),
    onSuccess(action) {
      setActionMessage(action.message);
      openAccountActionUrl(action.url);
    },
  });
  const payMutation = useMutation({
    mutationFn: () => payInvoice(invoiceId),
    onSuccess(action) {
      setActionMessage(action.message);
      if (action.url) openAccountActionUrl(action.url);
    },
  });

  if (detail.isLoading) return <div className="muted">Loading invoice detail...</div>;
  if (detail.isError) return <ErrorState title="Could not load invoice detail" error={detail.error} retry={() => detail.refetch()} />;
  const invoice = detail.data as BuyerInvoiceDetail;
  const canPayOnline = invoice.payment.state === 'payment_link' && Boolean(invoice.payment.url);
  const actionError = downloadMutation.error ?? payMutation.error;
  return (
    <div className="invoice-detail">
      <div className="order-detail-grid">
        <div className="portal-info-card">
          <span>Amount due</span>
          <strong>{fmtMoney(invoice.balanceUsd)}</strong>
          <small>{invoice.payment.label}</small>
        </div>
        <div className="portal-info-card">
          <span>Invoice total</span>
          <strong>{fmtMoney(invoice.totalUsd)}</strong>
          <small>Paid {fmtMoney(invoice.paidUsd)}</small>
        </div>
        <div className="portal-info-card">
          <span>Payment</span>
          <div className="invoice-action-stack">
            {canPayOnline ? (
              <button className="btn primary" type="button" onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
                <CreditCard size={12} /> {payMutation.isPending ? 'Opening...' : 'Pay invoice'}
              </button>
            ) : (
              <strong>{invoice.payment.label}</strong>
            )}
            {invoice.hasFile ? (
              <button className="btn" type="button" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
                <Download size={12} /> {downloadMutation.isPending ? 'Opening...' : 'Download invoice'}
              </button>
            ) : null}
            {!canPayOnline && invoice.balanceUsd > 0 ? (
              <button className="btn" type="button" onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
                <ExternalLink size={12} /> Payment options
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {actionMessage ? <div className="portal-alert info"><strong>Action status</strong><span>{actionMessage}</span></div> : null}
      {actionError ? <div className="portal-alert danger"><strong>Action failed</strong><span>{apiErrorMessage(actionError)}</span></div> : null}
      {invoice.notes ? <div className="portal-alert info"><strong>Invoice note</strong><span>{invoice.notes}</span></div> : null}
      {invoice.items.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr><th>Item</th><th>SKU</th><th>Qty</th><th>Total</th></tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="muted">{item.sku ?? '-'}</td>
                <td>{item.quantity}</td>
                <td>{fmtMoney(item.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="muted">No invoice line items are attached yet.</div>}
      <div className="invoice-history-grid">
        <section>
          <h4>Payment history</h4>
          {invoice.payments.length > 0 ? (
            invoice.payments.map((payment) => (
              <div className="invoice-history-row" key={payment.id}>
                <strong>{fmtMoney(payment.amountUsd)}</strong>
                <span>{payment.method}</span>
                <small>{fmtDateTime(payment.recordedAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">No payment records are attached yet.</p>
          )}
        </section>
        <section>
          <h4>Invoice timeline</h4>
          {invoice.activities.length > 0 ? (
            invoice.activities.map((activity) => (
              <div className="invoice-history-row" key={activity.id}>
                <strong>{activity.label}</strong>
                <span>{activity.detail}</span>
                <small>{fmtDateTime(activity.createdAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">No invoice timeline events yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice, expanded, onToggle }: { invoice: BuyerInvoice; expanded: boolean; onToggle: () => void }) {
  const nextAction = invoiceNextAction(invoice);
  return (
    <>
      <tr id={`row-invoice-${invoice.id}`} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          <strong>{invoice.invoiceNumber}</strong>
          <div className={`invoice-action-hint ${nextAction.tone}`}>{nextAction.label}</div>
        </td>
        <td className="muted">{invoice.orderNumber ?? 'Not linked'}</td>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[invoice.status] }} />
            {invoice.status}
          </span>
        </td>
        <td className="muted">{fmtDate(invoice.issuedAt)}</td>
        <td className="muted">{fmtDate(invoice.dueAt)}</td>
        <td>{fmtMoney(invoice.totalUsd)}</td>
        <td>{fmtMoney(invoice.paidUsd)}</td>
        <td>
          {invoice.balanceUsd > 0
            ? <strong style={{ color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--text)' }}>{fmtMoney(invoice.balanceUsd)}</strong>
            : <span className="muted">-</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8}>
            <InvoiceDetail invoiceId={invoice.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function InvoicesView() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const { data: invoicePage, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...QK, status, search, limit, cursor],
    queryFn: () => fetchInvoices({
      status,
      search: search.trim() || undefined,
      limit,
      cursor: cursor ?? undefined,
    }),
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const invoices = invoicePage?.data ?? [];
  const meta = invoicePage?.meta ?? { count: 0, pageCount: 0, limit, cursor: null, nextCursor: null };

  const total = meta.count;
  const visible = invoices.length;
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.balanceUsd, 0);
  const paid = invoices.filter((invoice) => invoice.status === 'paid').length;
  const overdue = invoices.filter((invoice) => invoice.status === 'overdue').length;
  const currentOffset = Number(cursor ?? 0) || 0;

  return (
    <>
      <PageHeader titleI18nKey="invoices.title" subtitleI18nKey="invoices.subtitle" />

      <div className="portal-alert info" style={{ marginBottom: 14 }}>
        <strong>Official invoice records only</strong>
        <span>This page shows invoices created for your account. Order receipts are not shown as payable invoices.</span>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('invoices.kpi_total')}</div><div className="val">{total}</div><div className="sub">matching invoices</div></div>
        <div className="kpi"><div className="label">{t('invoices.kpi_outstanding')}</div><div className="val">{fmtMoney(outstanding)}</div><div className="sub">visible page</div></div>
        <div className="kpi"><div className="label">{t('invoices.kpi_paid')}</div><div className="val">{paid}</div><div className="sub">visible page</div></div>
        <div className="kpi"><div className="label">{t('invoices.kpi_overdue')}</div><div className="val">{overdue}</div><div className="sub">visible page</div></div>
      </div>

      <div className="data-card">
        <div className="portal-list-controls">
          <div className="tabs" role="tablist" style={{ flex: 1 }}>
            {(['all', 'unpaid', 'partial', 'overdue', 'paid'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                className={`tab${status === value ? ' active' : ''}`}
                onClick={() => {
                  setCursor(null);
                  setExpanded(null);
                  setStatus(value);
                }}
              >
                {value === 'all' ? 'All' : value}
              </button>
            ))}
          </div>
          <label className="portal-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => {
                setCursor(null);
                setExpanded(null);
                setSearch(event.target.value);
              }}
              placeholder="Search invoice or order number"
            />
          </label>
          <label className="portal-page-size">
            Show
            <select
              value={limit}
              onChange={(event) => {
                setCursor(null);
                setExpanded(null);
                setLimit(Number(event.target.value));
              }}
            >
              {[10, 50, 100, 150].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="portal-page-status">
            {total === 0 ? 'No matching invoices' : `${currentOffset + 1}-${currentOffset + visible} of ${total}`}
          </div>
        </div>
        <table className="data-table" id="table-invoices">
          <thead>
            <tr>
              <th>{t('invoices.columns.invoice')}</th>
              <th>{t('invoices.columns.order')}</th>
              <th>{t('invoices.columns.status')}</th>
              <th>{t('invoices.columns.issued')}</th>
              <th>{t('invoices.columns.due')}</th>
              <th>{t('invoices.columns.total')}</th>
              <th>{t('invoices.columns.paid')}</th>
              <th>{t('invoices.columns.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {isError ? (
              <tr><td colSpan={8}><ErrorState title="Could not load invoices" error={error} retry={() => refetch()} /></td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                {isLoading ? t('common.loading') : 'No official invoices are attached to your account yet.'}
              </td></tr>
            ) : invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                expanded={expanded === invoice.id}
                onToggle={() => setExpanded((current) => current === invoice.id ? null : invoice.id)}
              />
            ))}
          </tbody>
        </table>
        {invoices.length > 0 ? (
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
        ) : null}
      </div>
    </>
  );
}

export const Route = createFileRoute('/invoices')({ component: InvoicesView });
