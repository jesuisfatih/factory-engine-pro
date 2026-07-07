import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Activity, AlertTriangle, CircleHelp, Download, ExternalLink, Phone, RefreshCw, Search, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import type {
  CustomerAssignmentAxis,
  CustomerAxisAssignmentDto,
  CustomerAxisAssignmentAuditDto,
  CustomerAxisAssignmentsResponse,
} from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

interface CustomerRow {
  id: string;
  shopifyCustomerId: string | null;
  companyName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  tags: string[];
  totalSpent: number;
  ordersCount: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
  lifecycle: string;
  clvTier: string;
  healthScore: number | null;
  churnRisk: string;
  customerUserCount: number;
  listCount: number;
  taxExempt: boolean;
  updatedAt: string;
}

interface CustomerListResponse {
  data: CustomerRow[];
  meta: { count: number; limit: number };
}

interface CustomerStats {
  count: number;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  atRiskCount: number;
  vipCount: number;
  dormantCount: number;
  taxExemptCount: number;
}

interface MemberRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
}

const SEGMENTS = ['vip', 'loyal', 'active', 'dormant', 'new'];
const CHURN_RISKS = ['low', 'medium', 'high', 'critical', 'unknown'];
const SORTS = ['recent_order', 'total_spent', 'orders_count', 'health_score', 'name'] as const;
const ASSIGNMENT_AXES: CustomerAssignmentAxis[] = ['sales', 'support', 'account'];

