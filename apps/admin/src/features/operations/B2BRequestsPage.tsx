import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileCheck2, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

type B2BStatus = 'pending' | 'approved' | 'rejected';

interface B2BFile {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

interface B2BRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  companyName: string;
  legalName: string;
  website: string | null;
  industry: string | null;
  estimatedMonthlyVolume: string | null;
  message: string | null;
  status: B2BStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  resolvedCustomerId: string | null;
  resolvedCustomerUserId: string | null;
  submittedAt: string;
  files: B2BFile[];
  metadata: Record<string, unknown>;
  decisionDelivery: DecisionDelivery | null;
}

interface DecisionDelivery {
  id: string;
  eventKey: string;
  status: string;
  recipientEmail: string;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
}

interface ApproveResult {
  success: true;
  customerId: string;
  customerUserId: string;
  invitation: {
    token: string;
    expiresAt: string;
    delivery: string;
    deliveryId: string;
  } | null;
  decisionDelivery: DecisionDelivery | null;
}

interface RejectResult {
  success: true;
  decisionDelivery: DecisionDelivery;
}

const QK = ['operations', 'b2b-access'] as const;

export function B2BRequestsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('b2b_access.write');
  const [status, setStatus] = useState<B2BStatus>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [lastDecision, setLastDecision] = useState<ApproveResult | RejectResult | null>(null);
  const requests = useQuery({ queryKey: [...QK, status], queryFn: () => adminApi.b2bAccessRequests(`?status=${status}`) as Promise<B2BRequest[]> });
  const detail = useQuery({
    queryKey: [...QK, 'detail', selectedId],
    queryFn: () => adminApi.b2bAccessRequest(selectedId!) as Promise<B2BRequest>,
    enabled: Boolean(selectedId),
  });

  const rows = requests.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.companyName} ${row.legalName} ${row.email} ${row.firstName} ${row.lastName}`.toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = detail.data ?? rows.find((row) => row.id === selectedId) ?? null;
  useEffect(() => {
    setReviewNotes(selected?.reviewNotes ?? '');
    setLastDecision(null);
  }, [selected?.id]);

  const approve = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select an application first');
      return adminApi.approveB2BAccessRequest(selected.id) as Promise<ApproveResult>;
    },
    onSuccess: (result) => {
      setLastDecision(result);
      toast.success(t('b2b_access.approved'));
      invalidateB2B(qc);
    },
    onError: (error) => toast.error(t('b2b_access.approve_failed'), { description: apiErrorMessage(error) }),
  });

  const reject = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select an application first');
      return adminApi.rejectB2BAccessRequest(selected.id, { reviewNotes: reviewNotes || undefined }) as Promise<RejectResult>;
    },
    onSuccess: (result) => {
      setLastDecision(result);
      toast.success(t('b2b_access.rejected'));
      invalidateB2B(qc);
    },
    onError: (error) => toast.error(t('b2b_access.reject_failed'), { description: apiErrorMessage(error) }),
  });

  const certificate = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select an application first');
      const blob = await adminApi.b2bAccessCertificate(selected.id);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = selected.files[0]?.originalFilename ?? `b2b-certificate-${selected.id}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    },
    onError: (error) => toast.error(t('b2b_access.certificate_failed'), { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <PageHeader
        titleI18nKey="b2b_access.title"
        subtitleI18nKey="b2b_access.subtitle"
        actions={(
          <button type="button" className="btn" onClick={() => { requests.refetch(); if (selectedId) detail.refetch(); }}>
            <RefreshCw size={14} /> {t('common.refresh')}
          </button>
        )}
      />

      <div className="sr-kpi-row">
        <Kpi label={t('b2b_access.kpi_pending')} value={status === 'pending' ? rows.length : null} tone="warn" icon={<FileCheck2 size={15} />} />
        <Kpi label={t('b2b_access.kpi_total_in_view')} value={rows.length} tone="" icon={<Search size={15} />} />
        <Kpi label={t('b2b_access.kpi_approved')} value={status === 'approved' ? rows.length : null} tone="success" icon={<ShieldCheck size={15} />} />
        <Kpi label={t('b2b_access.kpi_rejected')} value={status === 'rejected' ? rows.length : null} tone="danger" icon={<XCircle size={15} />} />
      </div>

      <div className="orders-toolbar">
        {(['pending', 'approved', 'rejected'] as B2BStatus[]).map((entry) => (
          <button key={entry} type="button" className={`btn ${status === entry ? 'primary' : ''}`} onClick={() => { setStatus(entry); setSelectedId(null); }}>
            {t(`b2b_access.status_${entry}`)}
          </button>
        ))}
        <div className="orders-search" style={{ flex: 1, minWidth: 240 }}>
          <Search size={14} />
          <input id="b2b-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('b2b_access.search_placeholder')} />
        </div>
      </div>

      {requests.isLoading && <StateBlock title={t('common.loading')} body={t('b2b_access.loading_body')} />}
      {requests.isError && <StateBlock title={t('common.error')} body={apiErrorMessage(requests.error)} action={<button type="button" className="btn" onClick={() => requests.refetch()}>{t('common.retry')}</button>} />}
      {requests.isSuccess && rows.length === 0 && <StateBlock title={t('b2b_access.empty_title')} body={t('b2b_access.empty_state')} />}
      {requests.isSuccess && rows.length > 0 && (
        <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(380px, .9fr)' }}>
          <div className="data-card">
            <table className="data-table" id="b2b-access-table">
              <thead>
                <tr>
                  <th>{t('b2b_access.col_company')}</th>
                  <th>{t('b2b_access.col_contact')}</th>
                  <th>{t('b2b_access.col_volume')}</th>
                  <th>{t('b2b_access.col_files')}</th>
                  <th>{t('b2b_access.col_submitted')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} id={`b2b-row-${row.id}`} onClick={() => setSelectedId(row.id)} style={{ cursor: 'pointer' }}>
                    <td><div className="name">{row.companyName}</div><div className="muted">{row.legalName}</div></td>
                    <td><div>{row.firstName} {row.lastName}</div><div className="muted">{row.email}</div></td>
                    <td>{row.estimatedMonthlyVolume || <span className="muted">-</span>}</td>
                    <td><span className="pill">{t('b2b_access.files_count', { count: row.files.length })}</span></td>
                    <td className="muted">{fmtDate(row.submittedAt)}</td>
                    <td><span className={`pill ${statusTone(row.status)}`}>{t(`b2b_access.status_${row.status}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <StateBlock title={t('b2b_access.no_matches_title')} body={t('b2b_access.no_matches_body')} />}
          </div>

          <aside className="section" id="b2b-access-detail">
            {!selected && <StateBlock title={t('b2b_access.no_selection_title')} body={t('b2b_access.no_selection_body')} />}
            {selected && (
              <>
                <h3>
                  <span>{selected.companyName}</span>
                  <span className={`pill ${statusTone(selected.status)}`}>{t(`b2b_access.status_${selected.status}`)}</span>
                </h3>
                <div className="row-stack">
                  <DetailLine label={t('b2b_access.detail_contact')} value={`${selected.firstName} ${selected.lastName} / ${selected.email}`} />
                  <DetailLine label={t('b2b_access.detail_phone')} value={selected.phone ?? '-'} />
                  <DetailLine label={t('b2b_access.detail_legal')} value={selected.legalName} />
                  <DetailLine label={t('b2b_access.detail_website')} value={selected.website ?? '-'} />
                  <DetailLine label={t('b2b_access.detail_industry')} value={selected.industry ?? '-'} />
                  <DetailLine label={t('b2b_access.detail_volume')} value={selected.estimatedMonthlyVolume ?? '-'} />
                  <DetailLine label={t('b2b_access.detail_submitted')} value={fmtDate(selected.submittedAt)} />
                </div>
                {selected.message && (
                  <div className="modal-section" style={{ marginTop: 14 }}>
                    <h3>{t('b2b_access.message')}</h3>
                    <p style={{ margin: 0, color: 'var(--text)', fontSize: 12, lineHeight: 1.5 }}>{selected.message}</p>
                  </div>
                )}
                <div className="modal-section" style={{ marginTop: 14 }}>
                  <h3>{t('b2b_access.files')}</h3>
                  {selected.files.length === 0 && <div className="muted">{t('b2b_access.no_files')}</div>}
                  {selected.files.map((file) => (
                    <div key={file.id} className="owner-row" style={{ marginBottom: 8 }}>
                      <span className="avatar" />
                      <div className="email">{file.originalFilename}</div>
                      <span className="pill">{formatBytes(file.sizeBytes)}</span>
                      <button type="button" className="btn ghost" disabled={certificate.isPending} onClick={() => certificate.mutate()} title={t('b2b_access.download_certificate')}>
                        <Download size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {(selected.status !== 'pending' || lastDecision) && (
                  <DecisionOutcome
                    request={selected}
                    decision={lastDecision}
                    reviewNotes={reviewNotes}
                  />
                )}

                {canWrite && selected.status === 'pending' && (
                  <div className="modal-section" style={{ marginTop: 14 }}>
                    <h3>{t('b2b_access.review')}</h3>
                    <div className="field">
                      <label>{t('b2b_access.review_notes')}</label>
                      <textarea rows={3} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn primary" disabled={approve.isPending} onClick={() => approve.mutate()}>
                        <CheckCircle2 size={13} /> {t('b2b_access.approve')}
                      </button>
                      <button type="button" className="btn danger-outline" disabled={reject.isPending} onClick={() => reject.mutate()}>
                        <XCircle size={13} /> {t('b2b_access.reject')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function DecisionOutcome({
  request,
  decision,
  reviewNotes,
}: {
  request: B2BRequest;
  decision: ApproveResult | RejectResult | null;
  reviewNotes: string;
}) {
  const approvedDecision = decision && 'customerId' in decision ? decision : null;
  const delivery = decision?.decisionDelivery ?? request.decisionDelivery;
  const customerId = approvedDecision?.customerId ?? request.resolvedCustomerId;
  const customerUserId = approvedDecision?.customerUserId ?? request.resolvedCustomerUserId;
  const tone = request.status === 'rejected' ? 'var(--danger)' : 'var(--success)';
  return (
    <div className="modal-section" style={{ marginTop: 14, borderColor: tone }}>
      <h3>Decision outcome</h3>
      {request.status === 'approved' || customerId || customerUserId ? (
        <>
          <DetailLine label="Portal customer" value={customerId ?? '-'} />
          <DetailLine label="Portal user" value={customerUserId ?? '-'} />
          {approvedDecision?.invitation ? (
            <>
              <DetailLine label="Invitation delivery" value={approvedDecision.invitation.delivery} />
              <DetailLine label="Invitation delivery id" value={approvedDecision.invitation.deliveryId} />
              <DetailLine label="Invitation expires" value={fmtDate(approvedDecision.invitation.expiresAt)} />
            </>
          ) : null}
        </>
      ) : null}
      {request.status === 'rejected' ? (
        <DetailLine label="Customer message" value={(request.reviewNotes ?? reviewNotes) || 'Application could not be approved at this time.'} />
      ) : null}
      {delivery ? (
        <>
          <DetailLine label="Decision email" value={`${delivery.status} / ${delivery.recipientEmail}`} />
          <DetailLine label="Delivery id" value={delivery.id} />
          <DetailLine label="Delivery event" value={delivery.eventKey} />
          <DetailLine label="Delivery recorded" value={fmtDate(delivery.createdAt)} />
          {delivery.sentAt ? <DetailLine label="Sent at" value={fmtDate(delivery.sentAt)} /> : null}
          {delivery.errorMessage ? <DetailLine label="Delivery error" value={delivery.errorMessage} /> : null}
        </>
      ) : (
        <div className="muted">No decision email has been recorded yet.</div>
      )}
    </div>
  );
}

function invalidateB2B(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QK });
}

function Kpi({ label, value, tone, icon }: { label: string; value: number | null; tone: string; icon: ReactNode }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
      <div className="val">{value ?? '-'}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
      <span className="muted">{label}</span>
      <strong style={{ color: 'var(--text)', textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</strong>
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

function statusTone(status: B2BStatus) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warn';
}

function fmtDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round((value / 1024 / 1024) * 10) / 10} MB`;
}
