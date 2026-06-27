import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { fetchAircallSyncLogs } from '@/lib/mock';

function SyncLogsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['aircall', 'sync-logs'], queryFn: fetchAircallSyncLogs });

  return (
    <section className="config-card" id="aircall-sync-logs">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 data-i18n-key="aircall_hub.sync_logs_tab.title">{t('aircall_hub.sync_logs_tab.title')}</h3>
          <div className="sub" data-i18n-key="aircall_hub.sync_logs_tab.sub">{t('aircall_hub.sync_logs_tab.sub')}</div>
        </div>
        <button id="btn-sync-logs-refresh" type="button" className="btn ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['aircall', 'sync-logs'] })}>
          <RefreshCw size={13} /> {t('aircall_hub.sync_logs_tab.refresh')}
        </button>
      </div>

      <pre className="json-block" id="aircall-sync-json">
{data ? JSON.stringify(data, null, 2) : '{}'}
      </pre>
    </section>
  );
}

export const Route = createFileRoute('/settings/aircall/sync-logs')({ component: SyncLogsView });
