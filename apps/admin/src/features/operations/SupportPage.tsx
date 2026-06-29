import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, LifeBuoy, MessageSquare, Plus, RefreshCw, Save, Search, ShieldAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ServiceRequestPriority, ServiceRequestStatus, ServiceRequestSurface, TaskAxis } from '@factory-engine-pro/contracts';
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

interface SupportCustomer {
  id: string;
  companyName: string;
  email: string | null;
}

interface MemberRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
}

interface SupportComment {
  id: string;
  body: string;
  internal: boolean;
  actorType: string | null;
  createdAt: string;
}

interface TaskParticipant {
  id: string;
  memberId: string;
  role: string;
  source: string;
  createdAt: string;
  member: { id: string; name: string; email: string } | null;
}

interface SupportRow {
  id: string;
  ticketNumber: string;
  number: string;
  title: string;
  description: string | null;
  category: string;
  source: string;
  surface: ServiceRequestSurface;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  axis: TaskAxis | null;
  matchedRuleId: string | null;
  conditionTrace: unknown[];
  participants: TaskParticipant[];
  watchers: TaskParticipant[];
  customer: { id: string; companyName: string; email: string | null } | null;
  companyUser: { id: string; email: string; firstName: string; lastName: string } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  comments: SupportComment[];
  sla: { firstResponseBreached: boolean; resolutionBreached: boolean; resolutionTargetAt: string; tone: string };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

interface SupportListResponse {
  items: SupportRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

interface SupportStats {
  total: number;
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  closed: number;
  urgent: number;
}

interface SupportDraft {
  title: string;
  description: string;
  surface: ServiceRequestSurface;
  priority: ServiceRequestPriority;
  source: 'manual' | 'call' | 'email' | 'form';
  category: string;
  customerId: string;
  assignedMemberId: string;
}

type SurfaceFilter = 'all' | ServiceRequestSurface;
type SourceFilter = 'all' | 'ai_transcript' | 'workflow' | 'call' | 'manual' | 'email' | 'form';

const PRIORITIES: ServiceRequestPriority[] = ['critical', 'urgent', 'high', 'medium', 'low'];
const STATUSES: ServiceRequestStatus[] = ['open', 'in_progress', 'waiting', 'waiting_on_customer', 'pending_resolve', 'resolved', 'closed', 'reopened'];
const SOURCE_FILTERS: SourceFilter[] = ['all', 'ai_transcript', 'workflow', 'call', 'manual', 'email', 'form'];
const QK = ['operations', 'support'] as const;

function initialCaseId() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('caseId')?.trim() ?? '';
}

export function SupportPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('support.write');
  const caseId = initialCaseId();
  const [surface, setSurface] = useState<SurfaceFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [search, setSearch] = useState(caseId);
  const [selectedId, setSelectedId] = useState<string | null>(caseId || null);
  const [creating, setCreating] = useState(false);
  const [comment, setComment] = useState('');
  const [internalComment, setInternalComment] = useState(false);
  const [status, setStatus] = useState<ServiceRequestStatus>('open');
  const [assignee, setAssignee] = useState('');
  const queryString = useMemo(() => supportQuery(surface, sourceFilter, search), [surface, sourceFilter, search]);

  const support = useQuery({ queryKey: [...QK, queryString], queryFn: () => fetchSupport(queryString) });
  const stats = useQuery({ queryKey: [...QK, 'stats', surface, sourceFilter], queryFn: () => fetchStats(surface, sourceFilter) });
  const detail = useQuery({
    queryKey: [...QK, 'detail', selectedId],
    queryFn: () => adminApi.supportRequest(selectedId!) as Promise<SupportRow>,
    enabled: Boolean(selectedId),
  });
  const members = useQuery({ queryKey: ['identity', 'members', 'support'], queryFn: fetchMembers, retry: false });

  const rows = support.data?.items ?? [];
  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const selected = detail.data ?? rows.find((row) => row.id === selectedId) ?? null;
  useEffect(() => {
    if (selected) {
      setStatus(selected.status);
      setAssignee(selected.assignedTo?.id ?? '');
      setComment('');
      setInternalComment(false);
    }
  }, [selected?.id, selected?.status, selected?.assignedTo?.id]);

