import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Plus, Trash2, Save, DollarSign } from 'lucide-react';
import { Dialog, DialogTitle, DialogDescription, DialogClose } from '@/components/Dialog';
import {
  savePricingRule,
  type PricingRule, type PricingTargetType, type PricingScopeType, type PricingDiscountType, type PricingQtyBreak,
} from '@/lib/live-data';

interface Props { open: boolean; rule: PricingRule; onClose: () => void; }

const TARGET_TYPES: PricingTargetType[] = ['customer', 'segment', 'tag', 'role'];
const SCOPE_TYPES: PricingScopeType[] = ['all', 'collection', 'product'];
const DISCOUNT_TYPES: PricingDiscountType[] = ['percentage', 'fixed', 'qty_break'];

function emptyBreak(): PricingQtyBreak {
  return { id: `qb-${Date.now()}-${Math.floor(Math.random() * 1000)}`, minQty: 10, discountPct: 5 };
}

export function PricingRuleModal({ open, rule, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PricingRule>(rule);
  const isCreate = rule.id.startsWith('pr-draft');

  useEffect(() => { if (open) setDraft(rule); }, [open, rule]);

  const save = useMutation({
    mutationFn: savePricingRule,
    onSuccess: () => {
      toast.success('Discount rule saved', { description: draft.name });
      qc.invalidateQueries({ queryKey: ['pricing-rules'] });
      onClose();
    },
    onError: (error) => toast.error('Save failed', { description: (error as Error).message }),
  });

  const updateBreak = (id: string, patch: Partial<PricingQtyBreak>) => {
    setDraft((current) => ({ ...current, qtyBreaks: current.qtyBreaks.map((qb) => qb.id === id ? { ...qb, ...patch } : qb) }));
  };
  const addBreak = () => setDraft((current) => ({ ...current, qtyBreaks: [...current.qtyBreaks, emptyBreak()] }));
  const removeBreak = (id: string) => setDraft((current) => ({ ...current, qtyBreaks: current.qtyBreaks.filter((qb) => qb.id !== id) }));

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose(); }}
      cardClassName="modal-card"
      labelledBy="pricing-modal-title"
    >
      <header className="modal-head">
        <div>
          <DialogTitle asChild>
            <h2 id="pricing-modal-title">{isCreate ? t('pricing.modal.create_title') : t('pricing.modal.edit_title')}</h2>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="sub">{t('pricing.modal.subtitle')}</div>
          </DialogDescription>
        </div>
        <DialogClose asChild>
          <button id="btn-pricing-modal-close" type="button" className="close" title={t('common.cancel')}>
            <X size={16} />
          </button>
        </DialogClose>
      </header>

      <form
        id="form-pricing-rule"
        className="modal-body"
        onSubmit={(event) => { event.preventDefault(); save.mutate(draft); }}
      >
        {/* ── LEFT: Identity + targeting + discount shape ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <section className="modal-section">
            <h3>{t('pricing.modal.field_name')}</h3>
            <div className="field">
              <label htmlFor="pricing-name">{t('pricing.modal.field_name')}</label>
              <input
                id="pricing-name"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('pricing.modal.field_name_placeholder')}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="pricing-target-type">{t('pricing.modal.field_target_type')}</label>
                <select
                  id="pricing-target-type"
                  value={draft.targetType}
                  onChange={(event) => setDraft((current) => ({ ...current, targetType: event.target.value as PricingTargetType, targetValue: '' }))}
                >
                  {TARGET_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`pricing.target_types.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pricing-target-value">{t('pricing.modal.field_target_value')}</label>
                <input
                  id="pricing-target-value"
                  value={draft.targetValue}
                  onChange={(event) => setDraft((current) => ({ ...current, targetValue: event.target.value }))}
                  placeholder={draft.targetType === 'segment' ? 'VIP Watchlist' : draft.targetType === 'tag' ? 'wholesale' : draft.targetType === 'role' ? 'reseller' : 'customer@example.com'}
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="pricing-scope-type">{t('pricing.modal.field_scope_type')}</label>
                <select
                  id="pricing-scope-type"
                  value={draft.scopeType}
                  onChange={(event) => setDraft((current) => ({ ...current, scopeType: event.target.value as PricingScopeType, scopeValue: '' }))}
                >
                  {SCOPE_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`pricing.scope_types.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pricing-scope-value">{t('pricing.modal.field_scope_value')}</label>
                <input
                  id="pricing-scope-value"
                  value={draft.scopeValue}
                  onChange={(event) => setDraft((current) => ({ ...current, scopeValue: event.target.value }))}
                  placeholder={draft.scopeType === 'all' ? '—' : draft.scopeType === 'collection' ? 'dtf-film' : 'tpu-powder-1kg'}
                  disabled={draft.scopeType === 'all'}
                />
              </div>
            </div>
          </section>

          <section className="modal-section">
            <h3>{t('pricing.modal.field_discount_type')}</h3>
            <div className="field-row">
              <div className="field">
                <label htmlFor="pricing-discount-type">{t('pricing.modal.field_discount_type')}</label>
                <select
                  id="pricing-discount-type"
                  value={draft.discountType}
                  onChange={(event) => setDraft((current) => ({ ...current, discountType: event.target.value as PricingDiscountType }))}
                >
                  {DISCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`pricing.discount_types.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pricing-amount">{t('pricing.modal.field_discount_amount')}</label>
                <input
                  id="pricing-amount"
                  type="number"
                  step="0.1"
                  value={draft.amount}
                  onChange={(event) => setDraft((current) => ({ ...current, amount: Number(event.target.value) }))}
                  disabled={draft.discountType === 'qty_break'}
                />
              </div>
            </div>

            {draft.discountType === 'qty_break' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: .4 }}>
                    {t('pricing.modal.field_qty_breaks')}
                  </span>
                  <button type="button" className="btn ghost" onClick={addBreak}>
                    <Plus size={13} /> {t('pricing.modal.add_qty_break')}
                  </button>
                </div>
                {draft.qtyBreaks.map((qb) => (
                  <div key={qb.id} className="qty-break-row">
                    <input
                      type="number"
                      value={qb.minQty}
                      onChange={(event) => updateBreak(qb.id, { minQty: Number(event.target.value) })}
                      placeholder={t('pricing.modal.qty_min')}
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={qb.discountPct}
                      onChange={(event) => updateBreak(qb.id, { discountPct: Number(event.target.value) })}
                      placeholder={t('pricing.modal.qty_discount')}
                    />
                    <button type="button" className="btn ghost" onClick={() => removeBreak(qb.id)} title={t('common.delete')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT: Policy + scheduling ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="discount-policy-card">
            <h4>Discount policy</h4>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.combineWithOthers}
                onChange={(event) => setDraft((current) => ({ ...current, combineWithOthers: event.target.checked }))}
              />
              {t('pricing.modal.field_combine_others')}
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.combineWithCoupons}
                onChange={(event) => setDraft((current) => ({ ...current, combineWithCoupons: event.target.checked }))}
              />
              {t('pricing.modal.field_combine_coupons')}
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.excludeOnSale}
                onChange={(event) => setDraft((current) => ({ ...current, excludeOnSale: event.target.checked }))}
              />
              {t('pricing.modal.field_exclude_on_sale')}
            </label>
          </div>

          <div className="discount-policy-card">
            <h4>Activation</h4>
            <div className="field">
              <label htmlFor="pricing-min-cart">{t('pricing.modal.field_min_cart')}</label>
              <input
                id="pricing-min-cart"
                type="number"
                value={draft.minCartUsd ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, minCartUsd: event.target.value === '' ? null : Number(event.target.value) }))}
                placeholder="No minimum"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="pricing-priority">{t('pricing.modal.field_priority')}</label>
                <input
                  id="pricing-priority"
                  type="number"
                  value={draft.priority}
                  onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) }))}
                />
              </div>
              <div className="field">
                <label className="checkbox-row" style={{ marginTop: 24 }}>
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
                  />
                  {t('pricing.modal.field_active')}
                </label>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="pricing-starts">{t('pricing.modal.field_starts_at')}</label>
                <input
                  id="pricing-starts"
                  type="date"
                  value={draft.startsAt ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value || null }))}
                />
              </div>
              <div className="field">
                <label htmlFor="pricing-ends">{t('pricing.modal.field_ends_at')}</label>
                <input
                  id="pricing-ends"
                  type="date"
                  value={draft.endsAt ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value || null }))}
                />
              </div>
            </div>
          </div>

          <div className="discount-policy-card" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <DollarSign size={16} />
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              {draft.discountType === 'percentage' && `${draft.amount}% off catalog`}
              {draft.discountType === 'fixed' && `$${draft.amount.toFixed(2)} off per item`}
              {draft.discountType === 'qty_break' && `${draft.qtyBreaks.length} quantity break${draft.qtyBreaks.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </aside>
      </form>

      <footer className="modal-foot">
        <button id="btn-pricing-cancel" type="button" className="btn ghost" onClick={onClose}>
          {t('pricing.modal.cancel')}
        </button>
        <button
          id="btn-pricing-save"
          type="submit"
          form="form-pricing-rule"
          className="save-btn"
          disabled={!draft.name.trim() || save.isPending}
        >
          <Save size={14} />
          {save.isPending ? t('common.loading') : t('pricing.modal.save')}
        </button>
      </footer>
    </Dialog>
  );
}
