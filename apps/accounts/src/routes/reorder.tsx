import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, RotateCw, Trash2, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { fetchReorderTemplates, deleteReorderTemplate, type ReorderTemplate } from '@/lib/mock';

const QK = ['reorder-templates'] as const;

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function ReorderView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchReorderTemplates });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: deleteReorderTemplate,
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: QK });
      setSelectedId(null);
    },
    onError: (error) => toast.error('Delete failed', { description: (error as Error).message }),
  });

  const selected: ReorderTemplate | null = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;

  const total = templates.length;
  const totalUses = templates.reduce((sum, template) => sum + template.useCount, 0);
  const mostUsed = templates.slice().sort((a, b) => b.useCount - a.useCount)[0];

  return (
    <>
      <PageHeader
        titleI18nKey="reorder.title"
        subtitleI18nKey="reorder.subtitle"
        actions={(
          <button type="button" className="btn primary">
            <Plus size={14} /> {t('reorder.create')}
          </button>
        )}
      />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('reorder.kpi_templates')}</div><div className="val">{total}</div><div className="sub">saved</div></div>
        <div className="kpi"><div className="label">{t('reorder.kpi_reorders')}</div><div className="val">{totalUses}</div><div className="sub">all-time</div></div>
        <div className="kpi"><div className="label">{t('reorder.kpi_most_used')}</div><div className="val" style={{ fontSize: 15 }}>{mostUsed?.name ?? '—'}</div><div className="sub">{mostUsed?.useCount ?? 0} reorders</div></div>
      </div>

      <div className="reorder-shell">
        <div className="data-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('reorder.table_name')}</th>
                <th>{t('reorder.table_items')}</th>
                <th>{t('reorder.table_use_count')}</th>
                <th>{t('reorder.table_last_used')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
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
                  <td><span className="pill accent">{template.useCount}</span></td>
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
          <aside className="reorder-detail">
            <header>
              <div>
                <h3>{selected.name}</h3>
                <div className="muted">{t('reorder.kpi_templates')} · {selected.items.length} items · {selected.useCount} reorders</div>
              </div>
            </header>
            <div className="reorder-items">
              {selected.items.map((item) => (
                <div key={item.sku} className="reorder-item">
                  <div>
                    <div className="name">{item.name}</div>
                    <div className="muted">SKU {item.sku} · qty {item.qty}</div>
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
                className="btn danger-outline"
                onClick={() => { if (confirm(t('reorder.delete_confirm'))) remove.mutate(selected.id); }}
              >
                <Trash2 size={12} />
              </button>
              <button type="button" className="save-btn" style={{ flex: 1 }}>
                <RotateCw size={13} /> {t('reorder.use_template')}
              </button>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

export const Route = createFileRoute('/reorder')({ component: ReorderView });
