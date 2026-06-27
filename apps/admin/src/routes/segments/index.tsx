import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, RefreshCw, Search, Layers, CheckCircle2, Target, GitBranch, Edit2, Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { SegmentModal } from '@/components/SegmentModal';
import {
  fetchSegments, assignOwnership, SELLERUSERS,
  type SegmentDetail, type SegmentImportance,
} from '@/lib/mock';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function importanceClass(imp: SegmentImportance) {
  if (imp === 'critical') return 'importance critical';
  if (imp === 'high') return 'importance high';
  if (imp === 'low') return 'importance low';
  return 'importance';
}

function SegmentsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Ownership form state (per detail panel)
  const [ownerSelleruserId, setOwnerSelleruserId] = useState('');
  const [ownerImportance, setOwnerImportance] = useState<SegmentImportance>('normal');
  const [ownerPriority, setOwnerPriority] = useState(0);
  const [ownerDailyCap, setOwnerDailyCap] = useState<string>('');

  const { data: segments = [] } = useQuery({
    queryKey: ['segments'],
    queryFn: fetchSegments,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter((seg) => seg.name.toLowerCase().includes(q) || seg.description.toLowerCase().includes(q));
  }, [segments, search]);

  const current: SegmentDetail | null = useMemo(() => {
    const idToFind = selectedId ?? filtered[0]?.id ?? null;
    return segments.find((seg) => seg.id === idToFind) ?? null;
  }, [segments, filtered, selectedId]);

  const totals = useMemo(() => {
    const total = segments.length;
    const active = segments.filter((seg) => seg.active).length;
    const matched = segments.reduce((acc, seg) => acc + seg.matchedCompanies, 0);
    const avg = total ? Math.round(matched / total) : 0;
    return { total, active, matched, avg };
  }, [segments]);

  const assignMut = useMutation({
    mutationFn: (input: Parameters<typeof assignOwnership>[0]) => assignOwnership(input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['segments'] });
      const who = SELLERUSERS.find((u) => u.id === vars.selleruserId);
      toast.success('Owner assigned', {
        description: `${who?.name ?? 'Selleruser'} now owns this segment (${vars.importance}).`,
      });
      setOwnerSelleruserId('');
      setOwnerPriority(0);
      setOwnerDailyCap('');
      setOwnerImportance('normal');
    },
    onError: (error) => toast.error('Assign failed', { description: (error as Error).message }),
  });

  const handleAssign = () => {
    if (!current || !ownerSelleruserId) return;
    assignMut.mutate({
      segmentId: current.id,
      selleruserId: ownerSelleruserId,
      importance: ownerImportance,
      priority: ownerPriority,
      dailyCap: ownerDailyCap ? Number(ownerDailyCap) : null,
    });
  };

  return (
    <>
      <PageHeader
        titleI18nKey="segments.title"
        subtitleI18nKey="segments.subtitle"
        actions={
          <>
            <button id="btn-evaluate-all" type="button" className="btn">
              <Target size={14} /> {t('segments.evaluate_all')}
            </button>
            <button id="btn-new-segment" type="button" className="save-btn" onClick={() => setModalOpen(true)}>
              <Plus size={14} /> {t('segments.new_segment')}
            </button>
          </>
        }
      />

      {/* KPI strip with icon badges (mirrors live admin) */}
      <div className="kpis four">
        <div className="kpi" id="kpi-segments-total">
          <div className="kpi-icon blue"><Layers size={16} /></div>
          <div className="val">{totals.total}</div>
          <div className="sub" data-i18n-key="segments.kpi.total">{t('segments.kpi.total')}</div>
        </div>
        <div className="kpi" id="kpi-segments-active">
          <div className="kpi-icon green"><CheckCircle2 size={16} /></div>
          <div className="val">{totals.active}</div>
          <div className="sub" data-i18n-key="segments.kpi.active">{t('segments.kpi.active')}</div>
        </div>
        <div className="kpi" id="kpi-segments-matched">
          <div className="kpi-icon amber"><Target size={16} /></div>
          <div className="val">{totals.matched}</div>
          <div className="sub" data-i18n-key="segments.kpi.matched_companies">{t('segments.kpi.matched_companies')}</div>
        </div>
        <div className="kpi" id="kpi-segments-avg">
          <div className="kpi-icon purple"><GitBranch size={16} /></div>
          <div className="val">{totals.avg}</div>
          <div className="sub" data-i18n-key="segments.kpi.avg_per_segment">{t('segments.kpi.avg_per_segment')}</div>
        </div>
      </div>

      {/* Two-column: list (left) + detail (right) */}
      <div className="seg-split">
        <aside className="seg-packages" id="seg-packages">
          <div className="seg-packages-head">
            <div>
              <h3 data-i18n-key="segments.packages_title">{t('segments.packages_title')}</h3>
              <div className="sub" data-i18n-key="segments.packages_subtitle">{t('segments.packages_subtitle')}</div>
            </div>
            <button id="btn-refresh-segments" type="button" className="refresh" title="Refresh"
              onClick={() => qc.invalidateQueries({ queryKey: ['segments'] })}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="seg-search">
            <Search size={14} className="icon" />
            <input
              id="seg-search-input"
              data-i18n-key="segments.search_segments"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('segments.search_segments')}
            />
          </div>

          <div className="seg-list">
            {filtered.length === 0 ? (
              <div className="rules-empty">{t('common.empty')}</div>
            ) : filtered.map((seg) => (
              <button
                key={seg.id}
                id={`seg-card-${seg.id}`}
                type="button"
                className={`seg-card${current?.id === seg.id ? ' active' : ''}`}
                onClick={() => setSelectedId(seg.id)}
              >
                <div className="head">
                  <div className="name">
                    <span className="dot" style={{ background: seg.color }} />
                    <span>{seg.name}</span>
                  </div>
                  <span className={`pill ${seg.active ? 'success' : ''} dot`}>
                    {seg.active ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <div className="desc">{seg.description}</div>
                <div className="chips">
                  <span className="pill accent" data-i18n-key={seg.matchMode === 'all' ? 'segments.card_pill.all_conditions' : 'segments.card_pill.any_conditions'}>
                    {seg.matchMode === 'all' ? t('segments.card_pill.all_conditions') : t('segments.card_pill.any_conditions')}
                  </span>
                  <span className="pill">P{seg.priority}</span>
                  <span className="pill">{t('segments.card_pill.rules', { count: seg.rules.length })}</span>
                  <span className="pill warn">{t('segments.card_pill.companies', { count: seg.matchedCompanies })}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="seg-detail" id="seg-detail">
          {!current ? (
            <div className="stub">
              <h3>{t('common.empty')}</h3>
              <p>{t('segments.packages_subtitle')}</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="seg-detail-head">
                <div style={{ minWidth: 0 }}>
                  <div className="title-row">
                    <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: current.color, display: 'inline-block' }} />
                    <h2>{current.name}</h2>
                  </div>
                  <div className="desc">{current.description}</div>
                  <div className="meta">
                    <span className="pill accent" data-i18n-key={current.matchMode === 'all' ? 'segments.card_pill.all_conditions' : 'segments.card_pill.any_conditions'}>
                      {current.matchMode === 'all' ? t('segments.card_pill.all_conditions') : t('segments.card_pill.any_conditions')}
                    </span>
                    <span className="pill">Priority {current.priority}</span>
                    {current.active
                      ? <span className="pill success dot">{t('common.active')}</span>
                      : <span className="pill warn dot">{t('common.inactive')}</span>}
                    <span data-i18n-key="segments.detail.last_evaluated">
                      {t('segments.detail.last_evaluated')} {current.lastEvaluatedAt}
                    </span>
                  </div>
                </div>
                <div className="actions">
                  <button id={`btn-evaluate-${current.id}`} type="button" className="btn">
                    <Target size={13} /> {t('segments.detail.evaluate')}
                  </button>
                  <button id={`btn-edit-${current.id}`} type="button" className="btn" onClick={() => setModalOpen(true)}>
                    <Edit2 size={13} /> {t('segments.detail.edit')}
                  </button>
                  <button id={`btn-delete-${current.id}`} type="button" className="btn danger-outline">
                    <Trash2 size={13} /> {t('segments.detail.delete')}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="seg-stat-grid">
                <div className="seg-stat" id="stat-matched">
                  <div className="label" data-i18n-key="segments.detail.matched_companies">{t('segments.detail.matched_companies')}</div>
                  <div className="val">{current.matchedCompanies}</div>
                  <div className="sub">{t('segments.detail.company_pool', { count: current.companyPool })}</div>
                </div>
                <div className="seg-stat" id="stat-shopify">
                  <div className="label" data-i18n-key="segments.detail.shopify_customers">{t('segments.detail.shopify_customers')}</div>
                  <div className="val">{current.shopifyCustomers}</div>
                  <div className="sub">{t('segments.detail.linked_companies', { count: current.matchedCompanies })}</div>
                </div>
                <div className="seg-stat" id="stat-unlinked">
                  <div className="label" data-i18n-key="segments.detail.unlinked_shopify">{t('segments.detail.unlinked_shopify')}</div>
                  <div className="val">{current.unlinkedShopifyCustomers}</div>
                  <div className="sub" data-i18n-key="segments.detail.unlinked_note">{t('segments.detail.unlinked_note')}</div>
                </div>
                <div className="seg-stat" id="stat-revenue">
                  <div className="label" data-i18n-key="segments.detail.total_revenue">{t('segments.detail.total_revenue')}</div>
                  <div className="val">{formatMoney(current.totalRevenue)}</div>
                  <div className="sub" data-i18n-key="segments.detail.from_matched">{t('segments.detail.from_matched')}</div>
                </div>
              </div>

              {/* Ownership */}
              <section className="ownership-card" id="seg-ownership">
                <div className="head">
                  <h3>
                    <span data-i18n-key="segments.ownership.title">{t('segments.ownership.title')}</span>
                  </h3>
                  <span className="count">
                    {t(current.owners.length === 1 ? 'segments.ownership.owners_count' : 'segments.ownership.owners_count_plural', { count: current.owners.length })}
                  </span>
                </div>
                <div className="sub" data-i18n-key="segments.ownership.subtitle">{t('segments.ownership.subtitle')}</div>

                <div className="ownership-form" id="ownership-form">
                  <select
                    id="ownership-selleruser"
                    data-i18n-key="segments.ownership.select_placeholder"
                    value={ownerSelleruserId}
                    onChange={(event) => setOwnerSelleruserId(event.target.value)}
                  >
                    <option value="">{t('segments.ownership.select_placeholder')}</option>
                    {SELLERUSERS.map((su) => (
                      <option key={su.id} value={su.id}>{su.name} · {su.email}</option>
                    ))}
                  </select>
                  <select
                    id="ownership-importance"
                    value={ownerImportance}
                    onChange={(event) => setOwnerImportance(event.target.value as SegmentImportance)}
                  >
                    <option value="critical" data-i18n-key="segments.ownership.importance_critical">{t('segments.ownership.importance_critical')}</option>
                    <option value="high" data-i18n-key="segments.ownership.importance_high">{t('segments.ownership.importance_high')}</option>
                    <option value="normal" data-i18n-key="segments.ownership.importance_normal">{t('segments.ownership.importance_normal')}</option>
                    <option value="low" data-i18n-key="segments.ownership.importance_low">{t('segments.ownership.importance_low')}</option>
                  </select>
                  <input
                    id="ownership-priority"
                    type="number"
                    value={ownerPriority}
                    min={0}
                    max={99}
                    onChange={(event) => setOwnerPriority(Number(event.target.value))}
                    placeholder={t('segments.ownership.priority_placeholder')}
                  />
                  <input
                    id="ownership-daily-cap"
                    type="number"
                    min={0}
                    value={ownerDailyCap}
                    onChange={(event) => setOwnerDailyCap(event.target.value)}
                    placeholder={t('segments.ownership.daily_cap_placeholder')}
                  />
                  <button
                    id="btn-assign-owner"
                    type="button"
                    className="assign-btn"
                    disabled={!ownerSelleruserId || assignMut.isPending}
                    onClick={handleAssign}
                  >
                    {assignMut.isPending ? t('common.loading') : t('segments.ownership.assign')}
                  </button>
                </div>

                {current.owners.length === 0 ? (
                  <div className="owner-row-empty" data-i18n-key="segments.ownership.no_owner_note">
                    {t('segments.ownership.no_owner_note')}
                  </div>
                ) : (
                  <div className="row-stack">
                    {current.owners.map((owner) => (
                      <div key={owner.id} className="owner-row" id={`owner-${owner.id}`}>
                        <span className="avatar" />
                        <span className="email">{owner.selleruserEmail}</span>
                        <div className="chips">
                          <span className="pill">Priority {owner.priority}</span>
                          <span className="pill" data-i18n-key={owner.dailyCap === null ? 'segments.ownership.row_no_daily_cap' : 'segments.ownership.row_daily_cap'}>
                            {owner.dailyCap === null ? t('segments.ownership.row_no_daily_cap') : t('segments.ownership.row_daily_cap', { count: owner.dailyCap })}
                          </span>
                          <span className="pill warn" data-i18n-key="segments.ownership.row_invalidates">
                            {t('segments.ownership.row_invalidates')}
                          </span>
                        </div>
                        <span className={importanceClass(owner.importance)} data-i18n-key={`segments.ownership.importance_${owner.importance}`}>
                          {t(`segments.ownership.importance_${owner.importance}`)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Shopify signal note */}
              {current.unlinkedShopifyCustomers > 0 && (
                <div id="shopify-signal-note">
                  <div className="shopify-signal-pill" data-i18n-key="segments.shopify_signal_pill">
                    {t('segments.shopify_signal_pill')}
                  </div>
                  <div className="shopify-signal-note" data-i18n-key="segments.shopify_signal_note">
                    {t('segments.shopify_signal_note', { count: current.shopifyCustomers, unlinked: current.unlinkedShopifyCustomers })}
                  </div>
                </div>
              )}

              {/* Shopify Customer Signal */}
              {current.shopifySignal.length > 0 && (
                <section className="customer-signal" id="customer-signal">
                  <div className="customer-signal-head">
                    <div>
                      <h3 data-i18n-key="segments.customer_signal_title">{t('segments.customer_signal_title')}</h3>
                      <div className="sub" data-i18n-key="segments.customer_signal_subtitle">{t('segments.customer_signal_subtitle')}</div>
                    </div>
                    <div className="right">
                      <span>{t('segments.records', { count: current.shopifySignal.length })}</span>
                      <a data-i18n-key="segments.view_all">{t('segments.view_all')}</a>
                    </div>
                  </div>
                  <div className="signal-cards">
                    {current.shopifySignal.slice(0, 8).map((customer) => (
                      <div key={customer.id} className="signal-card" id={`signal-${customer.id}`}>
                        <div className="name">{customer.name}</div>
                        <div className="meta">
                          <span>{customer.email}</span>
                          <span>·</span>
                          <span>{customer.ordersCount} orders</span>
                          <span>·</span>
                          <span>{formatMoney(customer.totalSpent)}</span>
                        </div>
                        {!customer.linkedCompanyId && (
                          <span className="badge-unlinked" data-i18n-key="segments.no_linked_companies">
                            {t('segments.no_linked_companies')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <SegmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

export const Route = createFileRoute('/segments/')({ component: SegmentsView });
