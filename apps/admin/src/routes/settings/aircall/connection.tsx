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
        <div className="webhook-warning">
          <AlertTriangle size={14} />
          <span data-i18n-key="aircall_hub.connection.runtime_disabled_body">{t('aircall_hub.connection.runtime_disabled_body')}</span>
        </div>
        <div className="webhook-actions">
          <button id="btn-test-ping" type="button" className="btn" disabled>
            <CheckCircle2 size={13} /> {t('aircall_hub.connection.test_ping')}
          </button>
          <button id="btn-start-backfill" type="button" className="save-btn" disabled>
            <Save size={13} /> {t('aircall_hub.connection.start_backfill')}
          </button>
        </div>
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

export const Route = createFileRoute('/settings/aircall/connection')({ component: ConnectionView });
