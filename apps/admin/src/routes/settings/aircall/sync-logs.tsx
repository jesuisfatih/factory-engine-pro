import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';
import { aircallTenantConfigQueryKey, fetchAircallTenantConfig, hasAircallCredentials } from '@/features/integrations/aircallTenantConfig';

function SyncLogsView() {
  const { t } = useTranslation();
  const config = useQuery({
    queryKey: aircallTenantConfigQueryKey,
    queryFn: fetchAircallTenantConfig,
  });
  const ready = hasAircallCredentials(config.data);

  return (
    <section className="config-card" id="aircall-sync-logs">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 data-i18n-key="aircall_hub.sync_logs_tab.title">{t('aircall_hub.sync_logs_tab.title')}</h3>
          <div className="sub" data-i18n-key="aircall_hub.sync_logs_tab.sub">{t('aircall_hub.sync_logs_tab.sub')}</div>
        </div>
        <button id="btn-sync-logs-refresh" type="button" className="btn ghost" onClick={() => config.refetch()} disabled={config.isFetching}>
          <RefreshCw size={13} /> {t('aircall_hub.sync_logs_tab.refresh')}
        </button>
      </div>

      {config.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.sync_logs_tab.loading_body')} />}
      {config.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(config.error)}
          action={<button type="button" className="btn" onClick={() => config.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
        />
      )}
      {config.isSuccess && !ready && (
        <StateBlock
          title={t('aircall_hub.sync_logs_tab.credentials_required_title')}
          body={t('aircall_hub.sync_logs_tab.credentials_required_body')}
          icon={<AlertTriangle size={18} color="var(--warn)" />}
          action={<a className="btn primary" href="/settings/aircall/connection">{t('aircall_hub.sync_logs_tab.credentials_required_cta')}</a>}
        />
      )}
      {config.isSuccess && ready && (
        <StateBlock
          title={t('aircall_hub.sync_logs_tab.empty_title')}
          body={t('aircall_hub.sync_logs_tab.empty_body')}
        />
      )}
    </section>
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

export const Route = createFileRoute('/settings/aircall/sync-logs')({ component: SyncLogsView });
