import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';
import { aircallTenantConfigQueryKey, fetchAircallTenantConfig, hasAircallCredentials } from '@/features/integrations/aircallTenantConfig';

function WebhooksTabView() {
  const { t } = useTranslation();
  const config = useQuery({
    queryKey: aircallTenantConfigQueryKey,
    queryFn: fetchAircallTenantConfig,
  });
  const ready = hasAircallCredentials(config.data);

  return (
    <section className="config-card" id="aircall-webhook-status">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 data-i18n-key="aircall_hub.webhooks_tab.title">{t('aircall_hub.webhooks_tab.title')}</h3>
          <div className="sub" data-i18n-key="aircall_hub.webhooks_tab.sub">{t('aircall_hub.webhooks_tab.sub')}</div>
        </div>
        <button id="btn-webhook-refresh" type="button" className="btn ghost" onClick={() => config.refetch()} disabled={config.isFetching}>
          <RefreshCw size={13} /> {t('aircall_hub.webhooks_tab.refresh')}
        </button>
      </div>

      {config.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.webhooks_tab.loading_body')} />}
      {config.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(config.error)}
          action={<button type="button" className="btn" onClick={() => config.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
        />
      )}
      {config.data && (
        <>
          <div className="field-row-2">
            <CredentialCell label={t('aircall_hub.webhooks_tab.api_credentials')} ok={config.data.hasAircallApiId && config.data.hasAircallApiToken} />
            <CredentialCell label={t('aircall_hub.webhooks_tab.webhook_secret')} ok={config.data.hasAircallWebhookSecret} />
          </div>
          <div className="field-row-2">
            <div className="seg-stat">
              <div className="label" data-i18n-key="aircall_hub.webhooks_tab.status">{t('aircall_hub.webhooks_tab.status')}</div>
              <div className="val" style={{ fontSize: 14 }}>
                {ready
                  ? <span className="pill warn dot" data-i18n-key="aircall_hub.webhooks_tab.pending_registration">{t('aircall_hub.webhooks_tab.pending_registration')}</span>
                  : <span className="pill warn dot" data-i18n-key="aircall_hub.webhooks_tab.inactive">{t('aircall_hub.webhooks_tab.inactive')}</span>}
              </div>
            </div>
            <div className="seg-stat">
              <div className="label" data-i18n-key="aircall_hub.webhooks_tab.last_event">{t('aircall_hub.webhooks_tab.last_event')}</div>
              <div className="val" style={{ fontSize: 14 }}>-</div>
            </div>
          </div>
          <div className="webhook-warning" style={{ marginTop: 14, marginBottom: 0 }}>
            <AlertTriangle size={14} />
            <span data-i18n-key={ready ? 'aircall_hub.webhooks_tab.pending_body' : 'aircall_hub.webhooks_tab.credentials_required_body'}>
              {ready ? t('aircall_hub.webhooks_tab.pending_body') : t('aircall_hub.webhooks_tab.credentials_required_body')}
            </span>
          </div>
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

export const Route = createFileRoute('/settings/aircall/webhooks')({ component: WebhooksTabView });
