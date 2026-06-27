import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { PricingRuleModal } from '@/components/PricingRuleModal';
import { fetchPricingRules, deletePricingRule, type PricingRule } from '@/lib/mock';
import { useCan } from '@/lib/permissions';

const QK = ['pricing-rules'] as const;

function emptyRule(): PricingRule {
  return {
    id: `pr-draft-${Date.now()}`,
    name: '',
    targetType: 'segment',
    targetValue: '',
    scopeType: 'all',
    scopeValue: '',
    discountType: 'percentage',
    amount: 10,
    qtyBreaks: [],
    minCartUsd: null,
    priority: 5,
    active: true,
    combineWithOthers: false,
    combineWithCoupons: false,
    excludeOnSale: false,
    startsAt: null,
    endsAt: null,
    updatedAt: 'draft',
  };
}

function discountLabel(rule: PricingRule) {
  if (rule.discountType === 'percentage') return `${rule.amount}%`;
  if (rule.discountType === 'fixed') return `$${rule.amount.toFixed(2)}`;
  return `${rule.qtyBreaks.length} breaks`;
}

function PricingView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('settings.write');

  const { data: rules = [] } = useQuery({ queryKey: QK, queryFn: fetchPricingRules });

  const [editing, setEditing] = useState<PricingRule | null>(null);

  const remove = useMutation({
    mutationFn: deletePricingRule,
    onSuccess: () => {
      toast.success('Rule deleted');
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (error) => toast.error('Delete failed', { description: (error as Error).message }),
  });

  return (
    <>
      <PageHeader
        titleI18nKey="pricing.title"
        subtitleI18nKey="pricing.subtitle"
        actions={canWrite ? (
          <button id="btn-pricing-create" data-i18n-key="pricing.create" type="button" className="btn primary" onClick={() => setEditing(emptyRule())}>
            <Plus size={14} /> {t('pricing.create')}
          </button>
        ) : null}
      />

      {rules.length === 0 ? (
        <div className="pricing-list-empty">{t('pricing.empty_state')}</div>
      ) : (
        <div className="data-card">
          <table className="data-table" id="table-pricing-rules">
            <thead>
              <tr>
                <th data-i18n-key="pricing.columns.name">{t('pricing.columns.name')}</th>
                <th data-i18n-key="pricing.columns.target">{t('pricing.columns.target')}</th>
                <th data-i18n-key="pricing.columns.scope">{t('pricing.columns.scope')}</th>
                <th data-i18n-key="pricing.columns.discount">{t('pricing.columns.discount')}</th>
                <th data-i18n-key="pricing.columns.status">{t('pricing.columns.status')}</th>
                <th data-i18n-key="pricing.columns.updated">{t('pricing.columns.updated')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} id={`row-pricing-${rule.id}`}>
                  <td>
                    <div className="name">{rule.name}</div>
                    <div className="muted">Priority {rule.priority}</div>
                  </td>
                  <td>
                    <span className="pill accent">{t(`pricing.target_types.${rule.targetType}`)}</span>
                    <div className="muted" style={{ marginTop: 4 }}>{rule.targetValue || '—'}</div>
                  </td>
                  <td>
                    <span className="pill">{t(`pricing.scope_types.${rule.scopeType}`)}</span>
                    <div className="muted" style={{ marginTop: 4 }}>{rule.scopeValue || '—'}</div>
                  </td>
                  <td>
                    <strong>{discountLabel(rule)}</strong>
                    <div className="muted">{t(`pricing.discount_types.${rule.discountType}`)}</div>
                  </td>
                  <td>
                    {rule.active
                      ? <span className="pill success">{t('common.active')}</span>
                      : <span className="pill warn">{t('common.inactive')}</span>}
                  </td>
                  <td className="muted">{rule.updatedAt}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button id={`btn-pricing-edit-${rule.id}`} type="button" className="btn ghost" onClick={() => setEditing(rule)} disabled={!canWrite}>
                        <Edit3 size={13} />
                      </button>
                      <button
                        id={`btn-pricing-delete-${rule.id}`}
                        type="button"
                        className="btn ghost"
                        disabled={!canWrite}
                        onClick={() => {
                          if (confirm(t('pricing.modal.delete_confirm'))) remove.mutate(rule.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <PricingRuleModal open rule={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export const Route = createFileRoute('/pricing')({ component: PricingView });
