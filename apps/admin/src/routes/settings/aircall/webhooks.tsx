import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { adminApi, apiErrorMessage } from '@/lib/api';

function WebhooksTabView() {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: ['aircall', 'webhooks', 'status'],
    queryFn: () => adminApi.aircallWebhookStatus(),
  });
  const data = status.data;

  return (
    <section className="config-card" id="aircall-webhook-status">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 data-i18n-key="aircall_hub.webhooks_tab.title">{t('aircall_hub.webhooks_tab.title')}</h3>
          <div className="sub" data-i18n-key="aircall_hub.webhooks_tab.sub">{t('aircall_hub.webhooks_tab.sub')}</div>
        </div>
        <button id="btn-webhook-refresh" type="button" className="btn ghost" onClick={() => status.refetch()} disabled={status.isFetching}>
          <RefreshCw size={13} /> {t('aircall_hub.webhooks_tab.refresh')}
        </button>
      </div>

      {status.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.webhooks_tab.loading_body')} />}
      {status.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(status.error)}
          action={<button type="button" className="btn" onClick={() => status.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
        />
      )}
      {data && (
        <>
          <div className="field-row-2">
            <CredentialCell label={t('aircall_hub.webhooks_tab.api_credentials')} ok={data.apiCredentialsPresent} />
            <CredentialCell label={t('aircall_hub.webhooks_tab.webhook_secret')} ok={data.webhookSecretPresent} />
          </div>
          <div className="field-row-2">
            <div className="seg-stat">
              <div className="label" data-i18n-key="aircall_hub.webhooks_tab.status">{t('aircall_hub.webhooks_tab.status')}</div>
              <div className="val" style={{ fontSize: 14 }}>
                {data.config?.active
                  ? <span className="pill success dot" data-i18n-key="aircall_hub.webhooks_tab.active">{t('aircall_hub.webhooks_tab.active')}</span>
                  : <span className="pill warn dot" data-i18n-key="aircall_hub.webhooks_tab.inactive">{t('aircall_hub.webhooks_tab.inactive')}</span>}
              </div>
            </div>
            <div className="seg-stat">
              <div className="label" data-i18n-key="aircall_hub.webhooks_tab.last_event">{t('aircall_hub.webhooks_tab.last_event')}</div>
              <div className="val" style={{ fontSize: 14 }}>{formatDate(data.config?.lastEventAt ?? data.inbox.lastReceivedAt)}</div>
            </div>
          </div>
          <div className="field-row-2">
            <div className="seg-stat">
              <div className="label" data-i18n-key="aircall_hub.webhooks_tab.webhook_url">{t('aircall_hub.webhooks_tab.webhook_url')}</div>
              <div className="val" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{data.webhookUrl ?? '-'}</div>
            </div>
            <div className="seg-stat">
              <div className="label" data-i18n-key="aircall_hub.webhooks_tab.inbox_counters">{t('aircall_hub.webhooks_tab.inbox_counters')}</div>
              <div className="val" style={{ fontSize: 14 }}>
                {t('aircall_hub.webhooks_tab.inbox_summary', data.inbox)}
              </div>
            </div>
          </div>
          {data.config?.lastFailureReason && (
            <div className="webhook-warning" style={{ marginTop: 14, marginBottom: 0 }}>
              <AlertTriangle size={14} />
              <span>{data.config.lastFailureReason}</span>
            </div>
          )}
          {data.credentialRequired && (
            <div className="webhook-warning" style={{ marginTop: 14, marginBottom: 0 }}>
              <AlertTriangle size={14} />
              <span data-i18n-key="aircall_hub.webhooks_tab.credentials_required_body">{t('aircall_hub.webhooks_tab.credentials_required_body')}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CredentialCell({ label, ok }: { label: string; ok: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="seg-stat">
      <div className="label">{label}</div>
      <div className="val" style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {ok ? <CheckCircle2 size={14} color="var(--success)" /> : <XCircle size={14} color="var(--danger)" />}
        {ok ? t('aircall_hub.webhooks_tab.saved') : t('aircall_hub.webhooks_tab.missing')}
      </div>
    </div>
  );
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/aircall/webhooks')({ component: WebhooksTabView });
