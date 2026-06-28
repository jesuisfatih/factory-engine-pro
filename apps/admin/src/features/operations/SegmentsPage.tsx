import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Edit2, GitBranch, Layers, Plus, RefreshCw, Save, Search, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  CreateSegmentInput,
  SegmentConditionInput,
  SegmentField,
  SegmentImportance,
  SegmentOperator,
  UpdateSegmentInput,
} from '@factory-engine-pro/contracts';
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

interface SegmentOwner {
  id: string;
  memberId: string;
  memberName: string | null;
  memberEmail: string | null;
  priority: number;
  importance: SegmentImportance;
  dailyCap: number | null;
  autoAssignNew: boolean;
  notes: string | null;
}

interface SegmentPreview {
  summary: {
    totalCustomers: number;
    totalCustomerUsers?: number;
    totalShopifyCustomers?: number;
    shopifySnapshotCustomers?: number;
    unlinkedShopifyCustomers?: number;
    matchCount: number;
    matchedCustomers?: number;
    matchedCustomerUsers?: number;
    matchedShopifyCustomers?: number;
    totalRevenue: number;
    avgOrders: number;
    atRisk: number;
  };
  breakdown?: {
    customers: number;
    customerUsers: number;
    shopifyCustomers: number;
    unlinkedShopifyCustomers: number;
  };
  matches: Array<{
    id: string;
    companyName: string;
    email: string | null;
    totalRevenue: number;
    totalOrders: number;
    healthScore: number;
    churnRisk: string;
    lifecycle: string;
  }>;
}

interface SegmentRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  priority: number;
  priorityGlobal: number;
  audienceType: string;
  lifecycleStage: string | null;
  matchMode: 'all' | 'any';
  customerCount: number;
  lastEvaluatedAt: string | null;
  isActive: boolean;
  conditions: SegmentConditionInput[];
  ownerships: SegmentOwner[];
  preview?: SegmentPreview;
}

interface SegmentStats {
  total: number;
  active: number;
  matchedCustomers: number;
  ownerships: number;
}

interface MemberRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
}

interface ConditionDraft {
  id: string;
  field: SegmentField;
  operator: SegmentOperator;
  value: string;
  timeframeDays: string;
  scopeType: 'all' | 'product' | 'collection';
  scopeValues: string;
}

interface SegmentDraft {
  id?: string;
  name: string;
  description: string;
  color: string;
  matchMode: 'all' | 'any';
  priority: number;
  audienceType: 'customer' | 'customer_user' | 'shopify_customer';
  isActive: boolean;
  conditions: ConditionDraft[];
}

interface ShopifySegmentOption {
  id: string;
  name: string;
  query: string;
  customerCount: number | null;
  lastSyncedAt: string | null;
  syncStatus: string | null;
}

const FIELDS: SegmentField[] = [
  'companyStatus',
  'companyName',
  'companyGroup',
  'companyEmail',
  'companyPhone',
  'companyTaxId',
  'currentLifecycleStage',
  'teamCount',
  'companyUserRole',
  'companyUserIsActive',
  'shopifyCustomerTags',
  'shopifyCustomerSegmentIds',
  'shopifyCustomerAcceptsMarketing',
  'shopifyCustomerState',
  'shopifyCustomerLocale',
  'shopifyCustomerOrdersCount',
  'shopifyCustomerTotalSpent',
  'totalRevenue',
  'totalOrders',
  'avgOrderValue',
  'daysSinceLastOrder',
  'healthScore',
  'churnRisk',
  'lifecycle',
  'clvTier',
  'buyerIntent',
  'segment',
  'engagementScore',
  'upsellPotential',
  'totalSessions',
  'totalProductViews',
  'totalAddToCarts',
  'periodRevenue',
  'periodOrders',
  'periodQuantity',
];
const OPERATORS: SegmentOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'contains', 'in', 'notIn'];
const NUMERIC_FIELDS = new Set<SegmentField>([
  'teamCount',
  'shopifyCustomerOrdersCount',
  'shopifyCustomerTotalSpent',
  'totalRevenue',
  'totalOrders',
  'avgOrderValue',
  'daysSinceLastOrder',
  'healthScore',
  'engagementScore',
  'upsellPotential',
  'totalSessions',
  'totalProductViews',
  'totalAddToCarts',
  'periodRevenue',
  'periodOrders',
  'periodQuantity',
]);
const BOOLEAN_FIELDS = new Set<SegmentField>(['companyUserIsActive', 'shopifyCustomerAcceptsMarketing']);
const PERIOD_FIELDS = new Set<SegmentField>(['periodRevenue', 'periodOrders', 'periodQuantity']);
const IMPORTANCE: SegmentImportance[] = ['critical', 'high', 'normal', 'low'];
const QK = ['operations', 'segments'] as const;

