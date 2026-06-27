import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { fetchAircallWebhookStatus } from '@/lib/mock';

function WebhooksTabView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['aircall', 'webhook'], queryFn: fetchAircallWebhookStatus });

  return (
    <section className="config-card" id="aircall-webhook-status">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 data-i18n-key="aircall_hub.webhooks_tab.title">{t('aircall_hub.webhooks_tab.title')}</h3>
          <div className="sub" data-i18n-key="aircall_hub.webhooks_tab.sub">{t('aircall_hub.webhooks_tab.sub')}</div>
        </div>
        <button id="btn-webhook-refresh" type="button" className="btn ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['aircall', 'webhook'] })}>
          <RefreshCw size={13} /> {t('aircall_hub.webhooks_tab.refresh')}
        </button>
      </div>

      <div className="field-row-2">
        <div className="seg-stat">
          <div className="label" data-i18n-key="aircall_hub.webhooks_tab.name">{t('aircall_hub.webhooks_tab.name')}</div>
          <div className="val" style={{ fontSize: 14 }} data-i18n-key="aircall_hub.webhooks_tab.name_value">{t('aircall_hub.webhooks_tab.name_value')}</div>
        </div>
        <div className="seg-stat">
          <div className="label" data-i18n-key="aircall_hub.webhooks_tab.status">{t('aircall_hub.webhooks_tab.status')}</div>
          <div className="val" style={{ fontSize: 14 }}>
            {status?.active ? <span className="pill success dot">Active</span> : <span className="pill warn dot" data-i18n-key="aircall_hub.webhooks_tab.inactive">{t('aircall_hub.webhooks_tab.inactive')}</span>}
          </div>
        </div>
      </div>

      <div className="field-row-2">
        <div className="seg-stat">
          <div className="label" data-i18n-key="aircall_hub.webhooks_tab.subscribed_events">{t('aircall_hub.webhooks_tab.subscribed_events')}</div>
          <div className="val" style={{ fontSize: 14 }}>{status?.eventsSubscribed ?? '—'}</div>
        </div>
        <div className="seg-stat">
          <div className="label" data-i18n-key="aircall_hub.webhooks_tab.last_event">{t('aircall_hub.webhooks_tab.last_event')}</div>
          <div className="val" style={{ fontSize: 14 }}>{status?.lastEventAt ?? '—'}</div>
        </div>
      </div>

      <div className="field-row-2">
        <div className="seg-stat">
          <div className="label" data-i18n-key="aircall_hub.webhooks_tab.failure_count">{t('aircall_hub.webhooks_tab.failure_count')}</div>
          <div className="val" style={{ fontSize: 14 }}>{status?.failureCount ?? 0}</div>
        </div>
        <div className="seg-stat">
          <div className="label" data-i18n-key="aircall_hub.webhooks_tab.last_failure">{t('aircall_hub.webhooks_tab.last_failure')}</div>
          <div className="val" style={{ fontSize: 14 }}>{status?.lastFailureAt ?? '—'}</div>
        </div>
      </div>
    </section>
  );
}

export const Route = createFileRoute('/settings/aircall/webhooks')({ component: WebhooksTabView });
