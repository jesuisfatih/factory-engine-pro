import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Plus, RefreshCw, RotateCw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreatePricingRuleInput, DiscountType, PricingExecutionMode, ScopeType, TargetType, UpdatePricingRuleInput } from '@factory-engine-pro/contracts';
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

interface PricingRuleRow {
  id: string;
  name: string;
  description: string | null;
  targetType: TargetType;
  targetCustomerId: string | null;
  targetCustomerName: string | null;
  targetCustomerUserId: string | null;
  targetCustomerGroup: string | null;
  targetShopifyCustomerId: string | null;
  targetTags: string[];
  scopeType: ScopeType;
  scopeProductIds?: string[];
  scopeCollectionIds?: string[];
  scopeTags: string[];
  scopeVariantIds?: string[];
  discountType: DiscountType;
  discountValue: number;
  discountPercentage: number;
  qtyBreaks: QtyBreak[];
  minCartAmount: number;
  priority: number;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  shopifyDiscountCode: string | null;
  executionMode: PricingExecutionMode;
  shopifySyncState: string;
  shopifySyncError: string | null;
  shopifySyncedAt: string | null;
  updatedAt: string;
}

interface PricingRuleListResponse {
  data: PricingRuleRow[];
  meta: { count: number; limit: number };
}

interface QtyBreak {
  minQty: number;
  value: number;
  type: 'percentage' | 'fixed_amount' | 'fixed_price';
}

interface PricingDraft {
  id?: string;
  name: string;
  description: string;
  targetType: TargetType;
  targetValue: string;
  scopeType: ScopeType;
  scopeValue: string;
  discountType: DiscountType;
  discountValue: number;
  qtyBreaks: QtyBreak[];
  minCartAmount: string;
  priority: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
  executionMode: PricingExecutionMode;
}

const QK = ['commerce', 'pricing-rules'] as const;
const TARGET_TYPES: TargetType[] = ['all', 'customer', 'customer_user', 'customer_role', 'customer_tag', 'segment', 'buyer_intent', 'anonymous'];
const SCOPE_TYPES: ScopeType[] = ['all', 'products', 'variants', 'collections', 'tags'];
const DISCOUNT_TYPES: DiscountType[] = ['percentage', 'fixed_amount', 'fixed_price', 'qty_break'];
const EXECUTION_MODES: PricingExecutionMode[] = ['draft_order', 'native_basic', 'shopify_function', 'display_only'];

