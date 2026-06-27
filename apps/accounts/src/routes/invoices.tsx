import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { fetchInvoices, type BuyerInvoice, type InvoiceStatus } from '@/lib/mock';

const QK = ['invoices'] as const;

const STATUS_DOT: Record<InvoiceStatus, string> = {
  paid: '#16A34A', unpaid: '#0EA5E9', overdue: '#DC2626', partial: '#F59E0B',
};

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function balance(invoice: BuyerInvoice) {
  return invoice.totalUsd - invoice.paidUsd;
}

function InvoicesView() {
  const { t } = useTranslation();
  const { data: invoices = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchInvoices });

  const total = invoices.length;
  const outstanding = invoices.reduce((sum, invoice) => sum + balance(invoice), 0);
  const paid = invoices.filter((invoice) => invoice.status === 'paid').length;
  const overdue = invoices.filter((invoice) => invoice.status === 'overdue').length;

  return (
    <>
      <PageHeader titleI18nKey="invoices.title" subtitleI18nKey="invoices.subtitle" />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('invoices.kpi_total')}</div><div className="val">{total}</div><div className="sub">on file</div></div>
        <div className="kpi"><div className="label">{t('invoices.kpi_outstanding')}</div><div className="val">{fmtMoney(outstanding)}</div><div className="sub">across {invoices.filter((invoice) => balance(invoice) > 0).length} invoices</div></div>
        <div className="kpi"><div className="label">{t('invoices.kpi_paid')}</div><div className="val">{paid}</div><div className="sub">closed</div></div>
        <div className="kpi"><div className="label">{t('invoices.kpi_overdue')}</div><div className="val">{overdue}</div><div className="sub">past due</div></div>
      </div>

      <div className="data-card">
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
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                {isLoading ? t('common.loading') : t('invoices.empty_state')}
              </td></tr>
            ) : invoices.map((invoice) => {
              const bal = balance(invoice);
              return (
                <tr key={invoice.id} id={`row-invoice-${invoice.id}`}>
                  <td><strong>{invoice.invoiceNumber}</strong></td>
                  <td className="muted">{invoice.orderNumber}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[invoice.status] }} />
                      {t(`invoices.status.${invoice.status}`)}
                    </span>
                  </td>
                  <td className="muted">{invoice.issuedAt}</td>
                  <td className="muted">{invoice.dueAt}</td>
                  <td>{fmtMoney(invoice.totalUsd)}</td>
                  <td>{fmtMoney(invoice.paidUsd)}</td>
                  <td>
                    {bal > 0
                      ? <strong style={{ color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--text)' }}>{fmtMoney(bal)}</strong>
                      : <span className="muted">—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button type="button" className="btn ghost" title={t('invoices.view_details')}>
                        <ExternalLink size={12} />
                      </button>
                      {bal > 0 && (
                        <button type="button" className="btn primary" style={{ padding: '4px 10px', fontSize: 11 }}>
                          <CreditCard size={12} /> {t('invoices.pay')}
                        </button>
                      )}
                      <button type="button" className="btn ghost" title={t('invoices.open_file')}>
                        <Download size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/invoices')({ component: InvoicesView });