export function CustomersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('customers.write');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [churnRisk, setChurnRisk] = useState('');
  const [tag, setTag] = useState('');
  const [taxExempt, setTaxExempt] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('recent_order');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownerCustomerId, setOwnerCustomerId] = useState('');
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(() => currentCustomerIdFromUrl());
  const query = useMemo(() => customerQuery({ search, segment, churnRisk, tag, taxExempt, sort }), [search, segment, churnRisk, tag, taxExempt, sort]);
  const customers = useQuery({ queryKey: ['commerce', 'customers', query], queryFn: () => fetchCustomers(query) });
  const stats = useQuery({ queryKey: ['commerce', 'customers', 'stats'], queryFn: () => fetchCustomerStats() });
  const detail = useQuery({
    queryKey: ['commerce', 'customers', detailCustomerId, 'detail'],
    queryFn: () => fetchCustomerDetail(detailCustomerId ?? ''),
    enabled: Boolean(detailCustomerId),
  });
  const rows = customers.data?.data ?? [];
  const tagOptions = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(), [rows]);
  const ownerCustomer = rows.find((row) => row.id === ownerCustomerId) ?? null;
  const assignments = useQuery({
    queryKey: ['commerce', 'customers', ownerCustomerId, 'assignments'],
    queryFn: () => fetchCustomerAssignments(ownerCustomerId),
    enabled: Boolean(ownerCustomerId),
  });
  const members = useQuery({
    queryKey: ['identity', 'members', 'customer-assignments'],
    queryFn: fetchMembers,
    enabled: canWrite,
  });

  useEffect(() => {
    const syncFromUrl = () => setDetailCustomerId(currentCustomerIdFromUrl());
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    if (!customers.isSuccess) return;
    if (rows.length === 0) {
      if (ownerCustomerId) setOwnerCustomerId('');
      return;
    }
    if (!ownerCustomerId || !rows.some((row) => row.id === ownerCustomerId)) {
      setOwnerCustomerId(rows[0].id);
    }
  }, [customers.isSuccess, ownerCustomerId, rows]);

  const calculateInsights = useMutation({
    mutationFn: () => adminApi.recalculateCustomerInsights(),
    onSuccess: () => {
      toast.success(t('customers.insights_started'));
      qc.invalidateQueries({ queryKey: ['commerce', 'customers'] });
    },
    onError: (error) => toast.error(t('customers.insights_failed'), { description: apiErrorMessage(error) }),
  });

  const generateAlarms = useMutation({
    mutationFn: () => adminApi.generateCustomerAlarms(),
    onSuccess: () => {
      toast.success(t('customers.alarms_generated'));
      qc.invalidateQueries({ queryKey: ['commerce', 'customers'] });
    },
    onError: (error) => toast.error(t('customers.alarms_failed'), { description: apiErrorMessage(error) }),
  });

  const assignPrimary = useMutation({
    mutationFn: (input: { customerId: string; axis: CustomerAssignmentAxis; memberId: string }) => adminApi.assignCustomerAxisPrimary(input.customerId, input.axis, {
      memberId: input.memberId,
      source: 'admin_transfer',
      reason: 'Admin approved axis primary transfer from customer ownership panel',
    }),
    onSuccess: (data, input) => {
      toast.success(t('customers.assignment_saved'));
      qc.setQueryData(['commerce', 'customers', input.customerId, 'assignments'], data);
      qc.invalidateQueries({ queryKey: ['commerce', 'customers', input.customerId, 'assignments'] });
    },
    onError: (error) => toast.error(t('customers.assignment_failed'), { description: apiErrorMessage(error) }),
  });

  const clearFilters = () => {
    setSearch('');
    setSegment('');
    setChurnRisk('');
    setTag('');
    setTaxExempt('');
    setSort('recent_order');
  };
  const openCustomerDetail = (customerId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('customerId', customerId);
    window.history.pushState({}, '', url);
    setDetailCustomerId(customerId);
  };
  const closeCustomerDetail = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('customerId');
    window.history.pushState({}, '', url);
    setDetailCustomerId(null);
  };
  const hasFilters = Boolean(search || segment || churnRisk || tag || taxExempt || sort !== 'recent_order');
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <>
      <PageHeader
        titleI18nKey="customers.title"
        subtitleI18nKey="customers.subtitle"
        actions={(
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => downloadCsv(selectedRows.length ? selectedRows : rows)} disabled={rows.length === 0}>
              <Download size={14} /> {t('customers.bulk_export')}
            </button>
            {canWrite && (
              <>
                <button type="button" className="btn" onClick={() => calculateInsights.mutate()} disabled={calculateInsights.isPending}>
                  <Activity size={14} /> {t('customers.recalculate_insights')}
                </button>
                <button type="button" className="btn" onClick={() => generateAlarms.mutate()} disabled={generateAlarms.isPending}>
                  <AlertTriangle size={14} /> {t('customers.generate_alarms')}
                </button>
              </>
            )}
          </div>
        )}
      />

      <div className="kpis" style={{ marginBottom: 14 }}>
        <Kpi label={t('customers.kpi_count')} value={stats.data?.count ?? null} sub={t('customers.kpi_sub_count')} />
        <Kpi label={t('customers.kpi_revenue')} value={stats.data ? fmtMoney(stats.data.totalRevenue) : null} sub={t('customers.kpi_sub_revenue')} />
        <Kpi label={t('customers.kpi_orders')} value={stats.data?.totalOrders ?? null} sub={t('customers.kpi_sub_orders')} />
        <Kpi label={t('customers.kpi_at_risk')} value={stats.data?.atRiskCount ?? null} sub={t('customers.kpi_sub_at_risk')} />
        <Kpi label={t('customers.kpi_vip')} value={stats.data?.vipCount ?? null} sub={t('customers.kpi_sub_vip')} />
        <Kpi label="Tax exempt" value={stats.data?.taxExemptCount ?? null} sub="Shopify tax-exempt customers" />
      </div>

      <div className="customers-toolbar">
        <div className="orders-search" style={{ minWidth: 240, flex: 1 }}>
          <Search size={14} />
          <input
            id="customers-search"
            placeholder={t('customers.search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select value={segment} aria-label={t('customers.filter_segment')} onChange={(event) => setSegment(event.target.value)}>
          <option value="">{t('customers.filter_segment_all')}</option>
          {SEGMENTS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={churnRisk} aria-label={t('customers.filter_churn_risk')} onChange={(event) => setChurnRisk(event.target.value)}>
          <option value="">{t('customers.filter_churn_all')}</option>
          {CHURN_RISKS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <select value={tag} aria-label={t('customers.filter_tag')} onChange={(event) => setTag(event.target.value)}>
          <option value="">{t('customers.filter_tag_all')}</option>
          {tagOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={taxExempt} aria-label="Tax exempt filter" onChange={(event) => setTaxExempt(event.target.value)}>
          <option value="">All tax statuses</option>
          <option value="true">Tax exempt only</option>
          <option value="false">Not tax exempt</option>
        </select>
        <select value={sort} aria-label={t('customers.sort_label')} onChange={(event) => setSort(event.target.value as (typeof SORTS)[number])}>
          {SORTS.map((value) => <option key={value} value={value}>{t(`customers.sort_${value}`)}</option>)}
        </select>
        <button type="button" className="btn ghost" onClick={() => { customers.refetch(); stats.refetch(); }}>
          <RefreshCw size={14} /> {t('common.refresh')}
        </button>
        {hasFilters && (
          <button type="button" className="btn ghost" onClick={clearFilters}>
            <X size={13} /> {t('customers.clear_filters')}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="customers-bulk-bar">
          <span>{t('customers.selected_label', { count: selected.size })}</span>
          <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
            <X size={13} /> {t('customers.bulk_clear')}
          </button>
        </div>
      )}

      {customers.isSuccess && rows.length > 0 && (
        <CustomerOwnershipPanel
          rows={rows}
          selectedCustomerId={ownerCustomerId}
          selectedCustomer={ownerCustomer}
          onSelectCustomer={setOwnerCustomerId}
          assignments={assignments}
          members={members.data ?? []}
          membersLoading={members.isLoading}
          membersError={members.isError ? apiErrorMessage(members.error) : null}
          canWrite={canWrite}
          isSaving={assignPrimary.isPending}
          onAssign={(axis, memberId) => {
            if (!ownerCustomerId || !memberId) return;
            assignPrimary.mutate({ customerId: ownerCustomerId, axis, memberId });
          }}
        />
      )}

      {customers.isLoading && <StateBlock title={t('common.loading')} body={t('customers.loading_body')} />}
      {customers.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(customers.error)} action={<button type="button" className="btn" onClick={() => customers.refetch()}>{t('common.retry')}</button>} />}
      {customers.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('customers.empty_title')}
          body={t('customers.empty_state')}
          action={<button type="button" className="btn primary" onClick={() => customers.refetch()}><RefreshCw size={14} /> {t('common.refresh')}</button>}
        />
      )}
      {customers.isSuccess && rows.length > 0 && (
        <div className="data-card">
          <div className="data-table-wrap customers-table-wrap">
            <table className="data-table customers-table" id="table-customers">
            <thead>
              <tr>
                <th><input type="checkbox" checked={rows.every((row) => selected.has(row.id))} onChange={() => toggleAll(rows, selected, setSelected)} aria-label={t('customers.select_all')} /></th>
                <th>{t('customers.columns.customer')}</th>
                <th>{t('customers.columns.lifecycle')}</th>
                <th>{t('customers.columns.health')}</th>
                <th>{t('customers.columns.orders')}</th>
                <th>{t('customers.columns.revenue')}</th>
                <th>{t('customers.columns.last_order')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id} id={`row-customer-${customer.id}`} onDoubleClick={() => openCustomerDetail(customer.id)}>
                  <td><input type="checkbox" checked={selected.has(customer.id)} onChange={() => toggleOne(customer.id, setSelected)} aria-label={t('customers.select_customer')} /></td>
                  <td>
                    <div className="name">{customer.name ?? customer.companyName}</div>
                    <div className="muted">{customer.email ?? '—'}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {customer.taxExempt && <span className="chip success">Tax exempt</span>}
                      {customer.tags.slice(0, 4).map((entry) => <span key={entry} className="chip">{entry}</span>)}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${lifecycleTone(customer.lifecycle, customer.churnRisk)}`}>{label(customer.lifecycle)}</span>
                    <div className="muted" style={{ marginTop: 4 }}>{label(customer.clvTier)}</div>
                  </td>
                  <td>
                    <strong>{customer.healthScore ?? '—'}</strong>
                    <div className={`muted ${customer.churnRisk === 'high' || customer.churnRisk === 'critical' ? 'danger-text' : ''}`}>
                      {label(customer.churnRisk)}
                    </div>
                  </td>
                  <td>{customer.ordersCount}</td>
                  <td><strong>{fmtMoney(customer.totalSpent)}</strong></td>
                  <td className="muted">{fmtDate(customer.lastOrderAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" className="btn ghost" onClick={() => openCustomerDetail(customer.id)} title="Open customer detail">
                        <ExternalLink size={13} />
                      </button>
                      {customer.phone && (
                        <a className="btn ghost" href={`tel:${customer.phone.replace(/\s/g, '')}`} title={t('customers.call_customer')}>
                          <Phone size={13} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
      <CustomerDetailPanel
        open={Boolean(detailCustomerId)}
        detail={detail.data}
        isLoading={detail.isLoading}
        error={detail.error ? apiErrorMessage(detail.error) : null}
        onRetry={() => detail.refetch()}
        onClose={closeCustomerDetail}
      />
    </>
  );
}

function fetchCustomers(query: string) {
  return adminApi.commerceCustomers(query) as Promise<CustomerListResponse>;
}

function fetchCustomerStats() {
  return adminApi.commerceCustomerStats('?limit=100') as Promise<CustomerStats>;
}

function fetchCustomerAssignments(customerId: string) {
  return adminApi.customerAssignments(customerId);
}

function fetchCustomerDetail(customerId: string) {
  return adminApi.customerDetail(customerId);
}

function fetchMembers() {
  return adminApi.members() as Promise<MemberRow[]>;
}

function customerQuery(input: { search: string; segment: string; churnRisk: string; tag: string; taxExempt: string; sort: string }) {
  const params = new URLSearchParams({ limit: '100', sort: input.sort });
  if (input.search.trim()) params.set('search', input.search.trim());
  if (input.segment) params.set('segment', input.segment);
  if (input.churnRisk) params.set('churnRisk', input.churnRisk);
  if (input.tag) params.set('tag', input.tag);
  if (input.taxExempt) params.set('taxExempt', input.taxExempt);
  return `?${params.toString()}`;
}

function CustomerOwnershipPanel({
  rows,
  selectedCustomerId,
  selectedCustomer,
  onSelectCustomer,
  assignments,
  members,
  membersLoading,
  membersError,
  canWrite,
  isSaving,
  onAssign,
}: {
  rows: CustomerRow[];
  selectedCustomerId: string;
  selectedCustomer: CustomerRow | null;
  onSelectCustomer: (customerId: string) => void;
  assignments: UseQueryResult<CustomerAxisAssignmentsResponse, Error>;
  members: MemberRow[];
  membersLoading: boolean;
  membersError: string | null;
  canWrite: boolean;
  isSaving: boolean;
  onAssign: (axis: CustomerAssignmentAxis, memberId: string) => void;
}) {
  const { t } = useTranslation();
  const activeMembers = members.filter((member) => member.status === 'active');
  const assignmentRows = assignments.data?.assignments ?? [];
  const audits = assignments.data?.audits ?? [];
  const skippedAudit = audits.find((audit) => audit.action === 'auto_reassign_skipped');

  return (
    <div className="data-card" style={{ marginBottom: 14 }} id="customer-axis-ownership-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="customer-routing-copy">
          <div className="customer-routing-heading">
            <div className="name" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} /> {t('customers.assignment_title')}
            </div>
            <details className="customer-routing-help">
              <summary aria-label={t('customers.assignment_help_label')}>
                <CircleHelp size={15} />
              </summary>
              <div className="customer-routing-tooltip">
                {t('customers.assignment_help_body')}
              </div>
            </details>
          </div>
          <div className="muted">{t('customers.assignment_summary')}</div>
          <div className="muted">{selectedCustomer ? selectedCustomer.name ?? selectedCustomer.companyName : t('customers.assignment_select_customer')}</div>
        </div>
        <select value={selectedCustomerId} onChange={(event) => onSelectCustomer(event.target.value)} aria-label={t('customers.assignment_customer_label')} style={{ minWidth: 260 }}>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.name ?? row.companyName}</option>)}
        </select>
      </div>

      {assignments.isLoading && <StateBlock title={t('common.loading')} body={t('customers.assignment_loading')} />}
      {assignments.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(assignments.error)}
          action={<button type="button" className="btn" onClick={() => assignments.refetch()}>{t('common.retry')}</button>}
        />
      )}
      {assignments.isSuccess && (
        <>
          <div className="data-table-wrap">
            <table className="data-table" id="table-customer-axis-assignments">
              <thead>
                <tr>
                  <th>{t('customers.assignment_axis')}</th>
                  <th>{t('customers.assignment_primary')}</th>
                  <th>{t('customers.assignment_source')}</th>
                  <th>{t('customers.assignment_action')}</th>
                </tr>
              </thead>
              <tbody>
                {ASSIGNMENT_AXES.map((axis) => (
                  <AssignmentAxisRow
                    key={axis}
                    axis={axis}
                    assignment={assignmentRows.find((entry) => entry.axis === axis) ?? null}
                    members={activeMembers}
                    membersLoading={membersLoading}
                    membersError={membersError}
                    canWrite={canWrite}
                    isSaving={isSaving}
                    onAssign={onAssign}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {assignmentRows.length === 0 && (
            <div className="muted" style={{ marginTop: 10 }}>
              {canWrite ? t('customers.assignment_empty_cta') : t('customers.assignment_empty_readonly')}
            </div>
          )}
          <AssignmentAuditList audits={audits} skippedAudit={skippedAudit} />
        </>
      )}
    </div>
  );
}

function AssignmentAxisRow({
  axis,
  assignment,
  members,
  membersLoading,
  membersError,
  canWrite,
  isSaving,
  onAssign,
}: {
  axis: CustomerAssignmentAxis;
  assignment: CustomerAxisAssignmentDto | null;
  members: MemberRow[];
  membersLoading: boolean;
  membersError: string | null;
  canWrite: boolean;
  isSaving: boolean;
  onAssign: (axis: CustomerAssignmentAxis, memberId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr id={`row-customer-assignment-${axis}`}>
      <td>
        <span className="pill info">{label(axis)}</span>
      </td>
      <td>
        <div className="name">{assignment?.memberName ?? t('customers.assignment_unassigned')}</div>
        <div className="muted">{assignment?.memberEmail ?? t('customers.assignment_no_primary')}</div>
      </td>
      <td>
        <div>{assignment?.source ? label(assignment.source) : '-'}</div>
        <div className="muted">{assignment?.updatedAt ? fmtDate(assignment.updatedAt) : t('customers.assignment_not_set')}</div>
      </td>
      <td>
        {canWrite ? (
          <select
            value={assignment?.memberId ?? ''}
            disabled={isSaving || membersLoading || Boolean(membersError)}
            onChange={(event) => onAssign(axis, event.target.value)}
            aria-label={t('customers.assignment_select_member_axis', { axis })}
            style={{ minWidth: 220 }}
          >
            <option value="">{membersLoading ? t('common.loading') : t('customers.assignment_select_member')}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{memberName(member)}</option>)}
          </select>
        ) : (
          <span className="muted">{t('customers.assignment_readonly')}</span>
        )}
        {membersError && <div className="danger-text" style={{ marginTop: 4 }}>{membersError}</div>}
      </td>
    </tr>
  );
}

function AssignmentAuditList({ audits, skippedAudit }: { audits: CustomerAxisAssignmentAuditDto[]; skippedAudit?: CustomerAxisAssignmentAuditDto }) {
  const { t } = useTranslation();
  if (audits.length === 0) {
    return <div className="muted" style={{ marginTop: 10 }}>{t('customers.assignment_audit_empty')}</div>;
  }
  return (
    <div style={{ marginTop: 12 }}>
      {skippedAudit && (
        <div className="pill warn" style={{ marginBottom: 8 }}>
          <UserCheck size={13} /> {t('customers.assignment_reassign_skipped', {
            owner: skippedAudit.previousMemberName ?? skippedAudit.previousMemberId ?? 'primary',
            attempted: skippedAudit.newMemberName ?? skippedAudit.newMemberId ?? 'operator',
          })}
        </div>
      )}
      <div className="muted" style={{ marginBottom: 6 }}>{t('customers.assignment_audit_title')}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {audits.slice(0, 3).map((audit) => (
          <div key={audit.id} className="muted" id={`audit-${audit.id}`}>
            <strong>{label(audit.action)}</strong> - {label(audit.axis)} - {audit.newMemberName ?? audit.newMemberId ?? '-'} - {fmtDate(audit.createdAt)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number | null; sub: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="val">{value ?? '…'}</div>
      <div className="sub">{sub}</div>
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

function toggleOne(id: string, setSelected: (update: (current: Set<string>) => Set<string>) => void) {
  setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function toggleAll(rows: CustomerRow[], selected: Set<string>, setSelected: (update: (current: Set<string>) => Set<string>) => void) {
  setSelected((current) => {
    const next = new Set(current);
    const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
    rows.forEach((row) => {
      if (allSelected) next.delete(row.id);
      else next.add(row.id);
    });
    return next;
  });
}

function downloadCsv(rows: CustomerRow[]) {
  const header = ['Name', 'Email', 'Phone', 'Lifecycle', 'Churn risk', 'Orders', 'Total spent', 'Last order', 'Tags'];
  const lines = rows.map((row) => [
    row.name ?? row.companyName,
    row.email ?? '',
    row.phone ?? '',
    row.lifecycle,
    row.churnRisk,
    String(row.ordersCount),
    row.totalSpent.toFixed(2),
    row.lastOrderAt ?? '',
    row.tags.join('; '),
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function label(value: string) {
  return value.replace(/_/g, ' ');
}

function memberName(member: MemberRow) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
}

function lifecycleTone(lifecycle: string, churnRisk: string) {
  if (churnRisk === 'critical' || churnRisk === 'high') return 'danger';
  if (lifecycle === 'vip' || lifecycle === 'loyal') return 'success';
  if (lifecycle === 'dormant') return 'warn';
  return 'info';
}

function currentCustomerIdFromUrl() {
  return new URLSearchParams(window.location.search).get('customerId');
}
