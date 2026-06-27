import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Save, Store, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

const TENANT_CONFIG_QUERY_KEY = ['identity', 'tenant-config'] as const;
const SHOPIFY_SYNC_QUERY_KEY = ['shopify', 'sync-status'] as const;
const RESOURCES = ['customers', 'products', 'orders'] as const;

interface TenantConfigResponse {
  shopifyDomain: string | null;
  hasShopifyAdminToken: boolean;
  hasShopifyApiKey: boolean;
  hasShopifyApiSecret: boolean;
  hasWebhookHmacKey: boolean;
}

interface ShopifyCredentialForm {
  shopifyDomain: string;
  shopifyAdminToken: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
  webhookHmacKey: string;
}

function ShopifySettingsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canSaveSettings = useCan('settings.write');
  const canTriggerSync = useCan('sync.trigger');
  const [form, setForm] = useState<ShopifyCredentialForm>({
    shopifyDomain: '',
    shopifyAdminToken: '',
    shopifyApiKey: '',
    shopifyApiSecret: '',
    webhookHmacKey: '',
  });

  const config = useQuery({
    queryKey: TENANT_CONFIG_QUERY_KEY,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
  });
  const status = useQuery({
    queryKey: SHOPIFY_SYNC_QUERY_KEY,
    queryFn: () => adminApi.shopifySyncStatus(),
    refetchInterval: (query) => query.state.data?.isAnySyncing ? 5000 : false,
  });

  const saveCredentials = useMutation({
    mutationFn: () => adminApi.updateTenantConfig({
      shopifyDomain: trimOrUndefined(form.shopifyDomain),
      shopifyAdminToken: trimOrUndefined(form.shopifyAdminToken),
      shopifyApiKey: trimOrUndefined(form.shopifyApiKey),
      shopifyApiSecret: trimOrUndefined(form.shopifyApiSecret),
      webhookHmacKey: trimOrUndefined(form.webhookHmacKey),
    }),
    onSuccess: () => {
      setForm({ shopifyDomain: '', shopifyAdminToken: '', shopifyApiKey: '', shopifyApiSecret: '', webhookHmacKey: '' });
      qc.invalidateQueries({ queryKey: TENANT_CONFIG_QUERY_KEY });
      qc.invalidateQueries({ queryKey: SHOPIFY_SYNC_QUERY_KEY });
      toast.success(t('settings.shopify.credentials_saved'));
    },
    onError: (error) => toast.error(t('settings.shopify.credentials_failed'), { description: apiErrorMessage(error) }),
  });

  const initialSync = useMutation({
    mutationFn: () => adminApi.triggerShopifyInitialSync({ resources: [...RESOURCES] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHOPIFY_SYNC_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(t('settings.shopify.initial_sync_started'));
    },
    onError: (error) => toast.error(t('settings.shopify.initial_sync_failed'), { description: apiErrorMessage(error) }),
  });

  const credentialMissing = config.data
    ? !config.data.shopifyDomain || !config.data.hasShopifyAdminToken
    : true;
  const statusRows = status.data ? RESOURCES.map((resource) => status.data.entities[resource]) : [];

  return (
    <div className="integration-page" id="shopify-settings-page">
      <section className="webhook-card" id="shopify-credential-status">
        <div className="head">
          <div>
            <div className="label" data-i18n-key="settings.shopify.label">{t('settings.shopify.label')}</div>
            <h3 data-i18n-key="settings.shopify.title">{t('settings.shopify.title')}</h3>
            <div className="sub" data-i18n-key="settings.shopify.subtitle">{t('settings.shopify.subtitle')}</div>
          </div>
          <button type="button" className="btn ghost" onClick={() => { config.refetch(); status.refetch(); }} disabled={config.isFetching || status.isFetching}>
            <RefreshCw size={13} /> {t('common.refresh')}
          </button>
        </div>

        {config.isLoading && <StateBlock title={t('common.loading')} body={t('settings.shopify.loading_body')} />}
        {config.isError && (
          <StateBlock
            title={t('settings.shopify.error_title')}
            body={apiErrorMessage(config.error)}
            action={<button type="button" className="btn" onClick={() => config.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {config.data && (
          <>
            <div className="webhook-grid">
              <CredentialStatus label={t('settings.shopify.domain')} ok={Boolean(config.data.shopifyDomain)} value={config.data.shopifyDomain ?? t('settings.shopify.missing')} />
              <CredentialStatus label={t('settings.shopify.admin_token')} ok={config.data.hasShopifyAdminToken} value={config.data.hasShopifyAdminToken ? t('settings.shopify.saved') : t('settings.shopify.missing')} />
              <CredentialStatus label={t('settings.shopify.api_key')} ok={config.data.hasShopifyApiKey} value={config.data.hasShopifyApiKey ? t('settings.shopify.saved') : t('settings.shopify.optional_missing')} />
              <CredentialStatus label={t('settings.shopify.api_secret')} ok={config.data.hasShopifyApiSecret} value={config.data.hasShopifyApiSecret ? t('settings.shopify.saved') : t('settings.shopify.optional_missing')} />
              <CredentialStatus label={t('settings.shopify.webhook_hmac')} ok={config.data.hasWebhookHmacKey} value={config.data.hasWebhookHmacKey ? t('settings.shopify.saved') : t('settings.shopify.optional_missing')} />
            </div>
            {credentialMissing && (
              <div className="webhook-warning">
                <AlertTriangle size={14} />
                <span data-i18n-key="settings.shopify.credentials_required_body">{t('settings.shopify.credentials_required_body')}</span>
              </div>
            )}
          </>
        )}
      </section>

      <section className="config-card" id="shopify-credentials-form">
        <h3 data-i18n-key="settings.shopify.credentials_title">{t('settings.shopify.credentials_title')}</h3>
        <div className="sub" data-i18n-key="settings.shopify.credentials_sub">{t('settings.shopify.credentials_sub')}</div>
        <div className="field-row-2">
          <Field id="field-shopify-domain" label={t('settings.shopify.domain')} value={form.shopifyDomain} onChange={(value) => setField(setForm, 'shopifyDomain', value)} placeholder={config.data?.shopifyDomain ?? 'your-store.myshopify.com'} disabled={!canSaveSettings || saveCredentials.isPending} icon={<Store size={11} />} />
          <Field id="field-shopify-admin-token" label={t('settings.shopify.admin_token')} value={form.shopifyAdminToken} onChange={(value) => setField(setForm, 'shopifyAdminToken', value)} placeholder="shpat_..." disabled={!canSaveSettings || saveCredentials.isPending} secret />
        </div>
        <div className="field-row-2">
          <Field id="field-shopify-api-key" label={t('settings.shopify.api_key')} value={form.shopifyApiKey} onChange={(value) => setField(setForm, 'shopifyApiKey', value)} placeholder={t('settings.shopify.blank_keeps_existing')} disabled={!canSaveSettings || saveCredentials.isPending} secret />
          <Field id="field-shopify-api-secret" label={t('settings.shopify.api_secret')} value={form.shopifyApiSecret} onChange={(value) => setField(setForm, 'shopifyApiSecret', value)} placeholder={t('settings.shopify.blank_keeps_existing')} disabled={!canSaveSettings || saveCredentials.isPending} secret />
        </div>
        <div className="field-row-2">
          <Field id="field-shopify-webhook-hmac" label={t('settings.shopify.webhook_hmac')} value={form.webhookHmacKey} onChange={(value) => setField(setForm, 'webhookHmacKey', value)} placeholder={t('settings.shopify.blank_keeps_existing')} disabled={!canSaveSettings || saveCredentials.isPending} secret />
          <div className="field">
            <label data-i18n-key="settings.shopify.blank_keeps_existing">{t('settings.shopify.blank_keeps_existing')}</label>
            <button
              id="btn-save-shopify-credentials"
              type="button"
              className="save-btn"
              style={{ height: 40, justifyContent: 'center' }}
              disabled={!canSaveSettings || saveCredentials.isPending || !hasCredentialInput(form)}
              onClick={() => saveCredentials.mutate()}
            >
              <Save size={13} /> {saveCredentials.isPending ? t('settings.shopify.saving_credentials') : t('common.save')}
            </button>
          </div>
        </div>
        {!canSaveSettings && <div className="form-error">{t('settings.shopify.no_settings_permission')}</div>}
      </section>

      <section className="config-card" id="shopify-sync-status">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 data-i18n-key="settings.shopify.sync_title">{t('settings.shopify.sync_title')}</h3>
            <div className="sub" data-i18n-key="settings.shopify.sync_sub">{t('settings.shopify.sync_sub')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => status.refetch()} disabled={status.isFetching}>
              <RefreshCw size={13} /> {t('common.refresh')}
            </button>
            <button
              id="btn-shopify-initial-sync"
              type="button"
              className="btn primary"
              onClick={() => initialSync.mutate()}
              disabled={!canTriggerSync || initialSync.isPending || status.data?.credentialRequired || status.data?.isAnySyncing}
            >
              <Database size={13} /> {initialSync.isPending ? t('settings.shopify.syncing') : t('settings.shopify.initial_sync')}
            </button>
          </div>
        </div>

        {status.isLoading && <StateBlock title={t('common.loading')} body={t('settings.shopify.sync_loading_body')} />}
        {status.isError && (
          <StateBlock
            title={t('settings.shopify.sync_error_title')}
            body={apiErrorMessage(status.error)}
            action={<button type="button" className="btn" onClick={() => status.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {initialSync.isError && <div className="form-error" style={{ marginBottom: 12 }}>{apiErrorMessage(initialSync.error)}</div>}
        {status.isSuccess && status.data.credentialRequired && (
          <StateBlock
            title={t('settings.shopify.credentials_required_title')}
            body={t('settings.shopify.credentials_required_body')}
            icon={<AlertTriangle size={18} color="var(--warn)" />}
          />
        )}
        {status.isSuccess && !status.data.credentialRequired && statusRows.every((row) => row.snapshotRecords === 0 && row.status === 'idle') && (
          <StateBlock
            title={t('settings.shopify.empty_title')}
            body={t('settings.shopify.empty_body')}
          />
        )}
        {status.isSuccess && !status.data.credentialRequired && !statusRows.every((row) => row.snapshotRecords === 0 && row.status === 'idle') && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('settings.shopify.col_resource')}</th>
                  <th>{t('settings.shopify.col_status')}</th>
                  <th>{t('settings.shopify.col_snapshot')}</th>
                  <th>{t('settings.shopify.col_last_run')}</th>
                  <th>{t('settings.shopify.col_failures')}</th>
                  <th>{t('settings.shopify.col_last_completed')}</th>
                  <th>{t('settings.shopify.col_error')}</th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map((row) => (
                  <tr key={row.resource}>
                    <td>{t(`settings.shopify.resource_${row.resource}`)}</td>
                    <td><span className={`pill ${row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : row.isRunning ? 'warn' : ''}`}>{row.status}</span></td>
                    <td>{row.snapshotRecords}</td>
                    <td>{row.lastRunRecords}</td>
                    <td>{row.consecutiveFailures}</td>
                    <td>{formatDate(row.lastCompletedAt)}</td>
                    <td>{row.lastError ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CredentialStatus({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {ok ? <CheckCircle2 size={14} color="var(--success)" /> : <XCircle size={14} color="var(--danger)" />}
        {value}
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder, disabled, secret, icon }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  secret?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{icon} {label}</label>
      <input
        id={id}
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={secret ? 'new-password' : 'off'}
      />
    </div>
  );
}

function StateBlock({ title, body, action, icon }: { title: string; body: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      {icon && <div style={{ marginBottom: 10 }}>{icon}</div>}
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function trimOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasCredentialInput(form: ShopifyCredentialForm) {
  return Object.values(form).some((value) => value.trim().length > 0);
}

function setField(fieldSetter: Dispatch<SetStateAction<ShopifyCredentialForm>>, field: keyof ShopifyCredentialForm, value: string) {
  fieldSetter((current) => ({ ...current, [field]: value }));
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/shopify')({ component: ShopifySettingsView });
