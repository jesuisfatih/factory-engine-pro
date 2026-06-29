import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Edit2, ExternalLink, GitBranch, Layers, Plus, RefreshCw, Save, Search, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import type {
  CreateSegmentInput,
  SegmentConditionInput,
  SegmentField,
  SegmentImportance,
  SegmentOperator,
  SyncShopifySegmentsResponse,
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
    primaryEntity?: string;
    activeGroups?: string[];
    companySignals?: { matchedCount: number };
    companyUserSignals?: { matchedCount: number; matchedCustomerCount: number };
    shopifyCustomerSignals?: { matchedCount: number; linkedCustomerCount: number; linkedUserCount: number; unlinkedCount: number };
  };
  matches: Array<{
    id: string;
    customerId?: string;
    companyName: string;
    email: string | null;
    phone?: string | null;
    tags?: string[];
    status?: string;
    shopifyCustomerId?: string | null;
    customerUsers?: number;
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue?: number;
    lastOrderAt?: string | null;
    healthScore: number;
    churnRisk: string;
    lifecycle: string;
  }>;
  companyUserMatches?: Array<{
    id: string;
    customerId: string;
    companyName: string;
    email: string;
    roleValues: string[];
    isActive: boolean;
  }>;
  shopifyCustomerMatches?: Array<{
    shopifyCustomerId: string;
    name: string;
    email: string | null;
    segmentIds: string[];
    ordersCount: number;
    totalSpent: number;
    linkedCustomerId: string | null;
    companyName: string | null;
    linkState: 'linked' | 'unlinked';
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
  audienceType: 'accountscompany' | 'shopify_customer' | 'workforce_pool';
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

type PreviewSort = 'revenue_desc' | 'orders_desc' | 'score_desc' | 'name_asc';

interface PreviewCustomerRow {
  id: string;
  customerId: string | null;
  source: 'customer' | 'company_user' | 'shopify_customer';
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  orders: number;
  revenue: number;
  score: number | null;
  lifecycle: string | null;
  churnRisk: string | null;
  shopifyCustomerId: string | null;
  linkState: 'linked' | 'unlinked';
  signals: string[];
}

const FIELDS: SegmentField[] = [
  'companyStatus',
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
  'churnRisk',
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
  'churnRisk',
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
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewLtvMin, setPreviewLtvMin] = useState('');
  const [previewLtvMax, setPreviewLtvMax] = useState('');
  const [previewScoreMin, setPreviewScoreMin] = useState('');
  const [previewLinkFilter, setPreviewLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [previewSort, setPreviewSort] = useState<PreviewSort>('revenue_desc');
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);

  const segments = useQuery({ queryKey: QK, queryFn: fetchSegments });
  const stats = useQuery({ queryKey: [...QK, 'stats'], queryFn: fetchSegmentStats });
  const members = useQuery({ queryKey: ['identity', 'members', 'segments'], queryFn: fetchMembers });
  const detail = useQuery({
    queryKey: [...QK, 'detail', selectedId],
    queryFn: () => adminApi.segment(selectedId!) as Promise<SegmentRow>,
    enabled: Boolean(selectedId),
  });
  const customerDetail = useQuery({
    queryKey: [...QK, 'customer-detail', detailCustomerId],
    queryFn: () => adminApi.customerDetail(detailCustomerId!),
    enabled: Boolean(detailCustomerId),
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
  const previewRows = useMemo(() => buildPreviewRows(selected?.preview), [selected?.preview]);
  const visiblePreviewRows = useMemo(() => filterPreviewRows(previewRows, {
    search: previewSearch,
    ltvMin: previewLtvMin,
    ltvMax: previewLtvMax,
    scoreMin: previewScoreMin,
    linkState: previewLinkFilter,
    sort: previewSort,
  }), [previewRows, previewSearch, previewLtvMin, previewLtvMax, previewScoreMin, previewLinkFilter, previewSort]);
  const hasPreviewFilters = Boolean(previewSearch.trim() || previewLtvMin || previewLtvMax || previewScoreMin || previewLinkFilter !== 'all' || previewSort !== 'revenue_desc');

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

  const syncShopify = useMutation({
    mutationFn: () => adminApi.syncShopifySegments({ force: false, limit: 100 }) as Promise<SyncShopifySegmentsResponse>,
    onSuccess: (result) => {
      toast.success('Shopify segments synced', {
        description: `${result.created} created, ${result.updated} updated, ${result.evaluated} evaluated, ${result.skippedEvaluation} already current${result.failed ? `, ${result.failed} failed` : ''}.`,
      });
      invalidateSegments(qc);
    },
    onError: (error) => toast.error('Shopify segments could not be synced', { description: apiErrorMessage(error) }),
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
                <button type="button" className="btn" disabled={syncShopify.isPending} onClick={() => syncShopify.mutate()}>
                  <RefreshCw size={14} className={syncShopify.isPending ? 'spin' : undefined} /> Sync Shopify segments
                </button>
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
          action={canWrite ? (
            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn primary" disabled={syncShopify.isPending} onClick={() => syncShopify.mutate()}>
                <RefreshCw size={14} className={syncShopify.isPending ? 'spin' : undefined} /> Sync Shopify segments
              </button>
              <button type="button" className="btn" onClick={() => setEditing(emptyDraft())}><Plus size={14} /> {t('segments.new_segment')}</button>
            </div>
          ) : undefined}
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
                    <span className={segment.ownerships.length ? 'pill success' : 'pill warn'}>{ownerSummary(segment.ownerships)}</span>
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
                      <span>{ownerSummary(selected.ownerships)}</span>
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

                {selected.preview?.breakdown && (
                  <div className="seg-stat-grid">
                    <SegStat
                      label={t('segments.preview_company_signals')}
                      value={selected.preview.breakdown.companySignals?.matchedCount ?? selected.preview.breakdown.customers}
                      sub={t('segments.preview_primary_entity', { entity: label(selected.preview.breakdown.primaryEntity ?? 'company') })}
                    />
                    <SegStat
                      label={t('segments.preview_user_signals')}
                      value={selected.preview.breakdown.companyUserSignals?.matchedCount ?? selected.preview.breakdown.customerUsers}
                      sub={t('segments.preview_user_company_count', { count: selected.preview.breakdown.companyUserSignals?.matchedCustomerCount ?? 0 })}
                    />
                    <SegStat
                      label={t('segments.preview_shopify_signals')}
                      value={selected.preview.breakdown.shopifyCustomerSignals?.matchedCount ?? selected.preview.breakdown.shopifyCustomers}
                      sub={t('segments.preview_shopify_linked_count', { count: selected.preview.breakdown.shopifyCustomerSignals?.linkedCustomerCount ?? 0 })}
                    />
                    <SegStat
                      label={t('segments.preview_unlinked_shopify')}
                      value={selected.preview.breakdown.shopifyCustomerSignals?.unlinkedCount ?? selected.preview.breakdown.unlinkedShopifyCustomers}
                      sub={t('segments.preview_active_groups', { groups: (selected.preview.breakdown.activeGroups ?? []).map(label).join(', ') || '-' })}
                    />
                  </div>
                )}

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
                      <h3>Preview</h3>
                      <div className="sub">Matched customers from Customer, Customer User, and Shopify signals in one list.</div>
                    </div>
                    <div className="right">{visiblePreviewRows.length}/{previewRows.length}</div>
                    {detail.isFetching && <span className="pill">{t('common.loading')}</span>}
                  </div>
                  <div className="preview-toolbar">
                    <div className="orders-search">
                      <Search size={14} />
                      <input value={previewSearch} onChange={(event) => setPreviewSearch(event.target.value)} placeholder="Search name, email, phone, Shopify id" />
                    </div>
                    <input type="number" min={0} value={previewLtvMin} onChange={(event) => setPreviewLtvMin(event.target.value)} placeholder="Min LTV" aria-label="Minimum LTV" />
                    <input type="number" min={0} value={previewLtvMax} onChange={(event) => setPreviewLtvMax(event.target.value)} placeholder="Max LTV" aria-label="Maximum LTV" />
                    <input type="number" min={0} max={100} value={previewScoreMin} onChange={(event) => setPreviewScoreMin(event.target.value)} placeholder="Min score" aria-label="Minimum match score" />
                    <select value={previewLinkFilter} onChange={(event) => setPreviewLinkFilter(event.target.value as 'all' | 'linked' | 'unlinked')} aria-label="Preview link filter">
                      <option value="all">All</option>
                      <option value="linked">Linked customers</option>
                      <option value="unlinked">Unlinked Shopify</option>
                    </select>
                    <select value={previewSort} onChange={(event) => setPreviewSort(event.target.value as PreviewSort)} aria-label="Preview sort">
                      <option value="revenue_desc">LTV high to low</option>
                      <option value="orders_desc">Orders high to low</option>
                      <option value="score_desc">Score high to low</option>
                      <option value="name_asc">Name A-Z</option>
                    </select>
                    {hasPreviewFilters && (
                      <button type="button" className="btn ghost" onClick={() => {
                        setPreviewSearch('');
                        setPreviewLtvMin('');
                        setPreviewLtvMax('');
                        setPreviewScoreMin('');
                        setPreviewLinkFilter('all');
                        setPreviewSort('revenue_desc');
                      }}>
                        <X size={13} /> Clear
                      </button>
                    )}
                  </div>
                  {previewRows.length === 0 && <div className="preview-empty"><div className="title">{t('segments.preview_empty_title')}</div><div className="note">{t('segments.preview_empty_body')}</div></div>}
                  {previewRows.length > 0 && visiblePreviewRows.length === 0 && <div className="preview-empty"><div className="title">No preview rows match filters</div><div className="note">Adjust search, LTV, score, or link-state filters.</div></div>}
                  <div className="signal-cards">
                    {visiblePreviewRows.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="signal-card preview-customer-row"
                        disabled={!customer.customerId}
                        onClick={() => customer.customerId && setDetailCustomerId(customer.customerId)}
                        title={customer.customerId ? 'Open customer history' : 'Unlinked Shopify customer'}
                      >
                        <div className="name">
                          <span>{customer.name}</span>
                          {customer.customerId && <ExternalLink size={13} />}
                        </div>
                        <div className="meta">
                          <span>{customer.email ?? t('segments.no_email')}</span>
                          <span>{customer.phone ?? 'No phone'}</span>
                          <span>{customer.orders} orders</span>
                          <span>{fmtMoney(customer.revenue)}</span>
                          <span>Score {customer.score ?? '-'}</span>
                          <span>{customer.lifecycle ? label(customer.lifecycle) : '-'}</span>
                          <span>{customer.churnRisk ? label(customer.churnRisk) : '-'}</span>
                          <span>{label(customer.linkState)}</span>
                        </div>
                        <div className="chips">
                          {customer.signals.map((signal) => <span key={signal} className="pill accent">{signal}</span>)}
                          {customer.tags.slice(0, 3).map((tag) => <span key={tag} className="pill">{tag}</span>)}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      )}

      {editing && <SegmentEditor draft={editing} onClose={() => setEditing(null)} />}
      <CustomerDetailPanel
        open={Boolean(detailCustomerId)}
        detail={customerDetail.data}
        isLoading={customerDetail.isLoading}
        error={customerDetail.error ? apiErrorMessage(customerDetail.error) : null}
        onRetry={() => customerDetail.refetch()}
        onClose={() => setDetailCustomerId(null)}
      />
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
                  <option value="accountscompany">Accounts company</option>
                  <option value="shopify_customer">Shopify customer</option>
                  <option value="workforce_pool">Workforce pool</option>
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
    audienceType: 'accountscompany',
    isActive: true,
    conditions: [emptyCondition()],
  };
}

function buildPreviewRows(preview: SegmentPreview | undefined): PreviewCustomerRow[] {
  if (!preview) return [];
  const rows = new Map<string, PreviewCustomerRow>();
  for (const customer of preview.matches ?? []) {
    rows.set(customer.id, {
      id: `customer-${customer.id}`,
      customerId: customer.customerId ?? customer.id,
      source: 'customer',
      name: customer.companyName,
      email: customer.email,
      phone: customer.phone ?? null,
      tags: customer.tags ?? [],
      orders: Number(customer.totalOrders || 0),
      revenue: Number(customer.totalRevenue || 0),
      score: Number.isFinite(customer.healthScore) ? customer.healthScore : null,
      lifecycle: customer.lifecycle,
      churnRisk: customer.churnRisk,
      shopifyCustomerId: customer.shopifyCustomerId ?? null,
      linkState: 'linked',
      signals: ['Customer'],
    });
  }
  for (const user of preview.companyUserMatches ?? []) {
    const existing = rows.get(user.customerId);
    if (existing) {
      existing.signals = unique([...existing.signals, 'Customer user']);
      if (!existing.email) existing.email = user.email;
      continue;
    }
    rows.set(user.customerId, {
      id: `customer-user-${user.id}`,
      customerId: user.customerId,
      source: 'company_user',
      name: user.companyName || user.email,
      email: user.email,
      phone: null,
      tags: user.roleValues,
      orders: 0,
      revenue: 0,
      score: user.isActive ? 100 : 0,
      lifecycle: user.isActive ? 'active' : 'inactive',
      churnRisk: null,
      shopifyCustomerId: null,
      linkState: 'linked',
      signals: ['Customer user'],
    });
  }
  for (const shopify of preview.shopifyCustomerMatches ?? []) {
    const linkedId = shopify.linkedCustomerId;
    if (linkedId && rows.has(linkedId)) {
      const existing = rows.get(linkedId)!;
      existing.signals = unique([...existing.signals, 'Shopify']);
      existing.shopifyCustomerId = shopify.shopifyCustomerId;
      if (!existing.email) existing.email = shopify.email;
      if (!existing.revenue) existing.revenue = Number(shopify.totalSpent || 0);
      if (!existing.orders) existing.orders = Number(shopify.ordersCount || 0);
      continue;
    }
    rows.set(`shopify-${shopify.shopifyCustomerId}`, {
      id: `shopify-${shopify.shopifyCustomerId}`,
      customerId: linkedId,
      source: 'shopify_customer',
      name: shopify.name || shopify.companyName || shopify.email || shopify.shopifyCustomerId,
      email: shopify.email,
      phone: null,
      tags: shopify.segmentIds,
      orders: Number(shopify.ordersCount || 0),
      revenue: Number(shopify.totalSpent || 0),
      score: shopify.linkState === 'linked' ? 100 : 0,
      lifecycle: null,
      churnRisk: null,
      shopifyCustomerId: shopify.shopifyCustomerId,
      linkState: shopify.linkState,
      signals: ['Shopify'],
    });
  }
  return Array.from(rows.values());
}

function filterPreviewRows(rows: PreviewCustomerRow[], input: {
  search: string;
  ltvMin: string;
  ltvMax: string;
  scoreMin: string;
  linkState: 'all' | 'linked' | 'unlinked';
  sort: PreviewSort;
}) {
  const q = input.search.trim().toLowerCase();
  const min = input.ltvMin === '' ? null : Number(input.ltvMin);
  const max = input.ltvMax === '' ? null : Number(input.ltvMax);
  const scoreMin = input.scoreMin === '' ? null : Number(input.scoreMin);
  const filtered = rows.filter((row) => {
    if (input.linkState !== 'all' && row.linkState !== input.linkState) return false;
    if (min !== null && row.revenue < min) return false;
    if (max !== null && row.revenue > max) return false;
    if (scoreMin !== null && (row.score ?? 0) < scoreMin) return false;
    if (!q) return true;
    const haystack = [
      row.name,
      row.email ?? '',
      row.phone ?? '',
      row.shopifyCustomerId ?? '',
      row.tags.join(' '),
      row.signals.join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
  return [...filtered].sort((a, b) => {
    if (input.sort === 'orders_desc') return b.orders - a.orders || b.revenue - a.revenue || a.name.localeCompare(b.name);
    if (input.sort === 'score_desc') return (b.score ?? -1) - (a.score ?? -1) || b.revenue - a.revenue || a.name.localeCompare(b.name);
    if (input.sort === 'name_asc') return a.name.localeCompare(b.name);
    return b.revenue - a.revenue || b.orders - a.orders || a.name.localeCompare(b.name);
  });
}

function ownerSummary(ownerships: SegmentOwner[]) {
  if (ownerships.length === 0) return 'Unassigned';
  const names = ownerships.map((owner) => owner.memberName ?? owner.memberEmail ?? owner.memberId);
  return `Owner: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function draftFromSegment(segment: SegmentRow): SegmentDraft {
  return {
    id: segment.id,
    name: segment.name,
    description: segment.description ?? '',
    color: segment.color,
    matchMode: segment.matchMode,
    priority: segment.priority,
    audienceType: normalizeAudienceType(segment.audienceType),
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
  return { id: crypto.randomUUID(), field: 'shopifyCustomerSegmentIds', operator: 'in', value: '', timeframeDays: '', scopeType: 'all', scopeValues: '' };
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
  if (field === 'shopifyCustomerSegmentIds') return ['in', 'notIn'];
  if (field === 'shopifyCustomerTags' || field === 'companyUserRole') return ['contains', 'in', 'notIn', 'eq', 'neq'];
  return OPERATORS;
}

function defaultValueFor(field: SegmentField) {
  if (BOOLEAN_FIELDS.has(field)) return 'true';
  return '';
}

function normalizeAudienceType(value: string): SegmentDraft['audienceType'] {
  if (value === 'shopify_customer') return 'shopify_customer';
  if (value === 'workforce_pool' || value === 'customer_user') return 'workforce_pool';
  return 'accountscompany';
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