export function SegmentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('segments.write');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SegmentDraft | null>(null);
  const [ownerForm, setOwnerForm] = useState({ memberId: '', importance: 'normal' as SegmentImportance, priority: 0, dailyCap: '' });

  const segments = useQuery({ queryKey: QK, queryFn: fetchSegments });
  const stats = useQuery({ queryKey: [...QK, 'stats'], queryFn: fetchSegmentStats });
  const members = useQuery({ queryKey: ['identity', 'members', 'segments'], queryFn: fetchMembers });
  const detail = useQuery({
    queryKey: [...QK, 'detail', selectedId],
    queryFn: () => adminApi.segment(selectedId!) as Promise<SegmentRow>,
    enabled: Boolean(selectedId),
  });

  const rows = segments.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.name} ${row.description ?? ''}`.toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = detail.data ?? rows.find((row) => row.id === selectedId) ?? filtered[0] ?? null;

  const evaluate = useMutation({
    mutationFn: (id: string) => adminApi.evaluateSegment(id),
    onSuccess: () => {
      toast.success(t('segments.evaluated'));
      invalidateSegments(qc);
    },
    onError: (error) => toast.error(t('segments.evaluate_failed'), { description: apiErrorMessage(error) }),
  });

  const evaluateAll = useMutation({
    mutationFn: () => adminApi.evaluateAllSegments(),
    onSuccess: () => {
      toast.success(t('segments.evaluate_all_done'));
      invalidateSegments(qc);
    },
    onError: (error) => toast.error(t('segments.evaluate_failed'), { description: apiErrorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteSegment(id),
    onSuccess: () => {
      toast.success(t('segments.deleted'));
      setSelectedId(null);
      invalidateSegments(qc);
    },
    onError: (error) => toast.error(t('segments.delete_failed'), { description: apiErrorMessage(error) }),
  });

  const saveOwner = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a segment first');
      return adminApi.upsertSegmentOwnership(selected.id, {
        memberId: ownerForm.memberId,
        importance: ownerForm.importance,
        priority: ownerForm.priority,
        dailyCap: ownerForm.dailyCap ? Number(ownerForm.dailyCap) : null,
        autoAssignNew: true,
      });
    },
    onSuccess: () => {
      toast.success(t('segments.owner_saved'));
      setOwnerForm({ memberId: '', importance: 'normal', priority: 0, dailyCap: '' });
      invalidateSegments(qc);
    },
    onError: (error) => toast.error(t('segments.owner_save_failed'), { description: apiErrorMessage(error) }),
  });

  const removeOwner = useMutation({
    mutationFn: (ownershipId: string) => {
      if (!selected) throw new Error('Select a segment first');
      return adminApi.removeSegmentOwnership(selected.id, ownershipId);
    },
    onSuccess: () => {
      toast.success(t('segments.owner_removed'));
      invalidateSegments(qc);
    },
    onError: (error) => toast.error(t('segments.owner_remove_failed'), { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <PageHeader
        titleI18nKey="segments.title"
        subtitleI18nKey="segments.subtitle"
        actions={(
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => { segments.refetch(); stats.refetch(); if (selectedId) detail.refetch(); }}>
              <RefreshCw size={14} /> {t('common.refresh')}
            </button>
            {canWrite && (
              <>
                <button type="button" className="btn" disabled={evaluateAll.isPending || rows.length === 0} onClick={() => evaluateAll.mutate()}>
                  <GitBranch size={14} /> {t('segments.evaluate_all')}
                </button>
                <button id="btn-segment-create" type="button" className="btn primary" onClick={() => setEditing(emptyDraft())}>
                  <Plus size={14} /> {t('segments.new_segment')}
                </button>
              </>
            )}
          </div>
        )}
      />

      <div className="kpis four">
        <Kpi icon={<Layers size={16} />} label={t('segments.kpi.total')} value={stats.data?.total ?? null} sub={t('segments.kpi.total_sub')} />
        <Kpi icon={<CheckCircle2 size={16} />} label={t('segments.kpi.active')} value={stats.data?.active ?? null} sub={t('segments.kpi.active_sub')} />
        <Kpi icon={<Target size={16} />} label={t('segments.kpi.matched')} value={stats.data?.matchedCustomers ?? null} sub={t('segments.kpi.matched_sub')} />
        <Kpi icon={<GitBranch size={16} />} label={t('segments.kpi.owners')} value={stats.data?.ownerships ?? null} sub={t('segments.kpi.owners_sub')} />
      </div>

      {segments.isLoading && <StateBlock title={t('common.loading')} body={t('segments.loading_body')} />}
      {segments.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(segments.error)} action={<button type="button" className="btn" onClick={() => segments.refetch()}>{t('common.retry')}</button>} />}
      {segments.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('segments.empty_title')}
          body={t('segments.empty_state')}
          action={canWrite ? <button type="button" className="btn primary" onClick={() => setEditing(emptyDraft())}><Plus size={14} /> {t('segments.new_segment')}</button> : undefined}
        />
      )}
      {segments.isSuccess && rows.length > 0 && (
        <div className="seg-split">
          <aside className="seg-packages">
            <div className="seg-packages-head">
              <div>
                <h3>{t('segments.segment_list')}</h3>
                <div className="sub">{t('segments.segment_list_sub', { count: filtered.length })}</div>
              </div>
            </div>
            <div className="seg-search">
              <Search size={13} className="icon" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('segments.search_segments')} />
            </div>
            <div className="seg-list">
              {filtered.map((segment) => (
                <button key={segment.id} type="button" className={`seg-card${segment.id === selected?.id ? ' active' : ''}`} onClick={() => setSelectedId(segment.id)}>
                  <div className="head">
                    <span className="name"><span className="dot" style={{ background: segment.color }} />{segment.name}</span>
                    <span className={`pill ${segment.isActive ? 'success' : 'warn'}`}>{segment.isActive ? t('common.active') : t('common.inactive')}</span>
                  </div>
                  <div className="desc">{segment.description || t('segments.no_description')}</div>
                  <div className="chips">
                    <span className="pill accent">{t('segments.matches_count', { count: segment.customerCount })}</span>
                    <span className="pill">{segment.matchMode.toUpperCase()}</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <StateBlock title={t('segments.no_matches_title')} body={t('segments.no_matches_body')} />}
            </div>
          </aside>

          <main className="seg-detail">
            {!selected && <StateBlock title={t('segments.no_selection_title')} body={t('segments.no_selection_body')} />}
            {selected && (
              <>
                <div className="seg-detail-head">
                  <div>
                    <div className="title-row">
                      <span className="dot" style={{ width: 12, height: 12, borderRadius: '50%', background: selected.color }} />
                      <h2>{selected.name}</h2>
                      <span className={`pill ${selected.isActive ? 'success' : 'warn'}`}>{selected.isActive ? t('common.active') : t('common.inactive')}</span>
                    </div>
                    <div className="desc">{selected.description || t('segments.no_description')}</div>
                    <div className="meta">
                      <span>{t('segments.last_evaluated')}: {fmtDate(selected.lastEvaluatedAt)}</span>
                      <span>{t('segments.priority')}: {selected.priority}</span>
                      <span>{t('segments.audience')}: {label(selected.audienceType)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn" disabled={!canWrite || evaluate.isPending} onClick={() => evaluate.mutate(selected.id)}>
                      <RefreshCw size={13} /> {t('segments.evaluate')}
                    </button>
                    <button type="button" className="btn" disabled={!canWrite} onClick={() => setEditing(draftFromSegment(selected))}>
                      <Edit2 size={13} /> {t('common.edit')}
                    </button>
                    <button type="button" className="btn danger-outline" disabled={!canWrite || remove.isPending} onClick={() => confirm(t('segments.delete_confirm')) && remove.mutate(selected.id)}>
                      <Trash2 size={13} /> {t('common.delete')}
                    </button>
                  </div>
                </div>

                <div className="seg-stat-grid">
                  <SegStat label={t('segments.preview_matches')} value={selected.preview?.summary.matchCount ?? selected.customerCount} sub={t('segments.preview_matches_sub')} />
                  <SegStat label={t('segments.preview_revenue')} value={fmtMoney(selected.preview?.summary.totalRevenue ?? 0)} sub={t('segments.preview_revenue_sub')} />
                  <SegStat label={t('segments.preview_avg_orders')} value={round(selected.preview?.summary.avgOrders ?? 0)} sub={t('segments.preview_avg_orders_sub')} />
                  <SegStat label={t('segments.preview_risk')} value={selected.preview?.summary.atRisk ?? 0} sub={t('segments.preview_risk_sub')} />
                </div>

                <section className="ownership-card">
                  <div className="head">
                    <h3><GitBranch size={14} /> {t('segments.ownership_title')}</h3>
                    <span className="count">{t('segments.owner_count', { count: selected.ownerships.length })}</span>
                  </div>
                  <div className="sub">{t('segments.ownership_subtitle')}</div>
                  {canWrite && (
                    <form className="ownership-form" onSubmit={(event) => { event.preventDefault(); saveOwner.mutate(); }}>
                      <select value={ownerForm.memberId} onChange={(event) => setOwnerForm({ ...ownerForm, memberId: event.target.value })} required>
                        <option value="">{t('segments.select_member')}</option>
                        {(members.data ?? []).filter((member) => member.status === 'active').map((member) => (
                          <option key={member.id} value={member.id}>{member.firstName} {member.lastName} ({member.email})</option>
                        ))}
                      </select>
                      <select value={ownerForm.importance} onChange={(event) => setOwnerForm({ ...ownerForm, importance: event.target.value as SegmentImportance })}>
                        {IMPORTANCE.map((entry) => <option key={entry} value={entry}>{label(entry)}</option>)}
                      </select>
                      <input type="number" min={0} value={ownerForm.priority} onChange={(event) => setOwnerForm({ ...ownerForm, priority: Number(event.target.value) })} aria-label={t('segments.owner_priority')} />
                      <input type="number" min={0} value={ownerForm.dailyCap} onChange={(event) => setOwnerForm({ ...ownerForm, dailyCap: event.target.value })} placeholder={t('segments.daily_cap')} />
                      <button type="submit" className="assign-btn" disabled={!ownerForm.memberId || saveOwner.isPending}>{t('segments.assign')}</button>
                    </form>
                  )}
                  {selected.ownerships.length === 0 && <div className="owner-row-empty">{t('segments.no_owners')}</div>}
                  <div className="row-stack">
                    {selected.ownerships.map((owner) => (
                      <div key={owner.id} className="owner-row">
                        <span className="avatar" />
                        <div className="email">{owner.memberName ?? owner.memberEmail ?? owner.memberId}</div>
                        <div className="chips">
                          <span className={`importance ${importanceClass(owner.importance)}`}>{owner.importance}</span>
                          <span className="pill">{t('segments.owner_priority_short', { priority: owner.priority })}</span>
                          <span className="pill">{owner.dailyCap ? t('segments.owner_daily_cap', { cap: owner.dailyCap }) : t('segments.no_daily_cap')}</span>
                        </div>
                        {canWrite && (
                          <button type="button" className="btn ghost" disabled={removeOwner.isPending} onClick={() => removeOwner.mutate(owner.id)} title={t('segments.remove_owner')}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="customer-signal">
                  <div className="customer-signal-head">
                    <div>
                      <h3>{t('segments.preview_customers')}</h3>
                      <div className="sub">{t('segments.preview_customers_sub')}</div>
                    </div>
                    {detail.isFetching && <span className="pill">{t('common.loading')}</span>}
                  </div>
                  {(selected.preview?.matches ?? []).length === 0 && <div className="preview-empty"><div className="title">{t('segments.preview_empty_title')}</div><div className="note">{t('segments.preview_empty_body')}</div></div>}
                  <div className="signal-cards">
                    {(selected.preview?.matches ?? []).slice(0, 12).map((customer) => (
                      <div key={customer.id} className="signal-card">
                        <div className="name">{customer.companyName}</div>
                        <div className="meta">
                          <span>{customer.email ?? t('segments.no_email')}</span>
                          <span>{customer.totalOrders} orders</span>
                          <span>{fmtMoney(customer.totalRevenue)}</span>
                          <span>{label(customer.churnRisk)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      )}

      {editing && <SegmentEditor draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SegmentEditor({ draft, onClose }: { draft: SegmentDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [current, setCurrent] = useState(draft);
  const isCreate = !current.id;
  const shopifySegments = useQuery({
    queryKey: ['segments', 'shopify-catalog'],
    queryFn: fetchShopifySegments,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => setCurrent(draft), [draft]);

  const save = useMutation({
    mutationFn: () => isCreate
      ? adminApi.createSegment(toCreateInput(current))
      : adminApi.updateSegment(current.id!, toUpdateInput(current)),
    onSuccess: () => {
      toast.success(t('segments.saved'));
      invalidateSegments(qc);
      onClose();
    },
    onError: (error) => toast.error(t('segments.save_failed'), { description: apiErrorMessage(error) }),
  });

  const updateCondition = (id: string, patch: Partial<ConditionDraft>) => {
    setCurrent({
      ...current,
      conditions: current.conditions.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition)),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} labelledBy="segment-editor-title" describedBy="segment-editor-subtitle">
      <div className="modal-head">
        <div>
          <DialogTitle id="segment-editor-title" asChild><h2>{isCreate ? t('segments.modal.create_title') : t('segments.modal.edit_title')}</h2></DialogTitle>
          <DialogDescription id="segment-editor-subtitle" className="sub">{t('segments.modal.subtitle')}</DialogDescription>
        </div>
        <DialogClose className="close"><X size={16} /></DialogClose>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div className="modal-body">
          <section className="modal-section">
            <h3>{t('segments.modal.details')}</h3>
            <div className="field-row">
              <Field label={t('segments.modal.field_name')} value={current.name} onChange={(name) => setCurrent({ ...current, name })} required />
              <div className="field">
                <label>{t('segments.modal.field_color')}</label>
                <input type="color" value={current.color} onChange={(event) => setCurrent({ ...current, color: event.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t('segments.modal.field_description')}</label>
              <textarea rows={3} value={current.description} onChange={(event) => setCurrent({ ...current, description: event.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('segments.modal.field_match_mode')}</label>
                <select value={current.matchMode} onChange={(event) => setCurrent({ ...current, matchMode: event.target.value as 'all' | 'any' })}>
                  <option value="all">{t('segments.match_all')}</option>
                  <option value="any">{t('segments.match_any')}</option>
                </select>
              </div>
              <div className="field">
                <label>{t('segments.modal.field_priority')}</label>
                <input type="number" min={0} value={current.priority} onChange={(event) => setCurrent({ ...current, priority: Number(event.target.value) })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('segments.modal.field_audience')}</label>
                <select value={current.audienceType} onChange={(event) => setCurrent({ ...current, audienceType: event.target.value as SegmentDraft['audienceType'] })}>
                  <option value="customer">Customer</option>
                  <option value="customer_user">Customer user</option>
                  <option value="shopify_customer">Shopify customer</option>
                </select>
              </div>
              <label className="field" style={{ justifyContent: 'end' }}>
                <span>{t('segments.modal.field_active')}</span>
                <input type="checkbox" checked={current.isActive} onChange={(event) => setCurrent({ ...current, isActive: event.target.checked })} style={{ width: 18, height: 18 }} />
              </label>
            </div>
          </section>

          <section className="modal-section">
            <h3>{t('segments.modal.conditions')}</h3>
            {current.conditions.map((condition) => (
              <div key={condition.id} className="rule-row">
                <select
                  value={condition.field}
                  onChange={(event) => {
                    const field = event.target.value as SegmentField;
                    updateCondition(condition.id, { field, operator: operatorsFor(field)[0], value: defaultValueFor(field) });
                  }}
                >
                  {FIELDS.map((field) => <option key={field} value={field}>{label(field)}</option>)}
                </select>
                <select value={condition.operator} onChange={(event) => updateCondition(condition.id, { operator: event.target.value as SegmentOperator })}>
                  {operatorsFor(condition.field).map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                </select>
                {condition.field === 'shopifyCustomerSegmentIds' ? (
                  <select
                    value={condition.value}
                    onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                    required
                  >
                    <option value="">{shopifySegments.isLoading ? t('common.loading') : t('segments.modal.condition_value')}</option>
                    {(shopifySegments.data ?? []).map((segment) => (
                      <option key={segment.id} value={segment.id}>{segment.name} ({segment.customerCount ?? '-'})</option>
                    ))}
                  </select>
                ) : BOOLEAN_FIELDS.has(condition.field) ? (
                  <select value={condition.value || 'true'} onChange={(event) => updateCondition(condition.id, { value: event.target.value })}>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input value={condition.value} onChange={(event) => updateCondition(condition.id, { value: event.target.value })} placeholder={t('segments.modal.condition_value')} required />
                )}
                {PERIOD_FIELDS.has(condition.field) && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={condition.timeframeDays}
                      onChange={(event) => updateCondition(condition.id, { timeframeDays: event.target.value })}
                      aria-label="Timeframe days"
                      placeholder="30"
                    />
                    <select value={condition.scopeType} onChange={(event) => updateCondition(condition.id, { scopeType: event.target.value as ConditionDraft['scopeType'] })}>
                      <option value="all">All</option>
                      <option value="product">Product</option>
                      <option value="collection">Collection</option>
                    </select>
                    {condition.scopeType !== 'all' && (
                      <input
                        value={condition.scopeValues}
                        onChange={(event) => updateCondition(condition.id, { scopeValues: event.target.value })}
                        aria-label="Scope values"
                        placeholder="ID, SKU, handle"
                      />
                    )}
                  </>
                )}
                <button type="button" className="remove" onClick={() => setCurrent({ ...current, conditions: current.conditions.filter((entry) => entry.id !== condition.id) })} disabled={current.conditions.length === 1}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => setCurrent({ ...current, conditions: [...current.conditions, emptyCondition()] })}>
              <Plus size={13} /> {t('segments.modal.add_condition')}
            </button>
          </section>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="save-btn" disabled={save.isPending || !current.name.trim() || current.conditions.some((condition) => !condition.value.trim())}>
            <Save size={13} /> {save.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function fetchSegments() {
  return adminApi.segments() as Promise<SegmentRow[]>;
}

function fetchSegmentStats() {
  return adminApi.segmentStats() as Promise<SegmentStats>;
}

function fetchMembers() {
  return adminApi.members() as Promise<MemberRow[]>;
}

function fetchShopifySegments() {
  return adminApi.shopifyCustomerSegments('?limit=100') as Promise<ShopifySegmentOption[]>;
}

function invalidateSegments(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QK });
}

function emptyDraft(): SegmentDraft {
  return {
    name: '',
    description: '',
    color: '#2f80ed',
    matchMode: 'all',
    priority: 0,
    audienceType: 'customer',
    isActive: true,
    conditions: [emptyCondition()],
  };
}

function draftFromSegment(segment: SegmentRow): SegmentDraft {
  return {
    id: segment.id,
    name: segment.name,
    description: segment.description ?? '',
    color: segment.color,
    matchMode: segment.matchMode,
    priority: segment.priority,
    audienceType: segment.audienceType as SegmentDraft['audienceType'],
    isActive: segment.isActive,
    conditions: segment.conditions.length ? segment.conditions.map((condition) => ({
      id: crypto.randomUUID(),
      field: condition.field,
      operator: condition.operator,
      value: Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value),
      timeframeDays: condition.timeframeDays ? String(condition.timeframeDays) : '',
      scopeType: condition.scopeType ?? 'all',
      scopeValues: condition.scopeValues?.join(', ') ?? '',
    })) : [emptyCondition()],
  };
}

function emptyCondition(): ConditionDraft {
  return { id: crypto.randomUUID(), field: 'totalRevenue', operator: 'gte', value: '1000', timeframeDays: '', scopeType: 'all', scopeValues: '' };
}

function toCreateInput(draft: SegmentDraft): CreateSegmentInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    color: draft.color,
    matchMode: draft.matchMode,
    priority: draft.priority,
    audienceType: draft.audienceType,
    conditions: draft.conditions.map(toCondition),
    isActive: draft.isActive,
  };
}

function toUpdateInput(draft: SegmentDraft): UpdateSegmentInput {
  return toCreateInput(draft);
}

function toCondition(condition: ConditionDraft): SegmentConditionInput {
  const raw = condition.value.trim();
  const value = condition.operator === 'in' || condition.operator === 'notIn'
    ? raw.split(',').map((entry) => coerceValue(condition.field, entry.trim())).filter((entry) => entry !== '')
    : coerceValue(condition.field, raw);
  return {
    field: condition.field,
    operator: condition.operator,
    value,
    timeframeDays: condition.timeframeDays ? Number(condition.timeframeDays) : undefined,
    scopeType: condition.scopeType,
    scopeValues: condition.scopeValues.split(',').map((entry) => entry.trim()).filter(Boolean),
  };
}

function coerceValue(field: SegmentField, value: string) {
  if (NUMERIC_FIELDS.has(field)) return Number(value);
  if (BOOLEAN_FIELDS.has(field)) return value === 'true';
  return value;
}

function operatorsFor(field: SegmentField): SegmentOperator[] {
  if (NUMERIC_FIELDS.has(field)) return ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
  if (BOOLEAN_FIELDS.has(field)) return ['eq', 'neq'];
  if (field === 'shopifyCustomerTags' || field === 'shopifyCustomerSegmentIds' || field === 'companyUserRole') return ['contains', 'in', 'notIn', 'eq', 'neq'];
  return OPERATORS;
}

function defaultValueFor(field: SegmentField) {
  if (BOOLEAN_FIELDS.has(field)) return 'true';
  return '';
}

function Kpi({ icon, label, value, sub }: { icon: ReactNode; label: string; value: number | string | null; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-icon blue">{icon}</div>
      <div className="label">{label}</div>
      <div className="val">{value ?? '...'}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function SegStat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="seg-stat">
      <div className="label">{label}</div>
      <div className="val">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function Field({ label: fieldLabel, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <div className="field">
      <label>{fieldLabel}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </div>
  );
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

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function importanceClass(value: SegmentImportance) {
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'low') return 'low';
  return '';
}
