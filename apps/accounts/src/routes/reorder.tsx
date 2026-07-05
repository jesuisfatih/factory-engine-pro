import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { fetchReorderTemplates, reorderOrder, type ReorderResult, type ReorderTemplate } from '@/lib/portal';

const QK = ['reorder-templates'] as const;

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function ReorderNotice({ result }: { result: ReorderResult | null }) {
  if (!result) return null;
  const tone = result.action === 'checkout' ? 'success' : result.action === 'review_portal_cart' ? 'info' : 'danger';
  return (
    <div className={`portal-alert ${tone}`}>
      <strong>{result.action === 'review_portal_cart' ? 'Account review cart saved' : result.action === 'checkout' ? 'Checkout ready' : 'Not reorderable'}</strong>
      <span>{result.message}</span>
      {result.checkoutUrl ? <a className="btn primary" href={result.checkoutUrl}>Proceed to checkout</a> : null}
      {!result.checkoutUrl && result.action === 'review_portal_cart' ? <Link to="/cart" className="btn">Open cart</Link> : null}
    </div>
  );
}

function ReorderView() {
  const { t } = useTranslation();
  const { data: templates = [], isLoading, isError, error, refetch } = useQuery({ queryKey: QK, queryFn: fetchReorderTemplates });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ReorderResult | null>(null);
  const reorder = useMutation({ mutationFn: (orderId: string) => reorderOrder(orderId), onSuccess: setResult });

  const selected: ReorderTemplate | null = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;

  const total = templates.length;
  const eligible = templates.filter((template) => template.canReorder).length;
  const mostRecent = templates[0];

  return (
    <>
      <PageHeader titleI18nKey="reorder.title" subtitleI18nKey="reorder.subtitle" />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('reorder.kpi_templates')}</div><div className="val">{total}</div><div className="sub">from real orders</div></div>
        <div className="kpi"><div className="label">{t('reorder.kpi_reorders')}</div><div className="val">{eligible}</div><div className="sub">availability check ready</div></div>
        <div className="kpi"><div className="label">{t('reorder.kpi_most_used')}</div><div className="val" style={{ fontSize: 15 }}>{mostRecent?.name ?? '-'}</div><div className="sub">latest order template</div></div>
      </div>

      <ReorderNotice result={result} />

      <div className="reorder-shell">
        <div className="data-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('reorder.table_name')}</th>
                <th>{t('reorder.table_items')}</th>
                <th>Eligible</th>
                <th>{t('reorder.table_last_used')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isError ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--danger)', padding: 32 }}>
                  {apiErrorMessage(error)} <button type="button" className="btn" onClick={() => refetch()} style={{ marginLeft: 8 }}>Retry</button>
                </td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  {isLoading ? t('common.loading') : t('reorder.empty_state')}
                </td></tr>
              ) : templates.map((template) => (
                <tr
                  key={template.id}
                  onClick={() => setSelectedId(template.id)}
                  style={{ cursor: 'pointer', background: selected?.id === template.id ? 'var(--surface-2)' : undefined }}
                >
                  <td><div className="name">{template.name}</div></td>
                  <td><span className="pill">{template.items.length}</span></td>
                  <td><span className={`pill ${template.canReorder ? 'success' : 'danger'}`}>{template.canReorder ? 'Ready' : 'Needs review'}</span></td>
                  <td className="muted">{template.lastUsedAt ?? 'never'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <section className="reorder-detail reorder-detail-wide" aria-label="Selected reorder review">
            <header>
              <div>
                <h3>{selected.name}</h3>
                <div className="muted">
                  Review the items before creating a reorder cart. Items that need review will not pretend checkout is ready.
                </div>
              </div>
              <span className={`pill ${selected.canReorder ? 'success' : 'danger'}`}>
                {selected.items.filter((item) => item.canReorder).length} of {selected.items.length} ready
              </span>
            </header>
            <div className="reorder-items">
              {selected.items.map((item) => (
                <div key={item.id} className="reorder-item">
                  <div>
                    <div className="name">{item.name}</div>
                    <div className="muted">SKU {item.sku || '-'} - qty {item.qty}</div>
                    {!item.canReorder ? <div className="muted">{item.reason}</div> : null}
                  </div>
                  <strong>{fmtMoney(item.qty * item.unitPriceUsd)}</strong>
                </div>
              ))}
            </div>
            <div className="reorder-total">
              <span>Total</span>
              <strong>{fmtMoney(selected.items.reduce((sum, item) => sum + item.qty * item.unitPriceUsd, 0))}</strong>
            </div>
            <div className="reorder-detail-actions">
              <button
                type="button"
                className="save-btn"
                style={{ flex: 1 }}
                disabled={!selected.canReorder || reorder.isPending}
                onClick={() => reorder.mutate(selected.orderId)}
              >
                <RotateCw size={13} /> {reorder.isPending ? 'Creating review cart...' : t('reorder.use_template')}
              </button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export const Route = createFileRoute('/reorder')({ component: ReorderView });
