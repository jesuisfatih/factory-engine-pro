import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArchiveX, KeyRound, Mail, RefreshCw, Save, Send, ShieldOff, SlidersHorizontal, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  MEMBER_PERMISSIONS,
  addMailSuppressionSchema,
  sendTestMailSchema,
  type MailCenterSettings,
  type MailDeliveryLogResponse,
  type MailProviderEventDto,
  type MailProviderEventLogResponse,
  type MailProviderHealthResponse,
  type SendTestMailInput,
} from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { useCan } from '@/lib/permissions';

type MailStatus = 'queued' | 'queued_disabled' | 'sending' | 'sent' | 'failed' | 'skipped';
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

type MailDeliveryPage = MailDeliveryLogResponse<MailDelivery>;

interface TenantConfigResponse {
  hasResendApiKey: boolean;
  hasResendWebhookSecret: boolean;
}

interface MailSuppressionRow {
  id: string;
  channel: string;
  scope: string;
  category: string | null;
  campaignId: string | null;
  flowId: string | null;
  templateId: string | null;
  isActive: boolean;
  reason: string;
  source: string;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; email: string; normalizedEmail: string; name: string | null; isSendable: boolean };
}

interface MailDlqRow {
  id: string;
  eventKey: string;
  recipientEmail: string;
  status: string;
  provider: string | null;
  errorMessage: string | null;
  lastDeliveryId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface MailSettingsResponse {
  settings: MailCenterSettings;
  criticalEvents: readonly string[];
}

interface MailSettingsAuditRow {
  id: string;
  category: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

const DELIVERY_QUERY_KEY = ['system-mail', 'deliveries'] as const;
const TENANT_CONFIG_QUERY_KEY = ['identity', 'tenant-config'] as const;
const MAIL_HEALTH_QUERY_KEY = ['system-mail', 'provider-health'] as const;
const PROVIDER_EVENTS_QUERY_KEY = ['system-mail', 'provider-events'] as const;
const SUPPRESSION_QUERY_KEY = ['system-mail', 'suppression'] as const;
const DLQ_QUERY_KEY = ['system-mail', 'delivery-recovery'] as const;
const SETTINGS_QUERY_KEY = ['system-mail', 'settings'] as const;
const SETTINGS_AUDIT_QUERY_KEY = ['system-mail', 'settings-audit'] as const;
const STATUS_FILTERS: StatusFilter[] = ['all', 'queued', 'queued_disabled', 'sending', 'sent', 'failed', 'skipped'];
const DELIVERY_PAGE_SIZES = [10, 50, 100, 150] as const;

export function SystemMailPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canMailSettingsWrite = useCan(MEMBER_PERMISSIONS.mailSettingsWrite);
  const canMailSuppressionWrite = useCan(MEMBER_PERMISSIONS.mailSuppressionWrite);
  const canMailDeliveryRetry = useCan(MEMBER_PERMISSIONS.mailDeliveryRetry);
  const canMailTemplateWrite = useCan(MEMBER_PERMISSIONS.mailTemplateWrite);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [recipient, setRecipient] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [pageSize, setPageSize] = useState<(typeof DELIVERY_PAGE_SIZES)[number]>(10);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ to: '', subject: '' });
  const [settingsForm, setSettingsForm] = useState({ resendApiKey: '', resendWebhookSecret: '' });
  const [suppressionForm, setSuppressionForm] = useState({
    email: '',
    scope: 'global',
    category: 'marketing',
    campaignId: '',
    flowId: '',
    templateId: '',
    reason: 'manual',
    notes: '',
    expiresAt: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [settingsValidationError, setSettingsValidationError] = useState<string | null>(null);
  const [suppressionError, setSuppressionError] = useState<string | null>(null);

  useEffect(() => {
    setForm((current) => ({
      to: current.to || principal?.email || '',
      subject: current.subject || t('system_mail.default_subject'),
    }));
  }, [principal?.email, t]);

  useEffect(() => {
    setCursorStack([]);
  }, [eventKey, pageSize, recipient, status]);

  const currentCursor = cursorStack[cursorStack.length - 1];

  const deliveries = useQuery({
    queryKey: [...DELIVERY_QUERY_KEY, status, recipient, eventKey, pageSize, currentCursor ?? 'first'],
    queryFn: () => adminApi.mailDeliveryLog({
      status: status === 'all' ? undefined : status,
      recipient: recipient.trim() || undefined,
      eventKey: eventKey.trim() || undefined,
      limit: pageSize,
      cursor: currentCursor,
    }) as Promise<MailDeliveryPage>,
    retry: false,
  });

  const tenantConfig = useQuery({
    queryKey: TENANT_CONFIG_QUERY_KEY,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
    retry: false,
  });
  const providerHealth = useQuery({
    queryKey: MAIL_HEALTH_QUERY_KEY,
    queryFn: () => adminApi.mailHealth() as Promise<MailProviderHealthResponse>,
    retry: false,
  });
  const providerEvents = useQuery({
    queryKey: PROVIDER_EVENTS_QUERY_KEY,
    queryFn: () => adminApi.mailProviderEvents({ limit: 5 }) as Promise<MailProviderEventLogResponse>,
    retry: false,
  });
  const suppression = useQuery({
    queryKey: SUPPRESSION_QUERY_KEY,
    queryFn: () => adminApi.mailSuppression({ active: true, limit: 50 }) as Promise<MailSuppressionRow[]>,
    retry: false,
  });
  const deliveryRecovery = useQuery({
    queryKey: DLQ_QUERY_KEY,
    queryFn: () => adminApi.mailDlq({ status: 'pending', limit: 50 }) as Promise<MailDlqRow[]>,
    retry: false,
  });
  const mailSettings = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => adminApi.mailSettings() as Promise<MailSettingsResponse>,
    retry: false,
  });
  const settingsAudit = useQuery({
    queryKey: SETTINGS_AUDIT_QUERY_KEY,
    queryFn: () => adminApi.mailSettingsAudit({ limit: 8 }) as Promise<MailSettingsAuditRow[]>,
    retry: false,
  });

  const rows = deliveries.data?.data ?? [];
  const deliveryMeta = deliveries.data?.meta ?? { count: 0, pageCount: 0, limit: pageSize, nextCursor: null };
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
    const result = rows.reduce(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { total: 0, queued: 0, queued_disabled: 0, sending: 0, sent: 0, failed: 0, skipped: 0 } satisfies Record<MailStatus | 'total', number>,
    );
    result.total = deliveryMeta.count;
    return result;
  }, [deliveryMeta.count, rows]);

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
    mutationFn: () => {
      const payload: { resendApiKey?: string; resendWebhookSecret?: string } = {};
      if (settingsForm.resendApiKey.trim()) payload.resendApiKey = settingsForm.resendApiKey.trim();
      if (settingsForm.resendWebhookSecret.trim()) payload.resendWebhookSecret = settingsForm.resendWebhookSecret.trim();
      return adminApi.updateTenantConfig(payload);
    },
    onSuccess: async () => {
      setSettingsForm({ resendApiKey: '', resendWebhookSecret: '' });
      toast.success(t('system_mail.settings_saved'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: TENANT_CONFIG_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: MAIL_HEALTH_QUERY_KEY }),
      ]);
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

  const addSuppression = useMutation({
    mutationFn: () => adminApi.addMailSuppression({
      email: suppressionForm.email.trim(),
      scope: suppressionForm.scope as 'global' | 'category' | 'campaign' | 'flow' | 'template',
      category: suppressionForm.scope === 'category' ? suppressionForm.category.trim() || null : null,
      campaignId: suppressionForm.scope === 'campaign' ? suppressionForm.campaignId.trim() || null : null,
      flowId: suppressionForm.scope === 'flow' ? suppressionForm.flowId.trim() || null : null,
      templateId: suppressionForm.scope === 'template' ? suppressionForm.templateId.trim() || null : null,
      reason: suppressionForm.reason.trim() || 'manual',
      notes: suppressionForm.notes.trim() || null,
      expiresAt: suppressionForm.expiresAt ? new Date(suppressionForm.expiresAt).toISOString() : null,
    }) as Promise<MailSuppressionRow>,
    onSuccess: async () => {
      setSuppressionForm({ email: '', scope: 'global', category: 'marketing', campaignId: '', flowId: '', templateId: '', reason: 'manual', notes: '', expiresAt: '' });
      toast.success('Recipient suppressed');
      await Promise.all([
        qc.invalidateQueries({ queryKey: SUPPRESSION_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ['mail-marketing'] }),
      ]);
    },
    onError: (error) => toast.error('Could not suppress recipient', { description: apiErrorMessage(error) }),
  });

  const unsuppressMail = useMutation({
    mutationFn: (id: string) => adminApi.unsuppressMail(id),
    onSuccess: async () => {
      toast.success('Recipient restored');
      await qc.invalidateQueries({ queryKey: SUPPRESSION_QUERY_KEY });
    },
    onError: (error) => toast.error('Could not restore recipient', { description: apiErrorMessage(error) }),
  });

  const retryRecovery = useMutation({
    mutationFn: (id: string) => adminApi.retryMailDlq(id),
    onSuccess: async () => {
      toast.success('Delivery retry started');
      await Promise.all([
        qc.invalidateQueries({ queryKey: DLQ_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY }),
      ]);
    },
    onError: (error) => toast.error('Could not retry delivery', { description: apiErrorMessage(error) }),
  });

  const discardRecovery = useMutation({
    mutationFn: (id: string) => adminApi.discardMailDlq(id),
    onSuccess: async () => {
      toast.success('Recovery item discarded');
      await qc.invalidateQueries({ queryKey: DLQ_QUERY_KEY });
    },
    onError: (error) => toast.error('Could not discard recovery item', { description: apiErrorMessage(error) }),
  });

  const toggleMarketingSends = useMutation({
    mutationFn: (enabled: boolean) => adminApi.updateMailSettings({ categoryMarketing: { enabled } }),
    onSuccess: async () => {
      toast.success('Send controls updated');
      await Promise.all([
        qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SETTINGS_AUDIT_QUERY_KEY }),
      ]);
    },
    onError: (error) => toast.error('Could not update send controls', { description: apiErrorMessage(error) }),
  });

  const updateProviderMode = useMutation({
    mutationFn: (providerMode: MailCenterSettings['providerMode']) => adminApi.updateMailSettings({ providerMode }),
    onSuccess: async () => {
      toast.success('Provider mode updated');
      await Promise.all([
        qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SETTINGS_AUDIT_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: MAIL_HEALTH_QUERY_KEY }),
      ]);
    },
    onError: (error) => toast.error('Could not update provider mode', { description: apiErrorMessage(error) }),
  });

  const resetMailSettings = useMutation({
    mutationFn: () => adminApi.resetMailSettings({ confirm: 'RESET' }),
    onSuccess: async () => {
      toast.success('Mail settings reset');
      await Promise.all([
        qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SETTINGS_AUDIT_QUERY_KEY }),
      ]);
    },
    onError: (error) => toast.error('Could not reset settings', { description: apiErrorMessage(error) }),
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
    const apiKey = settingsForm.resendApiKey.trim();
    const webhookSecret = settingsForm.resendWebhookSecret.trim();
    if (!apiKey && !webhookSecret) {
      setSettingsValidationError(t('system_mail.provider_secret_required'));
      return;
    }
    if (apiKey && apiKey.length < 12) {
      setSettingsValidationError(t('system_mail.resend_key_invalid'));
      return;
    }
    if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
      setSettingsValidationError(t('system_mail.resend_webhook_secret_invalid'));
      return;
    }
    saveSettings.mutate();
  };

  const submitSuppression = (event: React.FormEvent) => {
    event.preventDefault();
    setSuppressionError(null);
    const parsed = addMailSuppressionSchema.safeParse({
      email: suppressionForm.email.trim(),
      scope: suppressionForm.scope,
      category: suppressionForm.scope === 'category' ? suppressionForm.category.trim() || null : null,
      campaignId: suppressionForm.scope === 'campaign' ? suppressionForm.campaignId.trim() || null : null,
      flowId: suppressionForm.scope === 'flow' ? suppressionForm.flowId.trim() || null : null,
      templateId: suppressionForm.scope === 'template' ? suppressionForm.templateId.trim() || null : null,
      reason: suppressionForm.reason.trim() || 'manual',
      notes: suppressionForm.notes.trim() || null,
      expiresAt: suppressionForm.expiresAt ? new Date(suppressionForm.expiresAt).toISOString() : null,
    });
    if (!parsed.success) {
      setSuppressionError(parsed.error.issues[0]?.message ?? 'Enter a valid recipient email.');
      return;
    }
    addSuppression.mutate();
  };

  const clearFilters = () => {
    setStatus('all');
    setRecipient('');
    setEventKey('');
  };

  const goNextDeliveryPage = () => {
    if (!deliveryMeta.nextCursor) return;
    setCursorStack((current) => [...current, deliveryMeta.nextCursor as string]);
  };

  const goPreviousDeliveryPage = () => {
    setCursorStack((current) => current.slice(0, -1));
  };

  return (
    <>
      <PageHeader
        titleI18nKey="system_mail.title"
        subtitleI18nKey="system_mail.subtitle"
        actions={(
          <button type="button" className="btn" onClick={() => { deliveries.refetch(); providerHealth.refetch(); providerEvents.refetch(); if (selectedId) detail.refetch(); }}>
            <RefreshCw size={14} /> {t('common.refresh')}
          </button>
        )}
      />

      <div className="sr-kpi-row">
        <Kpi label={t('system_mail.kpi_total')} value={summary.total} tone="" icon={<Mail size={15} />} />
        <Kpi label={t('system_mail.kpi_queued')} value={summary.queued + summary.sending} tone="warn" icon={<RefreshCw size={15} />} />
        <Kpi label={t('system_mail.kpi_disabled_proof')} value={summary.queued_disabled} tone="info" icon={<ShieldOff size={15} />} />
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
                disabled={!canMailTemplateWrite || testMail.isPending}
              />
            </div>
            <div className="field">
              <label htmlFor="field-mail-subject">{t('system_mail.field_subject')}</label>
              <input
                id="field-mail-subject"
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder={t('system_mail.default_subject')}
                disabled={!canMailTemplateWrite || testMail.isPending}
              />
            </div>
            <button type="submit" className="btn primary" disabled={!canMailTemplateWrite || testMail.isPending}>
              <Send size={14} /> {testMail.isPending ? t('system_mail.sending') : t('system_mail.send_test')}
            </button>
            {!canMailTemplateWrite && <div className="hint" style={{ marginTop: 8 }}>{t('system_mail.no_write_permission')}</div>}
          </form>

          <section className="section" id="system-mail-provider-health">
            <h3>
              <span>{t('system_mail.health_title')}</span>
              {providerHealth.data && (
                <span className={`pill ${healthTone(providerHealth.data.status)}`}>
                  {t(`system_mail.health_status_${providerHealth.data.status}`)}
                </span>
              )}
            </h3>
            {providerHealth.isLoading && <StateBlock title={t('common.loading')} body={t('system_mail.health_loading_body')} />}
            {providerHealth.isError && (
              <StateBlock
                title={t('system_mail.health_error_title')}
                body={apiErrorMessage(providerHealth.error)}
                action={<button type="button" className="btn" onClick={() => providerHealth.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
              />
            )}
            {providerHealth.isSuccess && providerHealth.data.credentialRequired && (
              <StateBlock
                title={t('system_mail.health_missing_title')}
                body={t('system_mail.health_missing_body')}
                action={<button type="button" className="btn primary" onClick={() => document.getElementById('field-resend-api-key')?.focus()}>{t('system_mail.health_missing_cta')}</button>}
              />
            )}
            {providerHealth.isSuccess && !providerHealth.data.credentialRequired && (
              <div className="row-stack">
                {providerHealth.data.status === 'ok' ? (
                  <div style={{ border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)', background: 'var(--success-soft)', color: 'var(--success)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 12 }}>
                    {t('system_mail.health_ok_body')}
                  </div>
                ) : (
                  <div className="error-state">{providerHealth.data.error ?? t(`system_mail.health_status_${providerHealth.data.status}`)}</div>
                )}
                <DetailLine label={t('system_mail.health_provider')} value="Resend" />
                <DetailLine label={t('system_mail.health_source')} value={t(`system_mail.health_source_${providerHealth.data.source}`)} />
                <DetailLine label={t('system_mail.health_provider_status')} value={providerHealth.data.providerStatus === null ? '-' : String(providerHealth.data.providerStatus)} />
                <DetailLine label={t('system_mail.health_reachable')} value={providerHealth.data.reachable ? t('common.yes') : t('common.no')} />
                <DetailLine label={t('system_mail.health_latency')} value={providerHealth.data.latencyMs === null ? '-' : `${providerHealth.data.latencyMs}ms`} />
                <DetailLine label={t('system_mail.health_domain_count')} value={providerHealth.data.domainCount === null ? '-' : String(providerHealth.data.domainCount)} />
                <DetailLine label={t('system_mail.health_checked')} value={fmtDate(providerHealth.data.checkedAt)} />
              </div>
            )}
            {providerHealth.isSuccess && (
              <div className="modal-section" style={{ marginTop: 12, padding: 12 }}>
                <h3 style={{ marginTop: 0 }}>Operational proof</h3>
                <div className="row-stack">
                  {providerHealth.data.disabledReason && (
                    <DetailLine label="Disabled/blocking reason" value={providerHealth.data.disabledReason} />
                  )}
                  {providerHealth.data.queueCounts && (
                    <DetailLine
                      label="Outbound queue"
                      value={`waiting ${providerHealth.data.queueCounts.waiting} - active ${providerHealth.data.queueCounts.active} - delayed ${providerHealth.data.queueCounts.delayed} - failed ${providerHealth.data.queueCounts.failed}`}
                    />
                  )}
                  {providerHealth.data.dlq && (
                    <DetailLine
                      label="Recovery queue"
                      value={`pending ${providerHealth.data.dlq.pending} - retrying ${providerHealth.data.dlq.retrying} - resolved ${providerHealth.data.dlq.resolved} - discarded ${providerHealth.data.dlq.discarded}`}
                    />
                  )}
                  {providerHealth.data.deliveryWindow && (
                    <>
                      <DetailLine label="Last 24h by status" value={formatHealthCounts(providerHealth.data.deliveryWindow.byStatus)} />
                      <DetailLine label="Last 24h by category" value={formatHealthCounts(providerHealth.data.deliveryWindow.byCategory)} />
                    </>
                  )}
                </div>
              </div>
            )}
            {providerHealth.isSuccess && (
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => providerHealth.refetch()} disabled={providerHealth.isFetching}>
                <RefreshCw size={14} /> {t('system_mail.health_refresh')}
              </button>
            )}
          </section>

          <section className="section" id="system-mail-provider-events">
            <h3>
              <span>Provider webhook proof</span>
              <span className="meta">{providerEvents.data?.meta.count ?? 0} stored</span>
            </h3>
            <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 12 }}>
              Resend webhooks are counted only when the signed provider event is stored for this tenant.
            </p>
            {providerEvents.isLoading && <StateBlock title="Loading provider events" body="Reading stored Resend webhook proof from the API." />}
            {providerEvents.isError && (
              <StateBlock
                title="Could not load provider webhook proof"
                body={apiErrorMessage(providerEvents.error)}
                action={<button type="button" className="btn" onClick={() => providerEvents.refetch()}><RefreshCw size={14} /> Retry</button>}
              />
            )}
            {providerEvents.isSuccess && providerEvents.data.data.length === 0 && (
              <StateBlock
                title="No provider webhook proof yet"
                body="No signed Resend webhook event has been stored for this tenant. Live provider verification is not complete until at least one row appears here."
              />
            )}
            {providerEvents.isSuccess && providerEvents.data.data.length > 0 && (
              <div className="row-stack">
                {providerEvents.data.data.map((event) => (
                  <ProviderEventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>

          <form className="section" onSubmit={submitSettings}>
            <h3>
              <span>{t('system_mail.settings_title')}</span>
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={`pill ${tenantConfig.data?.hasResendApiKey ? 'success' : 'warn'}`}>
                  {tenantConfig.data?.hasResendApiKey ? t('system_mail.resend_key_saved') : t('system_mail.resend_key_missing')}
                </span>
                <span className={`pill ${tenantConfig.data?.hasResendWebhookSecret ? 'success' : 'warn'}`}>
                  {tenantConfig.data?.hasResendWebhookSecret ? t('system_mail.resend_webhook_secret_saved') : t('system_mail.resend_webhook_secret_missing')}
                </span>
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
                  onChange={(event) => setSettingsForm((current) => ({ ...current, resendApiKey: event.target.value }))}
                  placeholder={t('system_mail.placeholder_resend_api_key')}
                  disabled={!canMailSettingsWrite || saveSettings.isPending}
                />
              </div>
              <span className="hint">{t('system_mail.resend_key_hint')}</span>
            </div>
            <div className="field">
              <label htmlFor="field-resend-webhook-secret">{t('system_mail.field_resend_webhook_secret')}</label>
              <div className="auth-password-wrap">
                <KeyRound className="auth-input-icon" size={14} />
                <input
                  id="field-resend-webhook-secret"
                  type="password"
                  value={settingsForm.resendWebhookSecret}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, resendWebhookSecret: event.target.value }))}
                  placeholder={t('system_mail.placeholder_resend_webhook_secret')}
                  disabled={!canMailSettingsWrite || saveSettings.isPending}
                />
              </div>
              <span className="hint">{t('system_mail.resend_webhook_secret_hint')}</span>
            </div>
            <button type="submit" className="btn" disabled={!canMailSettingsWrite || saveSettings.isPending}>
              <Save size={14} /> {saveSettings.isPending ? t('system_mail.saving_settings') : t('system_mail.save_settings')}
            </button>
          </form>
        </div>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginBottom: 16 }}>
        <section className="section" id="system-mail-suppression">
          <h3>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ShieldOff size={14} /> Suppressed recipients</span>
            <span className="meta">{suppression.data?.length ?? 0} active</span>
          </h3>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 12 }}>
            People on this list are blocked from marketing sends. Transactional critical mail is still protected by the backend rules.
          </p>
          <form className="field-row" onSubmit={submitSuppression} style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label htmlFor="field-suppression-email">Recipient email</label>
              <input
                id="field-suppression-email"
                type="email"
                value={suppressionForm.email}
                onChange={(event) => setSuppressionForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="customer@example.com"
                disabled={!canMailSuppressionWrite || addSuppression.isPending}
              />
            </div>
            <div className="field">
              <label htmlFor="field-suppression-scope">Block scope</label>
              <select
                id="field-suppression-scope"
                value={suppressionForm.scope}
                onChange={(event) => setSuppressionForm((current) => ({ ...current, scope: event.target.value }))}
                disabled={!canMailSuppressionWrite || addSuppression.isPending}
              >
                <option value="global">All email</option>
                <option value="category">Category</option>
                <option value="campaign">Campaign</option>
                <option value="flow">Flow</option>
                <option value="template">Template</option>
              </select>
            </div>
            {suppressionForm.scope === 'category' && (
              <div className="field">
                <label htmlFor="field-suppression-category">Category</label>
                <input
                  id="field-suppression-category"
                  value={suppressionForm.category}
                  onChange={(event) => setSuppressionForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="marketing"
                  disabled={!canMailSuppressionWrite || addSuppression.isPending}
                />
              </div>
            )}
            {suppressionForm.scope === 'campaign' && (
              <div className="field">
                <label htmlFor="field-suppression-campaign">Campaign id</label>
                <input
                  id="field-suppression-campaign"
                  value={suppressionForm.campaignId}
                  onChange={(event) => setSuppressionForm((current) => ({ ...current, campaignId: event.target.value }))}
                  placeholder="mcmp_..."
                  disabled={!canMailSuppressionWrite || addSuppression.isPending}
                />
              </div>
            )}
            {suppressionForm.scope === 'flow' && (
              <div className="field">
                <label htmlFor="field-suppression-flow">Flow id</label>
                <input
                  id="field-suppression-flow"
                  value={suppressionForm.flowId}
                  onChange={(event) => setSuppressionForm((current) => ({ ...current, flowId: event.target.value }))}
                  placeholder="mflw_..."
                  disabled={!canMailSuppressionWrite || addSuppression.isPending}
                />
              </div>
            )}
            {suppressionForm.scope === 'template' && (
              <div className="field">
                <label htmlFor="field-suppression-template">Template id</label>
                <input
                  id="field-suppression-template"
                  value={suppressionForm.templateId}
                  onChange={(event) => setSuppressionForm((current) => ({ ...current, templateId: event.target.value }))}
                  placeholder="etpl_..."
                  disabled={!canMailSuppressionWrite || addSuppression.isPending}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="field-suppression-reason">Reason</label>
              <input
                id="field-suppression-reason"
                value={suppressionForm.reason}
                onChange={(event) => setSuppressionForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="manual"
                disabled={!canMailSuppressionWrite || addSuppression.isPending}
              />
            </div>
            <div className="field">
              <label htmlFor="field-suppression-expires">Expires</label>
              <input
                id="field-suppression-expires"
                type="datetime-local"
                value={suppressionForm.expiresAt}
                onChange={(event) => setSuppressionForm((current) => ({ ...current, expiresAt: event.target.value }))}
                disabled={!canMailSuppressionWrite || addSuppression.isPending}
              />
            </div>
            <button type="submit" className="btn" disabled={!canMailSuppressionWrite || addSuppression.isPending}>
              <ShieldOff size={14} /> Suppress
            </button>
          </form>
          {suppressionError && <div className="error-state" style={{ marginTop: 10 }}>{suppressionError}</div>}
          {suppression.isLoading && <StateBlock title="Loading suppressed recipients" body="Reading the active suppression list from the API." />}
          {suppression.isError && (
            <StateBlock
              title="Could not load suppressed recipients"
              body={apiErrorMessage(suppression.error)}
              action={<button type="button" className="btn" onClick={() => suppression.refetch()}><RefreshCw size={14} /> Retry</button>}
            />
          )}
          {suppression.isSuccess && suppression.data.length === 0 && (
            <StateBlock title="No suppressed recipients" body="Marketing sends are not blocked by a manual suppression yet." />
          )}
          {suppression.isSuccess && suppression.data.length > 0 && (
            <div className="row-stack" style={{ marginTop: 12 }}>
              {suppression.data.slice(0, 6).map((row) => (
                <div key={row.id} className="modal-section" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <strong>{row.contact.email}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>{suppressionScopeLabel(row)}{row.expiresAt ? ` - expires ${fmtDate(row.expiresAt)}` : ''}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{row.reason} · {fmtDate(row.createdAt)}</div>
                    </div>
                    <button type="button" className="btn ghost" disabled={!canMailSuppressionWrite || unsuppressMail.isPending} onClick={() => unsuppressMail.mutate(row.id)}>
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section" id="system-mail-recovery">
          <h3>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArchiveX size={14} /> Delivery recovery</span>
            <span className="meta">{deliveryRecovery.data?.length ?? 0} pending</span>
          </h3>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 12 }}>
            Failed mail deliveries land here with the reason and can be retried or discarded deliberately.
          </p>
          {deliveryRecovery.isLoading && <StateBlock title="Loading recovery items" body="Reading failed delivery recovery items from the API." />}
          {deliveryRecovery.isError && (
            <StateBlock
              title="Could not load delivery recovery"
              body={apiErrorMessage(deliveryRecovery.error)}
              action={<button type="button" className="btn" onClick={() => deliveryRecovery.refetch()}><RefreshCw size={14} /> Retry</button>}
            />
          )}
          {deliveryRecovery.isSuccess && deliveryRecovery.data.length === 0 && (
            <StateBlock title="No failed deliveries need action" body="The recovery queue is empty." />
          )}
          {deliveryRecovery.isSuccess && deliveryRecovery.data.length > 0 && (
            <div className="row-stack">
              {deliveryRecovery.data.slice(0, 6).map((row) => (
                <div key={row.id} className="modal-section" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <strong>{row.recipientEmail}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>{row.eventKey} · {fmtDate(row.createdAt)}</div>
                      {row.errorMessage && <div className="error-state" style={{ marginTop: 6 }}>{row.errorMessage}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <button type="button" className="btn" disabled={!canMailDeliveryRetry || retryRecovery.isPending} onClick={() => retryRecovery.mutate(row.id)}>
                        Retry
                      </button>
                      <button type="button" className="btn ghost" disabled={!canMailDeliveryRetry || discardRecovery.isPending} onClick={() => discardRecovery.mutate(row.id)}>
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="section" id="system-mail-send-controls" style={{ marginBottom: 16 }}>
        <h3>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SlidersHorizontal size={14} /> Send controls and audit</span>
          <span className="meta">critical transactional mail is locked on</span>
        </h3>
        {mailSettings.isLoading && <StateBlock title="Loading send controls" body="Reading tenant mail settings from the API." />}
        {mailSettings.isError && (
          <StateBlock
            title="Could not load send controls"
            body={apiErrorMessage(mailSettings.error)}
            action={<button type="button" className="btn" onClick={() => mailSettings.refetch()}><RefreshCw size={14} /> Retry</button>}
          />
        )}
        {mailSettings.isSuccess && (
          <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, .9fr) minmax(0, 1.1fr)' }}>
            <div className="row-stack">
              <DetailLine label="Provider mode" value={providerModeLabel(mailSettings.data.settings.providerMode)} />
              <DetailLine label="System mail" value={mailSettings.data.settings.categorySystem.enabled ? 'Enabled' : 'Disabled'} />
              <DetailLine label="Account mail" value={mailSettings.data.settings.categoryB2b.enabled ? 'Enabled' : 'Disabled'} />
              <DetailLine label="Marketing mail" value={mailSettings.data.settings.categoryMarketing.enabled ? 'Enabled' : 'Disabled'} />
              <DetailLine label="Quiet hours" value={`${mailSettings.data.settings.categoryMarketing.quietHours.startHHMM} - ${mailSettings.data.settings.categoryMarketing.quietHours.endHHMM}`} />
              <DetailLine label="Frequency cap" value={`${mailSettings.data.settings.categoryMarketing.frequencyCaps.perDay}/day, ${mailSettings.data.settings.categoryMarketing.frequencyCaps.perWeek}/week`} />
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Provider send mode</span>
                <select
                  value={mailSettings.data.settings.providerMode}
                  disabled={!canMailSettingsWrite || updateProviderMode.isPending}
                  onChange={(event) => updateProviderMode.mutate(event.target.value as MailCenterSettings['providerMode'])}
                >
                  <option value="disabled">Disabled proof only</option>
                  <option value="test">Test messages only</option>
                  <option value="live">Live delivery enabled</option>
                </select>
                <span className="hint">{providerModeHint(mailSettings.data.settings.providerMode)}</span>
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={!canMailSettingsWrite || toggleMarketingSends.isPending}
                  onClick={() => toggleMarketingSends.mutate(!mailSettings.data.settings.categoryMarketing.enabled)}
                >
                  {mailSettings.data.settings.categoryMarketing.enabled ? 'Pause marketing mail' : 'Enable marketing mail'}
                </button>
                <button type="button" className="btn ghost" disabled={!canMailSettingsWrite || resetMailSettings.isPending} onClick={() => resetMailSettings.mutate()}>
                  Reset to defaults
                </button>
              </div>
            </div>
            <div>
              <div className="config-section-label">Recent settings changes</div>
              {settingsAudit.isLoading && <div className="muted">Loading audit trail...</div>}
              {settingsAudit.isError && <div className="error-state">{apiErrorMessage(settingsAudit.error)}</div>}
              {settingsAudit.isSuccess && settingsAudit.data.length === 0 && <div className="muted">No settings changes recorded yet.</div>}
              {settingsAudit.isSuccess && settingsAudit.data.length > 0 && (
                <div className="row-stack">
                  {settingsAudit.data.map((row) => (
                    <div key={row.id} className="modal-section" style={{ padding: 10 }}>
                      <strong>{row.category} · {row.field}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>{fmtDate(row.changedAt)} · {row.changedBy}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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
            <div className="orders-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10 }}>
              <div className="muted">
                {t('system_mail.delivery_log_showing', {
                  count: rows.length,
                  total: deliveryMeta.count,
                })}
              </div>
              <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
                <label className="field" style={{ margin: 0, minWidth: 120 }}>
                  <span>{t('system_mail.delivery_page_size')}</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value) as (typeof DELIVERY_PAGE_SIZES)[number])}
                  >
                    {DELIVERY_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn" disabled={cursorStack.length === 0 || deliveries.isFetching} onClick={goPreviousDeliveryPage}>
                  {t('common.previous')}
                </button>
                <button type="button" className="btn" disabled={!deliveryMeta.nextCursor || deliveries.isFetching} onClick={goNextDeliveryPage}>
                  {t('common.next')}
                </button>
              </div>
            </div>
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
                {canMailDeliveryRetry && selected.status !== 'sent' && (
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

function ProviderEventCard({ event }: { event: MailProviderEventDto }) {
  const matched = event.proof.matchedDelivery;
  return (
    <div className="modal-section" style={{ padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div>
          <strong>{event.eventType}</strong>
          <div className="muted" style={{ fontSize: 11 }}>
            {event.recipientEmail ?? 'No recipient'} - {fmtDate(event.receivedAt)}
          </div>
        </div>
        <span className={`pill ${matched ? 'success' : 'warn'}`}>
          {matched ? 'matched delivery' : 'stored unmatched'}
        </span>
      </div>
      <div className="row-stack">
        <DetailLine label="Provider event" value={event.providerEventId} />
        <DetailLine label="Provider message" value={event.providerMessageId ?? '-'} />
        <DetailLine label="Delivery" value={event.delivery?.id ?? event.deliveryId ?? '-'} />
        <DetailLine label="Processed" value={fmtDate(event.processedAt)} />
        {event.ignoredReason ? <DetailLine label="Ignored reason" value={event.ignoredReason} /> : null}
        <DetailLine label="Payload keys" value={event.proof.storedPayloadKeys.length > 0 ? event.proof.storedPayloadKeys.join(', ') : '-'} />
      </div>
    </div>
  );
}

function statusTone(status: MailStatus) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'skipped') return 'info';
  return 'warn';
}

function healthTone(status: MailProviderHealthResponse['status']) {
  if (status === 'ok') return 'success';
  if (status === 'missing_credentials') return 'warn';
  if (status === 'network_error') return 'warn';
  return 'danger';
}

function providerModeLabel(mode: MailCenterSettings['providerMode']) {
  if (mode === 'live') return 'Live delivery enabled';
  if (mode === 'test') return 'Test messages only';
  return 'Disabled proof only';
}

function providerModeHint(mode: MailCenterSettings['providerMode']) {
  if (mode === 'live') return 'Allowed mail can contact recipients after category and critical-event checks pass.';
  if (mode === 'test') return 'Only explicit System Mail test messages can contact recipients; other deliveries become proof-only records.';
  return 'No customer email is sent. The system records proof-only delivery rows.';
}

function formatHealthCounts(values: Record<string, number>) {
  const rows = Object.entries(values).filter(([, value]) => value > 0);
  if (rows.length === 0) return 'No records';
  return rows.map(([key, value]) => `${key}: ${value}`).join(' - ');
}

function suppressionScopeLabel(row: MailSuppressionRow) {
  if (row.scope === 'category') return `Category: ${row.category || 'marketing'}`;
  if (row.scope === 'campaign') return `Campaign: ${row.campaignId || 'not selected'}`;
  if (row.scope === 'flow') return `Flow: ${row.flowId || 'not selected'}`;
  if (row.scope === 'template') return `Template: ${row.templateId || 'not selected'}`;
  return 'All email';
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