  const changeStatus = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a service request first');
      return adminApi.changeSupportStatus(selected.id, { status });
    },
    onSuccess: () => {
      toast.success(t('support.status_saved'));
      invalidateSupport(qc);
    },
    onError: (error) => toast.error(t('support.status_failed'), { description: apiErrorMessage(error) }),
  });

  const assign = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a service request first');
      return adminApi.assignSupportRequest(selected.id, { assignedMemberId: assignee || null, reason: 'admin panel assignment' });
    },
    onSuccess: () => {
      toast.success(t('support.assignee_saved'));
      invalidateSupport(qc);
    },
    onError: (error) => toast.error(t('support.assignee_failed'), { description: apiErrorMessage(error) }),
  });

  const addComment = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a service request first');
      return adminApi.addSupportComment(selected.id, { body: comment, internal: internalComment });
    },
    onSuccess: () => {
      toast.success(t('support.comment_saved'));
      setComment('');
      invalidateSupport(qc);
    },
    onError: (error) => toast.error(t('support.comment_failed'), { description: apiErrorMessage(error) }),
  });

  const close = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a service request first');
      return adminApi.closeSupportRequest(selected.id, { resolutionCode: 'admin_closed', resolutionNote: comment || undefined });
    },
    onSuccess: () => {
      toast.success(t('support.closed'));
      setComment('');
      invalidateSupport(qc);
    },
    onError: (error) => toast.error(t('support.close_failed'), { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <PageHeader
        titleI18nKey="support.title"
        subtitleI18nKey="support.subtitle"
        actions={(
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => { support.refetch(); stats.refetch(); if (selectedId) detail.refetch(); }}>
              <RefreshCw size={14} /> {t('common.refresh')}
            </button>
            {canWrite && (
              <button id="btn-support-create" type="button" className="btn primary" onClick={() => setCreating(true)}>
                <Plus size={14} /> {t('support.create')}
              </button>
            )}
          </div>
        )}
      />

      <div className="sr-kpi-row">
        <Kpi tone="" label={t('support.kpi.open')} value={stats.data?.open ?? null} icon={<LifeBuoy size={15} />} />
        <Kpi tone="warn" label={t('support.kpi.in_progress')} value={stats.data?.inProgress ?? null} icon={<RefreshCw size={15} />} />
        <Kpi tone="danger" label={t('support.kpi.urgent')} value={stats.data?.urgent ?? null} icon={<ShieldAlert size={15} />} />
        <Kpi tone="success" label={t('support.kpi.resolved')} value={(stats.data?.resolved ?? 0) + (stats.data?.closed ?? 0)} icon={<CheckCircle2 size={15} />} />
      </div>

      <div className="orders-toolbar">
        <button type="button" className={`btn ${surface === 'all' ? 'primary' : ''}`} onClick={() => setSurface('all')}>{t('support.tabs.all')}</button>
        <button type="button" className={`btn ${surface === 'internal' ? 'primary' : ''}`} onClick={() => setSurface('internal')}>{t('support.tabs.internal')}</button>
        <button type="button" className={`btn ${surface === 'customer_facing' ? 'primary' : ''}`} onClick={() => setSurface('customer_facing')}>{t('support.tabs.customer_facing')}</button>
        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {SOURCE_FILTERS.map((source) => (
            <button
              key={source}
              type="button"
              className={`btn ${sourceFilter === source ? 'primary' : ''}`}
              onClick={() => setSourceFilter(source)}
            >
              {source === 'all' ? t('support.sources.all') : label(source)}
            </button>
          ))}
        </div>
        <div className="orders-search" style={{ flex: 1, minWidth: 240 }}>
          <Search size={14} />
          <input id="support-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('support.search_placeholder')} />
        </div>
      </div>

      {support.isLoading && <StateBlock title={t('common.loading')} body={t('support.loading_body')} />}
      {support.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(support.error)} action={<button type="button" className="btn" onClick={() => support.refetch()}>{t('common.retry')}</button>} />}
      {support.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('support.empty_title')}
          body={t('support.empty_state')}
          action={canWrite ? <button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus size={14} /> {t('support.create')}</button> : undefined}
        />
      )}
      {support.isSuccess && rows.length > 0 && (
        <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(360px, .7fr)' }}>
          <div className="data-card">
            <table className="data-table" id="support-table">
              <thead>
                <tr>
                  <th>{t('support.col_number')}</th>
                  <th>{t('support.col_title')}</th>
                  <th>{t('support.col_customer')}</th>
                  <th>{t('support.col_status')}</th>
                  <th>{t('support.col_priority')}</th>
                  <th>{t('support.col_assignee')}</th>
                  <th>{t('support.col_last_activity')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} id={`support-row-${row.id}`} onClick={() => setSelectedId(row.id)} style={{ cursor: 'pointer' }}>
                    <td><span className="pill accent" style={{ fontFamily: 'monospace' }}>{row.ticketNumber}</span></td>
                    <td><div className="name">{row.title}</div><div className="muted">{label(row.category)} / {label(row.source)} / {row.axis ? label(row.axis) : t('support.no_axis')}</div></td>
                    <td>{row.customer?.companyName ?? <span className="muted">{t('support.no_customer')}</span>}</td>
                    <td><span className={`sr-status-pill ${statusClass(row.status)}`}>{label(row.status)}</span></td>
                    <td><span className={`pill ${priorityTone(row.priority)}`}>{label(row.priority)}</span></td>
                    <td>{row.assignedTo?.name ?? <span className="muted">{t('support.no_assignee')}</span>}</td>
                    <td className="muted">{fmtDate(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="section" id="support-detail">
            {!selected && <StateBlock title={t('support.no_selection_title')} body={t('support.no_selection_body')} />}
            {selected && (
              <>
                <h3>
                  <span>{selected.ticketNumber}</span>
                  <span className={`pill ${priorityTone(selected.priority)}`}>{label(selected.priority)}</span>
                </h3>
                <div className="name" style={{ fontSize: 16 }}>{selected.title}</div>
                <p className="muted" style={{ lineHeight: 1.5 }}>{selected.description || t('support.no_description')}</p>
                <div className="row-stack">
                  <DetailLine label={t('support.detail_customer')} value={selected.customer?.companyName ?? t('support.no_customer')} />
                  <DetailLine label={t('support.detail_surface')} value={label(selected.surface)} />
                  <DetailLine label={t('support.detail_axis')} value={selected.axis ? label(selected.axis) : t('support.no_axis')} />
                  <DetailLine label={t('support.detail_matched_rule')} value={selected.matchedRuleId ?? t('support.no_matched_rule')} />
                  <DetailLine label={t('support.detail_condition_trace')} value={t('support.condition_trace_count', { count: selected.conditionTrace?.length ?? 0 })} />
                  <DetailLine label={t('support.detail_watchers')} value={watcherNames(selected.watchers, t('support.no_watchers'))} />
                  <DetailLine label={t('support.detail_created')} value={fmtDate(selected.createdAt)} />
                  <DetailLine label={t('support.detail_sla')} value={selected.sla?.resolutionBreached ? t('support.sla_breached') : fmtDate(selected.sla?.resolutionTargetAt)} danger={selected.sla?.resolutionBreached} />
                </div>
                <TraceList rows={selected.conditionTrace} emptyLabel={t('support.no_condition_trace')} />

                {canWrite && (
                  <div className="modal-section" style={{ marginTop: 14 }}>
                    <h3>{t('support.detail_actions')}</h3>
                    <div className="field">
                      <label>{t('support.field_status')}</label>
                      <select value={status} onChange={(event) => setStatus(event.target.value as ServiceRequestStatus)}>
                        {STATUSES.map((entry) => <option key={entry} value={entry}>{label(entry)}</option>)}
                      </select>
                    </div>
                    <button type="button" className="btn" disabled={status === selected.status || changeStatus.isPending} onClick={() => changeStatus.mutate()}>
                      <Save size={13} /> {t('support.save_status')}
                    </button>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>{t('support.field_assignee')}</label>
                      <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                        <option value="">{t('support.no_assignee')}</option>
                        {(members.data ?? []).filter((member) => member.status === 'active').map((member) => (
                          <option key={member.id} value={member.id}>{member.firstName} {member.lastName} ({member.email})</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn" disabled={(assignee || '') === (selected.assignedTo?.id ?? '') || assign.isPending} onClick={() => assign.mutate()}>
                      <Save size={13} /> {t('support.save_assignee')}
                    </button>
                  </div>
                )}

                <div className="modal-section" style={{ marginTop: 14 }}>
                  <h3>{t('support.comments')}</h3>
                  <div className="timeline">
                    {selected.comments.length === 0 && <div className="muted">{t('support.no_comments')}</div>}
                    {selected.comments.map((entry) => (
                      <div key={entry.id} className={`timeline-row ${entry.internal ? 'status_changed' : 'reply_staff'}`}>
                        <span className="marker" />
                        <div className="body">
                          <div className="head"><span className="actor">{entry.actorType ?? 'member'}</span><span>{fmtDate(entry.createdAt)}</span></div>
                          <p>{entry.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {canWrite && (
                    <form style={{ marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); addComment.mutate(); }}>
                      <div className="field">
                        <label>{t('support.field_comment')}</label>
                        <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                        <input type="checkbox" checked={internalComment} onChange={(event) => setInternalComment(event.target.checked)} />
                        {t('support.internal_note')}
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="submit" className="btn" disabled={!comment.trim() || addComment.isPending}><MessageSquare size={13} /> {t('support.add_comment')}</button>
                        <button type="button" className="btn danger-outline" disabled={close.isPending || selected.status === 'closed'} onClick={() => close.mutate()}><CheckCircle2 size={13} /> {t('support.close_request')}</button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {creating && <SupportCreateDialog onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />}
    </>
  );
}

function SupportCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: [...QK, 'customers'], queryFn: () => adminApi.supportCustomers() as Promise<SupportCustomer[]> });
  const members = useQuery({ queryKey: ['identity', 'members', 'support-create'], queryFn: fetchMembers, retry: false });
  const [draft, setDraft] = useState<SupportDraft>({
    title: '',
    description: '',
    surface: 'internal',
    priority: 'medium',
    source: 'manual',
    category: 'other',
    customerId: '',
    assignedMemberId: '',
  });

  const create = useMutation({
    mutationFn: () => adminApi.createSupportRequest({
      title: draft.title,
      description: draft.description || undefined,
      surface: draft.surface,
      priority: draft.priority,
      source: draft.source,
      customerId: draft.customerId || undefined,
      assignedMemberId: draft.assignedMemberId || undefined,
      metadata: { category: draft.category },
    }) as Promise<SupportRow>,
    onSuccess: (row) => {
      toast.success(t('support.created'));
      invalidateSupport(qc);
      onCreated(row.id);
      onClose();
    },
    onError: (error) => toast.error(t('support.create_failed'), { description: apiErrorMessage(error) }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} labelledBy="support-create-title" describedBy="support-create-subtitle" cardClassName="modal-card sr-modal-card">
      <div className="modal-head">
        <div>
          <DialogTitle id="support-create-title" asChild><h2>{t('support.modal.create_title')}</h2></DialogTitle>
          <DialogDescription id="support-create-subtitle" className="sub">{t('support.modal.create_subtitle')}</DialogDescription>
        </div>
        <DialogClose className="close"><X size={16} /></DialogClose>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <div className="modal-body" style={{ gridTemplateColumns: '1fr' }}>
          <section className="modal-section">
            <div className="field">
              <label>{t('support.field_title')}</label>
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
            </div>
            <div className="field">
              <label>{t('support.field_description')}</label>
              <textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </div>
            <div className="field-row">
              <Select label={t('support.field_surface')} value={draft.surface} onChange={(surface) => setDraft({ ...draft, surface: surface as ServiceRequestSurface })} options={['internal', 'customer_facing']} />
              <Select label={t('support.field_priority')} value={draft.priority} onChange={(priority) => setDraft({ ...draft, priority: priority as ServiceRequestPriority })} options={PRIORITIES} />
            </div>
            <div className="field-row">
              <Select label={t('support.field_source')} value={draft.source} onChange={(source) => setDraft({ ...draft, source: source as SupportDraft['source'] })} options={['manual', 'call', 'email', 'form']} />
              <div className="field">
                <label>{t('support.field_category')}</label>
                <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('support.field_customer')}</label>
                <select value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}>
                  <option value="">{t('support.no_customer')}</option>
                  {(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} ({customer.email ?? 'no email'})</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('support.field_assignee')}</label>
                <select value={draft.assignedMemberId} onChange={(event) => setDraft({ ...draft, assignedMemberId: event.target.value })}>
                  <option value="">{t('support.no_assignee')}</option>
                  {(members.data ?? []).filter((member) => member.status === 'active').map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
                </select>
              </div>
            </div>
            {customers.isError && <div className="error-state">{apiErrorMessage(customers.error)}</div>}
          </section>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="save-btn" disabled={create.isPending || !draft.title.trim()}><Save size={13} /> {create.isPending ? t('common.loading') : t('common.create')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function fetchSupport(query: string) {
  return adminApi.supportRequests(query) as Promise<SupportListResponse>;
}

function fetchStats(surface: SurfaceFilter, sourceFilter: SourceFilter) {
  const params = new URLSearchParams();
  if (surface !== 'all') params.set('surface', surface);
  if (sourceFilter !== 'all') params.set('source', sourceFilter);
  return adminApi.supportStats(params.size ? `?${params.toString()}` : '') as Promise<SupportStats>;
}

function fetchMembers() {
  return adminApi.members() as Promise<MemberRow[]>;
}

function supportQuery(surface: SurfaceFilter, sourceFilter: SourceFilter, search: string) {
  const params = new URLSearchParams({ limit: '50', page: '1', surface });
  if (sourceFilter !== 'all') params.set('source', sourceFilter);
  if (search.trim()) params.set('q', search.trim());
  return `?${params.toString()}`;
}

function invalidateSupport(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QK });
}

function Kpi({ tone, label: kpiLabel, value, icon }: { tone: string; label: string; value: number | null; icon: ReactNode }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{kpiLabel}</div>
      <div className="val">{value ?? '...'}</div>
    </div>
  );
}

function Select({ label: selectLabel, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="field">
      <label>{selectLabel}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{label(option)}</option>)}
      </select>
    </div>
  );
}

function DetailLine({ label: lineLabel, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
      <span className="muted">{lineLabel}</span>
      <strong style={{ color: danger ? 'var(--danger)' : 'var(--text)', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

function TraceList({ rows, emptyLabel }: { rows: unknown[]; emptyLabel: string }) {
  if (!rows?.length) return <div className="support-trace-empty">{emptyLabel}</div>;
  return (
    <div className="support-trace-list" aria-label="Rule trace">
      {rows.map((row, index) => {
        const item = traceItem(row);
        return (
          <div key={`${item.name}-${index}`} className={`support-trace-row ${item.matched ? 'matched' : 'missed'}`}>
            <span className="support-trace-state">{item.matched ? 'Matched' : 'Missed'}</span>
            <div>
              <strong>{item.name}</strong>
              <p>{item.detail}</p>
            </div>
          </div>
        );
      })}
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

function priorityTone(priority: ServiceRequestPriority) {
  if (priority === 'critical' || priority === 'urgent') return 'danger';
  if (priority === 'high') return 'warn';
  if (priority === 'medium') return 'info';
  return '';
}

function statusClass(status: ServiceRequestStatus) {
  if (status === 'waiting_on_customer') return 'waiting_customer';
  return status;
}

function fmtDate(value?: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function watcherNames(watchers: TaskParticipant[] | undefined, empty: string) {
  if (!watchers?.length) return empty;
  return watchers.map((watcher) => watcher.member?.name || watcher.member?.email || watcher.memberId).join(', ');
}

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function traceItem(row: unknown): { name: string; matched: boolean; detail: string } {
  const record = isRecord(row) ? row : {};
  const name = String(record.condition ?? record.field ?? record.id ?? 'condition');
  const expected = stringOrEmpty(record.expected ?? record.value);
  const actual = stringOrEmpty(record.actual);
  const source = stringOrEmpty(record.source);
  const detail = [
    expected ? `expected ${expected}` : '',
    actual ? `actual ${actual}` : '',
    source ? `source ${source}` : '',
  ].filter(Boolean).join(' / ') || 'No trace payload';
  return { name: label(name), matched: record.matched === true, detail };
}

function stringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringOrEmpty).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