export function PricingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('pricing.write');
  const [editing, setEditing] = useState<PricingDraft | null>(null);
  const rules = useQuery({ queryKey: QK, queryFn: fetchPricingRules });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deletePricingRule(id),
    onSuccess: () => {
      toast.success(t('pricing.deleted'));
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (error) => toast.error(t('pricing.delete_failed'), { description: apiErrorMessage(error) }),
  });

  const toggle = useMutation({
    mutationFn: (rule: PricingRuleRow) => adminApi.togglePricingRule(rule.id, !rule.isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (error) => toast.error(t('pricing.toggle_failed'), { description: apiErrorMessage(error) }),
  });

  const resync = useMutation({
    mutationFn: (id: string) => adminApi.resyncPricingRule(id),
    onSuccess: () => {
      toast.success(t('pricing.resync_started'));
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (error) => toast.error(t('pricing.resync_failed'), { description: apiErrorMessage(error) }),
  });

  const rows = rules.data?.data ?? [];

  return (
    <>
      <PageHeader
        titleI18nKey="pricing.title"
        subtitleI18nKey="pricing.subtitle"
        actions={canWrite ? (
          <button id="btn-pricing-create" type="button" className="btn primary" onClick={() => setEditing(emptyDraft())}>
            <Plus size={14} /> {t('pricing.create')}
          </button>
        ) : null}
      />

      <div className="orders-toolbar">
        <button type="button" className="btn ghost" onClick={() => rules.refetch()}>
          <RefreshCw size={14} /> {t('common.refresh')}
        </button>
      </div>

      {rules.isLoading && <StateBlock title={t('common.loading')} body={t('pricing.loading_body')} />}
      {rules.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(rules.error)} action={<button type="button" className="btn" onClick={() => rules.refetch()}>{t('common.retry')}</button>} />}
      {rules.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('pricing.empty_title')}
          body={t('pricing.empty_state')}
          action={canWrite ? <button type="button" className="btn primary" onClick={() => setEditing(emptyDraft())}><Plus size={14} /> {t('pricing.create')}</button> : undefined}
        />
      )}
      {rules.isSuccess && rows.length > 0 && (
        <div className="data-card">
          <table className="data-table" id="table-pricing-rules">
            <thead>
              <tr>
                <th>{t('pricing.columns.name')}</th>
                <th>{t('pricing.columns.target')}</th>
                <th>{t('pricing.columns.scope')}</th>
                <th>{t('pricing.columns.discount')}</th>
                <th>{t('pricing.columns.status')}</th>
                <th>{t('pricing.columns.sync')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => (
                <tr key={rule.id} id={`row-pricing-${rule.id}`}>
                  <td>
                    <div className="name">{rule.name}</div>
                    <div className="muted">{t('pricing.priority', { priority: rule.priority })}</div>
                  </td>
                  <td>
                    <span className="pill accent">{t(`pricing.target_types.${rule.targetType}`)}</span>
                    <div className="muted" style={{ marginTop: 4 }}>{targetValue(rule) || '—'}</div>
                  </td>
                  <td>
                    <span className="pill">{t(`pricing.scope_types.${rule.scopeType}`)}</span>
                    <div className="muted" style={{ marginTop: 4 }}>{scopeValue(rule) || '—'}</div>
                  </td>
                  <td>
                    <strong>{discountLabel(rule)}</strong>
                    <div className="muted">{t(`pricing.discount_types.${rule.discountType}`)}</div>
                  </td>
                  <td>
                    <button type="button" className={`pill ${rule.isActive ? 'success' : 'warn'}`} disabled={!canWrite || toggle.isPending} onClick={() => toggle.mutate(rule)}>
                      {rule.isActive ? t('common.active') : t('common.inactive')}
                    </button>
                  </td>
                  <td>
                    <span className={`pill ${syncTone(rule.shopifySyncState)}`}>{label(rule.shopifySyncState)}</span>
                    {rule.shopifySyncError && <div className="muted" style={{ marginTop: 4 }}>{rule.shopifySyncError}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button type="button" className="btn ghost" disabled={!canWrite} onClick={() => setEditing(draftFromRule(rule))} title={t('common.edit')}>
                        <Edit3 size={13} />
                      </button>
                      <button type="button" className="btn ghost" disabled={!canWrite || resync.isPending} onClick={() => resync.mutate(rule.id)} title={t('pricing.resync')}>
                        <RotateCw size={13} />
                      </button>
                      <button type="button" className="btn ghost" disabled={!canWrite || remove.isPending} onClick={() => confirm(t('pricing.modal.delete_confirm')) && remove.mutate(rule.id)} title={t('common.delete')}>
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

      {editing && <PricingRuleEditor open draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PricingRuleEditor({ open, draft, onClose }: { open: boolean; draft: PricingDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [current, setCurrent] = useState(draft);
  const isCreate = !draft.id;
  useEffect(() => setCurrent(draft), [draft]);

  const save = useMutation({
    mutationFn: () => isCreate
      ? adminApi.createPricingRule(toCreateInput(current))
      : adminApi.updatePricingRule(current.id!, toUpdateInput(current)),
    onSuccess: () => {
      toast.success(t('pricing.saved'));
      qc.invalidateQueries({ queryKey: QK });
      onClose();
    },
    onError: (error) => toast.error(t('pricing.save_failed'), { description: apiErrorMessage(error) }),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }} cardClassName="modal-card" labelledBy="pricing-modal-title">
      <header className="modal-head">
        <div>
          <DialogTitle asChild><h2 id="pricing-modal-title">{isCreate ? t('pricing.modal.create_title') : t('pricing.modal.edit_title')}</h2></DialogTitle>
          <DialogDescription asChild><div className="sub">{t('pricing.modal.subtitle')}</div></DialogDescription>
        </div>
        <DialogClose asChild><button type="button" className="close" title={t('common.cancel')}><X size={16} /></button></DialogClose>
      </header>
      <form id="form-pricing-rule" className="modal-body" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <section className="modal-section">
            <h3>{t('pricing.modal.field_name')}</h3>
            <Field label={t('pricing.modal.field_name')} id="pricing-name">
              <input id="pricing-name" value={current.name} onChange={(event) => setCurrent({ ...current, name: event.target.value })} placeholder={t('pricing.modal.field_name_placeholder')} />
            </Field>
            <Field label={t('pricing.modal.field_description')} id="pricing-description">
              <input id="pricing-description" value={current.description} onChange={(event) => setCurrent({ ...current, description: event.target.value })} />
            </Field>
            <div className="field-row">
              <Field label={t('pricing.modal.field_target_type')} id="pricing-target-type">
                <select id="pricing-target-type" value={current.targetType} onChange={(event) => setCurrent({ ...current, targetType: event.target.value as TargetType, targetValue: '' })}>
                  {TARGET_TYPES.map((type) => <option key={type} value={type}>{t(`pricing.target_types.${type}`)}</option>)}
                </select>
              </Field>
              <Field label={t('pricing.modal.field_target_value')} id="pricing-target-value">
                <input id="pricing-target-value" value={current.targetValue} disabled={['all', 'anonymous', 'buyer_intent'].includes(current.targetType)} onChange={(event) => setCurrent({ ...current, targetValue: event.target.value })} placeholder={targetPlaceholder(current.targetType)} />
              </Field>
            </div>
            <div className="field-row">
              <Field label={t('pricing.modal.field_scope_type')} id="pricing-scope-type">
                <select id="pricing-scope-type" value={current.scopeType} onChange={(event) => setCurrent({ ...current, scopeType: event.target.value as ScopeType, scopeValue: '' })}>
                  {SCOPE_TYPES.map((type) => <option key={type} value={type}>{t(`pricing.scope_types.${type}`)}</option>)}
                </select>
              </Field>
              <Field label={t('pricing.modal.field_scope_value')} id="pricing-scope-value">
                <input id="pricing-scope-value" value={current.scopeValue} disabled={current.scopeType === 'all'} onChange={(event) => setCurrent({ ...current, scopeValue: event.target.value })} placeholder={t('pricing.modal.comma_placeholder')} />
              </Field>
            </div>
          </section>
          <section className="modal-section">
            <h3>{t('pricing.modal.field_discount_type')}</h3>
            <div className="field-row">
              <Field label={t('pricing.modal.field_discount_type')} id="pricing-discount-type">
                <select id="pricing-discount-type" value={current.discountType} onChange={(event) => setCurrent({ ...current, discountType: event.target.value as DiscountType })}>
                  {DISCOUNT_TYPES.map((type) => <option key={type} value={type}>{t(`pricing.discount_types.${type}`)}</option>)}
                </select>
              </Field>
              <Field label={t('pricing.modal.field_discount_amount')} id="pricing-amount">
                <input id="pricing-amount" type="number" step="0.01" value={current.discountValue} disabled={current.discountType === 'qty_break'} onChange={(event) => setCurrent({ ...current, discountValue: Number(event.target.value) })} />
              </Field>
            </div>
            {current.discountType === 'qty_break' && (
              <div>
                <button type="button" className="btn ghost" onClick={() => setCurrent({ ...current, qtyBreaks: [...current.qtyBreaks, { minQty: 10, value: 5, type: 'percentage' }] })}>
                  <Plus size={13} /> {t('pricing.modal.add_qty_break')}
                </button>
                {current.qtyBreaks.map((entry, index) => (
                  <div key={`${entry.minQty}-${index}`} className="qty-break-row">
                    <input type="number" value={entry.minQty} onChange={(event) => updateBreak(current, setCurrent, index, { minQty: Number(event.target.value) })} placeholder={t('pricing.modal.qty_min')} />
                    <input type="number" step="0.01" value={entry.value} onChange={(event) => updateBreak(current, setCurrent, index, { value: Number(event.target.value) })} placeholder={t('pricing.modal.qty_discount')} />
                    <button type="button" className="btn ghost" onClick={() => setCurrent({ ...current, qtyBreaks: current.qtyBreaks.filter((_, currentIndex) => currentIndex !== index) })}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="discount-policy-card">
            <h4>{t('pricing.modal.activation')}</h4>
            <Field label={t('pricing.modal.field_min_cart')} id="pricing-min-cart">
              <input id="pricing-min-cart" type="number" value={current.minCartAmount} onChange={(event) => setCurrent({ ...current, minCartAmount: event.target.value })} placeholder={t('pricing.modal.no_minimum')} />
            </Field>
            <div className="field-row">
              <Field label={t('pricing.modal.field_priority')} id="pricing-priority">
                <input id="pricing-priority" type="number" value={current.priority} onChange={(event) => setCurrent({ ...current, priority: Number(event.target.value) })} />
              </Field>
              <Field label={t('pricing.modal.field_execution_mode')} id="pricing-execution">
                <select id="pricing-execution" value={current.executionMode} onChange={(event) => setCurrent({ ...current, executionMode: event.target.value as PricingExecutionMode })}>
                  {EXECUTION_MODES.map((mode) => <option key={mode} value={mode}>{t(`pricing.execution_modes.${mode}`)}</option>)}
                </select>
              </Field>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={current.isActive} onChange={(event) => setCurrent({ ...current, isActive: event.target.checked })} />
              {t('pricing.modal.field_active')}
            </label>
          </div>
          <div className="discount-policy-card">
            <h4>{t('pricing.modal.schedule')}</h4>
            <div className="field-row">
              <Field label={t('pricing.modal.field_starts_at')} id="pricing-starts">
                <input id="pricing-starts" type="date" value={current.validFrom} onChange={(event) => setCurrent({ ...current, validFrom: event.target.value })} />
              </Field>
              <Field label={t('pricing.modal.field_ends_at')} id="pricing-ends">
                <input id="pricing-ends" type="date" value={current.validUntil} onChange={(event) => setCurrent({ ...current, validUntil: event.target.value })} />
              </Field>
            </div>
          </div>
        </aside>
      </form>
      <footer className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>{t('pricing.modal.cancel')}</button>
        <button type="submit" form="form-pricing-rule" className="save-btn" disabled={!current.name.trim() || save.isPending}>
          <Save size={14} /> {save.isPending ? t('common.loading') : t('pricing.modal.save')}
        </button>
      </footer>
    </Dialog>
  );
}

function fetchPricingRules() {
  return adminApi.pricingRules('?limit=100') as Promise<PricingRuleListResponse>;
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      <div className="name" style={{ marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ marginBottom: action ? 14 : 0 }}>{body}</div>
      {action}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;
}

function emptyDraft(): PricingDraft {
  return {
    name: '',
    description: '',
    targetType: 'all',
    targetValue: '',
    scopeType: 'all',
    scopeValue: '',
    discountType: 'percentage',
    discountValue: 10,
    qtyBreaks: [],
    minCartAmount: '',
    priority: 10,
    isActive: true,
    validFrom: '',
    validUntil: '',
    executionMode: 'draft_order',
  };
}

function draftFromRule(rule: PricingRuleRow): PricingDraft {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    targetType: rule.targetType === 'customer_group' ? 'customer_role' : rule.targetType,
    targetValue: targetValue(rule),
    scopeType: rule.scopeType,
    scopeValue: scopeValue(rule),
    discountType: rule.discountType,
    discountValue: rule.discountType === 'percentage' ? rule.discountPercentage : rule.discountValue,
    qtyBreaks: rule.qtyBreaks ?? [],
    minCartAmount: rule.minCartAmount ? String(rule.minCartAmount) : '',
    priority: rule.priority,
    isActive: rule.isActive,
    validFrom: rule.validFrom?.slice(0, 10) ?? '',
    validUntil: rule.validUntil?.slice(0, 10) ?? '',
    executionMode: rule.executionMode,
  };
}

function toCreateInput(draft: PricingDraft): CreatePricingRuleInput {
  return buildPayload(draft) as unknown as CreatePricingRuleInput;
}

function toUpdateInput(draft: PricingDraft): UpdatePricingRuleInput {
  return buildPayload(draft) as unknown as UpdatePricingRuleInput;
}

function buildPayload(draft: PricingDraft) {
  return {
    name: draft.name,
    description: draft.description || undefined,
    targetType: draft.targetType,
    ...targetPayload(draft),
    scopeType: draft.scopeType,
    ...scopePayload(draft),
    discountType: draft.discountType,
    discountValue: draft.discountType === 'percentage' ? undefined : draft.discountValue,
    discountPercentage: draft.discountType === 'percentage' ? draft.discountValue : undefined,
    qtyBreaks: draft.discountType === 'qty_break' ? draft.qtyBreaks : [],
    minCartAmount: draft.minCartAmount === '' ? undefined : Number(draft.minCartAmount),
    discountPolicy: 'best',
    priority: draft.priority,
    isActive: draft.isActive,
    validFrom: draft.validFrom ? new Date(draft.validFrom).toISOString() : undefined,
    validUntil: draft.validUntil ? new Date(draft.validUntil).toISOString() : undefined,
    executionMode: draft.executionMode,
  };
}

function targetPayload(draft: PricingDraft) {
  if (draft.targetType === 'customer') return { targetCustomerId: draft.targetValue || undefined };
  if (draft.targetType === 'customer_user') return { targetCustomerUserId: draft.targetValue || undefined };
  if (draft.targetType === 'customer_role' || draft.targetType === 'customer_group') return { targetCustomerGroup: draft.targetValue || undefined };
  if (draft.targetType === 'customer_tag') return { targetTags: splitCsv(draft.targetValue) };
  if (draft.targetType === 'segment') return { targetCustomerGroup: draft.targetValue || undefined };
  return {};
}

function scopePayload(draft: PricingDraft) {
  if (draft.scopeType === 'products') return { scopeProductIds: splitCsv(draft.scopeValue) };
  if (draft.scopeType === 'variants') return { scopeVariantIds: splitCsv(draft.scopeValue) };
  if (draft.scopeType === 'collections') return { scopeCollectionIds: splitCsv(draft.scopeValue) };
  if (draft.scopeType === 'tags') return { scopeTags: splitCsv(draft.scopeValue) };
  return {};
}

function updateBreak(draft: PricingDraft, setDraft: (draft: PricingDraft) => void, index: number, patch: Partial<QtyBreak>) {
  setDraft({ ...draft, qtyBreaks: draft.qtyBreaks.map((entry, currentIndex) => currentIndex === index ? { ...entry, ...patch } : entry) });
}

function splitCsv(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function targetValue(rule: PricingRuleRow) {
  if (rule.targetType === 'customer') return rule.targetCustomerName ?? rule.targetCustomerId ?? '';
  if (rule.targetType === 'customer_user') return rule.targetCustomerUserId ?? '';
  if (rule.targetType === 'customer_role' || rule.targetType === 'customer_group') return rule.targetCustomerGroup ?? '';
  if (rule.targetType === 'customer_tag') return rule.targetTags.join(', ');
  if (rule.targetType === 'segment') return rule.targetCustomerGroup ?? '';
  return '';
}

function scopeValue(rule: PricingRuleRow) {
  if (rule.scopeType === 'products') return (rule.scopeProductIds ?? []).join(', ');
  if (rule.scopeType === 'variants') return (rule.scopeVariantIds ?? []).join(', ');
  if (rule.scopeType === 'collections') return (rule.scopeCollectionIds ?? []).join(', ');
  if (rule.scopeType === 'tags') return rule.scopeTags.join(', ');
  return '';
}

function discountLabel(rule: PricingRuleRow) {
  if (rule.discountType === 'percentage') return `${rule.discountPercentage}%`;
  if (rule.discountType === 'fixed_amount') return `$${rule.discountValue.toFixed(2)}`;
  if (rule.discountType === 'fixed_price') return `$${rule.discountValue.toFixed(2)}`;
  return `${rule.qtyBreaks.length} ${rule.qtyBreaks.length === 1 ? 'break' : 'breaks'}`;
}

function syncTone(value: string) {
  if (value === 'synced') return 'success';
  if (value === 'failed') return 'danger';
  if (value === 'syncing' || value === 'pending') return 'warn';
  return 'info';
}

function label(value: string) {
  return value.replace(/_/g, ' ');
}

function targetPlaceholder(targetType: TargetType) {
  if (targetType === 'customer_tag') return 'vip, wholesale';
  if (targetType === 'customer_role' || targetType === 'customer_group') return 'b2b-owner, billing-only';
  if (targetType === 'segment') return 'seg_... or Shopify segment name';
  if (targetType === 'customer') return 'cust_...';
  if (targetType === 'customer_user') return 'cusr_...';
  return '—';
}
