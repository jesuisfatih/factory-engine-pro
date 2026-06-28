import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Key, RefreshCw, Save, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

const TENANT_CONFIG_QUERY_KEY = ['identity', 'tenant-config'] as const;

interface TenantConfigResponse {
  hasAircallApiId: boolean;
  hasAircallApiToken: boolean;
  hasAircallWebhookSecret: boolean;
}

interface CredentialForm {
  aircallApiId: string;
  aircallApiToken: string;
  aircallWebhookSecret: string;
}

function trimOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasCredentialInput(form: CredentialForm) {
  return Boolean(form.aircallApiId.trim() || form.aircallApiToken.trim() || form.aircallWebhookSecret.trim());
}

function ConnectionView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('settings.write');
  const canSyncDirectory = useCan('aircall.users.write');
  const [form, setForm] = useState<CredentialForm>({
    aircallApiId: '',
    aircallApiToken: '',
    aircallWebhookSecret: '',
  });

  const config = useQuery({
    queryKey: TENANT_CONFIG_QUERY_KEY,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
  });

  const saveCredentials = useMutation({
    mutationFn: () => adminApi.updateTenantConfig({
      aircallApiId: trimOrUndefined(form.aircallApiId),
      aircallApiToken: trimOrUndefined(form.aircallApiToken),
      aircallWebhookSecret: trimOrUndefined(form.aircallWebhookSecret),
    }),
    onSuccess: () => {
      setForm({ aircallApiId: '', aircallApiToken: '', aircallWebhookSecret: '' });
      qc.invalidateQueries({ queryKey: TENANT_CONFIG_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['aircall', 'users'] });
      toast.success(t('aircall_hub.connection.credentials_saved'));
    },
    onError: (error) => toast.error(t('aircall_hub.connection.credentials_save_failed'), { description: apiErrorMessage(error) }),
  });

  const testConnection = useMutation({
    mutationFn: () => adminApi.testAircallConnection(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t('aircall_hub.connection.connection_test_ok'));
      } else {
        toast.error(t('aircall_hub.connection.connection_test_failed'), { description: result.error ?? result.status });
      }
    },
    onError: (error) => toast.error(t('aircall_hub.connection.connection_test_failed'), { description: apiErrorMessage(error) }),
  });

  const callEvents = useQuery({
    queryKey: ['aircall', 'calls'],
    queryFn: () => adminApi.aircallCallEvents(),
  });

  const refreshDirectory = useMutation({
    mutationFn: async () => {
      const [users, numbers] = await Promise.all([
        adminApi.syncAircallUsers(),
        adminApi.syncAircallNumbers(),
      ]);
      return { users, numbers };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aircall', 'users'] });
      qc.invalidateQueries({ queryKey: ['aircall', 'numbers'] });
      qc.invalidateQueries({ queryKey: ['aircall', 'sync-logs'] });
      toast.success(t('aircall_hub.connection.directory_refresh_ok'));
    },
    onError: (error) => toast.error(t('aircall_hub.connection.directory_refresh_failed'), { description: apiErrorMessage(error) }),
  });

  const backfillRecent = useMutation({
    mutationFn: () => adminApi.backfillRecentAircallCalls({ recentDays: 3, maxPages: 20 }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['aircall', 'calls'] });
      qc.invalidateQueries({ queryKey: ['aircall', 'sync-logs'] });
      toast.success(t('aircall_hub.connection.backfill_recent_ok'), {
        description: t('aircall_hub.connection.backfill_recent_ok_body', {
          ingested: result.ingested,
          fetched: result.fetched,
          transcripts: result.transcriptsFound,
        }),
      });
    },
    onError: (error) => toast.error(t('aircall_hub.connection.backfill_recent_failed'), { description: apiErrorMessage(error) }),
  });

  const setField = (field: keyof CredentialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const missingCredentials = config.data
    ? !config.data.hasAircallApiId || !config.data.hasAircallApiToken || !config.data.hasAircallWebhookSecret
    : true;

  return (
    <>
      <section className="webhook-card" id="aircall-credential-status">
        <div className="head">
          <div>
            <h3 data-i18n-key="aircall_hub.connection.credential_status_title">{t('aircall_hub.connection.credential_status_title')}</h3>
            <div className="sub" data-i18n-key="aircall_hub.connection.credential_status_sub">{t('aircall_hub.connection.credential_status_sub')}</div>
          </div>
          <button type="button" className="btn" onClick={() => config.refetch()} disabled={config.isFetching}>
            <RefreshCw size={13} /> {t('common.retry')}
          </button>
        </div>

        {config.isLoading && (
          <div className="empty-state small" data-i18n-key="aircall_hub.connection.loading_credentials">
            {t('aircall_hub.connection.loading_credentials')}
          </div>
        )}

        {config.isError && (
          <div className="error-state">
            <strong data-i18n-key="aircall_hub.connection.credentials_load_failed">{t('aircall_hub.connection.credentials_load_failed')}</strong>
            <p>{apiErrorMessage(config.error)}</p>
          </div>
        )}

        {config.data && (
          <>
            <div className="webhook-grid">
              <CredentialStatus
                label={t('aircall_hub.connection.api_id')}
                ok={config.data.hasAircallApiId}
                okText={t('aircall_hub.connection.api_id_saved')}
                missingText={t('aircall_hub.connection.api_id_missing')}
              />
              <CredentialStatus
                label={t('aircall_hub.connection.api_token')}
                ok={config.data.hasAircallApiToken}
                okText={t('aircall_hub.connection.api_token_saved')}
                missingText={t('aircall_hub.connection.api_token_missing')}
              />
              <CredentialStatus
                label={t('aircall_hub.connection.webhook_secret')}
                ok={config.data.hasAircallWebhookSecret}
                okText={t('aircall_hub.connection.webhook_secret_saved')}
                missingText={t('aircall_hub.connection.webhook_secret_missing')}
              />
            </div>

            {missingCredentials && (
              <div className="webhook-warning">
                <AlertTriangle size={14} />
                <span data-i18n-key="aircall_hub.connection.credentials_missing_warning">{t('aircall_hub.connection.credentials_missing_warning')}</span>
              </div>
            )}
          </>
        )}
      </section>

      <section className="config-card" id="aircall-credentials">
        <h3 data-i18n-key="aircall_hub.connection.credentials_title">{t('aircall_hub.connection.credentials_title')}</h3>
        <div className="sub" data-i18n-key="aircall_hub.connection.credentials_sub">{t('aircall_hub.connection.credentials_sub')}</div>

        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-aircall-api-id" data-i18n-key="aircall_hub.connection.api_id">
              <Key size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.api_id')}
            </label>
            <input
              id="field-aircall-api-id"
              value={form.aircallApiId}
              onChange={(event) => setField('aircallApiId', event.target.value)}
              placeholder={t('aircall_hub.connection.api_id_placeholder')}
              disabled={!canWrite || saveCredentials.isPending}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="field-aircall-api-token" data-i18n-key="aircall_hub.connection.api_token">
              <Key size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.api_token')}
            </label>
            <input
              id="field-aircall-api-token"
              type="password"
              value={form.aircallApiToken}
              onChange={(event) => setField('aircallApiToken', event.target.value)}
              placeholder={t('aircall_hub.connection.secret_placeholder')}
              disabled={!canWrite || saveCredentials.isPending}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-aircall-webhook-secret" data-i18n-key="aircall_hub.connection.webhook_secret">
              <Key size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.webhook_secret')}
            </label>
            <input
              id="field-aircall-webhook-secret"
              type="password"
              value={form.aircallWebhookSecret}
              onChange={(event) => setField('aircallWebhookSecret', event.target.value)}
              placeholder={t('aircall_hub.connection.secret_placeholder')}
              disabled={!canWrite || saveCredentials.isPending}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label data-i18n-key="aircall_hub.connection.blank_keeps_existing">{t('aircall_hub.connection.blank_keeps_existing')}</label>
            <button
              id="btn-save-aircall-credentials"
              type="button"
              className="save-btn"
              style={{ height: 40, justifyContent: 'center' }}
              disabled={!canWrite || saveCredentials.isPending || !hasCredentialInput(form)}
              onClick={() => saveCredentials.mutate()}
            >
              <Save size={13} /> {t('aircall_hub.connection.save_credentials')}
            </button>
          </div>
        </div>
      </section>

      <section className="config-card" id="aircall-runtime">
        <h3 data-i18n-key="aircall_hub.connection.runtime_title">{t('aircall_hub.connection.runtime_title')}</h3>
        <div className="sub" data-i18n-key="aircall_hub.connection.runtime_sub">{t('aircall_hub.connection.runtime_sub')}</div>
        {missingCredentials ? (
          <div className="webhook-warning">
            <AlertTriangle size={14} />
            <span data-i18n-key="aircall_hub.connection.runtime_missing_body">{t('aircall_hub.connection.runtime_missing_body')}</span>
          </div>
        ) : (
          <div className="webhook-warning">
            <CheckCircle2 size={14} />
            <span data-i18n-key="aircall_hub.connection.runtime_ready_body">{t('aircall_hub.connection.runtime_ready_body')}</span>
          </div>
        )}
        {testConnection.isError && <div className="error-state" style={{ marginTop: 12 }}>{apiErrorMessage(testConnection.error)}</div>}
        {testConnection.data && (
          <div className="webhook-grid" style={{ marginTop: 12 }}>
            <CredentialStatus
              label={t('aircall_hub.connection.connection_status')}
              ok={testConnection.data.ok}
              okText={t('aircall_hub.connection.connection_status_ok')}
              missingText={testConnection.data.error ?? t('aircall_hub.connection.connection_status_failed')}
            />
            <RuntimeCell label={t('aircall_hub.connection.checked_at')} value={formatDate(testConnection.data.checkedAt)} />
            <RuntimeCell label={t('aircall_hub.connection.latency_ms')} value={`${testConnection.data.latencyMs}ms`} />
            <RuntimeCell label={t('aircall_hub.connection.user_probe')} value={String(testConnection.data.userProbeCount ?? '-')} />
            <RuntimeCell label={t('aircall_hub.connection.number_probe')} value={String(testConnection.data.numberProbeCount ?? '-')} />
            <RuntimeCell label={t('aircall_hub.connection.webhook_url')} value={testConnection.data.webhookUrl ?? '-'} />
          </div>
        )}
        <div className="webhook-actions">
          <button
            id="btn-test-ping"
            type="button"
            className="btn"
            disabled={missingCredentials || testConnection.isPending || config.isLoading}
            onClick={() => testConnection.mutate()}
          >
            <CheckCircle2 size={13} /> {testConnection.isPending ? t('aircall_hub.connection.testing_connection') : t('aircall_hub.connection.test_ping')}
          </button>
          <button
            id="btn-refresh-aircall-directory"
            type="button"
            className="save-btn"
            disabled={missingCredentials || !canSyncDirectory || refreshDirectory.isPending || config.isLoading}
            onClick={() => refreshDirectory.mutate()}
          >
            <Save size={13} /> {refreshDirectory.isPending ? t('aircall_hub.connection.directory_refreshing') : t('aircall_hub.connection.directory_refresh')}
          </button>
          <button
            id="btn-backfill-aircall-recent"
            type="button"
            className="btn primary"
            disabled={missingCredentials || !canSyncDirectory || backfillRecent.isPending || config.isLoading}
            onClick={() => backfillRecent.mutate()}
          >
            <RefreshCw size={13} /> {backfillRecent.isPending ? t('aircall_hub.connection.backfill_recent_running') : t('aircall_hub.connection.backfill_recent')}
          </button>
        </div>
        {!canSyncDirectory && <div className="form-error" style={{ marginTop: 12 }}>{t('aircall_hub.connection.no_aircall_write_permission')}</div>}
        {backfillRecent.data && (
          <div className="webhook-grid" style={{ marginTop: 12 }}>
            <RuntimeCell label={t('aircall_hub.connection.backfill_fetched')} value={String(backfillRecent.data.fetched)} />
            <RuntimeCell label={t('aircall_hub.connection.backfill_ingested')} value={String(backfillRecent.data.ingested)} />
            <RuntimeCell label={t('aircall_hub.connection.backfill_transcripts')} value={String(backfillRecent.data.transcriptsFound)} />
            <RuntimeCell label={t('aircall_hub.connection.backfill_queued')} value={String(backfillRecent.data.resolverQueued)} />
          </div>
        )}
      </section>

      <section className="config-card" id="aircall-call-events">
        <div className="head">
          <div>
            <h3 data-i18n-key="aircall_hub.connection.call_events_title">{t('aircall_hub.connection.call_events_title')}</h3>
            <div className="sub" data-i18n-key="aircall_hub.connection.call_events_sub">{t('aircall_hub.connection.call_events_sub')}</div>
          </div>
          <button type="button" className="btn" onClick={() => callEvents.refetch()} disabled={callEvents.isFetching}>
            <RefreshCw size={13} /> {t('common.retry')}
          </button>
        </div>
        {callEvents.isLoading && (
          <div className="empty-state small" data-i18n-key="aircall_hub.connection.call_events_loading">
            {t('aircall_hub.connection.call_events_loading')}
          </div>
        )}
        {callEvents.isError && (
          <div className="error-state">
            <strong data-i18n-key="aircall_hub.connection.call_events_failed">{t('aircall_hub.connection.call_events_failed')}</strong>
            <p>{apiErrorMessage(callEvents.error)}</p>
          </div>
        )}
        {callEvents.data && (
          <>
            <div className="webhook-grid">
              <RuntimeCell label={t('aircall_hub.connection.calls_total')} value={String(callEvents.data.stats.total)} />
              <RuntimeCell label={t('aircall_hub.connection.calls_last_3d')} value={String(callEvents.data.stats.last3d)} />
              <RuntimeCell label={t('aircall_hub.connection.calls_with_transcript')} value={String(callEvents.data.stats.withTranscript)} />
              <RuntimeCell label={t('aircall_hub.connection.calls_resolver_queued')} value={String(callEvents.data.stats.resolverQueued)} />
              <RuntimeCell label={t('aircall_hub.connection.calls_resolver_succeeded')} value={String(callEvents.data.stats.resolverSucceeded)} />
              <RuntimeCell label={t('aircall_hub.connection.calls_resolver_failed')} value={String(callEvents.data.stats.resolverFailed)} />
              <RuntimeCell label={t('aircall_hub.connection.calls_last_received')} value={formatDate(callEvents.data.stats.lastReceivedAt)} />
            </div>
            {callEvents.data.calls.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 12 }}>
                <strong>{t('aircall_hub.connection.call_events_empty_title')}</strong>
                <p>{t('aircall_hub.connection.call_events_empty_body')}</p>
              </div>
            ) : (
              <table className="data-table" id="aircall-call-events-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>{t('aircall_hub.connection.col_call')}</th>
                    <th>{t('aircall_hub.connection.col_when')}</th>
                    <th>{t('aircall_hub.connection.col_contact')}</th>
                    <th>{t('aircall_hub.connection.col_transcript')}</th>
                    <th>{t('aircall_hub.connection.col_queue')}</th>
                    <th>{t('aircall_hub.connection.col_resolver')}</th>
                  </tr>
                </thead>
                <tbody>
                  {callEvents.data.calls.slice(0, 12).map((call) => (
                    <tr key={call.id}>
                      <td>
                        <strong>{call.externalCallId}</strong>
                        <div className="muted">{call.eventType} / {call.direction ?? '-'}</div>
                      </td>
                      <td>{formatDate(call.eventTimestamp)}</td>
                      <td>
                        <div>{call.contactEmail ?? call.contactPhone ?? '-'}</div>
                        <div className="muted">{call.aircallUserId ?? '-'}</div>
                      </td>
                      <td>
                        <span className={call.transcriptPresent ? 'pill success dot' : 'pill warning dot'}>
                          {call.transcriptPresent
                            ? t('aircall_hub.connection.transcript_present', { count: call.transcriptLength })
                            : t('aircall_hub.connection.transcript_missing')}
                        </span>
                      </td>
                      <td>
                        <span className={call.resolverQueuedAt ? 'pill success dot' : 'pill warning dot'}>
                          {call.resolverQueuedAt ? formatDate(call.resolverQueuedAt) : t('aircall_hub.connection.queue_pending')}
                        </span>
                      </td>
                      <td>
                        <span className={resolverPillClass(call.resolverStatus)}>
                          {resolverStatusLabel(call)}
                        </span>
                        {call.resolverError && <div className="muted">{call.resolverError.slice(0, 90)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </>
  );
}

function CredentialStatus({ label, ok, okText, missingText }: { label: string; ok: boolean; okText: string; missingText: string }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {ok ? <CheckCircle2 size={14} color="var(--success)" /> : <XCircle size={14} color="var(--danger)" />}
        {ok ? okText : missingText}
      </div>
    </div>
  );
}

function RuntimeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function resolverPillClass(status: string | null) {
  if (status === 'succeeded') return 'pill success dot';
  if (status === 'failed') return 'pill danger dot';
  return 'pill warning dot';
}

function resolverStatusLabel(call: { resolverStatus: string | null; resolvedWithVersion: number | null; resolvedAt: string | null }) {
  if (call.resolverStatus === 'succeeded') {
    return call.resolvedWithVersion ? `v${call.resolvedWithVersion} / ${formatDate(call.resolvedAt)}` : 'Resolved';
  }
  return call.resolverStatus ?? 'Not resolved';
}

export const Route = createFileRoute('/settings/aircall/connection')({ component: ConnectionView });
