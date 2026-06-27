import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, KeyRound, Mail, RefreshCw, Save, Send, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { sendTestMailSchema, type SendTestMailInput } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { useCan } from '@/lib/permissions';

type MailStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
type StatusFilter = MailStatus | 'all';

interface MailDelivery {
  id: string;
  tenantId: string;
  eventKey: string;
  category: string;
  recipientEmail: string;
  subject: string;
  html: string;
  text: string | null;
  status: MailStatus;
  provider: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

interface TenantConfigResponse {
  hasResendApiKey: boolean;
}

const DELIVERY_QUERY_KEY = ['system-mail', 'deliveries'] as const;
const TENANT_CONFIG_QUERY_KEY = ['identity', 'tenant-config'] as const;
const STATUS_FILTERS: StatusFilter[] = ['all', 'queued', 'sending', 'sent', 'failed', 'skipped'];

export function SystemMailPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canWrite = useCan('settings.write');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [recipient, setRecipient] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ to: '', subject: '' });
  const [settingsForm, setSettingsForm] = useState({ resendApiKey: '' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [settingsValidationError, setSettingsValidationError] = useState<string | null>(null);

  useEffect(() => {
    setForm((current) => ({
      to: current.to || principal?.email || '',
      subject: current.subject || t('system_mail.default_subject'),
    }));
  }, [principal?.email, t]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (recipient.trim()) params.set('recipient', recipient.trim());
    if (eventKey.trim()) params.set('eventKey', eventKey.trim());
    params.set('limit', '75');
    return `?${params.toString()}`;
  }, [eventKey, recipient, status]);

  const deliveries = useQuery({
    queryKey: [...DELIVERY_QUERY_KEY, queryString],
    queryFn: () => adminApi.mailDeliveries(queryString) as Promise<MailDelivery[]>,
    retry: false,
  });

  const tenantConfig = useQuery({
    queryKey: TENANT_CONFIG_QUERY_KEY,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
    retry: false,
  });

  const rows = deliveries.data ?? [];
  const selectedFallback = rows.find((row) => row.id === selectedId) ?? null;
  const detail = useQuery({
    queryKey: [...DELIVERY_QUERY_KEY, 'detail', selectedId],
    queryFn: () => adminApi.mailDelivery(selectedId!) as Promise<MailDelivery>,
    enabled: Boolean(selectedId),
    retry: false,
  });
  const selected = detail.data ?? selectedFallback;

  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] += 1;
        return acc;
      },
      { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 } satisfies Record<MailStatus | 'total', number>,
    );
  }, [rows]);

  const testMail = useMutation({
    mutationFn: (input: SendTestMailInput) => adminApi.sendTestMail(input) as Promise<MailDelivery>,
    onSuccess: async (delivery) => {
      setSelectedId(delivery.id);
      toast.success(t('system_mail.test_queued'), { description: delivery.id });
      await qc.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY });
      window.setTimeout(() => qc.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY }), 1200);
    },
    onError: (error) => toast.error(t('system_mail.test_failed'), { description: apiErrorMessage(error) }),
  });

  const saveSettings = useMutation({
    mutationFn: () => adminApi.updateTenantConfig({ resendApiKey: settingsForm.resendApiKey.trim() }),
    onSuccess: async () => {
      setSettingsForm({ resendApiKey: '' });
      toast.success(t('system_mail.settings_saved'));
      await qc.invalidateQueries({ queryKey: TENANT_CONFIG_QUERY_KEY });
    },
    onError: (error) => toast.error(t('system_mail.settings_failed'), { description: apiErrorMessage(error) }),
  });

  const retryDelivery = useMutation({
    mutationFn: (id: string) => adminApi.retryMailDelivery(id) as Promise<MailDelivery>,
    onSuccess: async (delivery) => {
      setSelectedId(delivery.id);
      if (delivery.status === 'sent') {
        toast.success(t('system_mail.retry_sent'), { description: delivery.id });
      } else {
        toast.error(t('system_mail.retry_not_sent'), { description: delivery.errorMessage ?? delivery.status });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: [...DELIVERY_QUERY_KEY, 'detail', delivery.id] }),
      ]);
    },
    onError: (error) => toast.error(t('system_mail.retry_failed'), { description: apiErrorMessage(error) }),
  });

  const submitTest = (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    const parsed = sendTestMailSchema.safeParse({
      to: form.to.trim(),
      subject: form.subject.trim() || t('system_mail.default_subject'),
    });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? t('system_mail.validation_failed'));
      return;
    }
    testMail.mutate(parsed.data);
  };

  const submitSettings = (event: React.FormEvent) => {
    event.preventDefault();
    setSettingsValidationError(null);
    if (settingsForm.resendApiKey.trim().length < 12) {
      setSettingsValidationError(t('system_mail.resend_key_invalid'));
      return;
    }
    saveSettings.mutate();
  };

  const clearFilters = () => {
    setStatus('all');
    setRecipient('');
    setEventKey('');
  };

  return (
    <>
      <PageHeader
        titleI18nKey="system_mail.title"
        subtitleI18nKey="system_mail.subtitle"
        actions={(
          <button type="button" className="btn" onClick={() => { deliveries.refetch(); if (selectedId) detail.refetch(); }}>
            <RefreshCw size={14} /> {t('common.refresh')}
          </button>
        )}
      />

      <div className="sr-kpi-row">
        <Kpi label={t('system_mail.kpi_total')} value={summary.total} tone="" icon={<Mail size={15} />} />
        <Kpi label={t('system_mail.kpi_queued')} value={summary.queued + summary.sending} tone="warn" icon={<RefreshCw size={15} />} />
        <Kpi label={t('system_mail.kpi_sent')} value={summary.sent} tone="success" icon={<Send size={15} />} />
        <Kpi label={t('system_mail.kpi_failed')} value={summary.failed + summary.skipped} tone="danger" icon={<AlertTriangle size={15} />} />
      </div>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(340px, .7fr)', marginBottom: 16 }}>
        <section className="section">
          <h3>{t('system_mail.filters_title')}</h3>
          <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((entry) => (
              <button key={entry} type="button" className={`btn ${status === entry ? 'primary' : ''}`} onClick={() => setStatus(entry)}>
                {t(`system_mail.status_${entry}`)}
              </button>
            ))}
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="field-mail-recipient">{t('system_mail.field_recipient_filter')}</label>
              <input
                id="field-mail-recipient"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={t('system_mail.placeholder_recipient_filter')}
              />
            </div>
            <div className="field">
              <label htmlFor="field-mail-event">{t('system_mail.field_event_filter')}</label>
              <input
                id="field-mail-event"
                value={eventKey}
                onChange={(event) => setEventKey(event.target.value)}
                placeholder={t('system_mail.placeholder_event_filter')}
              />
            </div>
          </div>
          {(status !== 'all' || recipient || eventKey) && (
            <button type="button" className="btn ghost" onClick={clearFilters}>
              <XCircle size={14} /> {t('system_mail.clear_filters')}
            </button>
          )}
        </section>

        <div className="row-stack">
          <form className="section" onSubmit={submitTest}>
            <h3>{t('system_mail.test_title')}</h3>
            {validationError && <div className="error-state">{validationError}</div>}
            <div className="field">
              <label htmlFor="field-mail-to">{t('system_mail.field_to')}</label>
              <input
                id="field-mail-to"
                type="email"
                value={form.to}
                onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))}
                placeholder={t('system_mail.placeholder_to')}
                disabled={!canWrite || testMail.isPending}
              />
            </div>
            <div className="field">
              <label htmlFor="field-mail-subject">{t('system_mail.field_subject')}</label>
              <input
                id="field-mail-subject"
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder={t('system_mail.default_subject')}
                disabled={!canWrite || testMail.isPending}
              />
            </div>
            <button type="submit" className="btn primary" disabled={!canWrite || testMail.isPending}>
              <Send size={14} /> {testMail.isPending ? t('system_mail.sending') : t('system_mail.send_test')}
            </button>
            {!canWrite && <div className="hint" style={{ marginTop: 8 }}>{t('system_mail.no_write_permission')}</div>}
          </form>

          <form className="section" onSubmit={submitSettings}>
            <h3>
              <span>{t('system_mail.settings_title')}</span>
              <span className={`pill ${tenantConfig.data?.hasResendApiKey ? 'success' : 'warn'}`}>
                {tenantConfig.data?.hasResendApiKey ? t('system_mail.resend_key_saved') : t('system_mail.resend_key_missing')}
              </span>
            </h3>
            {settingsValidationError && <div className="error-state">{settingsValidationError}</div>}
            {tenantConfig.isError && <div className="error-state">{apiErrorMessage(tenantConfig.error)}</div>}
            <div className="field">
              <label htmlFor="field-resend-api-key">{t('system_mail.field_resend_api_key')}</label>
              <div className="auth-password-wrap">
                <KeyRound className="auth-input-icon" size={14} />
                <input
                  id="field-resend-api-key"
                  type="password"
                  value={settingsForm.resendApiKey}
                  onChange={(event) => setSettingsForm({ resendApiKey: event.target.value })}
                  placeholder={t('system_mail.placeholder_resend_api_key')}
                  disabled={!canWrite || saveSettings.isPending}
                />
              </div>
              <span className="hint">{t('system_mail.resend_key_hint')}</span>
            </div>
            <button type="submit" className="btn" disabled={!canWrite || saveSettings.isPending}>
              <Save size={14} /> {saveSettings.isPending ? t('system_mail.saving_settings') : t('system_mail.save_settings')}
            </button>
          </form>
        </div>
      </div>

      {deliveries.isLoading && <StateBlock title={t('common.loading')} body={t('system_mail.loading_body')} />}
      {deliveries.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(deliveries.error)}
          action={<button type="button" className="btn" onClick={() => deliveries.refetch()}>{t('common.retry')}</button>}
        />
      )}
      {deliveries.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('system_mail.empty_title')}
          body={t('system_mail.empty_body')}
          action={<button type="button" className="btn primary" onClick={() => document.getElementById('field-mail-to')?.focus()}>{t('system_mail.empty_cta')}</button>}
        />
      )}
      {deliveries.isSuccess && rows.length > 0 && (
        <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(360px, .75fr)' }}>
          <div className="data-card">
            <table className="data-table" id="system-mail-table">
              <thead>
                <tr>
                  <th>{t('system_mail.col_status')}</th>
                  <th>{t('system_mail.col_event')}</th>
                  <th>{t('system_mail.col_recipient')}</th>
                  <th>{t('system_mail.col_subject')}</th>
                  <th>{t('system_mail.col_provider')}</th>
                  <th>{t('system_mail.col_created')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} id={`mail-row-${row.id}`} onClick={() => setSelectedId(row.id)} style={{ cursor: 'pointer' }}>
                    <td><span className={`pill ${statusTone(row.status)} dot`}>{t(`system_mail.status_${row.status}`)}</span></td>
                    <td><div className="name">{row.eventKey}</div><div className="muted">{row.category}</div></td>
                    <td>{row.recipientEmail}</td>
                    <td>{row.subject}</td>
                    <td>{row.provider ?? '-'}</td>
                    <td className="muted">{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="section" id="system-mail-detail">
            {!selected && <StateBlock title={t('system_mail.no_selection_title')} body={t('system_mail.no_selection_body')} />}
            {selected && (
              <>
                <h3>
                  <span>{t('system_mail.detail_title')}</span>
                  <span className={`pill ${statusTone(selected.status)}`}>{t(`system_mail.status_${selected.status}`)}</span>
                </h3>
                {detail.isError && <div className="error-state">{apiErrorMessage(detail.error)}</div>}
                <div className="row-stack">
                  <DetailLine label={t('system_mail.detail_id')} value={selected.id} />
                  <DetailLine label={t('system_mail.detail_event')} value={selected.eventKey} />
                  <DetailLine label={t('system_mail.detail_to')} value={selected.recipientEmail} />
                  <DetailLine label={t('system_mail.detail_subject')} value={selected.subject} />
                  <DetailLine label={t('system_mail.detail_provider')} value={selected.provider ?? '-'} />
                  <DetailLine label={t('system_mail.detail_provider_id')} value={selected.providerMessageId ?? '-'} />
                  <DetailLine label={t('system_mail.detail_attempts')} value={String(selected.attemptCount)} />
                  <DetailLine label={t('system_mail.detail_created')} value={fmtDate(selected.createdAt)} />
                  <DetailLine label={t('system_mail.detail_sent')} value={fmtDate(selected.sentAt)} />
                </div>
                {canWrite && selected.status !== 'sent' && (
                  <div style={{ marginTop: 14 }}>
                    <button type="button" className="btn" disabled={retryDelivery.isPending} onClick={() => retryDelivery.mutate(selected.id)}>
                      <RefreshCw size={14} /> {retryDelivery.isPending ? t('system_mail.retrying_delivery') : t('system_mail.retry_delivery')}
                    </button>
                  </div>
                )}
                {selected.errorMessage && (
                  <div className="modal-section" style={{ marginTop: 14, borderColor: 'var(--danger)' }}>
                    <h3>{t('system_mail.detail_error')}</h3>
                    <p style={{ margin: 0, color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }}>{selected.errorMessage}</p>
                  </div>
                )}
                <div className="modal-section" style={{ marginTop: 14 }}>
                  <h3>{t('system_mail.detail_preview')}</h3>
                  <p style={{ margin: 0, color: 'var(--text)', fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                    {messagePreview(selected)}
                  </p>
                </div>
                <div className="modal-section" style={{ marginTop: 14 }}>
                  <h3>{t('system_mail.detail_metadata')}</h3>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, color: 'var(--text-muted)' }}>
                    {jsonPreview(selected.metadata)}
                  </pre>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: ReactNode }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
      <div className="val">{value}</div>
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

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
      <span className="muted">{label}</span>
      <strong style={{ color: 'var(--text)', textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</strong>
    </div>
  );
}

function statusTone(status: MailStatus) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'skipped') return 'info';
  return 'warn';
}

function fmtDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function messagePreview(delivery: MailDelivery) {
  if (delivery.text) return delivery.text;
  return delivery.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '-';
}

function jsonPreview(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}
